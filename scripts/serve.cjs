"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http");
const { applicationFiles } = require("./application-files.cjs");
if (process.argv.includes("--help")) {
  console.log(
    "npm run dev\nServes the built application on 127.0.0.1:4173. Override with EDUMANAGER_PORT.",
  );
  process.exit(0);
}
const root = path.resolve(__dirname, "..");
const files = applicationFiles(root);
const port = Number(process.env.EDUMANAGER_PORT || 4173);
if (!Number.isInteger(port) || port < 0 || port > 65535)
  throw Error("Invalid EDUMANAGER_PORT");
const server = http.createServer((request, response) => {
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405);
    response.end();
    return;
  }
  let name;
  try {
    name =
      new URL(request.url, "http://localhost").pathname.slice(1) ||
      "index.html";
  } catch {
    response.writeHead(400);
    response.end();
    return;
  }
  if (!files.has(name)) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.setHeader("Content-Type", files.get(name));
  response.setHeader("Cache-Control", "no-store");
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  const stream = fs.createReadStream(path.join(root, name));
  stream.on("error", () => {
    response.statusCode = 500;
    response.end();
  });
  stream.pipe(response);
});
server.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () =>
  console.log("EduManager: http://127.0.0.1:" + server.address().port + "/"),
);
