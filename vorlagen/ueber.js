/* ueber.html – Seitenlogik (ausgelagert für die Content-Security-Policy) */
document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  var H = window.Heft, el = H.el;
  var daten = window.H5P_ARCHIV || { uebungen: [], statistik: {} };
  var liste = daten.uebungen, st = daten.statistik || {};
  var zahl = new Intl.NumberFormat('de-DE');

  var arten = {};
  liste.forEach(function (u) { (arten[u.typ] = arten[u.typ] || { n: 0, gruppe: u.gruppe }).n++; });

  function zeile(tbody, kopf, wert) {
    var tr = el('tr'), th = el('th', { scope: 'row' });
    if (kopf instanceof Node) th.appendChild(kopf); else th.textContent = kopf;
    tr.appendChild(th); tr.appendChild(el('td', null, wert)); tbody.appendChild(tr);
  }
  var b = document.querySelector('#bestand tbody');
  zeile(b, 'Übungen', zahl.format(liste.length));
  zeile(b, 'Übungsarten', zahl.format(Object.keys(arten).length));
  zeile(b, 'Davon teilweise wiederhergestellt', zahl.format(liste.filter(function (u) { return u.wayback || u.selbstgebaut; }).length));
  zeile(b, 'Fach von der Fachseite auf schule-bw.de', zahl.format(st.faecherArtikel || 0));
  zeile(b, 'Fach nach Inhalt zugeordnet', zahl.format(st.faecherInhalt || 0));
  zeile(b, 'Original-Dateien (.h5p)', H.groesse(st.exportBytes || 0));
  zeile(b, 'Für den Player entpackt', H.groesse((st.libsBytes || 0) + (st.inhalteBytes || 0)));
  zeile(b, 'H5P-Bibliotheken (je Version einmal)', zahl.format(st.libsAnzahl || 0));

  var a = document.querySelector('#arten tbody');
  Object.keys(arten).sort(function (x, y) { return arten[y].n - arten[x].n || x.localeCompare(y, 'de'); }).forEach(function (t) {
    var name = H.heftfarbe(el('a', { 'class': 'art-marke', href: './?art=' + encodeURIComponent(t) }), arten[t].gruppe);
    name.appendChild(el('span', { 'class': 'farbe', 'aria-hidden': 'true' }));
    name.appendChild(el('span', null, t));
    zeile(a, name, zahl.format(arten[t].n));
  });

  document.getElementById('inhalt').removeAttribute('data-laedt');

  if (st.erzeugt) {
    document.getElementById('stand').textContent = 'Stand der Übungsliste: ' +
      new Date(st.erzeugt).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }) + '.';
  }
});
