#!/usr/bin/env python3
"""
Build westplay.dll and stage it for packaging. Game deployment requires --deploy
and a matching westplay-probe.exe prepared by tools/build_resources.ps1.
"""

import argparse
import os
import shutil
import subprocess
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MINHOOK_INC = os.path.join(REPO_ROOT, "minhook_inc")
LLVM_BIN = r"C:\Program Files\Huawei\DevEco Studio\sdk\default\openharmony\native\llvm\bin"
SELF_CONTAINED = os.path.expanduser(
    r"~/.rustup/toolchains/stable-x86_64-pc-windows-gnu/lib/rustlib/x86_64-pc-windows-gnu/lib/self-contained"
)
CARGO_BIN = os.path.expanduser(r"~/.cargo/bin")
CARGO_EXE = os.path.join(CARGO_BIN, "cargo.exe")

ATS_PLUGINS = r"D:\Program Files (x86)\Steam\steamapps\common\American Truck Simulator\bin\win_x64\plugins"
ETS2_PLUGINS = r"D:\Program Files (x86)\Steam\steamapps\common\Euro Truck Simulator 2\bin\win_x64\plugins"

def safe_copy(src, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    try:
        shutil.copy2(src, dest)
        print(f"Deployed: {dest}")
    except PermissionError:
        # If the DLL is currently locked by a running game process, rename it first
        old_path = dest + ".old"
        if os.path.exists(old_path):
            try:
                os.remove(old_path)
            except Exception:
                pass
        try:
            os.rename(dest, old_path)
            shutil.copy2(src, dest)
            print(f"Deployed (after rename of locked DLL): {dest}")
        except Exception as e:
            print(f"Failed to copy to {dest}: {e}")
            raise

def build(deploy=False):
    env = os.environ.copy()
    llvm_bin = os.environ.get("WESTPLAY_LLVM_MINGW")
    if llvm_bin:
        llvm_bin = os.path.join(llvm_bin, "bin")
    else:
        llvm_bin = LLVM_BIN
    # Keep the host Rust linker independent of LLVM-MinGW's GCC compatibility driver.
    env["PATH"] = CARGO_BIN + ";" + env.get("PATH", "")
    env["CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER"] = "rust-lld"
    env["CC"] = os.path.join(llvm_bin, "clang.exe")
    env["AR"] = os.path.join(llvm_bin, "llvm-ar.exe")
    env["CFLAGS"] = "-target x86_64-w64-windows-gnu"
    if not os.environ.get("WESTPLAY_LLVM_MINGW"):
        env["CFLAGS"] += f" -I{MINHOOK_INC.replace(os.sep, '/')}"
    dllcrt2 = os.path.join(SELF_CONTAINED, "dllcrt2.o")
    env["RUSTFLAGS"] = f"-C linker=rust-lld -L native={SELF_CONTAINED} -C link-arg={dllcrt2}"

    cmd = [
        CARGO_EXE,
        "build",
        "--release",
        "--locked",
        "-p",
        "westplay-plugin",
        "--target",
        "x86_64-pc-windows-gnullvm",
    ]
    print(f"Executing: {' '.join(cmd)}")
    res = subprocess.run(cmd, cwd=REPO_ROOT, env=env)
    if res.returncode != 0:
        print(f"Build failed with exit code {res.returncode}")
        sys.exit(res.returncode)

    built_dll = os.path.join(
        REPO_ROOT, "target", "x86_64-pc-windows-gnullvm", "release", "westplay.dll"
    )
    if not os.path.isfile(built_dll):
        print(f"Error: {built_dll} not found!")
        sys.exit(1)

    print(f"Successfully built: {built_dll} ({os.path.getsize(built_dll)} bytes)")

    # Copy to target/release/westplay.dll for packaging
    pkg_target = os.path.join(REPO_ROOT, "target", "release", "westplay.dll")
    os.makedirs(os.path.dirname(pkg_target), exist_ok=True)
    shutil.copy2(built_dll, pkg_target)

    if deploy:
        probe = os.path.join(REPO_ROOT, "target", "release", "westplay-probe.exe")
        if not os.path.isfile(probe):
            raise FileNotFoundError("Missing westplay-probe.exe; run tools/build_resources.ps1 first")
        for plugins in (ATS_PLUGINS, ETS2_PLUGINS):
            if os.path.isdir(plugins):
                # The probe must be beside the plugin before a game can load that plugin.
                safe_copy(probe, os.path.join(plugins, "westplay-probe.exe"))
                safe_copy(built_dll, os.path.join(plugins, "westplay.dll"))

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deploy", action="store_true", help="also install into the local games")
    build(deploy=parser.parse_args().deploy)
