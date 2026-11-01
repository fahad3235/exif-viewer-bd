// Node unit tests for EXIF Viewer BD logic. Run: node tests/unit.test.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const L = require('../js/logic.js');
const STR = require('../js/i18n.js');
let pass = 0, fail = 0;
function check(name, cond, extra = '') { if (cond) pass++; else { fail++; console.log('FAIL: ' + name + (extra ? ' — ' + extra : '')); } }
function eq(name, got, want) { check(name, got === want, 'got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want)); }

// LE + BE round-trip
for (const e of ['LE', 'BE']) {
  const r = L.parseExif(L.buildTestJpeg({ endian: e }));
  eq(e + ' make', r.tags.make, 'Canon');
  eq(e + ' model', r.tags.model, 'EOS Test');
  eq(e + ' datetimeOriginal', r.tags.datetimeOriginal, '2026:11:01 10:00:00');
  eq(e + ' exposure', r.tags.exposureTime, '1/125 s');
  eq(e + ' fNumber', r.tags.fNumber, 'f/2.8');
  eq(e + ' iso', r.tags.iso, 200);
  eq(e + ' focal', r.tags.focalLength, '50 mm');
  eq(e + ' px', r.tags.pixelXDimension, 4000);
  eq(e + ' gps lat', Math.abs(r.gps.latitude - 23.8103) < 1e-9, true);
  eq(e + ' gps lon', Math.abs(r.gps.longitude - 90.4125) < 1e-9, true);
  eq(e + ' gps dms lat', r.gps.latitudeDMS, '23°48′37.08″N');
  eq(e + ' gps alt', r.gps.altitude, 10);
}
// Custom builder values
{
  const r = L.parseExif(L.buildTestJpeg({ make: 'Nikon', model: 'Z Test', iso: 800, exposureNum: 1, exposureDen: 60, fNum: 18, focalNum: 35, latRef: 'S', lonRef: 'W', latDMS: [[10, 1], [0, 1], [0, 1]], lonDMS: [[20, 1], [30, 1], [0, 1]] }));
  eq('custom make', r.tags.make, 'Nikon');
  eq('custom iso', r.tags.iso, 800);
  eq('custom exposure', r.tags.exposureTime, '1/60 s');
  eq('custom f', r.tags.fNumber, 'f/1.8');
  eq('custom S/W signs', r.gps.latitude < 0 && r.gps.longitude < 0, true);
  eq('custom lat', r.gps.latitude, -10);
  eq('custom lon', r.gps.longitude, -20.5);
}
// Exposure formatting
eq('exposure 2s', L.formatExposure({ value: 2 }), '2 s');
eq('exposure 0.5s', L.formatExposure({ value: 0.5 }), '1/2 s');
eq('exposure 1/3 exact', L.formatExposure({ value: 1 / 3 }), '1/3 s');
// Errors
function codeOf(fn) { try { fn(); return 'NO_THROW'; } catch (e) { return e.code; } }
eq('non-jpeg code', codeOf(() => L.parseExif(new Uint8Array([1, 2, 3, 4]))), 'NOT_JPEG');
eq('no-exif code', codeOf(() => L.parseExif(new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9]))), 'NO_EXIF');
eq('truncated tiff', codeOf(() => L.parseExif(new Uint8Array([0xFF, 0xD8, 0xFF, 0xE1, 0, 8, 0x45, 0x78]))), 'NO_EXIF');
// Strip: removes exactly the EXIF segment, keeps SOI/EOI, re-parse fails with NO_EXIF
{
  const j = L.buildTestJpeg({});
  const s = L.stripExif(j);
  eq('strip removed 1', s.removedSegments, 1);
  eq('strip starts SOI', s.bytes[0] === 0xFF && s.bytes[1] === 0xD8, true);
  eq('strip ends EOI', s.bytes[s.bytes.length - 2] === 0xFF && s.bytes[s.bytes.length - 1] === 0xD9, true);
  eq('stripped has no exif', codeOf(() => L.parseExif(s.bytes)), 'NO_EXIF');
  eq('strip is smaller', s.bytes.length < j.length, true);
}
// Strip keeps a non-EXIF APP1 segment (e.g. XMP header) — only Exif\0\0 is removed
{
  const j = L.buildTestJpeg({});
  const fake = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE1, 0, 10, 0x58, 0x4D, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xD9]);
  const s = L.stripExif(fake);
  eq('non-exif app1 kept', s.removedSegments, 0);
  eq('non-exif app1 length kept', s.bytes.length, fake.length);
}
// Validation + helpers
eq('validate png rejected', L.validateFile('a.png', 100, 'image/png') !== null, true);
eq('validate jpg ok', L.validateFile('a.jpg', 100, 'image/jpeg'), null);
eq('validate empty rejected', L.validateFile('a.jpg', 0, 'image/jpeg') !== null, true);
eq('validate 51MB rejected', L.validateFile('a.jpg', 51 * 1024 * 1024, 'image/jpeg') !== null, true);
eq('bn digits', L.toBnDigits('2026'), '২০২৬');
eq('formatBytes KB', L.formatBytes(2048), '2 KB');
eq('osm url', L.osmUrl(23.8103, 90.4125).includes('mlat=23.810300'), true);
// i18n parity: EN and BN have identical key sets
{
  const ek = Object.keys(STR.en).sort().join(',');
  const bk = Object.keys(STR.bn).sort().join(',');
  eq('i18n key parity', ek, bk);
  check('i18n all non-empty', Object.values(STR.en).every(v => v) && Object.values(STR.bn).every(v => v));
  eq('i18n key count', Object.keys(STR.en).length, 44);
}
// Pure-ASCII sources
import { readFileSync } from 'node:fs';
for (const f of ['../js/logic.js', '../js/app.js', '../js/i18n.js', '../index.html', '../css/style.css']) {
  const s = readFileSync(new URL(f, import.meta.url), 'utf8');
  check('ascii-only ' + f, !/[^\x00-\x7F]/.test(s));
}
console.log('unit: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
