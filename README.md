# Übungsheft

Rund 2.500 interaktive H5P-Übungen aus dem ehemaligen Landesbildungsserver Baden-Württemberg (schule-bw.de) –
gesammelt, nach Fächern geordnet und als schnelle, barrierearme Lernseite bereitgestellt. Die Übungen laufen direkt
im Browser, ohne Anmeldung und ohne Datenbank. Lehrkräfte können jede Übung als `.h5p`-Datei für Moodle, ILIAS oder
Lumi herunterladen.

Dieses Repository enthält **nur das Werkzeug**: den Sammler, der die Übungen holt, und die Vorlagen für die Seite.
Die Übungen selbst sind nicht enthalten – siehe [Rechte](#rechte).

## Schnellstart

Voraussetzung: Podman oder Docker mit Compose, rund 16 GB freier Speicher.

```sh
git clone https://github.com/schlosserleo/uebungsheft.git
cd uebungsheft
podman compose up -d          # oder: docker compose up -d
podman compose logs -f sammler
```

Die Seite ist sofort unter <http://localhost:8080> erreichbar und füllt sich, während der Sammler arbeitet
(etwa eine Stunde, eine Anfrage pro Sekunde). HTTPS und ggf. ein Login gehören davor, z. B. ein vorhandener
Reverse-Proxy (Beispiel in [docs/BETRIEB.md](docs/BETRIEB.md)).

## Woher die Übungen kommen

Der Sammler kennt drei Quellen (Umgebungsvariable `UEBUNGSHEFT_QUELLE` oder `--quelle`):

| Quelle | Beispiel | Wann |
|---|---|---|
| Originalserver | `original` (Standard) | solange `h5p.schule-bw.de` noch erreichbar ist |
| andere Übungsheft-Instanz | `https://uebungen.example.org` (+ `UEBUNGSHEFT_BENUTZER`, `UEBUNGSHEFT_PASSWORT`) | wenn der Originalserver weg ist |
| Ordner mit `.h5p`-Dateien | `/mnt/usb/uebungsheft/bestand` | z. B. Kopie auf einer Festplatte, ohne Netz |

Jede laufende Instanz kann Quelle für die nächste sein. Ein erneuter Lauf setzt fort und holt nur, was fehlt.

```sh
UEBUNGSHEFT_QUELLE=https://uebungen.example.org UEBUNGSHEFT_BENUTZER=… UEBUNGSHEFT_PASSWORT=… podman compose up -d
```

## Ohne Container

Python ≥ 3.10, nur Standardbibliothek:

```sh
python3 uebungsheft.py alles                       # holt nach ./bestand und baut ./bestand/seite
python3 uebungsheft.py --bestand /srv/uebungsheft alles --quelle /mnt/usb/bestand
python3 uebungsheft.py seite                       # nur die Seite neu bauen (z. B. nach Änderung der Konfiguration)
```

Ausgeliefert wird nur `bestand/seite/` – mit jedem Webserver. Wichtig sind die Sicherheits- und Cache-Header aus
[`container/sws.toml`](container/sws.toml); eine nginx-Variante steht in [docs/BETRIEB.md](docs/BETRIEB.md).

## Anpassen

- `konfig/seite.json`: Name der Seite, Text der Fußzeile, Rechtehinweis und Links in der Fußzeile.
- `konfig/seiten/`: eigene Seiten, die mit ausgeliefert werden. Vorlagen für **Impressum, Datenschutzerklärung und
  Erklärung zur Barrierefreiheit** liegen in `konfig/seiten.beispiel/` – kopieren, ausfüllen, in `seite.json`
  verlinken. Öffentliche Stellen (z. B. Schulen) brauchen diese Seiten in der Regel.
- Danach `podman compose run --rm sammler seite` (oder `python3 uebungsheft.py seite`).

## Was die Seite kann

- Übungen nach **Fach** (Inhaltsverzeichnis) und **Übungsart** filtern, Volltextsuche über Titel und Aufgabentext,
  Zufallsübung, Vor/Zurück, verwandte Übungen.
- **Barrierefreiheit:** geprüft nach WCAG 2.2 AA (axe, Lighthouse, Tastatur, Zoom 400 %, Textabstände, Kontraste
  hell/dunkel, reduzierte Bewegung). Einschränkungen gibt es innerhalb einzelner H5P-Übungsarten.
- **Datenschutz:** keine Cookies, nichts im Browserspeicher, kein Tracking; Schriften und Formeldarstellung kommen
  vom eigenen Server. Videos von YouTube und eingebettete fremde Seiten (wenige Übungen) werden erst nach
  ausdrücklicher Zustimmung geladen. Strenge Content-Security-Policy.
- **Einbettung:** `spielen.html?id=<ID>&einbettung=1` zeigt nur die Übung (z. B. für ein iframe in Moodle).

## Fächer

Der Originalserver kannte keine Fächer. `katalog/faecher.json` ordnet jede Übung einem Fach zu: wo möglich nach der
Fachseite auf schule-bw.de, in die sie eingebettet war (`"quelle": "fachseite"`), sonst nach ihrem Inhalt
(`"quelle": "inhalt"`). Verbesserungen sind willkommen.

## Rechte

Die Rechte an den Übungen liegen beim Land Baden-Württemberg bzw. bei ihren Autor:innen. Nur ein kleiner Teil steht
unter einer freien Lizenz; die meisten haben **keine Lizenzangabe**. Wer eine Instanz betreibt, ist selbst dafür
verantwortlich, ob und in welchem Rahmen er die Übungen bereitstellen darf (z. B. nur intern, nur nach Rückfrage
beim Land, nur frei lizenzierte Übungen). Die Spalte „Lizenz der Übung“ in `h5p.csv` hilft bei der Auswahl.
Diese Software ist kein Angebot des Landes Baden-Württemberg.

## Lizenzen

Der Code dieses Repositorys steht unter der [MIT-Lizenz](LICENSE). Mitgelieferte Fremdsoftware: siehe
[NOTICE.md](NOTICE.md) (h5p-standalone – MIT, MathJax – Apache 2.0, Schriften – SIL OFL 1.1).
