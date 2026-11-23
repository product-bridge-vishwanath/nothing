import * as store from './store.js';
import * as audio from './audio.js';
import * as haptics from './haptics.js';
import * as wake from './wake.js';
import { startSession, buildPhases, phaseLabel } from './session.js';
import { computeStats, insight, fmtDur } from './stats.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

let settings = store.getSettings();
audio.setPitch(settings.pitch);

let current = null;        // running session handle
let settleTimer = null;
let lastSession = null;    // saved session awaiting reflection

/* ---------------- views ---------------- */
function show(name) {
  $$('.view').forEach((v) => v.classList.toggle('active', v.dataset.view === name));
  if (name === 'home') renderHome();
  if (name === 'progress') renderProgress();
  if (name === 'settings') renderSettings();
  if (name !== 'settings') stopTry();
  // The screen stays awake from the tap on begin until the sit is over.
  if (name !== 'settle' && name !== 'session') wake.release();
  window.scrollTo(0, 0);
}

function route() {
  const h = location.hash.replace('#', '');
  if (current || settleTimer) abortSession();
  show(['progress', 'settings', 'why'].includes(h) ? h : 'home');
}
window.addEventListener('hashchange', route);

/* ---------------- home ---------------- */
/* Duration ruler: a roller-like scale beside the minutes.
   ∞ on top, then every minute up to 60. Longer, labelled ticks every 5 minutes. */
const DURATIONS = [0, ...Array.from({ length: 60 }, (_, i) => (i + 1) * 60)];
const DEFAULT_IDX = 1; // 1 min
const ruler = $('#ruler');
ruler.innerHTML = DURATIONS.map((d, i) => {
  const m = d / 60;
  const major = d === 0 || m % 5 === 0;
  const lbl = d === 0 ? '∞' : major ? String(m) : '';
  return `<div class="mark${major ? ' major' : ''}" data-i="${i}"><span class="tick"></span>` +
    `<span class="lbl">${lbl}</span></div>`;
}).join('');
const marks = $$('.mark', ruler);
let rulerIdx = DEFAULT_IDX;

function markH() { return marks[0].offsetHeight || 14; }

// Pad so the first and last marks can reach the centre line.
function padRuler() {
  const pad = Math.max(0, (ruler.clientHeight - markH()) / 2);
  ruler.style.paddingTop = ruler.style.paddingBottom = `${pad}px`;
}

// Tilt each mark away by its distance from the centre so the scale curves like a roller.
let rollRaf = 0;
function paintRoller() {
  rollRaf = 0;
  const pos = ruler.scrollTop / markH();
  marks.forEach((el, j) => {
    const off = j - pos;
    const angle = Math.max(-80, Math.min(80, off * 8.5));
    el.style.transform = `rotateX(${(-angle).toFixed(2)}deg)`;
    el.style.opacity = Math.max(0, Math.cos((angle * Math.PI) / 180)).toFixed(3);
  });
}

function setRulerIdx(i, scroll) {
  rulerIdx = Math.max(0, Math.min(DURATIONS.length - 1, i));
  marks.forEach((el, j) => el.classList.toggle('active', j === rulerIdx));
  const d = DURATIONS[rulerIdx];
  $('#chosen-n').textContent = d === 0 ? '∞' : String(d / 60);
  $('#ruler-unit').textContent = d === 0 ? 'no timer' : 'min';
  const text = d === 0 ? 'timeless, no timer' : `${d / 60} ${d === 60 ? 'minute' : 'minutes'}`;
  ruler.setAttribute('aria-valuenow', String(rulerIdx));
  ruler.setAttribute('aria-valuetext', text);
  $('#chosen').setAttribute('aria-label', `Begin, ${text}`);
  if (scroll) ruler.scrollTo({ top: rulerIdx * markH(), behavior: scroll });
}

let rulerSaveTimer = 0;
ruler.addEventListener('scroll', () => {
  if (!rollRaf) rollRaf = requestAnimationFrame(paintRoller);
  const i = Math.max(0, Math.min(DURATIONS.length - 1, Math.round(ruler.scrollTop / markH())));
  if (i !== rulerIdx) {
    setRulerIdx(i);
    haptics.tick();
  }
  clearTimeout(rulerSaveTimer);
  rulerSaveTimer = setTimeout(() => {
    settings = store.updateSettings({ lastDuration: DURATIONS[rulerIdx] || null });
  }, 150);
}, { passive: true });

ruler.addEventListener('click', (e) => {
  const m = e.target.closest('.mark');
  if (m) setRulerIdx(Number(m.dataset.i), 'smooth');
});

ruler.addEventListener('keydown', (e) => {
  const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1, PageDown: 5, PageUp: -5 }[e.key];
  if (step) { e.preventDefault(); setRulerIdx(rulerIdx + step, 'smooth'); }
  else if (e.key === 'Home') { e.preventDefault(); setRulerIdx(0, 'smooth'); }
  else if (e.key === 'End') { e.preventDefault(); setRulerIdx(DURATIONS.length - 1, 'smooth'); }
  else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startFromHome(); }
});

$('#chosen').addEventListener('click', startFromHome);

window.addEventListener('resize', () => {
  if (!$('.view-home').classList.contains('active')) return;
  padRuler();
  setRulerIdx(rulerIdx, 'instant');
});

function renderHome() {
  const saved = DURATIONS.indexOf(settings.lastDuration ?? 0);
  const i = saved === -1 ? DEFAULT_IDX : saved;
  // Wait a frame so the ruler has layout before positioning.
  requestAnimationFrame(() => { padRuler(); setRulerIdx(i, 'instant'); paintRoller(); });
  // The hint is only for newcomers.
  $('#hint').hidden = store.getSessions().length > 0;
}

function startFromHome() {
  settings = store.updateSettings({ lastDuration: DURATIONS[rulerIdx] || null });
  audio.unlock(); // must happen inside a user gesture
  wake.acquire(); // also inside the tap, so the fallback video may play
  settleIn();
}

/* ---------------- settle in ---------------- */
const SETTLE = [
  'Sit comfortably.',
  'Drop your shoulders.',
  'Loosen your jaw. Soften your face.',
  'Rest your attention between your eyebrows.',
  'Just breathe.',
];

function settleIn() {
  show('settle');
  const line = $('#settle-line');
  let i = 0;
  const step = () => {
    if (i >= SETTLE.length) {
      line.classList.remove('show');
      settleTimer = setTimeout(() => { settleTimer = null; begin(); }, 1200);
      return;
    }
    line.textContent = SETTLE[i++];
    line.classList.add('show');
    settleTimer = setTimeout(() => {
      line.classList.remove('show');
      settleTimer = setTimeout(step, 1300);
    }, 2400);
  };
  line.classList.remove('show');
  settleTimer = setTimeout(step, 400);
}

function clearSettle() {
  clearTimeout(settleTimer);
  settleTimer = null;
}

$('#settle-skip').addEventListener('click', () => { clearSettle(); begin(); });

/* ---------------- session ---------------- */
const orb = $('#orb');
const phaseEl = $('#phase');
const ring = $('.ring');
const ringFill = $('#ring-fill');
const endBtn = $('#end');
let wakeTimer = 0;

function begin() {
  show('session');
  const planned = settings.lastDuration || null;
  ring.classList.toggle('hidden', !planned);
  ringFill.style.strokeDashoffset = '1';
  current = startSession({
    settings,
    plannedSec: planned,
    onPhase: (p) => { phaseEl.textContent = phaseLabel(p); },
    onFrame: ({ scale, progress }) => {
      orb.style.setProperty('--s', scale.toFixed(4));
      if (progress !== null) ringFill.style.strokeDashoffset = String(1 - progress);
    },
    onEnd: finished,
  });
}

function finished(result) {
  current = null;
  if (result.actualSec < 5) { // accidental start: don't record
    if (!suppressNav) goHome();
    return;
  }
  lastSession = store.addSession(result);
  if (suppressNav) return;
  $('#reflection').value = '';
  // Let the closing tone ring for a moment before moving on.
  setTimeout(() => show('reflect'), result.completed ? 1600 : 300);
}

// Navigating away mid-session: record it as ended early, but stay on the new route.
let suppressNav = false;
function abortSession() {
  clearSettle();
  if (current) {
    suppressNav = true;
    current.stop();
    suppressNav = false;
  }
}

endBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  current && current.stop();
});

$('.view-session').addEventListener('pointerdown', () => {
  endBtn.classList.add('awake');
  clearTimeout(wakeTimer);
  wakeTimer = setTimeout(() => endBtn.classList.remove('awake'), 3000);
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (current) current.stop();
  else if (settleTimer) { clearSettle(); goHome(); }
});

/* ---------------- reflect ---------------- */
$('#reflect-save').addEventListener('click', () => {
  if (lastSession) store.setReflection(lastSession.id, $('#reflection').value);
  renderSummary();
});
$('#reflect-skip').addEventListener('click', renderSummary);

/* ---------------- summary ---------------- */
function statsHTML(items) {
  return items.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
}

function renderSummary() {
  const s = lastSession;
  const st = computeStats(store.getSessions());
  $('#summary-title').textContent = s && s.completed ? 'You did nothing.' : 'A little nothing still counts.';
  $('#summary-sub').textContent = s
    ? (s.plannedSec ? (s.completed ? 'You stayed the whole way.' : `You sat for ${fmtDur(s.actualSec)} of ${fmtDur(s.plannedSec)}.`) : 'A timeless sit, ended when you were ready.')
    : '';
  $('#summary-stats').innerHTML = statsHTML([
    ['this sit', fmtDur(s ? s.actualSec : 0)],
    ['breaths', s ? s.cycles : 0],
    ['streak', `${st.current} ${st.current === 1 ? 'day' : 'days'}`],
    ['total', fmtDur(st.totalSec)],
  ]);
  $('#summary-insight').textContent = insight(st);
  show('summary');
}

function goHome() {
  if (location.hash && location.hash !== '#home') location.hash = '#home';
  else show('home');
}
$('#summary-home').addEventListener('click', goHome);

/* ---------------- progress ---------------- */
function esc(t) {
  return t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderProgress() {
  const sessions = store.getSessions();
  const st = computeStats(sessions);
  $('#progress-stats').innerHTML = statsHTML([
    ['longest sit', st.longestSit ? fmtDur(st.longestSit) : '–'],
    ['longest ∞', st.longestTimeless ? fmtDur(st.longestTimeless) : '–'],
  ]);

  const notes = sessions.filter((s) => s.reflection).slice(-50).reverse();
  $('#journal').innerHTML = notes.length
    ? notes.map((s) => `<li><time>${new Date(s.startedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${s.plannedSec ? '' : '∞ · '}${fmtDur(s.actualSec)}</time><p>${esc(s.reflection)}</p></li>`).join('')
    : '<li class="empty">Your notes after each sit will gather here.</li>';
}

/* ---------------- settings ---------------- */
const BREATH_KEYS = ['inhale', 'holdIn', 'exhale', 'holdOut'];

function renderSettings() {
  $$('#presets .chip').forEach((c) => c.setAttribute('aria-checked', String(c.dataset.preset === settings.preset)));
  $$('.sliders input').forEach((inp) => {
    inp.value = settings[inp.dataset.key];
    inp.nextElementSibling.textContent = `${settings[inp.dataset.key]}s`;
  });
  $$('#guide button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.guide === settings.guide)));
  const vib = settings.guide === 'vibration';
  $('#guide-note').textContent = vib && !haptics.supported()
    ? "This browser can't vibrate (iPhones don't allow it for websites), so soft tones will play instead."
    : vib ? 'One long pulse to breathe in, two soft pulses to breathe out, a light tap to hold.'
      : 'A soft singing-bowl tone: higher to breathe in, lower to breathe out, a faint low note to hold.';
  $('#tone-settings').hidden = vib;
  $('#pitch').value = settings.pitch;
  $('#pitch-out').textContent = pitchText(settings.pitch);
  if (!trial) resetPreview();
}

$('#presets').addEventListener('click', (e) => {
  const c = e.target.closest('.chip');
  if (!c) return;
  const p = store.PRESETS[c.dataset.preset];
  settings = store.updateSettings(p
    ? { preset: c.dataset.preset, inhale: p.inhale, holdIn: p.holdIn, exhale: p.exhale, holdOut: p.holdOut }
    : { preset: 'custom' });
  stopTry();
  renderSettings();
});

$$('.sliders input').forEach((inp) => {
  inp.addEventListener('input', () => {
    const k = inp.dataset.key;
    const v = store.clampBreath(k, inp.value);
    settings = store.updateSettings({ [k]: v, preset: matchPreset({ ...settings, [k]: v }) });
    stopTry();
    renderSettings();
  });
});

function matchPreset(s) {
  for (const [id, p] of Object.entries(store.PRESETS)) {
    if (BREATH_KEYS.every((k) => p[k] === s[k])) return id;
  }
  return 'custom';
}

$('#guide').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  stopTry();
  settings = store.updateSettings({ guide: b.dataset.guide });
  renderSettings();
  // Let them feel or hear it.
  if (settings.guide === 'vibration') haptics.cue('inhale');
  else audio.preview();
});

function pitchText(n) {
  return n === 0 ? '0' : n > 0 ? `+${n}` : `−${-n}`;
}

$('#pitch').addEventListener('input', (e) => {
  settings = store.updateSettings({ pitch: Number(e.target.value) });
  audio.setPitch(settings.pitch);
  $('#pitch-out').textContent = pitchText(settings.pitch);
});
// Play the tone when they let go, so they can hear the new pitch.
$('#pitch').addEventListener('change', () => { if (!trial) audio.preview(); });

/* Try now: play two cycles of the current pattern with tones or vibration. */
let trial = null;
const pOrb = $('#preview-orb');
const pLabel = $('#preview-phase');
const tryBtn = $('#try');

function resetPreview() {
  pOrb.style.setProperty('--s', '0');
  const parts = [`in ${settings.inhale}`];
  if (settings.holdIn) parts.push(`hold ${settings.holdIn}`);
  parts.push(`out ${settings.exhale}`);
  if (settings.holdOut) parts.push(`hold ${settings.holdOut}`);
  pLabel.textContent = parts.join(' · ');
  tryBtn.textContent = 'try now';
}

function stopTry() {
  if (!trial) return;
  const t = trial;
  trial = null;
  t.stop();
  resetPreview();
}

tryBtn.addEventListener('click', () => {
  if (trial) { stopTry(); return; }
  audio.unlock(); // inside the tap, so tones can play
  const cycle = buildPhases(settings).reduce((a, p) => a + p.dur, 0) / 1000;
  tryBtn.textContent = 'stop';
  trial = startSession({
    settings,
    plannedSec: cycle * 2,
    onFrame: ({ phase, phaseT, scale }) => {
      pOrb.style.setProperty('--s', scale.toFixed(4));
      pLabel.textContent = `${phaseLabel(phase)} · ${Math.max(1, Math.ceil(settings[phase] * (1 - phaseT)))}`;
    },
    onEnd: () => {
      if (!trial) return; // stopped by hand
      trial = null;
      setTimeout(() => { if (!trial) resetPreview(); }, 1200);
    },
  });
});

/* ---------------- boot ---------------- */
route();
