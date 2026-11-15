/*
 * Works out the date of Diwali (Lakshmi Puja) for any year from the positions of the sun and moon, so
 * festival.config.js never needs a new date typed in.
 *
 * The rule the Hindu calendar uses:
 *   1. Diwali falls on Amavasya (the new-moon day) that ends the lunar month of Ashvin. That is the first new
 *      moon after the sun enters Tula (sidereal Libra, Lahiri ayanamsa), usually around 17 October.
 *   2. Amavasya is the 30th tithi: from when the moon is 12° behind the sun until the new moon itself.
 *      Lakshmi Puja is held on the evening (pradosh, just after sunset) that falls inside it, as seen in India.
 *
 * Sun and moon positions follow Jean Meeus, "Astronomical Algorithms" (low-precision sun, main lunar terms),
 * good to a few minutes for the new moon. Panchangs sometimes disagree by a day when Amavasya covers two
 * evenings; festival.config.js can pin a year if needed.
 */
(function (root) {
  'use strict';
  const RAD = Math.PI / 180;
  const sin = d => Math.sin(d * RAD);
  const norm = d => ((d % 360) + 360) % 360;
  const IST = 5.5 * 3600e3;
  const SUNSET_IST_HOURS = 18 + 5 / 60;          // sunset in Mumbai in Oct–Nov is about 18:00–18:12

  // Julian centuries (TT) since J2000 for a JS time in ms (UTC). ΔT ≈ 69 s is enough here.
  const T = ms => ((ms + 69e3) / 864e5 + 2440587.5 - 2451545) / 36525;

  function sunLon(t) {                               // apparent geocentric longitude, degrees (no nutation)
    const L0 = 280.46646 + 36000.76983 * t, M = 357.52911 + 35999.05029 * t;
    const C = (1.914602 - 0.004817 * t) * sin(M) + (0.019993 - 0.000101 * t) * sin(2 * M) + 0.000289 * sin(3 * M);
    return norm(L0 + C - 0.00569);
  }

  // [coefficient in 1e-6 degrees, D, M, M', F]
  const MOON = [
    [6288774, 0, 0, 1, 0], [1274027, 2, 0, -1, 0], [658314, 2, 0, 0, 0], [213618, 0, 0, 2, 0],
    [-185116, 0, 1, 0, 0], [-114332, 0, 0, 0, 2], [58793, 2, 0, -2, 0], [57066, 2, -1, -1, 0],
    [53322, 2, 0, 1, 0], [45758, 2, -1, 0, 0], [-40923, 0, 1, -1, 0], [-34720, 1, 0, 0, 0],
    [-30383, 0, 1, 1, 0], [15327, 2, 0, 0, -2], [-12528, 0, 0, 1, 2], [10980, 0, 0, 1, -2],
    [10675, 4, 0, -1, 0], [10034, 0, 0, 3, 0], [8548, 4, 0, -2, 0], [-7888, 2, 1, -1, 0],
    [-6766, 2, 1, 0, 0], [-5163, 1, 0, -1, 0], [4987, 1, 1, 0, 0], [4036, 2, -1, 1, 0],
    [3994, 2, 0, 2, 0], [3861, 4, 0, 0, 0], [3665, 2, 0, -3, 0], [-2689, 0, 1, -2, 0],
    [-2602, 2, 0, -1, 2], [2390, 2, -1, -2, 0], [-2348, 1, 0, 1, 0], [2236, 2, -2, 0, 0],
    [-2120, 0, 1, 2, 0], [-2069, 0, 2, 0, 0], [2048, 2, -2, -1, 0], [-1773, 2, 0, 1, -2],
    [-1595, 2, 0, 0, 2], [1215, 4, -1, -1, 0], [-1110, 0, 0, 2, 2], [-892, 3, 0, -1, 0],
    [-810, 2, 1, 1, 0], [759, 4, -1, -2, 0], [-713, 0, 2, -1, 0], [-700, 2, 2, -1, 0],
    [691, 2, 1, -2, 0], [596, 2, -1, 0, -2], [549, 4, 0, 1, 0], [537, 0, 0, 4, 0],
    [520, 4, -1, 0, 0], [-487, 1, 0, -2, 0], [-399, 2, 1, 0, -2], [-381, 0, 0, 2, -2],
    [351, 1, 1, 1, 0], [-340, 3, 0, -2, 0], [330, 4, 0, -3, 0], [327, 2, -1, 2, 0],
    [-323, 0, 2, 1, 0], [299, 1, 1, -1, 0], [294, 2, 0, 3, 0],
  ];

  function moonLon(t) {                              // geocentric longitude, degrees (no nutation)
    const Lp = 218.3164477 + 481267.88123421 * t, D = 297.8501921 + 445267.1114034 * t;
    const M = 357.5291092 + 35999.0502909 * t, Mp = 134.9633964 + 477198.8675055 * t, F = 93.272095 + 483202.0175233 * t;
    const E = 1 - 0.002516 * t - 0.0000074 * t * t;
    let s = 3958 * sin(119.75 + 131.849 * t) + 1962 * sin(Lp - F) + 318 * sin(53.09 + 479264.29 * t);
    for (const [c, d, m, mp, f] of MOON) s += c * Math.pow(E, Math.abs(m)) * sin(d * D + m * M + mp * Mp + f * F);
    return norm(Lp + s / 1e6);
  }

  const elong = ms => norm(moonLon(T(ms)) - sunLon(T(ms)));   // 0° at new moon
  const ayanamsa = year => 23.853 + 0.0139694 * (year - 2000);  // Lahiri

  // first time after `a` (ms) when the elongation passes `target` degrees, searched in 3-hour steps then bisected
  function crossing(a, limit, target) {
    const off = ms => norm(elong(ms) - target);               // jumps from ~360 to ~0 at the crossing
    for (let t = a; t < limit; t += 3 * 3600e3) {
      if (off(t) > 300 && off(t + 3 * 3600e3) < 60) {
        let lo = t, hi = t + 3 * 3600e3;
        while (hi - lo > 30e3) { const mid = (lo + hi) / 2; if (off(mid) > 180) lo = mid; else hi = mid; }
        return (lo + hi) / 2;
      }
    }
    return null;
  }

  const ymdIST = ms => new Date(ms + IST).toISOString().slice(0, 10);

  function diwali(year) {
    let t = Date.UTC(year, 8, 15), end = Date.UTC(year, 11, 15);
    while (t < end) {
      const nm = crossing(t, end, 0);
      if (nm == null) break;
      const sid = norm(sunLon(T(nm)) - ayanamsa(year));
      if (sid >= 180 && sid < 210) {
        const start = crossing(nm - 40 * 3600e3, nm, 348);   // Amavasya begins
        const from = start == null ? nm - 24 * 3600e3 : start;
        // first evening (pradosh) in India inside Amavasya; if none, the day it began
        const d0 = new Date(from + IST); d0.setUTCHours(0, 0, 0, 0);
        for (let day = d0.getTime() - IST; day < nm; day += 864e5) {
          const dusk = day + SUNSET_IST_HOURS * 3600e3;
          if (dusk >= from && dusk <= nm) return ymdIST(dusk);
        }
        return ymdIST(from);
      }
      t = nm + 5 * 864e5;
    }
    return null;
  }

  const api = { diwali, _elong: elong };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DESK_FESTIVAL_DATES = api;
})(typeof window !== 'undefined' ? window : globalThis);
