; WestPlay's own steps in Tauri's installer (`bundle.windows.nsis.installerHooks`, tauri.release.conf.json).
; Included before the installer's languages, so its words are picked by $LANGUAGE as it runs.

!include LogicLib.nsh

; The WebView2 Runtime's id with EdgeUpdate (the installer's own `WEBVIEW2APPGUID`, defined after this file;
; a test gives another, one no PC has).
!ifndef WESTPLAY_WEBVIEW2
  !define WESTPLAY_WEBVIEW2 "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
!endif
; Ours, so the installer's own registers stay as they were.
Var WestPlayWebView2
Var WestPlayMessage
Var WestPlayVersion
Var WestPlayChannel
Var WestPlayGuid

; Edge's preview channels, which WebView2 also runs on when the Runtime isn't there: Beta, Dev, Canary.
!define WESTPLAY_EDGE_BETA "{2CD8A007-E189-409D-A2C8-9AF4EF3C72AA}"
!define WESTPLAY_EDGE_DEV "{0D50BFEC-CD6A-4F9A-964C-C7416E3ACB10}"
!define WESTPLAY_EDGE_CANARY "{65C35B14-6C1D-4122-AC46-7148CC9D6497}"
!define WESTPLAY_WEBVIEW2_PAGE "https://developer.microsoft.com/microsoft-edge/webview2/"

; Whether WebView2 can run here, in $WestPlayWebView2 ("found", or empty): the Runtime's version as
; EdgeUpdate registers it (for the machine, else for this user) with its program in that version's folder, or
; one of Edge's preview channels registered. The registry alone isn't enough: a PC whose WebView2 files were taken away (by a tool
; removing Edge) keeps its entry, which the installer's own WebView2 step takes as installed (a player's PC,
; 2026-10-24: WestPlay then stopped as it started, "failed to create webview", 0x80070002).
Function WestPlayFindWebView2
  StrCpy $WestPlayWebView2 ""
  ; Where the Runtime registers for the machine: WOW6432Node on 64-bit Windows, named here, as the installer reads
  ; the 64-bit view (Tauri's .onInit sets it; the plain path alone found it on no PC, 2.1.0), else 32-bit
  ; Windows' own.
  ReadRegStr $WestPlayVersion HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\${WESTPLAY_WEBVIEW2}" "pv"
  ${If} $WestPlayVersion == ""
    ReadRegStr $WestPlayVersion HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\${WESTPLAY_WEBVIEW2}" "pv"
  ${EndIf}
  ${If} $WestPlayVersion != ""
  ${AndIf} ${FileExists} "$PROGRAMFILES32\Microsoft\EdgeWebView\Application\$WestPlayVersion\msedgewebview2.exe"
    StrCpy $WestPlayWebView2 "found"
    Return
  ${EndIf}
  ReadRegStr $WestPlayVersion HKCU "SOFTWARE\Microsoft\EdgeUpdate\Clients\${WESTPLAY_WEBVIEW2}" "pv"
  ${If} $WestPlayVersion != ""
  ${AndIf} ${FileExists} "$LOCALAPPDATA\Microsoft\EdgeWebView\Application\$WestPlayVersion\msedgewebview2.exe"
    StrCpy $WestPlayWebView2 "found"
    Return
  ${EndIf}
  ${ForEach} $WestPlayChannel 1 3 + 1
    ${If} $WestPlayChannel = 1
      StrCpy $WestPlayGuid "${WESTPLAY_EDGE_BETA}"
    ${ElseIf} $WestPlayChannel = 2
      StrCpy $WestPlayGuid "${WESTPLAY_EDGE_DEV}"
    ${Else}
      StrCpy $WestPlayGuid "${WESTPLAY_EDGE_CANARY}"
    ${EndIf}
    ReadRegStr $WestPlayVersion HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\$WestPlayGuid" "pv"
    ${If} $WestPlayVersion == ""
      ReadRegStr $WestPlayVersion HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\$WestPlayGuid" "pv"
    ${EndIf}
    ${If} $WestPlayVersion == ""
      ReadRegStr $WestPlayVersion HKCU "SOFTWARE\Microsoft\EdgeUpdate\Clients\$WestPlayGuid" "pv"
    ${EndIf}
    ${If} $WestPlayVersion != ""
    ${AndIf} $WestPlayVersion != "0.0.0.0"
      StrCpy $WestPlayWebView2 "found"
      Return
    ${EndIf}
  ${Next}
FunctionEnd

; The message when it can't, in $WestPlayMessage, in the installer's language (English for one not here).
Function WestPlayWebView2Message
  ${Select} $LANGUAGE
    ${Case} 2052 ; Chinese (Simplified)
      StrCpy $WestPlayMessage "WestPlay 需要 Microsoft Edge WebView2 Runtime，但它在这台电脑上无法运行（缺失或已损坏）。请从 Microsoft 的页面安装它，然后重新运行 WestPlay 安装程序。$\n$\n现在打开 Microsoft 的页面吗？"
    ${CaseElse}
      StrCpy $WestPlayMessage "WestPlay needs Microsoft Edge WebView2 Runtime, and it isn't working on this PC (it's missing or damaged). Install it from Microsoft's page, then run WestPlay's setup again.$\n$\nOpen Microsoft's page now?"
  ${EndSelect}
FunctionEnd

; Before anything is installed: WestPlay's windows are WebView2's, so with no WebView2 that can run it can't
; start at all. Setup then says so, offers Microsoft's page, and stops (owner 2026-10-24: "so it does not
; continue to install"). Silent, it stops without asking.
!macro NSIS_HOOK_PREINSTALL
  Call WestPlayFindWebView2
  ${If} $WestPlayWebView2 == ""
    Call WestPlayWebView2Message
    MessageBox MB_ICONSTOP|MB_YESNO "$WestPlayMessage" /SD IDNO IDNO +2
    ExecShell "open" "${WESTPLAY_WEBVIEW2_PAGE}"
    Abort "WebView2 Runtime: missing or damaged"
  ${EndIf}
!macroend
