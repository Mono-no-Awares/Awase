use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SourceKind {
    Local,
    Yandex,
    Spotify,
    SoundCloud,
}

impl SourceKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            SourceKind::Local => "local",
            SourceKind::Yandex => "yandex",
            SourceKind::Spotify => "spotify",
            SourceKind::SoundCloud => "soundcloud",
        }
    }

    pub fn from_str(value: &str) -> Self {
        match value.to_lowercase().as_str() {
            "yandex" => SourceKind::Yandex,
            "spotify" => SourceKind::Spotify,
            "soundcloud" => SourceKind::SoundCloud,
            _ => SourceKind::Local,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: String,
    pub source: SourceKind,
    pub external_id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration_ms: u64,
    pub cover_url: Option<String>,
    pub stream_url: Option<String>,
    pub local_path: Option<String>,
    pub codec: Option<String>,
    pub bitrate_kbps: Option<u32>,
    pub sample_rate_hz: Option<u32>,
    pub liked: bool,
    pub added_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    pub id: String,
    pub name: String,
    pub source: SourceKind,
    pub track_count: usize,
    pub cover_url: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceStatus {
    pub source: SourceKind,
    pub connected: bool,
    pub account_label: Option<String>,
    pub details: String,
    pub has_credentials: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioTelemetry {
    pub is_playing: bool,
    pub current_track_id: Option<String>,
    pub position_ms: u64,
    pub duration_ms: u64,
    pub volume: f32,
    pub muted: bool,
    pub sample_rate_hz: u32,
    pub channels: u16,
    pub codec: String,
    pub bitrate_kbps: u32,
    pub device_name: String,
    pub spectrum: Vec<f32>,
    pub rms_left: f32,
    pub rms_right: f32,
    pub peak: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalFolder {
    pub path: String,
    pub track_count: usize,
    pub last_scanned: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevice {
    pub name: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EqualizerState {
    pub enabled: bool,
    pub bands: [f32; 5],
}

impl Default for EqualizerState {
    fn default() -> Self {
        Self {
            enabled: true,
            bands: [0.0; 5],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthEventPayload {
    pub source: String,
    pub ok: bool,
    pub message: String,
}
