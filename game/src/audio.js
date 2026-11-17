// NEON TIDE — sound, all synthesized with WebAudio. No audio files anywhere:
// effects are oscillators and filtered noise, the music is a small procedural
// bass-and-pluck loop in D minor, and the siren is an LFO-swept oscillator.
// Audio starts only after a user gesture (the first key press or click calls
// NT.Audio.unlock()). In Node (screenshot/smoke harnesses) everything no-ops.
'use strict';

NT.Audio = (function () {
  var ctx = null, master = null, started = false;
  var sirenOsc = null, sirenGain = null, engineOsc = null, engineGain = null;
  var musicTimer = null, musicStep = 0;

  function unlock() {
    if (started) return;
    started = true;
    try {
      var AC = (typeof window !== 'undefined') ? (window.AudioContext || window.webkitAudioContext) : null;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      startMusic();
    } catch (e) { ctx = null; }
  }

  function tone(freq, dur, type, vol, slideTo, delay) {
    if (!ctx) return;
    var t0 = ctx.currentTime + (delay || 0);
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol || 0.15, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, freq, delay) {
    if (!ctx) return;
    var t0 = ctx.currentTime + (delay || 0);
    var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 1200;
    var g = ctx.createGain(); g.gain.value = vol || 0.2;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
  }

  // A minor-key procedural loop: a rolling bass line with sparse plucked notes
  // a fifth above, one 8-step bar every 1.76 s. Original pattern, code-made.
  var BASS = [110, 0, 110, 130.81, 0, 98, 0, 146.83];
  var PLUCK = [440, 0, 0, 523.25, 0, 0, 392, 0];
  function startMusic() {
    if (!ctx || musicTimer) return;
    musicTimer = setInterval(function () {
      if (!ctx) return;
      var s = musicStep % 8;
      if (BASS[s]) tone(BASS[s], 0.2, 'triangle', 0.16);
      if (PLUCK[s]) tone(PLUCK[s], 0.16, 'sine', 0.07);
      if (s === 0) noise(0.05, 0.03, 6000);
      musicStep++;
    }, 220);
  }

  function setSiren(on) {
    if (!ctx) return;
    try {
      if (on && !sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenGain = ctx.createGain();
        var lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
        sirenOsc.type = 'triangle';
        sirenOsc.frequency.value = 820;
        lfo.type = 'sine'; lfo.frequency.value = 0.7;
        lfoGain.gain.value = 180;
        lfo.connect(lfoGain); lfoGain.connect(sirenOsc.frequency);
        sirenGain.gain.value = 0.045;
        sirenOsc.connect(sirenGain); sirenGain.connect(master);
        sirenOsc.start(); lfo.start();
        sirenOsc._lfo = lfo;
      } else if (!on && sirenOsc) {
        sirenOsc.stop(); if (sirenOsc._lfo) sirenOsc._lfo.stop();
        sirenOsc = null; sirenGain = null;
      }
    } catch (e) { /* audio is decoration; never break the game */ }
  }

  function setEngine(on, speedFrac) {
    if (!ctx) return;
    try {
      if (on && !engineOsc) {
        engineOsc = ctx.createOscillator();
        engineGain = ctx.createGain();
        engineOsc.type = 'sawtooth';
        engineGain.gain.value = 0.0;
        var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
        engineOsc.connect(f); f.connect(engineGain); engineGain.connect(master);
        engineOsc.start();
      }
      if (engineOsc) {
        engineOsc.frequency.value = 55 + (speedFrac || 0) * 130;
        engineGain.gain.value = on ? 0.05 : 0.0;
        if (!on) { engineOsc.stop(); engineOsc = null; engineGain = null; }
      }
    } catch (e) { /* ignore */ }
  }

  return {
    unlock: unlock,
    click: function () { tone(660, 0.05, 'square', 0.08); },
    pickup: function () { tone(880, 0.08, 'sine', 0.16); tone(1318, 0.12, 'sine', 0.14, null, 0.07); },
    cash: function () { tone(1046, 0.07, 'square', 0.1); tone(1568, 0.12, 'square', 0.1, null, 0.06); },
    shoot: function () { noise(0.12, 0.3, 2600); tone(160, 0.08, 'square', 0.12, 60); },
    punch: function () { noise(0.07, 0.2, 700); },
    crash: function (hard) { noise(hard ? 0.3 : 0.15, hard ? 0.4 : 0.22, 500); tone(70, 0.2, 'sawtooth', 0.15, 40); },
    door: function () { tone(220, 0.06, 'square', 0.08, 160); },
    busted: function () { tone(392, 0.18, 'square', 0.14); tone(311, 0.18, 'square', 0.14, null, 0.16); tone(233, 0.34, 'square', 0.14, null, 0.32); },
    wasted: function () { tone(330, 0.3, 'sawtooth', 0.12, 110); },
    mission: function () { tone(523, 0.1, 'square', 0.12); tone(659, 0.1, 'square', 0.12, null, 0.09); tone(784, 0.2, 'square', 0.12, null, 0.18); },
    fail: function () { tone(330, 0.16, 'square', 0.12); tone(262, 0.3, 'square', 0.12, null, 0.14); },
    setSiren: setSiren,
    setEngine: setEngine,
  };
})();
