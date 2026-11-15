/*
 * Festival themes for the desk (room.html).
 *
 * On these dates (India time) the desk dresses up by itself:
 *   Diwali     clay diyas on the desk and sill, a marigold garland across the window, a glowing akash kandil,
 *              and fireworks over the city at night.
 *   Christmas  a small tree with lights and ornaments, gifts, a wreath and fairy lights in the window,
 *              and a Santa hat on the TV.
 * The TV's title card and the caption add a greeting.
 *
 * Preview any theme, any day, by adding ?festival=diwali or ?festival=christmas to the address
 * (?festival=none turns the theme off). Nothing else needs editing.
 */
window.DESK_FESTIVALS = {
  enabled: true,

  // Show one theme all the time (e.g. while testing): 'diwali', 'christmas', or '' to follow the dates below.
  force: '',

  // Diwali follows the lunar calendar, so its date moves each year. It is worked out automatically from the
  // sun and moon (festival.dates.js), for every year, with nothing to update.
  // To pin a year anyway (e.g. if your family's panchang says a different day), add it here as 'YYYY-MM-DD'.
  // The theme runs from `before` days earlier (Dhanteras) to `after` days later (Bhai Dooj).
  diwali: {
    dates: [],
    before: 4,
    after: 2,
  },

  // Christmas: every year between these days (MM-DD), inclusive.
  christmas: { from: '12-01', to: '12-31' },
};
