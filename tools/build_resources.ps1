# Build only workspace artifacts. Never copy into either game installation.
[CmdletBinding()]
param([string]$LlvmMingw = $env:WESTPLAY_LLVM_MINGW)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (!$LlvmMingw) {
    $LlvmMingw = Join-Path $root 'target/toolchains/llvm-mingw-20260602-ucrt-x86_64'
}
$LlvmMingw = [IO.Path]::GetFullPath($LlvmMingw)
foreach ($tool in @('clang.exe', 'llvm-ar.exe')) {
    if (!(Test-Path -LiteralPath (Join-Path $LlvmMingw "bin/$tool"))) {
        throw "Missing $tool. Set WESTPLAY_LLVM_MINGW to a complete LLVM-MinGW toolchain. See docs/domestic-2.3.0.md."
    }
}
$oldCC = $env:CC
$oldAR = $env:AR
$oldLlvm = $env:WESTPLAY_LLVM_MINGW
Push-Location $root
try {
    $env:CC = Join-Path $LlvmMingw 'bin/clang.exe'
    $env:AR = Join-Path $LlvmMingw 'bin/llvm-ar.exe'
    $env:WESTPLAY_LLVM_MINGW = $LlvmMingw
    cargo build --release --locked -p westplay-maps
    if ($LASTEXITCODE -ne 0) { throw 'Map builder build failed' }
    cargo build --release --locked -p westplay-probe
    if ($LASTEXITCODE -ne 0) { throw 'Graphics probe build failed' }
    python tools/build_plugin.py
    if ($LASTEXITCODE -ne 0) { throw 'Plugin build failed' }
    foreach ($file in @('westplay-maps.exe', 'westplay-probe.exe', 'westplay.dll')) {
        if (!(Test-Path -LiteralPath (Join-Path $root "target/release/$file"))) { throw "Missing $file" }
    }
} finally {
    $env:CC = $oldCC
    $env:AR = $oldAR
    $env:WESTPLAY_LLVM_MINGW = $oldLlvm
    Pop-Location
}
