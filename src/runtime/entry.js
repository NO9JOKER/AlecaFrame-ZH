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
  const page = runtime.adapters ? runtime.adapters.current() : null;
  root.__AFCN_PAGE__ = page;
  const pageFeatures = page && Array.isArray(page.features) ? page.features : ["translate"];

  const ARCHON_SKIP = ".archonEffectRow p, .archonRecipeCard p, .archonDetailSlot p, .archonFrameCard small, .archonFrameEffects span, .archonFrameEffects small";
  const dom = runtime.dom.create({
    translate: translator.translate,
    entries: index.map.size,
    skipSelector: pageFeatures.indexOf("archon") !== -1 ? ARCHON_SKIP : "",
  });

  // Chart legends/tooltips/axis labels are painted on the canvas 2D context and
  // are invisible to the DOM layer. Install the canvas text wrapper before the
  // host-only DOM startup branch; without a canvas environment it is a no-op.
  if (runtime.canvasText) {
    try {
      runtime.canvasText.create({ translate: translator.translate }).install();
    } catch (_) {
      /* canvas text translation must never break the page */
    }
  }

  if (typeof document === "undefined") {
    return;
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", dom.start, { once: true });
  } else {
    dom.start();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
