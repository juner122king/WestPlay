#!/usr/bin/env python3
"""
Builds `westplay.dll` (the SCS SDK plugin) and deploys it to the game's plugins folder.
"""

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

def build():
    env = os.environ.copy()
    env["PATH"] = LLVM_BIN + ";" + CARGO_BIN + ";" + env.get("PATH", "")
    env["CC"] = os.path.join(LLVM_BIN, "clang.exe")
    env["AR"] = os.path.join(LLVM_BIN, "llvm-ar.exe")
    env["CFLAGS"] = f"-target x86_64-w64-windows-gnu -I{MINHOOK_INC.replace(os.sep, '/')}"
    dllcrt2 = os.path.join(SELF_CONTAINED, "dllcrt2.o")
    env["RUSTFLAGS"] = f"-C linker=rust-lld -L native={SELF_CONTAINED} -C link-arg={dllcrt2}"

    cmd = [
        CARGO_EXE,
        "build",
        "--release",
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
    safe_copy(built_dll, pkg_target)

    if os.path.isdir(ATS_PLUGINS):
        safe_copy(built_dll, os.path.join(ATS_PLUGINS, "westplay.dll"))

    if os.path.isdir(ETS2_PLUGINS):
        safe_copy(built_dll, os.path.join(ETS2_PLUGINS, "westplay.dll"))

if __name__ == "__main__":
    build()
