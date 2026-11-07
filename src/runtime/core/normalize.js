/* AlecaFrame-ZH runtime · core.normalize
 * Pure string helpers shared by the dictionary index and translator.
 * No window/document/host access.
 */
(function (root) {
  "use strict";

  const runtime = (root.__AFCN_RUNTIME__ = root.__AFCN_RUNTIME__ || {});

  function norm(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function hasCjk(value) {
    return /[\u3400-\u9fff]/.test(String(value == null ? "" : value));
  }

  function hasLatin(value) {
    return /[A-Za-z]/.test(String(value == null ? "" : value));
  }

  runtime.normalize = { norm: norm, hasCjk: hasCjk, hasLatin: hasLatin };
})(typeof globalThis !== "undefined" ? globalThis : this);
