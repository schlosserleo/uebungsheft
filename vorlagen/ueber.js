/* ueber.html – Zahlen zum Bestand (ausgelagert für die Content-Security-Policy) */
(() => {
  'use strict';
  const H = window.Heft, { el, symbol } = H;
  const daten = window.H5P_ARCHIV || { uebungen: [], statistik: {} };
  const liste = daten.uebungen, st = daten.statistik || {};
  const zahl = n => new Intl.NumberFormat('de-DE').format(n);

  const arten = new Map();
  for (const u of liste) {
    const a = arten.get(u.typ) || { n: 0, gruppe: u.gruppe };
    a.n++;
    arten.set(u.typ, a);
  }

  function zeile(tbody, kopf, wert) {
    tbody.append(el('tr', null, el('th', { scope: 'row' }, kopf), el('td', null, wert)));
  }
  const b = document.querySelector('#bestand tbody');
  zeile(b, 'Übungen', zahl(liste.length));
  zeile(b, 'Übungsarten', zahl(arten.size));
  zeile(b, 'Davon teilweise wiederhergestellt', zahl(liste.filter(u => u.wayback || u.selbstgebaut).length));
  zeile(b, 'Fach von der Fachseite auf schule-bw.de', zahl(st.faecherArtikel || 0));
  zeile(b, 'Fach nach Inhalt zugeordnet', zahl(st.faecherInhalt || 0));
  zeile(b, 'Original-Dateien (.h5p)', H.groesse(st.exportBytes || 0));
  zeile(b, 'Für den Player entpackt', H.groesse((st.libsBytes || 0) + (st.inhalteBytes || 0)));
  zeile(b, 'H5P-Bibliotheken (je Version einmal)', zahl(st.libsAnzahl || 0));

  const a = document.querySelector('#arten tbody');
  [...arten].sort((x, y) => y[1].n - x[1].n || x[0].localeCompare(y[0], 'de')).forEach(([typ, { n, gruppe }]) => {
    zeile(a, el('a', { href: './?art=' + encodeURIComponent(typ) }, symbol(gruppe), typ), zahl(n));
  });

  document.getElementById('inhalt').removeAttribute('data-laedt');

  if (st.erzeugt) {
    document.getElementById('stand').textContent = 'Stand der Übungsliste: ' +
      new Date(st.erzeugt).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }) + '.';
  }
})();
