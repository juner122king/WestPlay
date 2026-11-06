//! Desktop development window that mirrors the in-game cabin screen in real time.
//!
//! Renders the exact same DirectComposition visual tree that is captured for the game,
//! allowing the developer to interact with the UI using a standard desktop mouse, inspect
//! elements via Edge/Chromium DevTools (F12), and see Vite HMR updates live without
//! having to switch into the 3D cabin in-game.

use std::cell::{Cell, RefCell};
use std::rc::Rc;

use webview2_com::CursorChangedEventHandler;
use webview2_com::Microsoft::Web::WebView2::Win32::{
    COREWEBVIEW2_MOUSE_EVENT_KIND, COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS, ICoreWebView2,
    ICoreWebView2CompositionController, ICoreWebView2Controller,
};
use windows::UI::Composition::Desktop::DesktopWindowTarget;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::ScreenToClient;
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::WinRT::Composition::ICompositorDesktopInterop;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    ReleaseCapture, SetCapture, TME_LEAVE, TRACKMOUSEEVENT, TrackMouseEvent, VK_F5, VK_F12,
};
use windows::Win32::UI::WindowsAndMessaging::*;
use windows::core::{Interface, PCWSTR, w};

use crate::webview::{OffscreenWebView, PageSize, Stage};

const CLASS: PCWSTR = w!("westplay-cabin-dev-window");
const WM_MOUSELEAVE: u32 = 0x02A3;

thread_local! {
    static DEV_WINDOWS: RefCell<Vec<Rc<WindowState>>> = const { RefCell::new(Vec::new()) };
}

fn get_window_state(hwnd: HWND) -> Option<Rc<WindowState>> {
    DEV_WINDOWS.with(|wins| wins.borrow().iter().find(|w| w.hwnd == hwnd.0 as isize).cloned())
}

struct WindowState {
    hwnd: isize,
    _target: DesktopWindowTarget,
    composition: ICoreWebView2CompositionController,
    webview: ICoreWebView2,
    controller: ICoreWebView2Controller,
    page_size: PageSize,
    cursor: Cell<windows::Win32::UI::WindowsAndMessaging::HCURSOR>,
    tracking: Cell<bool>,
}

pub struct DevWindow {
    window: HWND,
}

impl DevWindow {
    pub fn open(
        stage: &Stage,
        webview: &OffscreenWebView,
        width: u32,
        height: u32,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        let instance = unsafe { GetModuleHandleW(None)? };
        let class = WNDCLASSW {
            lpfnWndProc: Some(window_proc),
            hInstance: instance.into(),
            lpszClassName: CLASS,
            hCursor: unsafe { LoadCursorW(None, IDC_ARROW)? },
            ..Default::default()
        };
        unsafe { RegisterClassW(&class) };

        // Fixed window style: standard caption bar, minimize button, close button, but no resizing border
        // to prevent accidental aspect ratio distortion and ensure 1:1 pixel rendering.
        let style = WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX;

        let mut rect = RECT { left: 0, top: 0, right: width as i32, bottom: height as i32 };
        unsafe {
            AdjustWindowRectEx(&mut rect, style, false, WINDOW_EX_STYLE(0))?;
        }
        let win_width = rect.right - rect.left;
        let win_height = rect.bottom - rect.top;

        let screen_width = unsafe { GetSystemMetrics(SM_CXSCREEN) };
        let screen_height = unsafe { GetSystemMetrics(SM_CYSCREEN) };
        let x = (screen_width - win_width).max(0) / 2;
        let y = (screen_height - win_height).max(0) / 2;

        let window = unsafe {
            CreateWindowExW(
                WINDOW_EX_STYLE(0),
                CLASS,
                w!("WestPlay Cabin (Live In-Game Sync) - Press F12 for DevTools"),
                style | WS_VISIBLE,
                x,
                y,
                win_width,
                win_height,
                None,
                None,
                Some(instance.into()),
                None,
            )?
        };

        // Accurately adjust window size so the client area is strictly width x height (1280x720) on any DPI.
        let mut client_rect = RECT::default();
        let mut win_rect = RECT::default();
        if unsafe { GetClientRect(window, &mut client_rect) }.is_ok()
            && unsafe { GetWindowRect(window, &mut win_rect) }.is_ok()
        {
            let current_w = client_rect.right - client_rect.left;
            let current_h = client_rect.bottom - client_rect.top;
            let border_w = (win_rect.right - win_rect.left) - current_w;
            let border_h = (win_rect.bottom - win_rect.top) - current_h;
            if current_w != width as i32 || current_h != height as i32 {
                let _ = unsafe {
                    SetWindowPos(
                        window,
                        None,
                        x,
                        y,
                        width as i32 + border_w,
                        height as i32 + border_h,
                        SWP_NOZORDER | SWP_NOACTIVATE,
                    )
                };
            }
        }

        let compositor = stage.compositor();
        let target =
            unsafe { compositor.cast::<ICompositorDesktopInterop>()?.CreateDesktopWindowTarget(window, false)? };
        target.SetRoot(stage.root())?;

        let composition: ICoreWebView2CompositionController = webview.composition().clone();
        let controller: ICoreWebView2Controller = composition.cast()?;
        let core_webview: ICoreWebView2 = webview.webview().clone();

        let state = Rc::new(WindowState {
            hwnd: window.0 as isize,
            _target: target,
            composition,
            webview: core_webview,
            controller,
            page_size: stage.page_size(),
            cursor: Cell::new(unsafe { LoadCursorW(None, IDC_ARROW)? }),
            tracking: Cell::new(false),
        });

        // Track cursor changes from WebView2
        let state_for_cursor = state.clone();
        let mut cursor_token = 0;
        let cursor_handler = CursorChangedEventHandler::create(Box::new(move |sender, _| {
            if let Some(composition) = sender {
                let mut cursor = windows::Win32::UI::WindowsAndMessaging::HCURSOR::default();
                if unsafe { composition.Cursor(&mut cursor) }.is_ok() {
                    state_for_cursor.cursor.set(cursor);
                    unsafe { SetCursor(Some(cursor)) };
                }
            }
            Ok(())
        }));
        unsafe {
            state.composition.add_CursorChanged(&cursor_handler, &mut cursor_token)?;
        }

        DEV_WINDOWS.with(|wins| wins.borrow_mut().push(state));

        Ok(Self { window })
    }
}

impl Drop for DevWindow {
    fn drop(&mut self) {
        let hwnd = self.window.0 as isize;
        DEV_WINDOWS.with(|wins| wins.borrow_mut().retain(|w| w.hwnd != hwnd));
        unsafe {
            if IsWindow(Some(self.window)).as_bool() {
                let _ = DestroyWindow(self.window);
            }
        }
    }
}

unsafe extern "system" fn window_proc(window: HWND, message: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    let Some(state) = get_window_state(window) else {
        return unsafe { DefWindowProcW(window, message, wparam, lparam) };
    };

    match message {
        WM_SETFOCUS | WM_ACTIVATE => {
            let _ = unsafe {
                state.controller.MoveFocus(
                    webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC,
                )
            };
            unsafe { DefWindowProcW(window, message, wparam, lparam) }
        }
        WM_SETCURSOR if (lparam.0 & 0xffff) as u32 == HTCLIENT => {
            unsafe { SetCursor(Some(state.cursor.get())) };
            LRESULT(1)
        }
        WM_KEYDOWN => {
            if wparam.0 == VK_F12.0 as usize {
                let _ = unsafe { state.webview.OpenDevToolsWindow() };
                LRESULT(0)
            } else if wparam.0 == VK_F5.0 as usize {
                let _ = unsafe { state.webview.Reload() };
                LRESULT(0)
            } else {
                unsafe { DefWindowProcW(window, message, wparam, lparam) }
            }
        }
        WM_MOUSEMOVE | WM_LBUTTONDOWN | WM_LBUTTONUP | WM_RBUTTONDOWN | WM_RBUTTONUP | WM_MBUTTONDOWN
        | WM_MBUTTONUP | WM_XBUTTONDOWN | WM_XBUTTONUP | WM_MOUSEWHEEL | WM_MOUSEHWHEEL => {
            unsafe { handle_mouse(window, &state, message, wparam, lparam) };
            LRESULT(0)
        }
        m if m == WM_MOUSELEAVE => {
            unsafe { handle_mouse(window, &state, message, wparam, lparam) };
            LRESULT(0)
        }
        WM_DESTROY => {
            let hwnd = window.0 as isize;
            DEV_WINDOWS.with(|wins| wins.borrow_mut().retain(|w| w.hwnd != hwnd));
            LRESULT(0)
        }
        _ => unsafe { DefWindowProcW(window, message, wparam, lparam) },
    }
}

unsafe fn handle_mouse(window: HWND, state: &WindowState, message: u32, wparam: WPARAM, lparam: LPARAM) {
    let mut bounds = RECT::default();
    if unsafe { GetClientRect(window, &mut bounds) }.is_err() {
        return;
    }
    let client_width = (bounds.right - bounds.left).max(1);
    let client_height = (bounds.bottom - bounds.top).max(1);

    let mut point = POINT { x: (lparam.0 & 0xffff) as i16 as i32, y: ((lparam.0 >> 16) & 0xffff) as i16 as i32 };

    let keys = COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS((wparam.0 & 0xffff) as i32);
    let data = match message {
        WM_MOUSEWHEEL | WM_MOUSEHWHEEL | WM_XBUTTONDOWN | WM_XBUTTONUP => {
            ((wparam.0 >> 16) & 0xffff) as i16 as i32 as u32
        }
        _ => 0,
    };

    unsafe {
        match message {
            WM_MOUSEWHEEL | WM_MOUSEHWHEEL => {
                let _ = ScreenToClient(window, &mut point);
            }
            WM_LBUTTONDOWN | WM_RBUTTONDOWN | WM_MBUTTONDOWN | WM_XBUTTONDOWN => {
                SetCapture(window);
            }
            WM_LBUTTONUP | WM_RBUTTONUP | WM_MBUTTONUP | WM_XBUTTONUP => {
                let _ = ReleaseCapture();
            }
            WM_MOUSEMOVE if !state.tracking.get() => {
                let mut leave = TRACKMOUSEEVENT {
                    cbSize: size_of::<TRACKMOUSEEVENT>() as u32,
                    dwFlags: TME_LEAVE,
                    hwndTrack: window,
                    dwHoverTime: 0,
                };
                if TrackMouseEvent(&mut leave).is_ok() {
                    state.tracking.set(true);
                }
            }
            m if m == WM_MOUSELEAVE => {
                state.tracking.set(false);
            }
            _ => {}
        }

        // Dynamically get the current truck screen's actual layout size (e.g. 1280 x 793, 1280 x 898, etc.).
        // Because the stage squeezes the page height into the 720-pixel frame, we inverse-map client coordinates
        // back to the un-squeezed page pixels.
        let (page_width, page_height) = state.page_size.get();

        let page_x = (point.x * page_width as i32) / client_width;
        let page_y = (point.y * page_height as i32) / client_height;
        let page_point =
            POINT { x: page_x.clamp(0, page_width as i32 - 1), y: page_y.clamp(0, page_height as i32 - 1) };

        let _ = state.composition.SendMouseInput(COREWEBVIEW2_MOUSE_EVENT_KIND(message as i32), keys, data, page_point);
    }
}
