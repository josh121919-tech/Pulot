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
  plugins: {
    LocalNotifications: {
      // White silhouette shown in the notification bar (android/app/src/main/res/drawable).
      smallIcon: 'ic_stat_pickapp',
      iconColor: '#2E7D32',
    },
  },
};

export default config;
