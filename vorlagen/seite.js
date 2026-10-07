/* Gemeinsame Bausteine für index.html, spielen.html und ueber.html */
(function () {
  'use strict';

  var GRUPPEN = ['quiz', 'text', 'ziehen', 'karten', 'bild', 'video', 'buch', 'sonst'];
  var BEREICHE = {
    quiz: 'Quiz & Fragen', text: 'Lückentexte & Wörter', ziehen: 'Zuordnen & Ordnen', karten: 'Lernkarten & Memory',
    bild: 'Bilder entdecken', video: 'Videos', buch: 'Präsentationen & Bücher', sonst: 'Sonstiges'
  };

  // Fächergruppen für das Inhaltsverzeichnis der Startseite (Fächer ohne Gruppe landen unter „Weitere“)
  var FACHGRUPPEN = [
    ['Sprachen', ['Deutsch', 'Englisch', 'Französisch', 'Italienisch', 'Spanisch', 'Latein', 'Griechisch']],
    ['Mathematik und Naturwissenschaften', ['Mathematik', 'Physik', 'Chemie', 'Biologie', 'Informatik', 'NwT', 'Naturwissenschaften', 'Technik']],
    ['Gesellschaft', ['Geschichte', 'Geographie', 'Gemeinschaftskunde', 'Wirtschaft', 'Gesellschaftswissenschaften', 'Landeskunde', 'Ethik', 'Religion']],
    ['Kunst, Musik und Sport', ['Kunst', 'Musik', 'Sport', 'Gesundheit', 'Medienbildung']],
    ['Berufliche Bildung', ['Ernährung und Hauswirtschaft', 'Gartenbau', 'Kfz-Technik', 'Biotechnologie', 'Sozialpädagogik', 'Berufliche Schulen']],
    ['Schularten', ['Grundschule', 'Sonderpädagogik']]
  ];

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    if (text != null) e.textContent = text;
    return e;
  }

  function heftfarbe(e, gruppe) {
    e.style.setProperty('--heft', 'var(--h-' + (GRUPPEN.indexOf(gruppe) >= 0 ? gruppe : 'sonst') + ')');
    return e;
  }

  function groesse(b) {
    if (!b) return '';
    if (b >= 1e9) return (b / 1e9).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' GB';
    if (b >= 1e6) return (b / 1e6).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' MB';
    return Math.max(1, Math.round(b / 1e3)) + ' KB';
  }

  /* Eine Übung als Heft: Umschlag in der Farbe der Übungsart, Etikett mit der Übungsart, darunter Titel und Aufgabe */
  function heft(u, ebene) {
    var li = heftfarbe(el('li', { 'class': 'heft' }), u.gruppe);
    var a = el('a', { 'class': 'heft-link', href: 'spielen.html?id=' + u.id });
    var umschlag = el('div', { 'class': 'umschlag' + (u.bild ? ' mit-bild' : '') });
    if (u.bild) umschlag.appendChild(el('img', { src: u.bild, alt: '', loading: 'lazy', decoding: 'async' }));
    umschlag.appendChild(el('span', { 'class': 'etikett' }, u.typ));
    a.appendChild(umschlag);
    a.appendChild(el('h' + (ebene || 3), { 'class': 'heft-titel' }, u.titel || 'Ohne Titel'));
    li.appendChild(a);
    if (u.anriss) li.appendChild(el('p', { 'class': 'heft-anriss' }, u.anriss));
    if (u.faecher && u.faecher.length) li.appendChild(el('p', { 'class': 'heft-faecher' }, u.faecher.join(', ')));
    if (u.wayback || u.selbstgebaut) li.appendChild(el('p', { 'class': 'heft-markierung' }, 'Teilweise wiederhergestellt'));
    return li;
  }

  function zufall(liste) {
    var spielbar = liste.filter(function (u) { return u.spielbar; });
    return spielbar[Math.floor(Math.random() * spielbar.length)];
  }

  // Aktiven Menüpunkt markieren (Kopfzeile ist ein gemeinsamer Baustein)
  document.addEventListener('DOMContentLoaded', function () {
    var seite = location.pathname.split('/').pop() || 'index.html';
    Array.prototype.forEach.call(document.querySelectorAll('.hauptnavi a'), function (a) {
      var ziel = a.getAttribute('href').split('/').pop() || 'index.html';
      if (ziel === seite) a.setAttribute('aria-current', 'page');
    });
  });

  window.Heft = { el: el, heft: heft, heftfarbe: heftfarbe, groesse: groesse, zufall: zufall, BEREICHE: BEREICHE, FACHGRUPPEN: FACHGRUPPEN };
})();
