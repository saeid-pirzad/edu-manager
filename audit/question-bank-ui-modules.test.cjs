"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function load(context, ...names) {
  for (const name of names)
    vm.runInContext(
      fs.readFileSync(`src/features/question-bank/${name}.js`, "utf8"),
      context,
    );
}

function dom() {
  const nodes = [];
  const document = {
    activeElement: null,
    createTextNode: (text) => el("#text", text),
  };
  function el(tag, text = "", className = "") {
    const node = {
      tag,
      textContent: text,
      className,
      children: [],
      dataset: {},
      attributes: {},
      style: {
        setProperty(name, value) {
          this[name] = value;
        },
      },
      value: "",
      isConnected: true,
      validity: { valid: true },
      get childNodes() {
        return this.children;
      },
      get firstChild() {
        return this.children[0];
      },
      get lastElementChild() {
        return this.children.at(-1);
      },
      get parentElement() {
        return this.parent;
      },
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
      replaceChildren(...items) {
        this.children.forEach((item) => {
          item.parent = null;
        });
        this.children = [];
        this.append(...items);
      },
      remove() {
        if (this.parent)
          this.parent.children = this.parent.children.filter(
            (item) => item !== this,
          );
        this.parent = null;
        this.isConnected = false;
      },
      replaceWith(item) {
        const parent = this.parent;
        const index = parent.children.indexOf(this);
        this.remove();
        item.remove();
        item.parent = parent;
        parent.children.splice(index, 0, item);
      },
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
      insertAdjacentHTML() {},
      querySelector(selector) {
        return (
          descendants(this).find((item) =>
            item.className.split(" ").includes(selector.slice(1)),
          ) || null
        );
      },
      focus() {
        document.activeElement = this;
      },
      select() {},
      setCustomValidity(value) {
        this.validationMessage = value;
        this.validity.valid = !value;
      },
      reportValidity() {
        return [this, ...descendants(this)].every(
          (item) => item.validity.valid && (!item.required || item.value),
        );
      },
    };
    node.classList = {
      add: (...names) => {
        node.className += " " + names.join(" ");
      },
    };
    nodes.push(node);
    return node;
  }
  document.createElement = el;
  return { el, document, nodes };
}
function descendants(node) {
  return node.children.flatMap((child) => [child, ...descendants(child)]);
}

function formFixture() {
  const view = dom(),
    inputs = [],
    errors = [],
    saved = [],
    previews = [];
  let renders = 0,
    importOptions;
  const context = vm.createContext({
    document: view.document,
    structuredClone,
    TextEncoder,
    crypto: { randomUUID: () => "new-id" },
    EduIcons: { html: () => "" },
    initShamsiPickers() {},
    requestAnimationFrame() {},
    EduQuestionBankImportUI: {
      mount(options) {
        importOptions = options;
      },
    },
  });
  load(context, "domain", "ui-forms", "ui-builder");
  const bank = context.EduQuestionBank.empty();
  bank.courses.push({ id: "course", title: "درس", structure: "chapter" });
  bank.units.push({ id: "unit", courseId: "course", title: "فصل اول" });
  const state = {
    bank,
    courseId: "course",
    unitId: "unit",
    tab: "questions",
    search: "query",
    questionType: "mcq",
    page: 2,
    alive: true,
    dirty: false,
    busy: false,
    confirmation: null,
  };
  const content = view.el("div");
  function field(parent, label, value = "", tag = "input") {
    const wrapper = view.el("label", label),
      input = view.el(tag);
    wrapper.append(view.document.createTextNode(label), input);
    input.value = value;
    parent.append(wrapper);
    inputs.push({ label, input });
    return input;
  }
  function button(label, onclick, parent) {
    const node = view.el("button", label);
    node.onclick = onclick;
    parent.append(node);
    return node;
  }
  const deps = {
    state,
    D: context.EduQuestionBank,
    el: view.el,
    field,
    button,
    contextAction: button,
    select(parent, label, entries, value = "") {
      const input = field(parent, label, value, "select");
      input.entries = entries;
      return input;
    },
    number: (value) =>
      new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(
        value,
      ),
    discard: (action) => action(),
    render: () => {
      renders++;
    },
    clearTransientMessage() {},
    closeOwnedCalendar() {},
    confirmAction(label, action) {
      action();
    },
    async commit(next, options) {
      if (deps.onCommit) return deps.onCommit(next, options);
      saved.push(next);
      state.bank = next;
      return true;
    },
    async mutate(action) {
      const next = structuredClone(state.bank);
      action(next);
      saved.push(next);
      state.bank = next;
      renders++;
    },
    unitLabel: () => "فصل",
    error: (error) => errors.push(error),
    content,
    tabScopes: { builder: { unitIds: [] } },
    preview: (exam) => previews.push(exam),
    questionCountsByUnit(questions, units) {
      return new Map(
        units.map((unit) => [
          unit.id,
          {
            total: questions.filter((q) => q.unitId === unit.id).length,
            types: Object.fromEntries(
              Object.keys(context.EduQuestionBank.types).map((type) => [
                type,
                questions.filter((q) => q.unitId === unit.id && q.type === type)
                  .length,
              ]),
            ),
          },
        ]),
      );
    },
  };
  const forms = context.EduQuestionBankFormsUI.create(deps);
  const builder = context.EduQuestionBankBuilderUI.create({
    ...deps,
    ...forms,
  });
  return {
    ...view,
    state,
    content,
    forms,
    builder,
    errors,
    saved,
    previews,
    deps,
    input: (label) => inputs.findLast((entry) => entry.label === label).input,
    form: () => view.nodes.findLast((node) => node.tag === "form"),
    submit: () =>
      view.nodes
        .findLast((node) => node.tag === "form")
        .onsubmit({ preventDefault() {} }),
    renders: () => renders,
    importOptions: () => importOptions,
  };
}

test("bank coordinator retains its public API and inactive lifecycle behavior", async () => {
  let fileState = "active",
    opened = 0;
  const events = [];
  const context = vm.createContext({
    EduQuestionBankRepository: {},
    EduQuestionBankFileBackup: {
      service: { state: () => ({ state: fileState }) },
    },
    addEventListener: (name, callback) => events.push([name, callback]),
    goQuestionBank: () => {
      opened++;
    },
  });
  load(context, "domain", "ui-paper", "ui-forms", "ui-builder", "ui");
  const ui = context.EduQuestionBankUI;
  assert.deepEqual(
    Object.keys(ui).sort(),
    [
      "open",
      "mount",
      "isMounted",
      "isPageActive",
      "isPreviewActive",
      "requestLeave",
      "dispose",
      "updateLayout",
      "preserveForRender",
      "refreshAfterRestore",
      "sheet",
      "print",
      "previewText",
      "hasEditorPendingChanges",
      "hasPendingChanges",
    ].sort(),
  );
  for (const method of [
    "isMounted",
    "isPageActive",
    "isPreviewActive",
    "hasEditorPendingChanges",
    "hasPendingChanges",
  ])
    assert.equal(ui[method](), false);
  assert.equal(ui.open(), undefined);
  assert.equal(opened, 1);
  let left = 0;
  assert.equal(
    ui.requestLeave(() => left++),
    true,
  );
  assert.equal(left, 1);
  assert.equal(await ui.mount(null), undefined);
  assert.equal(await ui.refreshAfterRestore(), true);
  for (const method of ["dispose", "updateLayout", "preserveForRender"])
    assert.equal(ui[method](), undefined);
  fileState = "busy";
  assert.equal(ui.hasPendingChanges(), true);
  assert.equal(ui.hasEditorPendingChanges(), false);
  assert.equal(events[0][0], "edu-question-bank-restored");
  assert.doesNotThrow(events[0][1]);
});

test("question editor preserves drafts per type, multiline options, localized scores and submit guards", async () => {
  const f = formFixture();
  f.forms.editQuestion();
  assert.equal(f.form().dataset.qbEditor, "question");
  assert.equal(f.form().noValidate, true);
  assert.equal(f.document.activeElement, f.input("متن سؤال"));
  f.input("متن سؤال").value = "خروجی چیست؟\nconsole.log(1);";
  const options = ["const a = 1;\nconsole.log(a);", "دو", "سه", "چهار"];
  options.forEach((value, index) => {
    f.input(`گزینه ${index + 1}`).value = value;
  });
  f.input("پاسخ صحیح").value = "0";
  const type = f.input("نوع سؤال");
  type.value = "boolean";
  type.onchange();
  f.input("پاسخ صحیح").value = "false";
  type.value = "mcq";
  type.onchange();
  assert.equal(f.input("گزینه 1").tag, "textarea");
  assert.equal(f.input("گزینه 1").value, options[0]);
  assert.equal(f.input("پاسخ صحیح").value, "0");
  f.input("بارم").value = "۱٫۲۵";
  for (const [name, value] of [
    ["busy", true],
    ["alive", false],
    ["confirmation", {}],
  ]) {
    const previous = f.state[name];
    f.state[name] = value;
    await f.submit();
    f.state[name] = previous;
    assert.equal(f.saved.length, 0, name);
  }
  await f.submit();
  assert.equal(f.errors.length, 0);
  assert.equal(f.saved[0].questions[0].score, 125);
  assert.equal(f.saved[0].questions[0].answer, 0);
  assert.deepEqual(Array.from(f.saved[0].questions[0].options), options);
  type.value = "boolean";
  type.onchange();
  assert.equal(f.input("پاسخ صحیح").value, "false");
});

test("question editor rejects visually duplicated Persian choices without committing", async () => {
  const f = formFixture();
  f.forms.editQuestion();
  f.input("متن سؤال").value = "پاسخ را انتخاب کنید؟";
  ["کتاب", "كتاب", "پاسخ سوم", "پاسخ چهارم"].forEach((value, index) => {
    f.input(`گزینه ${index + 1}`).value = value;
  });
  f.input("پاسخ صحیح").value = "0";
  await f.submit();
  assert.equal(f.saved.length, 0);
  assert.match(f.errors[0].message, /چهار پاسخ متمایز/);
});

test("unit editor reads live course and bank state when its deferred submit runs", async () => {
  const f = formFixture();
  f.forms.manageUnit();
  f.input("عنوان فصل").value = "  فصل تازه  ";
  f.state.bank = {
    ...f.state.bank,
    courses: [...f.state.bank.courses, { id: "later", title: "دوم" }],
  };
  f.state.courseId = "later";
  await f.submit();
  assert.equal(f.saved[0].courses.length, 2);
  assert.equal(f.saved[0].units.at(-1).courseId, "later");
  assert.equal(f.saved[0].units.at(-1).title, "فصل تازه");
  assert.equal(f.state.unitId, "new-id");
  assert.equal(f.state.search, "");
  assert.equal(f.state.page, 0);
});

test("import callbacks preserve destination guards, pending state and scoped commit forwarding", async () => {
  const f = formFixture();
  f.forms.importQuestions();
  const options = f.importOptions();
  assert.equal(options.isCurrent(), true);
  options.onPending(true);
  assert.equal(f.state.dirty, true);
  f.state.unitId = "other";
  assert.equal(options.isCurrent(), false);
  f.state.unitId = "unit";
  f.state.alive = false;
  assert.equal(options.isCurrent(), false);
  f.state.alive = true;
  const guard = () => false;
  let forwarded;
  f.deps.onCommit = async (next, config) => {
    forwarded = config.isCurrent;
    return false;
  };
  await options.onSave(f.state.bank, guard);
  assert.equal(forwarded, guard);
  assert.equal(f.renders(), 0);
  options.onClose();
  assert.equal(f.state.dirty, false);
  assert.equal(f.renders(), 1);
});

test("builder preserves section selection, capacity validity and generated exam submission", async () => {
  const f = formFixture();
  f.state.bank.questions.push({
    id: "question",
    unitId: "unit",
    type: "essay",
    text: "پاسخ دهید؟",
    answer: "پاسخ",
    explanation: "",
    score: 100,
  });
  f.builder.builder(f.content);
  assert.equal(f.form().dataset.qbEditor, "exam");
  const all = f.nodes.find(
    (node) => node.tag === "button" && node.textContent === "انتخاب همه",
  );
  all.onclick();
  assert.equal(f.state.dirty, true);
  assert.deepEqual(Array.from(f.deps.tabScopes.builder.unitIds), ["unit"]);
  f.input("تعداد تشریحی").value = "۲";
  f.input("تعداد تشریحی").oninput();
  assert.match(f.input("تعداد تشریحی").validationMessage, /فقط ۱ سؤال/);
  f.input("تعداد تشریحی").value = "۱";
  f.input("تعداد تشریحی").oninput();
  f.input("نمرهٔ کل آزمون").value = "۱";
  f.input("نمرهٔ کل آزمون").oninput();
  f.input("عنوان آزمون").value = "آزمون نمونه";
  await f.submit();
  assert.equal(f.errors.length, 0);
  assert.equal(f.saved.length, 1);
  assert.equal(f.previews[0].title, "آزمون نمونه");
  assert.equal(f.previews[0].questions.length, 1);
  assert.equal(f.previews[0].questions[0].text, "پاسخ دهید؟");
});

function paperFixture({ fontError, stylesheetError } = {}) {
  const view = dom(),
    frames = [],
    calls = [],
    timers = [];
  view.document.body = view.el("body");
  view.document.querySelectorAll = () => [
    { cloneNode: () => ({ stylesheet: true }) },
  ];
  function el(tag, ...args) {
    const node = view.el(tag, ...args);
    if (tag !== "iframe") return node;
    frames.push(node);
    const head = [];
    node.contentDocument = {
      documentElement: {},
      body: view.el("body"),
      createElement: view.el,
      head: {
        append(copy) {
          head.push(copy);
          if (copy.stylesheet)
            Promise.resolve().then(() =>
              stylesheetError ? copy.onerror() : copy.onload(),
            );
        },
      },
      styles: head,
      importNode(sheet, deep) {
        assert.equal(deep, true);
        return sheet;
      },
      fonts: {
        load(value) {
          calls.push(["font", value]);
          return fontError ? Promise.reject(fontError) : Promise.resolve();
        },
        ready: Promise.resolve(),
      },
    };
    const listeners = {};
    node.contentWindow = {
      listeners,
      requestAnimationFrame(callback) {
        calls.push(["frame"]);
        callback();
      },
      addEventListener(name, callback, options) {
        listeners[name] = { callback, options };
      },
      focus() {
        calls.push(["focus"]);
      },
      print() {
        calls.push(["print"]);
      },
    };
    return node;
  }
  const context = vm.createContext({
    document: view.document,
    crypto: { randomUUID: () => "paper-id" },
    setTimeout(callback, delay) {
      timers.push({ callback, delay });
    },
  });
  load(context, "ui-paper");
  const paper = context.EduQuestionBankPaperUI.create({
    el,
    number: (value) => new Intl.NumberFormat("fa-IR").format(value),
    dateLabel: () => "تاریخ آزمون",
    letters: ["الف", "ب", "ج", "د"],
    fitOptions(body) {
      calls.push(["options", body]);
    },
  });
  return { ...paper, frames, calls, timers, document: view.document };
}
const paperExam = () => ({
  title: 'آزمون "کد"',
  courseTitle: "علوم",
  school: "",
  teacher: "",
  date: "2026-11-20",
  duration: 45,
  questions: [
    {
      type: "essay",
      text: "پاسخ دهید؟",
      score: 125,
      answer: "پاسخ محرمانه",
      explanation: "توضیح محرمانه",
    },
    { type: "blank", text: "نام ببرید؟", score: 75, answer: "پاسخ محرمانه" },
  ],
});

test("paper keeps named page styles, accessible scores and answer space without exposing solutions", () => {
  const f = paperFixture();
  const sheet = f.sheet(paperExam()),
    all = descendants(sheet);
  assert.equal(sheet.dir, "rtl");
  assert.equal(sheet.style.page, "qb-exam-paper-id");
  assert.match(sheet.children[0].textContent, /@page qb-exam-paper-id\{/);
  assert.ok(sheet.children[0].textContent.includes("آزمون \\22 کد\\22 "));
  assert.equal(sheet.children[0].media, "print");
  assert.deepEqual(
    all
      .filter((node) => node.className === "qb-sheet-score")
      .map((node) => node.attributes["aria-label"]),
    ["بارم ۱٫۲۵ نمره", "بارم ۰٫۷۵ نمره"],
  );
  assert.equal(
    all.find((node) => node.className === "qb-answer-space").children.length,
    4,
  );
  assert.equal(
    all.find((node) => node.className === "qb-short-answer").dir,
    "rtl",
  );
  assert.equal(
    all.find((node) => node.className === "qb-sheet-total").attributes[
      "aria-label"
    ],
    "تعداد کل سؤال‌ها: ۲",
  );
  assert.doesNotMatch(all.map((node) => node.textContent).join(" "), /محرمانه/);
});

test("printing waits for styles and offline font, fits options, then cleans up after print or timeout", async () => {
  const f = paperFixture();
  await f.print(paperExam());
  const frame = f.frames[0],
    doc = frame.contentDocument;
  assert.equal(frame.className, "qb-print-frame");
  assert.equal(frame.style.width, "794px");
  assert.equal(frame.style.visibility, "hidden");
  assert.equal(frame.title, "چاپ آزمون");
  assert.equal(doc.documentElement.lang, "fa");
  assert.equal(doc.documentElement.dir, "rtl");
  assert.equal(doc.body.style.width, "180mm");
  assert.equal(doc.body.children[0].className, "qb-sheet");
  assert.equal(doc.styles[0].stylesheet, true);
  assert.deepEqual(
    f.calls.map((call) => call[0]),
    ["font", "options", "frame", "focus", "print"],
  );
  assert.equal(f.calls[0][1], "16px IRANSans");
  assert.equal(f.calls[1][1], doc.body);
  assert.equal(frame.contentWindow.listeners.afterprint.options.once, true);
  assert.equal(f.document.body.children.length, 1);
  assert.equal(f.timers[0].delay, 60000);
  frame.contentWindow.listeners.afterprint.callback();
  assert.equal(f.document.body.children.length, 0);
  f.timers[0].callback();
  assert.equal(f.document.body.children.length, 0);
});

test("printing removes its hidden frame and propagates stylesheet or font failures", async () => {
  for (const options of [
    { fontError: Error("offline font unavailable") },
    { stylesheetError: true },
  ]) {
    const f = paperFixture(options);
    await assert.rejects(
      f.print(paperExam()),
      options.fontError || /فونت و سبک چاپ بارگیری نشد/,
    );
    assert.equal(f.document.body.children.length, 0);
    assert.equal(f.frames[0].isConnected, false);
    assert.equal(
      f.calls.some((call) => call[0] === "print"),
      false,
    );
    assert.equal(f.timers.length, 0);
  }
});
