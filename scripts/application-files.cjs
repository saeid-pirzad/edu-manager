"use strict";
const fs = require("node:fs");
const path = require("node:path");

function contentType(name) {
  if (name.endsWith(".html")) return "text/html; charset=utf-8";
  if (name.endsWith(".js")) return "application/javascript";
  if (name.endsWith(".css")) return "text/css; charset=utf-8";
  if (name.endsWith(".webmanifest")) return "application/manifest+json";
  throw Error("Unsupported application asset: " + name);
}

function applicationFiles(root, { generated = new Set() } = {}) {
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
  return files;
}

module.exports = { applicationFiles, contentType };
