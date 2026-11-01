// EXIF Viewer BD - DOM glue. All parsing via ExifLogic; all strings via ExifStrings.
(function () {
  'use strict';
  var L = window.ExifLogic; var STR = window.ExifStrings;
  var lang = localStorage.getItem('exif-viewer-lang') || 'en';
  var current = null; // { bytes, name, size, type, modified, dims, result }
  var $ = function (id) { return document.getElementById(id); };

  function t(key) { return STR[lang][key] || STR.en[key] || key; }
  function num(n) { return lang === 'bn' ? L.toBnDigits(String(n)) : String(n); }
  function fmtDate(d) { if (!d) return ''; try { return new Date(d).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-GB'); } catch (e) { return String(d); } }

  function renderStatic() {
    $('tagline').textContent = t('tagline');
    $('dropText').textContent = t('dropText');
    $('chooseBtn').textContent = t('chooseBtn');
    $('demoBtn').textContent = t('demoBtn');
    $('clearBtn').textContent = t('clearBtn');
    $('fileInfoTitle').textContent = t('fileInfo');
    $('exifTitle').textContent = t('exifTitle');
    $('gpsTitle').textContent = t('gpsTitle');
    $('privacyTitle').textContent = t('privacyTitle');
    $('privacyText').textContent = t('privacyText');
    $('stripBtn').textContent = t('stripBtn');
    $('copyBtn').textContent = t('copyBtn');
    $('emptyTitle').textContent = t('emptyTitle');
    $('emptyText').textContent = t('emptyText');
    $('footerText').textContent = t('footer');
    $('langBtn').textContent = lang === 'en' ? '\u09ac\u09be\u0982\u09b2\u09be' : 'English';
    document.documentElement.lang = lang === 'bn' ? 'bn' : 'en';
    if (current) renderResult(); else showEmpty();
  }

  function showEmpty() {
    $('emptyState').style.display = 'block';
    $('resultState').style.display = 'none';
    $('errorBox').style.display = 'none';
    $('previewImg').style.display = 'none';
  }
  function showError(code) {
    var msg = code === 'NOT_JPEG' ? t('errNotJpeg') : code === 'NO_EXIF' ? t('errNoExif') : code === 'TRUNCATED' || code === 'BAD_TIFF' ? t('errTruncated') : t('errRead');
    $('errorBox').textContent = msg; $('errorBox').style.display = 'block';
  }

  function row(label, value) {
    var tr = document.createElement('tr');
    var th = document.createElement('th'); th.textContent = label;
    var td = document.createElement('td'); td.textContent = value;
    tr.appendChild(th); tr.appendChild(td); return tr;
  }

  function renderResult() {
    var r = current.result;
    $('emptyState').style.display = 'none';
    $('resultState').style.display = 'block';
    $('errorBox').style.display = 'none';
    var fi = $('fileInfoBody'); fi.innerHTML = '';
    fi.appendChild(row(t('nameLabel'), current.name));
    fi.appendChild(row(t('sizeLabel'), L.formatBytes(current.size)));
    fi.appendChild(row(t('typeLabel'), current.type || 'image/jpeg'));
    fi.appendChild(row(t('dimLabel'), current.dims ? num(current.dims.w) + ' x ' + num(current.dims.h) : '-'));
    fi.appendChild(row(t('modLabel'), fmtDate(current.modified)));
    var ex = $('exifBody'); ex.innerHTML = '';
    var order = ['make', 'model', 'datetimeOriginal', 'datetime', 'exposureTime', 'fNumber', 'iso', 'exposureProgram', 'focalLength', 'focalLength35mm', 'pixelXDimension', 'pixelYDimension', 'orientation'];
    var shown = 0;
    order.forEach(function (k) {
      if (r.tags[k] !== undefined && r.tags[k] !== null && r.tags[k] !== '') {
        var v = (k === 'iso' || k === 'pixelXDimension' || k === 'pixelYDimension') ? num(r.tags[k]) : String(r.tags[k]);
        ex.appendChild(row(t(k), v)); shown++;
      }
    });
    $('noExifNote').style.display = shown ? 'none' : 'block';
    $('noExifNote').textContent = t('noExif');
    var gpsBox = $('gpsBox'); gpsBox.innerHTML = '';
    if (r.gps) {
      gpsBox.appendChild(row(t('latLabel'), r.gps.latitudeDMS + ' (' + r.gps.latitude.toFixed(6) + ')'));
      gpsBox.appendChild(row(t('lonLabel'), r.gps.longitudeDMS + ' (' + r.gps.longitude.toFixed(6) + ')'));
      if (r.gps.altitude !== undefined) gpsBox.appendChild(row(t('altLabel'), num(Math.round(r.gps.altitude * 10) / 10) + ' m'));
      var a = $('mapLink'); a.href = L.osmUrl(r.gps.latitude, r.gps.longitude); a.textContent = t('mapLink'); a.style.display = 'inline-block';
    } else { $('mapLink').style.display = 'none'; }
    $('demoNote').style.display = current.isDemo ? 'block' : 'none';
    $('demoNote').textContent = t('demoNote');
    $('stripBtn').disabled = false; $('copyBtn').disabled = false;
  }

  function loadBytes(bytes, meta) {
    var err = L.validateFile(meta.name, bytes.length, meta.type);
    if (err) { current = null; showEmpty(); showError('NOT_JPEG'); return; }
    try {
      var result = L.parseExif(bytes);
      current = { bytes: bytes, name: meta.name, size: bytes.length, type: meta.type, modified: meta.modified, dims: meta.dims, result: result, isDemo: !!meta.isDemo };
      if (!meta.isDemo && meta.objectUrl) { $('previewImg').src = meta.objectUrl; $('previewImg').style.display = 'block'; }
      else { $('previewImg').style.display = 'none'; }
      renderResult();
    } catch (e) {
      current = null; showEmpty(); showError(e.code || 'READ');
    }
  }

  function loadFile(file) {
    $('errorBox').style.display = 'none';
    var reader = new FileReader();
    reader.onload = function () {
      var bytes = new Uint8Array(reader.result);
      var dims = null;
      if (!file.type || file.type === 'image/jpeg') {
        var img = new Image(); var url = URL.createObjectURL(file);
        img.onload = function () { dims = { w: img.naturalWidth, h: img.naturalHeight }; loadBytes(bytes, { name: file.name, type: file.type, modified: file.lastModified, dims: dims, objectUrl: url }); };
        img.onerror = function () { loadBytes(bytes, { name: file.name, type: file.type, modified: file.lastModified, dims: null, objectUrl: url }); };
        img.src = url;
      } else { loadBytes(bytes, { name: file.name, type: file.type, modified: file.lastModified, dims: null }); }
    };
    reader.onerror = function () { current = null; showEmpty(); showError('READ'); };
    reader.readAsArrayBuffer(file);
  }

  $('fileInput').addEventListener('change', function () { if (this.files && this.files[0]) loadFile(this.files[0]); });
  $('chooseBtn').addEventListener('click', function () { $('fileInput').click(); });
  $('demoBtn').addEventListener('click', function () {
    var bytes = L.buildTestJpeg({});
    loadBytes(bytes, { name: 'demo-exif.jpg', type: 'image/jpeg', modified: Date.now(), dims: null, isDemo: true });
  });
  $('clearBtn').addEventListener('click', function () { current = null; $('fileInput').value = ''; $('previewImg').style.display = 'none'; showEmpty(); });
  $('langBtn').addEventListener('click', function () {
    lang = lang === 'en' ? 'bn' : 'en';
    localStorage.setItem('exif-viewer-lang', lang); renderStatic();
  });
  var dz = $('dropzone');
  ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('drag'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('drag'); }); });
  dz.addEventListener('drop', function (e) { if (e.dataTransfer.files && e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });
  dz.addEventListener('click', function (e) { if (e.target.id !== 'chooseBtn') $('fileInput').click(); });

  $('stripBtn').addEventListener('click', function () {
    if (!current) return;
    try {
      var out = L.stripExif(current.bytes);
      var blob = new Blob([out.bytes], { type: 'image/jpeg' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = current.name.replace(/\.jpe?g$/i, '') + '-no-exif.jpg';
      a.click();
      $('stripNote').textContent = 'EXIF segments removed: ' + (lang === 'bn' ? L.toBnDigits(String(out.removedSegments)) : out.removedSegments) + ' | ' + L.formatBytes(current.bytes.length) + ' -> ' + L.formatBytes(out.bytes.length);
    } catch (e) { showError(e.code || 'READ'); }
  });
  $('copyBtn').addEventListener('click', function () {
    if (!current) return;
    var lines = [current.name, 'Size: ' + L.formatBytes(current.size)];
    Object.keys(current.result.tags).forEach(function (k) { lines.push(k + ': ' + current.result.tags[k]); });
    if (current.result.gps) lines.push('GPS: ' + current.result.gps.latitude.toFixed(6) + ', ' + current.result.gps.longitude.toFixed(6));
    var done = function () { $('copyBtn').textContent = t('copied'); setTimeout(renderStatic, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(lines.join('\n')).then(done, done);
    else { var ta = document.createElement('textarea'); ta.value = lines.join('\n'); document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} document.body.removeChild(ta); done(); }
  });

  renderStatic();
})();
