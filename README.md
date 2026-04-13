# Engine Lab

Standalone real-time ship audio workshop for NULL RANGE.

This repo is intentionally narrow: one page, one audio graph, and the default loop assets needed to tune the ship engine voice in-browser.

## Included

- `engine-lab.html` as the only app entry
- `src/audio/shipAudio.js` for the Web Audio engine and sample-slot runtime
- `src/audio/shipAudioPane.js` for the tweak pane controls
- `public/audio/` for the default engine and ambient loop assets

## Local Development

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite for `engine-lab.html`.

## Production Build

```bash
npm run build
```
