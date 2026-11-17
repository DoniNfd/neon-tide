// NEON TIDE — game state and simulation: player, traffic, pedestrians, police,
// the wanted system, combat, missions and the story of Marisol Vega.
// Rendering lives in render.js; this file never touches a canvas.
'use strict';

NT.VIEW = { w: 1280, h: 720 };
NT.SAVE_KEY = 'neontide.save.v1';

NT.CAR_TYPES = {
  sedan:  { len: 42, wid: 20, max: 305, accel: 255, name: 'Meridian Sedan' },
  coupe:  { len: 40, wid: 19, max: 365, accel: 325, name: 'Vesper Coupe' },
  van:    { len: 48, wid: 22, max: 250, accel: 200, name: 'Hauler Van' },
  taxi:   { len: 42, wid: 20, max: 295, accel: 245, name: 'Solenne Cab' },
  police: { len: 43, wid: 20, max: 385, accel: 335, name: 'Patrol Cruiser' },
};
var CAR_COLORS = ['#c94f42', '#4a7fb5', '#57a773', '#d9a441', '#8d6fb8', '#b8bcc2', '#3f8f8a', '#d4698f', '#5a6270', '#e0e2e6'];
var PED_COLORS = ['#e8b04b', '#b5524a', '#4a7fb5', '#57a773', '#d4698f', '#e0e2e6', '#8d6fb8', '#3f8f8a'];

// ---------------------------------------------------------------- state ----
NT.newGame = function (seed) {
  var world = NT.buildWorld(seed);
  var st = {
    seed: seed, world: world, rng: NT.makeRng(seed * 31 + 7),
    time: 0, clockMin: 9 * 60, mode: 'title', paused: false, frozen: false,
    heat: 0, seenTimer: 0, bust: 0, money: 120, fine: 0,
    player: {
      x: 348, y: 1236, angle: -Math.PI / 2, hp: 100, car: null,
      walk: 0, lastHurt: -99, fireCd: 0, punchCd: 0, dead: false,
    },
    cars: [], peds: [], particles: [], tracers: [], floats: [],
    dialogue: [], toast: null, objective: '', objectiveSub: '',
    mission: { idx: 0, step: 0, target: null, timer: -1, targetCarId: -1, hasPackage: false },
    stats: { stolen: 0, crimes: 0, missionsDone: 0 },
    camera: { x: 1000, y: 400 },
    shake: 0, crimeCd: 0, policeSpawnT: 0, saveT: 0, started: false,
    uiButtons: [], shotName: null, storyDone: false,
  };
  NT.spawnAmbient(st);
  return st;
};

var carIdSeq = 1;
NT.makeCar = function (st, type, x, y, angle, kind, color) {
  var t = NT.CAR_TYPES[type];
  var car = {
    id: carIdSeq++, type: type, kind: kind, x: x, y: y, angle: angle, speed: 0,
    len: t.len, wid: t.wid, max: t.max, accel: t.accel, name: t.name,
    color: color || CAR_COLORS[Math.floor(st.rng() * CAR_COLORS.length)],
    health: 100, driver: kind === 'traffic' ? 'traffic' : (kind === 'police' ? 'police' : null),
    ai: null, hitCd: 0, smokeT: 0,
  };
  if (kind === 'traffic') {
    car.ai = NT.trafficAiFor(st, x, y);
    car.speed = car.max * 0.4;
  }
  st.cars.push(car);
  return car;
};

// Work out which road a point is on and set up right-hand-traffic lane state.
NT.trafficAiFor = function (st, x, y) {
  var j = Math.round((x - NT.GRID.road / 2) / NT.GRID.pitch);
  var i = Math.round((y - NT.GRID.road / 2) / NT.GRID.pitch);
  var dv = Math.abs(x - NT.vRoadX(NT.clamp(j, 0, 8)));
  var dh = Math.abs(y - NT.hRoadY(NT.clamp(i, 0, 6)));
  if (dh <= dv) return { axis: 'h', dir: st.rng() < 0.5 ? 1 : -1, turnCd: 0 };
  return { axis: 'v', dir: st.rng() < 0.5 ? 1 : -1, turnCd: 0 };
};

NT.spawnAmbient = function (st) {
  var rng = st.rng, G = NT.GRID, k, x, y;
  // Moving traffic on the avenues.
  for (k = 0; k < 15; k++) {
    if (rng() < 0.5) { x = 80 + rng() * (G.w - 160); y = NT.hRoadY(Math.floor(rng() * 7)); }
    else { x = NT.vRoadX(Math.floor(rng() * 9)); y = 80 + rng() * (G.h - 160); }
    var type = ['sedan', 'sedan', 'coupe', 'van', 'taxi'][Math.floor(rng() * 5)];
    var car = NT.makeCar(st, type, x, y, 0, 'traffic');
    car.angle = car.ai.axis === 'h' ? (car.ai.dir > 0 ? 0 : Math.PI) : (car.ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  }
  // Parked cars along the avenues, parallel to the kerb.
  for (k = 0; k < 24; k++) {
    var horiz = rng() < 0.5;
    if (horiz) {
      var i = Math.floor(rng() * 7);
      x = 90 + rng() * (G.w - 180); y = NT.hRoadY(i) + (rng() < 0.5 ? -27 : 27);
      NT.makeCar(st, ['sedan', 'coupe', 'van'][Math.floor(rng() * 3)], x, y, rng() < 0.5 ? 0 : Math.PI, 'parked');
    } else {
      var j = Math.floor(rng() * 9);
      x = NT.vRoadX(j) + (rng() < 0.5 ? -27 : 27); y = 90 + rng() * (G.h - 180);
      NT.makeCar(st, ['sedan', 'coupe', 'van'][Math.floor(rng() * 3)], x, y, rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2, 'parked');
    }
  }
  // Pedestrians walking the block sidewalks.
  for (k = 0; k < 26; k++) NT.spawnPed(st, null, null);
};

NT.spawnPed = function (st, bx, by) {
  var rng = st.rng;
  var c = bx !== null && bx !== undefined ? bx : Math.floor(rng() * NT.GRID.cols);
  var r = by !== null && by !== undefined ? by : Math.floor(rng() * NT.GRID.rows);
  var rc = NT.blockRect(c, r);
  var inset = 7;
  var per = [
    { x: rc.x + inset, y: rc.y + inset }, { x: rc.x + rc.w - inset, y: rc.y + inset },
    { x: rc.x + rc.w - inset, y: rc.y + rc.h - inset }, { x: rc.x + inset, y: rc.y + rc.h - inset },
  ];
  var corner = Math.floor(rng() * 4);
  var ped = {
    x: per[corner].x, y: per[corner].y, angle: 0, hp: 30,
    block: { c: c, r: r }, per: per, corner: corner, dirn: rng() < 0.5 ? 1 : -1,
    state: 'walk', fleeT: 0, downT: 0, speed: 52 + rng() * 26,
    color: PED_COLORS[Math.floor(rng() * PED_COLORS.length)], walk: rng() * 6,
  };
  st.peds.push(ped);
  return ped;
};

// ------------------------------------------------------------- dialogue ----
NT.say = function (st, who, text) { st.dialogue.push({ who: who, text: text }); };
NT.toast = function (st, text, secs) { st.toast = { text: text, t: secs || 3 }; };
NT.floatText = function (st, x, y, text, color) {
  st.floats.push({ x: x, y: y, text: text, color: color || '#ffd23e', t: 1.4 });
};
NT.burst = function (st, x, y, n, color, speed, life, size) {
  for (var i = 0; i < n; i++) {
    var a = st.rng() * Math.PI * 2, s = (0.3 + st.rng() * 0.7) * (speed || 90);
    st.particles.push({
      x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      t: (life || 0.5) * (0.5 + st.rng() * 0.5), color: color, size: (size || 3) * (0.6 + st.rng() * 0.7),
    });
  }
};

// -------------------------------------------------------------- wanted -----
NT.stars = function (st) { return st.heat <= 0.01 ? 0 : Math.min(5, Math.ceil(st.heat)); };

NT.witnessed = function (st, x, y, range) {
  var i, d2 = range * range;
  for (i = 0; i < st.peds.length; i++) {
    var p = st.peds[i];
    if (p.state !== 'down' && NT.dist2(x, y, p.x, p.y) < d2) return true;
  }
  for (i = 0; i < st.cars.length; i++) {
    var c = st.cars[i];
    if (c.kind === 'police' && NT.dist2(x, y, c.x, c.y) < (range + 90) * (range + 90)) return true;
  }
  return false;
};

// Register a crime. Unwitnessed crimes barely register; witnessed ones bite.
NT.crime = function (st, amount, x, y, label) {
  var seen = NT.witnessed(st, x, y, 300);
  st.heat = NT.clamp(st.heat + (seen ? amount : amount * 0.25), 0, 5);
  st.stats.crimes++;
  if (label && seen) NT.toast(st, label, 2.2);
  return seen;
};

// ------------------------------------------------------------ lifecycle ----
NT.startRun = function (st, save) {
  st.mode = 'play'; st.started = true; st.paused = false;
  if (save) {
    st.money = save.money; st.player.x = save.x; st.player.y = save.y;
    st.player.hp = save.hp || 100; st.clockMin = save.clockMin || 9 * 60;
    NT.startMission(st, save.missionIdx || 0, true);
    NT.toast(st, 'Welcome back to Solenne City', 3);
  } else {
    NT.say(st, 'FERRAN', 'Marisol. You came back. Your brother owes the Dockmaster\'s crew more than he can count, and they are done counting.');
    NT.say(st, 'MARISOL', 'I did not cross the bay to watch them collect, Uncle. Tell me what earns.');
    NT.say(st, 'FERRAN', 'Start small. A package waits at the marina docks. Bring it to the Neon Mile drop and there will be more.');
    NT.startMission(st, 0, true);
  }
  st.camera.x = st.player.x; st.camera.y = st.player.y;
};

NT.doBusted = function (st) {
  var fine = Math.min(st.money, 100 + 60 * NT.stars(st));
  st.money -= fine; st.fine = fine;
  st.mode = 'busted'; st.heat = 0; st.bust = 0;
  NT.Audio.busted(); NT.Audio.setSiren(false);
  if (st.player.car) { st.player.car.driver = null; st.player.car = null; }
  NT.clearPolice(st);
  NT.missionInterrupted(st);
};

NT.doWasted = function (st) {
  var fee = Math.min(st.money, 120);
  st.money -= fee; st.fine = fee;
  st.mode = 'wasted'; st.heat = 0; st.bust = 0;
  NT.Audio.wasted(); NT.Audio.setSiren(false);
  if (st.player.car) { st.player.car.driver = null; st.player.car = null; }
  NT.clearPolice(st);
  NT.missionInterrupted(st);
};

NT.respawn = function (st) {
  var p = st.player;
  if (st.mode === 'busted') { p.x = 1560; p.y = 540; }
  else { p.x = 396; p.y = 540; }
  p.hp = 100; p.dead = false; p.angle = Math.PI / 2;
  st.mode = 'play';
  st.camera.x = p.x; st.camera.y = p.y;
  NT.saveGame(st);
};

NT.clearPolice = function (st) {
  st.cars = st.cars.filter(function (c) { return c.kind !== 'police'; });
};

// -------------------------------------------------------------- missions ---
NT.MISSION_DEFS = [
  { title: 'Package Run', reward: 400 },
  { title: 'The Heights Lift', reward: 750 },
  { title: 'Lighthouse Run', reward: 1200 },
];

NT.startMission = function (st, idx, silent) {
  var m = st.mission;
  m.idx = idx; m.step = 0; m.timer = -1; m.hasPackage = false; m.targetCarId = -1;
  if (idx >= NT.MISSION_DEFS.length) {
    m.target = null;
    st.objective = 'Free roam — Solenne City is yours';
    st.objectiveSub = 'The debt is paid. The tide is neon.';
    return;
  }
  if (idx === 0) {
    m.target = { x: 360, y: 1478, r: 48, label: 'Marina docks' };
    st.objective = 'Pick up the package at the marina docks';
  } else if (idx === 1) {
    // The mark: a gold Vesper Coupe parked up in the Heights.
    var car = NT.makeCar(st, 'coupe', 648, 262, 0, 'target', '#e8b62a');
    m.targetCarId = car.id;
    m.target = { x: car.x, y: car.y, r: 40, label: 'Gold coupe' };
    st.objective = 'Steal the gold coupe in the Heights';
    if (!silent) NT.say(st, 'FERRAN', 'A gold Vesper Coupe sits in the Heights, fat with somebody else\'s money. Lift it, lose the noise, bring it to my garage.');
  } else if (idx === 2) {
    m.target = { x: 1868, y: 1568, r: 54, label: 'Old lighthouse' };
    m.timer = 100;
    st.heat = Math.max(st.heat, 2.6);
    st.objective = 'Reach the old lighthouse before the clock dies';
    if (!silent) NT.say(st, 'FERRAN', 'Last job. The Dockmaster\'s men are watching every road. Get to the old lighthouse and the debt dies with the sunrise. Go!');
  }
  st.objectiveSub = NT.MISSION_DEFS[idx].title + ' — pays ' + NT.money(NT.MISSION_DEFS[idx].reward);
};

NT.completeMission = function (st) {
  var idx = st.mission.idx;
  var reward = NT.MISSION_DEFS[idx].reward;
  st.money += reward; st.stats.missionsDone++;
  NT.Audio.mission(); NT.Audio.cash();
  NT.floatText(st, st.player.x, st.player.y - 30, '+' + NT.money(reward), '#7be495');
  if (idx === 0) {
    NT.say(st, 'FERRAN', 'Clean work. The drop is happy, the crew is paid a little quieter. One more job and your brother breathes easier.');
  } else if (idx === 1) {
    NT.say(st, 'FERRAN', 'The coupe purrs and the Dockmaster is short a fortune. One last run, Marisol. The lighthouse.');
  } else if (idx === 2) {
    st.storyDone = true;
    st.mode = 'complete';
    NT.say(st, 'MARISOL', 'The light is on, the debt is ash, and Solenne is mine again.');
  }
  NT.startMission(st, idx + 1, false);
  NT.saveGame(st);
};

// Being busted or hospitalised mid-mission restarts fragile steps safely.
NT.missionInterrupted = function (st) {
  var m = st.mission;
  if (m.idx === 1 && m.step >= 1) { // the lift must be re-done from the steal
    var car = NT.carById(st, m.targetCarId);
    if (car) { car.x = 648; car.y = 262; car.angle = 0; car.speed = 0; car.health = 100; car.kind = 'target'; car.driver = null; }
    m.step = 0; m.target = { x: 648, y: 262, r: 40, label: 'Gold coupe' };
    st.objective = 'Steal the gold coupe in the Heights';
  }
  if (m.idx === 2) { m.timer = 100; st.objective = 'Reach the old lighthouse before the clock dies'; }
};

NT.carById = function (st, id) {
  for (var i = 0; i < st.cars.length; i++) if (st.cars[i].id === id) return st.cars[i];
  return null;
};

NT.updateMission = function (st, dt) {
  var m = st.mission, p = st.player;
  if (m.idx >= NT.MISSION_DEFS.length) return;
  var px = p.car ? p.car.x : p.x, py = p.car ? p.car.y : p.y;
  // Some steps have no map target (mission 2's "lose the heat" is targetless).
  var near = m.target ? NT.dist(px, py, m.target.x, m.target.y) < m.target.r : false;

  if (m.idx === 0) {
    if (m.step === 0 && near) {
      m.hasPackage = true; m.step = 1;
      m.target = { x: 1356, y: 516, r: 48, label: 'Neon Mile drop' };
      st.objective = 'Deliver the package to the Neon Mile drop';
      NT.Audio.pickup();
      NT.burst(st, px, py, 14, '#ffd23e', 80, 0.6, 3);
      NT.toast(st, 'Package collected', 2.5);
    } else if (m.step === 1 && near) {
      NT.completeMission(st);
    }
  } else if (m.idx === 1) {
    var car = NT.carById(st, m.targetCarId);
    if (car && car.health <= 0 && m.step === 0) { // mark destroyed before the steal: replace it
      car.x = 648; car.y = 262; car.health = 100; car.speed = 0;
      NT.toast(st, 'The mark was wrecked — another coupe has been parked up', 3);
    }
    if (m.step === 0) {
      if (car) { m.target.x = car.x; m.target.y = car.y; }
      // Entering the target car is detected in tryEnterCar via mission hook.
    } else if (m.step === 1) {
      st.objective = 'Lose the heat!';
      if (st.heat <= 0.05) {
        m.step = 2;
        m.target = { x: 380, y: 1104, r: 56, label: "Ferran's Garage" };
        st.objective = 'Deliver the coupe to Ferran\'s Garage';
        NT.toast(st, 'Heat lost. Now deliver the coupe', 3);
      }
    } else if (m.step === 2) {
      if (car) { m.target.x = 380; m.target.y = 1104; }
      if (near && p.car === car) NT.completeMission(st);
    }
  } else if (m.idx === 2) {
    if (m.timer > 0) {
      m.timer -= dt;
      st.objectiveSub = 'Lighthouse Run — ' + Math.max(0, Math.ceil(m.timer)) + 's left — pays ' + NT.money(1200);
      if (m.timer <= 0) {
        m.timer = 100; st.heat = Math.max(st.heat, 2.6);
        NT.Audio.fail();
        NT.toast(st, 'Too slow — the run restarts', 3);
        NT.say(st, 'FERRAN', 'The clock ate that one. Again, Marisol. Faster.');
      }
    }
    if (near) NT.completeMission(st);
  }
};

// ---------------------------------------------------------------- save -----
NT.saveGame = function (st) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(NT.SAVE_KEY, JSON.stringify({
      money: st.money, missionIdx: Math.min(st.mission.idx, NT.MISSION_DEFS.length),
      x: st.player.x, y: st.player.y, hp: st.player.hp, clockMin: st.clockMin,
    }));
  } catch (e) { /* storage is best-effort */ }
};
NT.loadSave = function () {
  try {
    if (typeof localStorage === 'undefined') return null;
    var raw = localStorage.getItem(NT.SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
};
NT.hasSave = function () { return NT.loadSave() !== null; };

// -------------------------------------------------------------- update -----
NT.update = function (st, input, dt) {
  if (st.frozen) return;
  st.time += dt;
  if (st.mode === 'title') { NT.updateAmbient(st, dt); NT.updateFx(st, dt); return; }
  if (st.mode !== 'play' || st.paused) { NT.updateFx(st, dt); return; }

  st.clockMin += dt; // one game minute per real second
  if (st.crimeCd > 0) st.crimeCd -= dt;
  NT.updatePlayer(st, input, dt);
  NT.updateTraffic(st, dt);
  NT.updatePeds(st, dt);
  NT.updatePolice(st, dt);
  NT.updateWanted(st, dt);
  NT.updateMission(st, dt);
  NT.updateFx(st, dt);

  // Camera follows the player (or their car) with a little lookahead.
  var p = st.player, fx = p.car ? p.car.x : p.x, fy = p.car ? p.car.y : p.y;
  var k = 1 - Math.exp(-6 * dt);
  st.camera.x += (fx - st.camera.x) * k;
  st.camera.y += (fy - st.camera.y) * k;
  st.camera.x = NT.clamp(st.camera.x, NT.VIEW.w / 2 - 60, NT.GRID.w - NT.VIEW.w / 2 + 60);
  st.camera.y = NT.clamp(st.camera.y, NT.VIEW.h / 2 - 60, NT.GRID.worldH - NT.VIEW.h / 2 + 60);
  if (st.shake > 0) st.shake = Math.max(0, st.shake - dt * 26);

  if (st.toast && (st.toast.t -= dt) <= 0) st.toast = null;

  st.saveT += dt;
  if (st.saveT > 12) { st.saveT = 0; NT.saveGame(st); }

  var sirenNear = false;
  for (var i = 0; i < st.cars.length; i++) {
    if (st.cars[i].kind === 'police' && NT.dist2(st.cars[i].x, st.cars[i].y, fx, fy) < 620 * 620) sirenNear = true;
  }
  NT.Audio.setSiren(sirenNear && NT.stars(st) > 0);
  NT.Audio.setEngine(!!p.car, p.car ? Math.abs(p.car.speed) / p.car.max : 0);
};

// Title-screen ambience: traffic and peds keep living behind the menu.
NT.updateAmbient = function (st, dt) {
  NT.updateTraffic(st, dt);
  NT.updatePeds(st, dt);
  st.camera.x = 1000 + Math.sin(st.time * 0.05) * 260;
  st.camera.y = 620 + Math.cos(st.time * 0.037) * 200;
};

NT.updateFx = function (st, dt) {
  var i;
  for (i = st.particles.length - 1; i >= 0; i--) {
    var q = st.particles[i];
    q.t -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.92; q.vy *= 0.92;
    if (q.t <= 0) st.particles.splice(i, 1);
  }
  for (i = st.tracers.length - 1; i >= 0; i--) {
    st.tracers[i].t -= dt;
    if (st.tracers[i].t <= 0) st.tracers.splice(i, 1);
  }
  for (i = st.floats.length - 1; i >= 0; i--) {
    st.floats[i].t -= dt; st.floats[i].y -= 26 * dt;
    if (st.floats[i].t <= 0) st.floats.splice(i, 1);
  }
};

// -------------------------------------------------------------- player -----
NT.updatePlayer = function (st, input, dt) {
  var p = st.player;
  if (p.fireCd > 0) p.fireCd -= dt;
  if (p.punchCd > 0) p.punchCd -= dt;
  if (p.hp < 100 && st.time - p.lastHurt > 9) p.hp = Math.min(100, p.hp + 4 * dt);

  if (input.interact) { // E: dialogue first, then enter/exit
    if (st.dialogue.length) { st.dialogue.shift(); NT.Audio.click(); }
    else if (p.car) NT.exitCar(st);
    else NT.tryEnterCar(st);
  }
  if (p.car) { NT.driveCar(st, input, dt); return; }

  // On foot: 8-direction movement, Shift runs.
  var mx = input.x, my = input.y;
  var len = Math.sqrt(mx * mx + my * my);
  st._footSpeed = len > 0.01 ? (input.run ? 218 : 136) : 0;
  if (len > 0.01) {
    mx /= Math.max(1, len); my /= Math.max(1, len);
    var sp = input.run ? 218 : 136;
    p.x += mx * sp * dt; p.y += my * sp * dt;
    p.walk += dt * (input.run ? 13 : 9);
    if (!input.fire) p.angle = Math.atan2(my, mx);
  }
  var res = NT.collideCircle(st.world, p.x, p.y, 11);
  p.x = res.x; p.y = res.y;

  // Mouse aim while firing or holding the mouse button.
  if (input.mouseDown || input.fire) {
    var wx = st.camera.x + (input.mouseX - NT.VIEW.w / 2), wy = st.camera.y + (input.mouseY - NT.VIEW.h / 2);
    p.angle = Math.atan2(wy - p.y, wx - p.x);
  }
  if (input.fire && p.fireCd <= 0) NT.shoot(st);
  if (input.melee && p.punchCd <= 0) NT.punch(st);

  // Traffic can run the player down.
  for (var i = 0; i < st.cars.length; i++) {
    var c = st.cars[i];
    if (c.driver === 'traffic' && Math.abs(c.speed) > 60 && NT.dist2(p.x, p.y, c.x, c.y) < 30 * 30) {
      NT.hurtPlayer(st, 13, c.x, c.y);
      c.speed *= 0.4;
    }
  }
};

NT.hurtPlayer = function (st, dmg, fromX, fromY) {
  var p = st.player;
  if (st.time - p.lastHurt < 0.25) return;
  p.lastHurt = st.time;
  p.hp -= dmg;
  NT.burst(st, p.x, p.y, 6, '#e0483e', 90, 0.4, 3);
  if (p.hp <= 0 && !p.dead) { p.dead = true; NT.doWasted(st); }
};

NT.tryEnterCar = function (st) {
  var p = st.player, best = null, bd = 40 * 40;
  for (var i = 0; i < st.cars.length; i++) {
    var c = st.cars[i];
    if (c.driver === 'police' || c.health <= 0) continue;
    var d = NT.dist2(p.x, p.y, c.x, c.y);
    if (d < bd) { bd = d; best = c; }
  }
  if (!best) return;
  var wasTraffic = best.driver === 'traffic';
  if (wasTraffic) { // carjacking: the driver bails and runs
    var ped = NT.spawnPed(st, Math.floor(best.x / NT.GRID.pitch), Math.floor(best.y / NT.GRID.pitch));
    ped.x = best.x + 18; ped.y = best.y; ped.state = 'flee'; ped.fleeT = 3;
    NT.crime(st, 1.1, best.x, best.y, 'Carjacking witnessed!');
  } else if (best.kind === 'parked' || best.kind === 'target') {
    NT.crime(st, 0.7, best.x, best.y, 'Vehicle theft witnessed');
    st.stats.stolen++;
  }
  best.kind = best.kind === 'target' ? 'target' : 'player';
  best.driver = 'player';
  p.car = best;
  p.x = best.x; p.y = best.y;
  NT.Audio.door();
  if (st.mission.idx === 1 && st.mission.step === 0 && best.id === st.mission.targetCarId) {
    st.mission.step = 1;
    st.heat = Math.max(st.heat, 3);
    st.mission.target = null;
    st.objective = 'Lose the heat!';
    NT.toast(st, 'That coupe was watched — lose the heat!', 3.5);
    NT.Audio.fail();
  }
};

NT.exitCar = function (st) {
  var p = st.player, c = p.car;
  if (!c) return;
  c.driver = null;
  if (c.kind === 'player') c.kind = 'parked';
  p.car = null;
  var side = c.angle + Math.PI / 2;
  p.x = c.x + Math.cos(side) * 24; p.y = c.y + Math.sin(side) * 24;
  var res = NT.collideCircle(st.world, p.x, p.y, 11);
  p.x = res.x; p.y = res.y;
  NT.Audio.door();
};

NT.driveCar = function (st, input, dt) {
  var p = st.player, c = p.car;
  var t = NT.CAR_TYPES[c.type];
  if (input.y < 0) { // W: accelerate
    c.speed = Math.min(t.max * (c.health < 25 ? 0.55 : 1), c.speed + t.accel * dt);
  } else if (input.y > 0) { // S: brake, then reverse
    if (c.speed > 8) c.speed = Math.max(0, c.speed - 420 * dt);
    else c.speed = Math.max(-115, c.speed - 160 * dt);
  } else {
    c.speed -= c.speed * 0.55 * dt;
    if (Math.abs(c.speed) < 2) c.speed = 0;
  }
  if (input.x !== 0 && Math.abs(c.speed) > 4) {
    var steer = input.x * 1.9 * dt * NT.clamp(Math.abs(c.speed) / 130, 0.25, 1) * (c.speed < 0 ? -1 : 1);
    c.angle += steer;
  }
  var nx = c.x + Math.cos(c.angle) * c.speed * dt;
  var ny = c.y + Math.sin(c.angle) * c.speed * dt;
  NT.moveCarBody(st, c, nx, ny, Math.abs(c.speed));
  p.x = c.x; p.y = c.y; p.angle = c.angle;

  // Damage smoke.
  if (c.health < 45) {
    c.smokeT -= dt;
    if (c.smokeT <= 0) {
      c.smokeT = 0.12;
      st.particles.push({ x: c.x, y: c.y - 6, vx: (st.rng() - 0.5) * 14, vy: -22 - st.rng() * 12, t: 0.8, color: '#555c66', size: 5 });
    }
  }
  if (c.health <= 0) { // wrecked: bail out
    NT.toast(st, 'Wrecked!', 2.5);
    NT.exitCar(st);
    NT.hurtPlayer(st, 10, c.x, c.y);
  }
};

// Move a car, resolving its nose and tail circles against the world and
// applying crash damage when it arrives too fast. Returns impact speed.
NT.moveCarBody = function (st, c, nx, ny, speedIn) {
  var fx = Math.cos(c.angle), fy = Math.sin(c.angle);
  var off = c.len * 0.32;
  var r1 = NT.collideCircle(st.world, nx + fx * off, ny + fy * off, 12);
  var r2 = NT.collideCircle(st.world, nx - fx * off, ny - fy * off, 12);
  var hit = r1.hit || r2.hit;
  // Re-centre: average the two circles' collision corrections onto (nx, ny).
  c.x = nx + ((r1.x - (nx + fx * off)) + (r2.x - (nx - fx * off))) / 2;
  c.y = ny + ((r1.y - (ny + fy * off)) + (r2.y - (ny - fy * off))) / 2;
  if (hit && speedIn > 105) {
    var dmg = (speedIn - 90) / 14;
    c.health -= dmg;
    if (c.driver === 'player') {
      NT.hurtPlayer(st, dmg * 0.55, c.x, c.y);
      st.shake = Math.min(10, dmg);
      NT.Audio.crash(speedIn > 210);
      if (st.crimeCd <= 0) { NT.crime(st, 0.25, c.x, c.y, null); st.crimeCd = 2; }
    } else if (speedIn > 160) NT.Audio.crash(false);
    NT.burst(st, c.x + fx * 16, c.y + fy * 16, 8, '#ffd23e', 120, 0.35, 3);
    c.speed *= 0.25;
  } else if (hit) {
    c.speed *= 0.6;
  }
  return hit ? speedIn : 0;
};

// -------------------------------------------------------------- combat -----
NT.shoot = function (st) {
  var p = st.player;
  p.fireCd = 0.21;
  NT.Audio.shoot();
  var ang = p.angle + (st.rng() - 0.5) * 0.07;
  var range = 430, step = 10, hx = p.x, hy = p.y, hitKind = null, hitRef = null;
  for (var d = step; d < range; d += step) {
    hx = p.x + Math.cos(ang) * d; hy = p.y + Math.sin(ang) * d;
    var i, done = false;
    for (i = 0; i < st.world.buildings.length; i++) {
      if (NT.circleRect(hx, hy, 3, st.world.buildings[i])) { hitKind = 'wall'; done = true; break; }
    }
    if (done) break;
    for (i = 0; i < st.peds.length; i++) {
      var pd = st.peds[i];
      if (pd.state !== 'down' && NT.dist2(hx, hy, pd.x, pd.y) < 11 * 11) { hitKind = 'ped'; hitRef = pd; done = true; break; }
    }
    if (done) break;
    for (i = 0; i < st.cars.length; i++) {
      var c = st.cars[i];
      if (c !== p.car && NT.dist2(hx, hy, c.x, c.y) < (c.len / 2) * (c.len / 2)) { hitKind = 'car'; hitRef = c; done = true; break; }
    }
    if (done) break;
  }
  st.tracers.push({ x1: p.x + Math.cos(p.angle) * 14, y1: p.y + Math.sin(p.angle) * 14, x2: hx, y2: hy, t: 0.07 });
  NT.burst(st, p.x + Math.cos(p.angle) * 16, p.y + Math.sin(p.angle) * 16, 3, '#ffd23e', 60, 0.12, 3);
  NT.crime(st, 0.35, p.x, p.y, 'Shots fired!');
  NT.fleeFrom(st, p.x, p.y, 240);
  if (hitKind === 'ped') {
    hitRef.hp -= 34;
    NT.burst(st, hitRef.x, hitRef.y, 8, '#e0483e', 90, 0.4, 3);
    if (hitRef.hp <= 0 && hitRef.state !== 'down') {
      hitRef.state = 'down'; hitRef.downT = 9999;
      NT.crime(st, 1.6, hitRef.x, hitRef.y, 'Pedestrian down!');
    }
  } else if (hitKind === 'car') {
    hitRef.health -= 9;
    NT.burst(st, hx, hy, 5, '#ffd23e', 100, 0.3, 2);
    if (hitRef.kind === 'police') NT.crime(st, 1.2, hx, hy, 'You shot at the law!');
    if (hitRef.driver === 'traffic') { hitRef.driver = 'flee'; }
  } else if (hitKind === 'wall') {
    NT.burst(st, hx, hy, 4, '#cbb59a', 70, 0.3, 2);
  }
};

NT.punch = function (st) {
  var p = st.player;
  p.punchCd = 0.38;
  NT.Audio.punch();
  var tx = p.x + Math.cos(p.angle) * 26, ty = p.y + Math.sin(p.angle) * 26;
  for (var i = 0; i < st.peds.length; i++) {
    var pd = st.peds[i];
    if (pd.state !== 'down' && NT.dist2(tx, ty, pd.x, pd.y) < 22 * 22) {
      pd.hp -= 16;
      pd.x += Math.cos(p.angle) * 10; pd.y += Math.sin(p.angle) * 10;
      NT.burst(st, pd.x, pd.y, 5, '#e0483e', 70, 0.3, 3);
      NT.crime(st, 0.55, pd.x, pd.y, 'Assault witnessed!');
      if (pd.hp <= 0) { pd.state = 'down'; pd.downT = 9999; NT.crime(st, 1.2, pd.x, pd.y, null); }
      else { pd.state = 'flee'; pd.fleeT = 2.5; }
      return;
    }
  }
  for (var j = 0; j < st.cars.length; j++) {
    var c = st.cars[j];
    if (NT.dist2(tx, ty, c.x, c.y) < 30 * 30) {
      c.health -= 4;
      NT.burst(st, tx, ty, 4, '#ffd23e', 80, 0.25, 2);
      NT.crime(st, 0.3, tx, ty, null);
      return;
    }
  }
};

NT.fleeFrom = function (st, x, y, range) {
  for (var i = 0; i < st.peds.length; i++) {
    var pd = st.peds[i];
    if (pd.state === 'walk' && NT.dist2(x, y, pd.x, pd.y) < range * range) {
      pd.state = 'flee'; pd.fleeT = 1.6 + st.rng();
      pd.fleeX = x; pd.fleeY = y;
    }
  }
};

// ------------------------------------------------------------- traffic -----
NT.updateTraffic = function (st, dt) {
  for (var i = 0; i < st.cars.length; i++) {
    var c = st.cars[i];
    if (c.driver !== 'traffic' && c.driver !== 'flee') continue;
    if (c.health <= 0) { c.speed = 0; continue; }
    var ai = c.ai || (c.ai = NT.trafficAiFor(st, c.x, c.y));
    if (ai.turnCd > 0) ai.turnCd -= dt;

    var fleeing = c.driver === 'flee';
    var targetSpeed = c.max * (fleeing ? 0.85 : 0.42);
    if (NT.trafficBlocked(st, c)) targetSpeed = 0;
    c.speed += NT.clamp(targetSpeed - c.speed, -320 * dt, 130 * dt);

    var along = ai.axis === 'h' ? c.x : c.y;
    var rel = (((along - NT.GRID.road / 2) % NT.GRID.pitch) + NT.GRID.pitch) % NT.GRID.pitch;
    var toNext = ai.dir > 0 ? (NT.GRID.pitch - rel) % NT.GRID.pitch : rel;
    if (toNext < Math.abs(c.speed) * dt + 3 && ai.turnCd <= 0 && Math.abs(c.speed) > 20) {
      ai.turnCd = 0.6;
      NT.trafficTurn(st, c);
    }

    var nx = c.x, ny = c.y;
    if (ai.axis === 'h') {
      nx += ai.dir * c.speed * dt;
      var laneY = NT.hRoadY(Math.round((c.y - NT.GRID.road / 2) / NT.GRID.pitch)) + ai.dir * 14;
      ny += (laneY - c.y) * Math.min(1, 3 * dt);
      c.angle = NT.angLerp(c.angle, ai.dir > 0 ? 0 : Math.PI, 8 * dt);
    } else {
      ny += ai.dir * c.speed * dt;
      var laneX = NT.vRoadX(Math.round((c.x - NT.GRID.road / 2) / NT.GRID.pitch)) - ai.dir * 14;
      nx += (laneX - c.x) * Math.min(1, 3 * dt);
      c.angle = NT.angLerp(c.angle, ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 8 * dt);
    }
    // Keep traffic on the road network: bounce at the world rim.
    if (nx < 50) { ai.axis = 'h'; ai.dir = 1; }
    if (nx > NT.GRID.w - 50) { ai.axis = 'h'; ai.dir = -1; }
    if (ny < 50) { ai.axis = 'v'; ai.dir = 1; }
    if (ny > NT.GRID.h - 50) { ai.axis = 'v'; ai.dir = -1; }
    var before = c.speed;
    NT.moveCarBody(st, c, nx, ny, 0);
    if (c.speed === 0 && before > 0) c.speed = Math.min(before, 30); // traffic nudges free of kerbs
    NT.carCarCollisions(st, c);
  }
};

NT.trafficTurn = function (st, c) {
  var ai = c.ai, roll = st.rng();
  if (roll < 0.45) return; // straight on
  var turnRight = roll < 0.72;
  if (ai.axis === 'h') {
    ai.axis = 'v';
    ai.dir = (ai.dir > 0) === turnRight ? 1 : -1;
    if (c.x < 80) ai.dir = 1; if (c.x > NT.GRID.w - 80) ai.dir = -1;
  } else {
    ai.axis = 'h';
    ai.dir = (ai.dir > 0) === turnRight ? -1 : 1;
    if (c.y < 80) ai.dir = 1; if (c.y > NT.GRID.h - 80) ai.dir = -1;
  }
};

// Is something solid in this traffic car's lane just ahead?
NT.trafficBlocked = function (st, c) {
  var fx = Math.cos(c.angle), fy = Math.sin(c.angle);
  var i, o, dx, dy, fwd, lat;
  for (i = 0; i < st.cars.length; i++) {
    o = st.cars[i];
    if (o === c) continue;
    dx = o.x - c.x; dy = o.y - c.y;
    fwd = dx * fx + dy * fy; lat = -dx * fy + dy * fx;
    if (fwd > 6 && fwd < 62 && Math.abs(lat) < 18) return true;
  }
  for (i = 0; i < st.peds.length; i++) {
    o = st.peds[i];
    if (o.state === 'down') continue;
    dx = o.x - c.x; dy = o.y - c.y;
    fwd = dx * fx + dy * fy; lat = -dx * fy + dy * fx;
    if (fwd > 4 && fwd < 48 && Math.abs(lat) < 15) return true;
  }
  var p = st.player;
  if (!p.car) {
    dx = p.x - c.x; dy = p.y - c.y;
    fwd = dx * fx + dy * fy; lat = -dx * fy + dy * fx;
    if (fwd > 4 && fwd < 48 && Math.abs(lat) < 15) return true;
  }
  return false;
};

// Simple car-vs-car separation with damage on hard hits.
NT.carCarCollisions = function (st, c) {
  for (var i = 0; i < st.cars.length; i++) {
    var o = st.cars[i];
    if (o === c) continue;
    var dx = o.x - c.x, dy = o.y - c.y;
    var rr = (c.len + o.len) / 2 * 0.82;
    var d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr || d2 < 0.01) continue;
    var d = Math.sqrt(d2), push = (rr - d) / 2;
    var ux = dx / d, uy = dy / d;
    if (o.driver !== 'player') { o.x += ux * push; o.y += uy * push; }
    if (c.driver !== 'player') { c.x -= ux * push; c.y -= uy * push; }
    var rel = Math.abs(c.speed - o.speed);
    if (rel > 120) {
      c.health -= rel / 22; o.health -= rel / 22;
      NT.burst(st, (c.x + o.x) / 2, (c.y + o.y) / 2, 7, '#ffd23e', 110, 0.3, 3);
      if (c.driver === 'player' || o.driver === 'player') {
        NT.Audio.crash(rel > 240);
        st.shake = Math.min(9, rel / 30);
        if (o.kind === 'police') NT.crime(st, 0.5, c.x, c.y, 'You rammed the law!');
        else if (st.crimeCd <= 0) { NT.crime(st, 0.3, c.x, c.y, 'Reckless driving!'); st.crimeCd = 2.5; }
        NT.hurtPlayer(st, rel / 26, o.x, o.y);
      }
      c.speed *= 0.45; o.speed *= 0.45;
    }
  }
};

// ---------------------------------------------------------------- peds -----
NT.updatePeds = function (st, dt) {
  for (var i = 0; i < st.peds.length; i++) {
    var pd = st.peds[i];
    if (pd.state === 'down') continue;
    if (pd.state === 'flee') {
      pd.fleeT -= dt;
      var fx = pd.fleeX !== undefined ? pd.fleeX : st.player.x;
      var fy = pd.fleeY !== undefined ? pd.fleeY : st.player.y;
      var a = Math.atan2(pd.y - fy, pd.x - fx);
      pd.x += Math.cos(a) * 165 * dt; pd.y += Math.sin(a) * 165 * dt;
      pd.angle = a; pd.walk += dt * 14;
      var res = NT.collideCircle(st.world, pd.x, pd.y, 9);
      pd.x = res.x; pd.y = res.y;
      if (pd.fleeT <= 0) pd.state = 'walk';
      continue;
    }
    // Walk the block perimeter corner to corner.
    var tgt = pd.per[(pd.corner + pd.dirn + 4) % 4];
    var dx = tgt.x - pd.x, dy = tgt.y - pd.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < 5) { pd.corner = (pd.corner + pd.dirn + 4) % 4; continue; }
    pd.angle = Math.atan2(dy, dx);
    pd.x += (dx / d) * pd.speed * dt; pd.y += (dy / d) * pd.speed * dt;
    pd.walk += dt * 7;
  }
};

// -------------------------------------------------------------- police -----
NT.updatePolice = function (st, dt) {
  var stars = NT.stars(st);
  var want = stars === 0 ? 0 : stars + 1;
  var have = 0, i, c;
  for (i = 0; i < st.cars.length; i++) if (st.cars[i].kind === 'police') have++;
  st.policeSpawnT -= dt;
  if (have < want && st.policeSpawnT <= 0) {
    st.policeSpawnT = 1.6;
    NT.spawnPolice(st);
  }
  var p = st.player;
  var tx = p.car ? p.car.x : p.x, ty = p.car ? p.car.y : p.y;
  var tSpeed = p.car ? p.car.speed : 0;

  for (i = st.cars.length - 1; i >= 0; i--) {
    c = st.cars[i];
    if (c.kind !== 'police') continue;
    if (stars === 0 && NT.dist2(c.x, c.y, tx, ty) > 760 * 760) { st.cars.splice(i, 1); continue; }
    if (c.health <= 0) { c.speed = 0; continue; }
    // Steer at the player's near future position.
    var lead = NT.clamp(NT.dist(c.x, c.y, tx, ty) / 300, 0, 0.5);
    var gx = tx + (p.car ? Math.cos(p.car.angle) * tSpeed * lead : 0);
    var gy = ty + (p.car ? Math.sin(p.car.angle) * tSpeed * lead : 0);
    var want2 = Math.atan2(gy - c.y, gx - c.x);
    var diff = NT.angDiff(c.angle, want2);
    var distP = NT.dist(c.x, c.y, tx, ty);
    var topSpeed = c.max * (stars >= 4 ? 1 : 0.88);
    if (distP < 42) topSpeed = c.max * 0.3;
    c.speed += NT.clamp(topSpeed - c.speed, -380 * dt, 300 * dt);
    c.angle += NT.clamp(diff, -2.4 * dt, 2.4 * dt) * (c.speed < -5 ? -1 : 1);
    var nx = c.x + Math.cos(c.angle) * c.speed * dt;
    var ny = c.y + Math.sin(c.angle) * c.speed * dt;
    NT.moveCarBody(st, c, nx, ny, Math.abs(c.speed));
    NT.carCarCollisions(st, c);
    // A cruiser alongside a crawling player is a bust in progress.
    if (distP < 46 && Math.abs(c.speed) < 60 && !p.car) {
      // Officers pile out in spirit: standing next to a cruiser is dangerous.
    }
  }

  // Bust meter: boxed in by nearby police while slow means handcuffs.
  var nearPolice = 0;
  for (i = 0; i < st.cars.length; i++) {
    c = st.cars[i];
    if (c.kind === 'police' && c.health > 0 && NT.dist2(c.x, c.y, tx, ty) < 118 * 118) nearPolice++;
  }
  var mySpeed = p.car ? Math.abs(p.car.speed) : (st._footSpeed || 0);
  if (stars > 0 && nearPolice > 0 && mySpeed < 34) st.bust += dt / 2.8;
  else st.bust = Math.max(0, st.bust - dt * 0.55);
  if (st.bust >= 1) NT.doBusted(st);
};

NT.spawnPolice = function (st) {
  var p = st.player;
  for (var tries = 0; tries < 8; tries++) {
    var a = st.rng() * Math.PI * 2, d = 600 + st.rng() * 180;
    var x = NT.clamp(p.x + Math.cos(a) * d, 60, NT.GRID.w - 60);
    var y = NT.clamp(p.y + Math.sin(a) * d, 60, NT.GRID.h - 60);
    // Snap to the nearest road centre so cruisers arrive on streets.
    var j = Math.round((x - NT.GRID.road / 2) / NT.GRID.pitch);
    var i = Math.round((y - NT.GRID.road / 2) / NT.GRID.pitch);
    if (st.rng() < 0.5) x = NT.vRoadX(NT.clamp(j, 0, 8)); else y = NT.hRoadY(NT.clamp(i, 0, 6));
    if (!NT.spotFree(st.world, x, y, 18)) continue;
    var car = NT.makeCar(st, 'police', x, y, Math.atan2(p.y - y, p.x - x), 'police', '#e8ecf2');
    car.speed = car.max * 0.5;
    return car;
  }
  return null;
};

// Wanted decay: out of police sight, the heat cools.
NT.updateWanted = function (st, dt) {
  if (st.heat <= 0) { st.heat = 0; return; }
  var p = st.player, seen = false;
  for (var i = 0; i < st.cars.length; i++) {
    var c = st.cars[i];
    if (c.kind === 'police' && NT.dist2(c.x, c.y, p.x, p.y) < 320 * 320) { seen = true; break; }
  }
  if (seen) st.seenTimer = 0;
  else {
    st.seenTimer += dt;
    if (st.seenTimer > 2.5) st.heat = Math.max(0, st.heat - 0.22 * dt);
  }
};

// -------------------------------------------------------- shot staging -----
// Deterministic scenes behind ?shot=start|play|chase|end&seed=N. Each builds a
// real game state, poses it, and freezes the simulation for the screenshot.
NT.setupShot = function (st, name) {
  st.shotName = name;
  st.frozen = true;
  var i, c;
  if (name === 'play') {
    NT.startRun(st, null);
    st.dialogue = [];
    // Marisol at the wheel on the Neon Mile, mid-errand.
    var car = NT.makeCar(st, 'sedan', 1180, NT.hRoadY(2) + 14, 0, 'parked', '#c94f42');
    car.kind = 'player'; car.driver = 'player'; car.speed = 168;
    st.player.car = car; st.player.x = car.x; st.player.y = car.y; st.player.angle = 0;
    st.camera.x = car.x; st.camera.y = car.y;
    for (i = 0; i < st.cars.length; i++) { /* keep ambient traffic as generated */ }
    st.objective = 'Pick up the package at the marina docks';
  } else if (name === 'chase') {
    NT.startRun(st, null);
    st.dialogue = [];
    st.mission.idx = 1; st.mission.step = 1; st.mission.target = null;
    st.objective = 'Lose the heat!';
    st.objectiveSub = 'The Heights Lift — the coupe is hot';
    var mine = NT.makeCar(st, 'coupe', 1060, NT.hRoadY(3) + 14, 0, 'target', '#e8b62a');
    mine.driver = 'player'; mine.speed = 238; mine.health = 82;
    st.mission.targetCarId = mine.id;
    st.player.car = mine; st.player.x = mine.x; st.player.y = mine.y; st.player.angle = 0;
    st.heat = 2.7; // three full stars on the HUD
    var spots = [[880, NT.hRoadY(3) - 14, 0.2], [820, NT.hRoadY(3) + 16, -0.15], [960, NT.hRoadY(2) + 200, 0.7], [1240, NT.hRoadY(3) - 90, 2.6]];
    for (i = 0; i < spots.length; i++) {
      c = NT.makeCar(st, 'police', spots[i][0], spots[i][1], spots[i][2], 'police', '#e8ecf2');
      c.speed = 200;
    }
    st.camera.x = mine.x; st.camera.y = mine.y;
    st.bust = 0.3;
  } else if (name === 'end') {
    NT.startRun(st, null);
    st.dialogue = [];
    NT.startMission(st, 3, true);
    st.money = 120 + 400 + 750 + 1200;
    st.stats.missionsDone = 3;
    st.storyDone = true;
    st.mode = 'complete';
    st.player.x = 1868; st.player.y = 1552; st.player.angle = Math.PI / 2;
    st.camera.x = 1700; st.camera.y = 1460; // frame the pier, the bay and the city behind
    NT.burst(st, 1868, 1500, 22, '#37e0c8', 70, 99, 3);
    NT.burst(st, 1820, 1530, 14, '#ffd23e', 60, 99, 3);
  } else { // start: title over the living city
    st.mode = 'title';
    st.camera.x = 1000; st.camera.y = 620;
  }
  return st;
};
