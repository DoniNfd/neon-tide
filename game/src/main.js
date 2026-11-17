// NEON TIDE — browser boot: input, the main loop, menu clicks, shot params.
// In Node nothing here runs (there is no document to boot from); the harnesses
// drive NT.newGame / NT.update / NT.draw directly.
'use strict';

(function () {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  var canvas = document.getElementById('game');
  if (!canvas || window.__NT_NO_BOOT__) return;
  var ctx = canvas.getContext('2d');

  // ?shot=start|play|chase|end&seed=N stages a frozen, deterministic scene.
  var params = new URLSearchParams(window.location.search);
  var seed = parseInt(params.get('seed') || '1', 10);
  if (!(seed > 0)) seed = 1;
  var shot = params.get('shot');
  var st = NT.newGame(seed);
  if (shot) {
    NT.setupShot(st, shot);
    NT.draw(ctx, st);
    return; // frozen frame: exactly what the screenshots capture
  }

  var keys = {};
  var input = {
    x: 0, y: 0, run: false, fire: false, melee: false, interact: false,
    mouseX: NT.VIEW.w / 2, mouseY: NT.VIEW.h / 2, mouseDown: false,
  };
  var mouseClicked = false;

  function canvasPos(evt) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: (evt.clientX - rect.left) * (NT.VIEW.w / rect.width),
      y: (evt.clientY - rect.top) * (NT.VIEW.h / rect.height),
    };
  }

  window.addEventListener('keydown', function (e) {
    NT.Audio.unlock();
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
    if (e.repeat) return;
    keys[e.code] = true;
    if (e.code === 'KeyE' || e.code === 'Enter') input.interact = true;
    if (e.code === 'KeyF') input.melee = true;
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (st.mode === 'play') { st.paused = !st.paused; NT.Audio.click(); }
    }
    if (e.code === 'Enter') confirmDefault();
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });
  canvas.addEventListener('mousemove', function (e) {
    var p = canvasPos(e);
    input.mouseX = p.x; input.mouseY = p.y;
  });
  canvas.addEventListener('mousedown', function (e) {
    NT.Audio.unlock();
    var p = canvasPos(e);
    input.mouseX = p.x; input.mouseY = p.y;
    input.mouseDown = true;
    mouseClicked = true;
  });
  window.addEventListener('mouseup', function () { input.mouseDown = false; });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // The primary button of modal screens also answers to Enter.
  function confirmDefault() {
    if (st.mode === 'title') NT.menuAction(st, NT.hasSave() ? 'continue' : 'new');
    else if (st.mode === 'busted' || st.mode === 'wasted') NT.menuAction(st, 'respawn');
    else if (st.mode === 'complete') NT.menuAction(st, 'freeroam');
    else if (st.paused) NT.menuAction(st, 'resume');
  }

  function pollKeys() {
    input.x = ((keys.KeyD || keys.ArrowRight) ? 1 : 0) - ((keys.KeyA || keys.ArrowLeft) ? 1 : 0);
    input.y = ((keys.KeyS || keys.ArrowDown) ? 1 : 0) - ((keys.KeyW || keys.ArrowUp) ? 1 : 0);
    input.run = !!(keys.ShiftLeft || keys.ShiftRight);
    input.fire = input.mouseDown || !!keys.Space;
  }

  function handleClick() {
    if (!mouseClicked) return;
    mouseClicked = false;
    for (var i = 0; i < st.uiButtons.length; i++) {
      var b = st.uiButtons[i];
      if (input.mouseX >= b.x && input.mouseX <= b.x + b.w && input.mouseY >= b.y && input.mouseY <= b.y + b.h) {
        NT.Audio.unlock(); NT.Audio.click();
        NT.menuAction(st, b.id);
        return;
      }
    }
    // A click anywhere also advances dialogue.
    if (st.mode === 'play' && st.dialogue.length) { st.dialogue.shift(); }
  }

  var last = -1, acc = 0, STEP = 1 / 60;
  function frame(ts) {
    window.requestAnimationFrame(frame);
    if (last < 0) last = ts;
    acc += Math.min(0.1, (ts - last) / 1000);
    last = ts;
    pollKeys();
    while (acc >= STEP) {
      NT.update(st, input, STEP);
      input.interact = false; input.melee = false; // edges are consumed once
      acc -= STEP;
    }
    handleClick();
    NT.draw(ctx, st);
  }
  window.requestAnimationFrame(frame);
})();

// Menu actions shared by clicks and the Enter key.
NT.menuAction = function (st, id) {
  if (id === 'new') {
    var fresh = NT.newGame(st.seed);
    // Reuse the same state object so the boot closure keeps its reference.
    for (var k in fresh) st[k] = fresh[k];
    NT.startRun(st, null);
  } else if (id === 'continue') {
    var save = NT.loadSave();
    var fresh2 = NT.newGame(st.seed);
    for (var k2 in fresh2) st[k2] = fresh2[k2];
    NT.startRun(st, save);
  } else if (id === 'respawn') {
    NT.respawn(st);
  } else if (id === 'resume') {
    st.paused = false;
  } else if (id === 'restart') {
    var fresh3 = NT.newGame(st.seed);
    for (var k3 in fresh3) st[k3] = fresh3[k3];
    NT.startRun(st, null);
  } else if (id === 'title') {
    NT.saveGame(st);
    st.mode = 'title'; st.paused = false; st.started = false;
    NT.Audio.setSiren(false); NT.Audio.setEngine(false, 0);
  } else if (id === 'freeroam') {
    st.mode = 'play';
    NT.toast(st, 'Free roam — Solenne City is yours', 4);
  }
};
