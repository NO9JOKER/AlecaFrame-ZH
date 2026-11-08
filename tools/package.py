#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Assemble a self-contained test package under dist/.

The package keeps the launcher and bundle at the same relative paths the .cmd
wrappers expect:

  <pkg>/Start-Chinese.cmd ...
  <pkg>/pages.json
  <pkg>/bin/AlecaFrame-ZH.ps1
  <pkg>/bin/lib/*.ps1
  <pkg>/bin/alecaframe-zh-cn.js
  <pkg>/bin/ocr/*

This is a development/test package, not the release tag. Run tools/build.py
first so the bundle exists.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

INSTRUCTIONS = """AlecaFrame-ZH 1.2.0-dev 测试包

这是测试包，不是正式发布版。Start/Restore 会重启 Overwolf，并临时修改 AlecaFrame
页面文件；测试前请结束正在进行的游戏任务、交易等不可中断操作。

一、第一次使用（全部双击，无需命令行）
1. 双击 Status.cmd，查看 Overwolf/AlecaFrame 版本和当前状态；窗口会暂停，按任意键关闭。
2. 双击 Start-Chinese.cmd。若 Windows SmartScreen 提示，点“更多信息” -> “仍要运行”。
3. 等待 Overwolf/AlecaFrame 自动重启；进入主界面后检查中文是否生效。
4. 如果界面仍是英文，不要反复点 Start；先看 logs\\launcher.log，再双击
   导出诊断包.cmd，把生成的诊断包发给开发者。

二、日常操作
- 切换中/英（不重启）：Toggle-Chinese.cmd
- 重新注入最新包内容：Refresh-Chinese.cmd
- 恢复官方英文：Restore-English.cmd
- 创建桌面快捷方式：Install-Shortcuts.cmd
- OCR 开关/安装前置组件：使用对应中文名称的 .cmd

三、日志和状态
- logs\\launcher.log
- state\\last-session.json
- PACKAGE-INFO.json（记录 bundle SHA256）

四、如果出错
- Start 失败或界面异常：双击 Restore-English.cmd。
- 不要手动删除 state 目录；不要手工改官方安装文件。
- 不要把本测试包当成 1.2.0 正式发布包。

五、验证通过标准
- Status 显示“当前文件已汉化=True”和“本次会话已带校验绕过参数=True”。
- 主窗口、库存、市场、裂罅、源力石、统计等界面出现中文。
- 中文搜索可用（例如库存/铸造输入中文）。
- Toggle/Refresh/Restore 均可正常使用。
"""


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def copy_file(src: Path, dst: Path) -> None:
    if not src.is_file():
        raise FileNotFoundError(str(src))
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def copy_tree(src: Path, dst: Path) -> None:
    if not src.is_dir():
        raise FileNotFoundError(str(src))
    for path in src.rglob("*"):
        if path.is_file():
            copy_file(path, dst / path.relative_to(src))


def ensure_ps_bom(path: Path) -> None:
    """PowerShell 5.1 reads BOM-less UTF-8 as ANSI; enforce BOM for scripts."""
    if path.suffix.lower() not in {".ps1", ".psm1"}:
        return
    data = path.read_bytes()
    if data.startswith(b"\xef\xbb\xbf"):
        return
    path.write_bytes(b"\xef\xbb\xbf" + data)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Build a test package under dist/")
    parser.add_argument("--version", default=(ROOT / "VERSION").read_text(encoding="utf-8").strip())
    parser.add_argument("--name", default=None, help="package directory name")
    parser.add_argument("--out", default="dist")
    parser.add_argument("--zip", action="store_true", help="also create <name>.zip next to the package")
    args = parser.parse_args(argv)

    bundle = ROOT / "bin" / "alecaframe-zh-cn.js"
    if not bundle.is_file():
        print("package: missing bin/alecaframe-zh-cn.js; run python tools/build.py first", file=sys.stderr)
        return 2
    pages = ROOT / "pages.json"
    if not pages.is_file():
        print("package: missing pages.json", file=sys.stderr)
        return 2

    name = args.name or f"AlecaFrame-ZH-{args.version}"
    target = (ROOT / args.out / name).resolve()
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True)

    for cmd in ROOT.glob("*.cmd"):
        copy_file(cmd, target / cmd.name)
    for name_file in ("VERSION", "LICENSE", "NOTICE.md", "pages.json"):
        path = ROOT / name_file
        if path.is_file():
            copy_file(path, target / name_file)

    launcher_src = ROOT / "src" / "launcher"
    copy_file(launcher_src / "AlecaFrame-ZH.ps1", target / "bin" / "AlecaFrame-ZH.ps1")
    copy_tree(launcher_src / "lib", target / "bin" / "lib")
    copy_file(bundle, target / "bin" / "alecaframe-zh-cn.js")
    copy_tree(ROOT / "bin" / "ocr", target / "bin" / "ocr")
    copy_tree(ROOT / "scripts", target / "scripts")
    for path in target.rglob("*"):
        if path.is_file():
            ensure_ps_bom(path)
    (target / "使用说明.txt").write_text(INSTRUCTIONS, encoding="utf-8-sig", newline="\n")

    info = {
        "schemaVersion": 1,
        "package": "development-test",
        "version": args.version,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "bundle": {
            "path": "bin/alecaframe-zh-cn.js",
            "sha256": sha256(target / "bin" / "alecaframe-zh-cn.js"),
            "bytes": (target / "bin" / "alecaframe-zh-cn.js").stat().st_size,
        },
        "launcher": "bin/AlecaFrame-ZH.ps1",
        "pages": "pages.json",
        "note": "未发布测试包；不要作为 release tag 分发。",
    }
    (target / "PACKAGE-INFO.json").write_text(
        json.dumps(info, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    print(f"package: OK {target}")
    print(f"bundle sha256: {info['bundle']['sha256']}")
    if args.zip:
        archive = target.parent / (target.name + ".zip")
        if archive.exists():
            archive.unlink()
        shutil.make_archive(str(target.parent / target.name), "zip", root_dir=target.parent, base_dir=target.name)
        print(f"zip: OK {archive}")
    print(f"start: {target / 'Status.cmd'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
