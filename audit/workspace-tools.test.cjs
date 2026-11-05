"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const context = vm.createContext({
    ready: true,
    fileMode: false,
    blocked: false,
    resetBusy: false,
    connectionRetired: false,
    periodLoading: false,
    isAuthenticated: false,
    db: { settings: { password: "" } },
    drafts: new Map(),
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
  return context;
}

test("workspace tools retain periods, undo and settings without a duplicate backup entry", () => {
  const html = fixture().workspaceToolsHtml();
  assert.deepEqual(
    [...html.matchAll(/data-workspace-action="([^"]+)"/g)].map(
      (match) => match[1],
    ),
    ["periods", "undo"],
  );
  assert.doesNotMatch(html, /\son\w+=|<script>/i);
  assert.doesNotMatch(
    html,
    /workspace-tool-label|workspace-file-status|<small>/,
  );
  assert.equal((html.match(/<button/g) || []).length, 3);
  assert.doesNotMatch(html, /data-workspace-action="open-wipe"/);
  assert.doesNotMatch(html, /data-workspace-action="backups"/);
  assert.doesNotMatch(html, /data-workspace-action="history"|تاریخچه تغییرات/);
  assert.match(html, /data-header-action="settings"/);
  assert.match(html, /ابزارها و تنظیمات/);
});
test("workspace tools start collapsed with one native keyboard disclosure", () => {
  const html = fixture().workspaceToolsHtml();
  assert.match(
    html,
    /^<details class="workspace-tools"><summary id="workspaceToolsToggle">/,
  );
  assert.equal((html.match(/<details\b/g) || []).length, 1);
  assert.doesNotMatch(
    html,
    /workspace-draft-|workspace-tool-caution|review-drafts|other-drafts|discard-drafts/,
  );
  assert.doesNotMatch(html, /role="menu"|<details[^>]*\sopen/);
});

test("ordinary pending grades do not add a draft recovery action", () => {
  const context = fixture();
  assert.equal(context.draftReviewActionHtml(), "");
  context.drafts.set("pending-grade", { value: "18", error: "Unsaved input" });
  assert.equal(context.draftReviewActionHtml(), "");
});

test("a usable workspace exposes one review action only for grades requiring review", () => {
  const context = fixture();
  context.drafts.set("conflicting-grade", { value: "18", review: true });
  const html = context.draftReviewActionHtml();
  assert.match(html, /data-workspace-action="review-drafts"/);
  assert.equal((html.match(/<button\b/g) || []).length, 1);
  assert.doesNotMatch(
    html,
    /workspace-tools|workspace-draft-|other-drafts|discard-drafts/,
  );
  context.db.settings.password = "protected";
  assert.equal(context.draftReviewActionHtml(), "");
  context.isAuthenticated = true;
  assert.match(
    context.draftReviewActionHtml(),
    /data-workspace-action="review-drafts"/,
  );
});

test("unavailable or stale workspaces never expose a draft review action", () => {
  for (const [flag, value] of [
    ["ready", false],
    ["fileMode", true],
    ["blocked", true],
    ["resetBusy", true],
    ["connectionRetired", true],
    ["periodLoading", true],
  ]) {
    const context = fixture();
    context.drafts.set("conflicting-grade", { value: "18", review: true });
    context[flag] = value;
    assert.equal(context.draftReviewActionHtml(), "", flag);
  }
});
