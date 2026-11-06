"use strict";

// Inspect the wide-ink scanlines emitted by the native PDF raster audit.
// A light header contributes three thin rules; a dark header contributes two
// filled bands separated by its light row border. Both must be two rows high.
function detectRepeatedTableHeaders(ink) {
  const bands = [];
  for (const row of ink.horizontalRules) {
    const previous = bands.at(-1);
    // A single missing scanline can be the real border between two header
    // rows at CI display scaling. Never bridge it into one solid band.
    if (previous && row <= previous.end + 1) previous.end = row;
    else bands.push({ start: row, end: row });
  }
  const height = (band) => band.end - band.start + 1;
  const rowHeight = (value) => value >= 30 && value <= 90;
  const atPageTop =
    bands.length > 0 && Math.abs(bands[0].start - ink.topMargin) <= 4;
  const outlined =
    atPageTop &&
    bands.length >= 3 &&
    bands.slice(0, 3).every((band) => height(band) <= 4) &&
    rowHeight(bands[1].start - bands[0].start) &&
    rowHeight(bands[2].start - bands[1].start);
  const filled =
    atPageTop &&
    bands.length >= 2 &&
    bands.slice(0, 2).every((band) => rowHeight(height(band))) &&
    bands[1].start - bands[0].end >= 2 &&
    bands[1].start - bands[0].end <= 5;
  return {
    rules: bands.slice(0, 4).map((band) => band.start),
    headerBands: bands.slice(0, 3),
    method: outlined ? "outlined" : filled ? "filled" : "missing",
    twoHeaderRows: outlined || filled,
  };
}

module.exports = { detectRepeatedTableHeaders };
