// Abnahme gegen eine laufende Übungsheft-Instanz mit Übungen.
//   BASE=https://uebungen.example.org/ [BENUTZER=… PASSWORT=…] node abnahme.mjs
// Prüft: Navigation, Content-Security-Policy (Konsolenmeldungen, auch aus dem Player-Rahmen), keine fremden Server,
// nichts im Browserspeicher, YouTube nur nach Zustimmung, Formeln lokal, Einbettung, axe (WCAG 2.2 AA) hell/dunkel,
// 320 px, Tastatur, und eine Stichprobe mit jeder Übungsart.
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const B = (process.env.BASE || 'http://localhost:8080/').replace(/\/?$/, '/');
const HOST = new URL(B).host;
const ZUGANG = process.env.BENUTZER ? { httpCredentials: { username: process.env.BENUTZER, password: process.env.PASSWORT || '' } } : {};
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const fehler = [];
const ok = (bedingung, text) => { console.log((bedingung ? 'OK   ' : 'FAIL ') + text); if (!bedingung) fehler.push(text); };

async function seite(opts = {}) {
  const c = await browser.newContext({ ...ZUGANG, viewport: { width: 1280, height: 900 }, ...opts });
  const p = await c.newPage();
  p.__fehler = []; p.__fremd = new Set(); p.__mathjax = false;
  p.on('pageerror', e => p.__fehler.push('JS: ' + e.message));
  // CSP-Verstöße zeigt der Browser in der Konsole – auch aus dem Player-Rahmen (dort greifen Event-Listener nicht)
  p.on('console', m => { if (/Content Security Policy|Refused to (execute|load|apply|frame|connect)/.test(m.text())) p.__fehler.push('CSP: ' + m.text().slice(0, 170)); });
  p.on('request', r => { const u = new URL(r.url()); if (u.host && u.host !== HOST) p.__fremd.add(u.host); if (u.pathname.includes('/player/mathjax/')) p.__mathjax = true; });
  return p;
}
const ohneAutoplay = l => l.filter(m => !/play\(\) failed/.test(m));  // Videos ohne vorherigen Klick: harmlos

async function uebung(p, id) {
  p.__fehler = []; p.__fremd.clear(); p.__mathjax = false;
  await p.goto(B + 'spielen.html?id=' + id);
  await p.waitForFunction(() => document.body.dataset.h5pGeladen, null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(800);
  const r = await p.evaluate(() => {
    const f = document.querySelector('#h5p-container iframe'); let inhalt = 0, lang = '', formeln = 0;
    try {
      const d = f.contentDocument;
      inhalt = d.body.innerText.trim().length || (d.querySelector('img,canvas,video,audio,iframe,svg,button,[role=button]') ? 1 : 0);
      lang = d.documentElement.lang; formeln = d.querySelectorAll('.MathJax, .MathJax_CHTML, .mjx-chtml').length;
    } catch (e) { /* kein Rahmen */ }
    return { geladen: document.body.dataset.h5pGeladen, titel: f && f.title, inhalt, lang, formeln };
  });
  if (p.__mathjax && !r.formeln) { await p.waitForTimeout(2500); r.formeln = await p.evaluate(() => { try { return document.querySelector('#h5p-container iframe').contentDocument.querySelectorAll('.MathJax, .MathJax_CHTML, .mjx-chtml').length; } catch (e) { return 0; } }); }
  return { ...r, fehler: ohneAutoplay(p.__fehler), fremd: [...p.__fremd], mathjax: p.__mathjax };
}

// --- Startseite und Navigation
const p = await seite();
await p.goto(B); await p.waitForSelector('.stunde');
const liste = await p.evaluate(() => window.H5P_ARCHIV.uebungen);
ok(liste.length > 0, `Übungsliste: ${liste.length} Übungen`);
ok(!p.__fehler.length && !p.__fremd.size, 'Startseite: keine Fehler, keine fremden Server' + (p.__fehler[0] ? ': ' + p.__fehler[0] : '') + (p.__fremd.size ? ': ' + [...p.__fremd].join(',') : ''));
const fach = await p.locator('.stunde').first().getAttribute('data-fach');
await p.locator('.stunde').first().click(); await p.waitForSelector('.heft:visible');
ok(decodeURIComponent(p.url()).includes('fach=' + fach), `Fach „${fach}“ öffnet die Fachansicht (${await p.locator('.heft:visible').count()} Hefte)`);
await p.locator('.heft-link:visible').first().click(); await p.waitForURL(/spielen\.html/);
await p.waitForFunction(() => document.body.dataset.h5pGeladen, null, { timeout: 30000 });
await p.goBack(); await p.waitForSelector('.heft:visible');
ok(decodeURIComponent(p.url()).includes('fach=' + fach), 'Zurück führt wieder in die Fachansicht');
await p.goto(B); await p.fill('#suche', liste[0].titel.split(/\s+/)[0]); await p.keyboard.press('Enter'); await p.waitForTimeout(800);
ok(await p.locator('.heft:visible').count() > 0, 'Suche findet Übungen');
await p.goto(B); await p.keyboard.press('Tab');
ok(await p.evaluate(() => document.activeElement.classList.contains('skip')), 'Erster Tab-Stopp: „Zum Inhalt springen“');

// --- Einzelne Prüfungen an Übungen
const spielbar = liste.filter(u => u.spielbar);
const fremd = u => (u.externeMedien || []).some(m => m.status !== 'gesichert') || (u.fremdeSeiten || []).length;
const erste = spielbar.find(u => !fremd(u));
let r = await uebung(p, erste.id);
ok(r.geladen === '1' && r.inhalt > 0 && !r.fehler.length, `Übung ${erste.id} läuft` + (r.fehler[0] ? ': ' + r.fehler[0] : ''));
ok(r.titel && r.titel.startsWith('Übung') && r.lang && r.lang !== 'en', `Player-Rahmen hat Titel und Sprache (${r.lang})`);
ok(await p.evaluate(() => !Object.keys(localStorage).length && !Object.keys(sessionStorage).length && !document.cookie), 'Nichts in localStorage, sessionStorage oder Cookies');

const yt = spielbar.find(fremd);
if (yt) {
  p.__fremd.clear(); p.__fehler = [];
  await p.goto(B + 'spielen.html?id=' + yt.id); await p.waitForTimeout(2500);
  ok(await p.locator('.zustimmung button').isVisible() && !p.__fremd.size, `Übung ${yt.id} mit Fremdinhalt: erst Zustimmung, vorher keine fremden Anfragen` + (p.__fremd.size ? ' – ' + [...p.__fremd].join(',') : ''));
  await p.locator('.zustimmung button').click();
  await p.waitForFunction(() => document.body.dataset.h5pGeladen, null, { timeout: 30000 }); await p.waitForTimeout(2500);
  ok(!ohneAutoplay(p.__fehler).length, 'Nach Zustimmung ohne CSP- oder Skriptfehler' + (ohneAutoplay(p.__fehler)[0] ? ': ' + ohneAutoplay(p.__fehler)[0] : ''));
}
p.__fehler = [];
await p.goto(B + 'spielen.html?id=' + erste.id + '&einbettung=1'); await p.waitForFunction(() => document.body.dataset.h5pGeladen, null, { timeout: 30000 });
ok(!(await p.locator('.kopf').isVisible()) && await p.locator('h1').count() >= 1 && !p.__fehler.length, 'Einbettung zeigt nur die Übung (mit h1 für Screenreader)');

// --- axe hell/dunkel, 320 px
const pfade = ['', '?fach=' + encodeURIComponent(fach), '?q=' + encodeURIComponent(liste[0].titel.split(/\s+/)[0]),
  'spielen.html?id=' + erste.id, 'ueber.html', 'spielen.html?id=999999'];
for (const schema of ['light', 'dark']) {
  const q = await seite({ colorScheme: schema });
  for (const pfad of pfade) {
    await q.goto(B + pfad); await q.waitForTimeout(1500);
    const a = await new AxeBuilder({ page: q }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice']).exclude('iframe').analyze();
    if (a.violations.length) ok(false, `axe ${schema} /${pfad}: ` + a.violations.map(v => v.id + '×' + v.nodes.length + ' ' + v.nodes[0].target.join(' ')).join(' | '));
  }
  ok(true, `axe ${schema}: ${pfade.length} Ansichten geprüft`);
  await q.context().close();
}
const m = await seite({ viewport: { width: 320, height: 640 } });
for (const pfad of pfade) {
  await m.goto(B + pfad); await m.waitForTimeout(1200);
  const breit = await m.evaluate(() => document.documentElement.scrollWidth);
  if (breit > 321) ok(false, `320 px /${pfad}: Seite ist ${breit} px breit`);
}
ok(true, '320 px (entspricht 400 % Zoom): geprüft');

// --- Stichprobe: jede Übungsart einmal + zufällige (ohne Fremdinhalte, die brauchen Zustimmung)
const ohneFremd = spielbar.filter(u => !fremd(u));
const jeArt = {}; ohneFremd.forEach(u => { if (!jeArt[u.typ]) jeArt[u.typ] = u.id; });
const anzahl = Number(process.env.STICHPROBE || 40);
const ids = [...new Set([...Object.values(jeArt), ...ohneFremd.map(u => u.id).sort(() => Math.random() - .5).slice(0, anzahl)])];
let gut = 0, mitFormeln = 0; const schlecht = [], leer = [];
for (const id of ids) {
  const x = await uebung(p, id);
  if (x.mathjax) mitFormeln++;
  const probleme = [...x.fehler, ...x.fremd.map(h => 'fremder Server: ' + h), ...(x.mathjax && !x.formeln ? ['MathJax geladen, aber keine Formel gesetzt'] : [])];
  if (x.geladen === '1' && !probleme.length) { gut++; if (!x.inhalt) leer.push(id); }  // leer, aber fehlerfrei: meist schon im Original leer
  else schlecht.push(`${id}: geladen=${x.geladen} inhalt=${x.inhalt} ${probleme[0] || ''}`);
}
ok(gut === ids.length, `Stichprobe: ${gut}/${ids.length} Übungen (${Object.keys(jeArt).length} Übungsarten, ${mitFormeln} mit Formeln) ohne Fehler`);
schlecht.slice(0, 10).forEach(s => console.log('       ' + s));
if (leer.length) console.log(`HINW  ohne sichtbaren Inhalt (fehlerfrei, vermutlich schon im Original leer): ${leer.join(', ')}`);

await browser.close();
console.log(fehler.length ? `\n${fehler.length} Fehler` : '\nalles OK');
process.exit(fehler.length ? 1 : 0);
