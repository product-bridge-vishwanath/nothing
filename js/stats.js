// Progress, computed from session history. Honest numbers only.

export function dayKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function fmtDur(sec) {
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

export function computeStats(sessions, today = new Date()) {
  const sits = sessions.filter((s) => s.actualSec >= 5); // ignore accidental taps
  const totalSec = sits.reduce((a, s) => a + s.actualSec, 0);

  const days = new Set(sits.map((s) => dayKey(s.startedAt)));

  // Current streak: consecutive days up to today (or yesterday, so it isn't lost before today's sit).
  let current = 0;
  let cursor = days.has(dayKey(today)) ? today : addDays(today, -1);
  while (days.has(dayKey(cursor))) {
    current++;
    cursor = addDays(cursor, -1);
  }

  // Longest streak.
  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const k of sorted) {
    run = prev && dayKey(addDays(new Date(prev + 'T12:00'), 1)) === k ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = k;
  }

  const timeless = sits.filter((s) => !s.plannedSec);
  const longestTimeless = timeless.reduce((m, s) => Math.max(m, s.actualSec), 0);
  const longestSit = sits.reduce((m, s) => Math.max(m, s.actualSec), 0);

  const timed = sits.filter((s) => s.plannedSec);
  const completionRate = timed.length ? timed.filter((s) => s.completed).length / timed.length : null;

  // Trend: early sits vs recent sits.
  let trend = null;
  if (sits.length >= 4) {
    const n = Math.min(5, Math.floor(sits.length / 2));
    const early = avg(sits.slice(0, n).map((s) => s.actualSec));
    const recent = avg(sits.slice(-n).map((s) => s.actualSec));
    const spanDays = Math.max(1, Math.round((new Date(sits[sits.length - 1].startedAt) - new Date(sits[0].startedAt)) / 864e5));
    trend = { early, recent, spanDays, change: early ? (recent - early) / early : 0 };
  }

  return {
    count: sits.length,
    totalSec,
    current,
    longest,
    longestTimeless,
    longestSit,
    completionRate,
    trend,
  };
}

// A short, calm sentence about progress. Never overclaims.
export function insight(st) {
  if (st.count === 0) return 'Your first sit is the hardest. You did it.';
  if (st.count === 1) return 'One sit of nothing. That is how it starts.';
  const t = st.trend;
  if (t && t.change > 0.15) {
    return `You're staying with stillness longer. Your average sit grew from ${fmtDur(t.early)} to ${fmtDur(t.recent)}${t.spanDays > 1 ? ` over ${t.spanDays} days` : ''}.`;
  }
  if (st.current >= 3) return `${st.current} days in a row. Steadiness is a kind of focus.`;
  if (st.completionRate !== null && st.completionRate >= 0.8 && st.count >= 3) {
    return `You stayed to the end in ${Math.round(st.completionRate * 100)}% of your timed sits.`;
  }
  return `${fmtDur(st.totalSec)} of nothing so far, across ${st.count} sits.`;
}

