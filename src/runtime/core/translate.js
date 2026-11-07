/* AlecaFrame-ZH runtime · core.translate
 * Pure translation decision chain:
 *   normalize -> exact -> ASCII lowercase -> composites -> rules -> null
 *
 * A composite is a function (text, translate) => string|null.
 * A rule is either a function (text, translate) => string|null or
 * an object { id, match(text, translate) => string|null }.
 */
(function (root) {
  "use strict";

  const runtime = (root.__AFCN_RUNTIME__ = root.__AFCN_RUNTIME__ || {});
  const helpers = runtime.normalize;
  const indexApi = runtime.dictIndex;
  if (!helpers || !indexApi) {
    throw new Error("core.translate requires core.normalize and core.dict-index");
  }

  function createTranslator(index, options) {
    if (!index || !(index.map instanceof Map) || !(index.lowerMap instanceof Map)) {
      throw new Error("createTranslator requires a built index");
    }
    const opts = options || {};
    const composites = Array.isArray(opts.composites) ? opts.composites : [];
    const rules = Array.isArray(opts.rules) ? opts.rules : [];

    function translate(text) {
      const key = helpers.norm(text);
      if (!key || !helpers.hasLatin(key)) return null;

      const exact = index.map.get(key);
      if (exact !== undefined) return exact;

      if (!helpers.hasCjk(key)) {
        const lower = index.lowerMap.get(key.toLowerCase());
        if (lower !== undefined) return lower;
      }

      for (const composite of composites) {
        const result = composite(key, translate);
        if (typeof result === "string") return result;
      }

      for (const rule of rules) {
        const result =
          typeof rule === "function" ? rule(key, translate) : rule.match(key, translate);
        if (typeof result === "string") return result;
      }

      return null;
    }

    return { translate: translate };
  }

  runtime.translate = { createTranslator: createTranslator };
})(typeof globalThis !== "undefined" ? globalThis : this);
