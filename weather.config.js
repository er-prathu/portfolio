/*
 * Live weather settings for the desk (room.html).
 *
 * The window shows the visitor's real local weather, fetched from Open-Meteo (https://open-meteo.com, no API key).
 * Where it comes from, in order:
 *   1. a city the visitor picked by hand in the weather panel (remembered in their browser),
 *   2. their browser location, if they allow it,
 *   3. their approximate city from the site's own server (/api/geo: Cloudflare's request data, no third party),
 *   4. the fallback below, if one is set; otherwise the panel asks them to search for their city.
 */
window.DESK_WEATHER_CONFIG = {
  // Optional last resort, e.g. { name: 'Mumbai', latitude: 19.076, longitude: 72.878 }. null = ask the visitor instead.
  fallback: null,

  // The site's own approximate-location endpoint (src/worker.js). '' turns this step off.
  ipLocationUrl: '/api/geo',

  // City search in the weather panel (Open-Meteo's free geocoder, no key).
  geocodeSearchUrl: 'https://geocoding-api.open-meteo.com/v1/search',

  // How often to refresh the weather while the page is open (Open-Meteo updates roughly every 15 minutes).
  refreshMinutes: 15,

  // Ask the visitor for their location once, a few seconds after the room has loaded (never repeatedly).
  askForLocation: true,
  askDelaySeconds: 4,

  // Coordinates are rounded before they leave the browser (2 decimals is about 1 km) and are never displayed.
  coordinateDecimals: 2,

  // A cached reading older than this is not used for the 3D scene (the indicator still shows its age).
  cacheMaxAgeHours: 6,

  // Weather API and the free client-side reverse-geocoder used to name the visitor's city.
  forecastUrl: 'https://api.open-meteo.com/v1/forecast',
  reverseGeocodeUrl: 'https://api.bigdatacloud.net/data/reverse-geocode-client',
};
