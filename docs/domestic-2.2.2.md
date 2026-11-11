# WestPlay 2.2.2 国内定制版

## 集成基线

- 定制基线：a35e7e5；上游固定基线：b748d5a（main 2.2.2）。使用 merge 保留双方历史。
- 保留国内平台、信号灯倒计时、货运 HUD、可缩放窗口、中英双语和原应用标识 app.westplay。
- 接入独立地图构建程序、默认关闭的加速构建、选择地图重建、音频和地图显示修复、崩溃诊断与日志轮转。
- 不主动清除用户数据或地图缓存；不恢复 Spotify、YouTube Music 或其他语言。

## 更新策略

在线更新在本定制版中关闭。online_updates_enabled 返回 false，查询命令始终返回 null，安装命令返回明确错误。
前端不订阅更新事件、不查询安装包；关于页面明确提示手动安装。预览遵守相同策略，旧的 ?update 参数不会打开原版更新。
不保留原版更新源、公钥或自动更新插件，不生成签名更新包。日后启用独立渠道应作为单独变更评审。

## 构建（不部署到游戏）

需要 Node.js、Python、Rust GNU 工具链以及完整的 LLVM-MinGW 工具链。当前插件脚本使用 x86_64-pc-windows-gnullvm target。
本机原有 gcc 包装器及简化 Windows 头文件不足以编译 mimalloc，不能拿 minhook_inc 替代完整 Windows SDK。

验证使用官方 llvm-mingw-20260602-ucrt-x86_64，解压到 target/toolchains；也可通过 WESTPLAY_LLVM_MINGW 指向其他完整工具链根目录。
官方归档 SHA256：3de3eda9377bbaf35f8c9001f190380f63b8ee981fa55d3ae9d7cce7c6ad7c70。

PowerShell 示例（在项目根目录执行）：

~~~powershell
$env:WESTPLAY_LLVM_MINGW = (Resolve-Path target/toolchains/llvm-mingw-20260602-ucrt-x86_64).Path
$env:CC = Join-Path $env:WESTPLAY_LLVM_MINGW 'bin/clang.exe'
$env:AR = Join-Path $env:WESTPLAY_LLVM_MINGW 'bin/llvm-ar.exe'
cargo check --workspace --locked
cargo test --workspace --locked
npm --prefix ui test
npm --prefix ui run lint
npm --prefix ui run build
npm run build:release
~~~

build:release 先构建 westplay-maps.exe 和 westplay.dll，再构建应用及普通 NSIS 安装包。
构建脚本失败会停止打包，避免将缺失的资源当作完整安装包。产物在 target/release，安装包在 target/release/bundle/nsis。
插件脚本默认仅暂存到 target/release；只有显式传入 --deploy 才会写入本机游戏目录。
release 保留 line-tables-only 调试信息和符号；本地符号产物不作为安装包资源。

## 验收清单

自动化覆盖：国内应用裁剪、语言和安装器限制、版本/资源配置、地图重建请求参数、旧设置关闭加速、Host 状态兼容、在线更新前后端禁用及预览一致性。
上游测试覆盖独立构建器异常退出/启动失败、地图选择合并、地图构建协议、日志与崩溃格式等。

必须人工验证：真实游戏的普通/加速地图构建、所有/指定地图重建、进度及子进程故障恢复；已有账号与设置升级；国内平台实际登录播放及互斥；信号灯与货运 HUD；ETS2/ATS 插件加载、仪表盘缩放；受影响 ATS 车型音频；实际崩溃日志。
不运行安装包、不启动游戏、不自动部署插件；编译和单测通过不代表以上人工场景通过。


## 本次自动验收记录（2026-11-11）

- 合并前：前端 69 个文件、395 项通过；Rust 576 项通过，37 项环境依赖测试跳过。
- 合并后：前端 71 个文件、405 项通过；Rust 595 项通过，38 项环境依赖测试跳过。
- workspace 编译检查、前端生产构建、release 配套地图程序与插件构建、NSIS 打包通过。
- 前端 lint 无错误，有 19 条现有/上游警告；未在本次整合中扩展处理无关代码。
- release 地图程序在 system 与 mimalloc 分配模式下均能启动并以退出码 2 正确拒绝无效请求。
- 安装包 WestPlay_2.2.2_x64-setup.exe，14,773,452 bytes；解包后插件和地图程序哈希与本次构建完全一致，69 个前端文件逐一核对一致。
- 主程序版本为 2.2.2，安装包内与本地 exe 仅有 Tauri 的 __TAURI_BUNDLE_TYPE_VAR_UNK → __TAURI_BUNDLE_TYPE_VAR_NSS 标记差异，已按完整文件验证无其他差异。
- 校验清单保存在 target/release/domestic-build-manifest.json；安装包仅含普通 NSIS 产物，无单独签名更新包或调试符号资源。
- 国内平台实现、信号灯逻辑与定制基线逐文件核对；上游核心地图与日志/崩溃模块与 b748d5a 逐文件核对。
- 尚未执行上述真实游戏、账号、音频及完整地图构建的人工验收；未运行安装包，未写入游戏目录。
