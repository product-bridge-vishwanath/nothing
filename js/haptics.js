// Haptic feedback. Android browsers support navigator.vibrate.
// iPhone Safari has no vibrate API; for the picker tick we use the iOS 18+
// trick of toggling a native switch, which triggers a light system haptic.
const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let iosLabel = null;
function iosTick() {
  if (!iosLabel) {
    const wrap = document.createElement('div');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none;';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.id = 'nothing-haptic';
    input.tabIndex = -1;
    iosLabel = document.createElement('label');
    iosLabel.htmlFor = input.id;
    wrap.append(input, iosLabel);
    document.body.appendChild(wrap);
  }
  iosLabel.click();
}

// Whether phase-by-phase vibration guidance can work on this device.
export function supported() {
  return canVibrate;
}

// A tiny tick for the duration picker.
export function tick() {
  try {
    if (canVibrate) navigator.vibrate(8);
    else if (isIOS) iosTick();
  } catch (_) { /* ignore */ }
}

function buzz(pattern) {
  try { canVibrate && navigator.vibrate(pattern); } catch (_) { /* ignore */ }
}

// Breath guidance: one long pulse = in, two soft pulses = out, a brief tap = hold.
export function cue(phase) {
  switch (phase) {
    case 'inhale': buzz(120); break;
    case 'exhale': buzz([50, 90, 50]); break;
    case 'holdIn':
    case 'holdOut': buzz(25); break;
  }
}

export function bell() {
  buzz([220, 160, 220]);
}

export function stop() {
  buzz(0);
}
