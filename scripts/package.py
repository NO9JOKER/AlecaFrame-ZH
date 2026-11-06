#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""打包发布 zip：dist/AlecaFrame-ZH-v<VERSION>.zip

在仓库根目录运行（需先 python src/build.py 生成 bin/alecaframe-zh-cn.js）：
    python scripts/package.py
"""
import os
import zipfile

BASE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.dirname(BASE)
DIST = os.path.join(PKG, "dist")

ROOT_FILES = [
    "Start-Chinese.cmd", "Restore-English.cmd", "Toggle-Chinese.cmd",
    "Refresh-Chinese.cmd", "Status.cmd", "Install-Shortcuts.cmd",
    "README.md", "LICENSE", "NOTICE.md", "CHANGELOG.md", "VERSION",
]
DIRS = ["bin", "dict", "src", "docs"]


def read_version():
    p = os.path.join(PKG, "VERSION")
    return open(p, encoding="utf-8").read().strip() if os.path.exists(p) else "0.0.0"


def main():
    version = read_version()
    out = os.path.join(DIST, f"AlecaFrame-ZH-v{version}.zip")
    os.makedirs(DIST, exist_ok=True)
    missing = []
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for name in ROOT_FILES:
            p = os.path.join(PKG, name)
            if os.path.exists(p):
                z.write(p, f"AlecaFrame-ZH/{name}")
            else:
                missing.append(name)
        for d in DIRS:
            for root, _dirs, files in os.walk(os.path.join(PKG, d)):
                for f in files:
                    if f in ("build-unmatched.txt",):
                        continue
                    p = os.path.join(root, f)
                    rel = os.path.relpath(p, PKG).replace(os.sep, "/")
                    z.write(p, f"AlecaFrame-ZH/{rel}")
    if missing:
        print("WARN missing:", ", ".join(missing))
    print(f"wrote {out} ({os.path.getsize(out)} bytes)")


if __name__ == "__main__":
    main()
