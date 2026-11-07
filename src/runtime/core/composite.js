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
    return match[1] + "，" + hit;
  }

  runtime.composite = { translateComposite: translateComposite };
})(typeof globalThis !== "undefined" ? globalThis : this);
