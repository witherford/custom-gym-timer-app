# Custom Gym Timer

A configurable interval and round timer for gym workouts, built as an installable Progressive Web App. Single-file vanilla HTML/CSS/JS — no build step, no dependencies.

## Live demo

https://witherford.github.io/custom-gym-timer-app/

## Install as a PWA

- **iOS Safari**: Share → Add to Home Screen.
- **Android Chrome**: Menu → Install app (or the install banner that appears).
- **Desktop Chrome/Edge**: Click the install icon in the address bar.

After install, the app launches standalone (no browser chrome) and works fully offline.

## Run locally

```bash
python -m http.server 8000
# then open http://localhost:8000
```

A local HTTP server is required — service workers don't register from `file://`.

## Project structure

```
.
├── index.html              # App (HTML + inline CSS + inline JS)
├── manifest.webmanifest    # PWA manifest
├── service-worker.js       # Offline caching
├── icons/                  # 192, 512, 512 maskable
├── .nojekyll               # Disable Jekyll on GitHub Pages
└── README.md
```

## License

MIT.
