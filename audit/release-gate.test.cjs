"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
function workflow() {
  return fs
    .readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8")
    .replace(/\r\n/g, "\n");
}
function job(source, name) {
  const match = source.match(
    new RegExp(
      "^  " +
        name +
        ":\\n([\\s\\S]*?)(?=^  [A-Za-z_][A-Za-z0-9_-]*:|$(?![\\s\\S]))",
      "m",
    ),
  );
  assert.ok(match, "Missing workflow job: " + name);
  return match[1];
}
function steps(source) {
  return source.match(/^ {6}- [\s\S]*?(?=^ {6}- |$(?![\s\S]))/gm) || [];
}
function actionStep(source, action) {
  const match = steps(source).find((step) => step.includes("uses: " + action));
  assert.ok(match, "Missing action step: " + action);
  return match;
}
function trustedMaster(condition) {
  const expression = condition.replace(/\$\{\{|\}\}|\s/g, "");
  assert.equal(
    expression,
    "github.repository=='saeid-pirzad/edu-manager'&&github.ref=='refs/heads/master'&&github.event_name!='pull_request'",
    "only this repository's master may publish; PRs and other branches only verify",
  );
}
function condition(source) {
  const match = source.match(/^\s+if:\s*(.+)$/m);
  assert.ok(match, "Publishing requires an explicit trusted master condition");
  return match[1];
}

test("release verification and CI include the isolated complete-year backup file roundtrip", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  );
  assert.equal(
    manifest.scripts["test:annual-backup"],
    "node audit/annual-backup-scale.cjs",
  );
  assert.ok(
    manifest.scripts["check:release"]
      .split(/\s*&&\s*/)
      .includes("npm run test:annual-backup"),
    "the full-year roundtrip must stop a failed release",
  );
  const verify = job(workflow(), "verify");
  const verifyIndex = verify.indexOf("- run: npm run check:release");
  assert.ok(verifyIndex >= 0, "CI must run the same release verification");
  assert.ok(
    verify.indexOf("- run: npm run release:package") > verifyIndex,
    "packaging must follow successful verification",
  );
});

test("Pages uploads exactly the packaged application only after installation, release checks and packaging", () => {
  const source = workflow();
  const verify = job(source, "verify");
  assert.match(verify, /runs-on:\s*windows-latest/);
  const install = verify.indexOf("- run: npm ci");
  assert.match(verify, /^\s+- run: npm ci --no-audit --no-fund\s*$/m);
  const check = verify.indexOf("- run: npm run check:release");
  const pack = verify.indexOf("- run: npm run release:package");
  const upload = verify.indexOf("uses: actions/upload-pages-artifact@v4");
  assert.ok(
    install >= 0 && check > install && pack > check && upload > pack,
    "a failed install, test or package command must prevent upload",
  );
  const step = actionStep(verify, "actions/upload-pages-artifact@v4");
  trustedMaster(condition(step));
  assert.match(
    step,
    /^\s+path:\s*dist\s*$/m,
    "upload the contents of dist, never the repository root",
  );
  assert.match(step, /^\s+name:\s*github-pages\s*$/m);
  assert.match(step, /^\s+retention-days:\s*1\s*$/m);
  assert.doesNotMatch(
    source,
    /continue-on-error|always\(\)|actions\/upload-artifact|peaceiris\/actions-gh-pages|JamesIves\/github-pages-deploy-action/,
  );
});

test("Pages deployment requires the successful verification artifact and only runs for trusted master", () => {
  const source = workflow();
  const deploy = job(source, "deploy");
  assert.match(deploy, /^\s+needs:\s*verify\s*$/m);
  trustedMaster(condition(deploy));
  assert.match(deploy, /runs-on:\s*ubuntu-latest/);
  assert.match(
    deploy,
    /^\s+environment:\s*\n\s+name:\s*github-pages\s*\n\s+url:\s*\$\{\{\s*steps\.deployment\.outputs\.page_url\s*\}\}/m,
  );
  const configure = actionStep(deploy, "actions/configure-pages@v5");
  const publish = actionStep(deploy, "actions/deploy-pages@v5");
  assert.ok(deploy.indexOf(configure) < deploy.indexOf(publish));
  assert.match(publish, /^\s+(?:- )?id:\s*deployment\s*$/m);
  assert.match(publish, /^\s+artifact_name:\s*github-pages\s*$/m);
  assert.doesNotMatch(
    publish,
    /^\s+if:/m,
    "the deployment must inherit the successful job dependency",
  );
});

test("Pages grants write permissions only to deployment and does not cancel a master release midway", () => {
  const source = workflow();
  const beforeJobs = source.slice(0, source.indexOf("\njobs:"));
  const verify = job(source, "verify");
  const deploy = job(source, "deploy");
  assert.match(beforeJobs, /^permissions:\s*\n\s+contents:\s*read\s*$/m);
  assert.doesNotMatch(beforeJobs, /:\s*write\b/);
  assert.doesNotMatch(verify, /:\s*write\b/);
  for (const permission of ["pages", "id-token"])
    assert.match(
      deploy,
      new RegExp("^\\s+" + permission + ":\\s*write\\s*$", "m"),
    );
  assert.match(deploy, /^\s+contents:\s*read\s*$/m);
  assert.match(
    beforeJobs,
    /^\s+group:\s*\$\{\{\s*github\.workflow\s*\}\}-\$\{\{\s*github\.ref\s*\}\}\s*$/m,
  );
  assert.match(
    beforeJobs,
    /^\s+cancel-in-progress:\s*\$\{\{\s*github\.ref\s*!=\s*'refs\/heads\/master'\s*\}\}\s*$/m,
  );
  assert.match(
    actionStep(verify, "actions/checkout@v4"),
    /^\s+persist-credentials:\s*false\s*$/m,
  );
});
