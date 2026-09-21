#!/usr/bin/env python3
"""UserPromptSubmit hook: point video-assembly requests at the plugin commands. Advisory only."""
from __future__ import annotations

import json
import re
import sys

INTENT_RE = re.compile(r"视频工厂|自动剪辑|视频装配|合成视频|成片|剪辑任务|video\s*factory", re.IGNORECASE)

def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        payload = {}
    prompt = str(payload.get("prompt") or "") if isinstance(payload, dict) else ""
    if prompt.strip().startswith("/"):
        return 0
    if INTENT_RE.search(prompt):
        print("提示：该请求疑似视频装配相关。可用 /video-factory 总入口或细分命令 (/video-factory-plan /video-factory-run /video-factory-judge /video-factory-recover)。")
    return 0

if __name__ == "__main__":
    sys.exit(main())
