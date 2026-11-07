/* AlecaFrame-ZH runtime · adapters
 * Page context registry. Page file names live in pages.json; build injects the
 * registry as __AFCN_PAGES__ and this module only resolves the current file.
 */
(function (root) {
  "use strict";

  const runtime = (root.__AFCN_RUNTIME__ = root.__AFCN_RUNTIME__ || {});

  function basename(value) {
    const clean = String(value || "").split("?")[0].split("#")[0];
    return clean.slice(clean.lastIndexOf("/") + 1);
  }

  function current() {
    if (typeof root.location === "undefined" || !root.location) return null;
    const pages = Array.isArray(root.__AFCN_PAGES__) ? root.__AFCN_PAGES__ : [];
    const file = basename(root.location.pathname);
    for (const page of pages) {
      if (page && page.file === file) {
        return { id: page.id, file: page.file, adapter: page.adapter || null, features: page.features || [] };
      }
    }
    return null;
  }

  runtime.adapters = { current: current, basename: basename };
})(typeof globalThis !== "undefined" ? globalThis : this);
