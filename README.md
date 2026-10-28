# Status 1 – Server für die zentrale Auswertung

Testserver für **Status 1 Debrief**: nimmt die gebündelten Debriefs der Fahrzeughandys einer Wache an, speichert nur Monatssummen und zeigt der Wachenleitung ein Wachenportal mit Bericht (PDF) und Verlauf.

## Als Home-Assistant-Add-on

1. Home Assistant → Einstellungen → Add-ons → Add-on-Store → ⋮ → **Repositories**
2. `https://github.com/joevent/status1-server` hinzufügen
3. **Status 1 Debrief Server** installieren, starten, **Web-UI öffnen**

Details: [status1_server/DOCS.md](status1_server/DOCS.md)

## Ohne Home Assistant

```bash
cd status1_server/rootfs/srv/status1
S1_DATA=./data S1_PORT=8099 python3 server.py
```

Nur Python 3 (Standardbibliothek), keine weiteren Pakete.

## Aufbau

- `server.py` – Annahme-Schnittstelle, Monatssummen (SQLite), Wachenportal-API, Anmeldung (scrypt, optional TOTP)
- `portal/` – Wachenportal; Berichtsvorlage `report.js`/`report.css` stammt aus der App
- `app/` – Kopie der App, damit sie im Heimnetz vom Server geöffnet werden kann
- `tools/sync_app.py ../status1` – übernimmt App und Berichtsvorlage aus dem App-Repository

Bibliotheken der App: qrcode-generator (MIT), jsQR (Apache-2.0), Schriften Barlow (OFL).
