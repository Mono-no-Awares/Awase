use std::f32::consts::PI;
use std::fs::File;
use std::io::BufReader;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError, Sender, SyncSender};
use std::sync::Arc;
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait};
use parking_lot::Mutex;
use rodio::source::SeekError;
use rodio::{Decoder, OutputStream, Sink, Source};
use rustfft::{num_complex::Complex, FftPlanner};
use tauri::{AppHandle, Emitter};

use crate::models::{AudioDevice, AudioTelemetry, EqualizerState};

const SPECTRUM_RING_SIZE: usize = 1024;
const BAND_FREQS: [f32; 5] = [60.0, 230.0, 910.0, 3600.0, 14000.0];

#[derive(Clone, Copy)]
struct BiquadCoeffs {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
}

impl BiquadCoeffs {
    fn peaking(sample_rate: f32, freq: f32, q: f32, gain_db: f32) -> Self {
        if gain_db.abs() < 0.05 || freq >= sample_rate * 0.48 {
            return Self {
                b0: 1.0,
                b1: 0.0,
                b2: 0.0,
                a1: 0.0,
                a2: 0.0,
            };
        }
        let a = 10.0f32.powf(gain_db / 40.0);
        let w0 = 2.0 * PI * freq / sample_rate;
        let cos_w0 = w0.cos();
        let alpha = w0.sin() / (2.0 * q);
        let b0 = 1.0 + alpha * a;
        let b1 = -2.0 * cos_w0;
        let b2 = 1.0 - alpha * a;
        let a0 = 1.0 + alpha / a;
        let a1 = -2.0 * cos_w0;
        let a2 = 1.0 - alpha / a;
        Self {
            b0: b0 / a0,
            b1: b1 / a0,
            b2: b2 / a0,
            a1: a1 / a0,
            a2: a2 / a0,
        }
    }
}

#[derive(Clone, Copy, Default)]
struct BiquadState {
    x1: f32,
    x2: f32,
    y1: f32,
    y2: f32,
}

impl BiquadState {
    #[inline]
    fn process(&mut self, input: f32, c: &BiquadCoeffs) -> f32 {
        let out = c.b0 * input + c.b1 * self.x1 + c.b2 * self.x2 - c.a1 * self.y1 - c.a2 * self.y2;
        self.x2 = self.x1;
        self.x1 = input;
        self.y2 = self.y1;
        self.y1 = out;
        out
    }
}

struct SharedDspState {
    eq: EqualizerState,
    ring: [f32; SPECTRUM_RING_SIZE],
    ring_pos: usize,
    rms_left: f32,
    rms_right: f32,
    peak: f32,
    eq_dirty: bool,
    seek_fade_pending: bool,
}

impl Default for SharedDspState {
    fn default() -> Self {
        Self {
            eq: EqualizerState::default(),
            ring: [0.0; SPECTRUM_RING_SIZE],
            ring_pos: 0,
            rms_left: 0.0,
            rms_right: 0.0,
            peak: 0.0,
            eq_dirty: true,
            seek_fade_pending: false,
        }
    }
}

struct DspSpectrumSource<S> {
    inner: S,
    shared: Arc<Mutex<SharedDspState>>,
    coeffs: [BiquadCoeffs; 5],
    states: [[BiquadState; 5]; 2],
    channel_cursor: u16,
    sample_rate_f: f32,
    acc_l: f32,
    acc_r: f32,
    acc_peak: f32,
    acc_count: usize,
    fade_pos: u32,
    fade_total: u32,
    preamp: f32,
}

impl<S> DspSpectrumSource<S>
where
    S: Source<Item = f32>,
{
    fn new(inner: S, shared: Arc<Mutex<SharedDspState>>) -> Self {
        let sr = inner.sample_rate().max(8000) as f32;
        let eq = shared.lock().eq.clone();
        let (coeffs, preamp) = Self::compute_coeffs(sr, &eq);
        Self {
            inner,
            shared,
            coeffs,
            states: [[BiquadState::default(); 5]; 2],
            channel_cursor: 0,
            sample_rate_f: sr,
            acc_l: 0.0,
            acc_r: 0.0,
            acc_peak: 0.0,
            acc_count: 0,
            fade_pos: 0,
            fade_total: (sr * 0.015) as u32,
            preamp,
        }
    }

    fn compute_coeffs(sr: f32, eq: &EqualizerState) -> ([BiquadCoeffs; 5], f32) {
        let mut out = [BiquadCoeffs::peaking(sr, 60.0, 0.85, 0.0); 5];
        let mut max_boost = 0.0f32;
        for i in 0..5 {
            let gain = if eq.enabled { eq.bands[i] } else { 0.0 };
            if gain > max_boost {
                max_boost = gain;
            }
            out[i] = BiquadCoeffs::peaking(sr, BAND_FREQS[i], 0.85, gain);
        }
        let preamp = 10.0f32.powf((-max_boost * 0.55) / 20.0);
        (out, preamp)
    }
}

impl<S> Iterator for DspSpectrumSource<S>
where
    S: Source<Item = f32>,
{
    type Item = f32;

    fn next(&mut self) -> Option<Self::Item> {
        let sample = self.inner.next()?;
        let channels = self.inner.channels().max(1);
        let ch = (self.channel_cursor % channels).min(1) as usize;

        if self.acc_count == 0 {
            if let Some(mut st) = self.shared.try_lock() {
                if st.eq_dirty {
                    let (c, p) = Self::compute_coeffs(self.sample_rate_f, &st.eq);
                    self.coeffs = c;
                    self.preamp = p;
                    st.eq_dirty = false;
                }
                if st.seek_fade_pending {
                    self.states = [[BiquadState::default(); 5]; 2];
                    self.fade_pos = 0;
                    st.seek_fade_pending = false;
                }
            }
        }

        let mut y = sample * self.preamp;
        for b in 0..5 {
            y = self.states[ch][b].process(y, &self.coeffs[b]);
        }
        if self.fade_pos < self.fade_total {
            let gain = self.fade_pos as f32 / self.fade_total.max(1) as f32;
            y *= gain;
            if self.channel_cursor % channels == 0 {
                self.fade_pos += 1;
            }
        }
        let clamped = (y / (1.0 + y.abs() * 0.08)).clamp(-1.0, 1.0);

        if ch == 0 {
            self.acc_l += clamped * clamped;
        } else {
            self.acc_r += clamped * clamped;
        }
        let abs_v = clamped.abs();
        if abs_v > self.acc_peak {
            self.acc_peak = abs_v;
        }
        self.acc_count += 1;

        if self.channel_cursor % channels == 0 {
            if let Some(mut st) = self.shared.try_lock() {
                let pos = st.ring_pos;
                st.ring[pos] = clamped;
                st.ring_pos = (pos + 1) % SPECTRUM_RING_SIZE;
            }
        }

        if self.acc_count >= 512 {
            let n = (self.acc_count / 2).max(1) as f32;
            let rms_l = (self.acc_l / n).sqrt().clamp(0.0, 1.0);
            let rms_r = if channels > 1 {
                (self.acc_r / n).sqrt().clamp(0.0, 1.0)
            } else {
                rms_l
            };
            if let Some(mut st) = self.shared.try_lock() {
                st.rms_left = rms_l;
                st.rms_right = rms_r;
                st.peak = self.acc_peak;
            }
            self.acc_l = 0.0;
            self.acc_r = 0.0;
            self.acc_peak = 0.0;
            self.acc_count = 0;
        }

        self.channel_cursor = self.channel_cursor.wrapping_add(1);
        Some(clamped)
    }
}

impl<S> Source for DspSpectrumSource<S>
where
    S: Source<Item = f32>,
{
    fn current_frame_len(&self) -> Option<usize> {
        self.inner.current_frame_len()
    }

    fn channels(&self) -> u16 {
        self.inner.channels()
    }

    fn sample_rate(&self) -> u32 {
        self.inner.sample_rate()
    }

    fn total_duration(&self) -> Option<Duration> {
        self.inner.total_duration()
    }

    fn try_seek(&mut self, pos: Duration) -> Result<(), SeekError> {
        self.inner.try_seek(pos)
    }
}

enum AudioCommand {
    PlayFile {
        track_id: String,
        file_path: PathBuf,
        known_duration_ms: u64,
        codec_label: String,
        bitrate_kbps: u32,
        reply: SyncSender<Result<(), String>>,
    },
    Pause,
    Resume,
    Stop,
    Seek(u64, SyncSender<Result<(), String>>),
    SetVolume(f32),
    SetMuted(bool),
    SetDevice(String, SyncSender<Result<(), String>>),
}

pub struct AudioEngine {
    cmd_tx: Mutex<Sender<AudioCommand>>,
    shared: Arc<Mutex<SharedDspState>>,
    is_playing: Arc<AtomicBool>,
    current_track_id: Arc<Mutex<Option<String>>>,
    position_ms: Arc<AtomicU64>,
    duration_ms: Arc<AtomicU64>,
    sample_rate_hz: Arc<AtomicU32>,
    channels: Arc<Mutex<u16>>,
    codec: Arc<Mutex<String>>,
    bitrate_kbps: Arc<AtomicU32>,
    device_name: Arc<Mutex<String>>,
    volume: Arc<Mutex<f32>>,
    muted: Arc<AtomicBool>,
    fft_planner: Mutex<FftPlanner<f32>>,
}

fn fade_sink(s: &Sink, from: f32, to: f32, steps: u32, step_ms: u64) {
    if steps == 0 {
        s.set_volume(to);
        return;
    }
    for i in 1..=steps {
        let t = i as f32 / steps as f32;
        s.set_volume(from + (to - from) * t);
        std::thread::sleep(Duration::from_millis(step_ms));
    }
}

impl AudioEngine {
    pub fn new(
        app: AppHandle,
        initial_eq: EqualizerState,
        initial_volume: f32,
        initial_muted: bool,
    ) -> Arc<Self> {
        let shared = Arc::new(Mutex::new(SharedDspState {
            eq: initial_eq,
            ..Default::default()
        }));

        let initial_device = cpal::default_host()
            .default_output_device()
            .and_then(|d| d.name().ok())
            .unwrap_or_else(|| "Default WASAPI".to_string());

        let is_playing = Arc::new(AtomicBool::new(false));
        let current_track_id = Arc::new(Mutex::new(None));
        let position_ms = Arc::new(AtomicU64::new(0));
        let duration_ms = Arc::new(AtomicU64::new(0));
        let sample_rate_hz = Arc::new(AtomicU32::new(48000));
        let channels = Arc::new(Mutex::new(2u16));
        let codec = Arc::new(Mutex::new(String::from("READY")));
        let bitrate_kbps = Arc::new(AtomicU32::new(0));
        let device_name = Arc::new(Mutex::new(initial_device));
        let volume = Arc::new(Mutex::new(initial_volume.clamp(0.0, 1.0)));
        let muted = Arc::new(AtomicBool::new(initial_muted));

        let (tx, rx) = mpsc::channel::<AudioCommand>();

        let shared_t = Arc::clone(&shared);
        let is_playing_t = Arc::clone(&is_playing);
        let current_track_id_t = Arc::clone(&current_track_id);
        let position_ms_t = Arc::clone(&position_ms);
        let duration_ms_t = Arc::clone(&duration_ms);
        let sample_rate_hz_t = Arc::clone(&sample_rate_hz);
        let channels_t = Arc::clone(&channels);
        let codec_t = Arc::clone(&codec);
        let bitrate_kbps_t = Arc::clone(&bitrate_kbps);
        let device_name_t = Arc::clone(&device_name);
        let volume_t = Arc::clone(&volume);
        let muted_t = Arc::clone(&muted);

        std::thread::spawn(move || {
            let mut stream_pair = OutputStream::try_default().ok();
            let mut active_sink: Option<Sink> = None;
            let mut ended_notified = true;

            loop {
                match rx.recv_timeout(Duration::from_millis(60)) {
                    Ok(cmd) => match cmd {
                        AudioCommand::PlayFile {
                            track_id,
                            file_path,
                            known_duration_ms,
                            codec_label,
                            bitrate_kbps: br,
                            reply,
                        } => {
                            let res = (|| -> Result<(), String> {
                                if stream_pair.is_none() {
                                    stream_pair = OutputStream::try_default().ok();
                                }
                                let (_, handle) = stream_pair
                                    .as_ref()
                                    .ok_or_else(|| "No audio output stream available".to_string())?;
                                let is_aac = file_path
                                    .extension()
                                    .and_then(|e| e.to_str())
                                    .map(|e| e.eq_ignore_ascii_case("aac"))
                                    .unwrap_or(false);
                                let file = File::open(&file_path)
                                    .map_err(|e| format!("Cannot open audio file: {}", e))?;
                                let decoder = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                                    if is_aac {
                                        Decoder::new_aac(BufReader::new(file))
                                    } else {
                                        Decoder::new(BufReader::new(file))
                                    }
                                }))
                                .map_err(|_| "Audio decoder panicked on malformed stream".to_string())?
                                .or_else(|first_err| {
                                    if is_aac {
                                        let retry_file = File::open(&file_path)
                                            .map_err(|e| format!("Cannot open audio file: {}", e))?;
                                        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                                            Decoder::new(BufReader::new(retry_file))
                                        }))
                                        .map_err(|_| "Audio decoder panicked on malformed stream".to_string())?
                                        .map_err(|e| format!("Audio decode failed: {}", e))
                                    } else {
                                        Err(format!("Audio decode failed: {}", first_err))
                                    }
                                })?;
                                let sr = decoder.sample_rate();
                                let ch = decoder.channels();
                                let total_ms = decoder
                                    .total_duration()
                                    .map(|d| d.as_millis() as u64)
                                    .filter(|&v| v > 0)
                                    .unwrap_or(known_duration_ms);
                                let f32_src = decoder.convert_samples::<f32>();
                                let dsp_src = DspSpectrumSource::new(f32_src, Arc::clone(&shared_t));
                                if let Some(old) = active_sink.take() {
                                    let cur_vol = old.volume();
                                    if !old.is_paused() && cur_vol > 0.01 {
                                        fade_sink(&old, cur_vol, 0.0, 5, 16);
                                    }
                                    old.stop();
                                }
                                let sink = Sink::try_new(handle).map_err(|e| e.to_string())?;
                                let eff_vol = if muted_t.load(Ordering::SeqCst) {
                                    0.0
                                } else {
                                    *volume_t.lock()
                                };
                                sink.set_volume(0.0);
                                sink.append(dsp_src);
                                fade_sink(&sink, 0.0, eff_vol, 5, 14);
                                active_sink = Some(sink);
                                *current_track_id_t.lock() = Some(track_id);
                                position_ms_t.store(0, Ordering::SeqCst);
                                duration_ms_t.store(total_ms, Ordering::SeqCst);
                                sample_rate_hz_t.store(sr, Ordering::SeqCst);
                                *channels_t.lock() = ch;
                                *codec_t.lock() = codec_label.to_uppercase();
                                bitrate_kbps_t.store(br, Ordering::SeqCst);
                                is_playing_t.store(true, Ordering::SeqCst);
                                ended_notified = false;
                                Ok(())
                            })();
                            let _ = reply.send(res);
                        }
                        AudioCommand::Pause => {
                            if let Some(s) = active_sink.as_ref() {
                                let cur_vol = s.volume();
                                if !s.is_paused() && cur_vol > 0.01 {
                                    fade_sink(s, cur_vol, 0.0, 6, 18);
                                }
                                s.pause();
                                s.set_volume(cur_vol);
                                is_playing_t.store(false, Ordering::SeqCst);
                            }
                        }
                        AudioCommand::Resume => {
                            if let Some(s) = active_sink.as_ref() {
                                let target_vol = if muted_t.load(Ordering::SeqCst) {
                                    0.0
                                } else {
                                    *volume_t.lock()
                                };
                                s.set_volume(0.0);
                                s.play();
                                fade_sink(s, 0.0, target_vol, 6, 16);
                                is_playing_t.store(true, Ordering::SeqCst);
                            }
                        }
                        AudioCommand::Stop => {
                            ended_notified = true;
                            if let Some(s) = active_sink.take() {
                                let cur_vol = s.volume();
                                if !s.is_paused() && cur_vol > 0.01 {
                                    fade_sink(&s, cur_vol, 0.0, 5, 16);
                                }
                                s.stop();
                            }
                            position_ms_t.store(0, Ordering::SeqCst);
                            is_playing_t.store(false, Ordering::SeqCst);
                        }
                        AudioCommand::Seek(pos_ms, reply) => {
                            shared_t.lock().seek_fade_pending = true;
                            let res = if let Some(s) = active_sink.as_ref() {
                                s.try_seek(Duration::from_millis(pos_ms))
                                    .map_err(|e| format!("Seek unsupported: {:?}", e))
                            } else {
                                Ok(())
                            };
                            if res.is_ok() {
                                position_ms_t.store(pos_ms, Ordering::SeqCst);
                            }
                            let _ = reply.send(res);
                        }
                        AudioCommand::SetVolume(vol) => {
                            if let Some(s) = active_sink.as_ref() {
                                s.set_volume(vol);
                            }
                        }
                        AudioCommand::SetMuted(is_muted) => {
                            let eff = if is_muted { 0.0 } else { *volume_t.lock() };
                            if let Some(s) = active_sink.as_ref() {
                                s.set_volume(eff);
                            }
                        }
                        AudioCommand::SetDevice(name, reply) => {
                            let res = (|| -> Result<(), String> {
                                let host = cpal::default_host();
                                let devs = host.output_devices().map_err(|e| e.to_string())?;
                                for dev in devs {
                                    if dev.name().ok().as_deref() == Some(name.as_str()) {
                                        let new_pair = OutputStream::try_from_device(&dev)
                                            .map_err(|e| e.to_string())?;
                                        if let Some(old) = active_sink.take() {
                                            old.stop();
                                        }
                                        stream_pair = Some(new_pair);
                                        *device_name_t.lock() = name;
                                        is_playing_t.store(false, Ordering::SeqCst);
                                        ended_notified = true;
                                        return Ok(());
                                    }
                                }
                                Err("Audio device not found".to_string())
                            })();
                            let _ = reply.send(res);
                        }
                    },
                    Err(RecvTimeoutError::Timeout) => {}
                    Err(RecvTimeoutError::Disconnected) => break,
                }

                if let Some(s) = active_sink.as_ref() {
                    if !s.empty() {
                        position_ms_t.store(s.get_pos().as_millis() as u64, Ordering::Relaxed);
                    } else if !ended_notified {
                        ended_notified = true;
                        is_playing_t.store(false, Ordering::SeqCst);
                        let _ = app.emit("awase://track-ended", ());
                    }
                }
            }
        });

        Arc::new(Self {
            cmd_tx: Mutex::new(tx),
            shared,
            is_playing,
            current_track_id,
            position_ms,
            duration_ms,
            sample_rate_hz,
            channels,
            codec,
            bitrate_kbps,
            device_name,
            volume,
            muted,
            fft_planner: Mutex::new(FftPlanner::new()),
        })
    }

    pub fn list_devices() -> Vec<AudioDevice> {
        let host = cpal::default_host();
        let default_name = host
            .default_output_device()
            .and_then(|d| d.name().ok())
            .unwrap_or_default();
        let mut list = Vec::new();
        if let Ok(devs) = host.output_devices() {
            for dev in devs {
                if let Ok(name) = dev.name() {
                    list.push(AudioDevice {
                        is_default: name == default_name,
                        name,
                    });
                }
            }
        }
        list
    }

    pub fn set_output_device(&self, name: &str) -> Result<(), String> {
        let (tx, rx) = mpsc::sync_channel(1);
        self.cmd_tx
            .lock()
            .send(AudioCommand::SetDevice(name.to_string(), tx))
            .map_err(|e| e.to_string())?;
        rx.recv().map_err(|e| e.to_string())?
    }

    pub fn play_file(
        &self,
        track_id: &str,
        file_path: PathBuf,
        known_duration_ms: u64,
        codec_label: &str,
        bitrate_kbps: u32,
    ) -> Result<(), String> {
        let (tx, rx) = mpsc::sync_channel(1);
        self.cmd_tx
            .lock()
            .send(AudioCommand::PlayFile {
                track_id: track_id.to_string(),
                file_path,
                known_duration_ms,
                codec_label: codec_label.to_string(),
                bitrate_kbps,
                reply: tx,
            })
            .map_err(|e| e.to_string())?;
        rx.recv().map_err(|e| e.to_string())?
    }

    pub fn pause(&self) {
        let _ = self.cmd_tx.lock().send(AudioCommand::Pause);
    }

    pub fn resume(&self) {
        let _ = self.cmd_tx.lock().send(AudioCommand::Resume);
    }

    pub fn stop(&self) {
        let _ = self.cmd_tx.lock().send(AudioCommand::Stop);
    }

    pub fn seek(&self, position_ms: u64) -> Result<(), String> {
        let (tx, rx) = mpsc::sync_channel(1);
        self.cmd_tx
            .lock()
            .send(AudioCommand::Seek(position_ms, tx))
            .map_err(|e| e.to_string())?;
        rx.recv().map_err(|e| e.to_string())?
    }

    pub fn set_volume(&self, volume: f32) {
        let clamped = volume.clamp(0.0, 1.0);
        *self.volume.lock() = clamped;
        self.muted.store(false, Ordering::SeqCst);
        let _ = self.cmd_tx.lock().send(AudioCommand::SetVolume(clamped));
    }

    pub fn set_muted(&self, muted: bool) {
        self.muted.store(muted, Ordering::SeqCst);
        let _ = self.cmd_tx.lock().send(AudioCommand::SetMuted(muted));
    }

    pub fn update_equalizer(&self, eq: EqualizerState) {
        let mut st = self.shared.lock();
        st.eq = eq;
        st.eq_dirty = true;
    }

    pub fn get_telemetry(&self) -> AudioTelemetry {
        let playing = self.is_playing.load(Ordering::SeqCst);
        let (ring_copy, ring_pos, rms_l, rms_r, peak) = {
            let st = self.shared.lock();
            (st.ring, st.ring_pos, st.rms_left, st.rms_right, st.peak)
        };

        let spectrum = if playing {
            self.compute_spectrum(&ring_copy, ring_pos)
        } else {
            vec![0.0; 32]
        };

        AudioTelemetry {
            is_playing: playing,
            current_track_id: self.current_track_id.lock().clone(),
            position_ms: self.position_ms.load(Ordering::Relaxed),
            duration_ms: self.duration_ms.load(Ordering::SeqCst),
            volume: *self.volume.lock(),
            muted: self.muted.load(Ordering::SeqCst),
            sample_rate_hz: self.sample_rate_hz.load(Ordering::SeqCst),
            channels: *self.channels.lock(),
            codec: self.codec.lock().clone(),
            bitrate_kbps: self.bitrate_kbps.load(Ordering::SeqCst),
            device_name: self.device_name.lock().clone(),
            spectrum,
            rms_left: if playing { rms_l } else { 0.0 },
            rms_right: if playing { rms_r } else { 0.0 },
            peak: if playing { peak } else { 0.0 },
        }
    }

    fn compute_spectrum(&self, ring: &[f32; SPECTRUM_RING_SIZE], ring_pos: usize) -> Vec<f32> {
        let mut buf: Vec<Complex<f32>> = Vec::with_capacity(SPECTRUM_RING_SIZE);
        for i in 0..SPECTRUM_RING_SIZE {
            let idx = (ring_pos + i) % SPECTRUM_RING_SIZE;
            let hann =
                0.5 * (1.0 - ((2.0 * PI * i as f32) / (SPECTRUM_RING_SIZE as f32 - 1.0)).cos());
            buf.push(Complex::new(ring[idx] * hann, 0.0));
        }

        let fft = {
            let mut planner = self.fft_planner.lock();
            planner.plan_fft_forward(SPECTRUM_RING_SIZE)
        };
        fft.process(&mut buf);

        let half = SPECTRUM_RING_SIZE / 2;
        let mut bands = Vec::with_capacity(32);
        let min_bin = 1.0f32;
        let max_bin = (half - 1) as f32;
        for b in 0..32 {
            let t0 = b as f32 / 32.0;
            let t1 = (b + 1) as f32 / 32.0;
            let start = (min_bin * (max_bin / min_bin).powf(t0)).floor() as usize;
            let end = (min_bin * (max_bin / min_bin).powf(t1)).ceil() as usize;
            let mut sum = 0.0f32;
            let mut count = 0usize;
            for k in start.max(1)..=end.min(half - 1) {
                sum += buf[k].norm();
                count += 1;
            }
            let avg = if count > 0 { sum / count as f32 } else { 0.0 };
            let scaled = (avg / 38.0).powf(0.62).clamp(0.0, 1.0);
            bands.push(scaled);
        }
        bands
    }
}
