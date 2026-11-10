//! NetEase Cloud Music (music.163.com) in a hidden WebView2.
//! Controlled by WestPlay's cabin UI (ui/src/cabin/apps/netease).

use std::cell::{Cell, RefCell};
use std::path::Path;

use crate::signin::{self, Progress, SignInWindow};
use crate::speakers::{self, Equalizer, Head, Speaker};
use crate::webview::{self, OffscreenWebView, Stage};

pub const HOME: &str = "https://music.163.com/";

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(tag = "action", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Command {
    Start,
    SignIn,
    SignOut,
    Play {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        track: Option<Track>,
    },
    Pause,
    Next,
    Previous,
    Seek {
        seconds: f64,
    },
    Volume {
        percent: f64,
    },
    Ask {
        id: u32,
        question: Question,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(tag = "ask", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Question {
    Search { query: String },
    Recommend,
    Top,
    Chart { id: String },
    UserPlaylists,
    PlaylistTracks { playlist_id: String },
    Lyrics { id: String },
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cover_img_url: Option<String>,
    #[serde(default)]
    pub track_count: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub play_count: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subscribed: Option<bool>,
}

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: String,
    pub title: String,
    pub artist: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artwork: Option<String>,
    #[serde(default)]
    pub duration: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fee: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub playable: Option<bool>,
}

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Playback {
    pub title: String,
    pub artist: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artwork: Option<String>,
    pub duration: f64,
    pub position: f64,
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct State {
    pub signed_in: bool,
    pub playing: bool,
}

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Answer {
    pub id: u32,
    #[serde(default)]
    pub failed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub songs: Option<Vec<Track>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub playlists: Option<Vec<Playlist>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lyric: Option<String>,
}

#[derive(Debug, PartialEq)]
pub enum Report {
    State(State),
    SignInWindow(bool),
    Playback(Option<Playback>),
    Answer(Answer),
    Spectrum(Vec<u8>),
}

pub struct Netease {
    view: OffscreenWebView,
    sign_in: RefCell<Option<SignInWindow>>,
    pending: RefCell<Vec<Report>>,
    checked_initial_cookie: Cell<bool>,
}

impl Netease {
    pub fn start(stage: &Stage, width: u32, height: u32, user_data: &Path) -> Result<Self, webview::Error> {
        let view = OffscreenWebView::new(stage, width, height, user_data)?;
        view.log_as("netease")?;
        view.show(false)?;
        stage.add(&view, false)?;
        view.add_startup_script(concat!(include_str!("cab_sound.js"), "\n", include_str!("netease.js")))?;
        view.navigate(HOME)?;
        Ok(Self {
            view,
            sign_in: RefCell::new(None),
            pending: RefCell::new(Vec::new()),
            checked_initial_cookie: Cell::new(false),
        })
    }

    pub fn view(&self) -> &OffscreenWebView {
        &self.view
    }

    #[allow(dead_code)]
    pub fn failed(&self) -> bool {
        self.view.take_failure().is_some()
    }

    #[allow(dead_code)]
    pub fn close(self, stage: &Stage) {
        let _ = stage.remove(&self.view);
    }

    pub fn command(&self, command: &Command) {
        if matches!(command, Command::SignIn) {
            self.sign_in();
            return;
        }
        if matches!(command, Command::SignOut) {
            let _ = self.view.delete_cookies();
            let _ = self.view.navigate(HOME);
            self.pending.borrow_mut().push(Report::State(State { signed_in: false, playing: false }));
            return;
        }
        if let Ok(json) = serde_json::to_string(command) {
            let _ = self.view.post_json(&json);
        }
    }

    pub fn sign_in(&self) {
        if self.sign_in.borrow().as_ref().is_some_and(|w| w.progress() == Progress::Signing) {
            if let Some(window) = self.sign_in.borrow().as_ref() {
                window.bring_forward();
            }
            return;
        }
        match SignInWindow::open(self.view.environment(), &signin::NETEASE) {
            Ok(window) => {
                *self.sign_in.borrow_mut() = Some(window);
                self.pending.borrow_mut().push(Report::SignInWindow(true));
            }
            Err(e) => {
                crate::log!("[netease] sign-in window failed: {e}");
            }
        }
    }

    pub fn take_reports(&self) -> Vec<Report> {
        let mut reports = std::mem::take(&mut *self.pending.borrow_mut());

        if !self.checked_initial_cookie.get() {
            self.checked_initial_cookie.set(true);
            let signed_in = self.view.has_cookie(HOME, &["MUSIC_U"]);
            if signed_in {
                reports.push(Report::State(State { signed_in: true, playing: false }));
            }
        }

        let progress = self.sign_in.borrow().as_ref().map(SignInWindow::progress);
        if let Some(p @ (Progress::SignedIn | Progress::Closed)) = progress {
            self.sign_in.borrow_mut().take();
            reports.push(Report::SignInWindow(false));
            let _ = self.view.navigate(HOME);
            let signed_in = p == Progress::SignedIn || self.view.has_cookie(HOME, &["MUSIC_U"]);
            reports.push(Report::State(State { signed_in, playing: false }));
        }

        for message in self.view.take_page_messages() {
            if let Some(bars) = speakers::read_spectrum(&message) {
                reports.push(Report::Spectrum(bars));
                continue;
            }
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&message) {
                let msg_type = value.get("type").and_then(|t| t.as_str()).unwrap_or("");
                match msg_type {
                    "state" => {
                        if let Some(state_val) = value.get("state") {
                            if let Ok(s) = serde_json::from_value::<State>(state_val.clone()) {
                                reports.push(Report::State(s));
                            }
                        }
                    }
                    "playback" => {
                        let pb = value.get("playback").and_then(|p| serde_json::from_value::<Playback>(p.clone()).ok());
                        reports.push(Report::Playback(pb));
                    }
                    "answer" => {
                        if let Some(ans_val) = value.get("answer") {
                            if let Ok(a) = serde_json::from_value::<Answer>(ans_val.clone()) {
                                reports.push(Report::Answer(a));
                            }
                        }
                    }
                    _ => {}
                }
            }
        }

        reports
    }

    pub fn cab(
        &self,
        speakers: Option<&[Speaker]>,
        head: Head,
        outside: bool,
        distance: f32,
        equalizer: Equalizer,
        spectrum: bool,
    ) -> windows::core::Result<()> {
        let message = serde_json::json!({
            "action": "cab",
            "speakers": speakers,
            "head": head,
            "outside": outside,
            "distance": distance,
            "equalizer": equalizer,
            "spectrum": spectrum,
        })
        .to_string();
        self.view.post_json(&message)
    }
}

pub fn state_message(state: Option<&State>, signing_in: bool) -> String {
    let signed_in = state.map(|s| s.signed_in);
    let playing = state.map(|s| s.playing);
    serde_json::json!({
        "type": "netease",
        "signedIn": signed_in,
        "playing": playing,
        "signingIn": signing_in,
    })
    .to_string()
}

pub fn playback_message(playback: Option<&Playback>) -> String {
    serde_json::json!({
        "type": "neteasePlayback",
        "playback": playback,
    })
    .to_string()
}

pub fn answer_message(answer: &Answer) -> String {
    serde_json::json!({
        "type": "neteaseAnswer",
        "id": answer.id,
        "failed": answer.failed,
        "error": answer.error,
        "songs": answer.songs,
        "playlists": answer.playlists,
        "lyric": answer.lyric,
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn playlist_tracks_question_uses_camel_case_playlist_id() {
        let incoming = r#"{"action":"ask","id":20,"question":{"ask":"playlistTracks","playlistId":"987654321"}}"#;
        let cmd: Command = serde_json::from_str(incoming).expect("deserialize playlistTracks command");
        assert_eq!(
            cmd,
            Command::Ask { id: 20, question: Question::PlaylistTracks { playlist_id: "987654321".to_owned() } }
        );

        let outgoing = serde_json::to_value(&cmd).expect("serialize command");
        assert_eq!(outgoing["question"]["ask"], "playlistTracks");
        assert_eq!(outgoing["question"]["playlistId"], "987654321");
    }

    #[test]
    fn playlist_deserializes_with_optional_subscribed_and_play_count() {
        let json = r#"{"id":"123","name":"我喜欢的音乐","trackCount":42,"subscribed":false}"#;
        let pl: Playlist = serde_json::from_str(json).expect("deserialize playlist");
        assert_eq!(pl.id, "123");
        assert_eq!(pl.track_count, 42);
        assert_eq!(pl.subscribed, Some(false));
        assert_eq!(pl.play_count, None);
    }

    #[test]
    fn playback_and_track_preserve_vip_and_error_fields() {
        let track_json =
            r#"{"id":"287398","title":"我不难过","artist":"孙燕姿","duration":283,"fee":1,"playable":true}"#;
        let track: Track = serde_json::from_str(track_json).expect("deserialize track");
        assert_eq!(track.fee, Some(1));
        assert_eq!(track.playable, Some(true));

        let pb = Playback {
            title: "我不难过".to_owned(),
            artist: "孙燕姿".to_owned(),
            artwork: None,
            duration: 283.0,
            position: 0.0,
            status: "paused".to_owned(),
            track_id: Some("287398".to_owned()),
            error: Some("vip_required".to_owned()),
        };
        let encoded = playback_message(Some(&pb));
        let parsed: serde_json::Value = serde_json::from_str(&encoded).expect("parse encoded playback message");
        assert_eq!(parsed["playback"]["trackId"], "287398");
        assert_eq!(parsed["playback"]["error"], "vip_required");
    }
}
