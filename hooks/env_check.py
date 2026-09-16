#!/usr/bin/env python3
"""SessionStart hook: report Video Factory readiness (node + ffmpeg). Advisory only."""
from __future__ import annotations
import json, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def main() -> int:
    lines = [f"python3: {sys.version.split()[0]}"]
    node = shutil.which("node")
    lines.append(f"node: {node or '未找到（装配管线必需）'}")
    ff = shutil.which("ffmpeg") and shutil.which("ffprobe")
    lines.append("ffmpeg/ffprobe: 就绪" if ff else "ffmpeg/ffprobe: 未找到（媒体校验与合成必需）")
    cli = ROOT / "scripts" / "cli.mjs"
    lines.append("factory CLI: 就绪" if cli.is_file() else "factory CLI: 缺失")
    try:
        sys.stdin.read()
    except Exception:
        pass
    print("视频工厂插件环境：" + "；".join(lines))
    return 0

if __name__ == "__main__":
    try:
        json.load(sys.stdin)
    except Exception:
        pass
    sys.exit(main())
