# Status 1 Debrief Server

Zentrale Auswertung für die App **Status 1 Debrief**. Die Fahrzeughandys einer Wache übertragen ihre Debriefs gebündelt an diesen Server, die Wachenleitung sieht alle Fahrzeuge zusammen im **Wachenportal** und kann den Bericht als PDF sichern.

> **Testbetrieb.** Dieses Add-on ist für den Test im eigenen Heimnetz gedacht. Bitte **nicht** über Portfreigaben oder Tunnel ins Internet stellen. Für den Echtbetrieb mit einer Wache gehört der Server in ein Rechenzentrum in Deutschland.

## Was gespeichert wird

- Je Wache und Monat nur **Summen**: wie oft jedes Schlagwort als „lief gut“ oder „besser machen“ genannt wurde, dazu Einrichtungen und Unterpunkte.
- Die **Lehren** als Text, ohne Uhrzeit, in zufälliger Reihenfolge.
- **Nicht** gespeichert: einzelne Debriefs, Fahrzeuge, Geräte, Uhrzeiten, Namen, IP-Adressen. Der Server schreibt keine Zugriffsprotokolle.
- Summen werden nach `keep_months` Monaten gelöscht, Lehren nach 12 Monaten.

## Einrichten

1. Add-on starten und **Web-UI öffnen** (oder im Browser `http://<IP-des-Home-Assistant>:8099/portal/`).
2. Wache anlegen: Name, E-Mail der Wachenleitung, Passwort.
3. Im Portal erscheinen der **Wachen-Code** und ein **QR-Code**.
4. Mit jedem Fahrzeughandy den QR-Code scannen. Die App öffnet sich vom Server und ist mit der Wache verbunden. Danach im Browser „Zum Home-Bildschirm“ wählen.

**Wichtig:** Öffnen Sie das Portal über die **IP-Adresse** (z. B. `http://192.168.1.20:8099/portal/`), bevor Sie den QR-Code scannen. Namen wie `homeassistant.local` funktionieren auf vielen Android-Handys nicht.

Die App von `joevent.github.io/status1` (https) kann den Testserver (http) aus Sicherheitsgründen des Browsers nicht erreichen. Für den Test die App deshalb über den QR-Code bzw. `http://<IP>:8099/app/` öffnen.

## Optionen

| Option | Bedeutung | Standard |
|---|---|---|
| `min_debriefs` | Mindestzahl an Debriefs im Zeitraum, ab der die Auswertung angezeigt wird | 10 |
| `keep_months` | Wie lange Monatssummen aufbewahrt werden | 24 |

Für einen schnellen Test `min_debriefs` z. B. auf 3 setzen.

## Übertragung aus der App

- Die App sammelt Debriefs und sendet, sobald 3 zusammengekommen sind oder spätestens am nächsten Tag. Unter Einstellungen → Zentrale Auswertung lässt sich „Jetzt senden“ antippen.
- Ohne Netz bleiben die Debriefs gespeichert und werden später übertragen.
- Die lokale Auswertung und der Bericht auf dem Handy funktionieren unverändert weiter.

## Sicherheit im Portal

- Passwort mit mindestens 10 Zeichen, zweiter Faktor (Authenticator-App) im Portal einschaltbar.
- Wachen-Code mit einem Klick erneuerbar; danach alle Handys neu verbinden.
- Unter „Testdaten löschen“ lassen sich alle Summen und Lehren entfernen.

Daten liegen im Add-on-Ordner `/data` (werden bei Home-Assistant-Backups mitgesichert).
