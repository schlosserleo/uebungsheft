/* Gemeinsame Bausteine für alle Seiten: Fächer (Kürzel, Heftfarbe), Übungsarten, Symbole, Übungskarte */
(() => {
  'use strict';

  // Fach → [Kürzel wie im Stundenplan, Farbton (OKLCH), Buntheit]. Farben angelehnt an übliche Heftumschläge.
  const FAECHER = {
    'Mathematik': ['M', 262, .17], 'Wirtschaft': ['Wi', 195, .11], 'Deutsch': ['D', 27, .18], 'Chemie': ['Ch', 55, .15],
    'Französisch': ['F', 305, .15], 'Latein': ['L', 50, .07], 'Biologie': ['Bio', 145, .15], 'Medienbildung': ['MB', 350, .15],
    'Geographie': ['Geo', 115, .11], 'Englisch': ['E', 92, .14], 'Gemeinschaftskunde': ['GK', 230, .11], 'Griechisch': ['Gr', 285, .12],
    'Ernährung und Hauswirtschaft': ['EH', 70, .12], 'Technik': ['Te', 240, .05], 'Spanisch': ['Sp', 15, .15],
    'Geschichte': ['G', 75, .08], 'Landeskunde': ['Lk', 160, .1], 'Physik': ['Ph', 250, .08], 'Biotechnologie': ['BT', 170, .1],
    'Ethik': ['Eth', 320, .1], 'Kfz-Technik': ['Kfz', 30, .04], 'Sozialpädagogik': ['SP', 0, .11], 'Sport': ['Spo', 130, .13],
    'Kunst': ['BK', 330, .14], 'Musik': ['Mu', 290, .14], 'Italienisch': ['It', 140, .11], 'Gesundheit': ['Ges', 180, .09],
    'Naturwissenschaften': ['NW', 150, .09], 'Informatik': ['Inf', 210, .11], 'Religion': ['Rel', 300, .08], 'NwT': ['NwT', 200, .1],
    'Grundschule': ['GS', 85, .13], 'Sonderpädagogik': ['SoP', 20, .1], 'Berufliche Schulen': ['BS', 220, .06]
  };
  // Mathehefte sind kariert, Sprachhefte liniert: so sehen auch die Umschläge ohne Vorschaubild aus
  const KARIERT = new Set(['Mathematik', 'Physik', 'Chemie', 'Informatik', 'Naturwissenschaften', 'NwT', 'Technik',
    'Wirtschaft', 'Kfz-Technik', 'Biotechnologie']);
  const OHNE = 'Ohne Fach';

  const BEREICHE = {
    quiz: 'Quiz & Fragen', text: 'Lückentexte & Wörter', ziehen: 'Zuordnen & Ordnen', karten: 'Lernkarten & Memory',
    bild: 'Bilder entdecken', video: 'Videos', buch: 'Präsentationen & Bücher', sonst: 'Sonstiges'
  };
  // Symbole (24er-Raster, nur Linien) je Übungsbereich und für die Bedienung
  const SYMBOLE = {
    quiz: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="m8 12.5 3 3 5-6.5"/>',
    text: '<path d="M3 6h18M3 18h11M3 12h4m10 0h4"/><rect x="9" y="9.5" width="6" height="5" rx="1.2"/>',
    ziehen: '<rect x="3" y="3.5" width="9" height="6.5" rx="1.5"/><rect x="12" y="14" width="9" height="6.5" rx="1.5"/><path d="M7.5 13v1.5a3 3 0 0 0 3 3H11m5.5-6.5V9.5a3 3 0 0 0-3-3H13"/>',
    karten: '<rect x="3" y="7" width="12" height="14" rx="2"/><path d="M8 3.5h10a2.5 2.5 0 0 1 2.5 2.5v11"/>',
    bild: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="m3.5 17 5-5 4 4 3-3 5 5"/><circle cx="15.5" cy="9" r="1.5"/>',
    video: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/>',
    buch: '<path d="M12 6.5C10 5 7 4.5 3 4.5v14c4 0 7 .5 9 2 2-1.5 5-2 9-2v-14c-4 0-7 .5-9 2zm0 0v14"/>',
    sonst: '<circle cx="7.5" cy="7.5" r="3.5"/><rect x="13.5" y="4" width="7" height="7" rx="1.5"/><path d="m7.5 13.5 4 7h-8z"/><rect x="13.5" y="13.5" width="7" height="7" rx="3.5"/>',
    nochmal: '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5"/>',
    link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
    laden: '<path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/>',
    wuerfel: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r=".6"/><circle cx="12" cy="12" r=".6"/><circle cx="15.5" cy="15.5" r=".6"/>'
  };

  function el(tag, attrs, ...kinder) {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) e.setAttribute(k, v === true ? '' : v);
    e.append(...kinder.filter(k => k != null && k !== false));
    return e;
  }

  function symbol(name, klasse) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'symbol' + (klasse ? ' ' + klasse : ''));
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = SYMBOLE[name] || SYMBOLE.sonst;  // nur eigene, feste Zeichenketten
    return svg;
  }

  function fach(name) {
    const f = FAECHER[name];
    if (f) return { name, kuerzel: f[0], h: f[1], c: f[2] };
    if (!name || name === OHNE) return { name: OHNE, kuerzel: '?', h: 260, c: 0 };
    let h = 0;
    for (const z of name) h = (h * 31 + z.codePointAt(0)) % 360;
    return { name, kuerzel: name.slice(0, 2), h, c: .1 };
  }

  function fachfarbe(e, name) {
    const f = fach(name);
    e.classList.add('fachfarbe');
    e.style.setProperty('--fh', f.h);
    e.style.setProperty('--fc', f.c);
    return e;
  }

  const hauptfach = u => (u.faecher && u.faecher[0]) || OHNE;

  // Suchbegriffe ohne Akzente und Groß-/Kleinschreibung vergleichen
  const normal = s => String(s || '').toLocaleLowerCase('de-DE').normalize('NFD').replace(/[̀-ͯ]/g, '');

  // Text mit hervorgehobenen Suchwörtern (<mark>); Positionen werden auf den Originaltext zurückgerechnet
  function markiert(text, woerter) {
    if (!woerter || !woerter.length) return document.createTextNode(text);
    let flach = '', pos = 0;
    const herkunft = [];  // je Zeichen des flachen Texts: [Anfang, Ende] im Originaltext
    for (const z of text) {
      for (const n of normal(z)) { flach += n; herkunft.push([pos, pos + z.length]); }
      pos += z.length;
    }
    const treffer = new Array(text.length).fill(false);
    for (const w of woerter) {
      for (let i = flach.indexOf(w); i >= 0; i = flach.indexOf(w, i + 1)) {
        for (let j = i; j < i + w.length; j++) treffer.fill(true, ...herkunft[j]);
      }
    }
    const frag = document.createDocumentFragment();
    let i = 0;
    while (i < text.length) {
      let j = i;
      while (j < text.length && treffer[j] === treffer[i]) j++;
      frag.append(treffer[i] ? el('mark', null, text.slice(i, j)) : text.slice(i, j));
      i = j;
    }
    return frag;
  }

  function groesse(b) {
    if (!b) return '';
    if (b >= 1e9) return (b / 1e9).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' GB';
    if (b >= 1e6) return (b / 1e6).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' MB';
    return Math.max(1, Math.round(b / 1e3)) + ' KB';
  }

  /* Eine Übung als Heft: Umschlag in der Farbe des Fachs (kariert/liniert oder Vorschaubild), darunter Titel,
     Aufgabe, Übungsart und Fach. Die ganze Karte ist klickbar, der Linktext bleibt der Titel. */
  function heft(u, { ebene = 3, fachZeigen = true, woerter = null } = {}) {
    const fachName = hauptfach(u);
    const li = fachfarbe(el('li', { class: 'heft', 'data-id': u.id }), fachName);
    const umschlag = el('div', { class: 'umschlag ' + (KARIERT.has(fachName) ? 'kariert' : 'liniert') });
    if (u.bild) umschlag.append(el('img', { src: u.bild, alt: '', loading: 'lazy', decoding: 'async' }));
    else umschlag.append(symbol(u.gruppe));
    li.append(umschlag);
    const titel = el('h' + ebene, { class: 'heft-titel' });
    titel.append(el('a', { class: 'heft-link', href: 'spielen.html?id=' + u.id }, markiert(u.titel || 'Ohne Titel', woerter)));
    li.append(titel);
    if (u.anriss) li.append(el('p', { class: 'heft-anriss' }, markiert(u.anriss, woerter)));
    const meta = el('ul', { class: 'heft-meta' });
    meta.append(el('li', null, symbol(u.gruppe), u.typ));
    if (fachZeigen && fachName !== OHNE) meta.append(el('li', null, el('span', { class: 'punkt', 'aria-hidden': 'true' }), fachName));
    li.append(meta);
    if (u.wayback || u.selbstgebaut) li.append(el('p', { class: 'heft-markierung' }, 'Teilweise wiederhergestellt'));
    return li;
  }

  function zufall(liste) {
    const spielbar = liste.filter(u => u.spielbar);
    return spielbar[Math.floor(Math.random() * spielbar.length)];
  }

  // Aktiven Menüpunkt markieren (Kopfzeile ist ein gemeinsamer Baustein)
  document.addEventListener('DOMContentLoaded', () => {
    const seite = location.pathname.split('/').pop() || 'index.html';
    for (const a of document.querySelectorAll('.kopf-navi a:not([href*="?"])')) {
      if ((a.getAttribute('href').split('/').pop() || 'index.html') === seite) a.setAttribute('aria-current', 'page');
    }
  });

  window.Heft = { el, symbol, fach, fachfarbe, hauptfach, normal, markiert, groesse, heft, zufall, BEREICHE, OHNE };
})();
