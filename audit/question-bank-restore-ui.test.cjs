"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const settle = () => new Promise((resolve) => setImmediate(resolve));
function fixture({
  picker = true,
  active = true,
  editorDuringRestore = false,
} = {}) {
  const nodes = [],
    events = [],
    previews = [],
    restores = [];
  let editorPending = false,
    fileBusy = false,
    open,
    finishPreview;
  const document = { activeElement: null };
  function createElement(tag) {
    const node = {
      tag,
      children: [],
      dataset: {},
      attributes: {},
      className: "",
      value: "",
      isConnected: true,
      clicks: 0,
      append(...items) {
        for (const item of items) {
          item.remove();
          item.parent = this;
          item.isConnected = this.isConnected;
          this.children.push(item);
        }
      },
      prepend(...items) {
        this.append(...items);
        this.children.unshift(...this.children.splice(-items.length));
      },
      remove() {
        if (this.parent)
          this.parent.children = this.parent.children.filter(
            (item) => item !== this,
          );
        this.parent = null;
        this.isConnected = false;
      },
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
      removeAttribute(name) {
        delete this.attributes[name];
      },
      insertAdjacentHTML() {},
      addEventListener() {},
      focus() {
        document.activeElement = this;
      },
      click() {
        this.clicks++;
        return this.onclick?.();
      },
      querySelector(selector) {
        const descendants = (item) =>
          item.children.flatMap((child) => [child, ...descendants(child)]);
        return (
          descendants(this).find((item) => {
            if (selector.startsWith("#")) return item.id === selector.slice(1);
            if (selector.startsWith("."))
              return item.className.split(" ").includes(selector.slice(1));
            const action = selector.match(
              /^\[data-backup-file-action="(.*)"\]$/,
            );
            return (
              action && item.attributes["data-backup-file-action"] === action[1]
            );
          }) || null
        );
      },
    };
    node.classList = {
      add(...names) {
        node.className += " " + names.join(" ");
      },
      remove(...names) {
        node.className = node.className
          .split(" ")
          .filter((name) => !names.includes(name))
          .join(" ");
      },
      contains(name) {
        return node.className.split(" ").includes(name);
      },
    };
    if (tag === "template") {
      const automatic = createElement("details");
      for (const id of [
        "questionBankFileSummary",
        "questionBankFileStatus",
        "questionBankFileFallback",
      ]) {
        const child = createElement("p");
        child.id = id;
        automatic.append(child);
      }
      for (const action of ["choose", "save", "stop"]) {
        const child = createElement("button");
        child.setAttribute("data-backup-file-action", action);
        automatic.append(child);
      }
      node.content = { firstElementChild: automatic };
    }
    nodes.push(node);
    return node;
  }
  document.createElement = createElement;
  const preview = Object.freeze({
    name: "Classyar-QuestionBank(2).json",
    counts: { courses: 1, questions: 2, exams: 3 },
    connectable: picker,
  });
  const service = {
    supported: () => true,
    state: () => ({ state: fileBusy ? "busy" : "inactive", connected: false }),
    subscribe(fn) {
      fn(this.state());
      return () => {};
    },
    init: async () => {},
    previewRestore(source, options) {
      previews.push({ source, options });
      return finishPreview
        ? new Promise((resolve) => {
            finishPreview = () => resolve(preview);
          })
        : Promise.resolve(preview);
    },
    async restore(value, options) {
      restores.push({ preview: value, options });
      // Production sync emits busy before it rechecks the UI lifetime guard.
      // The global pending API includes this file operation; editor state does
      // not. A real editor still invalidates the owner during that interval.
      fileBusy = true;
      if (editorDuringRestore) editorPending = true;
      const live = options.isCurrent();
      fileBusy = false;
      if (!live) throw Error("source write cancelled by editor or lifetime");
      return {
        restored: true,
        connected: picker,
        active,
        message: active
          ? "بازیابی انجام شد؛ ذخیره در همین فایل فعال است."
          : "بازیابی انجام شد؛ ذخیرهٔ خودکار هنوز فعال نیست.",
      };
    },
  };
  const context = vm.createContext({
    document,
    Intl,
    Event,
    EduQuestionBank: {},
    EduQuestionBankRepository: {},
    EduQuestionBankUI: {
      hasEditorPendingChanges: () => editorPending,
      hasPendingChanges: () => editorPending || fileBusy,
    },
    EduQuestionBankFileBackup: { service },
    EduQuestionBankBackupShare: {},
    EduBackupAutomaticView: {
      html: () => "",
      summaryHtml: () => "",
      noticeHtml: () => "",
    },
    EduIcons: { html: () => "" },
    dispatchEvent: (event) => events.push(event.type),
    isSecureContext: true,
    ...(picker ? { showOpenFilePicker: (...args) => open(...args) } : {}),
  });
  vm.runInContext(
    fs.readFileSync("src/features/question-bank/backup-ui.js", "utf8"),
    context,
  );
  const parent = createElement("main"),
    dispose = context.EduQuestionBankBackupUI.mount(parent);
  return {
    nodes,
    events,
    previews,
    restores,
    preview,
    dispose,
    input: nodes.find((node) => node.tag === "input"),
    restore: nodes.find((node) =>
      node.className.split(" ").includes("qb-backup-restore"),
    ),
    message: nodes.find((node) => node.className === "qb-backup-message"),
    confirmation: () =>
      nodes.findLast(
        (node) => node.className === "qb-backup-confirm" && node.parent,
      ),
    accept() {
      this.confirmation().children.at(-1).children[1].click();
    },
    cancel() {
      this.confirmation().children.at(-1).children[0].click();
    },
    open: (action) => {
      open = action;
    },
    pendingEditor: () => {
      editorPending = true;
    },
    holdPreview: () => {
      finishPreview = true;
    },
    finishPreview: () => finishPreview(),
  };
}

test("bank restore opens a handle in the click and confirms before restoring and continuing on that exact source", async () => {
  const f = fixture(),
    handle = { name: "Classyar-QuestionBank(2).json", kind: "file" };
  let clicked = false;
  f.open((options) => {
    clicked = true;
    assert.equal(options.multiple, false);
    return Promise.resolve([handle]);
  });
  f.restore.click();
  assert.equal(clicked, true);
  assert.equal(f.input.clicks, 0);
  await settle();
  assert.equal(f.previews[0].source, handle);
  assert.equal(f.restores.length, 0);
  assert.match(
    f.confirmation().children[1].textContent,
    /ادامهٔ ذخیره روی همین فایل/,
  );
  f.accept();
  await settle();
  assert.equal(f.restores[0].preview, f.preview);
  assert.equal(f.restores[0].options.isCurrent(), true);
  assert.deepEqual(f.events, ["edu-question-bank-restored"]);
  assert.match(f.message.textContent, /همین فایل فعال/);
  assert.equal(f.message.attributes.role, "status");
});

test("picker cancellation leaves both restoration and the fallback file input untouched", async () => {
  const f = fixture();
  f.open(() =>
    Promise.reject(Object.assign(Error("cancelled"), { name: "AbortError" })),
  );
  f.restore.click();
  await settle();
  assert.equal(f.previews.length, 0);
  assert.equal(f.restores.length, 0);
  assert.equal(f.input.clicks, 0);
  assert.equal(f.message.hidden, true);
});

test("fallback input explicitly previews restore-only behavior and reports success without claiming autosave", async () => {
  const f = fixture({ picker: false, active: false }),
    file = { name: "Classyar-QuestionBank.json" };
  f.restore.click();
  assert.equal(f.input.clicks, 1);
  f.input.files = [file];
  const pending = f.input.onchange();
  await settle();
  assert.equal(f.previews[0].source, file);
  assert.match(f.confirmation().children[1].textContent, /فقط بازیابی می‌شود/);
  f.accept();
  await pending;
  assert.equal(f.restores.length, 1);
  assert.match(f.message.textContent, /هنوز فعال نیست/);
  assert.equal(f.message.attributes.role, "status");
  assert.equal(f.input.value, "");
});

test("cancelling the bank replacement confirmation never invokes restore or changes connection", async () => {
  const f = fixture();
  f.open(() => Promise.resolve([{ kind: "file" }]));
  f.restore.click();
  await settle();
  f.cancel();
  await settle();
  assert.equal(f.restores.length, 0);
  assert.deepEqual(f.events, []);
});

test("retiring a panel during a source preview cannot publish a confirmation or restore data", async () => {
  const f = fixture();
  f.holdPreview();
  f.open(() => Promise.resolve([{ kind: "file" }]));
  f.restore.click();
  await settle();
  f.dispose();
  f.finishPreview();
  await settle();
  assert.equal(f.previews[0].options.isCurrent(), false);
  assert.equal(f.confirmation(), undefined);
  assert.equal(f.restores.length, 0);
});

test("a new unsaved editor after preview blocks restoration in the final confirmation click", async () => {
  const f = fixture();
  f.open(() => Promise.resolve([{ kind: "file" }]));
  f.restore.click();
  await settle();
  f.pendingEditor();
  f.accept();
  await settle();
  assert.equal(f.restores.length, 0);
  assert.match(f.message.textContent, /ویرایش ذخیره‌نشده/);
  assert.equal(f.message.attributes.role, "alert");
});

test("the restore's own busy file status never invalidates its source write guard", async () => {
  const f = fixture();
  f.open(() => Promise.resolve([{ kind: "file" }]));
  f.restore.click();
  await settle();
  f.accept();
  await settle();
  assert.deepEqual(f.events, ["edu-question-bank-restored"]);
  assert.match(f.message.textContent, /همین فایل فعال/);
  assert.equal(f.message.attributes.role, "status");
});

test("a real editor becoming dirty during the source write still invalidates restore's guard", async () => {
  const f = fixture({ editorDuringRestore: true });
  f.open(() => Promise.resolve([{ kind: "file" }]));
  f.restore.click();
  await settle();
  f.accept();
  await settle();
  assert.deepEqual(f.events, []);
  assert.equal(f.message.attributes.role, "alert");
  assert.match(f.message.textContent, /source write cancelled/);
});

test("actual bank UI exposes editor state separately while preserving the combined pending-operation API", () => {
  const context = vm.createContext({
    EduQuestionBank: {},
    EduQuestionBankRepository: {},
    EduQuestionBankFileBackup: {
      service: { state: () => ({ state: "busy" }) },
    },
    EduQuestionBankPaperUI: { create: () => ({}) },
    addEventListener() {},
  });
  const source = fs.readFileSync("src/features/question-bank/ui.js", "utf8");
  vm.runInContext(
    source.replace(
      "  root.EduQuestionBankUI = {",
      "  root.setEditorPending = value => { pendingChanges = () => value; };\n  root.EduQuestionBankUI = {",
    ),
    context,
  );
  assert.equal(context.EduQuestionBankUI.hasEditorPendingChanges(), false);
  assert.equal(context.EduQuestionBankUI.hasPendingChanges(), true);
  context.setEditorPending(true);
  assert.equal(context.EduQuestionBankUI.hasEditorPendingChanges(), true);
  assert.equal(context.EduQuestionBankUI.hasPendingChanges(), true);
});
