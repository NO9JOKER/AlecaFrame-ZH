/* AlecaFrame-ZH runtime · features.archon.text
 * Archon shard guide cells are rendered with v-html: inline damage icons split
 * the English sentence into several text nodes. The cell must be matched as one
 * string (exact-match dictionary), while the <img> icons have to survive when
 * the translation is written back.
 *
 * Pure helpers over DOM-like node objects (nodeType / nodeValue / tagName /
 * getAttribute / childNodes). No document access here; the archon pass in
 * features/search/runtime.js does the DOM read/write.
 */
(function (root) {
  "use strict";

  const runtime = (root.__AFCN_RUNTIME__ = root.__AFCN_RUNTIME__ || {});
  const features = (runtime.features = runtime.features || {});

  function isImage(node) {
    return node && node.nodeType === 1 && String(node.tagName).toUpperCase() === "IMG";
  }

  function imageLabel(node) {
    return String(node.getAttribute("alt") || node.getAttribute("title") || "").trim();
  }

  /**
   * Flatten one effect cell into ordered text / image parts.
   * @param {Element} element
   * @returns {Array<{type: "text", value: string}|{type: "img", node: Element, label: string}>}
   */
  function collectParts(element) {
    const parts = [];
    (function walk(node) {
      const children = node && node.childNodes;
      if (!children) return;
      for (const child of children) {
        if (child.nodeType === 3) {
          parts.push({ type: "text", value: child.nodeValue });
        } else if (child.nodeType === 1) {
          if (isImage(child)) parts.push({ type: "img", node: child, label: imageLabel(child) });
          else walk(child);
        }
      }
    })(element);
    return parts;
  }

  /**
   * Rebuild the cell text for dictionary lookup.
   *
   * The game data repeats the damage name after the icon, e.g.
   *   `+30% <img alt="Toxin"> Toxin Status Effect damage`.
   * Inserting the alt unconditionally produced `Toxin Toxin` and made every
   * v-html cell miss the exact-match dictionary, so the alt is only appended
   * when the surrounding text does not already contain it.
   */
  function cellText(parts) {
    const textOnly = parts
      .filter((part) => part.type === "text")
      .map((part) => part.value)
      .join("");
    let out = "";
    for (const part of parts) {
      if (part.type === "text") {
        out += part.value;
      } else if (part.label && textOnly.indexOf(part.label) === -1) {
        out += " " + part.label + " ";
      }
    }
    return out.replace(/\s+/g, " ").trim();
  }

  /**
   * Split the translated text back around the original icons so the card keeps
   * its inline damage symbols. Each icon is anchored to the translated damage
   * label (Toxin -> 毒素); an unknown label keeps the icon at the current
   * cursor, which never drops it.
   *
   * @param {Array<object>} parts from collectParts()
   * @param {string} translated
   * @param {(label: string) => (string|null)} translateLabel
   * @returns {Array<{type: "text", value: string}|{type: "img", node: Element}>}
   */
  function rebuild(parts, translated, translateLabel) {
    const nodes = [];
    let cursor = 0;
    for (const part of parts) {
      if (part.type !== "img") continue;
      let label = null;
      if (part.label && typeof translateLabel === "function") {
        const hit = translateLabel(part.label);
        if (typeof hit === "string" && hit) label = hit;
      }
      let index = label ? translated.indexOf(label, cursor) : -1;
      if (index < 0) index = cursor;
      nodes.push({ type: "text", value: translated.slice(cursor, index) });
      nodes.push({ type: "img", node: part.node });
      cursor = index;
    }
    nodes.push({ type: "text", value: translated.slice(cursor) });
    return nodes;
  }

  features.archon = { collectParts, cellText, rebuild };
})(typeof globalThis !== "undefined" ? globalThis : this);
