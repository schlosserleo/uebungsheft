/* spielen.html – eine Übung im Fokus: Kopf in der Heftfarbe des Fachs, das Blatt, das Ergebnis und weiter im Fach.
   Nichts wird gespeichert: das Ergebnis kommt aus den xAPI-Meldungen der Übung und ist beim Neuladen weg. */
(() => {
  'use strict';
  const H = window.Heft, { el, symbol } = H;
  const liste = (window.H5P_ARCHIV || { uebungen: [] }).uebungen;
  const params = new URLSearchParams(location.search);
  const einbettung = !!params.get('einbettung');
  const $ = i => document.getElementById(i);
  const NAME = document.title.split(' – ').pop();

  function hinweis(text, art) { $('hinweise').append(el('p', { class: 'hinweis' + (art ? ' ' + art : '') }, text)); }
  function meldung(text) {
    const m = el('div', { class: 'meldung', role: 'status' }, text);
    document.body.append(m);
    setTimeout(() => m.remove(), 2400);
  }
  function kopieren(text, erfolg) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
      .then(() => meldung(erfolg), () => prompt('Zum Kopieren:', text));
  }

  // Zufall: ?zufall=1 (alle Fächer) oder ?zufall=<Fach>; die gezogene Übung bekommt ihre eigene Adresse
  if (params.has('zufall')) {
    const f = params.get('zufall');
    const u = H.zufall(f && f !== '1' ? liste.filter(x => H.hauptfach(x) === f || (x.faecher || []).includes(f)) : liste);
    if (u) {
      params.delete('zufall');
      params.set('id', u.id);
      history.replaceState(null, '', '?' + params);
    }
  }

  const id = Number(params.get('id'));
  const u = liste.find(x => x.id === id);
  if (!u) {
    $('titel').textContent = 'Diese Übung gibt es hier nicht';
    $('merkmale').replaceWith(el('p', null, 'Unter der Nummer ' + (id || '?') + ' ist keine Übung gespeichert. ',
      el('a', { href: './' }, 'Alle Fächer ansehen')));
    $('blatt').hidden = $('leiste').hidden = true;
    $('inhalt').removeAttribute('data-laedt');
    return;
  }

  // Kopf: Fach (zurück zur Liste), Titel, Übungsart, Autor:innen
  const fachName = H.hauptfach(u);
  const fach = H.fach(fachName);
  H.fachfarbe($('kopf'), fachName);
  document.title = u.titel + ' – ' + NAME;
  const fachLink = $('fach-link');
  fachLink.href = './?fach=' + encodeURIComponent(fachName);
  fachLink.append(el('span', { class: 'kuerzel', 'aria-hidden': 'true' }, fach.kuerzel), fachName);
  fachLink.hidden = false;
  // kam man aus genau dieser Fachliste, führt der Link dorthin zurück, wie man sie verlassen hat (Filter, Seite)
  fachLink.addEventListener('click', ev => {
    try {
      const ref = new URL(document.referrer);
      if (ref.origin === location.origin && /\/(index\.html)?$/.test(ref.pathname) &&
          ref.searchParams.get('fach') === fachName && history.length > 1) {
        ev.preventDefault();
        history.back();
      }
    } catch (e) { /* ohne Referrer normal zur Fachliste */ }
  });
  $('titel').textContent = u.titel;
  const merkmale = $('merkmale');
  merkmale.append(el('li', { class: 'art' }, symbol(u.gruppe), u.typ));
  if (u.autoren && u.autoren.length) merkmale.append(el('li', null, 'von ' + u.autoren.join(', ')));
  // Kopf steht: Seite zeigen (vorher unsichtbar, damit die Übung beim Laden nicht nach unten rutscht)
  $('inhalt').removeAttribute('data-laedt');

  // Weiter im Fach: Übungen einer Reihe haben meist aufeinanderfolgende Nummern
  const imFach = liste.filter(x => H.hauptfach(x) === fachName).sort((a, b) => a.id - b.id);
  const pos = imFach.indexOf(u);
  const vorige = imFach[pos - 1], naechste = imFach[pos + 1];
  const imFachText = fachName === H.OHNE ? 'ohne Fach' : 'in ' + fachName;
  const bl = $('blaettern');
  for (const [x, text, klasse] of [[vorige, 'Vorherige Übung ' + imFachText, 'zurueck'], [naechste, 'Nächste Übung ' + imFachText, 'weiter']]) {
    if (!x) continue;
    bl.append(el('a', { href: 'spielen.html?id=' + x.id, class: klasse, rel: klasse === 'weiter' ? 'next' : 'prev' },
      el('span', null, text), el('b', null, x.titel)));
  }
  bl.hidden = !bl.children.length;
  const nah = imFach.filter(x => x !== u && x !== vorige && x !== naechste)
    .sort((a, b) => Math.abs(a.id - u.id) - Math.abs(b.id - u.id)).slice(0, 4);
  if (nah.length) {
    $('verwandt-titel').textContent = fachName === H.OHNE ? 'Mehr Übungen' : 'Mehr in ' + fachName;
    $('verwandt-liste').append(...nah.map(x => H.heft(x, { fachZeigen: false })));
    $('verwandt').hidden = false;
  }

  // Werkzeuge unter dem Blatt; Datei und Einbettung für Lehrkräfte
  const neu = el('button', { type: 'button', class: 'knopf leise' }, symbol('nochmal'), 'Nochmal von vorn');
  neu.addEventListener('click', () => location.reload());
  const teilen = el('button', { type: 'button', class: 'knopf leise' }, symbol('link'), 'Link kopieren');
  teilen.addEventListener('click', () => kopieren(location.origin + location.pathname + '?id=' + u.id, 'Link kopiert'));
  $('werkzeuge').append(neu, teilen);
  const lk = $('lehrkraefte-inhalt');
  if (u.h5p) {
    lk.append(el('p', null, 'Die Original-Datei lässt sich in Moodle, ILIAS oder Lumi importieren und anpassen.'),
      el('p', null, el('a', { class: 'knopf leise', href: u.h5p, download: '' }, symbol('laden'), 'Herunterladen (.h5p, ' + H.groesse(u.bytes) + ')')));
  }
  const einbetten = el('button', { type: 'button', class: 'knopf-link' }, 'Adresse zum Einbetten kopieren');
  einbetten.addEventListener('click', () => kopieren(location.origin + location.pathname + '?id=' + u.id + '&einbettung=1', 'Adresse kopiert'));
  lk.append(el('p', null, 'Nur die Übung, ohne Kopf und Fuß, z. B. für ein iframe im Kurs: ', einbetten));
  $('lehrkraefte').hidden = false;

  if (u.wayback || u.selbstgebaut) {
    hinweis('Diese Übung war auf dem Originalserver nicht mehr vollständig vorhanden und wurde aus Resten wiederhergestellt. Einzelne Bilder oder Töne können fehlen.');
  }
  if (!u.spielbar) {
    hinweis('Diese Übung lässt sich hier nicht abspielen, weil ihr Inhalt fehlt.' + (u.h5p ? ' Unter „Für Lehrkräfte“ gibt es trotzdem die Datei.' : ''), 'fehler');
    $('blatt').hidden = neu.hidden = true;
    return;
  }

  // Eingebettet: Höhe des iframes im Artikel an die Übung anpassen (nur bei gleicher Herkunft möglich)
  if (einbettung) {
    try {
      const rahmen = window.frameElement;
      if (rahmen && window.ResizeObserver) {
        new ResizeObserver(() => { rahmen.style.height = document.documentElement.scrollHeight + 'px'; }).observe(document.body);
      }
    } catch (e) { /* andere Herkunft */ }
    // der Seitenkopf ist ausgeblendet: Überschrift nur für Screenreader
    $('blatt').prepend(el('h2', { class: 'sr-only' }, u.titel));
  }

  // Rahmen der Übung: Titel für Screenreader (WCAG 4.1.2) und Sprache der Übung statt „en“ (WCAG 3.1.1)
  let sprache = 'de';
  fetch('./player/inhalte/' + u.id + '/h5p.json').then(r => r.json()).then(j => {
    if (j.language && j.language !== 'und') sprache = j.language;
    rahmenAnpassen();
  }).catch(() => {});
  function rahmenAnpassen() {
    const f = $('h5p-container').querySelector('iframe');
    if (!f) return;
    f.title = 'Übung: ' + u.titel;
    try { if (f.contentDocument && f.contentDocument.documentElement) f.contentDocument.documentElement.lang = sprache; } catch (e) { /* noch nicht bereit */ }
  }
  new MutationObserver(rahmenAnpassen).observe($('h5p-container'), { childList: true, subtree: true });

  // Ergebnis: H5P meldet Punkte per xAPI („answered“/„completed“ der obersten Ebene, nicht der Teilaufgaben)
  function ergebnisZeigen(punkte, max) {
    const alles = punkte >= max;
    const box = $('ergebnis');
    box.replaceChildren();
    box.classList.toggle('teilweise', !alles);
    if (alles) {
      const haken = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      haken.setAttribute('viewBox', '0 0 52 44');
      haken.setAttribute('aria-hidden', 'true');
      haken.innerHTML = '<path d="M5 25c4 3 8 7 12 13C25 25 34 14 47 5"/>';
      box.append(haken);
    }
    const kopf = alles ? 'Alles richtig!' : punkte + ' von ' + max + ' Punkten';
    const zeile = alles ? max + ' von ' + max + ' Punkten' : 'Schau dir die Lösung an oder versuch es nochmal.';
    box.append(el('p', { class: 'ergebnis-text' }, el('b', null, kopf), el('span', null, zeile)));
    if (naechste) box.append(el('a', { class: 'knopf haupt', href: 'spielen.html?id=' + naechste.id }, 'Nächste Übung'));
    box.hidden = false;
    $('ergebnis-ansage').textContent = kopf + ' ' + (alles ? zeile : '');
  }
  function ergebnisVerfolgen(versuch = 0) {
    const rahmen = $('h5p-container').querySelector('iframe');
    let h5p = null;
    try { h5p = (rahmen ? rahmen.contentWindow : window).H5P; } catch (e) { /* fremde Herkunft */ }
    // der Rahmen baut H5P erst nach dem Laden seiner Skripte auf: kurz warten
    if (!h5p || !h5p.externalDispatcher) {
      if (versuch < 50) setTimeout(() => ergebnisVerfolgen(versuch + 1), 200);
      return;
    }
    h5p.externalDispatcher.on('xAPI', ev => {
      const st = ev && ev.data && ev.data.statement;
      if (!st || !st.result || !st.result.score) return;
      if (st.context && st.context.contextActivities && st.context.contextActivities.parent) return;
      const verb = String(st.verb && st.verb.id || '').split('/').pop();
      const { raw, max } = st.result.score;
      if ((verb === 'answered' || verb === 'completed') && max > 0) ergebnisZeigen(raw, max);
    });
  }

  // Inhalte, die nur bei YouTube & Co. oder auf fremden Webseiten liegen: erst nach Zustimmung laden
  // (DSGVO/TDDDG, Zwei-Klick-Lösung)
  const fremd = (u.externeMedien || []).filter(m => m.status !== 'gesichert')
    .map(m => m.url.replace(/^https?:\/\/(www\.)?([^\/]+).*$/, '$2'))
    .concat(u.fremdeSeiten || [])[0];
  if (fremd) {
    const box = el('div', { class: 'zustimmung' });
    box.append(el('p', null, 'Diese Übung lädt Inhalte von ' + fremd + '. Wenn du sie startest, überträgt dein Browser ' +
      'Daten wie deine IP-Adresse an diesen Anbieter, der dabei auch Cookies setzen kann.'));
    const los = el('button', { type: 'button', class: 'knopf haupt' }, 'Übung mit Inhalten von ' + fremd + ' laden');
    los.addEventListener('click', () => { box.remove(); starten(); $('blatt').focus(); });
    box.append(los);
    $('h5p-container').append(box);
  } else {
    starten();  // auch beim Vorladen im Hintergrund: dann steht die Übung schon, wenn man sie öffnet
  }

  function starten() {
    new H5PStandalone.H5P($('h5p-container'), {
      id: 'uebung-' + u.id,
      h5pJsonPath: './player/inhalte/' + u.id,
      librariesPath: './player/libs',
      frameJs: './player/standalone/frame.bundle.js',
      frameCss: './player/standalone/styles/h5p.css',
      frame: true,
      copyright: false,
      export: false,
      fullScreen: true,
      icon: false,
      reportingIsEnabled: true,
      // Ohne Nutzerangabe speichert H5P eine dauerhafte Kennung (H5PUserUUID) im Browser (TDDDG §25)
      user: { name: 'Gast', mail: 'gast@uebungsheft.invalid' },
      // Mit Nutzer fragt H5P sonst gespeicherte Spielstände beim Server ab (gibt es hier nicht): immer frisch starten
      contentUserData: [{ state: 'RESET' }],
      translations: { H5P: {
        fullscreen: 'Vollbild', disableFullscreen: 'Vollbild beenden', download: 'Herunterladen',
        copyrights: 'Nutzungsrechte', reuse: 'Wiederverwenden', reuseContent: 'Inhalt wiederverwenden',
        reuseDescription: 'Diesen Inhalt wiederverwenden.', downloadDescription: 'Diesen Inhalt als H5P-Datei herunterladen.',
        copyrightInformation: 'Nutzungsrechte', close: 'Schließen', title: 'Titel', author: 'Autor:in',
        source: 'Quelle', license: 'Lizenz', noCopyrights: 'Keine Angaben zu den Nutzungsrechten verfügbar.',
        copyrightsDescription: 'Angaben zu den Nutzungsrechten anzeigen.', year: 'Jahr', contentType: 'Inhaltstyp',
        licenseU: 'Nicht angegeben', licenseC: 'Urheberrecht', licenseExtras: 'Lizenz-Zusätze', changes: 'Änderungen',
        by: 'von', cancelLabel: 'Abbrechen', confirmLabel: 'Bestätigen', confirmDialogHeader: 'Aktion bestätigen'
      } }
    }).then(() => {
      rahmenAnpassen();
      ergebnisVerfolgen();
      document.body.dataset.h5pGeladen = '1';
    }).catch(e => {
      hinweis('Die Übung konnte nicht geladen werden (' + (e && e.message || e) + '). Lade die Seite neu oder probier eine andere Übung.', 'fehler');
      document.body.dataset.h5pGeladen = 'fehler';
    });
  }
})();
