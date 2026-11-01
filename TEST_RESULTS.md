# EXIF Viewer BD — Test Results (2026-11-01, 16:00 slot run)

## Unit tests — 59/59 passed (0 failed)
Command: `node tests/unit.test.mjs`
- LE + BE TIFF round-trips via the in-repo test-JPEG builder: make Canon, model
  EOS Test, datetimeOriginal 2026:11:01 10:00:00, 1/125 s, f/2.8, ISO 200,
  50 mm, 4000x3000, GPS 23.8103 / 90.4125, DMS 23°48′37.08″N, altitude 10 m.
- Custom builder values: Nikon/Z Test, ISO 800, 1/60 s, f/1.8, S/W hemisphere
  signs (-10, -20.5).
- Exposure formatting: 2 s, 1/2 s, 1/3 s.
- Error codes: non-JPEG -> NOT_JPEG; JPEG without EXIF -> NO_EXIF.
- Stripper: removes exactly 1 EXIF segment, output keeps SOI/EOI, re-parse
  throws NO_EXIF, output smaller; a non-EXIF APP1 (XMP-style) segment is kept.
- Validation: PNG rejected, empty rejected, 51 MB rejected, valid JPEG accepted.
- Helpers: Bengali digits 2026 -> ২০২৬ (rendered via \u escapes), 2048 -> 2 KB,
  OpenStreetMap URL format.
- i18n: EN and BN key sets identical (44 keys), all non-empty.
- Sources pure ASCII (Bengali as \uXXXX escapes) in logic/app/i18n/index/style.
- Repairs during testing (2, both test-side except where noted):
  1. Big-endian SHORT inline value: the test builder first wrote ISO in the last
     2 bytes of the value field; per the TIFF left-justified rule it belongs in
     the first 2 bytes. Builder fixed; parser was already correct. Real-world
     big-endian files follow the same rule.
  2. Test expectation for 1/3 s exposure corrected (1/3 s, not 0.33 s) — the
     formatter's nearest-unit-fraction rule is correct.

## Headless-Chrome smoke — 20/20 passed, 0 console/page errors
Command: `node tests/smoke.mjs` (raw CDP against Playwright headless_shell-1187
on 127.0.0.1:9225, file:// page; the stock /opt/meta-chromium/chrome refuses to
start in this VM: "Hatch WebGL domain policy is required for browser startup").
Checks: h1 title, empty state initially, demo load shows result + Canon/EOS Test/
1/125 s/f/2.8, GPS decimals 23.810300/90.412500, OpenStreetMap link, demo note,
strip + copy buttons enabled, BN toggle changes tagline and persists across
reload, clear returns to empty state, 390 px viewport has no horizontal overflow.

## Known limits (also in README)
JPEG only; maker notes and thumbnails ignored; stripper removes the EXIF APP1
segment only (ICC/comments/XMP may remain); demo file has EXIF tags but no pixels.
