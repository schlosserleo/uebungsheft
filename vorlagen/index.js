/* index.html – Startseite (Stundenplan der Fächer) und Liste (Fach, Übungsart, Suche).
   Der Zustand steht vollständig in der Adresse. Mit Navigation API wechselt die Ansicht ohne Neuladen (mit
   Übergang), ohne sie sind alle Filter normale Links und die Seite baut sich aus der Adresse neu. */
(() => {
  'use strict';
  const PRO_SEITE = 24;
  const H = window.Heft, { el, symbol } = H;
  const alle = (window.H5P_ARCHIV || { uebungen: [] }).uebungen;
  const $ = id => document.getElementById(id);
  const zahl = n => new Intl.NumberFormat('de-DE').format(n);
  const suche = $('suche'), sortSel = $('sortierung');
  const ruhig = matchMedia('(prefers-reduced-motion: reduce)');
  const START_TITEL = document.title, NAME = document.title.split(' – ')[0];

  for (const u of alle) {
    u._suche = H.normal([u.titel, u.anriss, u.typ, u.id, ...(u.autoren || []), ...(u.faecher || [])].join(' '));
  }
  const imFach = (u, f) => f === H.OHNE ? !(u.faecher && u.faecher.length) : (u.faecher || []).includes(f);
  const zaehle = (m, k) => m.set(k, (m.get(k) || 0) + 1);

  const faecher = new Map(), bereiche = new Map(), arten = new Map();
  for (const u of alle) {
    for (const f of u.faecher && u.faecher.length ? u.faecher : [H.OHNE]) zaehle(faecher, f);
    zaehle(bereiche, u.gruppe);
    if (!arten.has(u.typ)) arten.set(u.typ, u.gruppe);
  }
  const bereichsReihe = [...bereiche.keys()].sort((a, b) => bereiche.get(b) - bereiche.get(a));
  const mitFach = [...faecher.keys()].filter(f => f !== H.OHNE)
    .sort((a, b) => faecher.get(b) - faecher.get(a) || a.localeCompare(b, 'de'));
  const nurListe = alle.length > 0 && mitFach.length < 2;  // ohne Fächerzuordnung gibt es keinen Stundenplan

  // ------------------------------------------------------------ Zustand <-> Adresse
  function lesen(url) {
    const p = new URL(url, location.href).searchParams;
    const z = {
      q: (p.get('q') || '').trim(),
      fach: faecher.has(p.get('fach')) ? p.get('fach') : '',
      art: arten.has(p.get('art')) ? p.get('art') : '',
      sort: ['alt', 'titel'].includes(p.get('sort')) ? p.get('sort') : 'neu',
      seite: Math.max(1, parseInt(p.get('seite'), 10) || 1),
      alle: p.has('alle')
    };
    z.bereich = bereiche.has(p.get('bereich')) ? p.get('bereich') : (z.art ? arten.get(z.art) : '');
    z.ansicht = z.q || z.fach || z.bereich || z.art || z.alle || nurListe ? 'liste' : 'start';
    return z;
  }
  function adresse(z) {
    const p = new URLSearchParams();
    if (z.fach) p.set('fach', z.fach);
    if (z.bereich) p.set('bereich', z.bereich);
    if (z.art) p.set('art', z.art);
    if (z.q) p.set('q', z.q);
    if (z.sort && z.sort !== 'neu') p.set('sort', z.sort);
    if (z.seite > 1) p.set('seite', z.seite);
    if (z.alle && !p.toString()) p.set('alle', '');
    const qs = p.toString();
    return qs ? '?' + qs : './';
  }
  const mit = (z, aenderung) => ({ ...z, seite: 1, ...aenderung });

  // ------------------------------------------------------------ Startseite
  function stunde(f) {
    const a = H.fachfarbe(el('a', { class: 'stunde', href: adresse({ fach: f }), 'data-fach': f }), f);
    a.append(
      el('span', { class: 'kuerzel', 'aria-hidden': 'true' }, H.fach(f).kuerzel),
      el('span', { class: 'name' }, f),
      el('span', { class: 'zahl' }, zahl(faecher.get(f)), el('span', { class: 'sr-only' }, ' Übungen'))
    );
    return el('li', null, a);
  }

  function probeZeigen() {
    const spielbar = alle.filter(u => u.spielbar);
    const auswahl = [];
    while (auswahl.length < Math.min(4, spielbar.length)) {
      const u = spielbar[Math.floor(Math.random() * spielbar.length)];
      if (!auswahl.includes(u)) auswahl.push(u);
    }
    $('probe').replaceChildren(...auswahl.map(u => H.heft(u)));
    $('probe-bereich').hidden = !auswahl.length;
  }

  function startBauen() {
    if (!alle.length) {
      $('unterzeile').textContent = 'Die Sammlung wird gerade aufgebaut. Schau später noch einmal vorbei.';
      $('arten-titel').parentNode.hidden = true;
      return;
    }
    $('unterzeile').textContent = zahl(alle.length) + ' Übungen in ' + zahl(mitFach.length) + ' Fächern aus dem ' +
      'ehemaligen Landesbildungsserver Baden-Württemberg. Ohne Anmeldung, direkt im Browser.';
    const haupt = mitFach.slice(0, 10), weitere = mitFach.slice(10);
    if (faecher.has(H.OHNE)) weitere.push(H.OHNE);
    $('stundenplan').append(...haupt.map(stunde));
    $('stundenplan-weitere').append(...weitere.map(stunde));
    $('weitere-titel').hidden = $('stundenplan-weitere').hidden = !weitere.length;
    $('plan-bereich').hidden = !haupt.length;
    $('arten-kacheln').append(...bereichsReihe.map(g => {
      const a = el('a', { href: adresse({ bereich: g }) }, symbol(g), el('span', null, H.BEREICHE[g] || g),
        el('span', { class: 'zahl' }, zahl(bereiche.get(g))));
      return el('li', null, a);
    }));
    probeZeigen();
  }

  // ------------------------------------------------------------ Liste
  function chip(z, text, n, aktiv, sym, schluessel) {
    const a = el('a', { class: 'chip', href: adresse(z), 'aria-current': aktiv ? 'true' : null, 'data-schluessel': schluessel });
    if (sym) a.append(symbol(sym));
    a.append(el('span', null, text), el('span', { class: 'zahl' }, zahl(n)));
    return el('li', null, a);
  }

  function seitenEintrag(z, n, aktuell, text, label) {
    if (n === aktuell && !text) return el('li', null, el('span', { 'aria-current': 'page' }, String(n)));
    return el('li', null, el('a', { href: adresse(mit(z, { seite: n })), 'aria-label': label, 'data-schluessel': 's:' + n }, text || String(n)));
  }

  function listeZeigen(z) {
    const woerter = H.normal(z.q).split(/\s+/).filter(Boolean);
    const basis = alle.filter(u => (!z.fach || imFach(u, z.fach)) && woerter.every(w => u._suche.includes(w)));
    const zB = new Map(), zA = new Map();
    for (const u of basis) { zaehle(zB, u.gruppe); zaehle(zA, u.typ); }
    const liste = basis.filter(u => (!z.art || u.typ === z.art) && (!z.bereich || u.gruppe === z.bereich));
    if (z.sort === 'titel') liste.sort((a, b) => a.titel.localeCompare(b.titel, 'de'));
    else liste.sort((a, b) => z.sort === 'alt' ? a.id - b.id : b.id - a.id);

    // Kopf: im Fach in dessen Heftfarbe mit Kürzel, sonst auf Karopapier
    const kopf = $('listen-kopf'), kuerzel = $('listen-kuerzel');
    kopf.className = 'listen-kopf';
    kopf.removeAttribute('style');
    const artName = z.art || (z.bereich && H.BEREICHE[z.bereich]) || '';
    let titel;
    if (z.fach) {
      H.fachfarbe(kopf, z.fach);
      kuerzel.textContent = H.fach(z.fach).kuerzel;
      titel = z.fach;
    } else {
      kopf.classList.add('karopapier');
      titel = artName || (z.q ? '„' + z.q + '“' : 'Alle Übungen');
    }
    kuerzel.hidden = !z.fach;
    $('listen-titel').textContent = titel;
    const unter = [];
    if (z.fach) unter.push(zahl(faecher.get(z.fach)) + ' Übungen');
    if (z.q && (z.fach || artName)) unter.push('Suche nach „' + z.q + '“');
    if (!z.fach && z.q && !artName) unter.push('Suche in allen Fächern');
    $('listen-unterzeile').textContent = unter.join(', ');
    $('alle-faecher').hidden = nurListe;
    const aktionen = [];
    if (z.fach) {
      aktionen.push(el('a', { class: 'knopf leise', href: 'spielen.html?zufall=' + encodeURIComponent(z.fach) },
        symbol('wuerfel'), 'Zufällige Übung aus ' + z.fach));
    }
    if (z.q) aktionen.push(el('a', { class: 'knopf-link', href: adresse(mit(z, { q: '' })) }, 'Suche aufheben'));
    $('listen-aktionen').replaceChildren(...aktionen);
    document.title = titel + ' – ' + NAME;

    // Übungsarten: Bereiche, im gewählten Bereich auch die einzelnen Arten
    const ul = $('bereiche');
    ul.replaceChildren(chip(mit(z, { bereich: '', art: '' }), 'Alle', basis.length, !z.bereich, null, 'b:'));
    for (const g of bereichsReihe) {
      const n = zB.get(g) || 0;
      if (n || g === z.bereich) ul.append(chip(mit(z, { bereich: g, art: '' }), H.BEREICHE[g] || g, n, g === z.bereich, g, 'b:' + g));
    }
    const drin = z.bereich ? [...arten.keys()].filter(t => arten.get(t) === z.bereich && (zA.get(t) || t === z.art))
      .sort((a, b) => (zA.get(b) || 0) - (zA.get(a) || 0) || a.localeCompare(b, 'de')) : [];
    const unterUl = $('unterarten');
    unterUl.hidden = drin.length < 2;
    unterUl.replaceChildren(...(unterUl.hidden ? [] : [
      chip(mit(z, { art: '' }), 'Alle in diesem Bereich', zB.get(z.bereich) || 0, !z.art, null, 'a:'),
      ...drin.map(t => chip(mit(z, { art: t }), t, zA.get(t) || 0, t === z.art, null, 'a:' + t))
    ]));
    sortSel.value = z.sort;

    // Karten und Seiten
    const seiten = Math.max(1, Math.ceil(liste.length / PRO_SEITE));
    const seite = Math.min(z.seite, seiten);
    $('hefte').replaceChildren(...liste.slice((seite - 1) * PRO_SEITE, seite * PRO_SEITE)
      .map(u => H.heft(u, { ebene: 2, fachZeigen: !z.fach, woerter })));
    $('treffer').textContent = zahl(liste.length) + ' ' + (woerter.length ? 'Treffer' : liste.length === 1 ? 'Übung' : 'Übungen') +
      (seiten > 1 ? ', Seite ' + seite + ' von ' + seiten : '');
    $('leer').hidden = liste.length > 0;
    if (!alle.length) {
      $('leer').querySelector('h2').textContent = 'Noch keine Übungen da';
      $('leer').querySelector('p').textContent = 'Die Sammlung wird gerade aufgebaut. Schau später noch einmal vorbei.';
      $('leer-zuruecksetzen').hidden = true;
    }
    const nav = $('seiten');
    nav.replaceChildren();
    if (seiten > 1) {
      if (seite > 1) nav.append(seitenEintrag(z, seite - 1, seite, 'Vorherige', 'Vorherige Seite'));
      let zuletzt = 0;
      for (let n = 1; n <= seiten; n++) {
        if (n !== 1 && n !== seiten && Math.abs(n - seite) > 1) continue;
        if (zuletzt && n - zuletzt > 1) nav.append(el('li', null, el('span', { class: 'luecke', 'aria-hidden': 'true' }, '…')));
        nav.append(seitenEintrag(z, n, seite, null, 'Seite ' + n));
        zuletzt = n;
      }
      if (seite < seiten) nav.append(seitenEintrag(z, seite + 1, seite, 'Nächste', 'Nächste Seite'));
    }
  }

  // ------------------------------------------------------------ Ansicht wechseln
  let aktuell = null;
  function zeigen(z, getippt = false) {
    aktuell = z;
    $('start').hidden = z.ansicht !== 'start';
    $('liste').hidden = z.ansicht !== 'liste';
    if (!getippt) suche.value = z.q;  // beim Tippen nicht dazwischenschreiben
    if (z.ansicht === 'liste') listeZeigen(z);
    else document.title = START_TITEL;
  }

  // Nach einem Klick dort weitermachen, wo man war: gleicher Filter-Knopf, sonst die Überschrift der Ansicht
  function fokus(z, vorher, klick) {
    const knopf = klick && document.querySelector('[data-schluessel="' + CSS.escape(klick) + '"]');
    if (knopf && !klick.startsWith('s:')) return knopf.focus({ preventScroll: true });
    if (z.ansicht === 'start') {
      const zelle = vorher && vorher.fach && document.querySelector('.stunde[data-fach="' + CSS.escape(vorher.fach) + '"]');
      return (zelle || $('start-titel')).focus({ preventScroll: true });
    }
    $('listen-titel').focus({ preventScroll: true });
  }

  function uebergang(fn, animiert) {
    if (!animiert || ruhig.matches || !document.startViewTransition) { fn(); return Promise.resolve(); }
    return document.startViewTransition(fn).updateCallbackDone;
  }

  const navigationApi = 'navigation' in window && window.NavigateEvent && 'intercept' in NavigateEvent.prototype;
  const ohneIndex = p => p.replace(/index\.html$/, '');
  let letzterKlick = null;
  document.addEventListener('click', ev => {
    const s = ev.target.closest && ev.target.closest('[data-schluessel]');
    letzterKlick = s ? s.dataset.schluessel : null;
  }, true);

  if (navigationApi) {
    navigation.addEventListener('navigate', e => {
      const klick = letzterKlick;
      letzterKlick = null;
      if (!e.canIntercept || e.hashChange || e.downloadRequest || e.formData) return;
      const ziel = new URL(e.destination.url);
      if (ziel.origin !== location.origin || ohneIndex(ziel.pathname) !== ohneIndex(location.pathname)) return;
      const leise = !!(e.info && e.info.leise);
      const halten = leise || /^[ab]:/.test(klick || '');  // Filter: Position behalten
      // Position im Verlaufseintrag merken (nur im Tab-Verlauf, nicht gespeichert): Chrome stellt sonst nur
      // Positionen wieder her, auf denen gescrollt wurde
      try { navigation.updateCurrentEntry({ state: { y: window.scrollY } }); } catch (err) { /* nicht möglich */ }
      e.intercept({
        focusReset: 'manual',
        scroll: 'manual',
        handler: async () => {
          const vorher = aktuell, z = lesen(ziel.href);
          await uebergang(() => zeigen(z, leise), !leise);
          // Seitenzahl: zum Anfang der Liste; Zurück/Vor: alte Position; neue Ansicht: nach oben
          // (e.scroll() setzt ohne #Anker nicht nach oben zurück)
          if ((klick || '').startsWith('s:')) document.querySelector('.filter').scrollIntoView({ block: 'start' });
          else if (e.navigationType === 'traverse') {
            const y = (e.destination.getState() || {}).y;
            if (typeof y === 'number') window.scrollTo(0, y); else e.scroll();
          }
          else if (!halten) window.scrollTo(0, 0);
          if (!leise) fokus(z, vorher, klick);
        }
      });
    });
  } else {
    window.addEventListener('popstate', () => zeigen(lesen(location.href)));
  }

  // Zustand ändern, ohne den Fokus zu verlieren (Suche, Sortierung)
  function gehe(url, art) {
    if (new URL(url, location.href).href === location.href) return;
    if (navigationApi) return navigation.navigate(url, { history: art, info: { leise: true } });
    history[art === 'push' ? 'pushState' : 'replaceState'](null, '', url);
    zeigen(lesen(location.href), true);
  }

  let warte;
  function suchen() {
    clearTimeout(warte);
    const z = aktuell.ansicht === 'start' ? lesen('./') : aktuell;
    gehe(adresse(mit(z, { q: suche.value.trim() })), aktuell.ansicht === 'start' ? 'push' : 'replace');
  }
  suche.addEventListener('input', () => { clearTimeout(warte); warte = setTimeout(suchen, 160); });
  suche.form.addEventListener('submit', ev => { ev.preventDefault(); suchen(); });
  sortSel.addEventListener('change', () => gehe(adresse(mit(aktuell, { sort: sortSel.value })), 'replace'));
  $('mischen').addEventListener('click', () => uebergang(probeZeigen, true));
  // „/“ springt in die Suche
  document.addEventListener('keydown', ev => {
    if (ev.key === '/' && !ev.ctrlKey && !ev.metaKey && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) {
      ev.preventDefault();
      suche.focus();
    }
  });

  // Seitenwechsel zur Übung: der Umschlag der angeklickten Karte wird zum Übungsblatt
  window.addEventListener('pageswap', e => {
    if (!e.viewTransition || !e.activation || !e.activation.entry) return;
    const id = new URL(e.activation.entry.url).searchParams.get('id');
    const sichtbar = aktuell.ansicht === 'start' ? '#probe' : '#hefte';
    const umschlag = id && document.querySelector(sichtbar + ' .heft[data-id="' + CSS.escape(id) + '"] .umschlag');
    if (!umschlag) return;
    umschlag.style.viewTransitionName = 'blatt';
    e.viewTransition.finished.finally(() => { umschlag.style.viewTransitionName = ''; });
  });

  startBauen();
  zeigen(lesen(location.href));
  $('inhalt').removeAttribute('data-laedt');
})();
