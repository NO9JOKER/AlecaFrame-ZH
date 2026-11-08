/* AlecaFrame-ZH runtime · core.composite
 * "node, planet" composite text (e.g. "Lares, Mercury"): keep node English,
 * translate only the planet after the comma.
 */
(function (root) {
  "use strict";

  const runtime = (root.__AFCN_RUNTIME__ = root.__AFCN_RUNTIME__ || {});
  const helpers = runtime.normalize;
  if (!helpers) throw new Error("core.composite requires core.normalize");

  const PLANET_NAMES = new Set([
    "Earth", "Venus", "Mercury", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
    "Phobos", "Deimos", "Ceres", "Europa", "Eris", "Sedna", "Lua", "Void",
    "Kuva Fortress", "Zariman", "Duviri", "Orb Vallis", "Cambion Drift", "Plains of Eidolon",
    "Cetus", "Necralisk", "Hollvania", "Höllvania",
  ]);

  function translateComposite(text, translate) {
    const match = String(text || "").match(/^(.+?),\s*([^,]+)$/);
    if (!match) return null;
    const planet = helpers.norm(match[2]);
    if (!PLANET_NAMES.has(planet)) return null;
    const hit = translate(planet);
    if (hit === null) return null;
    let prefix = match[1];
    // 前缀可能是「状态词 + 节点名」（如 "Recording Lares"）：先整体试词条，再尝试
    // 前导 1–2 个词；其余部分（节点名）保持英文，与「只翻星球」策略一致。
    const whole = translate(prefix);
    if (typeof whole === "string") {
      prefix = whole;
    } else {
      const words = prefix.split(" ");
      const limit = Math.min(2, words.length - 1);
      for (let count = limit; count >= 1; count--) {
        const head = words.slice(0, count).join(" ");
        const headHit = translate(head);
        if (typeof headHit === "string") {
          prefix = headHit + " " + words.slice(count).join(" ");
          break;
        }
      }
    }
    return prefix + "，" + hit;
  }

  runtime.composite = { translateComposite: translateComposite };
})(typeof globalThis !== "undefined" ? globalThis : this);
