# nothing

Caught yourself scrolling? Give your mind a minute of nothing.

**nothing** is a tiny, quiet web page. You don't get another feed. You sit, drop your shoulders and follow a breathing circle. Soft tones mark each breath. There's no voice, no account and no server.

## What it does
- **Sessions:** pick a length on a roller-style scale: ∞ (no clock), or any whole minute from 1 to 60. It starts on 1 min, and each step gives a haptic tick where the device supports it. Timed sits are rounded to the nearest whole breath cycle, so they always end after a complete out breath.
- **Settle-in cues** before each sit: sit comfortably, drop your shoulders, rest attention between the eyebrows…
- **Breath patterns:** *sleep* (4·7·8) or custom. Each phase uses a slider in 0.5s steps:
  - inhale 2–10s
  - hold 0–10s
  - exhale 2–12s
  - hold 0–10s
- **Try now:** plays two breaths of the selected pattern so you can feel it before a sit.
- **Guidance:** tones or vibration. The tone is a soft singing bowl generated with the Web Audio API, and a pitch slider shifts it up or down 6 semitones. Loudness follows the device's volume buttons. Vibration needs a browser with the Vibration API (Android). iPhone Safari doesn't allow websites to vibrate, so it falls back to tones there.
- **Reflection:** after each sit, an optional note on what came up.
- **Progress:** longest sit, longest ∞ sit, and a journal of your notes.

All data stays in your browser's `localStorage` (key `nothing.v1`).

## Run locally
ES modules need a server, so opening the file directly won't work:
```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy to GitHub Pages
1. Push this folder to a GitHub repo.
2. In the repo, go to **Settings → Pages → Build and deployment**. Set Source to *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. The site goes live at `https://<user>.github.io/<repo>/`.

There's no build step and nothing to maintain.

## Files
```
index.html        all views
css/styles.css    dusk palette, light/dark, reduced motion
js/app.js         views and wiring
js/session.js     breath engine (drift-free)
js/wake.js        keeps the screen awake during a sit
assets/keep-awake.mp4  tiny muted video, wake fallback for older iPhones
js/audio.js       tones
js/haptics.js     vibration + picker ticks
js/store.js       local storage
js/stats.js       streaks, trends, insight text
```
