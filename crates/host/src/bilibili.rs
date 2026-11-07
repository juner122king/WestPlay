//! Bilibili (bilibili.com) in a hidden WebView2.
//! Controlled by WestPlay's cabin UI (ui/src/cabin/apps/bilibili).

use std::cell::{Cell, RefCell};
use std::path::Path;

use crate::signin::{self, Progress, SignInWindow};
use crate::speakers::{self, Equalizer, Head, Speaker};
use crate::webview::{self, OffscreenWebView, PageSize, Stage};

pub const HOME: &str = "https://www.bilibili.com/";

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(tag = "action", rename_all = "camelCase")]
pub enum Command {
    Start,
    SignIn,
    SignOut,
    Play {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        video: Option<Video>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        page: Option<u32>,
    },
    Pause,
    Stop,
    Next,
    Previous,
    Seek {
        seconds: f64,
    },
    Volume {
        percent: f64,
    },
    Quality {
        quality: u32,
    },
    Rate {
        rate: f64,
    },
    Danmaku {
        on: bool,
    },
    Show {
        x: f32,
        y: f32,
        width: u32,
        height: u32,
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        crop: bool,
    },
    Crop {
        on: bool,
    },
    Hide,
    Ask {
        id: u32,
        question: Question,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(tag = "ask", rename_all = "camelCase")]
pub enum Question {
    Search {
        query: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        page: Option<u32>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        filter: Option<String>,
    },
    Suggest {
        query: String,
    },
    Feed {
        which: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        page: Option<u32>,
    },
    Popular {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        page: Option<u32>,
    },
    Recommend {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        page: Option<u32>,
    },
    Channel {
        mid: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        page: Option<u32>,
    },
    Playlist {
        bvid: String,
    },
    Subscribe {
        mid: String,
        on: bool,
    },
    Related {
        bvid: String,
    },
    #[serde(rename_all = "camelCase")]
    Live {
        #[serde(default, rename = "parentAreaId", alias = "parent_area_id", skip_serializing_if = "Option::is_none")]
        parent_area_id: Option<u32>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        page: Option<u32>,
    },
    #[serde(rename_all = "camelCase")]
    Movie {
        #[serde(default, rename = "seasonType", alias = "season_type", skip_serializing_if = "Option::is_none")]
        season_type: Option<u32>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        order: Option<u32>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        page: Option<u32>,
    },
}

#[derive(Clone, Debug, Default, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Video {
    #[serde(default)]
    pub bvid: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub author: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mid: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cid: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artwork: Option<String>,
    #[serde(default)]
    pub duration: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub play_count: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pubdate: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub room_id: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_live: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub season_id: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ep_id: Option<u64>,
}

#[derive(Clone, Debug, Default, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MovieItem {
    #[serde(default)]
    pub season_id: u32,
    #[serde(default)]
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sub_title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cover: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub badge: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub score: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub index_show: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub order: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub link: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ep_id: Option<u64>,
}

#[derive(Clone, Debug, Default, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveRoom {
    #[serde(default)]
    pub room_id: u64,
    #[serde(default)]
    pub uid: u64,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub uname: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cover: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub area_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_area_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub online: Option<String>,
    #[serde(default)]
    pub is_following: bool,
}

#[derive(Clone, Debug, Default, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Channel {
    #[serde(default)]
    pub mid: String,
    #[serde(default)]
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub banner: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sign: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fans: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub videos: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subscribed: Option<bool>,
}

#[derive(Clone, Debug, Default, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DynamicAuthor {
    #[serde(default)]
    pub mid: String,
    #[serde(default)]
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
    #[serde(default)]
    pub pub_time: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pub_action: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DynamicItem {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub author: DynamicAuthor,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub desc: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub video: Option<Video>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub orig_author: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub orig_desc: Option<String>,
}

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoPage {
    pub cid: u64,
    pub page: u32,
    pub part: String,
    #[serde(default)]
    pub duration: f64,
}

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QualityOption {
    pub quality: u32,
    pub label: String,
}

fn de_f64_lenient<'de, D>(deserializer: D) -> Result<f64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    struct LenientF64Visitor;

    impl<'de> serde::de::Visitor<'de> for LenientF64Visitor {
        type Value = f64;

        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("a number or null")
        }

        fn visit_none<E>(self) -> Result<Self::Value, E> {
            Ok(0.0)
        }

        fn visit_unit<E>(self) -> Result<Self::Value, E> {
            Ok(0.0)
        }

        fn visit_f64<E>(self, v: f64) -> Result<Self::Value, E> {
            Ok(if v.is_finite() { v } else { 0.0 })
        }

        fn visit_i64<E>(self, v: i64) -> Result<Self::Value, E> {
            Ok(v as f64)
        }

        fn visit_u64<E>(self, v: u64) -> Result<Self::Value, E> {
            Ok(v as f64)
        }

        fn visit_str<E>(self, v: &str) -> Result<Self::Value, E> {
            Ok(v.parse::<f64>().unwrap_or(0.0))
        }
    }

    deserializer.deserialize_any(LenientF64Visitor)
}

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Playback {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bvid: Option<String>,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub artist: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artwork: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mid: Option<String>,
    #[serde(default, deserialize_with = "de_f64_lenient")]
    pub duration: f64,
    #[serde(default, deserialize_with = "de_f64_lenient")]
    pub position: f64,
    #[serde(default)]
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quality: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub qualities: Option<Vec<QualityOption>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rate: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub danmaku: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub page: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pages: Option<Vec<VideoPage>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_live: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub room_id: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub season_id: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ep_id: Option<u64>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dynamics: Option<Vec<DynamicItem>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub live_rooms: Option<Vec<LiveRoom>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub following_live_rooms: Option<Vec<LiveRoom>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub movies: Option<Vec<MovieItem>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub channels: Option<Vec<Channel>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub channel: Option<Channel>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub suggestions: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pages: Option<Vec<VideoPage>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub has_more: Option<bool>,
}

#[derive(Debug, PartialEq)]
pub enum Report {
    State(State),
    SignInWindow(bool),
    Playback(Option<Playback>),
    Answer(Answer),
    Spectrum(Vec<u8>),
}

pub struct Bilibili {
    view: OffscreenWebView,
    frame: PageSize,
    sign_in: RefCell<Option<SignInWindow>>,
    pending: RefCell<Vec<Report>>,
    checked_initial_cookie: Cell<bool>,
}

impl Bilibili {
    pub fn start(stage: &Stage, width: u32, height: u32, user_data: &Path) -> Result<Self, webview::Error> {
        let view = OffscreenWebView::new(stage, width, height, user_data)?;
        view.log_as("bilibili")?;
        view.show(false)?;
        stage.add(&view, false)?;
        view.add_startup_script(concat!(include_str!("cab_sound.js"), "\n", include_str!("bilibili.js")))?;
        view.navigate(HOME)?;
        let frame = stage.page_size();
        Ok(Self {
            view,
            frame,
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

    pub fn command(&self, command: &Command) -> windows::core::Result<()> {
        match command {
            Command::Show { x, y, width, height, crop } => {
                let _ = self.pass(&Command::Crop { on: *crop });
                let page = self.frame.get();
                let (x, y, width, height) = crate::youtube::within(page, *x, *y, *width, *height);
                crate::log!("[bilibili] show: {x}, {y}, {width}x{height}, crop={crop}");
                if width * 2 < page.0 {
                    self.view.fit(page, x, y, width, height)?;
                } else {
                    self.view.place(x, y, width, height)?;
                }
                self.view.show(true)
            }
            Command::Hide => {
                crate::log!("[bilibili] hide");
                self.view.show(false)
            }
            Command::Stop => {
                let _ = self.view.show(false);
                self.pass(command)
            }
            Command::SignIn => {
                self.sign_in();
                Ok(())
            }
            Command::SignOut => {
                let _ = self.view.delete_cookies();
                let _ = self.view.navigate(HOME);
                self.pending.borrow_mut().push(Report::State(State { signed_in: false, playing: false }));
                Ok(())
            }
            other => self.pass(other),
        }
    }

    fn pass(&self, command: &Command) -> windows::core::Result<()> {
        if let Ok(json) = serde_json::to_string(command) {
            self.view.post_json(&json)?;
        }
        Ok(())
    }

    pub fn sign_in(&self) {
        if self.sign_in.borrow().as_ref().is_some_and(|w| w.progress() == Progress::Signing) {
            if let Some(window) = self.sign_in.borrow().as_ref() {
                window.bring_forward();
            }
            return;
        }
        match SignInWindow::open(self.view.environment(), &signin::BILIBILI) {
            Ok(window) => {
                *self.sign_in.borrow_mut() = Some(window);
                self.pending.borrow_mut().push(Report::SignInWindow(true));
            }
            Err(e) => {
                crate::log!("[bilibili] sign-in window failed: {e}");
            }
        }
    }

    pub fn take_reports(&self) -> Vec<Report> {
        let mut reports = std::mem::take(&mut *self.pending.borrow_mut());

        if !self.checked_initial_cookie.get() {
            self.checked_initial_cookie.set(true);
            let signed_in = self.view.has_cookie(HOME, &["DedeUserID", "bili_jct", "SESSDATA"]);
            if signed_in {
                reports.push(Report::State(State { signed_in: true, playing: false }));
            }
        }

        let progress = self.sign_in.borrow().as_ref().map(SignInWindow::progress);
        if let Some(p @ (Progress::SignedIn | Progress::Closed)) = progress {
            self.sign_in.borrow_mut().take();
            reports.push(Report::SignInWindow(false));
            let _ = self.view.navigate(HOME);
            let signed_in =
                p == Progress::SignedIn || self.view.has_cookie(HOME, &["DedeUserID", "bili_jct", "SESSDATA"]);
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
                        if let Some(p) = value.get("playback") {
                            if p.is_null() {
                                reports.push(Report::Playback(None));
                            } else {
                                match serde_json::from_value::<Playback>(p.clone()) {
                                    Ok(pb) => reports.push(Report::Playback(Some(pb))),
                                    Err(e) => {
                                        crate::log!("[bilibili] error deserializing playback: {e}, payload: {p}");
                                    }
                                }
                            }
                        }
                    }
                    "answer" => {
                        if let Some(ans_val) = value.get("answer") {
                            match serde_json::from_value::<Answer>(ans_val.clone()) {
                                Ok(a) => reports.push(Report::Answer(a)),
                                Err(e) => {
                                    crate::log!("[bilibili] error deserializing answer: {e}, payload: {ans_val}");
                                }
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
        "type": "bilibili",
        "signedIn": signed_in,
        "playing": playing,
        "signingIn": signing_in,
    })
    .to_string()
}

pub fn playback_message(playback: Option<&Playback>) -> String {
    let val = serde_json::to_value(playback).unwrap_or(serde_json::Value::Null);
    serde_json::json!({
        "type": "bilibiliPlayback",
        "playback": val,
    })
    .to_string()
}

pub fn answer_message(answer: &Answer) -> String {
    let mut val = serde_json::to_value(answer).unwrap_or_default();
    if let serde_json::Value::Object(ref mut map) = val {
        map.insert("type".to_string(), serde_json::Value::String("bilibiliAnswer".to_string()));
    }
    val.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserializes_movie_and_live_questions_with_camel_case() {
        let movie_json = r#"{"ask":"movie","seasonType":5,"order":3,"page":2}"#;
        let q: Question = serde_json::from_str(movie_json).expect("should parse movie question");
        assert_eq!(q, Question::Movie { season_type: Some(5), order: Some(3), page: Some(2) });

        let serialized_movie = serde_json::to_string(&q).expect("should serialize movie question");
        assert!(serialized_movie.contains("\"seasonType\":5"));

        let live_json = r#"{"ask":"live","parentAreaId":6,"page":1}"#;
        let q_live: Question = serde_json::from_str(live_json).expect("should parse live question");
        assert_eq!(q_live, Question::Live { parent_area_id: Some(6), page: Some(1) });

        let serialized_live = serde_json::to_string(&q_live).expect("should serialize live question");
        assert!(serialized_live.contains("\"parentAreaId\":6"));
    }

    #[test]
    fn parses_stop_command() {
        let stop_json = r#"{"action":"stop"}"#;
        let cmd: Command = serde_json::from_str(stop_json).expect("should parse stop command");
        assert_eq!(cmd, Command::Stop);
    }

    #[test]
    fn formats_playback_null() {
        let msg = playback_message(None);
        assert_eq!(msg, r#"{"playback":null,"type":"bilibiliPlayback"}"#);
    }
}
