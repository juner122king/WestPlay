//! Douyin (douyin.com) in a hidden WebView2.
//! Controlled by WestPlay's cabin UI (ui/src/cabin/apps/douyin).

use std::cell::RefCell;
use std::path::Path;

use crate::signin::{self, Progress, SignInWindow};
use crate::speakers::{self, Equalizer, Head, Speaker};
use crate::webview::{self, OffscreenWebView, Stage};

pub const HOME: &str = "https://www.douyin.com/";

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(tag = "action", rename_all = "camelCase")]
pub enum Command {
    Start,
    SignIn,
    SignOut,
    Play {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        video: Option<Video>,
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
    Like {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        id: Option<String>,
    },
    Ask {
        id: u32,
        question: Question,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(tag = "ask", rename_all = "camelCase")]
pub enum Question {
    Feed,
    Search { query: String },
}

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Video {
    pub id: String,
    pub title: String,
    pub author: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artwork: Option<String>,
    #[serde(default)]
    pub duration: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub liked: Option<bool>,
}

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Playback {
    pub title: String,
    pub artist: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artwork: Option<String>,
    pub duration: f64,
    pub position: f64,
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub liked: Option<bool>,
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
    pub videos: Option<Vec<Video>>,
}

#[derive(Debug, PartialEq)]
pub enum Report {
    State(State),
    SignInWindow(bool),
    Playback(Option<Playback>),
    Answer(Answer),
    Spectrum(Vec<u8>),
}

pub struct Douyin {
    view: OffscreenWebView,
    sign_in: RefCell<Option<SignInWindow>>,
    pending: RefCell<Vec<Report>>,
}

impl Douyin {
    pub fn start(stage: &Stage, width: u32, height: u32, user_data: &Path) -> Result<Self, webview::Error> {
        let view = OffscreenWebView::new(stage, width, height, user_data)?;
        view.log_as("douyin")?;
        view.show(false)?;
        stage.add(&view, false)?;
        view.add_startup_script(concat!(include_str!("cab_sound.js"), "\n", include_str!("douyin.js")))?;
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
        match SignInWindow::open(self.view.environment(), &signin::DOUYIN) {
            Ok(window) => {
                *self.sign_in.borrow_mut() = Some(window);
                self.pending.borrow_mut().push(Report::SignInWindow(true));
            }
            Err(e) => {
                crate::log!("[douyin] sign-in window failed: {e}");
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
        "type": "douyin",
        "signedIn": signed_in,
        "playing": playing,
        "signingIn": signing_in,
    })
    .to_string()
}

pub fn playback_message(playback: Option<&Playback>) -> String {
    serde_json::json!({
        "type": "douyinPlayback",
        "playback": playback,
    })
    .to_string()
}

pub fn answer_message(answer: &Answer) -> String {
    serde_json::json!({
        "type": "douyinAnswer",
        "id": answer.id,
        "failed": answer.failed,
        "error": answer.error,
        "videos": answer.videos,
    })
    .to_string()
}
