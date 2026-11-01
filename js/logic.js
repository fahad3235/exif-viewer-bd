// EXIF Viewer BD \u2014 pure logic (no DOM). Works in Node (CommonJS) and browsers (window.ExifLogic).
// Parses JPEG EXIF (TIFF) in-memory. No network, no upload: files never leave the device.
(function (root) {
  'use strict';

  var TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8, 11: 4, 12: 8 };
  var ORIENTATION = {
    1: 'Normal', 2: 'Mirror horizontal', 3: 'Rotate 180',
    4: 'Mirror vertical', 5: 'Mirror horizontal + rotate 270 CW',
    6: 'Rotate 90 CW', 7: 'Mirror horizontal + rotate 90 CW', 8: 'Rotate 270 CW'
  };
  var EXPOSURE_PROGRAM = { 0: 'Not defined', 1: 'Manual', 2: 'Normal program', 3: 'Aperture priority', 4: 'Shutter priority', 5: 'Creative program', 6: 'Action program', 7: 'Portrait mode', 8: 'Landscape mode' };

  function fail(code, msg) { var e = new Error(msg || code); e.code = code; throw e; }

  function Reader(buf, little) {
    this.buf = buf; this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength); this.le = little;
  }
  Reader.prototype.u16 = function (o) { if (o + 2 > this.buf.length) fail('TRUNCATED', 'Truncated TIFF data'); return this.view.getUint16(o, this.le); };
  Reader.prototype.u32 = function (o) { if (o + 4 > this.buf.length) fail('TRUNCATED', 'Truncated TIFF data'); return this.view.getUint32(o, this.le); };
  Reader.prototype.i32 = function (o) { if (o + 4 > this.buf.length) fail('TRUNCATED', 'Truncated TIFF data'); return this.view.getInt32(o, this.le); };
  Reader.prototype.bytes = function (o, n) { if (o + n > this.buf.length) fail('TRUNCATED', 'Truncated TIFF data'); return this.buf.slice(o, o + n); };

  function readValue(r, type, count, valOff) {
    var size = TYPE_SIZE[type]; if (!size) return null;
    var total = size * count; var base = total <= 4 ? valOff : r.u32(valOff);
    // For inline values, valOff points at the 4-byte value field itself.
    if (total <= 4) base = valOff;
    if (type === 2) {
      var raw = r.bytes(base, count); var end = 0; while (end < raw.length && raw[end] !== 0) end++;
      return new TextDecoder('ascii').decode(raw.slice(0, end));
    }
    if (type === 3) { var out = []; for (var i = 0; i < count; i++) out.push(r.u16(base + i * 2)); return count === 1 ? out[0] : out; }
    if (type === 4) { var o4 = []; for (var j = 0; j < count; j++) o4.push(r.u32(base + j * 4)); return count === 1 ? o4[0] : o4; }
    if (type === 9) { var o9 = []; for (var k = 0; k < count; k++) o9.push(r.i32(base + k * 4)); return count === 1 ? o9[0] : o9; }
    if (type === 5 || type === 10) {
      var rats = [];
      for (var m = 0; m < count; m++) {
        var n = type === 5 ? r.u32(base + m * 8) : r.i32(base + m * 8);
        var d = type === 5 ? r.u32(base + m * 8 + 4) : r.i32(base + m * 8 + 4);
        rats.push({ num: n, den: d, value: d === 0 ? null : n / d });
      }
      return count === 1 ? rats[0] : rats;
    }
    if (type === 1 || type === 7) { var b = r.bytes(base, count); return count === 1 ? b[0] : Array.prototype.slice.call(b); }
    return null;
  }

  function readIFD(r, offset) {
    var count = r.u16(offset); var map = {};
    for (var i = 0; i < count; i++) {
      var e = offset + 2 + i * 12;
      var tag = r.u16(e); var type = r.u16(e + 2); var cnt = r.u32(e + 4);
      try { map[tag] = readValue(r, type, cnt, e + 8); } catch (err) { /* skip unreadable entry */ }
    }
    return map;
  }

  // Parse EXIF from a JPEG Uint8Array. Returns { tags: {...}, gps: {...}|null, raw: {ifd0, exif, gps} }.
  function parseExif(jpeg) {
    if (!(jpeg instanceof Uint8Array)) fail('BAD_INPUT', 'Expected a Uint8Array');
    if (jpeg.length < 4 || jpeg[0] !== 0xFF || jpeg[1] !== 0xD8) fail('NOT_JPEG', 'Not a JPEG file (missing SOI marker)');
    var pos = 2; var tiff = null;
    while (pos + 4 <= jpeg.length) {
      if (jpeg[pos] !== 0xFF) { pos++; continue; }
      var marker = jpeg[pos + 1];
      if (marker === 0xD9) break; // EOI
      if (marker === 0xDA) break; // SOS: image data follows, no more segments
      if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { pos += 2; continue; }
      if (pos + 4 > jpeg.length) break;
      var len = (jpeg[pos + 2] << 8) | jpeg[pos + 3];
      if (len < 2 || pos + 2 + len > jpeg.length + 2) break;
      var dataStart = pos + 4; var dataLen = len - 2;
      if (marker === 0xE1 && dataLen >= 6 &&
          jpeg[dataStart] === 0x45 && jpeg[dataStart + 1] === 0x78 && jpeg[dataStart + 2] === 0x69 && jpeg[dataStart + 3] === 0x66 &&
          jpeg[dataStart + 4] === 0 && jpeg[dataStart + 5] === 0) {
        tiff = jpeg.slice(dataStart + 6, dataStart + 6 + dataLen - 6); break;
      }
      pos += 2 + len;
    }
    if (!tiff) fail('NO_EXIF', 'No EXIF segment found in this JPEG');
    if (tiff.length < 8) fail('TRUNCATED', 'EXIF segment too short');
    var little;
    if (tiff[0] === 0x49 && tiff[1] === 0x49) little = true;
    else if (tiff[0] === 0x4D && tiff[1] === 0x4D) little = false;
    else fail('BAD_TIFF', 'Unknown TIFF byte order');
    var r = new Reader(tiff, little);
    if (r.u16(2) !== 42) fail('BAD_TIFF', 'Bad TIFF magic (expected 42)');
    var ifd0Off = r.u32(4);
    var ifd0 = readIFD(r, ifd0Off);
    var exif = null; var gps = null;
    if (typeof ifd0[0x8769] === 'number') exif = readIFD(r, ifd0[0x8769]);
    if (typeof ifd0[0x8825] === 'number') gps = readIFD(r, ifd0[0x8825]);
    var tags = {};
    function pick(map, tag, name, fmt) { if (map && map[tag] !== undefined && map[tag] !== null) tags[name] = fmt ? fmt(map[tag]) : map[tag]; }
    pick(ifd0, 0x010F, 'make'); pick(ifd0, 0x0110, 'model');
    pick(ifd0, 0x0112, 'orientation', function (v) { return ORIENTATION[v] || ('Unknown (' + v + ')'); });
    pick(ifd0, 0x0132, 'datetime');
    if (exif) {
      pick(exif, 0x9003, 'datetimeOriginal');
      pick(exif, 0x829A, 'exposureTime', formatExposure);
      pick(exif, 0x829D, 'fNumber', function (v) { return v && v.value !== null ? 'f/' + trimNum(v.value) : null; });
      pick(exif, 0x8827, 'iso', function (v) { return v; });
      pick(exif, 0x8822, 'exposureProgram', function (v) { return EXPOSURE_PROGRAM[v] || ('Unknown (' + v + ')'); });
      pick(exif, 0x920A, 'focalLength', function (v) { return v && v.value !== null ? trimNum(v.value) + ' mm' : null; });
      pick(exif, 0xA002, 'pixelXDimension'); pick(exif, 0xA003, 'pixelYDimension');
      pick(exif, 0xA405, 'focalLength35mm', function (v) { return v ? v + ' mm (35mm equiv.)' : null; });
    }
    var gpsOut = null;
    if (gps && Array.isArray(gps[1]) && Array.isArray(gps[3])) {
      var lat = dmsToDecimal(gps[1], gps[0] === 'S');
      var lon = dmsToDecimal(gps[3], gps[2] === 'W');
      if (lat !== null && lon !== null) {
        gpsOut = { latitude: lat, longitude: lon, latitudeDMS: formatDMS(gps[1], gps[0] || 'N'), longitudeDMS: formatDMS(gps[3], gps[2] || 'E') };
        if (gps[6] && gps[6].value !== null) gpsOut.altitude = (gps[5] === 1 ? -1 : 1) * gps[6].value;
      }
    }
    return { tags: tags, gps: gpsOut, raw: { ifd0: ifd0, exif: exif, gps: gps } };
  }

  function trimNum(v) { return String(Math.round(v * 100) / 100); }
  function formatExposure(v) {
    if (!v || v.value === null) return null;
    var s = v.value;
    if (s >= 1) return trimNum(s) + ' s';
    var inv = Math.round(1 / s);
    if (Math.abs(1 / inv - s) < 0.02) return '1/' + inv + ' s';
    return trimNum(s) + ' s';
  }
  function dmsToDecimal(parts, negative) {
    if (!parts || parts.length < 3) return null;
    var d = parts[0].value, m = parts[1].value, s = parts[2].value;
    if (d === null || m === null || s === null) return null;
    var dec = d + m / 60 + s / 3600;
    return negative ? -dec : dec;
  }
  function formatDMS(parts, ref) {
    if (!parts || parts.length < 3) return '';
    function fmt(v, dec) { return dec ? String(Math.round(v * 100) / 100) : String(Math.round(v)); }
    return fmt(parts[0].value, false) + '\u00B0' + fmt(parts[1].value, false) + '\u2032' + fmt(parts[2].value, true) + '\u2033' + ref;
  }

  // Remove APP1 Exif segments from a JPEG. Other segments (incl. ICC, comments) are kept:
  // callers must say "EXIF removed", not "all metadata removed".
  function stripExif(jpeg) {
    if (!(jpeg instanceof Uint8Array)) fail('BAD_INPUT', 'Expected a Uint8Array');
    if (jpeg.length < 2 || jpeg[0] !== 0xFF || jpeg[1] !== 0xD8) fail('NOT_JPEG', 'Not a JPEG file');
    var out = [0xFF, 0xD8]; var pos = 2; var removed = 0;
    while (pos + 2 <= jpeg.length) {
      if (jpeg[pos] !== 0xFF) break;
      var marker = jpeg[pos + 1];
      if (marker === 0xD9) { out.push(0xFF, 0xD9); pos += 2; break; }
      if (marker === 0xDA) { for (var i = pos; i < jpeg.length; i++) out.push(jpeg[i]); pos = jpeg.length; break; }
      if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { out.push(0xFF, marker); pos += 2; continue; }
      if (pos + 4 > jpeg.length) break;
      var len = (jpeg[pos + 2] << 8) | jpeg[pos + 3];
      var segEnd = pos + 2 + len; if (segEnd > jpeg.length) break;
      var isExif = marker === 0xE1 && len >= 8 &&
        jpeg[pos + 4] === 0x45 && jpeg[pos + 5] === 0x78 && jpeg[pos + 6] === 0x69 && jpeg[pos + 7] === 0x66 &&
        jpeg[pos + 8] === 0 && jpeg[pos + 9] === 0;
      if (isExif) { removed++; } else { for (var j = pos; j < segEnd; j++) out.push(jpeg[j]); }
      pos = segEnd;
    }
    return { bytes: new Uint8Array(out), removedSegments: removed };
  }

  function validateFile(name, size, mime) {
    if (!name || !/\.jpe?g$/i.test(name)) return 'File must be a .jpg / .jpeg photo';
    if (size <= 0) return 'File is empty';
    if (size > 50 * 1024 * 1024) return 'File is larger than 50 MB';
    if (mime && mime !== 'image/jpeg' && mime !== '') return 'File must be a JPEG image';
    return null;
  }

  function toBnDigits(str) {
    var map = { '0': '\u09E6', '1': '\u09E7', '2': '\u09E8', '3': '\u09E9', '4': '\u09EA', '5': '\u09EB', '6': '\u09EC', '7': '\u09ED', '8': '\u09EE', '9': '\u09EF' };
    return String(str).replace(/[0-9]/g, function (d) { return map[d]; });
  }
  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (Math.round(n / 1024 * 10) / 10) + ' KB';
    return (Math.round(n / 1024 / 1024 * 100) / 100) + ' MB';
  }
  function osmUrl(lat, lon) { return 'https://www.openstreetmap.org/?mlat=' + lat.toFixed(6) + '&mlon=' + lon.toFixed(6) + '#map=16/' + lat.toFixed(6) + '/' + lon.toFixed(6); }

  // ---- Test JPEG builder (used by unit tests + the in-app demo file) ----
  // Builds SOI + APP1(Exif TIFF) + EOI. No image scan data by design: the demo
  // file proves the parser, it is NOT a viewable photo (the UI says so).
  function buildTestJpeg(o) {
    o = o || {};
    var little = o.endian !== 'BE';
    var bytes = [];
    function u16(v) { if (little) { bytes.push(v & 0xFF, (v >> 8) & 0xFF); } else { bytes.push((v >> 8) & 0xFF, v & 0xFF); } }
    function u32(v) { if (little) { bytes.push(v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF); } else { bytes.push((v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF); } }
    function patchU16(pos, v) { if (little) { bytes[pos] = v & 0xFF; bytes[pos + 1] = (v >> 8) & 0xFF; } else { bytes[pos] = (v >> 8) & 0xFF; bytes[pos + 1] = v & 0xFF; } }
    function patchU32(pos, v) { if (little) { bytes[pos] = v & 0xFF; bytes[pos + 1] = (v >> 8) & 0xFF; bytes[pos + 2] = (v >> 16) & 0xFF; bytes[pos + 3] = (v >> 24) & 0xFF; } else { bytes[pos] = (v >> 24) & 0xFF; bytes[pos + 1] = (v >> 16) & 0xFF; bytes[pos + 2] = (v >> 8) & 0xFF; bytes[pos + 3] = v & 0xFF; } }
    function ascii(s) { var a = []; for (var i = 0; i < s.length; i++) a.push(s.charCodeAt(i) & 0xFF); a.push(0); return a; }
    function alloc(arr) { var off = bytes.length; for (var i = 0; i < arr.length; i++) bytes.push(arr[i]); return off; }
    // TIFF header (offsets are relative to the TIFF start, which is bytes[0] here)
    bytes.push.apply(bytes, little ? [0x49, 0x49] : [0x4D, 0x4D]);
    u16(42); u32(8);
    // IFD0: Make, Model, DateTime, ExifPtr, GPSPtr
    var ifd0Count = 5;
    var ifd0Pos = bytes.length; u16(ifd0Count);
    var entryPos = [];
    for (var e = 0; e < ifd0Count; e++) { entryPos.push(bytes.length); for (var k = 0; k < 12; k++) bytes.push(0); }
    u32(0);
    function writeEntry(pos, tag, type, count, valueBytes, offsetVal) {
      patchU16(pos, tag); patchU16(pos + 2, type); patchU32(pos + 4, count);
      if (valueBytes && valueBytes.length <= 4) { for (var i = 0; i < 4; i++) bytes[pos + 8 + i] = i < valueBytes.length ? valueBytes[i] : 0; }
      else if (offsetVal !== undefined) { patchU32(pos + 8, offsetVal); }
    }
    function rational(n, d) { var start = bytes.length; u32(n); u32(d); return start; }
    function rationals(arr) { var start = bytes.length; for (var i = 0; i < arr.length; i++) { u32(arr[i][0]); u32(arr[i][1]); } return start; }
    // Out-of-line data first (strings), then sub-IFDs, so offsets are known before patching.
    var makeOff = alloc(ascii(o.make || 'Canon'));
    var modelOff = alloc(ascii(o.model || 'EOS Test'));
    var dtOff = alloc(ascii(o.datetime || '2026:11:01 10:00:00'));
    // ExifIFD
    var exifPos = bytes.length; u16(7);
    var exifEntries = [];
    for (var x = 0; x < 7; x++) { exifEntries.push(bytes.length); for (var q = 0; q < 12; q++) bytes.push(0); }
    u32(0);
    var dtOrigOff = alloc(ascii(o.datetimeOriginal || '2026:11:01 10:00:00'));
    var expOff = rational(o.exposureNum || 1, o.exposureDen || 125);
    var fOff = rational(o.fNum || 28, 10);
    var focalOff = rational(o.focalNum || 50, 1);
    writeEntry(exifEntries[0], 0x9003, 2, (o.datetimeOriginal || '2026:11:01 10:00:00').length + 1, null, dtOrigOff);
    writeEntry(exifEntries[1], 0x829A, 5, 1, null, expOff);
    writeEntry(exifEntries[2], 0x829D, 5, 1, null, fOff);
    // SHORT inline values are left-justified in the 4-byte field in both byte orders
    // (TIFF spec): LE -> [lo, hi, 0, 0], BE -> [hi, lo, 0, 0].
    var isoV = o.iso || 200;
    writeEntry(exifEntries[3], 0x8827, 3, 1, little ? [isoV & 0xFF, (isoV >> 8) & 0xFF, 0, 0] : [(isoV >> 8) & 0xFF, isoV & 0xFF, 0, 0]);
    writeEntry(exifEntries[4], 0x920A, 5, 1, null, focalOff);
    writeEntry(exifEntries[5], 0xA002, 4, 1, null, o.pixelX || 4000);
    writeEntry(exifEntries[6], 0xA003, 4, 1, null, o.pixelY || 3000);
    // GPS IFD
    var gpsPos = bytes.length; u16(6);
    var gpsEntries = [];
    for (var g = 0; g < 6; g++) { gpsEntries.push(bytes.length); for (var w = 0; w < 12; w++) bytes.push(0); }
    u32(0);
    var latOff = rationals(o.latDMS || [[23, 1], [48, 1], [3708, 100]]);
    var lonOff = rationals(o.lonDMS || [[90, 1], [24, 1], [4500, 100]]);
    var altOff = rational(o.altNum || 10, 1);
    writeEntry(gpsEntries[0], 0, 2, 2, ascii(o.latRef || 'N').slice(0, 2));
    writeEntry(gpsEntries[1], 1, 5, 3, null, latOff);
    writeEntry(gpsEntries[2], 2, 2, 2, ascii(o.lonRef || 'E').slice(0, 2));
    writeEntry(gpsEntries[3], 3, 5, 3, null, lonOff);
    writeEntry(gpsEntries[4], 5, 1, 1, [0, 0, 0, 0]);
    writeEntry(gpsEntries[5], 6, 5, 1, null, altOff);
    // IFD0 entries
    writeEntry(entryPos[0], 0x010F, 2, (o.make || 'Canon').length + 1, null, makeOff);
    writeEntry(entryPos[1], 0x0110, 2, (o.model || 'EOS Test').length + 1, null, modelOff);
    writeEntry(entryPos[2], 0x0132, 2, (o.datetime || '2026:11:01 10:00:00').length + 1, null, dtOff);
    writeEntry(entryPos[3], 0x8769, 4, 1, null, exifPos);
    writeEntry(entryPos[4], 0x8825, 4, 1, null, gpsPos);
    var tiff = new Uint8Array(bytes);
    var app1 = [0x45, 0x78, 0x69, 0x66, 0, 0];
    for (var t = 0; t < tiff.length; t++) app1.push(tiff[t]);
    var len = app1.length + 2;
    var jpeg = [0xFF, 0xD8, 0xFF, 0xE1, (len >> 8) & 0xFF, len & 0xFF];
    for (var a = 0; a < app1.length; a++) jpeg.push(app1[a]);
    jpeg.push(0xFF, 0xD9);
    return new Uint8Array(jpeg);
  }

  var api = { parseExif: parseExif, stripExif: stripExif, buildTestJpeg: buildTestJpeg, validateFile: validateFile, toBnDigits: toBnDigits, formatBytes: formatBytes, formatExposure: formatExposure, formatDMS: formatDMS, dmsToDecimal: dmsToDecimal, osmUrl: osmUrl, ORIENTATION: ORIENTATION };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ExifLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
