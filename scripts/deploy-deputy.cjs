"use strict";
// Static deputy deployment from the same sources; never includes user data.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  vm = require("node:vm");
const { applicationFiles } = require("./application-files.cjs");
function deputyFiles(root) {
  const catalog = applicationFiles(root, { role: "deputy" }),
    files = new Map();
  for (const name of catalog.keys())
    files.set(
      name,
      fs.readFileSync(path.join(root, name), "utf8").replace(/\r\n/g, "\n"),
    );
  // Cloudflare redirects .html URLs; use the canonical root as the only app entry.
  files.set("index.html", files.get("Deputy.html"));
  files.delete("Deputy.html");
  files.set("_redirects", "/Deputy / 302\n/Deputy.html / 302\n");
  const manifest = JSON.parse(files.get("deputy.webmanifest"));
  manifest.scope = "./";
  manifest.start_url = "./";
  files.set("deputy.webmanifest", JSON.stringify(manifest, null, 2) + "\n");
  files.set(
    "404.html",
    '<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>کارتابل معاون</title><p>این صفحه در کارتابل معاون وجود ندارد.</p><a href="/">بازکردن کارتابل معاون</a></html>\n',
  );
  files.set(
    "_headers",
    "/\n  Cache-Control: no-cache\n/service-worker.js\n  Cache-Control: no-cache\n/deputy.webmanifest\n  Cache-Control: no-cache\n/Deputy.html\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n",
  );
  let worker = files.get("service-worker.js");
  const entry = 'const APP = new URL("EduManager.html", BASE).href;';
  if (!worker.includes(entry))
    throw Error("Worker entry changed; review deputy deployment generator.");
  worker = worker
    .replace(entry, 'const APP = new URL("./", BASE).href;')
    .replace(
      'new URL("EduManager.html", BASE).pathname',
      'new URL("Deputy.html", BASE).pathname',
    );

  worker = worker
    .replace(
      'url.pathname === new URL("Deputy.html", BASE).pathname;',
      '[new URL("Deputy.html", BASE).pathname,new URL("Deputy", BASE).pathname].includes(url.pathname);',
    )
    .replace(
      'deputyNavigation ? new URL("Deputy.html", BASE).href : navigation ? APP : event.request',
      "navigation || deputyNavigation ? APP : event.request",
    );
  const cached = [...files.keys()]
    .filter(
      (name) =>
        !["service-worker.js", "_headers", "_redirects", "404.html"].includes(
          name,
        ),
    )
    .map((name) => (name === "index.html" ? "./" : name));

  worker = worker
    .replace(
      /const VERSION = "[^"]+";/,
      'const VERSION = "__DEPLOYMENT_VERSION__";',
    )
    .replace(
      /const FILES\s*=\s*\[[\s\S]*?\];/,
      "const FILES = " + JSON.stringify(cached, null, 2) + ";",
    );
  const hash = crypto.createHash("sha256");
  for (const name of [...cached].sort())
    hash
      .update(name + "\0")
      .update(files.get(name === "./" ? "index.html" : name));
  hash
    .update(worker)
    .update(files.get("_headers"))
    .update(files.get("_redirects"));

  worker = worker.replace(
    "__DEPLOYMENT_VERSION__",
    hash.digest("hex").slice(0, 16),
  );
  new vm.Script(worker);
  files.set("service-worker.js", worker);
  return files;
}
function writeDeployment(root) {
  const parent = path.resolve(root, "dist"),
    target = path.resolve(parent, "deputy");
  // Delete only this generated deployment, rejecting symlinked output parents.
  if (target !== path.join(path.resolve(root), "dist", "deputy"))
    throw Error("Unsafe deployment path.");
  for (const directory of [parent, target])
    if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink())
      throw Error("Deployment output must not be a symlink.");
  const files = deputyFiles(root);
  fs.rmSync(target, { recursive: true, force: true });
  for (const [name, content] of files) {
    const file = path.resolve(target, name);
    if (!file.startsWith(target + path.sep))
      throw Error("Unsafe deployment asset.");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf8");
  }

  let archive = null;
  if (process.platform === "win32") {
    archive = path.join(parent, "edu-manager-deputy.zip");
    if (fs.existsSync(archive) && fs.lstatSync(archive).isSymbolicLink())
      throw Error("Deployment archive must not be a symlink.");
    // Paths are passed as environment data, never interpolated into shell code.
    require("node:child_process").execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Compress-Archive -Path (Join-Path $env:EDU_DEPLOYMENT_DIRECTORY '*') -DestinationPath $env:EDU_DEPLOYMENT_ARCHIVE -Force",
      ],
      {
        windowsHide: true,
        env: {
          ...process.env,
          EDU_DEPLOYMENT_DIRECTORY: target,
          EDU_DEPLOYMENT_ARCHIVE: archive,
        },
        stdio: "pipe",
      },
    );
  }

  return { target, count: files.size, archive };
}
module.exports = { deputyFiles, writeDeployment };
if (require.main === module) {
  const result = writeDeployment(path.resolve(__dirname, ".."));
  console.log(
    "Deputy deployment ready: " +
      result.target +
      " (" +
      result.count +
      " static files; no user data).",
  );
}
