use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use base64::Engine;
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::Accessor;
use sha2::{Digest, Sha256};
use walkdir::WalkDir;
use crate::models::{SourceKind, Track};

const AUDIO_EXTS: &[&str] = &["mp3", "flac", "wav", "ogg", "m4a", "aac", "opus"];

pub fn scan_folder(folder_path: &str) -> Vec<Track> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let mut tracks = Vec::new();
    for entry in WalkDir::new(folder_path).follow_links(true).into_iter().flatten() {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let ext = match path.extension().and_then(|s| s.to_str()) {
            Some(e) => e.to_lowercase(),
            None => continue,
        };
        if !AUDIO_EXTS.contains(&ext.as_str()) {
            continue;
        }
        if let Some(track) = read_audio_file(path, &ext, now) {
            tracks.push(track);
        }
    }
    tracks
}

fn read_audio_file(path: &Path, ext: &str, added_at: i64) -> Option<Track> {
    let path_str = path.to_string_lossy().to_string();
    let mut hasher = Sha256::new();
    hasher.update(path_str.as_bytes());
    let digest = format!("{:x}", hasher.finalize());
    let id = format!("local_{}", &digest[..16]);

    let file_stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown Track")
        .to_string();

    let mut title = file_stem;
    let mut artist = String::from("Local File");
    let mut album = String::from("Local Vault");
    let mut duration_ms = 0u64;
    let mut bitrate_kbps = None;
    let mut sample_rate_hz = None;
    let mut cover_url = None;

    if let Ok(tagged) = Probe::open(path).and_then(|p| p.read()) {
        let props = tagged.properties();
        duration_ms = props.duration().as_millis() as u64;
        bitrate_kbps = props.audio_bitrate();
        sample_rate_hz = props.sample_rate();

        if let Some(tag) = tagged.primary_tag().or_else(|| tagged.first_tag()) {
            if let Some(t) = tag.title() {
                if !t.trim().is_empty() {
                    title = t.to_string();
                }
            }
            if let Some(a) = tag.artist() {
                if !a.trim().is_empty() {
                    artist = a.to_string();
                }
            }
            if let Some(al) = tag.album() {
                if !al.trim().is_empty() {
                    album = al.to_string();
                }
            }
            if let Some(pic) = tag.pictures().first() {
                if pic.data().len() <= 2_500_000 {
                    let mime = pic
                        .mime_type()
                        .map(|m| m.as_str())
                        .unwrap_or("image/jpeg");
                    let b64 = base64::engine::general_purpose::STANDARD.encode(pic.data());
                    cover_url = Some(format!("data:{};base64,{}", mime, b64));
                }
            }
        }
    }

    Some(Track {
        id,
        source: SourceKind::Local,
        external_id: path_str.clone(),
        title,
        artist,
        album,
        duration_ms,
        cover_url,
        stream_url: None,
        local_path: Some(path_str),
        codec: Some(ext.to_uppercase()),
        bitrate_kbps,
        sample_rate_hz,
        liked: false,
        added_at,
    })
}
