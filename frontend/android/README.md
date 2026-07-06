# Android-App (Capacitor)

Die Android-App ist ein Capacitor-Wrapper um das SvelteKit-Frontend plus einen
nativen App-Blocker (AccessibilityService): Geblockte Apps werden innerhalb der
konfigurierten Zeitfenster geschlossen und stattdessen ein Task vorgeschlagen —
hart, ohne Snooze. Konfiguration unter `/blocking` in der App; gespeichert im
Account (`/block-settings`-API), lokal gecacht (SharedPreferences), Blocken
funktioniert offline.

## Voraussetzungen

- JDK 21 (`~/.local/share/java/jdk-21.0.11+10`, via `org.gradle.java.home` in `~/.gradle/gradle.properties`)
- Android SDK (`~/Android/Sdk`, via `local.properties`; Pakete: platform-tools, platforms;android-35, build-tools;35.0.0)
- Signing-Keystore: `~/.android-keystores/task-suggester.keystore`, Zugangsdaten in
  `~/.gradle/gradle.properties` (`TASKSUGGESTER_KEYSTORE*`). **Keystore sichern!**
  Ohne ihn lassen sich keine Updates über die installierte App installieren.

## Bauen & installieren

```bash
cd frontend
npm run build:app     # statischer SPA-Build (CAP_BUILD=1, prod-API-URL) + cap sync
npm run apk           # signiertes Release-APK
# → android/app/build/outputs/apk/release/app-release.apk
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

Debug-Build: `npm run apk:debug`. Lokale API testen:
`PUBLIC_API_URL=http://<host-ip>:8000 npm run build:app && npm run apk:debug`.

## Einrichtung auf dem Gerät

1. App öffnen, einloggen (Server-`.env` braucht die App-Origins in `BACKEND_CORS_ORIGINS`,
   siehe `.env.example`).
2. `/blocking` ("Blocken"): Bedienungshilfe aktivieren.
   **Android 13+:** Bei Installation aus Datei ist der Schalter zunächst gesperrt
   ("Eingeschränkte Einstellung") → App-Info → ⋮ → "Eingeschränkte Einstellungen zulassen".
   Bei `adb install` entfällt das.
3. Apps und Zeitfenster wählen, "Blocken aktiv" einschalten.
4. Optional: Akku-Optimierung für die App deaktivieren (OEM-Killer, v.a. Xiaomi/Samsung).

## Architektur (nativ)

- `AppBlockerPlugin.kt` — Capacitor-Bridge: App-Liste, Konfig lesen/schreiben,
  Accessibility-Status, Event `blockedAppOpened` (retained, überlebt Kaltstart).
- `BlockConfigStore.kt` — SharedPreferences-Konfig, von Plugin und Service geteilt.
- `BlockerAccessibilityService.kt` — reagiert auf `TYPE_WINDOW_STATE_CHANGED`;
  bei Treffer im Zeitfenster: HOME + eigene Activity mit `blocked_package`-Extra.
  Ignoriert Launcher/SystemUI/IME, 3-s-Debounce pro Paket. Schließt außerdem
  Bild-in-Bild-Fenster geblockter Apps per Drag-Geste zum Dismiss-Ziel
  (`canRetrieveWindowContent` wird nur zur Paket-Zuordnung der Fenster genutzt,
  Inhalte werden nicht ausgelesen).
- JS-Seite: `src/lib/native.ts` (Wrapper mit Web-No-ops), Banner auf `/`
  (`?blockedApp=...`), Settings-UI `/blocking`.

## Bekannte Grenzen / Play-Store-Notizen

- youtube.com im Browser wird nicht geblockt (ggf. Browser mitblocken).
- Wer beim Fensterstart schon **in** der App ist, wird erst beim nächsten
  Fensterwechsel erwischt (Service ist rein event-getrieben).
- Bild-in-Bild geblockter Apps wird automatisch geschlossen; falls das auf einem
  Gerät nicht greift: PiP für die App unter „Spezieller App-Zugriff → Bild-in-Bild"
  deaktivieren. Nach einem App-Update mit geänderten Service-Fähigkeiten die
  Bedienungshilfe einmal aus- und wieder einschalten.
- Für einen späteren Play-Store-Release: AccessibilityService für App-Blocking
  wird von Google abgelehnt → Detektor gegen `UsageStatsManager`-Polling tauschen
  (nur `BlockerAccessibilityService` ersetzen, Rest bleibt). `<queries>` statt
  `QUERY_ALL_PACKAGES` ist bereits Play-konform.
