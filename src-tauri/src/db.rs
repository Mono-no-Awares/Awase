use std::path::PathBuf;
use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};
use crate::models::{EqualizerState, LocalFolder, Playlist, SourceKind, Track};

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn open(db_path: PathBuf) -> Result<Self, String> {
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             CREATE TABLE IF NOT EXISTS tracks (
                id TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                external_id TEXT NOT NULL,
                title TEXT NOT NULL,
                artist TEXT NOT NULL,
                album TEXT NOT NULL,
                duration_ms INTEGER NOT NULL,
                cover_url TEXT,
                stream_url TEXT,
                local_path TEXT,
                codec TEXT,
                bitrate_kbps INTEGER,
                sample_rate_hz INTEGER,
                liked INTEGER NOT NULL DEFAULT 0,
                added_at INTEGER NOT NULL
             );
             CREATE TABLE IF NOT EXISTS playlists (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                source TEXT NOT NULL,
                cover_url TEXT,
                description TEXT
             );
             CREATE TABLE IF NOT EXISTS playlist_tracks (
                playlist_id TEXT NOT NULL,
                track_id TEXT NOT NULL,
                position INTEGER NOT NULL,
                PRIMARY KEY (playlist_id, track_id)
             );
             CREATE TABLE IF NOT EXISTS local_folders (
                path TEXT PRIMARY KEY,
                track_count INTEGER NOT NULL DEFAULT 0,
                last_scanned INTEGER NOT NULL DEFAULT 0
             );
             CREATE TABLE IF NOT EXISTS credentials (
                source TEXT PRIMARY KEY,
                token TEXT,
                client_id TEXT,
                account_label TEXT,
                extra TEXT
             );
             CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
             );
             DELETE FROM tracks WHERE source = 'youtube';
             DELETE FROM playlists WHERE source = 'youtube';
             DELETE FROM credentials WHERE source = 'youtube';",
        )
        .map_err(|e| e.to_string())?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn upsert_tracks(&self, tracks: &[Track]) -> Result<(), String> {
        let mut conn = self.conn.lock();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        {
            let mut stmt = tx
                .prepare(
                    "INSERT INTO tracks (
                        id, source, external_id, title, artist, album, duration_ms,
                        cover_url, stream_url, local_path, codec, bitrate_kbps,
                        sample_rate_hz, liked, added_at
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
                     ON CONFLICT(id) DO UPDATE SET
                        title = excluded.title,
                        artist = excluded.artist,
                        album = excluded.album,
                        duration_ms = excluded.duration_ms,
                        cover_url = COALESCE(excluded.cover_url, tracks.cover_url),
                        stream_url = COALESCE(excluded.stream_url, tracks.stream_url),
                        local_path = COALESCE(excluded.local_path, tracks.local_path),
                        codec = COALESCE(excluded.codec, tracks.codec),
                        bitrate_kbps = COALESCE(excluded.bitrate_kbps, tracks.bitrate_kbps),
                        sample_rate_hz = COALESCE(excluded.sample_rate_hz, tracks.sample_rate_hz),
                        liked = CASE WHEN tracks.liked = 1 THEN 1 ELSE excluded.liked END,
                        added_at = CASE WHEN excluded.liked = 1 AND excluded.added_at > 0 THEN excluded.added_at ELSE tracks.added_at END",
                )
                .map_err(|e| e.to_string())?;

            for track in tracks {
                stmt.execute(params![
                    track.id,
                    track.source.as_str(),
                    track.external_id,
                    track.title,
                    track.artist,
                    track.album,
                    track.duration_ms as i64,
                    track.cover_url,
                    track.stream_url,
                    track.local_path,
                    track.codec,
                    track.bitrate_kbps.map(|v| v as i64),
                    track.sample_rate_hz.map(|v| v as i64),
                    if track.liked { 1 } else { 0 },
                    track.added_at
                ])
                .map_err(|e| e.to_string())?;
            }
        }
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn get_tracks(&self, source: Option<SourceKind>, query: Option<&str>) -> Result<Vec<Track>, String> {
        let conn = self.conn.lock();
        let mut sql = String::from(
            "SELECT id, source, external_id, title, artist, album, duration_ms,
                    cover_url, stream_url, local_path, codec, bitrate_kbps,
                    sample_rate_hz, liked, added_at
             FROM tracks WHERE (source != 'yandex' OR liked = 1)",
        );
        let mut bind_values: Vec<String> = Vec::new();
        if let Some(src) = source {
            sql.push_str(" AND source = ?");
            bind_values.push(src.as_str().to_string());
        }
        if let Some(q) = query {
            let trimmed = q.trim();
            if !trimmed.is_empty() {
                sql.push_str(" AND (LOWER(title) LIKE ? OR LOWER(artist) LIKE ? OR LOWER(album) LIKE ?)");
                let pattern = format!("%{}%", trimmed.to_lowercase());
                bind_values.push(pattern.clone());
                bind_values.push(pattern.clone());
                bind_values.push(pattern);
            }
        }
        sql.push_str(" ORDER BY added_at DESC, title ASC");

        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params_from_iter(bind_values.iter()), Self::row_to_track)
            .map_err(|e| e.to_string())?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row.map_err(|e| e.to_string())?);
        }
        Ok(result)
    }

    pub fn toggle_like(&self, track_id: &str) -> Result<bool, String> {
        let conn = self.conn.lock();
        let current: Option<i64> = conn
            .query_row(
                "SELECT liked FROM tracks WHERE id = ?1",
                params![track_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let next = current.unwrap_or(0) == 0;
        conn.execute(
            "UPDATE tracks SET liked = ?1 WHERE id = ?2",
            params![if next { 1 } else { 0 }, track_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(next)
    }

    pub fn delete_local_tracks_in_folder(&self, folder_path: &str) -> Result<(), String> {
        let conn = self.conn.lock();
        let prefix = format!("{}%", folder_path);
        conn.execute(
            "DELETE FROM tracks WHERE source = 'local' AND local_path LIKE ?1",
            params![prefix],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_playlists(&self) -> Result<Vec<Playlist>, String> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare(
                "SELECT p.id, p.name, p.source, p.cover_url, p.description,
                        (SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id = p.id) as cnt
                 FROM playlists p
                 ORDER BY p.name ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                let source_str: String = row.get(2)?;
                Ok(Playlist {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    source: SourceKind::from_str(&source_str),
                    cover_url: row.get(3)?,
                    description: row.get(4)?,
                    track_count: row.get::<_, i64>(5)? as usize,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut list = Vec::new();
        for row in rows {
            list.push(row.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    pub fn upsert_playlist(&self, playlist: &Playlist) -> Result<(), String> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO playlists (id, name, source, cover_url, description)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                cover_url = COALESCE(excluded.cover_url, playlists.cover_url),
                description = COALESCE(excluded.description, playlists.description)",
            params![
                playlist.id,
                playlist.name,
                playlist.source.as_str(),
                playlist.cover_url,
                playlist.description
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn add_track_to_playlist(&self, playlist_id: &str, track: &Track) -> Result<(), String> {
        self.upsert_tracks(std::slice::from_ref(track))?;
        let conn = self.conn.lock();
        let next_pos: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(position), 0) + 1 FROM playlist_tracks WHERE playlist_id = ?1",
                params![playlist_id],
                |row| row.get(0),
            )
            .unwrap_or(1);
        conn.execute(
            "INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?1, ?2, ?3)",
            params![playlist_id, track.id, next_pos],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn remove_track_from_playlist(&self, playlist_id: &str, track_id: &str) -> Result<(), String> {
        let conn = self.conn.lock();
        conn.execute(
            "DELETE FROM playlist_tracks WHERE playlist_id = ?1 AND track_id = ?2",
            params![playlist_id, track_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_playlist(&self, playlist_id: &str) -> Result<(), String> {
        let conn = self.conn.lock();
        conn.execute(
            "DELETE FROM playlist_tracks WHERE playlist_id = ?1",
            params![playlist_id],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM playlists WHERE id = ?1",
            params![playlist_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_playlist_tracks(&self, playlist_id: &str) -> Result<Vec<Track>, String> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare(
                "SELECT t.id, t.source, t.external_id, t.title, t.artist, t.album, t.duration_ms,
                        t.cover_url, t.stream_url, t.local_path, t.codec, t.bitrate_kbps,
                        t.sample_rate_hz, t.liked, t.added_at
                 FROM tracks t
                 INNER JOIN playlist_tracks pt ON pt.track_id = t.id
                 WHERE pt.playlist_id = ?1
                 ORDER BY pt.position ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![playlist_id], Self::row_to_track)
            .map_err(|e| e.to_string())?;
        let mut list = Vec::new();
        for row in rows {
            list.push(row.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    pub fn upsert_local_folder(&self, folder: &LocalFolder) -> Result<(), String> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO local_folders (path, track_count, last_scanned)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(path) DO UPDATE SET
                track_count = excluded.track_count,
                last_scanned = excluded.last_scanned",
            params![folder.path, folder.track_count as i64, folder.last_scanned],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_local_folders(&self) -> Result<Vec<LocalFolder>, String> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare("SELECT path, track_count, last_scanned FROM local_folders ORDER BY path ASC")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(LocalFolder {
                    path: row.get(0)?,
                    track_count: row.get::<_, i64>(1)? as usize,
                    last_scanned: row.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row.map_err(|e| e.to_string())?);
        }
        Ok(out)
    }

    pub fn remove_local_folder(&self, path: &str) -> Result<(), String> {
        {
            let conn = self.conn.lock();
            conn.execute("DELETE FROM local_folders WHERE path = ?1", params![path])
                .map_err(|e| e.to_string())?;
        }
        self.delete_local_tracks_in_folder(path)
    }

    pub fn save_credentials(
        &self,
        source: SourceKind,
        token: Option<&str>,
        client_id: Option<&str>,
        account_label: Option<&str>,
        extra: Option<&str>,
    ) -> Result<(), String> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO credentials (source, token, client_id, account_label, extra)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(source) DO UPDATE SET
                token = COALESCE(excluded.token, credentials.token),
                client_id = COALESCE(excluded.client_id, credentials.client_id),
                account_label = COALESCE(excluded.account_label, credentials.account_label),
                extra = COALESCE(excluded.extra, credentials.extra)",
            params![source.as_str(), token, client_id, account_label, extra],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_credentials(
        &self,
        source: SourceKind,
    ) -> Result<Option<(Option<String>, Option<String>, Option<String>, Option<String>)>, String> {
        let conn = self.conn.lock();
        conn.query_row(
            "SELECT token, client_id, account_label, extra FROM credentials WHERE source = ?1",
            params![source.as_str()],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .optional()
        .map_err(|e| e.to_string())
    }

    pub fn clear_credentials(&self, source: SourceKind) -> Result<(), String> {
        let conn = self.conn.lock();
        conn.execute(
            "DELETE FROM credentials WHERE source = ?1",
            params![source.as_str()],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_tracks(&self, track_ids: &[String]) -> Result<(), String> {
        let mut conn = self.conn.lock();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for id in track_ids {
            tx.execute("DELETE FROM playlist_tracks WHERE track_id = ?1", params![id])
                .map_err(|e| e.to_string())?;
            tx.execute("DELETE FROM tracks WHERE id = ?1", params![id])
                .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn clear_library(&self) -> Result<(), String> {
        let conn = self.conn.lock();
        conn.execute_batch("DELETE FROM playlist_tracks; DELETE FROM tracks;")
            .map_err(|e| e.to_string())
    }

    pub fn delete_source_tracks(&self, source: SourceKind) -> Result<(), String> {
        let conn = self.conn.lock();
        conn.execute(
            "DELETE FROM playlist_tracks WHERE track_id IN (SELECT id FROM tracks WHERE source = ?1)",
            params![source.as_str()],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM tracks WHERE source = ?1",
            params![source.as_str()],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn save_setting(&self, key: &str, value: &str) -> Result<(), String> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>, String> {
        let conn = self.conn.lock();
        conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())
    }

    pub fn save_equalizer(&self, eq: &EqualizerState) -> Result<(), String> {
        let serialized = serde_json::to_string(eq).map_err(|e| e.to_string())?;
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('equalizer', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![serialized],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_equalizer(&self) -> Result<EqualizerState, String> {
        let conn = self.conn.lock();
        let val: Option<String> = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'equalizer'",
                [],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        match val {
            Some(s) => Ok(serde_json::from_str(&s).unwrap_or_default()),
            None => Ok(EqualizerState::default()),
        }
    }

    fn row_to_track(row: &rusqlite::Row) -> rusqlite::Result<Track> {
        let source_str: String = row.get(1)?;
        Ok(Track {
            id: row.get(0)?,
            source: SourceKind::from_str(&source_str),
            external_id: row.get(2)?,
            title: row.get(3)?,
            artist: row.get(4)?,
            album: row.get(5)?,
            duration_ms: row.get::<_, i64>(6)? as u64,
            cover_url: row.get(7)?,
            stream_url: row.get(8)?,
            local_path: row.get(9)?,
            codec: row.get(10)?,
            bitrate_kbps: row.get::<_, Option<i64>>(11)?.map(|v| v as u32),
            sample_rate_hz: row.get::<_, Option<i64>>(12)?.map(|v| v as u32),
            liked: row.get::<_, i64>(13)? != 0,
            added_at: row.get(14)?,
        })
    }
}
