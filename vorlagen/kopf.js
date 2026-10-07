/* Läuft blockierend im <head>, vor dem ersten Zeichnen (ausgelagert für die Content-Security-Policy):
   - Klasse „js“: CSS weiß, dass die Seite gleich per JavaScript gefüllt wird
   - Einbettung in archivierte Artikel (spielen.html?einbettung=1): nur die Übung zeigen */
document.documentElement.classList.add('js');
if (new URLSearchParams(location.search).get('einbettung')) document.documentElement.classList.add('einbettung');
