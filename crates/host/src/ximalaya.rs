//! Ximalaya (ximalaya.com) in a hidden WebView2.
//! Controlled by WestPlay's cabin UI (ui/src/cabin/apps/ximalaya).

use std::cell::RefCell;
use std::path::Path;

use crate::signin::{self, Progress, SignInWindow};
use crate::speakers::{self, Equalizer, Head, Speaker};
use crate::webview::{self, OffscreenWebView, Stage};

pub const HOME: &str = "https://www.ximalaya.com/";

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(tag = "action", rename_all = "camelCase")]
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
#[serde(tag = "ask", rename_all = "camelCase")]
pub enum Question {
    Search { query: String },
    Recommend,
    Category { category: String },
    AlbumTracks { album_id: String },
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
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Album {
    pub id: String,
    pub title: String,
    pub artist: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artwork: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
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
    pub tracks: Option<Vec<Track>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub albums: Option<Vec<Album>>,
}

#[derive(Debug, PartialEq)]
pub enum Report {
    State(State),
    SignInWindow(bool),
    Playback(Option<Playback>),
    Answer(Answer),
    Spectrum(Vec<u8>),
}

pub struct Ximalaya {
    view: OffscreenWebView,
    sign_in: RefCell<Option<SignInWindow>>,
    pending: RefCell<Vec<Report>>,
}

impl Ximalaya {
    pub fn start(stage: &Stage, width: u32, height: u32, user_data: &Path) -> Result<Self, webview::Error> {
        let view = OffscreenWebView::new(stage, width, height, user_data)?;
        view.log_as("ximalaya")?;
        view.show(false)?;
        stage.add(&view, false)?;
        view.add_startup_script(concat!(include_str!("cab_sound.js"), "\n", include_str!("ximalaya.js")))?;
        view.navigate(HOME)?;
        Ok(Self { view, sign_in: RefCell::new(None), pending: RefCell::new(Vec::new()) })
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
        match SignInWindow::open(self.view.environment(), &signin::XIMALAYA) {
            Ok(window) => {
                *self.sign_in.borrow_mut() = Some(window);
                self.pending.borrow_mut().push(Report::SignInWindow(true));
            }
            Err(e) => {
                crate::log!("[ximalaya] sign-in window failed: {e}");
            }
        }
    }

    pub fn take_reports(&self) -> Vec<Report> {
        let mut reports = std::mem::take(&mut *self.pending.borrow_mut());

        let progress = self.sign_in.borrow().as_ref().map(SignInWindow::progress);
        if let Some(progress @ (Progress::SignedIn | Progress::Closed)) = progress {
            self.sign_in.borrow_mut().take();
            reports.push(Report::SignInWindow(false));
            if progress == Progress::SignedIn {
                let _ = self.view.navigate(HOME);
            }
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
        "type": "ximalaya",
        "signedIn": signed_in,
        "playing": playing,
        "signingIn": signing_in,
    })
    .to_string()
}

pub fn playback_message(playback: Option<&Playback>) -> String {
    serde_json::json!({
        "type": "ximalayaPlayback",
        "playback": playback,
    })
    .to_string()
}

pub fn answer_message(answer: &Answer) -> String {
    serde_json::json!({
        "type": "ximalayaAnswer",
        "id": answer.id,
        "failed": answer.failed,
        "error": answer.error,
        "tracks": answer.tracks,
        "albums": answer.albums,
    })
    .to_string()
}
