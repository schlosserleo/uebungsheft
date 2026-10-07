/* spielen.html – Seitenlogik (ausgelagert für die Content-Security-Policy) */
(function () {
  'use strict';
  var H = window.Heft, el = H.el;
  var liste = (window.H5P_ARCHIV || { uebungen: [] }).uebungen;
  var params = new URLSearchParams(location.search);
  var einbettung = !!params.get('einbettung');
  var id = Number(params.get('id'));
  var pos = liste.findIndex(function (x) { return x.id === id; });
  var u = liste[pos];
  var $ = function (i) { return document.getElementById(i); };

  function hinweis(text, art) { $('hinweise').appendChild(el('p', { 'class': 'hinweis' + (art ? ' ' + art : '') }, text)); }
  function meldung(text) {
    var m = el('div', { 'class': 'meldung', role: 'status' }, text);
    document.body.appendChild(m);
    setTimeout(function () { m.remove(); }, 2400);
  }

  // Zurück zur Liste mit den zuletzt gewählten Filtern
  Array.prototype.forEach.call(document.querySelectorAll('#zur-liste, .zur-liste'), function (a) {
    a.addEventListener('click', function (ev) {
      try {
        var ref = new URL(document.referrer);
        if (ref.origin === location.origin && /\/(index\.html)?$/.test(ref.pathname) && history.length > 1) { ev.preventDefault(); history.back(); }
      } catch (e) { /* ohne Referrer normal zur Übersicht */ }
    });
  });

  if (!u) {
    var kopf = $('kopf');
    kopf.appendChild(el('h1', null, 'Diese Übung gibt es hier nicht'));
    var p = el('p', null, 'Unter der Nummer ' + (id || '?') + ' ist keine Übung gespeichert. ');
    p.appendChild(el('a', { href: './' }, 'Alle Übungen ansehen'));
    kopf.appendChild(p);
    ['blatt', 'leiste', 'pfad-art'].forEach(function (i) { $(i).hidden = true; });
    $('inhalt').removeAttribute('data-laedt');
    return;
  }

  document.title = u.titel + ' – ' + document.title.split(' – ').pop();
  var hauptfach = u.faecher && u.faecher[0];
  if (hauptfach) {
    $('pfad-fach-li').hidden = false;
    $('pfad-fach').textContent = hauptfach;
    $('pfad-fach').href = './?fach=' + encodeURIComponent(hauptfach);
  }
  $('pfad-art').textContent = u.typ;
  $('pfad-art').href = './?' + (hauptfach ? 'fach=' + encodeURIComponent(hauptfach) + '&' : '') + 'art=' + encodeURIComponent(u.typ);

  // Kopf: Titel, Übungsart, Fächer, Autor:innen
  var kopfEl = $('kopf');
  kopfEl.appendChild(el('h1', null, u.titel));
  var merkmale = el('ul', { 'class': 'merkmale' });
  var artLi = H.heftfarbe(el('li', { 'class': 'art-marke' }), u.gruppe);
  artLi.appendChild(el('span', { 'class': 'farbe', 'aria-hidden': 'true' }));
  artLi.appendChild(el('span', null, u.typ));
  merkmale.appendChild(artLi);
  if (u.faecher && u.faecher.length) merkmale.appendChild(el('li', null, u.faecher.join(', ')));
  if (u.autoren && u.autoren.length) merkmale.appendChild(el('li', null, 'von ' + u.autoren.join(', ')));
  kopfEl.appendChild(merkmale);
  // Kopf steht: Seite zeigen (vorher unsichtbar, damit die Übung beim Laden nicht nach unten rutscht)
  $('inhalt').removeAttribute('data-laedt');

  // Herunterladen für Lehrkräfte
  if (u.h5p) {
    var dl = $('herunterladen');
    dl.appendChild(el('span', { 'class': 'klein' }, 'Für Moodle, ILIAS oder Lumi:'));
    dl.appendChild(el('a', { 'class': 'knopf', href: u.h5p, download: '' }, 'Herunterladen (.h5p, ' + H.groesse(u.bytes) + ')'));
  }
  $('neu').addEventListener('click', function () { location.reload(); });
  $('teilen').addEventListener('click', function () {
    var url = location.origin + location.pathname + '?id=' + u.id;
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject())
      .then(function () { meldung('Link kopiert'); }, function () { prompt('Link zum Kopieren:', url); });
  });

  // Blättern: vorherige und nächste Übung (nach Nummer; Reihen stehen meist hintereinander)
  var bl = $('blaettern');
  [[liste[pos - 1], 'Vorherige Übung', 'zurueck'], [liste[pos + 1], 'Nächste Übung', 'weiter']].forEach(function (x) {
    if (!x[0]) return;
    var a = el('a', { href: 'spielen.html?id=' + x[0].id, 'class': x[2], rel: x[2] === 'weiter' ? 'next' : 'prev' });
    a.appendChild(el('span', null, x[1]));
    a.appendChild(el('b', null, x[0].titel));
    bl.appendChild(a);
  });

  // Mehr in dieser Übungsart: die nächstgelegenen Nummern
  var verwandt = liste.filter(function (x) { return x.typ === u.typ && x.id !== u.id; })
    .sort(function (a, b) { return Math.abs(a.id - u.id) - Math.abs(b.id - u.id); }).slice(0, 4);
  if (verwandt.length) {
    $('verwandt').hidden = false;
    verwandt.forEach(function (x) { $('verwandt-liste').appendChild(H.heft(x, 3)); });
  }

  // Hinweise
  if (u.wayback || u.selbstgebaut) {
    hinweis('Diese Übung war auf dem Originalserver nicht mehr vollständig vorhanden und wurde aus Resten wiederhergestellt. Einzelne Bilder oder Töne können fehlen.');
  }
  // Inhalte, die nur bei YouTube & Co. oder auf fremden Webseiten liegen: erst nach Zustimmung laden
  // (DSGVO/TDDDG, Zwei-Klick-Lösung)
  var fremd = (u.externeMedien || []).filter(function (m) { return m.status !== 'gesichert'; })
    .map(function (m) { return m.url.replace(/^https?:\/\/(www\.)?([^\/]+).*$/, '$2'); })
    .concat(u.fremdeSeiten || [])[0];
  if (!u.spielbar) {
    hinweis('Diese Übung lässt sich hier nicht abspielen, weil ihr Inhalt fehlt.' + (u.h5p ? ' Die .h5p-Datei kannst du trotzdem herunterladen.' : ''), 'fehler');
    $('blatt').hidden = true; $('neu').hidden = true;
    return;
  }

  // Eingebettet: Höhe des iframes im Artikel an die Übung anpassen (nur bei gleicher Herkunft möglich)
  if (einbettung) {
    try {
      var rahmen = window.frameElement;
      if (rahmen && window.ResizeObserver) {
        new ResizeObserver(function () { rahmen.style.height = document.documentElement.scrollHeight + 'px'; }).observe(document.body);
      }
    } catch (e) { /* andere Herkunft */ }
  }

  // Rahmen der Übung: Titel für Screenreader (WCAG 4.1.2) und Sprache der Übung statt „en“ (WCAG 3.1.1)
  var sprache = 'de';
  fetch('./player/inhalte/' + u.id + '/h5p.json').then(function (r) { return r.json(); }).then(function (j) {
    if (j.language && j.language !== 'und') sprache = j.language;
    rahmenAnpassen();
  }).catch(function () {});
  function rahmenAnpassen() {
    var f = $('h5p-container').querySelector('iframe');
    if (!f) return;
    f.title = 'Übung: ' + u.titel;
    try { if (f.contentDocument && f.contentDocument.documentElement) f.contentDocument.documentElement.lang = sprache; } catch (e) { /* noch nicht bereit */ }
  }
  new MutationObserver(rahmenAnpassen).observe($('h5p-container'), { childList: true, subtree: true });

  if (einbettung) {
    // In der Einbettung ist der Seitenkopf ausgeblendet: Überschrift nur für Screenreader
    $('blatt').insertBefore(el('h1', { 'class': 'sr-only' }, u.titel), $('blatt').firstChild);
  }

  if (fremd) {
    var box = el('div', { 'class': 'zustimmung' });
    box.appendChild(el('p', null, 'Diese Übung lädt Inhalte von ' + fremd + '. Wenn du sie startest, überträgt dein Browser ' +
      'Daten wie deine IP-Adresse an diesen Anbieter, der dabei auch Cookies setzen kann.'));
    var los = el('button', { type: 'button', 'class': 'knopf haupt' }, 'Übung mit Inhalten von ' + fremd + ' laden');
    los.addEventListener('click', function () { box.remove(); starten(); $('blatt').focus(); });
    box.appendChild(los);
    $('h5p-container').appendChild(box);
  } else {
    starten();
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
  }).then(function () {
    rahmenAnpassen();
    document.body.dataset.h5pGeladen = '1';
  }).catch(function (e) {
    hinweis('Die Übung konnte nicht geladen werden (' + (e && e.message || e) + '). Lade die Seite neu oder probier eine andere Übung.', 'fehler');
    document.body.dataset.h5pGeladen = 'fehler';
  });
  }
})();
