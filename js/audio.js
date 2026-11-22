// Soft singing-bowl tones generated with the Web Audio API. No voice, no files.
// The user can shift the pitch; loudness is fixed and gentle, and the device's
// own volume buttons control the rest.
let ctx = null;
let master = null;
let pitch = 1; // frequency multiplier from semitones

const MASTER_GAIN = 0.1;

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

// Semitones from -6 to +6.
export function setPitch(semitones) {
  pitch = Math.pow(2, (Number(semitones) || 0) / 12);
}

// A single sine partial with a quick strike and long decay, through a gentle lowpass.
function partial({ freq, peak, release, detune = 0, cutoff = 2000, delay = 0 }) {
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = cutoff;

  osc.type = 'sine';
  osc.detune.value = detune;
  osc.frequency.value = freq * pitch;

  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.02 + release);

  osc.connect(lp).connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + release + 0.1);
}

// Singing-bowl strike: inharmonic partials, a slightly detuned pair for a slow shimmer.
function strike(f, level = 1, length = 1) {
  if (!ctx) return;
  partial({ freq: f, peak: 0.42 * level, release: 4.5 * length });
  partial({ freq: f, peak: 0.2 * level, release: 4.0 * length, detune: 7 });
  partial({ freq: f * 2.71, peak: 0.07 * level, release: 2.4 * length, cutoff: 2400 });
  partial({ freq: f * 5.15, peak: 0.025 * level, release: 1.2 * length, cutoff: 3000 });
}

// phase: inhale | holdIn | exhale | holdOut
export function cue(phase) {
  if (phase === 'inhale') strike(294);
  else if (phase === 'exhale') strike(220, 0.9, 1.2);
  else strike(165, 0.35, 0.6);
}

// Closing sound at the end of a completed sit.
export function bell() {
  strike(196, 1, 1.5);
}

// Ended early: bowl strikes simply ring out.
export function stop() {}

// A short sample so people can hear the current pitch.
let previewTimer = 0;
export function preview() {
  unlock();
  clearTimeout(previewTimer);
  cue('inhale');
  previewTimer = setTimeout(() => cue('exhale'), 1500);
}
