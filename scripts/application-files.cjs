"use strict";
const fs = require("node:fs");
const path = require("node:path");

function contentType(name) {
  if (name.endsWith(".html")) return "text/html; charset=utf-8";
  if (name.endsWith(".js")) return "application/javascript";
  if (name.endsWith(".css")) return "text/css; charset=utf-8";
  if (name.endsWith(".map")) return "application/json; charset=utf-8";
  if (name.endsWith(".webmanifest")) return "application/manifest+json";
  if (name.endsWith(".png")) return "image/png";
  throw Error("Unsupported application asset: " + name);
}

function assetBytes(name, content) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return contentType(name) === "image/png"
    ? bytes
    : Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"));
}

function applicationFiles(
  root,
  {
    generated = new Set(),
    contents = new Map(),
    includeSourceMaps = true,
  } = {},
) {
  const entries = ["EduManager.html"],
    assets = [];
  for (const entry of entries) {
    const html = fs.readFileSync(path.join(root, entry), "utf8"),
      references = [
        ...[
          ...html.matchAll(
            /<script\b[^>]*\bsrc=["']\.\/(assets\/[^"'?#]+)["']/g,
          ),
        ].map(([, name]) => name),
        ...[
          ...html.matchAll(
            /<link\b[^>]*\bhref=["']\.\/(assets\/[^"'?#]+)["']/g,
          ),
        ].map(([, name]) => name),
        ...[
          ...html.matchAll(/<img\b[^>]*\bsrc=["']\.\/(assets\/[^"'?#]+)["']/g),
        ].map(([, name]) => name),
      ];
    const executionReferences = references.filter(
      (name) => !name.endsWith(".png"),
    );
    if (new Set(executionReferences).size !== executionReferences.length)
      throw Error("Duplicate application asset in " + entry);
    assets.push(...references);
  }
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "app.webmanifest"), "utf8"),
  );
  if (manifest.icons !== undefined && !Array.isArray(manifest.icons))
    throw Error("Invalid application manifest icons");
  for (const icon of manifest.icons || []) {
    if (typeof icon?.src !== "string")
      throw Error("Invalid application manifest icon");
    // Older installations may keep embedded PNG icons; new external icons
    // must stay inside the same explicit local application asset allowlist.
    if (/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(icon.src)) continue;
    const reference = /^\.\/(assets\/[A-Za-z0-9_./-]+\.png)$/.exec(icon.src);
    if (!reference) throw Error("Unsupported application manifest icon");
    assets.push(reference[1]);
  }
  if (!assets.length) throw Error("Application has no external assets");
  const files = new Map();
  for (const name of [
    ...entries,
    "index.html",
    "app.webmanifest",
    "service-worker.js",
    ...new Set(assets),
  ]) {
    if (name.includes("..") || name.includes("\\") || path.isAbsolute(name))
      throw Error("Unsafe application asset: " + name);
    if (!generated.has(name) && !fs.statSync(path.join(root, name)).isFile())
      throw Error("Missing application asset: " + name);
    if (files.has(name)) throw Error("Duplicate application asset: " + name);
    files.set(name, contentType(name));
  }
  if (includeSourceMaps)
    for (const name of new Set(assets)) {
      if (!/\.(js|css)$/.test(name)) continue;
      const content =
        contents.get(name) ?? fs.readFileSync(path.join(root, name), "utf8");
      const reference = content.match(
        /[#@] sourceMappingURL=([A-Za-z0-9_.-]+\.map)/,
      );
      if (!reference) continue;
      const mapName = path.posix.join(path.posix.dirname(name), reference[1]);
      if (
        !generated.has(mapName) &&
        !fs.statSync(path.join(root, mapName)).isFile()
      )
        throw Error("Missing source map: " + mapName);
      files.set(mapName, contentType(mapName));
    }
  return files;
}

module.exports = { applicationFiles, contentType, assetBytes };
