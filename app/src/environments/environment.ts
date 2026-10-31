// Settings for `ionic serve` (browser on the same PC as XAMPP).
// `ng build` swaps this file for environment.prod.ts (see angular.json).
export const environment = {
  production: false,

  // The PHP endpoint. In the browser, localhost is the PC running XAMPP.
  apiUrl: 'http://localhost/campus-lost-found/api/items.php',

  // Where the map opens if the phone cannot get a GPS fix and the user chooses
  // to place the pin by hand. Approximate centre of Cabanatuan City; set it to your campus.
  defaultMapCenter: { latitude: 15.4865, longitude: 120.9734 },
};
