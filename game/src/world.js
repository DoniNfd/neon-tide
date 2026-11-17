// NEON TIDE — Solenne City generation.
// A coastal grid city: 8x6 blocks between wide avenues, a bay along the south
// edge with piers and a lighthouse, and four districts with their own palettes
// and building styles. Generation is fully seeded: same seed, same city.
'use strict';

// Layout constants. Roads sit on a 240px pitch; each block is the 168px square
// left between them. The bay is a 150px water strip below the last avenue.
NT.GRID = {
  pitch: 240, road: 72, block: 168, cols: 8, rows: 6, bayH: 150,
};
NT.GRID.w = NT.GRID.cols * NT.GRID.pitch + NT.GRID.road;          // 1992
NT.GRID.h = NT.GRID.rows * NT.GRID.pitch + NT.GRID.road;          // 1512
NT.GRID.worldH = NT.GRID.h + NT.GRID.bayH;                        // 1662

NT.vRoadX = function (j) { return j * NT.GRID.pitch + NT.GRID.road / 2; }; // centre x of vertical road j (0..8)
NT.hRoadY = function (i) { return i * NT.GRID.pitch + NT.GRID.road / 2; }; // centre y of horizontal road i (0..6)
NT.blockRect = function (c, r) {
  return { x: c * NT.GRID.pitch + NT.GRID.road, y: r * NT.GRID.pitch + NT.GRID.road, w: NT.GRID.block, h: NT.GRID.block };
};

NT.DISTRICTS = [
  { name: 'The Heights',    short: 'HEIGHTS' },
  { name: 'Neon Mile',      short: 'NEON MILE' },
  { name: 'Marina District', short: 'MARINA' },
  { name: 'Canal Quarter',  short: 'CANAL' },
];
// District index: 0 NW, 1 NE, 2 SW, 3 SE. The bay reports as its own place.
NT.districtAt = function (x, y) {
  if (y >= NT.GRID.h) return { name: 'The Bay', short: 'THE BAY' };
  var east = x >= NT.GRID.w / 2, south = y >= NT.GRID.h / 2;
  return NT.DISTRICTS[(south ? 2 : 0) + (east ? 1 : 0)];
};

// Per-district building palettes: [wall, roof] pairs.
var PALETTES = [
  [ ['#cbb59a', '#8a6f52'], ['#d8c6a8', '#96795a'], ['#bfb098', '#7d6a50'], ['#e0d0b0', '#a0815e'] ], // Heights: sand houses
  [ ['#3d4457', '#232833'], ['#474f66', '#2a3040'], ['#383f52', '#20242e'], ['#4d4356', '#2e2838'] ], // Neon Mile: dark towers
  [ ['#9aa3a8', '#5f6a70'], ['#a8a090', '#6e685c'], ['#8f9aa0', '#59636b'], ['#b0a898', '#776f60'] ], // Marina: warehouses
  [ ['#7fa8a0', '#4d7268'], ['#8fb0a4', '#587a6e'], ['#749c96', '#466a62'], ['#9db5a8', '#617d6f'] ], // Canal: teal fronts
];
var NEON_TRIMS = ['#ff5da2', '#37e0c8', '#ffd23e', '#7a5cff', '#ff7a3e'];

NT.buildWorld = function (seed) {
  var rng = NT.makeRng(seed * 7919 + 13);
  var G = NT.GRID;
  var world = {
    seed: seed, buildings: [], props: [], piers: [], lamps: [],
    hospital: null, precinct: null, garage: null,
  };

  // Piers reaching into the bay: two marina docks west, one lighthouse pier east.
  world.piers = [
    { x: 196, y: G.h, w: 52, h: 118 },
    { x: 452, y: G.h, w: 52, h: 96 },
    { x: 1836, y: G.h, w: 64, h: 104 },
  ];
  world.lighthouse = { x: 1868, y: G.h + 118 };

  function addBuilding(c, r, bx, by, bw, bh, di, kind, name) {
    var pal = PALETTES[di][Math.floor(rng() * 4)];
    var b = {
      x: bx, y: by, w: bw, h: bh, district: di, kind: kind || 'block',
      wall: pal[0], roof: pal[1], name: name || null,
      trim: di === 1 ? NEON_TRIMS[Math.floor(rng() * NEON_TRIMS.length)] : null,
    };
    world.buildings.push(b);
    return b;
  }

  for (var r = 0; r < G.rows; r++) {
    for (var c = 0; c < G.cols; c++) {
      var di = (r >= 3 ? 2 : 0) + (c >= 4 ? 1 : 0);
      var rc = NT.blockRect(c, r);
      var ix = rc.x + 14, iy = rc.y + 14, iw = rc.w - 28, ih = rc.h - 28; // inside the sidewalk

      // Landmark blocks replace the generic fill.
      if (c === 1 && r === 1) {
        world.hospital = addBuilding(c, r, ix, iy, iw, ih, di, 'hospital', 'SOLENNE GENERAL');
        continue;
      }
      if (c === 6 && r === 1) {
        world.precinct = addBuilding(c, r, ix, iy, iw, ih, di, 'precinct', 'HARBOR PRECINCT');
        continue;
      }
      if (c === 1 && r === 4) {
        world.garage = addBuilding(c, r, ix, iy + 44, iw, ih - 44, di, 'garage', "FERRAN'S GARAGE");
        continue; // the rest of the block is the garage forecourt (open lot)
      }
      if (r === 5 && c <= 1) {
        // Marina dock lots: crates and a small dock office, mostly open ground.
        addBuilding(c, r, ix + 88, iy + 8, 52, 44, di, 'office', null);
        for (var k = 0; k < 4; k++) {
          world.props.push({ kind: 'crate', x: ix + 8 + (k % 2) * 30, y: iy + 66 + Math.floor(k / 2) * 30, s: 22 });
        }
        continue;
      }

      if (di === 0) {          // The Heights: four houses per block.
        var hw = 58, hh = 58, gap = iw - hw * 2;
        addBuilding(c, r, ix, iy, hw, hh, di, 'house');
        addBuilding(c, r, ix + hw + gap, iy, hw, hh, di, 'house');
        addBuilding(c, r, ix, iy + hh + gap, hw, hh, di, 'house');
        addBuilding(c, r, ix + hw + gap, iy + hh + gap, hw, hh, di, 'house');
        world.props.push({ kind: 'tree', x: ix + iw / 2, y: iy + ih / 2, s: 13 });
      } else if (di === 1) {   // Neon Mile: one tower or two slabs.
        if (rng() < 0.5) {
          addBuilding(c, r, ix + 10, iy + 10, iw - 20, ih - 20, di, 'tower');
        } else {
          addBuilding(c, r, ix, iy, iw, 60, di, 'slab');
          addBuilding(c, r, ix, iy + ih - 60, iw, 60, di, 'slab');
        }
      } else if (di === 2) {   // Marina District: two long warehouses.
        addBuilding(c, r, ix, iy, iw, 62, di, 'warehouse');
        addBuilding(c, r, ix, iy + ih - 62, iw, 62, di, 'warehouse');
      } else {                 // Canal Quarter: three mixed fronts.
        addBuilding(c, r, ix, iy, 64, ih, di, 'canal');
        addBuilding(c, r, ix + 76, iy, iw - 76, 62, di, 'canal');
        addBuilding(c, r, ix + 76, iy + ih - 62, iw - 76, 62, di, 'canal');
      }

      // Sidewalk dressing: trees in the Heights and Canal Quarter, benches by the marina.
      if (rng() < 0.75) {
        var px = rc.x + 8 + rng() * (rc.w - 16), py = (rng() < 0.5) ? rc.y + 7 : rc.y + rc.h - 7;
        world.props.push({ kind: di === 2 ? 'bench' : 'tree', x: px, y: py, s: di === 2 ? 10 : 11 + rng() * 4 });
      }
    }
  }

  // Street lamps at intersections, offset to the corners.
  for (var i = 0; i <= G.rows; i++) {
    for (var j = 0; j <= G.cols; j++) {
      world.lamps.push({ x: NT.vRoadX(j) + 30, y: NT.hRoadY(i) + 30 });
      world.lamps.push({ x: NT.vRoadX(j) - 30, y: NT.hRoadY(i) - 30 });
    }
  }
  return world;
};

// Is a point over water? The bay strip, minus the piers.
NT.inWater = function (world, x, y) {
  if (y < NT.GRID.h || y > NT.GRID.worldH) return false;
  for (var i = 0; i < world.piers.length; i++) {
    var p = world.piers[i];
    if (x >= p.x - 4 && x <= p.x + p.w + 4 && y >= p.y - 2 && y <= p.y + p.h) return false;
  }
  return true;
};

// Push a circle (cx, cy, r) out of every building and out of the water, and
// clamp it inside the world. Mutates and returns the point {x, y, hit} where
// hit reports whether any solid was touched (used for crash detection).
NT.collideCircle = function (world, cx, cy, r) {
  var hit = false;
  for (var i = 0; i < world.buildings.length; i++) {
    var b = world.buildings[i];
    if (cx + r < b.x || cx - r > b.x + b.w || cy + r < b.y || cy - r > b.y + b.h) continue;
    var nx = NT.clamp(cx, b.x, b.x + b.w), ny = NT.clamp(cy, b.y, b.y + b.h);
    var dx = cx - nx, dy = cy - ny, d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 0.0001) {
      var d = Math.sqrt(d2), push = (r - d) / d;
      cx += dx * push; cy += dy * push;
    } else {
      // Centre inside the rect: leave through the nearest face.
      var left = cx - b.x, right = b.x + b.w - cx, top = cy - b.y, bot = b.y + b.h - cy;
      var m = Math.min(left, right, top, bot);
      if (m === left) cx = b.x - r; else if (m === right) cx = b.x + b.w + r;
      else if (m === top) cy = b.y - r; else cy = b.y + b.h + r;
    }
  }
  if (NT.inWater(world, cx, cy)) {
    hit = true;
    // Nearest dry edge: north shore or a pier side.
    cy = NT.GRID.h - r;
    if (NT.inWater(world, cx, cy)) { cx = NT.clamp(cx, r, NT.GRID.w - r); cy = NT.GRID.h - r; }
  }
  if (cx < r) { cx = r; hit = true; }
  if (cy < r) { cy = r; hit = true; }
  if (cx > NT.GRID.w - r) { cx = NT.GRID.w - r; hit = true; }
  if (cy > NT.GRID.worldH - r) { cy = NT.GRID.worldH - r; hit = true; }
  return { x: cx, y: cy, hit: hit };
};

// A dry, on-land spawn helper: is this spot free of buildings and water?
NT.spotFree = function (world, x, y, r) {
  if (NT.inWater(world, x, y)) return false;
  for (var i = 0; i < world.buildings.length; i++) {
    if (NT.circleRect(x, y, r, world.buildings[i])) return false;
  }
  return true;
};
