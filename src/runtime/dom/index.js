/* AlecaFrame-ZH runtime · dom
 * DOM translation: text nodes, attributes, MutationObserver and riven context.
 * Host-only module; receives translate() from entry.
 */
(function (root) {
  "use strict";

  const runtime = (root.__AFCN_RUNTIME__ = root.__AFCN_RUNTIME__ || {});
  const helpers = runtime.normalize;
  if (!helpers) throw new Error("dom requires core.normalize");

  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE", "NOSCRIPT", "OPTION"]);
  const ATTRS = ["placeholder", "title", "aria-label", "data-tooltip", "data-tippy-content"];
  const DAMAGE_LABELS = new Set([
    "火焰", "冰冻", "寒冷", "毒素", "电击", "切割", "冲击", "穿刺",
    "爆炸", "磁力", "毒气", "病毒", "腐蚀", "辐射",
  ]);

  function rivenLabel(label) {
    if (label.indexOf("伤害") !== -1) return label;
    const fixed = label === "寒冷" ? "冰冻" : label;
    return DAMAGE_LABELS.has(fixed) ? fixed + "伤害" : label;
  }

  function inRivenContext(node) {
    let element = node ? node.parentNode : null;
    for (let depth = 0; element && depth < 8; depth++) {
      const cls = typeof element.className === "string" ? element.className : "";
      if (cls && cls.indexOf("riven") !== -1) return true;
      element = element.parentNode;
    }
    return false;
  }

  function create(options) {
    const opts = options || {};
    const translate = opts.translate;
    if (typeof translate !== "function") throw new Error("dom.start requires translate()");
    const skipSelector = opts.skipSelector || "";

    let translated = 0;

    function translateTextNode(node) {
      const raw = node.nodeValue;
      if (skipSelector) {
        const host = node.parentElement && node.parentElement.closest ? node.parentElement.closest(skipSelector) : null;
        if (host) return;
      }
      if (!raw || raw.length > 400) return;
      let next = translate(raw);
      if (inRivenContext(node)) {
        const trimmed = helpers.norm(raw);
        if (next === null) {
          const flat = trimmed.match(/^([+-]?\d[\d,]*(?:\.\d+)?)(s?)\s+([A-Za-z][^\d].*)$/);
          if (flat) {
            const label = translate(flat[3]);
            if (label !== null) next = flat[1] + (flat[2] ? " 秒" : " ") + rivenLabel(label);
          }
        } else {
          next = rivenLabel(next);
        }
        if (next === null && DAMAGE_LABELS.has(trimmed)) next = rivenLabel(trimmed);
      }
      if (next === null) return;
      const match = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
      const lead = match ? match[1] : "";
      const tail = match ? match[3] : "";
      const text = lead + next + tail;
      if (text !== raw) {
        node.nodeValue = text;
        translated++;
      }
    }

    function translateAttrs(element) {
      if (!element.getAttribute) return;
      for (const attr of ATTRS) {
        let value;
        try { value = element.getAttribute(attr); } catch (_) { continue; }
        if (!value) continue;
        const hit = translate(value);
        if (hit === null) continue;
        try { element.setAttribute(attr, hit); translated++; } catch (_) { /* ignore */ }
      }
    }

    function walk(node) {
      if (!node) return;
      if (node.nodeType === 3) { translateTextNode(node); return; }
      if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return;
      if (node.nodeType === 1) {
        if (SKIP_TAGS.has(node.tagName)) return;
        translateAttrs(node);
      }
      let walker;
      try {
        walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
          acceptNode(candidate) {
            if (candidate.nodeType === 1 && SKIP_TAGS.has(candidate.tagName)) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          },
        });
      } catch (_) { return; }
      let current;
      while ((current = walker.nextNode())) {
        if (current.nodeType === 3) translateTextNode(current);
        else translateAttrs(current);
      }
    }

    function scanAll() {
      try { walk(document.body || document.documentElement); } catch (_) { /* ignore */ }
      console.log("[AlecaFrame-ZH] translated nodes=" + translated + " entries=" + (opts.entries || 0));
    }

    function start() {
      if (typeof document === "undefined") return;
      console.log("[AFCN] starting, entries=" + (opts.entries || 0));
      walk(document.body || document.documentElement);
      try {
        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            if (mutation.type === "characterData" && mutation.target && mutation.target.nodeType === 3) {
              translateTextNode(mutation.target);
            } else if (mutation.type === "childList") {
              for (const added of mutation.addedNodes) {
                if (added.nodeType === 3) translateTextNode(added);
                else if (added.nodeType === 1) walk(added);
              }
            } else if (mutation.type === "attributes" && mutation.attributeName && mutation.target && mutation.target.nodeType === 1) {
              translateAttrs(mutation.target);
            }
          }
        });
        observer.observe(document.documentElement, {
          subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS,
        });
      } catch (_) { /* ignore */ }
      setTimeout(scanAll, 1500);
      setTimeout(scanAll, 4000);
      setTimeout(() => console.log("[AlecaFrame-ZH] loaded translated=" + translated + " entries=" + (opts.entries || 0)), 1200);
    }

    return { start: start, walk: walk, scanAll: scanAll, stats: () => ({ translated: translated }) };
  }

  runtime.dom = { create: create };
})(typeof globalThis !== "undefined" ? globalThis : this);
