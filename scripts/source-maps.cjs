"use strict";
const path = require("node:path");
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function vlq(value) {
  let number = value < 0 ? -value * 2 + 1 : value * 2;
  let result = "";
  do {
    let digit = number % 32;
    number = Math.floor(number / 32);
    if (number) digit += 32;
    result += alphabet[digit];
  } while (number);
  return result;
}
module.exports = function sourceMap(output, sources, fragments, prefix) {
  const mappings = Array(prefix.split("\n").length - 1).fill("");
  let previousSource = 0, previousLine = 0;
  fragments.forEach((fragment, sourceIndex) => {
    mappings.push(""); // Generated source banner.
    const lines = fragment.split("\n").length - 1;
    for (let line = 0; line < lines; line++) {
      mappings.push("A" + vlq(sourceIndex - previousSource) + vlq(line - previousLine) + "A");
      previousSource = sourceIndex;
      previousLine = line;
    }
  });
  return JSON.stringify({
    version: 3,
    file: path.posix.basename(output),
    sources: sources.map(source => path.posix.relative(path.posix.dirname(output), source)),
    sourcesContent: fragments,
    names: [],
    mappings: mappings.join(";"),
  }) + "\n";
};
