"use strict";
const fs = require("node:fs");
const path = require("node:path");

function contentType(name) {
  if (name.endsWith(".html")) return "text/html; charset=utf-8";
  if (name.endsWith(".js")) return "application/javascript";
  if (name.endsWith(".css")) return "text/css; charset=utf-8";
  if (name.endsWith(".map")) return "application/json; charset=utf-8";
  if (name.endsWith(".webmanifest")) return "application/manifest+json";
  throw Error("Unsupported application asset: " + name);
}

function applicationFiles(root, { generated = new Set(), contents = new Map() } = {}) {
  const html = fs.readFileSync(path.join(root, "EduManager.html"), "utf8");
  const assets = [
    ...[...html.matchAll(/<script\b[^>]*\bsrc=["']\.\/(assets\/[^"'?#]+)["']/g)].map(([, name]) => name),
    ...[...html.matchAll(/<link\b[^>]*\bhref=["']\.\/(assets\/[^"'?#]+)["']/g)].map(([, name]) => name),
  ];
  if (!assets.length) throw Error("Application has no external assets");
  const files = new Map();
  for (const name of ["EduManager.html", "index.html", "app.webmanifest", "service-worker.js", ...assets]) {
    if (name.includes("..") || name.includes("\\") || path.isAbsolute(name))
      throw Error("Unsafe application asset: " + name);
    if (!generated.has(name) && !fs.statSync(path.join(root, name)).isFile()) throw Error("Missing application asset: " + name);
    if (files.has(name)) throw Error("Duplicate application asset: " + name);
    files.set(name, contentType(name));
  }
  for (const name of assets) {
    if (!/\.(js|css)$/.test(name)) continue;
    const content = contents.get(name) ?? fs.readFileSync(path.join(root, name), "utf8");
    const reference = content.match(/[#@] sourceMappingURL=([A-Za-z0-9_.-]+\.map)/);
    if (!reference) continue;
    const mapName = path.posix.join(path.posix.dirname(name), reference[1]);
    if (!generated.has(mapName) && !fs.statSync(path.join(root, mapName)).isFile()) throw Error("Missing source map: " + mapName);
    files.set(mapName, contentType(mapName));
  }
  return files;
}

module.exports = { applicationFiles, contentType };
