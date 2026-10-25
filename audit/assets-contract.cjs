"use strict";

// Static guard for every browser asset introduced during the incremental refactor.
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "EduManager.html"), "utf8");
const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const integrity = fs.readFileSync(path.join(root, "audit", "data-integrity.cjs"), "utf8");
const upgrade = fs.readFileSync(path.join(root, "audit", "pwa-upgrade.cjs"), "utf8");
const assets = [...html.matchAll(/<script\s+src="\.\/(assets\/scripts\/[^"?#]+)"/g)].map(
  ([, asset]) => asset,
);
assets.push(...[...html.matchAll(/<link\b[^>]*href="\.\/(assets\/styles\/[^"?#]+)"/g)].map(([, asset]) => asset));

if (!assets.length) throw Error("No external application scripts were declared.");

for (const asset of assets) {
  if (!fs.existsSync(path.join(root, asset))) throw Error(`Missing asset: ${asset}`);
  if (!worker.includes(`"${asset}"`)) throw Error(`Asset is not cached offline: ${asset}`);
  if (!integrity.includes(`"/edu-manager/${asset}"`))
    throw Error(`Integrity server does not serve: ${asset}`);
  if (!upgrade.includes(`"${asset}"`))
    throw Error(`Upgrade server does not serve: ${asset}`);
}

console.log(`Asset contract verified for ${assets.length} external assets.`);
