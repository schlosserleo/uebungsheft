#!/usr/bin/env python3
"""Übungsheft – H5P-Übungen des ehemaligen Landesbildungsservers Baden-Württemberg sammeln und als Webseite bereitstellen.

    python3 uebungsheft.py alles                      # holen + seite (Standardquelle: Originalserver)
    python3 uebungsheft.py holen --quelle original    # direkt von h5p.schule-bw.de (solange er erreichbar ist)
    python3 uebungsheft.py holen --quelle https://andere-instanz.example --benutzer … --passwort …
    python3 uebungsheft.py holen --quelle /pfad/zu/ordner/mit/h5p-dateien
    python3 uebungsheft.py seite                      # nur die Webseite neu bauen

Alles landet im Bestandsordner (--bestand, Standard ./bestand):
    seite/                  Webseite – nur dieser Ordner wird ausgeliefert
      dateien/<id>-<slug>.h5p   Original-Exporte (importierbar in Moodle, ILIAS, Lumi …)
      player/                   h5p-standalone, Bibliotheken (je Version einmal), entpackte Übungen, MathJax
    rohdaten/<id>/meta.json     Titel, Inhaltstyp, Metadaten, Herkunft, Prüfsumme
    status.jsonl                Fortschritt; ein erneuter Lauf macht dort weiter

Nur Python-Standardbibliothek (Python ≥ 3.10).
"""

import argparse
import base64
import csv
import datetime
import hashlib
import html
import json
import os
import re
import shutil
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parent
VORLAGEN = REPO / "vorlagen"
VENDOR = REPO / "vendor" / "h5p-standalone"
FAECHER_DATEI = REPO / "katalog" / "faecher.json"
KONFIG_STANDARD = REPO / "konfig" / "seite.json"

ORIGINAL = "https://h5p.schule-bw.de"
EMBED = ORIGINAL + "/wp/wp-admin/admin-ajax.php?action=h5p_embed&id={id}"
USER_AGENT = "uebungsheft/1.0 (+https://github.com/schlosserleo/uebungsheft)"


def log(msg):
    print(msg, flush=True)


def fmt_bytes(n):
    for einheit in ("B", "KB", "MB", "GB"):
        if n < 1024 or einheit == "GB":
            return f"{n:.1f} {einheit}" if einheit != "B" else f"{n} B"
        n /= 1024


# --------------------------------------------------------------------------- HTTP

class Abruf:
    """Höflicher HTTP-Abruf: fester Mindestabstand zwischen Anfragen, Wiederholungen, optional Basic-Auth."""

    def __init__(self, abstand=1.0, benutzer=None, passwort=None):
        self.abstand = abstand
        self.naechste = 0.0
        self.kopf = {"User-Agent": USER_AGENT}
        if benutzer:
            token = base64.b64encode(f"{benutzer}:{passwort or ''}".encode()).decode()
            self.kopf["Authorization"] = "Basic " + token

    def get(self, url, versuche=5, timeout=300):
        """Gibt (status, body) zurück; 403/404/410 ohne Wiederholung."""
        fehler = None
        for versuch in range(versuche):
            warten = self.naechste - time.monotonic()
            if warten > 0:
                time.sleep(warten)
            self.naechste = time.monotonic() + self.abstand
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers=self.kopf), timeout=timeout) as r:
                    return r.status, r.read()
            except urllib.error.HTTPError as e:
                if e.code in (401, 403, 404, 410):
                    return e.code, b""
                fehler = f"HTTP {e.code}"
            except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
                fehler = str(e)
            pause = 10 * (versuch + 1)
            log(f"  {fehler} – neuer Versuch in {pause}s")
            time.sleep(pause)
        raise RuntimeError(f"{url}: {fehler}")


# --------------------------------------------------------------------------- Bestand

class Bestand:
    def __init__(self, pfad):
        self.pfad = Path(pfad).resolve()
        self.seite = self.pfad / "seite"
        self.dateien = self.seite / "dateien"
        self.libs = self.seite / "player" / "libs"
        self.inhalte = self.seite / "player" / "inhalte"
        self.rohdaten = self.pfad / "rohdaten"
        self.status_datei = self.pfad / "status.jsonl"
        for p in (self.dateien, self.libs, self.inhalte, self.rohdaten):
            p.mkdir(parents=True, exist_ok=True)

    def status(self):
        erledigt = {}
        if self.status_datei.exists():
            with self.status_datei.open(encoding="utf-8") as fh:
                for zeile in fh:
                    try:
                        s = json.loads(zeile)
                    except json.JSONDecodeError:
                        continue
                    erledigt[s["id"]] = s
        return erledigt

    def metas(self):
        for datei in sorted(self.rohdaten.glob("*/meta.json"), key=lambda p: int(p.parent.name)):
            yield json.loads(datei.read_text(encoding="utf-8"))


def schreibe(pfad, daten):
    """Atomar schreiben (neue Datei + umbenennen) – bricht auch Hardlinks sauber auf."""
    tmp = pfad.with_name(pfad.name + ".part")
    tmp.write_bytes(daten)
    tmp.replace(pfad)


def verlinke(quelle, ziel):
    """Hardlink, wenn möglich (gleiche Platte: kein zusätzlicher Speicher), sonst Kopie ohne Metadaten.
    copyfile statt copy2: copy2 nimmt das SELinux-Label der Quelle mit, dann darf ein Container nicht lesen."""
    ziel.parent.mkdir(parents=True, exist_ok=True)
    if ziel.exists():
        ziel.unlink()
    try:
        os.link(quelle, ziel)
    except OSError:
        shutil.copyfile(quelle, ziel)


def kopiere_baum(quelle, ziel, verlinken=False, vorhandene_lassen=False):
    """Kopiert (oder verlinkt) alle Dateien; gibt die Zielpfade zurück."""
    ziele = set()
    for datei in quelle.rglob("*"):
        if datei.is_file():
            neu = ziel / datei.relative_to(quelle)
            ziele.add(neu)
            if vorhandene_lassen and neu.exists():
                continue
            if verlinken:
                verlinke(datei, neu)
            elif not neu.exists() or neu.stat().st_size != datei.stat().st_size:
                neu.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(datei, neu)
    return ziele


def entferne_uebrige(ordner, behalten):
    """Dateien in `ordner` löschen, die nicht in `behalten` sind (z. B. eine entfernte Schrift), leere Ordner danach."""
    for datei in sorted(ordner.rglob("*"), reverse=True):
        if datei.is_file() and datei not in behalten:
            datei.unlink()
            log(f"  veraltet, entfernt: {datei.relative_to(ordner.parent)}")
        elif datei.is_dir() and not any(datei.iterdir()):
            datei.rmdir()


def sicherer_name(name):
    """Zip-Eintrag nur zulassen, wenn er relativ ist und nicht aus dem Ziel herausführt."""
    teile = Path(name).parts
    return bool(teile) and not Path(name).is_absolute() and ".." not in teile and "\\" not in name


def slug(text, cid):
    """Dateiname aus Export-Namen wie "tarifvertrage-1483" oder "1483-tarifvertrage" (ID vorne/hinten entfernt)."""
    s = re.sub(r"[^a-z0-9-]+", "-", text.lower()).strip("-")
    s = s.removeprefix(f"{cid}-").removesuffix(f"-{cid}")[:80].strip("-")
    return s or "uebung"


# --------------------------------------------------------------------------- .h5p lesen und entpacken

def lies_h5p(datei):
    """h5p.json und content/content.json aus einer .h5p-Datei."""
    with zipfile.ZipFile(datei) as z:
        if z.testzip() is not None or "h5p.json" not in z.namelist():
            raise RuntimeError(f"{datei.name}: keine gültige .h5p-Datei")
        h5p_json = json.loads(z.read("h5p.json").decode("utf-8-sig"))
        inhalt = z.read("content/content.json").decode("utf-8-sig") if "content/content.json" in z.namelist() else "{}"
    return h5p_json, inhalt


def patch_version(lib_json_bytes):
    try:
        return int(json.loads(lib_json_bytes.decode("utf-8-sig")).get("patchVersion", 0))
    except (ValueError, AttributeError):
        return -1


def entpacke(bestand, h5p_datei, cid):
    """Inhalt nach player/inhalte/<id>/, Bibliotheken nur einmal (neuere Patch-Version gewinnt)."""
    neue_libs = 0
    with zipfile.ZipFile(h5p_datei) as z:
        eintraege = [i for i in z.infolist() if not i.is_dir() and sicherer_name(i.filename)]
        # Symlinks (Unix-Modus 0o120000) nicht übernehmen
        eintraege = [i for i in eintraege if (i.external_attr >> 16) & 0o170000 != 0o120000]
        libs = {i.filename.split("/")[0] for i in eintraege if "/" in i.filename} - {"content"}
        ziel = bestand.inhalte / str(cid)
        if ziel.exists():
            shutil.rmtree(ziel)
        for i in eintraege:
            if i.filename == "h5p.json" or i.filename.startswith("content/"):
                pfad = ziel / i.filename
                pfad.parent.mkdir(parents=True, exist_ok=True)
                pfad.write_bytes(z.read(i))
        for lib in sorted(libs):
            if not re.fullmatch(r"[A-Za-z0-9._-]+-\d+\.\d+", lib):
                continue
            neu = patch_version(z.read(f"{lib}/library.json")) if f"{lib}/library.json" in z.namelist() else -1
            vorhanden = bestand.libs / lib / "library.json"
            if vorhanden.exists() and patch_version(vorhanden.read_bytes()) >= neu:
                continue
            if (bestand.libs / lib).exists():
                shutil.rmtree(bestand.libs / lib)
            for i in eintraege:
                if i.filename.startswith(lib + "/"):
                    pfad = bestand.libs / i.filename
                    pfad.parent.mkdir(parents=True, exist_ok=True)
                    pfad.write_bytes(z.read(i))
            neue_libs += 1
    return neue_libs


# --------------------------------------------------------------------------- extern verlinkte Videos

NICHT_LADBAR = ("youtube.com", "youtu.be", "vimeo.com")


def externe_medien(knoten):
    """Alle {"path": "http…", "mime": "video/…|audio/…"} im Übungsinhalt (rekursiv)."""
    if isinstance(knoten, dict):
        pfad, mime = knoten.get("path"), knoten.get("mime") or ""
        if isinstance(pfad, str) and re.match(r"https?://", pfad) and mime.startswith(("video/", "audio/")):
            yield knoten
        for v in knoten.values():
            yield from externe_medien(v)
    elif isinstance(knoten, list):
        for v in knoten:
            yield from externe_medien(v)


def medien_name(url):
    pfad = Path(urllib.parse.urlsplit(url).path).name
    return hashlib.sha256(url.encode()).hexdigest()[:12] + "-" + re.sub(r"[^\w.-]", "_", pfad)[-60:]


def lokalisiere_medien(bestand, cid, kandidaten):
    """Extern verlinkte Videos/Audios sichern und in die entpackte Kopie einhängen.

    `kandidaten(url, name)` liefert mögliche Quellen in Reihenfolge, je (art, wert) mit art "datei" oder "url".
    Nur die entpackte content.json wird umgeschrieben, der Original-Export bleibt unverändert.
    """
    cj = bestand.inhalte / str(cid) / "content" / "content.json"
    if not cj.exists():
        return []
    inhalt = json.loads(cj.read_text(encoding="utf-8-sig"))
    ergebnis = []
    for m in externe_medien(inhalt):
        url = m["path"]
        eintrag = {"url": url}
        if (urllib.parse.urlsplit(url).hostname or "").endswith(NICHT_LADBAR):
            eintrag["status"] = "nicht ladbar (Streamingdienst)"
            ergebnis.append(eintrag)
            continue
        name = medien_name(url)
        gesichert = bestand.rohdaten / str(cid) / "extern" / name
        if not gesichert.exists():
            for art, wert in kandidaten(url, name):
                if art == "datei" and wert.is_file():
                    verlinke(wert, gesichert)
                    break
                if art == "url":
                    try:
                        status, daten = wert[0].get(wert[1], versuche=3, timeout=900)
                    except RuntimeError:
                        continue
                    if status == 200 and daten:
                        gesichert.parent.mkdir(parents=True, exist_ok=True)
                        schreibe(gesichert, daten)
                        break
        if not gesichert.exists():
            eintrag["status"] = "nicht erreichbar"
            ergebnis.append(eintrag)
            continue
        verlinke(gesichert, cj.parent / "extern" / name)
        m["path"] = f"extern/{name}"
        eintrag.update(status="gesichert", datei=f"extern/{name}", bytes=gesichert.stat().st_size)
        ergebnis.append(eintrag)
    if any(e["status"] == "gesichert" for e in ergebnis):
        schreibe(cj, json.dumps(inhalt, ensure_ascii=False).encode("utf-8"))
    return ergebnis


# --------------------------------------------------------------------------- eine Übung aufnehmen

def aufnehmen(bestand, cid, h5p_quelle, name, herkunft, kandidaten, uebernahme="verschieben", embed=None,
              zusatz=None, entpackt=None):
    """Eine .h5p-Datei in den Bestand übernehmen: ablegen, entpacken, Metadaten schreiben.

    uebernahme: "verschieben" (Zwischendatei) oder "verlinken" (fremder Ordner: Hardlink, sonst Kopie).
    entpackt: Ordner mit bereits entpackter Übung (h5p.json + content/) der Quelle – wird verlinkt statt neu entpackt.
    """
    h5p_json, inhalt = lies_h5p(h5p_quelle)
    titel = html.unescape(h5p_json.get("title") or "") or f"Übung {cid}"
    for alt in bestand.dateien.glob(f"{cid}-*.h5p"):
        alt.unlink()
    ziel = bestand.dateien / f"{cid}-{slug(name or titel, cid)}.h5p"
    if uebernahme == "verlinken":
        verlinke(h5p_quelle, ziel)
    else:
        os.replace(h5p_quelle, ziel)
    daten = ziel.read_bytes()
    if entpackt:
        if (bestand.inhalte / str(cid)).exists():
            shutil.rmtree(bestand.inhalte / str(cid))
        kopiere_baum(entpackt, bestand.inhalte / str(cid), verlinken=True)
        neue_libs = 0
    else:
        neue_libs = entpacke(bestand, ziel, cid)
    haupt = next((d for d in h5p_json.get("preloadedDependencies", []) if d.get("machineName") == h5p_json.get("mainLibrary")), {})
    md = {k: h5p_json[k] for k in ("license", "licenseVersion", "authors", "source", "yearFrom", "yearTo") if h5p_json.get(k)}
    meta = {
        "id": cid,
        "title": titel,
        "library": f"{h5p_json.get('mainLibrary', '')} {haupt.get('majorVersion', '')}.{haupt.get('minorVersion', '')}".strip(" ."),
        "language": h5p_json.get("language"),
        "metadata": md,
        "jsonContent": inhalt,
        "h5p": ziel.relative_to(bestand.seite).as_posix(),
        "bytes": len(daten),
        "sha256": hashlib.sha256(daten).hexdigest(),
        "herkunft": herkunft,
        "abgerufen": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
    }
    meta.update(zusatz or {})
    roh = bestand.rohdaten / str(cid)
    roh.mkdir(parents=True, exist_ok=True)
    if embed is not None:
        schreibe(roh / "embed.html", embed)
    # neu ermittelte externe Medien mit denen aus der Quelle zusammenführen (je URL gilt die neuere Angabe)
    extern = {e["url"]: e for e in meta.get("externeMedien") or []}
    extern.update({e["url"]: e for e in lokalisiere_medien(bestand, cid, kandidaten)})
    meta["externeMedien"] = list(extern.values())
    schreibe(roh / "meta.json", json.dumps(meta, ensure_ascii=False, indent=1).encode("utf-8"))
    return {"id": cid, "ok": True, "titel": titel, "library": meta["library"], "h5p": meta["h5p"],
            "bytes": len(daten), "neueLibs": neue_libs, "quelle": herkunft.get("art")}


# --------------------------------------------------------------------------- Quelle: Originalserver

def h5p_integration(body):
    """Liest das Objekt `H5PIntegration = {...};` aus der Einbettungsseite."""
    text = body.decode("utf-8", "replace")
    m = re.search(r"H5PIntegration\s*=\s*", text)
    if not m:
        return None
    obj, _ = json.JSONDecoder().raw_decode(text, m.end())
    return obj


def medien_pfade(knoten):
    if isinstance(knoten, dict):
        pfad = knoten.get("path")
        if isinstance(pfad, str) and not re.match(r"[a-z]+:", pfad):
            yield pfad.removesuffix("#tmp")
        for v in knoten.values():
            yield from medien_pfade(v)
    elif isinstance(knoten, list):
        for v in knoten:
            yield from medien_pfade(v)


def selbst_bauen(abruf, cid, inhalt, ziel):
    """Fehlt der Export auf dem Server: .h5p aus dem Übungsinhalt und den einzeln geladenen Medien bauen."""
    md = inhalt.get("metadata") or {}
    maschine, _, version = (inhalt.get("library") or "").partition(" ")
    major, _, minor = version.partition(".")
    h5p_json = {"title": html.unescape(inhalt.get("title") or ""), "language": "und", "mainLibrary": maschine,
                "embedTypes": ["iframe"], "license": md.get("license") or "U",
                "preloadedDependencies": [{"machineName": maschine, "majorVersion": int(major or 0), "minorVersion": int(minor or 0)}]}
    for k in ("authors", "source", "licenseVersion", "yearFrom", "yearTo"):
        if md.get(k):
            h5p_json[k] = md[k]
    fehlend = []
    tmp = ziel.with_name(ziel.name + ".part")
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("h5p.json", json.dumps(h5p_json, ensure_ascii=False))
        z.writestr("content/content.json", inhalt.get("jsonContent") or "{}")
        for pfad in sorted(set(medien_pfade(json.loads(inhalt.get("jsonContent") or "{}")))):
            if not sicherer_name(pfad):
                continue
            status, daten = abruf.get(f"{ORIGINAL}/wp/wp-content/uploads/h5p/content/{cid}/{urllib.parse.quote(pfad)}", versuche=4)
            if status == 200:
                z.writestr(f"content/{pfad}", daten)
            else:
                fehlend.append(pfad)
    tmp.replace(ziel)
    return fehlend


def hole_original(bestand, cid, abruf):
    status, body = abruf.get(EMBED.format(id=cid))
    integ = h5p_integration(body) if status == 200 else None
    inhalt = (integ or {}).get("contents", {}).get(f"cid-{cid}")
    if not inhalt:
        return {"id": cid, "ok": True, "leer": True}
    export_url = inhalt.get("exportUrl") or ""
    s = slug(Path(export_url).stem or inhalt.get("title") or "", cid)
    tmp = bestand.pfad / f".laden-{cid}.h5p"
    zusatz = {"embedUrl": EMBED.format(id=cid)}
    status, daten = (abruf.get(urllib.parse.urljoin(ORIGINAL, export_url), timeout=900) if export_url else (None, b""))
    if status == 200 and daten[:2] == b"PK":
        schreibe(tmp, daten)
    else:
        log(f"  {cid}: kein Export auf dem Server (HTTP {status}) – baue .h5p aus Einzelteilen")
        zusatz.update(selbstgebaut=True, fehlendeMedien=selbst_bauen(abruf, cid, inhalt, tmp))
    try:
        return aufnehmen(bestand, cid, tmp, s, {"art": "original"}, lambda url, name: [("url", (abruf, url))],
                         embed=body, zusatz=zusatz)
    finally:
        tmp.unlink(missing_ok=True)


# --------------------------------------------------------------------------- Quelle: andere Übungsheft-Instanz

def liste_instanz(basis, abruf):
    status, body = abruf.get(urllib.parse.urljoin(basis, "uebungen.js"))
    if status != 200:
        sys.exit(f"{basis}: uebungen.js nicht abrufbar (HTTP {status}{', Zugangsdaten?' if status == 401 else ''})")
    text = body.decode("utf-8")
    return json.loads(text[text.index("{"):text.rindex("}") + 1])["uebungen"]


def hole_instanz(bestand, eintrag, basis, abruf):
    cid = eintrag["id"]
    if not eintrag.get("h5p"):
        return {"id": cid, "ok": False, "fehler": "ohne .h5p-Datei in der Quelle"}
    status, daten = abruf.get(urllib.parse.urljoin(basis, urllib.parse.quote(eintrag["h5p"])), timeout=900)
    if status != 200 or daten[:2] != b"PK":
        return {"id": cid, "ok": False, "fehler": f"HTTP {status}"}
    tmp = bestand.pfad / f".laden-{cid}.h5p"
    schreibe(tmp, daten)

    def kandidaten(url, name):
        # die Quelle hat externe Videos meist schon gesichert; sonst beim ursprünglichen Anbieter versuchen
        return [("url", (abruf, urllib.parse.urljoin(basis, f"player/inhalte/{cid}/content/extern/{name}"))),
                ("url", (Abruf(1.0), url))]
    try:
        zusatz = {k: eintrag[k] for k in ("selbstgebaut", "wayback") if eintrag.get(k)}
        return aufnehmen(bestand, cid, tmp, Path(eintrag["h5p"]).stem, {"art": "instanz", "url": basis}, kandidaten,
                         zusatz=zusatz)
    finally:
        tmp.unlink(missing_ok=True)


# --------------------------------------------------------------------------- Quelle: lokaler Ordner

def liste_ordner(ordner):
    """Alle <id>-<slug>.h5p in einem Ordner (rekursiv), z. B. seite/dateien/ einer anderen Instanz oder eine USB-Platte."""
    gefunden = {}
    for datei in ordner.rglob("*.h5p"):
        m = re.match(r"(\d+)-", datei.name)
        if m and not datei.name.endswith(".part"):
            gefunden.setdefault(int(m.group(1)), datei)
    return [{"id": i, "datei": gefunden[i]} for i in sorted(gefunden)]


def hole_ordner(bestand, eintrag, ordner):
    cid, datei = eintrag["id"], eintrag["datei"]
    # Wurzel der Quelle (dort liegen player/… und ggf. extern gesicherte Videos)
    wurzeln = [p for p in (ordner, ordner / "seite", datei.parent, datei.parent.parent) if (p / "player").is_dir()]

    def kandidaten(url, name):
        k = [("datei", w / "player" / "inhalte" / str(cid) / "content" / "extern" / name) for w in wurzeln]
        return k + [("url", (Abruf(1.0), url))]
    # Metadaten der Quelle (Übungsheft-Bestand: rohdaten/<id>/, älteres Archiv: <id>-<slug>/meta.json)
    zusatz = {}
    for basis in [ordner, ordner.parent] + wurzeln:
        treffer = list((basis / "rohdaten" / str(cid)).glob("meta.json")) + list(basis.glob(f"{cid}-*/meta.json"))
        if treffer:
            alt = json.loads(treffer[0].read_text(encoding="utf-8"))
            zusatz = {k: alt[k] for k in ("selbstgebaut", "wayback", "embedUrl", "externeMedien") if alt.get(k)}
            break
    # schon entpackt (und externe Videos eingehängt)? Dann verlinken statt neu entpacken
    entpackt = next((w / "player" / "inhalte" / str(cid) for w in wurzeln
                     if (w / "player" / "inhalte" / str(cid) / "h5p.json").exists()), None)
    return aufnehmen(bestand, cid, datei, datei.stem, {"art": "ordner", "pfad": str(ordner)}, kandidaten,
                     uebernahme="verlinken", zusatz=zusatz, entpackt=entpackt)


# --------------------------------------------------------------------------- holen

def cmd_holen(args, zwischendurch=None):
    bestand = Bestand(args.bestand)
    erledigt = bestand.status()
    neu = leer = fehler = folge = bytes_ = 0
    t0 = time.monotonic()
    quelle = args.quelle

    def melden(s, fh):
        nonlocal neu, leer, fehler, folge, bytes_
        erledigt[s["id"]] = s
        fh.write(json.dumps(s, ensure_ascii=False) + "\n")
        fh.flush()
        if not s["ok"]:
            fehler += 1
            folge += 1
            log(f"  FEHLER {s['id']}: {s['fehler']}")
        elif s.get("leer"):
            leer += 1
            folge = 0
        else:
            neu += 1
            folge = 0
            bytes_ += s["bytes"]
            log(f"{s['id']}: {s['library']} – {s['titel']} ({fmt_bytes(s['bytes'])})")
            if zwischendurch and neu % 250 == 0:
                zwischendurch()  # Seite zwischendurch neu bauen, damit man beim Aufbau zusehen kann
        if (neu + leer + fehler) % 100 == 0:
            log(f"[{neu + leer + fehler}] neu {neu}, leer {leer}, Fehler {fehler}, {fmt_bytes(bytes_)}, "
                f"{(neu + leer + fehler) / (time.monotonic() - t0) * 60:.0f}/min, frei {fmt_bytes(shutil.disk_usage(bestand.pfad).free)}")

    def offen(cid):
        s = erledigt.get(cid)
        return s is None or (not s["ok"] and args.fehler_wiederholen)

    def genug():
        return args.limit is not None and neu >= args.limit

    def platz_ok():
        frei = shutil.disk_usage(bestand.pfad).free
        if frei < args.min_frei * 1e9:
            log(f"Abbruch: nur noch {fmt_bytes(frei)} frei (Grenze --min-frei {args.min_frei} GB)")
            return False
        return True

    with bestand.status_datei.open("a", encoding="utf-8") as fh:
        if quelle == "original":
            abruf = Abruf(args.abstand)
            hoechste = max((i for i, s in erledigt.items() if s["ok"] and not s.get("leer")), default=0)
            log(f"Quelle: {ORIGINAL} (bis {args.luecke} IDs nach der höchsten gefundenen), Abstand {args.abstand}s")
            cid = 1
            while cid <= (args.bis or hoechste + args.luecke):
                if genug():
                    break
                if offen(cid):
                    if not platz_ok():
                        break
                    try:
                        s = hole_original(bestand, cid, abruf)
                    except Exception as err:
                        s = {"id": cid, "ok": False, "fehler": str(err)[:300]}
                    melden(s, fh)
                    if folge >= 20:
                        log("Abbruch: 20 Fehler in Folge – ist der Originalserver noch erreichbar? "
                            "Andere Quelle: --quelle https://<instanz> oder --quelle /pfad/zum/ordner")
                        break
                s = erledigt.get(cid)
                if s and s["ok"] and not s.get("leer"):
                    hoechste = max(hoechste, cid)
                cid += 1
        elif re.match(r"https?://", quelle):
            basis = quelle.rstrip("/") + "/"
            abruf = Abruf(args.abstand, args.benutzer or os.environ.get("UEBUNGSHEFT_BENUTZER"),
                          args.passwort or os.environ.get("UEBUNGSHEFT_PASSWORT"))
            liste = liste_instanz(basis, abruf)
            log(f"Quelle: Instanz {basis} mit {len(liste)} Übungen, Abstand {args.abstand}s")
            for e in liste:
                if genug():
                    break
                if offen(e["id"]):
                    if not platz_ok():
                        break
                    try:
                        s = hole_instanz(bestand, e, basis, abruf)
                    except Exception as err:
                        s = {"id": e["id"], "ok": False, "fehler": str(err)[:300]}
                    melden(s, fh)
        else:
            ordner = Path(quelle).resolve()
            if not ordner.is_dir():
                sys.exit(f"Quelle {quelle}: weder 'original', eine URL noch ein Ordner")
            liste = liste_ordner(ordner)
            log(f"Quelle: Ordner {ordner} mit {len(liste)} .h5p-Dateien")
            # Bibliotheken einer vorhandenen Player-Installation einmal verlinken (spart das Entpacken)
            for w in (ordner, ordner / "seite"):
                if (w / "player" / "libs").is_dir():
                    kopiere_baum(w / "player" / "libs", bestand.libs, verlinken=True, vorhandene_lassen=True)
                    break
            for e in liste:
                if genug():
                    break
                if offen(e["id"]):
                    try:
                        s = hole_ordner(bestand, e, ordner)
                    except Exception as err:
                        s = {"id": e["id"], "ok": False, "fehler": str(err)[:300]}
                    melden(s, fh)
    log(f"Holen beendet: neu {neu}, leer {leer}, Fehler {fehler}, {fmt_bytes(bytes_)}")


# --------------------------------------------------------------------------- Angaben für die Seite

TYP_NAMEN = {
    "H5P.QuestionSet": "Quiz (Fragenset)", "H5P.MultiChoice": "Multiple Choice", "H5P.Blanks": "Lückentext",
    "H5P.DragQuestion": "Drag & Drop", "H5P.DragText": "Wörter ziehen", "H5P.FindTheWords": "Wortgitter",
    "H5P.MemoryGame": "Memory", "H5P.ImageHotspots": "Bild-Hotspots", "H5P.ImagePair": "Bildpaare",
    "H5P.ImageJuxtaposition": "Bildvergleich (Vorher/Nachher)", "H5P.InteractiveBook": "Interaktives Buch",
    "H5P.InteractiveVideo": "Interaktives Video", "H5P.Flashcards": "Lernkarten",
    "H5P.ImageSequencing": "Bilder ordnen", "H5P.Accordion": "Akkordeon", "H5P.AudioRecorder": "Audioaufnahme",
    "H5P.ImageMultipleHotspotQuestion": "Bild-Hotspot-Frage", "H5P.CoursePresentation": "Präsentation",
    "H5P.TrueFalse": "Richtig/Falsch", "H5P.MarkTheWords": "Wörter markieren", "H5P.Summary": "Zusammenfassung",
    "H5P.Dialogcards": "Dialogkarten", "H5P.Timeline": "Zeitstrahl", "H5P.SingleChoiceSet": "Single Choice",
    "H5P.Crossword": "Kreuzworträtsel", "H5P.Column": "Übungsblatt", "H5P.BranchingScenario": "Verzweigtes Szenario",
    "H5P.Essay": "Freitext", "H5P.ThreeImage": "Virtueller Rundgang", "H5P.GuessTheAnswer": "Rate die Antwort",
    "H5P.Chart": "Diagramm", "H5P.ImageHotspotQuestion": "Bild-Hotspot-Frage", "H5P.IFrameEmbed": "Eingebettete Seite",
    "H5P.SortParagraphs": "Absätze ordnen", "H5P.ArithmeticQuiz": "Rechenquiz", "H5P.Agamotto": "Bildfolge",
    "H5P.ImageSlider": "Bildergalerie", "H5P.Collage": "Collage", "H5P.Questionnaire": "Fragebogen",
    "H5P.SpeakTheWords": "Sprechübung", "H5P.SpeakTheWordsSet": "Sprechübungen", "H5P.Audio": "Audio",
    "H5P.Video": "Video", "H5P.AdvancedBlanks": "Lückentext", "H5P.AppearIn": "Videochat",
}

# Übungsart → Farbgruppe der Karten (Heftumschläge)
GRUPPEN = {
    "quiz": ("H5P.QuestionSet", "H5P.MultiChoice", "H5P.SingleChoiceSet", "H5P.TrueFalse", "H5P.Summary",
             "H5P.GuessTheAnswer", "H5P.ArithmeticQuiz", "H5P.Questionnaire", "H5P.Essay"),
    "text": ("H5P.Blanks", "H5P.AdvancedBlanks", "H5P.DragText", "H5P.MarkTheWords", "H5P.FindTheWords",
             "H5P.Crossword", "H5P.SortParagraphs", "H5P.SpeakTheWords", "H5P.SpeakTheWordsSet"),
    "ziehen": ("H5P.DragQuestion", "H5P.ImageSequencing", "H5P.ImagePair"),
    "karten": ("H5P.Flashcards", "H5P.Dialogcards", "H5P.MemoryGame"),
    "bild": ("H5P.ImageHotspots", "H5P.ImageMultipleHotspotQuestion", "H5P.ImageHotspotQuestion",
             "H5P.ImageJuxtaposition", "H5P.ImageSlider", "H5P.Collage", "H5P.Agamotto", "H5P.ThreeImage"),
    "video": ("H5P.InteractiveVideo", "H5P.Video", "H5P.Audio"),
    "buch": ("H5P.InteractiveBook", "H5P.CoursePresentation", "H5P.Column", "H5P.Accordion", "H5P.Timeline",
             "H5P.BranchingScenario", "H5P.Chart", "H5P.IFrameEmbed"),
}
GRUPPE_VON = {m: g for g, ms in GRUPPEN.items() for m in ms}


def bild_masse(daten):
    """(Breite, Höhe) aus dem Dateikopf von PNG, GIF oder JPEG, sonst None."""
    if daten[:8] == b"\x89PNG\r\n\x1a\n":
        return int.from_bytes(daten[16:20], "big"), int.from_bytes(daten[20:24], "big")
    if daten[:6] in (b"GIF87a", b"GIF89a"):
        return int.from_bytes(daten[6:8], "little"), int.from_bytes(daten[8:10], "little")
    if daten[:2] == b"\xff\xd8":
        i = 2
        while i + 9 < len(daten):
            if daten[i] != 0xFF:
                i += 1
                continue
            marker, laenge = daten[i + 1], int.from_bytes(daten[i + 2:i + 4], "big")
            if marker in (0xC0, 0xC1, 0xC2):
                return int.from_bytes(daten[i + 7:i + 9], "big"), int.from_bytes(daten[i + 5:i + 7], "big")
            i += 2 + laenge
    return None


def vorschaubild(bestand, cid, inhalt):
    """Erstes brauchbares Bild der Übung (mind. 160 px, höchstens 500 KB), Pfad relativ zu seite/."""
    def bilder(k):
        if isinstance(k, dict):
            p = k.get("path")
            if isinstance(p, str) and (k.get("mime") or "").startswith("image/") and not re.match(r"[a-z]+:", p):
                yield p.removesuffix("#tmp")
            for v in k.values():
                yield from bilder(v)
        elif isinstance(k, list):
            for v in k:
                yield from bilder(v)
    for pfad in bilder(inhalt):
        datei = bestand.inhalte / str(cid) / "content" / pfad
        if not sicherer_name(pfad) or not datei.is_file() or datei.stat().st_size > 500_000:
            continue
        if datei.suffix.lower() == ".svg":
            return datei.relative_to(bestand.seite).as_posix()
        with datei.open("rb") as fh:
            masse = bild_masse(fh.read(65536))
        if masse and min(masse) >= 160:
            return datei.relative_to(bestand.seite).as_posix()
    return None


def anrisstext(inhalt, titel):
    """Erste Aufgabenstellung bzw. Frage der Übung als kurzer Vorschautext."""
    warteschlange = [inhalt]
    while warteschlange:
        k = warteschlange.pop(0)
        if isinstance(k, dict):
            for schluessel in ("question", "taskDescription", "text", "introduction", "description"):
                v = k.get(schluessel)
                if isinstance(v, str):
                    t = re.sub(r"<[^>]+>", " ", v)
                    # die Einbettungsseiten des Originalservers fügen teils „Generated at <Zeitstempel>.“ ein
                    t = re.sub(r"\s+", " ", html.unescape(re.sub(r"Generated at \d+\.?", "", t))).strip()
                    if len(t) > 12 and t.lower() != (titel or "").lower():
                        return t if len(t) <= 160 else t[:157].rsplit(" ", 1)[0] + " …"
            warteschlange.extend(k.values())
        elif isinstance(k, list):
            warteschlange.extend(k)
    return ""


def fremde_seiten(inhalt, bibliothek):
    """Hosts fremder Webseiten, die eine Übung beim Abspielen in einen Rahmen lädt (Eingebettete Seite, appear.in)."""
    hosts = []

    def lauf(k, bib):
        if isinstance(k, dict):
            if bib == "H5P.IFrameEmbed" and isinstance(k.get("source"), str):
                m = re.match(r"https?://([^/#?]+)", k["source"])
                if m:
                    hosts.append(m.group(1))
            if bib == "H5P.AppearIn" and "appearRoom" in k:
                hosts.append("appear.in")
            for v in k.values():
                if isinstance(v, dict) and isinstance(v.get("library"), str):
                    lauf(v.get("params"), v["library"].split(" ")[0])
                else:
                    lauf(v, bib)
        elif isinstance(k, list):
            for v in k:
                lauf(v, bib)
    lauf(inhalt, bibliothek)
    return sorted(set(hosts))


LIZENZEN = {"U": "nicht angegeben", "CC0 1.0": "CC0", "PD": "gemeinfrei", "ODC PDDL": "ODC PDDL",
            "CC PDM": "Public Domain Mark", "C": "Urheberrecht vorbehalten"}


def lizenz_text(md):
    lic, version = (md or {}).get("license") or "U", (md or {}).get("licenseVersion") or ""
    if lic == "PD" and version:
        return LIZENZEN.get(version, version)
    text = LIZENZEN.get(lic, lic)
    return text + " " + version if version and lic not in ("U", "C") else text


def ordner_groesse(p):
    return sum(f.stat().st_size for f in p.rglob("*") if f.is_file()) if p.exists() else 0


def lade_faecher():
    """katalog/faecher.json: {"<id>": {"faecher": [...], "quelle": "fachseite"|"inhalt"}}"""
    try:
        return {int(k): v for k, v in json.loads(FAECHER_DATEI.read_text(encoding="utf-8")).items()}
    except (OSError, ValueError):
        return {}


# Bibliotheken, die von sich aus Dateien von fremden Servern laden: auf lokale Kopien umbiegen (nur im Player,
# die Original-Exporte bleiben unverändert). Pfade relativ zur Übungsseite; der Player-Rahmen erbt deren Basis-URL.
FREMDE_QUELLEN = {
    "H5P.MathDisplay-*/scripts/mathdisplay.js": [
        ("https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.5/MathJax.js", "player/mathjax/MathJax.js"),
    ],
    # H5P-Logo als Ladeanimation direkt von h5p.org: rein dekorativ, entfällt
    "H5P.ImageMultipleHotspotQuestion-*/image-multiple-hotspot-question.css": [
        ("url('http://h5p.org/sites/all/themes/professional_themec/images/h5p.svg')", "none"),
    ],
}


def lokale_bibliotheken(bestand):
    for muster, ersetzungen in FREMDE_QUELLEN.items():
        for datei in bestand.libs.glob(muster):
            text = datei.read_text(encoding="utf-8")
            neu = text
            for alt, lokal in ersetzungen:
                neu = neu.replace(alt, lokal)
            if neu != text:
                schreibe(datei, neu.encode("utf-8"))


# --------------------------------------------------------------------------- Seite bauen

def lade_konfig(pfad):
    konfig = json.loads(KONFIG_STANDARD.read_text(encoding="utf-8"))
    if pfad and Path(pfad).resolve() != KONFIG_STANDARD:
        konfig.update(json.loads(Path(pfad).read_text(encoding="utf-8")))
    return konfig


def bausteine(konfig, version):
    """Kopf- und Fußzeile, die alle Seiten teilen (Platzhalter {{kopf}} und {{fuss}} in den Vorlagen)."""
    e = html.escape
    kopf = (VORLAGEN / "_kopf.html").read_text(encoding="utf-8").replace("{{name}}", e(konfig["name"]))
    links = "".join(f'<li><a href="{e(l["href"])}">{e(l["text"])}</a></li>' for l in konfig.get("links", []))
    fuss = (VORLAGEN / "_fuss.html").read_text(encoding="utf-8").replace("{{fusszeile}}", e(konfig["fusszeile"])) \
        .replace("{{links}}", links)
    return {"{{kopf}}": kopf, "{{fuss}}": fuss, "{{name}}": e(konfig["name"]), "{{rechte}}": e(konfig["rechte"]),
            "{{version}}": version}


def cmd_seite(args):
    bestand = Bestand(args.bestand)
    konfig = lade_konfig(args.konfig)
    standalone = bestand.seite / "player" / "standalone"
    if not (VENDOR / "main.bundle.js").exists():
        sys.exit(f"Player fehlt: {VENDOR}/main.bundle.js")
    # mitgelieferte Teile: kopieren und alles entfernen, was in der aktuellen Version nicht mehr vorkommt
    for quelle, ziel in ((VENDOR, standalone), (VORLAGEN / "mathjax", bestand.seite / "player" / "mathjax"),
                         (VORLAGEN / "schriften", bestand.seite / "schriften")):
        entferne_uebrige(ziel, kopiere_baum(quelle, ziel))
    lokale_bibliotheken(bestand)

    faecher = lade_faecher()
    liste = []
    for meta in bestand.metas():
        cid = meta["id"]
        maschine = (meta.get("library") or "").split(" ")[0]
        try:
            inhalt = json.loads(meta.get("jsonContent") or "{}")
        except ValueError:
            inhalt = {}
        md = meta.get("metadata") or {}
        f = faecher.get(cid, {})
        liste.append({
            "id": cid, "titel": meta["title"], "typ": TYP_NAMEN.get(maschine, maschine.removeprefix("H5P.")),
            "gruppe": GRUPPE_VON.get(maschine, "sonst"), "bild": vorschaubild(bestand, cid, inhalt),
            "anriss": anrisstext(inhalt, meta["title"]),
            "autoren": [a.get("name") for a in md.get("authors") or [] if a.get("name")],
            "faecher": f.get("faecher", []), "fachQuelle": f.get("quelle", ""),
            "h5p": meta.get("h5p"), "bytes": meta.get("bytes"),
            "spielbar": (bestand.inhalte / str(cid) / "h5p.json").exists(),
            "wayback": meta.get("wayback"), "selbstgebaut": bool(meta.get("selbstgebaut")),
            "externeMedien": meta.get("externeMedien") or [], "fremdeSeiten": fremde_seiten(inhalt, maschine),
            # nur für h5p.csv:
            "_bibliothek": meta.get("library"), "_lizenz": lizenz_text(md), "_original": meta.get("embedUrl", ""),
            "_herkunft": (meta.get("herkunft") or {}).get("art", ""),
        })
    statistik = {
        "anzahl": len(liste),
        "exportBytes": sum(e["bytes"] or 0 for e in liste),
        "libsBytes": ordner_groesse(bestand.libs),
        "inhalteBytes": ordner_groesse(bestand.inhalte),
        "libsAnzahl": sum(1 for p in bestand.libs.iterdir() if p.is_dir()),
        "erzeugt": datetime.date.today().isoformat(),
        "wayback": sum(1 for e in liste if e["wayback"]),
        "selbstgebaut": sum(1 for e in liste if e["selbstgebaut"]),
        "faecherArtikel": sum(1 for e in liste if e["fachQuelle"] == "fachseite"),
        "faecherInhalt": sum(1 for e in liste if e["fachQuelle"] == "inhalt"),
    }
    seiten_liste = [{k: v for k, v in e.items() if not k.startswith("_") and k != "fachQuelle" and v not in (None, "", [], False)}
                    for e in liste]
    daten = json.dumps({"uebungen": seiten_liste, "statistik": statistik}, ensure_ascii=False, separators=(",", ":"))
    # als JS-Datei, damit die Seiten die Liste ohne fetch() kennen
    schreibe(bestand.seite / "uebungen.js", f"window.H5P_ARCHIV = {daten};\n".encode("utf-8"))

    # Vorlagen: ?v=… gegen veraltete Browser-Caches, Kopf/Fuß und Texte aus der Konfiguration
    ersetzen = bausteine(konfig, str(int(time.time())))
    seiten = [p for p in sorted(VORLAGEN.glob("*")) if p.suffix in (".html", ".css", ".js") and not p.name.startswith("_")]
    eigene = Path(args.konfig).resolve().parent / "seiten" if args.konfig else REPO / "konfig" / "seiten"
    if eigene.is_dir():
        seiten += [p for p in sorted(eigene.glob("*.html"))]  # Impressum, Datenschutz, Barrierefreiheit …
    for vorlage in seiten:
        text = vorlage.read_text(encoding="utf-8")
        for alt, neu in ersetzen.items():
            text = text.replace(alt, neu)
        schreibe(bestand.seite / vorlage.name, text.encode("utf-8"))
    # Seiten, Skripte und Stylesheets, die es in Vorlagen und konfig/seiten nicht mehr gibt (z. B. ein entferntes
    # Impressum), aus seite/ löschen; eigene Dateien gehören nach konfig/seiten/
    aktuell = {v.name for v in seiten} | {"uebungen.js"}
    for datei in bestand.seite.iterdir():
        if datei.is_file() and datei.suffix in (".html", ".js", ".css") and datei.name not in aktuell:
            datei.unlink()
            log(f"  veraltet, entfernt: seite/{datei.name}")

    with (bestand.seite / "h5p.csv.part").open("w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh, delimiter=";")
        w.writerow(["ID", "Titel", "Übungsart", "Bibliothek", "Lizenz der Übung", "Autor:innen", "Fach", "Fach-Quelle",
                    "Datei", "Bytes", "Original", "Gesichert über"])
        for e in liste:
            w.writerow([e["id"], e["titel"], e["typ"], e["_bibliothek"], e["_lizenz"], ", ".join(e["autoren"]),
                        ", ".join(e["faecher"]), {"fachseite": "Fachseite auf schule-bw.de", "inhalt": "inhaltlich zugeordnet"}.get(e["fachQuelle"], ""),
                        e["h5p"], e["bytes"], e["_original"], e["_herkunft"]])
    (bestand.seite / "h5p.csv.part").replace(bestand.seite / "h5p.csv")
    log(f"Seite gebaut: {len(liste)} Übungen, Exporte {fmt_bytes(statistik['exportBytes'])}, "
        f"Bibliotheken {fmt_bytes(statistik['libsBytes'])}, Inhalte {fmt_bytes(statistik['inhalteBytes'])} → {bestand.seite}")


# --------------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--bestand", default=os.environ.get("UEBUNGSHEFT_BESTAND", "bestand"), help="Bestandsordner (Standard: ./bestand)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name, hilfe in (("holen", "Übungen in den Bestand holen"), ("alles", "holen, danach seite")):
        p = sub.add_parser(name, help=hilfe)
        p.add_argument("--quelle", default=os.environ.get("UEBUNGSHEFT_QUELLE", "original"),
                       help="'original' (h5p.schule-bw.de), URL einer anderen Übungsheft-Instanz oder ein Ordner mit .h5p-Dateien")
        p.add_argument("--benutzer", help="für eine Instanz mit Login (oder UEBUNGSHEFT_BENUTZER)")
        p.add_argument("--passwort", help="für eine Instanz mit Login (oder UEBUNGSHEFT_PASSWORT)")
        p.add_argument("--abstand", type=float, default=1.0, help="Sekunden zwischen Anfragen (Standard 1)")
        p.add_argument("--bis", type=int, help="nur Originalserver: letzte ID")
        p.add_argument("--luecke", type=int, default=300, help="nur Originalserver: so viele fehlende IDs in Folge beenden den Lauf")
        p.add_argument("--min-frei", type=float, default=5.0, help="abbrechen, wenn weniger GB frei sind")
        p.add_argument("--fehler-wiederholen", action="store_true", help="fehlgeschlagene Übungen erneut versuchen")
        p.add_argument("--limit", type=int, help="höchstens so viele neue Übungen (zum Ausprobieren)")
    for name in ("seite", "alles"):
        p = sub.choices[name] if name in sub.choices else sub.add_parser(name, help="nur die Webseite neu bauen")
        p.add_argument("--konfig", default=os.environ.get("UEBUNGSHEFT_KONFIG"), help="eigene seite.json (Standard: konfig/seite.json)")
    args = ap.parse_args()
    if args.cmd == "alles":
        cmd_seite(args)  # sofort eine (anfangs leere) Seite, damit der Webserver etwas ausliefern kann
        cmd_holen(args, zwischendurch=lambda: cmd_seite(args))
        cmd_seite(args)
    elif args.cmd == "holen":
        cmd_holen(args)
    else:
        cmd_seite(args)


if __name__ == "__main__":
    main()
