//! Hongguo (hongguoduanju.com) in a hidden WebView2.
//! Controlled by WestPlay's cabin UI (ui/src/cabin/apps/hongguo).

use std::cell::{Cell, RefCell};
use std::path::Path;

use crate::signin::{self, Progress, SignInWindow};
use crate::speakers::{self, Equalizer, Head, Speaker};
use crate::webview::{self, OffscreenWebView, PageSize, Stage};

pub const HOME: &str = "https://hongguoduanju.com/?tab=home";
pub const COOKIE_URL: &str = "https://hongguoduanju.com/";

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(tag = "action", rename_all = "camelCase")]
pub enum Command {
    Start,
    SignIn,
    SignOut,
    Play {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        drama: Option<Drama>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        episode: Option<u32>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        vid: Option<String>,
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
    SelectEpisode {
        episode: u32,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        vid: Option<String>,
    },
    SetSpeed {
        speed: f64,
    },
    SetAutoNext {
        on: bool,
    },
    ToggleAutoNext,
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
#[serde(tag = "ask", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Question {
    Home,
    Feed {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        cursor: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        session_id: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        shown_entry_ids: Option<Vec<String>>,
    },
    Category {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        content_type: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        slug: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        page: Option<u32>,
    },
    Rank {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        kind: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        page: Option<u32>,
    },
    Search {
        query: String,
    },
    Suggest {
        query: String,
    },
    Detail {
        drama_id: String,
    },
    Catalog,
    Featured,
    Episodes {
        drama_id: String,
    },
}

#[derive(Clone, Debug, Default, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Drama {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cover: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub backdrop: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title_art: Option<String>,
    #[serde(default)]
    pub total_episodes: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub accessible_episodes: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub episode_text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub synopsis: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub heat_text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub score_text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub favorite_text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub like_text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rank: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status_tags: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub genre: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vid_list: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entry_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Celebrity {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default)]
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeSection {
    #[serde(default)]
    pub tab_type: String,
    #[serde(default)]
    pub tab_name: String,
    #[serde(default)]
    pub dramas: Vec<Drama>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategorySelector {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
}

#[derive(Clone, Debug, Default, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DramaDetail {
    pub drama: Drama,
    #[serde(default)]
    pub celebrities: Vec<Celebrity>,
    #[serde(default)]
    pub vid_list: Vec<String>,
    #[serde(default)]
    pub accessible_episodes: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub favorite_count: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub like_count: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub review_count: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub record_number: Option<String>,
    #[serde(default)]
    pub recommendations: Vec<Drama>,
}

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Episode {
    pub episode: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vid: Option<String>,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub accessible: Option<bool>,
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
    pub drama_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vid: Option<String>,
    #[serde(default)]
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub drama_title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub episode_title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub episode: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub episode_number: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_episodes: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub accessible_episodes: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artwork: Option<String>,
    #[serde(default, deserialize_with = "de_f64_lenient")]
    pub duration: f64,
    #[serde(default, deserialize_with = "de_f64_lenient")]
    pub position: f64,
    #[serde(default)]
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speed: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auto_next: Option<bool>,
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
    pub banners: Option<Vec<Drama>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sections: Option<Vec<HomeSection>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dramas: Option<Vec<Drama>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selectors: Option<Vec<CategorySelector>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<DramaDetail>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub episodes: Option<Vec<Episode>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub suggestions: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub page_num: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_pages: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total: Option<u32>,
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

pub struct Hongguo {
    view: OffscreenWebView,
    frame: PageSize,
    sign_in: RefCell<Option<SignInWindow>>,
    pending: RefCell<Vec<Report>>,
    checked_initial_cookie: Cell<bool>,
    last_cab: RefCell<Option<String>>,
}

impl Hongguo {
    pub fn start(stage: &Stage, width: u32, height: u32, user_data: &Path) -> Result<Self, webview::Error> {
        let view = OffscreenWebView::new(stage, width, height, user_data)?;
        view.log_as("hongguo")?;
        view.show(false)?;
        stage.add(&view, false)?;
        view.add_startup_script(concat!(include_str!("cab_sound.js"), "\n", include_str!("hongguo.js")))?;
        view.navigate(HOME)?;
        let frame = stage.page_size();
        Ok(Self {
            view,
            frame,
            sign_in: RefCell::new(None),
            pending: RefCell::new(Vec::new()),
            checked_initial_cookie: Cell::new(false),
            last_cab: RefCell::new(None),
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
                if width * 2 < page.0 {
                    self.view.fit(page, x, y, width, height)?;
                } else {
                    self.view.place(x, y, width, height)?;
                }
                self.view.show(true)
            }
            Command::Hide => self.view.show(false),
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
        match SignInWindow::open(self.view.environment(), &signin::HONGGUO) {
            Ok(window) => {
                *self.sign_in.borrow_mut() = Some(window);
                self.pending.borrow_mut().push(Report::SignInWindow(true));
            }
            Err(e) => {
                crate::log!("[hongguo] sign-in window failed: {e}");
            }
        }
    }

    pub fn take_reports(&self) -> Vec<Report> {
        let mut reports = std::mem::take(&mut *self.pending.borrow_mut());

        if !self.checked_initial_cookie.get() {
            self.checked_initial_cookie.set(true);
            let signed_in = self.view.has_cookie(COOKIE_URL, &["sessionid", "sessionid_ss", "sid_tt"]);
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
                p == Progress::SignedIn || self.view.has_cookie(COOKIE_URL, &["sessionid", "sessionid_ss", "sid_tt"]);
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
                            match serde_json::from_value::<State>(state_val.clone()) {
                                Ok(s) => reports.push(Report::State(s)),
                                Err(e) => crate::log!("[hongguo] state parse error: {e}"),
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
                                    Err(e) => crate::log!("[hongguo] playback parse error: {e}, payload: {p}"),
                                }
                            }
                        }
                    }
                    "answer" => {
                        if let Some(ans_val) = value.get("answer") {
                            match serde_json::from_value::<Answer>(ans_val.clone()) {
                                Ok(a) => reports.push(Report::Answer(a)),
                                Err(e) => crate::log!("[hongguo] answer parse error: {e}, payload: {ans_val}"),
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
        let mut last = self.last_cab.borrow_mut();
        if last.as_deref() == Some(message.as_str()) {
            return Ok(());
        }
        *last = Some(message.clone());
        drop(last);
        self.view.post_json(&message)
    }
}

pub fn state_message(state: Option<&State>, signing_in: bool) -> String {
    let signed_in = state.map(|s| s.signed_in);
    let playing = state.map(|s| s.playing);
    serde_json::json!({
        "type": "hongguo",
        "signedIn": signed_in,
        "playing": playing,
        "signingIn": signing_in,
    })
    .to_string()
}

pub fn playback_message(playback: Option<&Playback>) -> String {
    let val = serde_json::to_value(playback).unwrap_or(serde_json::Value::Null);
    serde_json::json!({
        "type": "hongguoPlayback",
        "playback": val,
    })
    .to_string()
}

pub fn answer_message(answer: &Answer) -> String {
    let mut val = serde_json::to_value(answer).unwrap_or_default();
    if let serde_json::Value::Object(ref mut map) = val {
        map.insert("type".to_string(), serde_json::Value::String("hongguoAnswer".to_string()));
    }
    val.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_category_rank_feed_and_detail_questions_with_camel_case() {
        let cat: Question =
            serde_json::from_str(r#"{"ask":"category","contentType":"real-drama","slug":"romance","page":2}"#)
                .expect("category question");
        assert_eq!(
            cat,
            Question::Category {
                content_type: Some("real-drama".into()),
                slug: Some("romance".into()),
                page: Some(2),
            }
        );

        let rank: Question = serde_json::from_str(r#"{"ask":"rank","kind":"hot-real-drama","page":1}"#).unwrap();
        assert_eq!(rank, Question::Rank { kind: Some("hot-real-drama".into()), page: Some(1) });

        let feed: Question = serde_json::from_str(
            r#"{"ask":"feed","cursor":"abc","sessionId":"sess1","shownEntryIds":["e1","e2"]}"#,
        )
        .unwrap();
        assert_eq!(
            feed,
            Question::Feed {
                cursor: Some("abc".into()),
                session_id: Some("sess1".into()),
                shown_entry_ids: Some(vec!["e1".into(), "e2".into()]),
            }
        );

        let detail: Question = serde_json::from_str(r#"{"ask":"detail","dramaId":"7701935931787316286"}"#).unwrap();
        assert_eq!(detail, Question::Detail { drama_id: "7701935931787316286".into() });
        assert!(serde_json::to_string(&cat).unwrap().contains("\"contentType\":\"real-drama\""));
    }

    #[test]
    fn parses_stop_and_set_auto_next_commands() {
        let stop: Command = serde_json::from_str(r#"{"action":"stop"}"#).unwrap();
        assert_eq!(stop, Command::Stop);

        let auto_next: Command = serde_json::from_str(r#"{"action":"setAutoNext","on":false}"#).unwrap();
        assert_eq!(auto_next, Command::SetAutoNext { on: false });

        let select_ep: Command = serde_json::from_str(r#"{"action":"selectEpisode","episode":3,"vid":"7701"}"#).unwrap();
        assert_eq!(select_ep, Command::SelectEpisode { episode: 3, vid: Some("7701".into()) });
    }

    #[test]
    fn parses_playback_with_null_duration_and_error() {
        let pb: Playback = serde_json::from_str(
            r#"{"dramaId":"123","title":"测试短剧","duration":null,"position":12.5,"status":"paused","error":"episode_locked"}"#,
        )
        .unwrap();
        assert_eq!(pb.duration, 0.0);
        assert_eq!(pb.position, 12.5);
        assert_eq!(pb.error.as_deref(), Some("episode_locked"));
    }

    #[test]
    fn formats_playback_null_and_answer_type() {
        let msg = playback_message(None);
        assert!(msg.contains(r#""type":"hongguoPlayback""#));
        assert!(msg.contains(r#""playback":null"#));

        let ans = Answer {
            id: 42,
            failed: false,
            error: None,
            banners: None,
            sections: None,
            dramas: None,
            selectors: None,
            detail: None,
            episodes: None,
            suggestions: Some(vec!["霸总".into()]),
            updated_text: None,
            session_id: None,
            next_cursor: None,
            page_num: None,
            total_pages: None,
            total: None,
            has_more: None,
        };
        let encoded = answer_message(&ans);
        assert!(encoded.contains(r#""type":"hongguoAnswer""#));
        assert!(encoded.contains(r#""id":42"#));
    }

    #[test]
    #[ignore = "manual WebView2 and WASAPI audio-focus diagnostic"]
    fn diag_hongguo_focus_audio() {
        use windows::Win32::System::Com::{COINIT_APARTMENTTHREADED, CoInitializeEx};
        unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok().unwrap() };

        let stage = Stage::new(1280, 720).unwrap();
        let profile = std::env::temp_dir().join(format!("westplay-hg-focus-diag-{}", std::process::id()));
        let hg = Hongguo::start(&stage, 1280, 720, &profile).unwrap();
        let _ = hg.view().add_startup_script(
            r#"(() => {
              window.__diagEvents = [];
              const origAdd = EventTarget.prototype.addEventListener;
              EventTarget.prototype.addEventListener = function(type, fn, opts) {
                if (['blur','focus','visibilitychange','webkitvisibilitychange','pagehide','pageshow','freeze','resume','volumechange','pause','play'].includes(type)) {
                  const targetName = this === window ? 'window' : this === document ? 'document' : (this.tagName || 'other');
                  if (targetName === 'window' || targetName === 'document') {
                    window.__diagEvents.push(targetName + ':' + type);
                  }
                }
                return origAdd.call(this, type, fn, opts);
              };
              window.__diagCtxs = [];
              const OrigAC = window.AudioContext;
              const OrigAnalyser = window.AnalyserNode;
              window.__diagAnalysers = [];
              if (OrigAnalyser) {
                window.AnalyserNode = function(...args) {
                  const node = new OrigAnalyser(...args);
                  window.__diagAnalysers.push(node);
                  return node;
                };
                window.AnalyserNode.prototype = OrigAnalyser.prototype;
              }
              window.AudioContext = function(...args) {
                const ctx = new OrigAC(...args);
                const info = { ctx, nodes: [], stateChanges: [], createdAt: performance.now() };
                const origCreateSource = ctx.createMediaElementSource.bind(ctx);
                ctx.createMediaElementSource = function(el) {
                  info.mediaEl = el;
                  return origCreateSource(el);
                };
                ctx.addEventListener('statechange', () => {
                  info.stateChanges.push({ state: ctx.state, at: performance.now() });
                });
                window.__diagCtxs.push(info);
                return ctx;
              };
              window.AudioContext.prototype = OrigAC.prototype;
            })();"#,
        );
        let truck_speakers = crate::speakers::in_truck("scania.s_2016");
        let head = Head { x: -0.6, y: 1.4, z: -0.3, heading: 0.0, pitch: 0.0 };
        let eq = Equalizer::default();

        // Full-stack test with built ui/dist/cabin.html + musicWithGame + fade.ts + DevWindow!
        let ui_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../ui/dist");
        let cabin = OffscreenWebView::new(&stage, 1280, 720, &profile).unwrap();
        let _ = stage.add(&cabin, true);
        cabin.map_folder("westplay.cabin", &ui_dir).unwrap();
        cabin.navigate("https://westplay.cabin/cabin.html").unwrap();
        let dev = crate::dev_window::DevWindow::open(&stage, &cabin, 640, 360).ok();

        let bridge_step = |cabin: &OffscreenWebView, hg: &Hongguo, sent_cab_on_player: &mut bool| {
            crate::pump_messages();
            for msg in cabin.take_page_messages() {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&msg) {
                    if v.get("type").and_then(|t| t.as_str()) == Some("hongguo") {
                        println!("[cabin -> hg] {}", v["command"]);
                        if let Ok(cmd) = serde_json::from_value::<Command>(v["command"].clone()) {
                            let _ = hg.command(&cmd);
                        }
                    } else if v.get("type").and_then(|t| t.as_str()) == Some("startup") {
                        println!("[cabin] {}", v["stage"]);
                    }
                }
            }
            for r in hg.take_reports() {
                match r {
                    Report::Answer(ans) => {
                        let _ = cabin.post_json(&answer_message(&ans));
                    }
                    Report::State(st) => {
                        let _ = cabin.post_json(&state_message(Some(&st), false));
                    }
                    Report::Playback(pb) => {
                        if let Some(p) = &pb {
                            if p.status == "playing" && !*sent_cab_on_player && p.position > 0.2 {
                                *sent_cab_on_player = true;
                                println!("[test] sending cab() now that player is playing!");
                                let _ = hg.cab(truck_speakers, head, false, 0.0, eq, true);
                            }
                        }
                        let _ = cabin.post_json(&playback_message(pb.as_ref()));
                    }
                    Report::Spectrum(bars) => {
                        let _ = cabin.post_json(&crate::speakers::spectrum_message(&bars));
                    }
                    _ => {}
                }
            }
        };

        let mut sent_cab_on_player = false;
        let mut pump_both = |seconds: f64| {
            let until = std::time::Instant::now() + std::time::Duration::from_secs_f64(seconds);
            while std::time::Instant::now() < until {
                bridge_step(&cabin, &hg, &mut sent_cab_on_player);
                std::thread::sleep(std::time::Duration::from_millis(16));
            }
        };

        pump_both(2.0);
        // Power on Cabin with truck & telemetry (game running, not paused, electrics on)
        let _ = cabin.post_json(r#"{"type":"game","running":true}"#);
        let _ = cabin.post_json(r#"{"type":"gameShown","shown":true}"#);
        let _ = cabin.post_json(r#"{"type":"truck","data":{"id":"scania.s_2016","make":"Scania","model":"S","hasCamera":true}}"#);
        let _ = cabin.post_json(r#"{"type":"telemetry","data":{"speed":0,"rpm":600,"gear":0,"fuel":0.8,"fuelCapacity":1000,"batteryVoltage":24,"waterTemp":80,"oilTemp":80,"oilPressure":3,"brakePressure":8,"electricEnabled":true,"engineEnabled":true,"paused":false,"x":0,"y":0,"z":0,"heading":0,"pitch":0,"roll":0,"cabinX":0,"cabinY":2,"cabinZ":-1,"headX":-0.6,"headY":1.4,"headZ":-0.3,"steering":0,"throttle":0,"brake":0,"cruiseControl":0,"odometer":100,"gameTime":100,"cameraKnown":false,"cameraX":0,"cameraY":0,"cameraZ":0,"nextRestStop":0}}"#);
        // Wait for boot screen to finish (`power on`) and home screen to render
        pump_both(5.5);
        println!("CABIN BUTTONS: {:?}", cabin.evaluate("[...document.querySelectorAll('button')].map(b => b.getAttribute('aria-label') || b.textContent?.trim())"));
        // Open Home then hongguo app & play first home drama via Cabin UI!
        let _ = cabin.evaluate(r#"(() => { const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label') || x.textContent || '').includes('Home') || (x.getAttribute('aria-label') || x.textContent || '').includes('主屏幕')); b?.click(); })()"#);
        pump_both(0.5);
        let _ = cabin.evaluate(r#"(() => { const b = [...document.querySelectorAll('button')].find(x => { const t = x.getAttribute('aria-label') || x.textContent || ''; return t.includes('Hongguo') || t.includes('红果'); }); b?.click(); })()"#);
        pump_both(3.5);
        let _ = cabin.evaluate(r#"(() => { const el = document.querySelector('.hg-hero-play, .hg-drama-card, .hg-play-primary'); console.log('clicked', !!el); el?.click(); })()"#);
        pump_both(1.5);
        let _ = cabin.evaluate(r#"(() => { const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').includes('立即播放') || (x.textContent || '').includes('继续播放')); b?.click(); })()"#);
        pump_both(8.0);

        let inspect = || {
            hg.view()
                .evaluate(
                    r#"(() => {
                      const v = document.querySelector('video');
                      const analysers = (window.__diagAnalysers || []).map((n) => {
                        const arr = new Float32Array(n.fftSize || 1024);
                        n.getFloatTimeDomainData(arr);
                        let maxMeter = 0;
                        for (let k = 0; k < arr.length; k++) {
                          const abs = Math.abs(arr[k]);
                          if (abs > maxMeter) maxMeter = abs;
                        }
                        return { fft: n.fftSize, max: Number(maxMeter.toFixed(5)) };
                      });
                      const acs = (window.__diagCtxs || []).filter((i) => i.ctx.state !== 'closed').map((i) => ({
                        state: i.ctx.state,
                        t: Number(i.ctx.currentTime.toFixed(3)),
                        changes: i.stateChanges,
                        sameEl: i.mediaEl === v
                      }));
                      return {
                        url: location.pathname,
                        analysers,
                        openCtxs: acs,
                        v: v ? {
                          src: (v.currentSrc || v.src || '').slice(0, 40),
                          paused: v.paused,
                          muted: v.muted,
                          volume: v.volume,
                          t: Number(v.currentTime.toFixed(3)),
                          decoded: v.getVideoPlaybackQuality?.()?.totalVideoFrames ?? 0
                        } : null
                      };
                    })()"#,
                )
                .unwrap_or_default()
        };
        println!("CABIN PLAYING: {}", inspect());

        // 1. Simulate Alt-Tab minimizing game (gameShown: false -> true)
        let _ = cabin.post_json(r#"{"type":"gameShown","shown":false}"#);
        pump_both(1.2);
        println!("GAME SHOWN FALSE (AWAY): {}", inspect());
        let _ = cabin.post_json(r#"{"type":"gameShown","shown":true}"#);
        pump_both(1.5);
        println!("GAME SHOWN TRUE (BACK): {}", inspect());

        // 2. Simulate rapid Alt-Tab (<200ms)
        let _ = cabin.post_json(r#"{"type":"gameShown","shown":false}"#);
        pump_both(0.15);
        let _ = cabin.post_json(r#"{"type":"gameShown","shown":true}"#);
        pump_both(1.5);
        println!("RAPID GAME SHOWN TOGGLE BACK: {}", inspect());

        // Measure real Windows WASAPI audio peak for msedgewebview2 before and after external window takes focus
        let wasapi_probe = |label: &str, take_focus: bool| {
            let ps = r##"
Add-Type -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

public static class AudioProbe {
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator {}
    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator {
        int _1();
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice dev);
    }
    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice {
        int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
    }
    [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionManager2 {
        int _1(); int _2();
        int GetSessionEnumerator(out IAudioSessionEnumerator list);
    }
    [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionEnumerator {
        int GetCount(out int count);
        int GetSession(int idx, out IAudioSessionControl ctrl);
    }
    [ComImport, Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionControl {}
    [ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionControl2 {
        int _1(); int _2(); int _3(); int _4(); int _5(); int _6(); int _7(); int _8(); int _9(); int _10(); int _11();
        int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
        int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
        int GetProcessId(out uint pid);
        int IsSystemSoundsSession();
        int SetDuckingPreference(bool optOut);
    }
    [ComImport, Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioMeterInformation {
        int GetPeakValue(out float peak);
    }
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);

    public static string ReadWebViewPeaks() {
        uint fgPid = 0;
        GetWindowThreadProcessId(GetForegroundWindow(), out fgPid);
        string fgName = "";
        try { fgName = Process.GetProcessById((int)fgPid).ProcessName; } catch {}
        var enumr = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
        IMMDevice dev; enumr.GetDefaultAudioEndpoint(0, 1, out dev);
        var iid = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
        object obj; dev.Activate(ref iid, 23, IntPtr.Zero, out obj);
        var mgr = (IAudioSessionManager2)obj;
        IAudioSessionEnumerator sessions; mgr.GetSessionEnumerator(out sessions);
        int count; sessions.GetCount(out count);
        var res = "fg=" + fgName + "(" + fgPid + ") sessions=";
        for (int i = 0; i < count; i++) {
            IAudioSessionControl ctrl; sessions.GetSession(i, out ctrl);
            var ctrl2 = (IAudioSessionControl2)ctrl;
            uint pid; ctrl2.GetProcessId(out pid);
            var meter = (IAudioMeterInformation)ctrl;
            float peak; meter.GetPeakValue(out peak);
            string name = "";
            try { name = Process.GetProcessById((int)pid).ProcessName; } catch {}
            if (name.Contains("webview") || peak > 0.0001f) {
                res += name + "#" + pid + ":" + peak.ToString("F4") + ";";
            }
        }
        return res;
    }
}
"@
Write-Output ([AudioProbe]::ReadWebViewPeaks())
"##;
            if take_focus {
                let mut child = std::process::Command::new("powershell")
                    .args(["-NoProfile", "-Command", "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.Form; $f.Text = 'ext-focus'; $f.Show(); $f.Activate(); Start-Sleep -Milliseconds 1500; $f.Close()"])
                    .spawn()
                    .ok();
                std::thread::sleep(std::time::Duration::from_millis(600));
                let out = std::process::Command::new("powershell").args(["-NoProfile", "-Command", ps]).output().ok();
                println!("[wasapi:{label}] {}", out.map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).unwrap_or_default());
                if let Some(ref mut c) = child { let _ = c.wait(); }
            } else {
                let out = std::process::Command::new("powershell").args(["-NoProfile", "-Command", ps]).output().ok();
                println!("[wasapi:{label}] {}", out.map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).unwrap_or_default());
            }
        };
        wasapi_probe("playing-devwindow", false);
        wasapi_probe("external-process-foreground", true);
        pump_both(0.5);
        println!("AFTER EXTERNAL FOCUS: {}", inspect());
        wasapi_probe("after-external-closed", false);
        drop(dev);
    }
}
