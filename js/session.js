// Breath session engine. Timing comes from performance.now(), so it doesn't drift.
import * as audio from './audio.js';
import * as haptics from './haptics.js';

const ORDER = ['inhale', 'holdIn', 'exhale', 'holdOut'];
const ease = (t) => 0.5 - Math.cos(Math.PI * t) / 2;

export function buildPhases(s) {
  return ORDER.filter((k) => s[k] > 0).map((k) => ({ name: k, dur: s[k] * 1000 }));
}

export function phaseLabel(name) {
  return name === 'inhale' ? 'in' : name === 'exhale' ? 'out' : 'hold';
}

/**
 * startSession({ settings, plannedSec|null, onFrame, onPhase, onEnd })
 * onFrame({ phase, phaseT, scale, elapsed, progress })
 * onEnd({ actualSec, completed, cycles, startedAt })
 * Returns { stop() } to end early.
 */
export function startSession({ settings, plannedSec, onFrame, onPhase, onEnd }) {
  const phases = buildPhases(settings);
  // Guide with vibration when chosen and supported; otherwise soft tones.
  const guide = settings.guide === 'vibration' && haptics.supported() ? haptics : audio;
  const { cue, bell, stop } = guide;
  // A timed sit is rounded to the nearest whole number of breath cycles, so it
  // always ends after the last phase (the out breath, or its hold) instead of
  // cutting off mid-breath. With 4·7·8 (19s) a 1 min sit becomes 3 cycles = 57s.
  const cycleMs = phases.reduce((a, p) => a + p.dur, 0);
  const plannedCycles = plannedSec ? Math.max(1, Math.round((plannedSec * 1000) / cycleMs)) : null;
  const plannedMs = plannedCycles ? plannedCycles * cycleMs : null;
  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  let idx = 0;
  let phaseStart = t0;
  let cycles = 0;
  let raf = 0;
  let done = false;
  let wakeLock = null;

  const requestWake = async () => {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') {
        wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch (_) { /* not critical */ }
  };
  const onVis = () => { if (!done && document.visibilityState === 'visible') requestWake(); };
  document.addEventListener('visibilitychange', onVis);
  requestWake();

  cue(phases[0].name, phases[0].dur / 1000);
  onPhase && onPhase(phases[0].name);

  function scaleFor(name, t) {
    if (name === 'inhale') return ease(t);
    if (name === 'exhale') return 1 - ease(t);
    if (name === 'holdIn') return 1;
    return 0;
  }

  function frame(now) {
    if (done) return;
    const elapsed = now - t0;

    if (plannedMs && elapsed >= plannedMs) {
      finish(true, plannedMs);
      return;
    }

    // Advance through any phases that finished (several if the tab was hidden).
    let changed = false;
    while (now - phaseStart >= phases[idx].dur) {
      phaseStart += phases[idx].dur;
      if (idx === phases.length - 1) cycles++;
      idx = (idx + 1) % phases.length;
      changed = true;
    }
    const p = phases[idx];
    if (changed) {
      cue(p.name, (p.dur - (now - phaseStart)) / 1000);
      onPhase && onPhase(p.name);
    }

    const phaseT = Math.min(1, (now - phaseStart) / p.dur);
    onFrame && onFrame({
      phase: p.name,
      phaseT,
      scale: scaleFor(p.name, phaseT),
      elapsed,
      progress: plannedMs ? elapsed / plannedMs : null,
    });
    raf = requestAnimationFrame(frame);
  }

  function finish(completed, elapsedMs) {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVis);
    try { wakeLock && wakeLock.release(); } catch (_) { /* ignore */ }
    if (completed) bell();
    else stop();
    onEnd && onEnd({
      startedAt,
      plannedSec: plannedMs ? Math.round(plannedMs / 1000) : null,
      actualSec: Math.round(elapsedMs / 1000),
      completed,
      cycles: completed ? plannedCycles : cycles,
    });
  }

  raf = requestAnimationFrame(frame);

  return {
    stop() {
      finish(false, performance.now() - t0);
    },
  };
}
