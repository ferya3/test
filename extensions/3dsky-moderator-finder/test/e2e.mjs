// End-to-end test: loads the extension into real Chromium and drives it against a LOCAL MOCK site (not 3dsky).
// Run: xvfb-run -a node test/e2e.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
// needs a global/installed `playwright` and a Chromium (set PW_CHROMIUM to its binary). Extensions need a headed Chrome: use xvfb-run on a server.
const require = createRequire(process.env.PW_NODE_MODULES || (process.execPath.replace(/bin\/node$/, 'lib/node_modules/')));
const { chromium } = require('playwright');

const SRC = fileURLToPath(new URL('..', import.meta.url));
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-e2e-'));
const EXT = path.join(WORK, 'ext');
fs.cpSync(SRC, EXT, { recursive: true, filter: (s) => path.relative(SRC, s).split(path.sep)[0] !== "test" });
// test-only: let the extension run on the local mock site
const mf = JSON.parse(fs.readFileSync(`${EXT}/manifest.json`, 'utf8'));
mf.host_permissions.push('http://127.0.0.1/*');
mf.content_scripts.forEach((c) => c.matches.push('http://127.0.0.1/*'));
fs.writeFileSync(`${EXT}/manifest.json`, JSON.stringify(mf, null, 2));

const PAGE = `<!doctype html><meta charset=utf-8><title>mock</title>
<body><h1>Mock uploader</h1><button id=go>upload</button><div id=out></div>
<script src="/app.js"></script>
<script>window.__NUXT__ = { state: { user: { id: 1 }, upload: { moderator: { nickname: 'FromState' } } } };</script>`;
const APP = `
document.getElementById('go').onclick = async () => {
  const fd = new FormData(); fd.append('title','Sofa'); fd.append('file', new Blob(['xxxx']), 'a.zip');
  const r = await fetch('/api/upload', { method: 'POST', body: fd }); const j = await r.json();
  const x = new XMLHttpRequest(); x.open('GET','/api/model/'+j.id+'/status'); x.onload=()=>{
     const s = document.createElement('span'); s.className='moderator-name'; s.style.display='none'; s.textContent='HiddenOlga'; document.body.appendChild(s);
     document.body.appendChild(document.createComment(' moderator: 99 '));
  }; x.send();
  new EventSource('/events');
};
// leftover code from the "removed" feature (for the code audit)
function legacy(){ return fetch('/api/moderators/assign?model=1'); }
`;
const srv = http.createServer((req, res) => {
  const u = req.url;
  if (u === '/') { res.setHeader('content-type', 'text/html'); return res.end(PAGE); }
  if (u === '/app.js') { res.setHeader('content-type', 'text/javascript'); return res.end(APP); }
  if (u === '/api/upload') { res.setHeader('content-type', 'application/json'); return res.end('{"id":5,"status":"queued"}'); }
  if (u.startsWith('/api/model/')) { res.setHeader('content-type', 'application/json'); res.setHeader('x-assigned-moderator', 'hdr-Boris'); return res.end('{"model":{"id":5,"moderator":{"id":7,"nickname":"Ivan"},"moderation_status":"pending"}}'); }
  if (u === '/api/user/finance') { res.setHeader('content-type', 'application/json'); return res.end('{"balance":123,"moderator":"SECRET-FIN"}'); }
  if (u === '/events') { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('data: {"moderatorName":"SseKate"}\n\n'); return; }
  res.statusCode = 404; res.end();
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}`;

const ctx = await chromium.launchPersistentContext(path.join(WORK, 'profile'), {
  headless: false,
  executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium',
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'],
});
const errors = [];
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(base);
await page.click('#go');
await page.waitForTimeout(3500);


const R = (fn, arg) => page.evaluate(fn, arg);
const shadow = () => document.getElementById('__3dsky_modfinder_host').shadowRoot;
await R(() => document.getElementById('__3dsky_modfinder_host').shadowRoot.getElementById('pill').click());
await page.waitForTimeout(700);
let txt = await R(() => document.getElementById('__3dsky_modfinder_host').shadowRoot.getElementById('panel').innerText);
console.log('HEADER FINDING PRESENT:', /hdr-Boris/.test(txt), '| STATE URL OK:', /window\.__NUXT__/.test(txt) && !/\/window\.__NUXT__/.test(txt));

// alias via prompt() on the Ivan item
page.on('dialog', (d) => d.accept('Ivan-the-picky'));
await R(() => {
  const r = document.getElementById('__3dsky_modfinder_host').shadowRoot;
  [...r.querySelectorAll('[data-act=alias]')].find((b) => b.dataset.key === '7').click();
});
await page.waitForTimeout(700);
txt = await R(() => document.getElementById('__3dsky_modfinder_host').shadowRoot.getElementById('panel').innerText);
console.log('ALIAS APPLIED:', /Ivan-the-picky\s+←\s+Ivan \(#7\)/.test(txt));
await page.screenshot({ path: path.join(WORK, 'shot-findings.png') });

// log tab + expand
await R(() => { const r = document.getElementById('__3dsky_modfinder_host').shadowRoot; [...r.querySelectorAll('[data-tab]')].find((b) => b.dataset.tab === 'log').click(); });
await page.waitForTimeout(600);
await R(() => { const r = document.getElementById('__3dsky_modfinder_host').shadowRoot; [...r.querySelectorAll('.log')].find((e) => /status/.test(e.innerText)).click(); });
await page.waitForTimeout(500);
txt = await R(() => document.getElementById('__3dsky_modfinder_host').shadowRoot.getElementById('panel').innerText);
console.log('LOG EXPANDED SHOWS BODY:', /"nickname":"Ivan"/.test(txt));
await page.screenshot({ path: path.join(WORK, 'shot-log.png') });

// export
await R(async () => { await fetch('/api/user/finance', { method: 'POST', body: 'card=4111' }); });
await page.waitForTimeout(500);
const [dl] = await Promise.all([page.waitForEvent('download'), R(() => document.getElementById('__3dsky_modfinder_host').shadowRoot.querySelector('[data-act=export]').click())]);
const p = await dl.path(); const exp = JSON.parse(fs.readFileSync(p, 'utf8'));
const raw0 = fs.readFileSync(p, 'utf8');
const fin = exp.entries.find((e) => e.url.includes('/api/user/finance'));
console.log('SENSITIVE REDACTED:', !!fin && fin.redacted === true && !fin.resBody && !fin.reqBody && !/SECRET-FIN|4111/.test(raw0) && !exp.findings.some((f) => /SECRET-FIN/.test(f.text || '')));
console.log('EXPORT: findings', exp.findings.length, 'entries', exp.entries.length, 'aliases', JSON.stringify(exp.aliases), 'has request headers/cookies:', /cookie|authorization/i.test(fs.readFileSync(p, 'utf8')));

// persistence across a full reload
await page.waitForTimeout(1500);
await page.reload();
await page.waitForTimeout(1500);
txt = await R(() => { const r = document.getElementById('__3dsky_modfinder_host').shadowRoot; r.getElementById('pill').click(); return r.getElementById('panel').innerText; });
await page.waitForTimeout(600);
txt = await R(() => document.getElementById('__3dsky_modfinder_host').shadowRoot.getElementById('panel').innerText);
console.log('PERSISTED AFTER RELOAD (alias+Ivan):', /Ivan-the-picky/.test(txt) && /Ivan \(#7\)/.test(txt));

// clear
await R(() => document.getElementById('__3dsky_modfinder_host').shadowRoot.querySelector('[data-act=clear]').click());
await page.waitForTimeout(700);
const pill = await R(() => document.getElementById('__3dsky_modfinder_host').shadowRoot.getElementById('pt').textContent);
console.log('PILL AFTER CLEAR:', pill);

// the page's own behaviour must be untouched
const ok = await R(async () => { const r = await fetch('/api/upload', { method: 'POST', body: 'x' }); return r.status + ':' + (await r.text()); });
console.log('PAGE FETCH STILL WORKS:', ok);
console.log('PAGE ERRORS:', errors.length ? errors : 'none');
await ctx.close(); srv.close();

fs.rmSync(WORK, { recursive: true, force: true });
