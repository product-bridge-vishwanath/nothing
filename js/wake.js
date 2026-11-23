// Keeps the screen awake from the tap on "begin" until the sit ends, so the
// phone doesn't auto-lock mid-breath.
//
// Uses the Screen Wake Lock API. Where that is missing or known to be broken
// (iOS before 16.4, and home-screen web apps on iOS before 18.4) it falls back
// to a tiny muted looping video, which iOS treats as media playing and so
// doesn't auto-lock. If the native request is refused, it falls back too.
//
// It can't stop someone pressing the side button, and iOS Low Power Mode may
// still override it.

const ua = navigator.userAgent;
const isIOS = /iP(hone|ad|od)/.test(ua) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// iOS version as major.minor, e.g. 18.4 (null when unknown).
const iosVersion = (() => {
  if (!isIOS) return null;
  const m = ua.match(/OS (\d+)_(\d+)/) || ua.match(/Version\/(\d+)\.(\d+)/);
  return m ? Number(m[1]) + Number(m[2]) / 100 : null;
})();

const standalone = navigator.standalone === true ||
  (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);

const hasNative = 'wakeLock' in navigator;
const nativeBroken = isIOS && standalone && iosVersion !== null && iosVersion < 18.04;
let useVideo = !hasNative || nativeBroken;

let active = false;
let sentinel = null;
let video = null;

function getVideo() {
  if (!video) {
    video = document.createElement('video');
    video.src = 'assets/keep-awake.mp4';
    video.muted = true;
    video.loop = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    video.tabIndex = -1;
    video.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01;pointer-events:none;';
    document.body.appendChild(video);
  }
  return video;
}

function playVideo() {
  try {
    const p = getVideo().play();
    if (p && p.catch) p.catch(() => { /* not critical */ });
  } catch (_) { /* not critical */ }
}

let pending = false;
async function requestNative() {
  if (sentinel || pending || document.visibilityState !== 'visible') return;
  pending = true;
  try {
    const s = await navigator.wakeLock.request('screen');
    pending = false;
    if (!active) { s.release().catch(() => {}); return; }
    sentinel = s;
    // The system drops the lock when the page is hidden; we ask again on return.
    s.addEventListener('release', () => { if (sentinel === s) sentinel = null; });
  } catch (_) {
    pending = false;
    // Refused (e.g. power saving or browser policy): try the video instead.
    if (active) { useVideo = true; playVideo(); }
  }
}

// Call inside the tap that starts the sit, so the video fallback may play.
export function acquire() {
  if (active) return;
  active = true;
  if (useVideo) playVideo();
  else requestNative();
}

export function release() {
  if (!active) return;
  active = false;
  const s = sentinel;
  sentinel = null;
  if (s) s.release().catch(() => {});
  if (video) video.pause();
}

document.addEventListener('visibilitychange', () => {
  if (!active || document.visibilityState !== 'visible') return;
  if (useVideo) playVideo();
  else requestNative();
});
