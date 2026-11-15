/*
 * Live weather settings for the desk (room.html).
 *
 * The window shows the visitor's real local weather, fetched from Open-Meteo (https://open-meteo.com, no API key).
 * If the visitor declines location access, or their browser has none, the weather for the FALLBACK city is shown
 * instead, labelled with that city's name. Change the fallback here; nothing else needs editing.
 */
window.DESK_WEATHER_CONFIG = {
  // Shown when the visitor's location is unavailable. Coordinates are the city centre.
  fallback: { name: 'Navi Mumbai', latitude: 19.033, longitude: 73.029 },

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
