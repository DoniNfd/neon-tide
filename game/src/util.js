// NEON TIDE — shared utilities: seeded RNG, math helpers, tiny event-free toolkit.
// Everything in the game hangs off the global NT namespace so the same files run
// in a browser (classic scripts) and inside the Node screenshot/smoke harnesses.
'use strict';
var NT = NT || {};

// Deterministic RNG (mulberry32). The whole city and every staged scene derive
// from one seed, so a given seed always produces the same Solenne City.
NT.makeRng = function (seed) {
  var a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Stable integer hash of two coordinates — used for window patterns and other
// decoration that must look identical in the browser and in rendered shots.
NT.hash2 = function (x, y) {
  var h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

NT.clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
NT.lerp = function (a, b, t) { return a + (b - a) * t; };
NT.dist2 = function (ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
NT.dist = function (ax, ay, bx, by) { return Math.sqrt(NT.dist2(ax, ay, bx, by)); };

// Shortest signed angular difference from a to b, in (-PI, PI].
NT.angDiff = function (a, b) {
  var d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};
NT.angLerp = function (a, b, t) { return a + NT.angDiff(a, b) * t; };

// Circle vs axis-aligned rect overlap test.
NT.circleRect = function (cx, cy, r, rc) {
  var nx = NT.clamp(cx, rc.x, rc.x + rc.w), ny = NT.clamp(cy, rc.y, rc.y + rc.h);
  return NT.dist2(cx, cy, nx, ny) < r * r;
};

// Format a dollar amount the way the HUD shows it: $1,250.
NT.money = function (n) {
  n = Math.round(n);
  var s = String(Math.abs(n)), out = '';
  while (s.length > 3) { out = ',' + s.slice(-3) + out; s = s.slice(0, -3); }
  return (n < 0 ? '-$' : '$') + s + out;
};

// Format a game-clock minute count as HH:MM.
NT.clockText = function (mins) {
  mins = ((Math.floor(mins) % 1440) + 1440) % 1440;
  var h = Math.floor(mins / 60), m = mins % 60;
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
};
