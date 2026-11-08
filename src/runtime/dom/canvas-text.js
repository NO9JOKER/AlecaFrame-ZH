/* AlecaFrame-ZH runtime · dom.canvas-text
 * Canvas 2D text translation. Chart legends, tooltips, axis ticks and custom
 * canvas labels are painted straight onto the canvas, so the DOM layer never
 * sees them; this host module wraps fillText/strokeText/measureText on the 2D
 * context prototype (or an injected target) and routes strings through
 * translate(). Receives translate() from entry.
 */
(function (root) {
  "use strict";

  const runtime = (root.__AFCN_RUNTIME__ = root.__AFCN_RUNTIME__ || {});
  const WRAPPED = "__afcnCanvasTextWrapped";
  const METHODS = ["fillText", "strokeText", "measureText"];

  function defaultTarget() {
    try {
      const ctor = root.CanvasRenderingContext2D;
      return ctor && ctor.prototype ? ctor.prototype : null;
    } catch (_) {
      return null;
    }
  }

  function create(options) {
    const opts = options || {};
    const translate = opts.translate;
    if (typeof translate !== "function") {
      throw new Error("canvasText.create requires translate()");
    }
    const target = opts.target === undefined ? defaultTarget() : opts.target;

    let installed = false;

    // Exactly one translate() call per string. Non-strings, misses (null), and
    // translations equal to the original keep the host text unchanged; a throw
    // from translate() must never reach the host drawing call.
    function translateText(text) {
      if (typeof text !== "string") return text;
      try {
        const next = translate(text);
        return typeof next === "string" && next !== text ? next : text;
      } catch (_) {
        return text;
      }
    }

    function wrap(original) {
      const wrapper = function (text) {
        let next = text;
        try {
          next = translateText(text);
        } catch (_) {
          next = text; // belt and braces: never break the host draw
        }
        if (next === text) return original.apply(this, arguments);
        const args = Array.prototype.slice.call(arguments);
        args[0] = next;
        return original.apply(this, args);
      };
      wrapper[WRAPPED] = true;
      return wrapper;
    }

    // Idempotent: a second install() is a no-op. Environments without a canvas
    // (Node tests, non-rendering windows) get a safe no-op instead of a throw.
    function install() {
      if (installed) return false;
      if (!target) return false;
      let count = 0;
      for (const method of METHODS) {
        let original;
        try {
          original = target[method];
        } catch (_) {
          continue;
        }
        if (typeof original !== "function" || original[WRAPPED]) continue;
        try {
          target[method] = wrap(original);
          count++;
        } catch (_) {
          // Read-only host prototype: keep the original method.
        }
      }
      installed = count > 0;
      return installed;
    }

    return { install: install, translateText: translateText };
  }

  runtime.canvasText = { create: create };
})(typeof globalThis !== "undefined" ? globalThis : this);
