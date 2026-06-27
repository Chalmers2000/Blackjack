/* ======================================================================
   AUDIO — tiny Web Audio synth (ported from the baccarat reference)
   ====================================================================== */

let audioCtx = null;
function initAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) {}
  }
}
function playTone(freq, dur, type = 'sine', vol = 0.08) {
  if (!audioCtx) return;
  try {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
  } catch (e) {}
}
function sndCard() { playTone(800, .06, 'triangle', .1); }
function sndChip() { playTone(1200, .04, 'sine', .06); }
function sndWin() { playTone(523, .1, 'sine', .1); setTimeout(() => playTone(659, .1, 'sine', .1), 100); setTimeout(() => playTone(784, .15, 'sine', .1), 200); }
function sndLose() { playTone(250, .2, 'sawtooth', .06); }
function sndPush() { playTone(440, .12, 'triangle', .06); }
function sndBust() { playTone(180, .25, 'sawtooth', .08); }
