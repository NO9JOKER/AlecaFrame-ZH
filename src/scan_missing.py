#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""只读扫描本机已安装的 AlecaFrame，找出“界面里出现、但我们的词典还没覆盖”的英文串。

产出 dict/gap-candidates.tsv：英文<TAB>出现次数<TAB>来源文件（最多 3 个，';' 分隔），
只包含未覆盖的候选，按出现次数降序。重复运行结果稳定（不写时间戳、排序确定）。

扫描范围（只读，不修改被扫描目录）：
  <version>/web/**/*.html   静态文本节点 + placeholder/title/aria-label/data-tooltip
                            （与 src/engine.js 的 ATTRS 一致；含 {{...}} 的动态文本节点
                             单独计入“动态模板”统计，不作为词典候选）
  <version>/web/**/*.js     字符串字面量（'...' / "..." / `...`），
                            以及字符串里内联的 HTML 片段文本

过滤掉：第三方库（jquery/vue/chart/tippy/popper/signalr/toastify/…）、
已汉化补丁自身（alecaframe-zh-cn.js）、URL/路径/类名/CSS/十六进制/单字符/
SVG path/含 ${} 的模板字面量/属性链/键盘键名/品牌名等代码噪声。

覆盖判定：与 src/build.py 的合并层（items.tsv -> mioeu-terms.tsv -> vendor ->
fixes.tsv -> extra-*.tsv）做“空白归一 + 精确匹配”——和 src/engine.js 的运行时
匹配语义一致（engine 不做大小写折叠，所以这里也不折叠）。

用法：
    python src/scan_missing.py                          # 自动探测已安装的最新版本
    python src/scan_missing.py --app-dir "C:\\...\\3.0.6"
    python src/scan_missing.py --min-count 2 --limit 300
    python src/scan_missing.py --show-covered           # 调试：打印已覆盖样例
"""
import argparse
import glob
import html
import json
import os
import re
import sys
from html.parser import HTMLParser

BASE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.dirname(BASE)
DICT = os.path.join(PKG, "dict")
OUT = os.path.join(DICT, "gap-candidates.tsv")
APP_ID = "afmcagbpgggkpdkokjhjkllpegnadmkignlonpjm"

# 运行时会被翻译的属性（与 src/engine.js 的 ATTRS 保持一致）
ATTRS = ("placeholder", "title", "aria-label", "data-tooltip")

# 第三方库 / 框架：不参与“界面文本”统计
VENDOR_DIRS = {"external", "tippy", "tippy2"}
VENDOR_FILES = {
    "jquery.min.js", "tilt.jquery.js", "vue.global.prod.js", "popper.min.js",
    "chart.js", "chartjs-adapter-date-fns.bundle.min.js", "color-picker.js",
    "alwan.min.js", "signalr.js", "toastify.js", "tippy-bundle.umd.js",
}
# 本汉化补丁自己（含词典 + 翻译逻辑，扫描它只会得到中文与词典键）
PATCH_FILES = {"alecaframe-zh-cn.js"}

# 键盘事件名（不是界面文案）
KEY_NAMES = {
    "Escape", "Enter", "Tab", "Space", "Backspace", "Delete", "Insert", "Home",
    "End", "PageUp", "PageDown", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    "Shift", "Control", "Alt", "Meta", "CapsLock", "NumLock", "ScrollLock",
}
# 品牌/产品名：保持英文，不翻译
BRANDS = {
    "AlecaFrame", "Overwolf", "Discord", "Patreon", "TennoFinder", "Warframe",
    "GitHub", "Steam", "YouTube", "Twitch", "Twitter", "Reddit", "Google",
    "Chrome", "Firefox", "Edge", "Windows", "NVIDIA", "AMD",
}

RE_MUSTACHE = re.compile(r"\{\{.*?\}\}", re.S)
RE_WS = re.compile(r"[ \t\u00a0]+")
RE_LETTER = re.compile(r"[A-Za-z]")
RE_CJK = re.compile(r"[\u3400-\u9fff\uf900-\ufaff]")
RE_PX = re.compile(r"\b\d+(?:\.\d+)?px\b")
RE_SELECTOR = re.compile(r"(?:^|\s)[.#][A-Za-z]")
RE_CSS_DECL = re.compile(r"^[\w-]+\s*:\s*\S")
RE_IDCODE = re.compile(r"^[A-Z][A-Z0-9]*-[A-Z0-9]{4,}$")     # 例如 G-TFLFSSG5PH
RE_LANGCODE = re.compile(r"^[A-Z]{2,3}-[A-Za-z]$")           # 例如 ZH-S / ZH-T
RE_SHORTCUT = re.compile(r"^[A-Za-z]+(?:\+[A-Za-z0-9]+)+$")  # 例如 Ctrl+Tab
RE_DATEFMT = re.compile(r"\b(?:yyyy|MMM|MM|dd|HH)\b|\byyyy\b")
RE_CAMEL = re.compile(r"^[A-Z][a-z0-9]+(?:[A-Z][a-zA-Z0-9]*)+$")
RE_CAPS_RUN = re.compile(r"[A-Z]{2,}[a-z]")

CODE_HINTS = (
    "function", "return ", "=>", "===", "!==", "document.", "window.",
    "querySelector", "getElementById", "addEventListener", "innerHTML",
    "className", "localStorage", "sessionStorage", "console.", "application/",
    "text/html", "text/javascript", "image/", "multipart/", "charset=",
    "http://", "https://", ".js", ".css", ".png", ".webp", ".svg", ".jpg",
    ".gif", ".woff", ".ttf", "<script", "</script", "onclick", "onload",
    "rgba(", "getComputedStyle", "requestAnimationFrame", "MutationObserver",
    "undefined", "prototype", "JSON.", "parseInt", "parseFloat", "toString(",
    "encodeURIComponent", "decodeURIComponent", "new Date", "Math.",
    "aria-hidden", "v-if", "v-for", "v-model", "&quot;", "&amp;",
    "sans-serif", "serif", "monospace", "font-", "background", "display:",
    "color:", "margin", "padding", "border", "cursor:", "z-index",
)
IDENT_EXACT = re.compile(r"[A-Za-z_$][A-Za-z0-9_$]*")
CONSTANT_EXACT = re.compile(r"[A-Z0-9_$]+")
PATHISH = re.compile(r"[A-Za-z0-9_$]*[/\\][A-Za-z0-9_$./\\-]+")
CHAINISH = re.compile(r"[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+")
HEXISH = re.compile(r"(?:0x[0-9a-fA-F]+|#[0-9a-fA-F]{3,8})\b")
BAD_CHARS = re.compile(r"[<>{}\[\];|`$]")
SVG_PATHISH = re.compile(r"^[Mm][0-9vhlczsqaVHLCZSA0-9 .,-]+$")
PROGRAMISH = re.compile(
    r"(?:^|[\s(])[A-Za-z_$][A-Za-z0-9_$]*\s*=\s*[^=]"
    r"|;\s*$"
    r"|\)\s*\{"
    r"|\(\s*[A-Za-z_$][\w$]*\s*=>"
)
ALLOWED_LEAD = ("(", "+", "…", "[", "×", "•", "&")


# --------------------------------------------------------------------------- #
# 词典层
# --------------------------------------------------------------------------- #
def load_tsv(path):
    d = {}
    if not os.path.exists(path):
        return d
    with open(path, encoding="utf-8-sig") as f:
        for line in f:
            line = line.rstrip("\r\n")
            if not line or line.startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) < 2:
                continue
            k, v = parts[0], "\t".join(parts[1:])
            if k.strip():
                d[k] = v
    return d


def norm(s):
    """与 engine.js 的 norm 一致：空白折叠 + 去首尾。"""
    return RE_WS.sub(" ", s).strip()


def load_known(dict_dir):
    """按 build.py 的优先级加载已知词典键 -> (归一化键集合, 各层条数)。"""
    known = set()
    stats = []
    layers = [("items.tsv", load_tsv(os.path.join(dict_dir, "items.tsv")))]
    mio = os.path.join(dict_dir, "mioeu-terms.tsv")
    if os.path.exists(mio):
        layers.append(("mioeu-terms.tsv", load_tsv(mio)))
    vendor = os.path.join(BASE, "vendor", "translations.zh-CN.json")
    if os.path.exists(vendor):
        layers.append(("vendor/translations.zh-CN.json", json.load(open(vendor, encoding="utf-8"))))
    layers.append(("fixes.tsv", load_tsv(os.path.join(dict_dir, "fixes.tsv"))))
    for p in sorted(glob.glob(os.path.join(dict_dir, "extra-*.tsv"))):
        layers.append((os.path.basename(p), load_tsv(p)))
    for name, d in layers:
        stats.append((name, len(d)))
        for k in d:
            nk = norm(k)
            if nk:
                known.add(nk)
    return known, stats


# --------------------------------------------------------------------------- #
# 目标目录
# --------------------------------------------------------------------------- #
def default_app_dir():
    local = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    root = os.path.join(local, "Overwolf", "Extensions", APP_ID)
    if not os.path.isdir(root):
        return None
    best = None
    for name in os.listdir(root):
        p = os.path.join(root, name)
        if not os.path.isdir(p) or not os.path.isdir(os.path.join(p, "web")):
            continue
        key = tuple(int(x) if x.isdigit() else 0 for x in name.split("."))
        if best is None or key > best[0]:
            best = (key, p)
    return best[1] if best else None


def resolve_web_dir(app_dir):
    if not app_dir:
        return None
    if os.path.basename(app_dir.rstrip("\\/")).lower() == "web":
        return app_dir
    web = os.path.join(app_dir, "web")
    return web if os.path.isdir(web) else None


def is_vendor(rel):
    parts = [p.lower() for p in rel.replace("\\", "/").split("/")]
    base = parts[-1]
    if base in VENDOR_FILES or base in PATCH_FILES:
        return True
    return any(p in VENDOR_DIRS for p in parts[:-1])


# --------------------------------------------------------------------------- #
# 候选判定
# --------------------------------------------------------------------------- #
def classify(text):
    """判断一个候选串是否像“给人看的界面文本”。返回规范化文本或 None。"""
    t = norm(html.unescape(text))
    if not t or len(t) < 2 or len(t) > 160:
        return None
    if not RE_LETTER.search(t):
        return None
    if RE_CJK.search(t):
        return None                       # 已是中文
    if BAD_CHARS.search(t):
        return None                       # 代码符号
    if t in KEY_NAMES or t in BRANDS:
        return None
    if RE_IDCODE.match(t) or RE_LANGCODE.match(t) or RE_SHORTCUT.match(t) or RE_DATEFMT.search(t):
        return None
    low = t.lower()
    for h in CODE_HINTS:
        if h in low:
            return None
    if HEXISH.search(t) or RE_PX.search(t) or SVG_PATHISH.match(t):
        return None
    if t.startswith((".", "#", ":", ",", "/", "\\", "%", "-", "×", "•")):
        return None
    if t.endswith((",", "\\", "=", "+", "-", "/")):
        return None
    if RE_SELECTOR.search(t) or RE_CSS_DECL.match(t):
        return None
    if PATHISH.search(t) or CHAINISH.fullmatch(t):
        return None
    if PROGRAMISH.search(t):
        return None
    digits = len(re.findall(r"\d", t))
    if digits >= 3 and not re.search(r"[a-z]{3,}", t):
        return None                       # SVG path / 数字串
    words = t.split(" ")
    if len(words) == 1:
        w = t
        if "_" in w or "$" in w:
            return None                   # 代码标识符
        if IDENT_EXACT.fullmatch(w) and w[0].islower():
            return None                   # camelCase / 小写单词
        if CONSTANT_EXACT.fullmatch(w):
            return None                   # CONSTANT_NAME
        if RE_CAMEL.match(w) or RE_CAPS_RUN.search(w):
            return None                   # CamelCase 复合词（窗口名/枚举）
        if re.fullmatch(r"[a-z0-9_.\-/]+", w):
            return None
        if len(RE_LETTER.findall(w)) < 3:
            return None
        if not (w[0].isupper() or w.endswith(("!", "?", "…", "...", ":", "."))):
            return None
        return t
    # 多词
    if "()" in t or "=" in t:
        return None
    if len(RE_LETTER.findall(t)) < 3:
        return None
    first = t[0]
    starts_ok = (first.isupper() or first.isdigit() or first in ALLOWED_LEAD
                 or t.startswith(("a ", "an ", "the ")))
    if not starts_ok:
        return None                       # 小写开头：多属性链/事件名/片段
    if not re.search(r"[a-z]", t):
        # 全大写：只接受短标题（<=4 个词）
        if len(words) > 4:
            return None
    return t


# --------------------------------------------------------------------------- #
# HTML 提取
# --------------------------------------------------------------------------- #
SKIP_TAGS = {"script", "style", "noscript", "textarea", "code", "pre"}


class HtmlExtractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.stack = []
        self.texts = []     # 静态文本节点（含动态插值的记为 template）
        self.attrs = []     # ATTRS 属性值
        self.templates = []

    def _skipping(self):
        return any(t in SKIP_TAGS for t in self.stack)

    def handle_starttag(self, tag, attrs):
        if tag in SKIP_TAGS:
            self.stack.append(tag)
            return
        if self._skipping():
            return
        self._collect_attrs(attrs)

    def handle_startendtag(self, tag, attrs):
        if tag in SKIP_TAGS or self._skipping():
            return
        self._collect_attrs(attrs)

    def _collect_attrs(self, attrs):
        for name, val in attrs:
            if val is None:
                continue
            lname = name.lower()
            if lname.startswith((":", "v-", "@", "x-", ".")):
                continue                  # Vue 表达式 / 事件绑定
            if lname in ATTRS:
                if RE_MUSTACHE.search(val):
                    self.templates.append(norm(val))
                else:
                    self.attrs.append(val)

    def handle_endtag(self, tag):
        if tag in SKIP_TAGS and tag in self.stack:
            while self.stack and self.stack.pop() != tag:
                pass

    def handle_data(self, data):
        if self._skipping() or not data or not data.strip():
            return
        if RE_MUSTACHE.search(data):
            self.templates.append(norm(data))
        else:
            self.texts.append(data)


def extract_html(src):
    """返回 (静态文本, 属性值, 动态模板)。插值先判断再展开，避免表达式里的引号被当文本。"""
    p = HtmlExtractor()
    try:
        p.feed(src)
    except Exception:
        # 畸形模板兜底：粗粒度正则
        cleaned = RE_MUSTACHE.sub(" ", src)
        texts = re.findall(r">([^<>]+)<", cleaned)
        return texts, [], p.templates
    return p.texts, p.attrs, p.templates


# --------------------------------------------------------------------------- #
# JS 提取
# --------------------------------------------------------------------------- #
def iter_js_strings(src):
    """产出 (literal, has_interpolation)。跳过注释。"""
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if c == "/" and i + 1 < n:
            nxt = src[i + 1]
            if nxt == "/":
                j = src.find("\n", i)
                if j < 0:
                    return
                i = j + 1
                continue
            if nxt == "*":
                j = src.find("*/", i + 2)
                if j < 0:
                    return
                i = j + 2
                continue
        if c in "'\"`":
            quote = c
            j = i + 1
            buf = []
            subst = False
            while j < n:
                d = src[j]
                if d == "\\":
                    buf.append(src[j:j + 2])
                    j += 2
                    continue
                if d == quote:
                    break
                if quote == "`" and d == "$" and j + 1 < n and src[j + 1] == "{":
                    subst = True
                if d == "\n" and quote != "`":
                    break
                buf.append(d)
                j += 1
            yield "".join(buf), subst
            i = j + 1
            continue
        i += 1


def unescape_js(s):
    out = []
    i, n = 0, len(s)
    mapping = {"n": "\n", "t": "\t", "r": "\r", '"': '"', "'": "'",
               "\\": "\\", "/": "/", "b": "\b", "f": "\f", "v": "\v", "0": "\0"}
    while i < n:
        c = s[i]
        if c != "\\" or i + 1 >= n:
            out.append(c)
            i += 1
            continue
        d = s[i + 1]
        if d == "u" and i + 5 < n and re.fullmatch(r"[0-9a-fA-F]{4}", s[i + 2:i + 6]):
            out.append(chr(int(s[i + 2:i + 6], 16)))
            i += 6
            continue
        if d == "x" and i + 3 < n and re.fullmatch(r"[0-9a-fA-F]{2}", s[i + 2:i + 4]):
            out.append(chr(int(s[i + 2:i + 4], 16)))
            i += 4
            continue
        out.append(mapping.get(d, d))
        i += 2
    return "".join(out)


RE_INLINE_HTML = re.compile(r"<[A-Za-z][^<>]*>")


def extract_js(src):
    texts, attrs, templates = [], [], []
    for raw, subst in iter_js_strings(src):
        if subst:
            templates.append(raw[:80])
            continue
        if not raw:
            continue
        lit = unescape_js(raw)
        if RE_INLINE_HTML.search(lit):
            t, a, tp = extract_html(lit)
            texts.extend(t)
            attrs.extend(a)
            templates.extend(tp)
            continue
        texts.append(lit)
    return texts, attrs, templates


# --------------------------------------------------------------------------- #
# 主流程
# --------------------------------------------------------------------------- #
def collect_files(web_dir):
    files = []
    for root, dirs, names in os.walk(web_dir):
        dirs.sort()
        for name in sorted(names):
            ext = os.path.splitext(name)[1].lower()
            if ext not in (".html", ".js"):
                continue
            p = os.path.join(root, name)
            rel = os.path.relpath(p, web_dir).replace("\\", "/")
            if is_vendor(rel):
                continue
            files.append((p, rel, ext))
    return files


def main():
    ap = argparse.ArgumentParser(description="扫描 AlecaFrame 界面英文文本，输出未覆盖的候选")
    ap.add_argument("--app-dir", default=None,
                    help="AlecaFrame 版本目录（含 web/）；默认自动探测 %%LOCALAPPDATA%%\\Overwolf\\Extensions\\<appId>\\<最新版本>")
    ap.add_argument("--dict-dir", default=DICT, help="词典目录（默认 repo/dict）")
    ap.add_argument("--out", default=OUT, help="输出 TSV（默认 dict/gap-candidates.tsv）")
    ap.add_argument("--min-count", type=int, default=1, help="只输出出现次数 >= N 的候选")
    ap.add_argument("--limit", type=int, default=0, help="最多输出 N 条（0 = 不限）")
    ap.add_argument("--show-covered", action="store_true", help="stdout 展示已覆盖样例")
    args = ap.parse_args()

    app_dir = args.app_dir or default_app_dir()
    web_dir = resolve_web_dir(app_dir)
    if not web_dir:
        sys.exit("找不到 AlecaFrame web 目录；请用 --app-dir 指定版本目录（如 "
                 "%%LOCALAPPDATA%%\\Overwolf\\Extensions\\%s\\3.0.6）" % APP_ID)

    known, layer_stats = load_known(args.dict_dir)
    files = collect_files(web_dir)
    if not files:
        sys.exit("在 %s 下没有找到 html/js 文件" % web_dir)

    counts = {}
    sources = {}
    per_kind = {"html_text": 0, "html_attr": 0, "js_string": 0}
    raw_total = noise = covered = templates = 0
    covered_samples = []
    files_by_kind = {"html": 0, "js": 0}

    for path, rel, ext in files:
        try:
            src = open(path, encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        if ext == ".html":
            files_by_kind["html"] += 1
            texts, attrs, tpl = extract_html(src)
            kinds = (("html_text", texts), ("html_attr", attrs))
        else:
            files_by_kind["js"] += 1
            texts, attrs, tpl = extract_js(src)
            kinds = (("js_string", texts), ("js_string", attrs))
        templates += len(tpl)
        for kind, items in kinds:
            for raw in items:
                raw_total += 1
                cand = classify(raw)
                if not cand:
                    noise += 1
                    continue
                per_kind[kind] += 1
                if cand in known:
                    covered += 1
                    if args.show_covered and len(covered_samples) < 30:
                        covered_samples.append(cand)
                    continue
                counts[cand] = counts.get(cand, 0) + 1
                lst = sources.setdefault(cand, [])
                if rel not in lst and len(lst) < 3:
                    lst.append(rel)

    rows = [(c, n) for c, n in counts.items() if n >= args.min_count]
    rows.sort(key=lambda r: (-r[1], r[0]))
    if args.limit and len(rows) > args.limit:
        rows = rows[:args.limit]

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8", newline="\n") as f:
        for cand, n in rows:
            f.write("%s\t%d\t%s\n" % (cand, n, ";".join(sources.get(cand, []))))

    bucketed = [(1, 1), (2, 3), (4, 9), (10, 49), (50, 10 ** 9)]

    def bucket_label(lo, hi):
        if lo == hi == 1:
            return "1"
        if hi >= 10 ** 9:
            return "%d+" % lo
        return "%d-%d" % (lo, hi)

    print("app dir      : %s" % app_dir)
    print("web dir      : %s" % web_dir)
    print("dict dir     : %s" % os.path.abspath(args.dict_dir))
    print("known keys   : %d 条 / %d 个唯一键（空白归一后）"
          % (sum(n for _, n in layer_stats), len(known)))
    for name, n in layer_stats:
        print("  layer %-32s %6d" % (name, n))
    print("files        : html=%d js=%d（已排除第三方库与汉化补丁自身）"
          % (files_by_kind["html"], files_by_kind["js"]))
    print("raw strings  : %d" % raw_total)
    print("  classified : html_text=%d html_attr=%d js_string=%d"
          % (per_kind["html_text"], per_kind["html_attr"], per_kind["js_string"]))
    print("  noise      : %d" % noise)
    print("  covered    : %d" % covered)
    print("  templates  : %d（含 {{}} / ${} 的动态文本，词典无法精确匹配，另计）" % templates)
    print("uncovered    : %d 个唯一候选（min-count=%d 后 %d 条）"
          % (len(counts), args.min_count, len(rows)))
    print("count buckets: " + " ".join(
        "%s=%d" % (bucket_label(lo, hi),
                   sum(1 for n in counts.values() if lo <= n <= hi))
        for (lo, hi) in bucketed))
    if covered_samples:
        print("covered samples: " + " | ".join(covered_samples[:15]))
    print("wrote        : %s" % args.out)
    print("top 15:")
    for cand, n in rows[:15]:
        print("  %3d  %s" % (n, cand))


if __name__ == "__main__":
    main()
