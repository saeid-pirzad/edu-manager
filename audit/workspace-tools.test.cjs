"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const context = vm.createContext({
  workspace: { year: "1405-1406", term: "اول" },
  esc: (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;"),
  lastExternalBackupLabel: () => "<script>unsafe</script>",
});
for (const file of ["src/core/icons.js", "src/workspace/ui/locks-render.js"])
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "..", file), "utf8"),
    context,
  );
test("workspace tools preserve all six explicit commands and prioritize backup without inline handlers", () => {
  const html = context.workspaceToolsHtml();
  assert.deepEqual(
    [...html.matchAll(/data-workspace-action="([^"]+)"/g)].map(
      (match) => match[1],
    ),
    [
      "backups",
      "periods",
      "history",
      "review-drafts",
      "other-drafts",
      "discard-drafts",
    ],
  );
  assert.doesNotMatch(html, /\son\w+=|<script>/i);
  assert.doesNotMatch(
    html,
    /workspace-tool-label|workspace-file-status|<small>/,
  );
  assert.equal((html.match(/<button/g) || []).length, 7);
  assert.match(html, /data-header-action="settings"/);
  assert.match(html, /ابزارها و تنظیمات/);
});
test("workspace tools and advanced draft actions start collapsed with native keyboard disclosures", () => {
  const html = context.workspaceToolsHtml();
  assert.match(
    html,
    /^<details class="workspace-tools"><summary id="workspaceToolsToggle">/,
  );
  assert.match(html, /<details class="workspace-draft-tools"><summary>/);
  assert.match(html, /workspace-tool-caution/);
  assert.doesNotMatch(html, /role="menu"|<details[^>]*\sopen/);
});
