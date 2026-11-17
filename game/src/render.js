// NEON TIDE — rendering. Everything is drawn with a small, deliberate subset
// of Canvas2D (rects, paths, arcs, gradients, fillText) so the exact same code
// renders in Chrome and in the Node software-canvas used for the screenshots.
'use strict';

var CHARW = 0.62; // monospace advance estimate, as a fraction of font size
function textW(text, size) { return text.length * size * CHARW; }

function wrapText(text, size, maxW) {
  var words = text.split(' '), lines = [], line = '';
  for (var i = 0; i < words.length; i++) {
    var trial = line ? line + ' ' + words[i] : words[i];
    if (textW(trial, size) > maxW && line) { lines.push(line); line = words[i]; }
    else line = trial;
  }
  if (line) lines.push(line);
  return lines;
}

function font(size, bold) { return (bold ? '700 ' : '') + size + 'px "Courier New", monospace'; }

NT.draw = function (ctx, st) {
  st.uiButtons = [];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  drawWorld(ctx, st);
  if (st.mode === 'title') { drawTitle(ctx, st); return; }
  drawHud(ctx, st);
  if (st.paused) drawPause(ctx, st);
  else if (st.mode === 'busted') drawEndScreen(ctx, st, 'BUSTED', '#e0483e',
    'The Harbor Precinct thanks you for the donation.',
    'Fine paid: ' + NT.money(st.fine) + ' — you walk out the front door.', 'WALK OUT');
  else if (st.mode === 'wasted') drawEndScreen(ctx, st, 'WASTED', '#b03030',
    'Solenne General patches you up, no questions asked.',
    'Hospital bill: ' + NT.money(st.fine) + ' — try to land softer next time.', 'CHECK OUT');
  else if (st.mode === 'complete') drawComplete(ctx, st);
};

// ---------------------------------------------------------------- world ----
function drawWorld(ctx, st) {
  var G = NT.GRID, world = st.world;
  var shx = st.shake ? (st.rng() - 0.5) * st.shake : 0;
  var shy = st.shake ? (st.rng() - 0.5) * st.shake : 0;
  var camX = st.camera.x + shx, camY = st.camera.y + shy;
  ctx.save();
  ctx.translate(NT.VIEW.w / 2 - camX, NT.VIEW.h / 2 - camY);

  // Base ground + bay water.
  ctx.fillStyle = '#79866b';
  ctx.fillRect(camX - NT.VIEW.w / 2 - 40, camY - NT.VIEW.h / 2 - 40, NT.VIEW.w + 80, NT.VIEW.h + 80);
  var wg = ctx.createLinearGradient(0, G.h, 0, G.worldH);
  wg.addColorStop(0, '#2e6f8e'); wg.addColorStop(1, '#1d4e68');
  ctx.fillStyle = wg;
  // The bay runs past the east edge of the map: water to the view's edge.
  ctx.fillRect(-60, G.h, camX + NT.VIEW.w / 2 + 120, G.bayH);
  ctx.strokeStyle = '#7fc4d8'; ctx.globalAlpha = 0.35; ctx.lineWidth = 2;
  for (var wv = 0; wv < 12; wv++) {
    var wy = G.h + 14 + wv * 12;
    ctx.beginPath();
    for (var wx = (wv % 3) * 30; wx < G.w; wx += 90) {
      ctx.moveTo(wx, wy); ctx.lineTo(wx + 34, wy);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Piers and lighthouse.
  var i, p;
  for (i = 0; i < world.piers.length; i++) {
    p = world.piers[i];
    ctx.fillStyle = '#8a6f52';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = '#6e573f'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (var pl = p.y + 12; pl < p.y + p.h; pl += 14) { ctx.moveTo(p.x, pl); ctx.lineTo(p.x + p.w, pl); }
    ctx.stroke();
  }
  drawLighthouse(ctx, world.lighthouse);

  drawRoads(ctx, st);

  // Blocks: sidewalk slab, district ground, buildings, props.
  for (var r = 0; r < G.rows; r++) {
    for (var c = 0; c < G.cols; c++) {
      var rc = NT.blockRect(c, r);
      ctx.fillStyle = '#b7bab2';
      ctx.fillRect(rc.x, rc.y, rc.w, rc.h);
      var di = (r >= 3 ? 2 : 0) + (c >= 4 ? 1 : 0);
      ctx.fillStyle = ['#7d9b62', '#878b94', '#a29a86', '#86a294'][di];
      ctx.fillRect(rc.x + 6, rc.y + 6, rc.w - 12, rc.h - 12);
    }
  }
  for (i = 0; i < world.buildings.length; i++) drawBuilding(ctx, world.buildings[i], st);
  for (i = 0; i < world.props.length; i++) drawProp(ctx, world.props[i]);
  for (i = 0; i < world.lamps.length; i++) {
    var lp = world.lamps[i];
    ctx.fillStyle = '#3a3f45';
    ctx.fillRect(lp.x - 1.5, lp.y - 1.5, 3, 3);
    ctx.fillStyle = '#ffe9a3';
    ctx.beginPath(); ctx.arc(lp.x, lp.y, 2.2, 0, Math.PI * 2); ctx.fill();
  }

  drawMissionMarker(ctx, st);

  for (i = 0; i < st.cars.length; i++) drawCar(ctx, st.cars[i], st);
  for (i = 0; i < st.peds.length; i++) drawPed(ctx, st.peds[i]);
  if (!st.player.car && st.mode !== 'title') drawPlayer(ctx, st);

  // Tracers, particles, floating texts.
  for (i = 0; i < st.tracers.length; i++) {
    var tr = st.tracers[i];
    ctx.globalAlpha = NT.clamp(tr.t / 0.07, 0, 1);
    ctx.strokeStyle = '#ffe9a3'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(tr.x1, tr.y1); ctx.lineTo(tr.x2, tr.y2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (i = 0; i < st.particles.length; i++) {
    var q = st.particles[i];
    ctx.globalAlpha = NT.clamp(q.t, 0, 1);
    ctx.fillStyle = q.color;
    ctx.beginPath(); ctx.arc(q.x, q.y, q.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  for (i = 0; i < st.floats.length; i++) {
    var f = st.floats[i];
    ctx.globalAlpha = NT.clamp(f.t, 0, 1);
    ctx.font = font(17, true);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawRoads(ctx, st) {
  var G = NT.GRID, i, j, x, y;
  ctx.fillStyle = '#3b3f45';
  for (i = 0; i <= G.rows; i++) ctx.fillRect(0, i * G.pitch, G.w, G.road);
  for (j = 0; j <= G.cols; j++) ctx.fillRect(j * G.pitch, 0, G.road, G.h);
  // Shore road along the bay.
  ctx.fillStyle = '#c8b18a';
  ctx.fillRect(0, G.h - 4, G.w, 5);
  // Centre dashes.
  ctx.fillStyle = '#d8c95a';
  for (i = 0; i <= G.rows; i++) {
    y = NT.hRoadY(i);
    for (x = 14; x < G.w; x += 52) {
      if ((x % (G.pitch)) < G.road - 8) ctx.fillRect(x, y - 1.5, 26, 3);
    }
  }
  for (j = 0; j <= G.cols; j++) {
    x = NT.vRoadX(j);
    for (y = 14; y < G.h; y += 52) {
      if ((y % (G.pitch)) < G.road - 8) ctx.fillRect(x - 1.5, y, 3, 26);
    }
  }
  // Crosswalks at intersections.
  ctx.fillStyle = '#e8e8e2';
  ctx.globalAlpha = 0.5;
  for (i = 0; i <= G.rows; i++) {
    for (j = 0; j <= G.cols; j++) {
      var cx = NT.vRoadX(j), cy = NT.hRoadY(i), s;
      for (s = -24; s <= 24; s += 12) {
        ctx.fillRect(cx + s - 4, cy - G.road / 2 + 3, 8, 5);
        ctx.fillRect(cx + s - 4, cy + G.road / 2 - 8, 8, 5);
      }
    }
  }
  ctx.globalAlpha = 1;
}

function drawLighthouse(ctx, lh) {
  ctx.fillStyle = '#5d5648';
  ctx.beginPath(); ctx.arc(lh.x, lh.y, 17, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8e4da';
  ctx.fillRect(lh.x - 8, lh.y - 34, 16, 34);
  ctx.fillStyle = '#d84a3e';
  ctx.fillRect(lh.x - 8, lh.y - 26, 16, 7);
  ctx.fillRect(lh.x - 8, lh.y - 12, 16, 7);
  ctx.fillStyle = '#2c3036';
  ctx.fillRect(lh.x - 6, lh.y - 42, 12, 8);
  var glow = ctx.createRadialGradient(lh.x, lh.y - 38, 2, lh.x, lh.y - 38, 44);
  glow.addColorStop(0, 'rgba(255,233,163,0.85)');
  glow.addColorStop(1, 'rgba(255,233,163,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(lh.x, lh.y - 38, 44, 0, Math.PI * 2); ctx.fill();
}

function drawBuilding(ctx, b, st) {
  // Drop shadow, walls, roof inset, then district dressing.
  ctx.fillStyle = 'rgba(20,22,26,0.28)';
  ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);
  ctx.fillStyle = b.wall;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.fillStyle = b.roof;
  var inset = Math.min(10, b.w * 0.12);
  ctx.fillRect(b.x + inset, b.y + inset, b.w - inset * 2, b.h - inset * 2);

  // Windows: a deterministic grid per building.
  var cols = Math.max(1, Math.floor(b.w / 22)), rows = Math.max(1, Math.floor(b.h / 22));
  for (var wy = 0; wy < rows; wy++) {
    for (var wx = 0; wx < cols; wx++) {
      var lit = NT.hash2(b.x + wx * 31, b.y + wy * 47) > (b.district === 1 ? 0.35 : 0.62);
      ctx.fillStyle = lit ? (b.district === 1 ? '#ffd98a' : '#cfe4ea') : '#2c3138';
      ctx.fillRect(b.x + 7 + wx * 22, b.y + 7 + wy * 22, 9, 7);
    }
  }
  if (b.trim) { // Neon Mile signage strip
    ctx.fillStyle = b.trim;
    ctx.fillRect(b.x, b.y + b.h - 6, b.w, 4);
    ctx.globalAlpha = 0.5;
    ctx.fillRect(b.x, b.y + b.h - 11, b.w, 2);
    ctx.globalAlpha = 1;
  }
  if (b.kind === 'warehouse') {
    ctx.strokeStyle = 'rgba(30,30,30,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (var sx = b.x + 16; sx < b.x + b.w; sx += 22) { ctx.moveTo(sx, b.y + 4); ctx.lineTo(sx, b.y + b.h - 4); }
    ctx.stroke();
  }
  if (b.name) {
    ctx.font = font(13, true);
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(16,18,22,0.75)';
    var tw = textW(b.name, 13) + 14;
    ctx.fillRect(b.x + b.w / 2 - tw / 2, b.y - 22, tw, 18);
    ctx.fillStyle = b.kind === 'precinct' ? '#9fc2ff' : (b.kind === 'hospital' ? '#ff9d94' : '#ffd23e');
    ctx.fillText(b.name, b.x + b.w / 2, b.y - 6);
  }
}

function drawProp(ctx, p) {
  if (p.kind === 'tree') {
    ctx.fillStyle = '#6e573f';
    ctx.fillRect(p.x - 2, p.y - 2, 4, 6);
    ctx.fillStyle = '#4d7d3a';
    ctx.beginPath(); ctx.arc(p.x, p.y - 4, p.s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5d9147';
    ctx.beginPath(); ctx.arc(p.x - p.s * 0.4, p.y - p.s * 0.5, p.s * 0.6, 0, Math.PI * 2); ctx.fill();
  } else if (p.kind === 'bench') {
    ctx.fillStyle = '#7a5c3e';
    ctx.fillRect(p.x - 11, p.y - 3, 22, 6);
    ctx.fillStyle = '#5d4630';
    ctx.fillRect(p.x - 11, p.y - 7, 22, 3);
  } else if (p.kind === 'crate') {
    ctx.fillStyle = '#b08b57';
    ctx.fillRect(p.x, p.y, p.s, p.s);
    ctx.strokeStyle = '#7d6238'; ctx.lineWidth = 2;
    ctx.strokeRect(p.x + 1, p.y + 1, p.s - 2, p.s - 2);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.s, p.y + p.s);
    ctx.moveTo(p.x + p.s, p.y); ctx.lineTo(p.x, p.y + p.s);
    ctx.stroke();
  }
}

function drawMissionMarker(ctx, st) {
  var m = st.mission;
  if (!m.target || st.mode !== 'play') return;
  var t = m.target;
  var pulse = 1 + Math.sin(st.time * 4) * 0.16;
  var beam = ctx.createLinearGradient(0, t.y - 130, 0, t.y);
  beam.addColorStop(0, 'rgba(255,210,62,0)');
  beam.addColorStop(1, 'rgba(255,210,62,0.4)');
  ctx.fillStyle = beam;
  ctx.fillRect(t.x - 9, t.y - 130, 18, 130);
  ctx.strokeStyle = '#ffd23e'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(t.x, t.y, t.r * 0.55 * pulse, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 0.35;
  ctx.beginPath(); ctx.arc(t.x, t.y, t.r * 0.8 * pulse, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.font = font(14, true);
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillStyle = '#ffd23e';
  ctx.fillText(t.label.toUpperCase(), t.x, t.y - t.r * 0.8 - 8);
}

function drawCar(ctx, car, st) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  var L = car.len, W = car.wid;
  ctx.fillStyle = 'rgba(15,16,20,0.3)';
  ctx.fillRect(-L / 2 + 3, -W / 2 + 4, L, W);
  ctx.fillStyle = car.kind === 'police' ? '#e8ecf2' : car.color;
  ctx.fillRect(-L / 2, -W / 2, L, W);
  if (car.kind === 'police') {
    ctx.fillStyle = '#2b4d9b';
    ctx.fillRect(-L * 0.08, -W / 2, L * 0.2, W);
  }
  // Cabin and glass.
  ctx.fillStyle = '#22262e';
  ctx.fillRect(-L * 0.16, -W / 2 + 3, L * 0.36, W - 6);
  ctx.fillStyle = '#7fb6c9';
  ctx.fillRect(L * 0.13, -W / 2 + 4, L * 0.08, W - 8);
  ctx.fillRect(-L * 0.24, -W / 2 + 4, L * 0.07, W - 8);
  // Lights.
  ctx.fillStyle = '#fff3b0';
  ctx.fillRect(L / 2 - 3, -W / 2 + 2, 3, 4);
  ctx.fillRect(L / 2 - 3, W / 2 - 6, 3, 4);
  ctx.fillStyle = '#e0483e';
  ctx.fillRect(-L / 2, -W / 2 + 2, 3, 4);
  ctx.fillRect(-L / 2, W / 2 - 6, 3, 4);
  if (car.kind === 'police') { // light bar, alternating with time
    var phase = Math.floor(st.time * 6) % 2 === 0;
    ctx.fillStyle = phase ? '#ff4444' : '#7a1616';
    ctx.fillRect(-6, -W / 2 + 3, 6, W / 2 - 3);
    ctx.fillStyle = phase ? '#16266e' : '#4466ff';
    ctx.fillRect(0, 0, 6, W / 2 - 3);
  }
  if (car.health < 55) { // damage shading
    ctx.globalAlpha = (55 - car.health) / 90;
    ctx.fillStyle = '#1c1e22';
    ctx.fillRect(-L / 2, -W / 2, L * 0.5, W);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  if (car.kind === 'target' && st.mission.step === 0) {
    ctx.font = font(13, true);
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#ffd23e';
    ctx.fillText('THE MARK', car.x, car.y - 26 + Math.sin(st.time * 3) * 3);
  }
}

function drawFigure(ctx, x, y, angle, shirt, walkPhase, down) {
  ctx.save();
  ctx.translate(x, y);
  if (down) ctx.rotate(Math.PI / 2);
  else ctx.rotate(angle);
  ctx.fillStyle = 'rgba(15,16,20,0.25)';
  ctx.beginPath(); ctx.arc(2, 3, 9, 0, Math.PI * 2); ctx.fill();
  if (!down) { // legs swing with the walk cycle
    ctx.strokeStyle = '#2e3138'; ctx.lineWidth = 3.4;
    var sw = Math.sin(walkPhase) * 5;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(-3 + sw * 0.4, sw);
    ctx.moveTo(0, 0); ctx.lineTo(-3 - sw * 0.4, -sw);
    ctx.stroke();
  }
  ctx.fillStyle = shirt;
  ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8b98d';
  ctx.beginPath(); ctx.arc(2.5, 0, 4.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawPed(ctx, pd) {
  drawFigure(ctx, pd.x, pd.y, pd.angle, pd.color, pd.walk, pd.state === 'down');
  if (pd.state === 'flee') {
    ctx.font = font(13, true);
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('!', pd.x, pd.y - 12);
  }
}

function drawPlayer(ctx, st) {
  var p = st.player;
  drawFigure(ctx, p.x, p.y, p.angle, '#1f8a80', p.walk, false);
  // Marisol's signature magenta scarf dot + gun when aiming.
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#ff5da2';
  ctx.beginPath(); ctx.arc(-2, 0, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#191c20';
  ctx.fillRect(6, -1.6, 10, 3.2);
  ctx.restore();
}

// ------------------------------------------------------------------ HUD ----
function star(ctx, cx, cy, r, filled, color) {
  ctx.beginPath();
  for (var i = 0; i < 10; i++) {
    var rad = i % 2 === 0 ? r : r * 0.45;
    var a = -Math.PI / 2 + i * Math.PI / 5;
    var px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  if (filled) { ctx.fillStyle = color; ctx.fill(); }
  else { ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.5; ctx.stroke(); }
}

function panel(ctx, x, y, w, h, alpha) {
  ctx.globalAlpha = alpha === undefined ? 0.72 : alpha;
  ctx.fillStyle = '#101318';
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
}

function drawHud(ctx, st) {
  var p = st.player;
  // Health + identity, top-left.
  panel(ctx, 16, 14, 252, 64);
  ctx.font = font(13, true); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = '#e8e4da';
  ctx.fillText('MARISOL VEGA', 26, 20);
  ctx.fillStyle = '#3a3f45';
  ctx.fillRect(26, 42, 190, 13);
  ctx.fillStyle = p.hp > 50 ? '#57c96b' : (p.hp > 25 ? '#e8b62a' : '#e0483e');
  ctx.fillRect(26, 42, 190 * NT.clamp(p.hp, 0, 100) / 100, 13);
  ctx.font = font(12, false);
  ctx.fillStyle = '#c8ccd2';
  ctx.fillText(Math.ceil(Math.max(0, p.hp)) + ' HP', 222, 42);

  // Money, under the health panel.
  ctx.font = font(24, true);
  ctx.fillStyle = '#7be495';
  ctx.fillText(NT.money(st.money), 26, 84);

  // Clock + district, top-centre.
  var district = NT.districtAt(p.x, p.y);
  var label = NT.clockText(st.clockMin) + '  ·  ' + district.name.toUpperCase();
  panel(ctx, NT.VIEW.w / 2 - textW(label, 14) / 2 - 14, 14, textW(label, 14) + 28, 30);
  ctx.font = font(14, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e8e4da';
  ctx.fillText(label, NT.VIEW.w / 2, 30);

  // Wanted stars, top-right.
  var stars = NT.stars(st);
  for (var i = 0; i < 5; i++) {
    star(ctx, NT.VIEW.w - 34 - i * 34, 32, 13, i < stars, '#ffd23e');
  }
  if (st.bust > 0.02 && stars > 0) {
    ctx.fillStyle = '#3a3f45';
    ctx.fillRect(NT.VIEW.w - 186, 52, 170, 9);
    ctx.fillStyle = '#e0483e';
    ctx.fillRect(NT.VIEW.w - 186, 52, 170 * st.bust, 9);
    ctx.font = font(11, true); ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#ff9d94';
    ctx.fillText('BUST INCOMING', NT.VIEW.w - 16, 64);
  }

  drawMinimap(ctx, st);

  // Vehicle readout, bottom-right.
  if (p.car) {
    var spd = Math.round(Math.abs(p.car.speed) * 0.32);
    panel(ctx, NT.VIEW.w - 236, NT.VIEW.h - 62, 220, 46);
    ctx.font = font(14, true); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e8e4da';
    ctx.fillText(p.car.name.toUpperCase(), NT.VIEW.w - 28, NT.VIEW.h - 46);
    ctx.font = font(12, false); ctx.fillStyle = '#9fd8ff';
    ctx.fillText(spd + ' KM/H · HULL ' + Math.max(0, Math.ceil(p.car.health)) + '%', NT.VIEW.w - 28, NT.VIEW.h - 26);
  }

  // Objective, bottom-centre.
  if (st.objective) {
    var lines = wrapText(st.objective, 14, 430);
    var w = 460, h = 34 + lines.length * 18 + (st.objectiveSub ? 16 : 0);
    panel(ctx, NT.VIEW.w / 2 - w / 2, NT.VIEW.h - h - 14, w, h);
    ctx.font = font(12, true); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffd23e';
    ctx.fillText('OBJECTIVE', NT.VIEW.w / 2 - w / 2 + 14, NT.VIEW.h - h - 14 + 8);
    ctx.font = font(14, false); ctx.fillStyle = '#f2efe8';
    for (var li = 0; li < lines.length; li++) {
      ctx.fillText(lines[li], NT.VIEW.w / 2 - w / 2 + 14, NT.VIEW.h - h - 14 + 26 + li * 18);
    }
    if (st.objectiveSub) {
      ctx.font = font(12, false); ctx.fillStyle = '#9aa3ad';
      ctx.fillText(st.objectiveSub, NT.VIEW.w / 2 - w / 2 + 14, NT.VIEW.h - 34);
    }
    if (st.mission.timer > 0 && st.mission.idx === 2) {
      ctx.fillStyle = '#3a3f45';
      ctx.fillRect(NT.VIEW.w / 2 - w / 2 + 14, NT.VIEW.h - 22, w - 28, 5);
      ctx.fillStyle = st.mission.timer < 25 ? '#e0483e' : '#37e0c8';
      ctx.fillRect(NT.VIEW.w / 2 - w / 2 + 14, NT.VIEW.h - 22, (w - 28) * NT.clamp(st.mission.timer / 100, 0, 1), 5);
    }
  }

  // Toast, top-centre under the clock.
  if (st.toast) {
    ctx.globalAlpha = NT.clamp(st.toast.t, 0, 1) * 0.92;
    ctx.font = font(16, true);
    var tw = textW(st.toast.text, 16) + 34;
    panel(ctx, NT.VIEW.w / 2 - tw / 2, 56, tw, 34, 0.85);
    ctx.fillStyle = '#ffd23e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(st.toast.text.toUpperCase(), NT.VIEW.w / 2, 74);
    ctx.globalAlpha = 1;
  }

  if (st.dialogue.length) drawDialogue(ctx, st);
}

function drawMinimap(ctx, st) {
  var mw = 196, mh = 158, x0 = 16, y0 = NT.VIEW.h - mh - 16;
  panel(ctx, x0 - 4, y0 - 4, mw + 8, mh + 8, 0.8);
  var sx = mw / NT.GRID.w, sy = mh / NT.GRID.worldH;
  ctx.fillStyle = '#272e38';
  ctx.fillRect(x0, y0, mw, mh);
  ctx.fillStyle = '#2e6f8e';
  ctx.fillRect(x0, y0 + NT.GRID.h * sy, mw, NT.GRID.bayH * sy);
  ctx.fillStyle = '#4a5058';
  var i;
  for (i = 0; i <= NT.GRID.rows; i++) ctx.fillRect(x0, y0 + NT.hRoadY(i) * sy - 1, mw, 2);
  for (i = 0; i <= NT.GRID.cols; i++) ctx.fillRect(x0 + NT.vRoadX(i) * sx - 1, y0, 2, NT.GRID.h * sy);
  ctx.fillStyle = '#93a583';
  for (i = 0; i < st.world.buildings.length; i++) {
    var b = st.world.buildings[i];
    ctx.fillRect(x0 + b.x * sx, y0 + b.y * sy, Math.max(2, b.w * sx), Math.max(2, b.h * sy));
  }
  function dot(x, y, color, r) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x0 + x * sx, y0 + y * sy, r, 0, Math.PI * 2); ctx.fill();
  }
  for (i = 0; i < st.cars.length; i++) {
    var c = st.cars[i];
    if (c.kind === 'police') dot(c.x, c.y, Math.floor(st.time * 4) % 2 ? '#ff5555' : '#5599ff', 3);
    else if (c === st.player.car) { /* player drawn below */ }
    else dot(c.x, c.y, 'rgba(220,224,230,0.55)', 1.6);
  }
  var m = st.mission;
  if (m.target && st.mode === 'play') {
    var pulse = 3 + Math.sin(st.time * 5) * 1.2;
    dot(m.target.x, m.target.y, '#ffd23e', pulse + 1.5);
  }
  var p = st.player;
  dot(p.x, p.y, '#ffffff', 3.4);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x0 + p.x * sx, y0 + p.y * sy);
  ctx.lineTo(x0 + (p.x + Math.cos(p.angle) * 26) * sx, y0 + (p.y + Math.sin(p.angle) * 26) * sy);
  ctx.stroke();
}

function drawDialogue(ctx, st) {
  var d = st.dialogue[0];
  var w = 720, x = NT.VIEW.w / 2 - w / 2, y = NT.VIEW.h - 208;
  var lines = wrapText(d.text, 15, w - 36);
  var h = 44 + lines.length * 20;
  panel(ctx, x, y, w, h, 0.88);
  ctx.font = font(13, true); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = d.who === 'MARISOL' ? '#37e0c8' : '#ffd23e';
  ctx.fillText(d.who, x + 18, y + 10);
  ctx.font = font(15, false); ctx.fillStyle = '#f2efe8';
  for (var i = 0; i < lines.length; i++) ctx.fillText(lines[i], x + 18, y + 30 + i * 20);
  ctx.font = font(11, false); ctx.textAlign = 'right'; ctx.fillStyle = '#9aa3ad';
  ctx.fillText('E ▸', x + w - 14, y + h - 18);
}

// -------------------------------------------------------------- screens ----
function button(ctx, st, id, label, x, y, w, h, primary) {
  ctx.fillStyle = primary ? '#ffd23e' : '#232830';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = primary ? '#fff3b0' : '#5a6270'; ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.font = font(17, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = primary ? '#191c20' : '#e8e4da';
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  st.uiButtons.push({ id: id, x: x, y: y, w: w, h: h });
}

function neonTitle(ctx, text, cx, y, size) {
  ctx.font = font(size, true);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#ff5da2';
  ctx.fillText(text, cx - 3, y);
  ctx.fillStyle = '#37e0c8';
  ctx.fillText(text, cx + 3, y);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#fdf6e3';
  ctx.fillText(text, cx, y);
}

function drawTitle(ctx, st) {
  var grad = ctx.createLinearGradient(0, 0, 0, NT.VIEW.h);
  grad.addColorStop(0, 'rgba(10,12,20,0.55)');
  grad.addColorStop(0.55, 'rgba(10,12,20,0.25)');
  grad.addColorStop(1, 'rgba(10,12,20,0.78)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, NT.VIEW.w, NT.VIEW.h);

  neonTitle(ctx, 'NEON TIDE', NT.VIEW.w / 2, 118, 84);
  ctx.font = font(20, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffd23e';
  ctx.fillText('S O L E N N E   C I T Y', NT.VIEW.w / 2, 190);

  ctx.font = font(15, false); ctx.fillStyle = '#dfe5ea';
  var story = [
    'Marisol Vega is back in Solenne City. Her brother owes the Dockmaster\'s crew',
    'a debt they intend to collect in person. Three jobs stand between him and the tide.',
  ];
  for (var i = 0; i < story.length; i++) ctx.fillText(story[i], NT.VIEW.w / 2, 232 + i * 22);

  var bw = 300, bx = NT.VIEW.w / 2 - bw / 2;
  button(ctx, st, 'new', 'NEW GAME', bx, 308, bw, 52, true);
  if (NT.hasSave()) button(ctx, st, 'continue', 'CONTINUE', bx, 372, bw, 52, false);

  // Controls card.
  var cw = 620, cx0 = NT.VIEW.w / 2 - cw / 2, cy0 = 452;
  panel(ctx, cx0, cy0, cw, 164, 0.82);
  ctx.font = font(14, true); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffd23e';
  ctx.fillText('CONTROLS', cx0 + 20, cy0 + 12);
  ctx.font = font(13.5, false); ctx.fillStyle = '#dfe5ea';
  var rows = [
    'WASD / Arrows .... Move · drive',
    'Shift ............ Run',
    'E ................ Enter / exit car · talk',
    'Mouse ............ Aim',
    'Click / Space .... Shoot',
    'F ................ Punch',
    'P / Esc .......... Pause',
  ];
  for (var r2 = 0; r2 < rows.length; r2++) ctx.fillText(rows[r2], cx0 + 20, cy0 + 38 + r2 * 18);
  ctx.font = font(12, false); ctx.textAlign = 'center'; ctx.fillStyle = '#9aa3ad';
  ctx.fillText('An original open-world crime story. Every name, street and song in Solenne City is its own.', NT.VIEW.w / 2, NT.VIEW.h - 24);
}

function drawPause(ctx, st) {
  ctx.fillStyle = 'rgba(8,10,14,0.66)';
  ctx.fillRect(0, 0, NT.VIEW.w, NT.VIEW.h);
  neonTitle(ctx, 'PAUSED', NT.VIEW.w / 2, 240, 54);
  var bw = 280, bx = NT.VIEW.w / 2 - bw / 2;
  button(ctx, st, 'resume', 'RESUME', bx, 320, bw, 50, true);
  button(ctx, st, 'restart', 'RESTART STORY', bx, 384, bw, 50, false);
  button(ctx, st, 'title', 'SAVE + TITLE', bx, 448, bw, 50, false);
}

function drawEndScreen(ctx, st, title, color, line1, line2, btnLabel) {
  ctx.fillStyle = 'rgba(10,6,8,0.62)';
  ctx.fillRect(0, 0, NT.VIEW.w, NT.VIEW.h);
  ctx.font = font(76, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(title, NT.VIEW.w / 2, 250);
  ctx.font = font(16, false); ctx.fillStyle = '#e8e4da';
  ctx.fillText(line1, NT.VIEW.w / 2, 322);
  ctx.fillText(line2, NT.VIEW.w / 2, 348);
  button(ctx, st, 'respawn', btnLabel, NT.VIEW.w / 2 - 130, 396, 260, 50, true);
}

function drawComplete(ctx, st) {
  ctx.fillStyle = 'rgba(6,14,14,0.6)';
  ctx.fillRect(0, 0, NT.VIEW.w, NT.VIEW.h);
  neonTitle(ctx, 'DEBT PAID', NT.VIEW.w / 2, 190, 64);
  ctx.font = font(17, false); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e8e4da';
  ctx.fillText('The lighthouse burns, the Dockmaster\'s ledger burns with it,', NT.VIEW.w / 2, 252);
  ctx.fillText('and Marisol Vega owes Solenne City nothing at all.', NT.VIEW.w / 2, 278);
  ctx.font = font(15, false); ctx.fillStyle = '#9fd8ff';
  ctx.fillText('Missions complete: 3 / 3', NT.VIEW.w / 2, 330);
  ctx.fillText('Cash on hand: ' + NT.money(st.money) + '   ·   Cars lifted: ' + st.stats.stolen + '   ·   Crimes on record: ' + st.stats.crimes, NT.VIEW.w / 2, 356);
  button(ctx, st, 'freeroam', 'KEEP DRIVING', NT.VIEW.w / 2 - 140, 404, 280, 52, true);
}
