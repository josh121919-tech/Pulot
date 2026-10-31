# Putting the API on the professor's server

The professor agreed to host the backend on gelcunanan.link. These are the steps for
whoever has access to that server's control panel (cPanel or similar).

Files in this folder:

- `campus-lost-found-backend.zip`: the PHP API and an empty `uploads/` folder
- `lost_found_hosted.sql`: creates the `items` table (no CREATE DATABASE, so shared hosts accept it)

## 1. Database

1. In the control panel, open **MySQL Databases**.
2. Create a database, for example `campus_lost_found`. Most hosts add a prefix, so the
   real name may look like `abc123_campus_lost_found`. Write down the full name.
3. Create a database user with a strong password, and add it to the database with
   **All Privileges**.
4. Open **phpMyAdmin**, click the new database on the left, go to **Import**, choose
   `lost_found_hosted.sql` and click **Import**. A table named `items` should appear.

## 2. Files

1. Open **File Manager** and go to the folder the domain serves (usually `public_html`).
2. Upload `campus-lost-found-backend.zip` there and **Extract** it. You should now have:

   ```
   public_html/campus-lost-found/api/items.php
   public_html/campus-lost-found/api/config.php
   public_html/campus-lost-found/uploads/
   ```

3. In `campus-lost-found/api/`, copy `config.local.example.php` to `config.local.php`
   and fill in the database name, user and password from step 1. Keep `DB_HOST` as
   `localhost` unless the host says otherwise. This file holds the password, so do not
   share it or send it in chat.
4. Make sure `campus-lost-found/uploads/` is writable by PHP (permissions `755` is
   usually enough; the API saves photos there).

## 3. Check it works

Open this in a browser (change the path if the folder name is different):

```
https://gelcunanan.link/campus-lost-found/api/items.php
```

You should see:

```json
{"success":true,"data":[]}
```

- **"Server error. Please try again later."** → usually the name, user or password in
  `config.local.php` is wrong, the user was not added to the database, or the `items`
  table was not imported. The exact reason is in the host's PHP error log (lines start
  with `[lost-found]`).
- **404** → the folder is in a different place; check the path in File Manager.

Send the working URL back so the app can be pointed at it and the APK rebuilt.

## Notes

- Photos up to 5 MB are accepted by the API, but the server's own PHP limit
  (`upload_max_filesize`) may be lower. If a photo upload fails with "The upload is too
  large for the server", that limit can be raised in the control panel's PHP settings.
- The API only adds its own folder. It does not touch the professor's other files or databases.
