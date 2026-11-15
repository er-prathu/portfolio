'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { diwali } = require('../festival.dates.js');

// Lakshmi Puja dates as published by Indian panchangs.
const KNOWN = {
  2010: '2010-11-05', 2011: '2011-10-26', 2012: '2012-11-13', 2013: '2013-11-03', 2014: '2014-10-23',
  2015: '2015-11-11', 2016: '2016-10-30', 2017: '2017-10-19', 2018: '2018-11-07', 2019: '2019-10-27',
  2020: '2020-11-14', 2021: '2021-11-04', 2022: '2022-10-24', 2023: '2023-11-12', 2025: '2025-10-20',
  2026: '2026-11-08', 2027: '2027-10-29', 2028: '2028-10-17', 2029: '2029-11-05', 2030: '2030-10-26',
};

test('computed Diwali matches the published dates', () => {
  for (const [y, date] of Object.entries(KNOWN)) assert.strictEqual(diwali(+y), date, `Diwali ${y}`);
});

test('2024, when panchangs split between 31 Oct and 1 Nov, lands on one of them', () => {
  assert.ok(['2024-10-31', '2024-11-01'].includes(diwali(2024)));
});

test('every year up to 2100 gives a date between 15 Oct and 16 Nov', () => {
  for (let y = 2000; y <= 2100; y++) {
    const d = diwali(y);
    assert.ok(d && d >= `${y}-10-15` && d <= `${y}-11-16`, `Diwali ${y}: ${d}`);
  }
});
