"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const source = fs.readFileSync(
  path.join(__dirname, "../src/workspace/ui/actions.js"),
  "utf8",
);

test("workspace source cannot reintroduce executable inline markup handlers", () => {
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (file.endsWith(".js"))
        assert.doesNotMatch(
          fs.readFileSync(file, "utf8"),
          /\son(?:click|submit|change|input|blur)\s*=/i,
          file,
        );
    }
  };
  walk(path.join(__dirname, "../src/workspace"));
});
function fixture() {
  const calls = [],
    errors = [],
    listeners = new Map();
  const context = vm.createContext({
    document: {
      addEventListener: (type, handler) => listeners.set(type, handler),
    },
    openPeriods: () => calls.push("periods"),
    saveStudent: () => calls.push("student"),
    switchPeriod: (key) => calls.push(key),
    openHistoryV24: (limit) => calls.push(limit),
    exportFullBackup: async () => {
      throw Error("export rejected");
    },
    handleError: (error) => errors.push(error.message),
  });
  vm.runInContext(source, context);
  context.installWorkspaceActions();
  const element = (dataset, options = {}) => ({
    dataset,
    matches: (selector) =>
      selector === ":disabled" ? !!options.disabled : true,
    closest: (selector) =>
      selector === "[inert]" ? !!options.inert : !options.outside,
  });
  return {
    calls,
    errors,
    click(action, dataset = {}, options = {}) {
      listeners.get("click")({
        target: {
          closest: () =>
            element({ workspaceAction: action, ...dataset }, options),
        },
      });
    },
    submit(action) {
      const event = {
        target: element({ workspaceSubmit: action }),
        prevented: false,
        preventDefault() {
          this.prevented = true;
        },
      };
      listeners.get("submit")(event);
      return event.prevented;
    },
  };
}
test("workspace actions dispatch explicit commands, parameters and private form submissions", () => {
  const f = fixture();
  f.click("periods");
  f.click("switch-period", { key: "workspace-one" });
  f.click("history-more", { limit: "150" });
  assert.equal(f.submit("save-student"), true);
  assert.deepEqual(f.calls, ["periods", "workspace-one", 150, "student"]);
});
test("workspace dispatch ignores unknown, disabled, inert and outside controls", () => {
  const f = fixture();
  for (const action of ["constructor", "toString", "eval", "openPeriods()"])
    f.click(action);
  for (const options of [
    { disabled: true },
    { inert: true },
    { outside: true },
  ])
    f.click("periods", {}, options);
  assert.equal(f.submit("unknown"), true);
  assert.deepEqual(f.calls, []);
});
test("workspace dispatch rejects invalid numeric parameters and handles async failures", async () => {
  const f = fixture();
  f.click("history-more", { limit: "1;alert(1)" });
  f.click("export-full");
  await new Promise(setImmediate);
  assert.equal(f.errors.length, 2);
  assert.equal(f.errors[1], "export rejected");
  assert.deepEqual(f.calls, []);
});
