// Headless-Chrome smoke via raw CDP. Run: node tests/smoke.mjs
// Expects chrome listening on 127.0.0.1:9225.
const targets = await (await fetch('http://127.0.0.1:9225/json')).json();
const wsUrl = targets.find(t => t.type === 'page').webSocketDebuggerUrl;
const ws = new WebSocket(wsUrl);
let id = 0; const pending = new Map(); const errors = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
  if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + JSON.stringify(m.params.args));
});
await new Promise(r => { ws.addEventListener('open', r, { once: true }); });
function send(method, params = {}) {
  const mid = ++id;
  return new Promise((res, rej) => { pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params })); });
}
function ev(expr) { return send('Runtime.evaluate', { expression: expr, returnByValue: true }).then(r => r.result.value); }
let pass = 0, fail = 0;
function check(cond, name, extra = '') { if (cond) pass++; else { fail++; console.log('FAIL ' + name + ' ' + extra); } }
await send('Page.enable'); await send('Runtime.enable');
const PAGE = 'file:///home/hatch/workspace/muse-project-factory/builds/exif-viewer-bd/index.html';
await send('Page.navigate', { url: PAGE });
await new Promise(r => setTimeout(r, 1200));
await ev(`localStorage.clear();`);
await send('Page.navigate', { url: PAGE });
await new Promise(r => setTimeout(r, 1500));

check(await ev(`document.querySelector('h1').textContent === 'EXIF Viewer BD'`), 'h1 title', await ev(`document.querySelector('h1').textContent`));
check(await ev(`document.getElementById('emptyState').style.display === 'block'`), 'empty state visible initially');
check(await ev(`document.getElementById('resultState').style.display === 'none'`), 'result hidden initially');
// Demo file -> full EXIF table
await ev(`document.getElementById('demoBtn').click();`);
await new Promise(r => setTimeout(r, 800));
check(await ev(`document.getElementById('resultState').style.display === 'block'`), 'result shows after demo');
check(await ev(`document.getElementById('exifBody').textContent.includes('Canon')`), 'demo make Canon', await ev(`document.getElementById('exifBody').textContent`));
check(await ev(`document.getElementById('exifBody').textContent.includes('EOS Test')`), 'demo model');
check(await ev(`document.getElementById('exifBody').textContent.includes('1/125 s')`), 'demo shutter', await ev(`document.getElementById('exifBody').textContent`));
check(await ev(`document.getElementById('exifBody').textContent.includes('f/2.8')`), 'demo aperture');
check(await ev(`document.getElementById('gpsBox').textContent.includes('23.810300')`), 'demo GPS lat decimal', await ev(`document.getElementById('gpsBox').textContent`));
check(await ev(`document.getElementById('gpsBox').textContent.includes('90.412500')`), 'demo GPS lon decimal');
check(await ev(`document.getElementById('mapLink').href.includes('openstreetmap.org')`), 'OSM map link', await ev(`document.getElementById('mapLink').href`));
check(await ev(`document.getElementById('demoNote').style.display === 'block'`), 'demo note visible');
check(await ev(`!document.getElementById('stripBtn').disabled`), 'strip button enabled');
check(await ev(`!document.getElementById('copyBtn').disabled`), 'copy button enabled');
// Language toggle -> BN tagline + Bengali digits in file-info size
await ev(`document.getElementById('langBtn').click();`);
check(await ev(`document.getElementById('tagline').textContent.length > 0 && document.getElementById('tagline').textContent !== 'See the hidden story inside your photos'`), 'BN tagline', await ev(`document.getElementById('tagline').textContent`));
check(await ev(`document.getElementById('langBtn').textContent === 'English'`), 'lang button flips to English');
// Reload persistence of language
await send('Page.navigate', { url: PAGE });
await new Promise(r => setTimeout(r, 1500));
check(await ev(`document.getElementById('langBtn').textContent === 'English'`), 'BN lang persists after reload');
// Clear -> back to empty state
await ev(`document.getElementById('clearBtn').click();`);
check(await ev(`document.getElementById('emptyState').style.display === 'block'`), 'empty after clear');
// 390px mobile: no horizontal overflow
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await new Promise(r => setTimeout(r, 800));
check(await ev(`document.documentElement.scrollWidth <= 390`), '390px no overflow', String(await ev(`document.documentElement.scrollWidth`)));
check(errors.length === 0, '0 console/page errors', errors.join(' | '));
console.log('smoke: ' + pass + ' passed, ' + fail + ' failed');
ws.close();
process.exit(fail ? 1 : 0);
