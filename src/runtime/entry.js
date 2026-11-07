/* AlecaFrame-ZH runtime · entry
 * Composition root: builds the dictionary index and translator, exposes the
 * compatibility globals, then starts DOM translation.
 */
(function (root) {
  "use strict";

  const runtime = (root.__AFCN_RUNTIME__ = root.__AFCN_RUNTIME__ || {});
  if (root.__AFCN__) return;

  const dict = root.__AFCN_DICT__ || {};
  const index = runtime.dictIndex.buildIndex(dict);
  const composites = runtime.composite ? [runtime.composite.translateComposite] : [];
  const translator = runtime.translate.createTranslator(index, {
    composites: composites,
    rules: runtime.rules ? runtime.rules.list : [],
  });

  root.__AFCN__ = true;
  root.__AFCN_TRANSLATE__ = translator.translate;
  runtime.translator = translator;
  runtime.entries = index.map.size;

  const dom = runtime.dom.create({
    translate: translator.translate,
    entries: index.map.size,
    skipSelector: ".archonEffectRow p, .archonRecipeCard p, .archonDetailSlot p, .archonFrameCard small, .archonFrameEffects span, .archonFrameEffects small",
  });

  if (typeof document === "undefined") {
    return;
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", dom.start, { once: true });
  } else {
    dom.start();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
