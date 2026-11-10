# Pulot — Submission Companion Guide

Material for the 8–12 minute recording and the 3–5 page report. Replace every
`[bracketed]` placeholder with your group's own details before submitting.

---

## 1. Problem and proposed solution (1–2 min)

**Problem.** Lost items on campus are reported by word of mouth, group chats or a paper
log at the guard house. Messages get buried, there is rarely a photo, and nobody knows
exactly where the item was lost or found.

**Intended users.** Students, faculty and staff who lose or find something on campus.

**Solution.** A focused mobile app with two screens:

- **Report**: describe the item, take a photo with the phone camera, capture the GPS
  position and adjust the pin on a map, then submit.
- **Browse**: see every report with its photo, search by keyword, filter by Lost / Found,
  category, date and status, and open one to see the contact person and the exact spot on a map.
- **Resolve**: the person who submitted a report can mark it resolved (item returned or
  claimed) from their own phone. It stays visible, labelled Resolved.
- **Feedback**: besides the on-screen message, the phone vibrates with the result:
  success, warning (something to fix first) or error (the server or network failed).

---

## 2. Suggested walkthrough order (3–4 min)

1. Open the app on the **Browse** tab. Point out the All / Lost / Found filter and pull to refresh.
2. Go to **Report**. Tap **Submit report** with an empty form to show the warning toast (error handling). The phone also gives a warning vibration.
3. Choose **I found something**, fill in the title, category, description and contact info.
4. Tap **Add photo**, then **Take photo**. Show the preview, then **Retake photo**.
5. Tap **Get Current Location**: the permission prompt, then the map with the pin and the accuracy (±m).
6. Drag the pin to the exact spot; the coordinates under the map update.
7. Tap **Submit report**: loading indicator, then the success toast and the jump back to Browse.
8. Tap the new card: photo, details and the map pin (green for found, red for lost).
9. Switch the filter to **Lost** to show the server-side filter. Type a word in the search
   bar, then open **Filters** (top right) and pick a category; tap the chip to remove it.
10. Open your own report: **You reported this item** and **Mark as resolved**. Confirm, show the
    Resolved banner, close, and point out the Resolved badge on the card. A report from another
    phone has no such button.

---

## 3. Key code snippets (2–3 min)

### Snippet A — Camera photo to FormData upload
`app/src/app/report/report.page.ts` (around line 99) and `app/src/app/services/item.service.ts` (line 20)

```ts
// report.page.ts
const photo = data === 'camera'
  ? await Camera.takePhoto({ quality: 70, correctOrientation: true })
  : (await Camera.chooseFromGallery({})).results[0];

const response = await fetch(photo.webPath);   // webPath is readable by the WebView
this.photoBlob = await response.blob();          // the actual image bytes
this.photoPreview.set(photo.webPath);            // shown in <img> for preview

// item.service.ts
const form = new FormData();
form.append('title', item.title);
// ...the other text fields...
if (photo) form.append('photo', photo, `photo.${extension}`);
return this.http.post<ApiResponse<Item>>(this.url, form);
```

What to say:
- In Camera 8, `getPhoto` with `CameraSource.Prompt` is deprecated. The app shows its own
  action sheet and calls `takePhoto` or `chooseFromGallery`.
- The plugin returns a `webPath` (a URL to the image file), not the bytes. `fetch()` on that
  URL gives a `Blob`, which can be attached to `FormData`.
- `FormData` sends `multipart/form-data`, the format PHP needs to receive a file in `$_FILES`.
  The `Content-Type` header is not set by hand because the browser must add the boundary.

### Snippet B — Geolocation into a Leaflet map with a draggable pin
`app/src/app/report/report.page.ts` (line 143) and `app/src/app/components/location-map/location-map.component.ts` (line 49)

```ts
// report.page.ts
const permission = await Geolocation.requestPermissions();
const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
this.latitude.set(position.coords.latitude);
this.longitude.set(position.coords.longitude);

// location-map.component.ts
this.map = L.map(this.mapElement().nativeElement).setView(position, 17);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '...' }).addTo(this.map);
this.marker = L.marker(position, { icon: this.pinIcon(this.type()), draggable: this.draggable() }).addTo(this.map);
this.marker.on('dragend', () => this.emitPosition(this.marker!.getLatLng()));
this.resizeObserver = new ResizeObserver(() => this.map?.invalidateSize());
```

What to say:
- Permission is requested first. If it is denied or GPS fails, the user gets a toast and can
  use **Pick on map** instead, so the form never gets stuck.
- GPS can be off by tens of metres indoors, so the pin is draggable. The component emits
  `positionChange` and the page stores the corrected coordinates.
- The same component is reused read-only in the details modal.
- `invalidateSize()` is needed because Ionic animates pages and modals in. Leaflet measures the
  container too early and draws grey tiles unless it re-measures.
- The pin is a CSS `divIcon`, coloured by type. Leaflet's default marker images break when
  Angular bundles the app.

### Snippet C — Secure insert and upload in PHP
`api/items.php` (lines 73–104 and 168)

```php
$mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);   // real content type
if (!isset(UPLOAD_ALLOWED_TYPES[$mime]) || getimagesize($file['tmp_name']) === false) {
    respond(415, [...]);
}
$fileName = bin2hex(random_bytes(16)) . '.' . UPLOAD_ALLOWED_TYPES[$mime];
move_uploaded_file($file['tmp_name'], UPLOAD_DIR . '/' . $fileName);

$stmt = $pdo->prepare('INSERT INTO items (title, ..., contact_info) VALUES (:title, ..., :contact_info)');
$stmt->execute($item);
```

What to say:
- The file's type comes from its contents, not from the name or the header the client sent.
  A PHP file renamed to `.jpg` is rejected with 415.
- Saved files get random names, so users cannot overwrite each other's files or choose a
  `.php` extension. `uploads/.htaccess` also blocks script execution and directory listing.
- Prepared statements send the values separately from the SQL, which prevents SQL injection.

---

## 4. Testing and evaluation

Results below were observed during development on 31 Oct 2026 (rows 16–20 after the search
and Resolved update), in the browser
(`ionic serve`, 375×812 mobile viewport) and with `curl` against the XAMPP API.
Rows marked **Not yet tested** must be run on an Android phone before recording; fill in
your own actual results.

| # | Feature / task tested | Expected result | Actual result | Status |
|---|---|---|---|---|
| 1 | Open Browse tab (GET all) | Reports load, newest first, with photo or a placeholder | Reports listed newest first; placeholder shown for reports without a photo | Pass |
| 2 | Filter Lost / Found | Only reports of that type are shown (`?type=` sent to API) | Found filter showed only the found report | Pass |
| 3 | Tap a report | Modal shows photo, details, local date and map pin | Modal showed all fields, date in local time, map tiles and green pin | Pass |
| 4 | Submit an empty form | Warning toast lists missing fields, nothing is sent | Toast: "Please add: a title, a category, your contact info, the location." No request sent | Pass |
| 5 | Location unavailable / denied | Warning toast; "Pick on map" offered | Toast shown (browser had no location access); Pick on map placed the pin | Pass |
| 6 | Tap / drag on the map | Pin moves and coordinates update | Tapping the map moved the pin; coordinates changed | Pass |
| 7 | Submit a complete report | Loading indicator, 201, success toast, back to Browse with the new report on top | Loading shown, POST 201, "Report submitted." toast, new report first in the list | Pass |
| 8 | Server-side validation (empty fields via curl) | 422 with one message per field | 422 with messages for title, type, category, contact, latitude, longitude | Pass |
| 9 | Upload a non-image renamed `.jpg` | Rejected with 415, nothing saved | 415 "Photo must be a JPEG, PNG or WebP image."; no file saved | Pass |
| 10 | Request a `.php` file or the folder listing in `/uploads` | Blocked | Both returned 403 | Pass |
| 11 | Take photo with the phone camera, preview, retake | Preview appears; retake replaces it | Not yet tested | Not yet tested |
| 12 | Get Current Location on the phone (GPS on) | Permission prompt, then pin at the phone's position with ±m accuracy | Not yet tested | Not yet tested |
| 13 | Submit with a photo from the phone | Photo appears on the card and in the details | Not yet tested | Not yet tested |
| 14 | Pull to refresh | List reloads | Not yet tested | Not yet tested |
| 15 | Phone offline / server stopped | "Cannot reach the server..." with a Try again button | Not yet tested | Not yet tested |
| 16 | Keyword search | Only reports with the word in the title or description | "library" (in a description only) returned just that report; `100%` matched literally, not as a wildcard | Pass |
| 17 | Category and date filters | Only matching reports; active filters shown as removable chips | Keys showed only the Keys report with a "Keys ×" chip and a 1 on the Filters button; removing the chip restored the list. A future `from` date returned none; a bad date gave 400 | Pass |
| 18 | Mark own report resolved | Confirm, then Resolved banner, badge on the card, `resolved_at` set | Confirm dialog, PUT 200, "Report marked as resolved." toast, banner with date, Resolved badge in the list; Reopen cleared it | Pass |
| 19 | Change someone else's report | Not possible | No button on a report from another device; PUT with a wrong token gave 403 | Pass |
| 20 | Owner token kept after submitting | The phone can resolve the report it just created | After submitting from the Report tab, the new report's id was in the phone's stored tokens | Pass |
| 21 | Vibration matches the result (browser check) | Warning, success and error patterns | Empty submit gave the warning pattern; Mark as resolved gave the success pattern; a rejected status change (403) gave the error pattern | Pass |
| 22 | Vibration on a real phone | Phone vibrates on submit, resolve and errors | Not yet tested | Not yet tested |

### Observed issues and usability notes

- The location from GPS can be off indoors; the draggable pin addresses this.
- If the user picks the pin by hand and then a slow GPS fix arrives, the GPS fix replaces
  the hand-placed pin.
- Photos are uploaded at JPEG quality 70 but at full resolution, so uploads on mobile data
  can be slow.

---

## 5. Limitations and future improvements (1–2 min)

| Limitation | Possible improvement |
|---|---|
| No login: anyone can post, and contact info is public | Sign in with the school account; show contact info only to signed-in users |
| Only the phone that submitted a report can resolve it; clearing the app's data or reinstalling loses that ability. Reports cannot be edited or deleted | Sign-in, so ownership follows the account instead of the phone; add edit and delete |
| Needs internet; nothing is cached | Cache the last list locally (e.g. `@capacitor/preferences`) and queue reports made offline |
| Photos are not resized before upload | Resize/compress on the phone (canvas or a plugin) before sending |
| Date filter offers fixed ranges (today, 7 days, 30 days); search is a plain text match with no tolerance for spelling mistakes | A date-range picker; MySQL full-text search |
| Map tiles come from the public OpenStreetMap server | Use a tile provider with an API key, or a campus map overlay, for heavier use |
| No spam or abuse controls | Rate-limit the API and add reporting/moderation |
| API URL is fixed at build time | Host the API on HTTPS and point the release build at it |

---

## 6. AI usage disclosure (about 30 s) — template

> We used **[Claude Code (Anthropic)]** as a coding assistant. It helped
> **[scaffold the PHP endpoint and Ionic pages, and explain Capacitor Camera 8 and Leaflet]**.
> We **[reviewed every file, ran the tests in section 4 on our own phones, and changed
> …]**, and we can explain each part of the code.

For the written report, also list: which tools, which tasks they assisted with, and what the
group reviewed, tested or modified (required by the case study outline).

---

## 7. Android permissions (AndroidManifest.xml)

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
<uses-feature android:name="android.hardware.location.gps" android:required="false" />
```

`android.permission.VIBRATE` is added to the final manifest by the `@capacitor/haptics` plugin.

Plus `android:usesCleartextTraffic="true"` on `<application>` and `androidScheme: 'http'`
in `capacitor.config.ts`, so the app can reach a plain-http XAMPP server on the LAN. This
is the `Http failure response ... 0` problem shown on the emulator in class.

---

## 8. Submission checklist

- [ ] Set `apiUrl` in `environment.prod.ts`, rebuild, and install the APK on a real phone
- [ ] Run rows 11–15 of the test table on the phone and fill in the actual results
- [ ] Record 8–12 min: problem → walkthrough → 3 snippets → testing/limitations → AI disclosure
- [ ] 3–5 page PDF report following the outline (project info, problem, features, technical, testing, AI)
- [ ] APK with install notes and the API address it uses
- [ ] Repository or Drive ZIP link (no passwords; `api/config.local.php` stays out)
- [ ] Deadline: the instructor's calendar in the Oct 30 recording showed **ITWS07 on Nov 12, 2026**. Confirm this with the instructor.
