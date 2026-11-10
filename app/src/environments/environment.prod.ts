// Settings baked into the APK (`ionic build --prod`, then `npx cap sync android`).
export const environment = {
  production: true,

  // On a phone, "localhost" is the phone itself, so the APK must point at a real address:
  //  - same Wi-Fi as the XAMPP PC: http://<PC's IPv4 from ipconfig>/campus-lost-found/api/items.php
  //  - hosted backend:              https://<your-domain>/api/items.php
  // Change this line, then rebuild the APK.
  // Currently the online API on alwaysdata (the Pulot_BE_API repo), so the APK works on any network.
  apiUrl: 'https://pulot.alwaysdata.net/api/items.php',

  // Approximate centre of Cabanatuan City; set it to your campus.
  defaultMapCenter: { latitude: 15.4865, longitude: 120.9734 },
};
