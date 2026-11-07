/* AlecaFrame-ZH runtime · core.dict-index
 * Builds the exact-match map and the ASCII lowercase fallback index.
 * First definition wins; no DOM/host access.
 */
(function (root) {
  "use strict";

  const runtime = (root.__AFCN_RUNTIME__ = root.__AFCN_RUNTIME__ || {});
  const helpers = runtime.normalize;
  if (!helpers) {
    throw new Error("core.dict-index requires core.normalize");
  }

  function buildIndex(dict) {
    const source = dict && typeof dict === "object" ? dict : {};
    const map = new Map();
    const lowerMap = new Map();

    for (const key of Object.keys(source)) {
      const value = source[key];
      if (typeof value !== "string" || !value) continue;
      const normalized = helpers.norm(key);
      if (!normalized || map.has(normalized)) continue;
      map.set(normalized, value);
      if (!helpers.hasCjk(normalized) && !lowerMap.has(normalized.toLowerCase())) {
        lowerMap.set(normalized.toLowerCase(), value);
      }
    }

    return { map: map, lowerMap: lowerMap };
  }

  runtime.dictIndex = { buildIndex: buildIndex };
})(typeof globalThis !== "undefined" ? globalThis : this);
