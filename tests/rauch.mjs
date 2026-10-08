// Rauchtest ohne Übungen (für GitHub Actions): die Seite aus einem leeren Bestand, ausgeliefert vom echten
// Webserver mit der Content-Security-Policy aus container/sws.toml.
//   BASE=http://localhost:8080/ node rauch.mjs
// Prüft: alle Seiten laden ohne Skript- und CSP-Fehler, keine fremden Server, axe (WCAG 2.2 AA) hell und dunkel, 320 px.
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const B = (process.env.BASE || 'http://localhost:8080/').replace(/\/?$/, '/');
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const fehler = [];
const ok = (bedingung, text) => { console.log((bedingung ? 'OK   ' : 'FAIL ') + text); if (!bedingung) fehler.push(text); };
const pfade = ['', 'ueber.html', 'spielen.html?id=1', 'spielen.html'];

for (const schema of ['light', 'dark']) {
  const c = await browser.newContext({ colorScheme: schema, viewport: { width: 1280, height: 900 } });
  const p = await c.newPage();
  for (const pfad of pfade) {
    const probleme = [], fremd = new Set();
    p.removeAllListeners('pageerror'); p.removeAllListeners('console'); p.removeAllListeners('request');
    p.on('pageerror', e => probleme.push('JS: ' + e.message));
    p.on('console', m => { if (/Content Security Policy|Refused to/.test(m.text())) probleme.push('CSP: ' + m.text().slice(0, 160)); });
    p.on('request', r => { const h = new URL(r.url()).host; if (h !== new URL(B).host) fremd.add(h); });
    const antwort = await p.goto(B + pfad); await p.waitForTimeout(1000);
    ok(antwort.status() === 200 && !probleme.length && !fremd.size, `${schema} /${pfad}: lädt` + (probleme[0] ? ' – ' + probleme[0] : '') + (fremd.size ? ' – fremd: ' + [...fremd].join(',') : ''));
    ok(!!antwort.headers()['content-security-policy'], `${schema} /${pfad}: Content-Security-Policy gesetzt`);
    const a = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
    ok(!a.violations.length, `${schema} /${pfad}: axe` + (a.violations.length ? ': ' + a.violations.map(v => v.id + ' ' + v.nodes[0].target.join(' ')).join(' | ') : ''));
  }
  await c.close();
}
const m = await (await browser.newContext({ viewport: { width: 320, height: 640 } })).newPage();
for (const pfad of pfade) {
  await m.goto(B + pfad); await m.waitForTimeout(600);
  const breit = await m.evaluate(() => document.documentElement.scrollWidth);
  ok(breit <= 321, `320 px /${pfad}: ${breit} px`);
}
await browser.close();
console.log(fehler.length ? `\n${fehler.length} Fehler` : '\nalles OK');
process.exit(fehler.length ? 1 : 0);
