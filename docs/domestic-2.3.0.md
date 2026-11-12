# WestPlay 2.3.0-domestic.1 国内定制版

## 同步基线与版本

- 定制基线为 `2c03aad`（车道引导和全程路线概览），合并固定上游 `d8d8af2`（2.3.0），保留双方提交历史。
- 完整版本为 `2.3.0-domestic.1`，Rust 工作区、Tauri、前端包、锁文件及运行时/预览版本保持一致；不修改同版本号的第三方依赖。
- 关于页面显示“WestPlay 国内定制版 2.3.0-domestic.1”；日志与插件版本携带完整标识。后续同上游版本定制修订递增 `domestic.N`，上游版本升级后从 `domestic.1` 开始。

## 功能与兼容性

- 接入上游 Safari、整屏亮度调节、卡车收费通道与称重站路线修正、两行主页与侧栏、平板界面、屏幕内容取色光标、键盘及仪表盘视频修复。
- 接入上游图形 Hook 与独立探测程序、游戏安装识别、引擎重启后台任务清理、地图构建错误和崩溃诊断修复。
- 保留 B站、网易云音乐、喜马拉雅、抖音、红果短剧、货运 HUD、信号灯倒计时、车道引导、全程路线概览和原有闲置资源回收。
- Safari 与全部现有播放器共用播放互斥、游戏暂停和快捷键规则。实际播放启动也会取消旧播放器的待恢复播放，覆盖网页内部控件启动而没有车机播放命令的情况。
- Safari 沿用上游的标签、历史、登录与生命周期，不参与国内播放器的 30 秒闲置回收和实例编号协议。其他播放器的自动暂停恢复保护、旧实例过滤和地图资源回收保持有效。
- 仪表盘地图展开时，YouTube 和国内平台的视频均按各自窗口隐藏，返回后重新定位。
- 仅保留英文、简体中文；不恢复 Spotify 或 YouTube Music。保留 `app.westplay`、可缩放窗口、现有数据目录及账号、设置、地图缓存；升级不主动清理用户数据。
- 原版在线更新继续关闭，也不生成签名更新包；以后升级需使用国内定制版渠道。

## 构建入口

沿用 `docs/domestic-2.2.2.md` 所述完整 LLVM-MinGW 工具链。`tools/build_resources.ps1` 为后续构建依次准备地图程序、`westplay-probe.exe` 与插件，并确认三项资源均存在，任一步失败即终止。

`tools/build_plugin.py` 默认只暂存本地插件。仅显式指定 `--deploy` 才部署；部署前要求探测程序存在，并先复制探测程序再复制插件。测试使用临时模拟目录，不访问实际游戏安装。

本次只验证源码，不执行根目录的应用/release 构建，不生成安装包，不运行安装程序，也不部署插件。

验证命令（仓库根目录，PowerShell）：

```powershell
$env:WESTPLAY_LLVM_MINGW = (Resolve-Path target/toolchains/llvm-mingw-20260602-ucrt-x86_64).Path
$env:CC = Join-Path $env:WESTPLAY_LLVM_MINGW 'bin/clang.exe'
$env:AR = Join-Path $env:WESTPLAY_LLVM_MINGW 'bin/llvm-ar.exe'
cargo check --workspace --locked
cargo test --workspace --locked
npm --prefix ui test
npm --prefix ui run lint
npm --prefix ui run build
python -m unittest discover -s tools/tests -v
```

## 验收记录（2026-11-12）

- Rust 工作区测试：648 项通过，0 失败，55 项标记为 ignored；其中包括网络、真实 WebView2、GPU、实际游戏地图或人工诊断场景，未强行运行。
- 前端：81 个测试文件、460 项测试通过，包含 Safari 与五个国内平台双向互斥、游戏暂停恢复、主动暂停、跨平台取消待恢复播放及同步播放回执下的自动淡入恢复，以及宿主消息和定制版本一致性。
- 构建脚本隔离测试：3 项通过，覆盖默认不部署、显式部署携带探测程序、缺少探测程序时不写入任何游戏目录。PowerShell 资源脚本语法检查通过。
- 前端 lint 无错误，保留 30 条现有定制/上游警告；生产构建保留原有大分块提示。未借此次同步重构无关代码。
- 完整定制版本通过 Tauri 配置反序列化及 Rust/npm/预览版本校验；这不代表已完成 NSIS 打包验收。
- 验证日志位于被 Git 忽略的 `target/sync230-*.log`。

待人工验收：实际游戏中的 Safari 登录/网页验证/声音、屏幕亮度与输入、仪表盘视频显示、国内账号升级与播放、收费站/称重站和车道/信号灯引导、ETS2/ATS 插件加载、图形 Mod/覆盖层共存、多 GPU 引擎重启及崩溃日志。编译和自动测试通过不能代替这些实机场景。
