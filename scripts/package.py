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
    "安装OCR前置组件.cmd", "启用中文遗物OCR.cmd", "关闭中文遗物OCR.cmd", "导出诊断包.cmd",
    "README.md", "LICENSE", "NOTICE.md", "CHANGELOG.md", "VERSION",
]
DIRS = ["bin", "dict", "src", "docs", "scripts"]

# 运行期/本机数据，不进发布包
EXCLUDE_DIRS = {".tools", "__pycache__", "state", "logs", "dist", "backup", "verify"}
EXCLUDE_FILES = {"build-unmatched.txt", "item-translations.normalized.runtime.json"}



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
            for root, dirs, files in os.walk(os.path.join(PKG, d)):
                dirs[:] = [x for x in dirs if x not in EXCLUDE_DIRS]
                for f in files:
                    if f in EXCLUDE_FILES or f.endswith(".pyc"):
                        continue
                    p = os.path.join(root, f)
                    rel = os.path.relpath(p, PKG).replace(os.sep, "/")
                    z.write(p, f"AlecaFrame-ZH/{rel}")
    if missing:
        print("WARN missing:", ", ".join(missing))
    print(f"wrote {out} ({os.path.getsize(out)} bytes)")
    verify(out)


def verify(out):
    """发布包必须自包含：缺一个文件就会让用户端功能静默失效。"""
    required = [
        "AlecaFrame-ZH/Start-Chinese.cmd",
        "AlecaFrame-ZH/安装OCR前置组件.cmd",
        "AlecaFrame-ZH/bin/AlecaFrame-ZH.ps1",
        "AlecaFrame-ZH/bin/alecaframe-zh-cn.js",
        "AlecaFrame-ZH/bin/ocr/afzh-items.js",
        "AlecaFrame-ZH/bin/ocr/relic-ocr-server.js",
        "AlecaFrame-ZH/scripts/Install-OcrPrerequisites.ps1",
        "AlecaFrame-ZH/src/search.js",
        "AlecaFrame-ZH/src/relic-reward-fallback.js",
        "AlecaFrame-ZH/dict/items.tsv",
        "AlecaFrame-ZH/VERSION",
    ]
    with zipfile.ZipFile(out) as z:
        names = set(z.namelist())
    lacking = [r for r in required if r not in names]
    if lacking:
        raise SystemExit("发布包缺少必需文件：\n  " + "\n  ".join(lacking))
    print(f"verify: {len(required)} 个必需文件齐全，共 {len(names)} 个条目")


if __name__ == "__main__":
    main()
