// Local-only persistence. Everything lives in this browser; nothing leaves it.
const KEY = 'nothing.v1';

// One named pattern; everything else is "custom".
export const PRESETS = {
  sleep: { label: 'sleep', inhale: 4, holdIn: 7, exhale: 8, holdOut: 0 },
};

export const RANGES = {
  inhale: [2, 10],
  holdIn: [0, 10],
  exhale: [2, 12],
  holdOut: [0, 10],
};

const DEFAULT_SETTINGS = {
  preset: 'custom',
  inhale: 4,
  holdIn: 0,
  exhale: 6,
  holdOut: 0,
  guide: 'tones',     // 'tones' | 'vibration'
  pitch: 0,          // semitones, -6..+6
  lastDuration: 60,   // seconds; null = timeless (∞)
};

export function clampBreath(key, v) {
  const [lo, hi] = RANGES[key];
  const n = Math.round(Number(v) * 2) / 2; // 0.5s steps
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

let memory = null; // fallback when storage is unavailable (private mode etc.)

function load() {
  if (memory) return memory;
  let data = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = JSON.parse(raw);
  } catch (_) { /* ignore */ }
  if (!data || data.version !== 1) data = { version: 1, settings: {}, sessions: [] };
  data.settings = { ...DEFAULT_SETTINGS, ...data.settings };
  // Older versions had calm / box / 4·7·8 presets.
  if (data.settings.preset === '478') data.settings.preset = 'sleep';
  if (!PRESETS[data.settings.preset]) data.settings.preset = 'custom';
  if (data.settings.guide !== 'vibration') data.settings.guide = 'tones';
  delete data.settings.tone; // only one tone (bowl) now
  data.settings.pitch = Math.max(-6, Math.min(6, Math.round(Number(data.settings.pitch) || 0)));
  delete data.settings.volume;
  for (const k of Object.keys(RANGES)) data.settings[k] = clampBreath(k, data.settings[k]);
  if (!Array.isArray(data.sessions)) data.sessions = [];
  memory = data;
  return data;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(memory));
  } catch (_) { /* keep working in memory */ }
}

export function getSettings() {
  return { ...load().settings };
}

export function updateSettings(patch) {
  const d = load();
  d.settings = { ...d.settings, ...patch };
  save();
  return { ...d.settings };
}

export function getSessions() {
  return load().sessions.slice();
}

export function addSession(s) {
  const d = load();
  const session = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    reflection: null,
    ...s,
  };
  d.sessions.push(session);
  save();
  return session;
}

export function setReflection(id, text) {
  const d = load();
  const s = d.sessions.find((x) => x.id === id);
  if (s) {
    s.reflection = text && text.trim() ? text.trim() : null;
    save();
  }
}
