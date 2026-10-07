/* index.html – Seitenlogik (ausgelagert für die Content-Security-Policy) */
document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  var PRO_SEITE = 24;
  var H = window.Heft, el = H.el;
  var daten = window.H5P_ARCHIV || { uebungen: [] };
  var alle = daten.uebungen;
  var $ = function (id) { return document.getElementById(id); };
  var suche = $('suche'), sortSel = $('sortierung');
  var zahl = new Intl.NumberFormat('de-DE');
  var art = '', bereich = '', fach = '', zaehlungB = {}, zaehlungA = {};
  var OHNE = 'Ohne Fach';

  function normal(s) { return String(s || '').toLocaleLowerCase('de-DE').normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  alle.forEach(function (u) {
    u._suche = normal([u.titel, u.anriss, u.typ, u.id, (u.autoren || []).join(' '), (u.faecher || []).join(' ')].join(' '));
  });

  if (alle.length) {
    $('unterzeile').textContent = zahl.format(alle.length) + ' Übungen aus dem ehemaligen Landesbildungsserver Baden-Württemberg: ' +
      'Quizze, Lückentexte, Zuordnungen, Lernkarten und mehr. Alles läuft direkt im Browser, ohne Anmeldung.';
  }

  // Bereiche (= Heftfarben) und darin die einzelnen Übungsarten, jeweils mit Anzahl
  var arten = {}, bereiche = {};
  alle.forEach(function (u) {
    (arten[u.typ] = arten[u.typ] || { n: 0, gruppe: u.gruppe }).n++;
    bereiche[u.gruppe] = (bereiche[u.gruppe] || 0) + 1;
  });
  function knopf(attr, wert, name, n, gruppe) {
    var b = el('button', { type: 'button', 'class': 'art', 'aria-pressed': 'false' });
    b.setAttribute(attr, wert);
    if (gruppe) { H.heftfarbe(b, gruppe); b.appendChild(el('span', { 'class': 'farbe', 'aria-hidden': 'true' })); }
    b.appendChild(el('span', null, name));
    b.appendChild(el('span', { 'class': 'zahl' }, zahl.format(n)));
    var li = el('li'); li.appendChild(b); return li;
  }
  $('arten').appendChild(knopf('data-bereich', '', 'Alle', alle.length, null));
  Object.keys(bereiche).sort(function (a, b) { return bereiche[b] - bereiche[a]; }).forEach(function (g) {
    $('arten').appendChild(knopf('data-bereich', g, H.BEREICHE[g] || g, bereiche[g], g));
  });
  function unterarten() {
    var ul = $('unterarten'); ul.replaceChildren();
    var g = bereich || (art && arten[art] && arten[art].gruppe) || '';
    var drin = Object.keys(arten).filter(function (t) { return arten[t].gruppe === g; })
      .sort(function (a, b) { return arten[b].n - arten[a].n || a.localeCompare(b, 'de'); });
    ul.hidden = drin.length < 2;
    if (ul.hidden) return;
    ul.appendChild(knopf('data-art', '', 'Alle in diesem Bereich', bereiche[g], null));
    drin.forEach(function (t) { ul.appendChild(knopf('data-art', t, t, arten[t].n, null)); });
  }

  // Fächer als Inhaltsverzeichnis, gruppiert; Übungen ohne Fach unter „Weitere“
  var faecher = {};
  alle.forEach(function (u) {
    var fs = u.faecher && u.faecher.length ? u.faecher : [OHNE];
    fs.forEach(function (f) { faecher[f] = (faecher[f] || 0) + 1; });
  });
  var bekannt = {};
  var gruppen = H.FACHGRUPPEN.map(function (g) { g[1].forEach(function (f) { bekannt[f] = 1; }); return [g[0], g[1].slice()]; });
  var weitere = Object.keys(faecher).filter(function (f) { return !bekannt[f] && f !== OHNE; }).sort(function (a, b) { return a.localeCompare(b, 'de'); });
  if (faecher[OHNE]) weitere.push(OHNE);
  if (weitere.length) gruppen.push(['Weitere', weitere]);
  gruppen.forEach(function (g) {
    var drin = g[1].filter(function (f) { return faecher[f]; });
    if (!drin.length) return;
    var spalte = el('div'), ul = el('ul');
    spalte.appendChild(el('h3', null, g[0]));
    drin.forEach(function (f) {
      var b = el('button', { type: 'button', 'class': 'fach', 'data-fach': f, 'aria-pressed': 'false' });
      b.appendChild(el('span', { 'class': 'name' }, f));
      b.appendChild(el('span', { 'class': 'punkte', 'aria-hidden': 'true' }));
      b.appendChild(el('span', { 'class': 'zahl' }, zahl.format(faecher[f])));
      var li = el('li'); li.appendChild(b); ul.appendChild(li);
    });
    spalte.appendChild(ul);
    $('faecher').appendChild(spalte);
  });
  $('faecher-bereich').hidden = Object.keys(faecher).length < 2;

  // Zustand in der URL, damit „Zurück“ aus einer Übung wieder hierher führt
  function lesen() {
    var p = new URLSearchParams(location.search);
    suche.value = p.get('q') || '';
    art = arten[p.get('art')] ? p.get('art') : '';
    bereich = bereiche[p.get('bereich')] ? p.get('bereich') : (art ? arten[art].gruppe : '');
    fach = faecher[p.get('fach')] ? p.get('fach') : '';
    sortSel.value = ['alt', 'titel'].indexOf(p.get('sort')) >= 0 ? p.get('sort') : 'neu';
    return Math.max(1, parseInt(p.get('seite'), 10) || 1);
  }
  function adresse(seite) {
    var p = new URLSearchParams();
    if (suche.value.trim()) p.set('q', suche.value.trim());
    if (bereich) p.set('bereich', bereich);
    if (art) p.set('art', art);
    if (fach) p.set('fach', fach);
    if (sortSel.value !== 'neu') p.set('sort', sortSel.value);
    if (seite > 1) p.set('seite', seite);
    var qs = p.toString();
    return qs ? '?' + qs : location.pathname;
  }

  function seitenEintrag(n, aktuell, text, label) {
    var li = el('li');
    if (n === aktuell && !text) { li.appendChild(el('span', { 'aria-current': 'page' }, String(n))); return li; }
    li.appendChild(el('a', { href: adresse(n), 'data-seite': n, 'aria-label': label }, text || String(n)));
    return li;
  }

  function zeigen(seite, springen) {
    var woerter = normal(suche.value.trim()).split(/\s+/).filter(Boolean), f = fach, s = sortSel.value;
    // Grundmenge: Fach und Suche; daraus zählen die Übungsarten, danach wird nach Art gefiltert
    var basis = alle.filter(function (u) {
      return (!f || (f === OHNE ? !(u.faecher && u.faecher.length) : (u.faecher || []).indexOf(f) >= 0)) &&
        woerter.every(function (w) { return u._suche.indexOf(w) >= 0; });
    });
    zaehlungB = {}; zaehlungA = {};
    basis.forEach(function (u) {
      zaehlungB[u.gruppe] = (zaehlungB[u.gruppe] || 0) + 1;
      zaehlungA[u.typ] = (zaehlungA[u.typ] || 0) + 1;
    });
    zaehlungB[''] = basis.length;
    var liste = basis.filter(function (u) { return (!art || u.typ === art) && (!bereich || u.gruppe === bereich); });
    if (s === 'titel') liste.sort(function (a, b) { return a.titel.localeCompare(b.titel, 'de'); });
    else if (s === 'neu') liste.sort(function (a, b) { return b.id - a.id; });

    var seiten = Math.max(1, Math.ceil(liste.length / PRO_SEITE));
    seite = Math.min(Math.max(1, seite), seiten);
    var frag = document.createDocumentFragment();
    liste.slice((seite - 1) * PRO_SEITE, seite * PRO_SEITE).forEach(function (u) { frag.appendChild(H.heft(u, 3)); });
    $('hefte').replaceChildren(frag);

    var gefiltert = !!(woerter.length || art || bereich || f);
    var artTitel = art || (bereich && H.BEREICHE[bereich]) || '';
    var titel = f && artTitel ? f + ': ' + artTitel : (f || artTitel || 'Alle Übungen');
    $('treffer').textContent = gefiltert
      ? (woerter.length ? zahl.format(liste.length) + ' Treffer' + (art || bereich || f ? ' in ' + titel : '') : titel + ' (' + zahl.format(liste.length) + ')')
      : zahl.format(liste.length) + ' Übungen';
    $('zuruecksetzen').hidden = !gefiltert || !liste.length;
    $('leer').hidden = liste.length > 0;
    if (!alle.length) {
      $('leer').querySelector('h2').textContent = 'Noch keine Übungen da';
      $('leer').querySelector('p').textContent = 'Die Sammlung wird gerade aufgebaut. Schau später noch einmal vorbei.';
      $('leer-zuruecksetzen').hidden = true;
    }
    unterarten();
    // Anzahlen an Fach und Suche anpassen; leere Arten ausblenden (außer der gewählten)
    Array.prototype.forEach.call(document.querySelectorAll('#arten .art'), function (b) {
      var n = zaehlungB[b.dataset.bereich] || 0;
      b.querySelector('.zahl').textContent = zahl.format(n);
      b.parentNode.hidden = !n && b.dataset.bereich !== bereich;
    });
    Array.prototype.forEach.call(document.querySelectorAll('#unterarten .art'), function (b) {
      var n = b.dataset.art ? zaehlungA[b.dataset.art] || 0 : zaehlungB[bereich || (arten[art] && arten[art].gruppe)] || 0;
      b.querySelector('.zahl').textContent = zahl.format(n);
      b.parentNode.hidden = !n && b.dataset.art !== art;
    });
    Array.prototype.forEach.call(document.querySelectorAll('.fach'), function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.fach === fach));
    });
    Array.prototype.forEach.call(document.querySelectorAll('#arten .art'), function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.bereich === bereich));
    });
    Array.prototype.forEach.call(document.querySelectorAll('#unterarten .art'), function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.art === art));
    });

    var nav = $('seiten'); nav.replaceChildren();
    if (seiten > 1) {
      if (seite > 1) nav.appendChild(seitenEintrag(seite - 1, seite, '‹', 'Vorherige Seite'));
      var zuletzt = 0;
      for (var n = 1; n <= seiten; n++) {
        if (n === 1 || n === seiten || Math.abs(n - seite) <= 1) {
          if (zuletzt && n - zuletzt > 1) nav.appendChild(el('li')).appendChild(el('span', { 'class': 'luecke', 'aria-hidden': 'true' }, '…'));
          nav.appendChild(seitenEintrag(n, seite, null, 'Seite ' + n));
          zuletzt = n;
        }
      }
      if (seite < seiten) nav.appendChild(seitenEintrag(seite + 1, seite, '›', 'Nächste Seite'));
    }
    history.replaceState(null, '', adresse(seite));
    if (springen) { $('uebungen').focus({ preventScroll: true }); $('uebungen').scrollIntoView({ block: 'start' }); }
  }

  function zuruecksetzen() { suche.value = ''; art = ''; bereich = ''; fach = ''; zeigen(1); }
  $('seiten').addEventListener('click', function (ev) {
    var a = ev.target.closest('a[data-seite]');
    if (!a || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
    ev.preventDefault(); zeigen(Number(a.dataset.seite), true);
  });
  $('arten').addEventListener('click', function (ev) {
    var b = ev.target.closest('.art');
    if (!b) return;
    bereich = b.dataset.bereich; art = ''; zeigen(1);
  });
  $('unterarten').addEventListener('click', function (ev) {
    var b = ev.target.closest('.art');
    if (!b) return;
    art = b.dataset.art; zeigen(1);
  });
  var warte;
  suche.addEventListener('input', function () { clearTimeout(warte); warte = setTimeout(function () { zeigen(1); }, 150); });
  $('faecher').addEventListener('click', function (ev) {
    var b = ev.target.closest('.fach');
    if (!b) return;
    fach = fach === b.dataset.fach ? '' : b.dataset.fach;
    zeigen(1);
    if (fach) $('uebungen').scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
  sortSel.addEventListener('change', function () { zeigen(1); });
  $('zuruecksetzen').addEventListener('click', zuruecksetzen);
  $('leer-zuruecksetzen').addEventListener('click', zuruecksetzen);
  $('zufall').addEventListener('click', function (ev) {
    var u = H.zufall(alle);
    if (u) { ev.preventDefault(); location.href = 'spielen.html?id=' + u.id; }
  });
  // „/“ springt in die Suche
  document.addEventListener('keydown', function (ev) {
    if (ev.key === '/' && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) { ev.preventDefault(); suche.focus(); }
  });
  window.addEventListener('popstate', function () { zeigen(lesen()); });

  zeigen(lesen());
  $('liste-bereich').removeAttribute('data-laedt');
});
