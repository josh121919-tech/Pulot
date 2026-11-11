import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.campuslostfound.app',
  appName: 'PickApp',
  webDir: 'www',
  server: {
    // Serve the app from http://localhost instead of the default https://localhost.
    // An https page may not call a plain-http XAMPP API (mixed content), which is the
    // "Http failure response ... 0" error seen when testing on the emulator in class.
    androidScheme: 'http',
  },
};

export default config;
