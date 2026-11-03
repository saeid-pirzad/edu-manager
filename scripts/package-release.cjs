"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { applicationFiles } = require("./application-files.cjs");

function packageRelease(root) {
  const base = path.resolve(root);
  const output = path.join(base, "dist");
  const files = applicationFiles(base);
  const permittedDirectories = new Set();
  for (const name of files.keys()) {
    let directory = path.posix.dirname(name);
    while (directory !== ".") {
      permittedDirectories.add(directory);
      directory = path.posix.dirname(directory);
    }
  }
  // Never remove an existing directory or overwrite unexpected personal files.
  // Validate the complete destination before the first write.
  const inspect = (directory, prefix = "") => {
    const stat = fs.lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory())
      throw Error(
        "Release destination must be a plain directory: " + directory,
      );
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isSymbolicLink())
        throw Error(
          "Symbolic links are not allowed in release output: " + name,
        );
      if (entry.isDirectory() && permittedDirectories.has(name))
        inspect(path.join(directory, entry.name), name + "/");
      else if (!entry.isFile() || !files.has(name))
        throw Error("Unexpected file in dist; nothing was changed: " + name);
    }
  };
  if (fs.existsSync(output)) inspect(output);
  for (const name of files.keys()) {
    let segment = base;
    for (const part of name.split("/")) {
      segment = path.join(segment, part);
      if (fs.lstatSync(segment).isSymbolicLink())
        throw Error("Symbolic source is not a release asset: " + name);
    }
  }
  for (const name of files.keys()) {
    const target = path.join(output, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(base, name), target);
  }
  return { output, files: [...files.keys()] };
}
if (require.main === module) {
  const root = path.resolve(__dirname, "..");
  execFileSync(
    process.execPath,
    [path.join(root, "scripts/build.cjs"), "--check"],
    {
      stdio: "inherit",
    },
  );
  const result = packageRelease(root);
  console.log(
    "Packaged " + result.files.length + " application files: " + result.output,
  );
}
module.exports = { packageRelease };
