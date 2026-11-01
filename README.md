# EXIF Viewer BD

Offline, bilingual (EN / বাংলা) photo metadata viewer. Drop a JPEG photo in and see
its camera, settings, date and GPS location — then download an EXIF-free copy before
you share it. **100% offline: your photos are parsed in your browser and never uploaded.**

## Problem

Photos quietly carry metadata: the camera model, the exact time a shot was taken, and
often GPS coordinates of where it was taken. People share photos every day without
realising that information travels with the file. EXIF Viewer BD makes that hidden
data visible first, and gives you a one-click way to strip it before sharing.

## Features

1. **JPEG EXIF parsing in the browser** — a hand-written TIFF/EXIF parser (no
   libraries, no network): camera make/model, date/time taken, shutter speed,
   aperture, ISO, exposure program, focal length, pixel dimensions, orientation.
2. **GPS location display** — latitude/longitude as decimal degrees and
   degrees-minutes-seconds, altitude when present, plus an OpenStreetMap link
   (the link is the only outbound click; no map data is fetched by the app).
3. **EXIF stripper** — download a copy of the photo with the EXIF (APP1) segment
   removed. The photo pixels are untouched. Honest scope: only the EXIF segment is
   removed — ICC profiles and JPEG comments, if present, remain.
4. **Drag-and-drop + file picker** — with file validation (JPEG only, up to 50 MB)
   and clear empty / loading / error states (not a JPEG, no EXIF found, damaged file).
5. **Demo EXIF file** — a built-in synthetic file with known tags (Canon / EOS Test,
   1/125 s, f/2.8, ISO 200, Dhaka GPS) so the viewer can be tried without a photo.
   It carries EXIF tags only, no photo pixels, and the UI says so.
6. **Copy details as text** — one click copies the file info and all parsed tags.
7. **Bilingual UI** — EN / বাংলা toggle, persisted in localStorage, with Bengali
   digits in the Bangla view. Responsive down to 390 px wide.

## Stack

Vanilla HTML + CSS + JavaScript. No build step, no dependencies, no backend.
`js/logic.js` holds all pure logic (parser, stripper, test-file builder) and is
unit-tested in Node; `js/app.js` is DOM glue only; `js/i18n.js` holds UI strings.

## Prerequisites

Any modern browser. For tests: Node.js 18+.

## Run locally

Open `index.html` in a browser, or serve the folder:

```sh
npx serve .
# or
python3 -m http.server 8000
```

Then open http://localhost:8000 and drop in a JPEG photo (or click "Load demo EXIF file").

## Testing

```sh
node tests/unit.test.mjs   # 59 checks: LE + BE TIFF round-trips, GPS math,
                           # exposure formatting, error codes, stripper behaviour,
                           # validation, i18n key parity, pure-ASCII sources
node tests/smoke.mjs       # 20 headless-Chrome checks (raw CDP): empty state,
                           # demo parse, GPS + map link, BN toggle + persistence,
                           # clear, 390 px no-overflow, 0 console errors
```

The smoke test needs a headless Chromium listening on `127.0.0.1:9225`
(the stock Hatch Chromium refuses to start in this VM with a WebGL domain-policy
error, so the run used the Playwright `chromium_headless_shell-1187` binary —
same Chromium engine, real DOM/CSS behaviour).

## Deployment

Static site — publish the folder as-is to GitHub Pages (or any static host).
No environment variables, no secrets, no server.

## Limitations

- JPEG only. PNG/WebP photos report "no EXIF data" (PNG EXIF via the eXIf chunk
  is not parsed yet).
- The parser reads IFD0, the Exif sub-IFD and the GPS sub-IFD. Maker-note and
  thumbnail data are ignored.
- The stripper removes the EXIF APP1 segment only; it does not remove ICC
  profiles, JPEG comments or XMP blocks. The UI states this explicitly.
- GPS coordinates come from the photo itself; a photo without GPS shows no
  location section. Coordinates may be the camera's last-known fix, not proof of
  where the photo was taken.
- The demo file is synthetic EXIF without image data — it proves the parser, it
  is not a viewable photo.

## Status

MVP complete and tested (see `TEST_RESULTS.md`). Built by the MUSE Project Factory
(run slot 16:00, 2026-11-01).
