# PickApp

PickApp (from "pick up", as in picking up a lost item) is a small Ionic + Angular + Capacitor app for reporting items lost or found on campus.
A student takes a photo of the item, pins where it was lost or found on a map, and
submits the report. Everyone can browse the reports, filter Lost / Found, and open a
report to see the photo, the contact person and the spot on the map.

| Part     | Technology                                                        |
| -------- | ----------------------------------------------------------------- |
| App      | Ionic 9, Angular 22 (standalone components, signals), Capacitor 8 |
| Device   | `@capacitor/camera`, `@capacitor/geolocation`, `@capacitor/haptics`, Leaflet + OpenStreetMap |
| Data     | Angular `HttpClient` → PHP 8 REST endpoint (PDO) → MariaDB/MySQL  |

```
campus-lost-found/
├── api/
│   ├── config.php                  DB connection (PDO), CORS allow-list, JSON helper
│   ├── config.local.example.php    template for real credentials on a server
│   └── items.php                   GET list / POST report (+ photo upload)
├── sql/lost_found.sql              creates the campus_lost_found database and items table
├── sql/migrate_add_status.sql      adds the Resolved status to an older items table
├── uploads/                        saved photos (.htaccess blocks scripts and listing)
└── app/                            the Ionic project
    ├── src/app/services/item.service.ts
    ├── src/app/items/              Browse tab + item details modal
    ├── src/app/report/             Report tab (form, camera, GPS, map)
    ├── src/app/components/location-map/   reusable Leaflet map
    └── android/                    native Android project (Capacitor)
```

## 1. Backend setup (XAMPP)

1. Put this folder in `C:\xampp\htdocs\` so the API is at
   `http://localhost/campus-lost-found/api/items.php`.
2. Start **Apache** and **MySQL** in the XAMPP Control Panel.
3. Import `sql/lost_found.sql` in phpMyAdmin (or run `mysql -u root < sql/lost_found.sql`).
   A database created before the Resolved status existed needs `sql/migrate_add_status.sql`
   once (it adds the `status`, `resolved_at` and `owner_token_hash` columns).
4. Open `http://localhost/campus-lost-found/api/items.php` in a browser. You should see
   `{"success":true,"data":[]}`.

Default credentials are XAMPP's (`root`, no password). On a hosted server, copy
`api/config.local.example.php` to `api/config.local.php` and fill in the real values;
that file is git-ignored.

### API

| Method | URL                          | Body                                    | Result |
| ------ | ---------------------------- | --------------------------------------- | ------ |
| GET    | `/api/items.php`             | –                                       | 200, all reports, newest first |
| GET    | `/api/items.php?type=lost`   | –                                       | 200, only `lost` (or `found`) |
| GET    | `/api/items.php?q=umbrella&category=Bags&status=open&from=2026-10-25T00:00:00%2B08:00` | – | 200, filters combined with AND (any can be left out) |
| POST   | `/api/items.php`             | multipart: `title`, `description`, `type`, `category`, `latitude`, `longitude`, `contact_info`, optional `photo` file | 201 with the saved report and its `owner_token` |
| PUT    | `/api/items.php?id=5`        | JSON: `{ "status": "resolved" or "open", "owner_token": "..." }` | 200 with the updated report; 403 for a wrong token |

GET filters: `type` (lost/found), `status` (open/resolved), `category`, `q` (keyword in the
title or description, up to 100 characters), `from` / `to` (ISO 8601 date-times, `to` exclusive).

Errors come back as `{ "success": false, "message": "...", "errors": { field: "..." } }`
with status 400, 403, 404, 405, 413 (photo over 5 MB), 415 (not a JPEG/PNG/WebP), 422 (validation) or 500.
Categories: Electronics, ID/Cards, Keys, Bags, Personal Belongings, Others.

**Who can resolve a report.** There is no login, so POST creates a random `owner_token`,
returns it once, and stores only its SHA-256 hash. The app keeps the token on the phone that
submitted the report, so only that phone sees **Mark as resolved**. Clearing the app's data or
reinstalling it loses the token.

## 2. Run the app in the browser

```bash
cd app
npm install
npx ionic serve
```

Opens `http://localhost:8100`. In the browser the camera uses the webcam (or a file
picker) and the location comes from the browser.

## 3. Run on an Android phone

The APK built from this repository uses the online API at
`https://pulot.alwaysdata.net/api/items.php` (the code from the
[Pulot_BE_API](https://github.com/josh121919-tech/Pulot_BE_API) repository on alwaysdata's free
plan), so it works on any Wi-Fi or mobile data. To use your own XAMPP PC instead, follow the
steps below.

On a phone, `localhost` means the phone, so the app needs the PC's address.

1. Find the PC's IPv4 address with `ipconfig` (e.g. `192.168.1.23`). Phone and PC must be
   on the same Wi-Fi. Allow Apache through Windows Firewall if Windows asks.
2. Put that address in `app/src/environments/environment.prod.ts`:
   `apiUrl: 'http://192.168.1.23/campus-lost-found/api/items.php'`
   (or your hosted `https://` URL).
3. Build and copy the web app into the Android project:
   ```bash
   cd app
   npx ionic build --prod
   npx cap sync android
   ```
4. Build the APK, either in Android Studio (`npx cap open android`, then
   **Build > Build APK(s)**) or from the command line:
   ```bash
   cd app/android
   ./gradlew assembleDebug
   ```
   The APK is `app/android/app/build/outputs/apk/debug/app-debug.apk`.
   Capacitor 8 needs **JDK 21** for this step (set `JAVA_HOME` to it). On the development
   PC it is in `C:\Users\acer\.jdks\jdk-21.0.13+9`.

Why the app uses `http://localhost` inside Android: `capacitor.config.ts` sets
`androidScheme: 'http'` and the manifest allows cleartext traffic, so the app can call a
plain-http XAMPP server on the LAN. With the default `https` scheme those calls fail with
`Http failure response ... 0` (mixed content).

## Usage

- **Browse**: pull down to refresh, type in the search bar, use All / Lost / Found, and open
  **Filters** (top right) for category, date and status. Tap a card for details and the map.
- **Resolve**: open a report you submitted from this phone and tap **Mark as resolved**
  (or **Reopen report**).
- **Feedback**: every message on the Report tab and the details screen comes with a short
  vibration that matches it: success, warning (something to fix) or error.
- **Report**: choose Lost or Found, fill in the title and category, choose how people can
  reach you (**Contact number** or **Facebook name**) and fill it in, add a photo
  (optional), tap **Get Current Location** (or **Pick on map**), drag the pin if needed,
  then **Submit report**.

## Security notes

This is a class prototype with no login. Reports, including contact info, are public to
anyone who can reach the API. Queries use PDO prepared statements; uploads are checked by
their real content type, renamed to random names and stored in a folder that will not run
scripts. Do not put real passwords or API keys in the repository.
