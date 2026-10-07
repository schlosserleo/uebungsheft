# Betrieb

## Speicher und Laufzeit

| | Größe |
|---|---|
| Original-Exporte (`seite/dateien/*.h5p`) | ~9 GB |
| entpackt für den Player (`seite/player/`) | ~6 GB |
| Rohdaten (`rohdaten/`) | ~0,2 GB |

Mit `--quelle original` dauert ein vollständiger Lauf etwa eine Stunde (eine Anfrage pro Sekunde, rund 3.700 IDs),
mit einem lokalen Ordner auf derselben Platte rund zwei Minuten (Hardlinks, kaum zusätzlicher Speicher).
Der Sammler bricht ab, wenn weniger als 5 GB frei sind (`--min-frei`).

## Abläufe

```sh
podman compose up -d                          # erster Start: Sammler holt alles, Webserver liefert aus
podman compose logs -f sammler                # Fortschritt
podman compose run --rm sammler alles         # später: Neues holen (nur fehlende Übungen) und Seite bauen
podman compose run --rm sammler seite         # nur Seite neu bauen (nach Änderung von konfig/)
git pull && podman compose build && podman compose run --rm sammler seite   # Software aktualisieren
```

Fehlgeschlagene Übungen erneut versuchen: `podman compose run --rm sammler alles --fehler-wiederholen`.

Nach 20 Fehlern in Folge hält der Sammler an – meist ist dann der Originalserver nicht mehr erreichbar. Dann eine
andere Quelle wählen (siehe README).

## Sicherung

Alles Nötige liegt im Volume `bestand` (bzw. dem Ordner `--bestand`). Es reicht, `bestand/seite/dateien/` zu sichern:
daraus baut `--quelle <ordner>` den kompletten Bestand in Minuten wieder auf.

## Reverse-Proxy mit Login (Beispiel Caddy)

```caddy
uebungen.example.org {
  basic_auth {
    lehrkraft <Hash aus: caddy hash-password>
  }
  reverse_proxy localhost:8080
}
```

## Andere Webserver (Beispiel nginx)

Ausgeliefert wird nur `bestand/seite/`. Die Header sind wichtig: die Content-Security-Policy erlaubt genau das, was
der H5P-Player braucht (der Hash gehört zu dem festen Einzeiler, den der Player in seinen Rahmen schreibt).

```nginx
server {
  root /srv/uebungsheft/bestand/seite;
  index index.html;
  add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-eval' 'sha256-8CniZYrnO46q7MvZ3m08Wom1HH/ZhyXmm29kBKTV1rk=' https://www.youtube.com https://s.ytimg.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://i.ytimg.com; font-src 'self' data:; media-src 'self' blob:; frame-src 'self' https:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'" always;
  add_header X-Content-Type-Options nosniff always;
  add_header Referrer-Policy strict-origin-when-cross-origin always;
  add_header Permissions-Policy "geolocation=(), microphone=(self), camera=()" always;
  location ~ (\.html|/uebungen\.js|/h5p\.csv)$ { add_header Cache-Control no-cache always; }
}
```

Hinweis zu `add_header` in nginx: In einem `location`-Block ersetzt es die Header des Servers – dort ggf. alle
Header wiederholen.

## Einbettung in Moodle & Co.

```html
<iframe src="https://uebungen.example.org/spielen.html?id=1483&einbettung=1" title="Übung" width="100%" height="600"></iframe>
```

Liegt die Übungsseite auf derselben Domain wie die einbettende Seite, passt sich die Höhe automatisch an.
Für andere Domains `frame-ancestors` in der Content-Security-Policy ergänzen.
