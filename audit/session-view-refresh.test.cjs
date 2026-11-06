"use strict";

const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function fixture(scores = []) {
  const session = {
      id: "session-a",
      schoolId: "school-a",
      classId: "class-a",
      lessonId: "lesson-a",
      attendance: {},
      scores,
    },
    state = { live: session, hidden: false, progress: 0, defaults: 0 },
    timers = [],
    groups = [];
  const body = {
    children: [],
    insertBefore(row, position) {
      if (this.children.includes(row))
        this.children.splice(this.children.indexOf(row), 1);
      const index = position ? this.children.indexOf(position) : -1;
      this.children.splice(index < 0 ? this.children.length : index, 0, row);
      row.parentElement = this;
      row.isConnected = true;
    },
  };
  function rowFromHTML(html) {
    const row = {
      html,
      isConnected: true,
      parentElement: body,
      querySelector: () => button,
      contains: (control) => control === button,
      remove() {
        const index = body.children.indexOf(this);
        if (index !== -1) body.children.splice(index, 1);
        this.isConnected = false;
      },
    };
    const button = {
      dataset: {
        legacyClickArg6: /data-legacy-click-arg6="([^"]*)"/.exec(html)?.[1],
      },
      get isConnected() {
        return row.isConnected;
      },
      closest: () => row,
    };
    return row;
  }
  let table = false,
    replacements = 0;
  const records = {
    querySelectorAll: () => (table ? body.children : []),
    querySelector: () => (table ? body : null),
    contains: (row) => body.children.includes(row),
    set innerHTML(html) {
      replacements++;
      for (const row of body.children) row.isConnected = false;
      body.children = [];
      table = html.includes("<tbody>");
      if (table) {
        const contents = /<tbody>([\s\S]*)<\/tbody>/.exec(html)[1];
        body.children = [...contents.matchAll(/<tr>[\s\S]*?<\/tr>/g)].map(
          (match) => rowFromHTML(match[0]),
        );
      }
    },
  };
  const activityTab = {
      getAttribute: () => (state.panel === "attendance" ? "false" : "true"),
    },
    root = {
      isConnected: true,
      dataset: { sessionId: session.id },
      contains: () => false,
      querySelector: (selector) =>
        selector === ".session-activity-records" ? records : activityTab,
      querySelectorAll: () => groups,
    },
    document = {
      body: {},
      querySelector: () => root,
      getElementById: () => ({ classList: { contains: () => state.hidden } }),
      createElement: () => ({
        content: {},
        set innerHTML(html) {
          this.content.firstElementChild = rowFromHTML(html);
        },
      }),
    };
  document.activeElement = document.body;
  const context = vm.createContext({
    document,
    currentSessionId: session.id,
    getSessionById: (id) => (state.live?.id === id ? state.live : null),
    getClassObj: () => ({}),
    sessionStudent: (_classroom, _session, id) => ({
      name: id === "a" ? 'Student <A> "quoted"' : "Student B",
    }),
    TYPE_LABELS: { positive: "مثبت", negative: "منفی" },
    esc: (value) =>
      String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;"),
    refreshSessionAttendanceProgress: () => state.progress++,
    refreshSessionActivityInput: (form) => {
      state.defaults++;
      if (!form.elements.value.value && form.elements.type.value === "positive")
        form.elements.value.value = "0.25";
    },
    setTimeout: (callback) => timers.push(callback),
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/legacy/sessions/view-refresh.js"),
      "utf8",
    ),
    context,
  );
  records.innerHTML = context.sessionActivityRecordsHtml(session, {});
  assert.equal(context.bindSessionActivityRecords(session), true);
  return {
    context,
    session,
    state,
    root,
    records,
    body,
    document,
    groups,
    replacements: () => replacements,
    flush: () => {
      while (timers.length) timers.shift()();
    },
    form() {
      const elements = {};
      for (const [name, value] of Object.entries({
        studentId: "a",
        type: "positive",
        value: "0.75",
        note: "pending note",
      }))
        elements[name] = { value, focus: () => (state.focused = name) };
      elements.studentId.options = [
        { value: "" },
        { value: "a" },
        { value: "b" },
      ];
      elements.studentId.selectedIndex = 1;
      const form = {
        elements,
        isConnected: true,
        closest: () => root,
        contains: (control) => Object.values(elements).includes(control),
      };
      const previousContains = root.contains;
      root.contains = (node) =>
        node === form || form.contains(node) || previousContains(node);
      return {
        form,
        submitted: Object.fromEntries(
          Object.entries(elements).map(([name, control]) => [
            name,
            control.value,
          ]),
        ),
      };
    },
  };
}

const score = (studentId = "a", value = 0) => ({
  studentId,
  type: "positive",
  value,
  note: "<pending>",
});

test("shared activity markup preserves zero, escaped names and notes, heading and write metadata", () => {
  const f = fixture([score()]),
    html = f.body.children[0].html;
  assert.match(html, /<td>0<\/td>/);
  assert.match(html, /Student &lt;A&gt; &quot;quoted&quot;/);
  assert.match(html, /&lt;pending&gt;/);
  assert.match(html, /data-mutating="1"/);
  assert.match(
    f.context.sessionActivityRecordsHtml(f.session, {}),
    /^<h4>فعالیت‌های ثبت‌شده<\/h4>/,
  );
});

test("activity append retains previous row and records identities without rebuilding table", () => {
  const f = fixture([score()]),
    row = f.body.children[0],
    writes = f.replacements();
  f.session.scores.push(score("b", 1));
  assert.equal(f.context.refreshSessionActivityRecords(f.session), true);
  assert.equal(f.body.children[0], row);
  assert.equal(f.body.children.length, 2);
  assert.equal(f.replacements(), writes);
  assert.equal(
    f.context.sessionActivityControlMatches(row.querySelector(), f.session, 0),
    true,
  );
});

test("activity deletion preserves survivors and updates indices while rejecting removed controls", () => {
  const f = fixture([score(), score("b", 1)]),
    [removed, kept] = f.body.children;
  f.session.scores.splice(0, 1);
  f.context.refreshSessionActivityRecords(f.session);
  assert.equal(f.body.children[0], kept);
  assert.equal(kept.querySelector().dataset.legacyClickArg6, "0");
  assert.equal(
    f.context.sessionActivityControlMatches(
      removed.querySelector(),
      f.session,
      0,
    ),
    false,
  );
  assert.equal(
    f.context.sessionActivityControlMatches(kept.querySelector(), f.session, 0),
    true,
  );
});

test("replacing a filtered score preserves other rows and rejects an obsolete connected row before refresh", () => {
  const f = fixture([score(), score("b", 1)]),
    [old, kept] = f.body.children;
  f.session.scores = [f.session.scores[1], score("a", 2)];
  assert.equal(
    f.context.sessionActivityControlMatches(old.querySelector(), f.session, 0),
    false,
  );
  f.context.refreshSessionActivityRecords(f.session);
  assert.equal(f.body.children[0], kept);
  assert.equal(f.body.children[1].html.includes("<td>2</td>"), true);
});

test("an in-place score edit replaces only that row", () => {
  const f = fixture([score(), score("b", 1)]),
    [old, kept] = f.body.children;
  f.session.scores[0].note = "updated";
  f.context.refreshSessionActivityRecords(f.session);
  assert.notEqual(f.body.children[0], old);
  assert.equal(f.body.children[1], kept);
  assert.match(f.body.children[0].html, /updated/);
});

test("activity records transition from empty to table and back with current tracking", () => {
  const f = fixture();
  f.session.scores.push(score());
  f.context.refreshSessionActivityRecords(f.session);
  assert.equal(f.body.children.length, 1);
  const control = f.body.children[0].querySelector();
  assert.equal(
    f.context.sessionActivityControlMatches(control, f.session, 0),
    true,
  );
  f.session.scores = [];
  f.context.refreshSessionActivityRecords(f.session);
  assert.equal(f.body.children.length, 0);
  assert.equal(
    f.context.sessionActivityControlMatches(control, f.session, 0),
    false,
  );
});

test("exact durable rollback rebinds cloned score objects without replacing a valid delete row", () => {
  const f = fixture([score()]),
    row = f.body.children[0];
  f.state.live = structuredClone(f.session);
  assert.equal(
    f.context.sessionActivityControlMatches(
      row.querySelector(),
      f.state.live,
      0,
    ),
    true,
  );
  assert.equal(f.context.refreshSessionActivityRecords(f.state.live), true);
  assert.equal(f.body.children[0], row);
  assert.equal(f.context.refreshSessionActivityRecords(f.session), false);
});

test("a differing durable rollback rejects old controls and refreshes only records", () => {
  const f = fixture([score()]),
    row = f.body.children[0],
    root = f.root;
  f.state.live = structuredClone(f.session);
  f.state.live.scores[0].value = 3;
  assert.equal(
    f.context.sessionActivityControlMatches(
      row.querySelector(),
      f.state.live,
      0,
    ),
    false,
  );
  assert.equal(f.context.refreshSessionActivityRecords(f.state.live), true);
  assert.equal(f.root, root);
  assert.notEqual(f.body.children[0], row);
  assert.match(f.body.children[0].html, /<td>3<\/td>/);
});

test("preparing an exact rollback before retry append retains its existing rows", () => {
  const f = fixture([score()]),
    row = f.body.children[0];
  f.state.live = structuredClone(f.session);
  assert.equal(f.context.prepareSessionActivityRecords(f.state.live), true);
  f.state.live.scores.push(score("b", 2));
  assert.equal(f.context.refreshSessionActivityRecords(f.state.live), true);
  assert.equal(f.body.children[0], row);
  assert.equal(f.body.children.length, 2);
});

test("preparing an exact rollback before direct retry deletion retains surviving rows", () => {
  const f = fixture([score(), score("b", 2)]),
    row = f.body.children[1];
  f.state.live = structuredClone(f.session);
  assert.equal(f.context.prepareSessionActivityRecords(f.state.live), true);
  f.state.live.scores.splice(0, 1);
  assert.equal(f.context.refreshSessionActivityRecords(f.state.live), true);
  assert.equal(f.body.children[0], row);
});

test("preparing a differing or obsolete rollback is read-only and rejects a false binding", () => {
  const f = fixture([score()]),
    row = f.body.children[0],
    writes = f.replacements();
  f.state.live = structuredClone(f.session);
  f.state.live.scores[0].value = 4;
  assert.equal(f.context.prepareSessionActivityRecords(f.state.live), false);
  assert.equal(f.context.prepareSessionActivityRecords(f.session), false);
  assert.equal(f.body.children[0], row);
  assert.equal(f.replacements(), writes);
});

test("view refresh rejects hidden, disconnected, foreign-session and foreign-scope roots", () => {
  const f = fixture([score()]);
  f.state.hidden = true;
  assert.equal(f.context.refreshSessionActivityRecords(f.session), false);
  assert.equal(f.context.refreshSessionAttendanceRows(f.session), false);
  f.state.hidden = false;
  f.root.isConnected = false;
  assert.equal(f.context.refreshSessionActivityRecords(f.session), false);
  f.root.isConnected = true;
  f.context.currentSessionId = "another";
  assert.equal(f.context.refreshSessionActivityRecords(f.session), false);
  f.context.currentSessionId = f.session.id;
  f.session.classId = "another-class";
  assert.equal(f.context.refreshSessionActivityRecords(f.session), false);
});

test("attendance patches only changed controls and retains late zero, leave and unset semantics", () => {
  const f = fixture(),
    writes = { count: 0 };
  for (const [id, status] of [
    ["a", "late:0"],
    ["b", "leave"],
    ["c", ""],
  ]) {
    f.session.attendance[id] = status;
    const buttons = ["present", "late", "leave", "absent"].map((kind) => {
      const classes = new Set([kind]);
      let pressed = "false",
        text = kind === "late" ? "تأخیر" : kind;
      return {
        classList: {
          contains: (name) => classes.has(name),
          toggle(name, active) {
            writes.count++;
            if (active) classes.add(name);
            else classes.delete(name);
          },
        },
        getAttribute: () => pressed,
        setAttribute: (_name, value) => {
          writes.count++;
          pressed = value;
        },
        get textContent() {
          return text;
        },
        set textContent(value) {
          writes.count++;
          text = value;
        },
      };
    });
    f.groups.push({ dataset: { sid: id }, querySelectorAll: () => buttons });
  }
  assert.equal(f.context.refreshSessionAttendanceRows(f.session), true);
  assert.equal(f.groups[0].querySelectorAll()[1].textContent, "تأخیر (0د)");
  assert.equal(
    f.groups[1].querySelectorAll()[2].getAttribute("aria-pressed"),
    "true",
  );
  assert.ok(
    f.groups[2]
      .querySelectorAll()
      .every((button) => button.getAttribute("aria-pressed") === "false"),
  );
  const before = writes.count;
  f.context.refreshSessionAttendanceRows(f.session);
  assert.equal(writes.count, before);
  assert.equal(f.state.progress, 2);
});

function focusFixture() {
  const f = fixture(),
    control = {
      isConnected: true,
      disabled: false,
      selectionStart: 3,
      selectionEnd: 8,
      selectionDirection: "backward",
      matches: () => true,
      closest: () => (f.state.controlHidden ? f.root : null),
      focus(options) {
        f.state.focusOptions = options;
        f.document.activeElement = control;
      },
      setSelectionRange(...selection) {
        f.state.selection = selection;
      },
    };
  f.root.contains = (node) => node === control;
  f.document.activeElement = control;
  return { ...f, control };
}

test("busy-blurred session controls restore focus and caret without scrolling", () => {
  const f = focusFixture(),
    restore = f.context.captureSessionControlFocus(f.session);
  f.document.activeElement = f.document.body;
  assert.equal(restore(), true);
  assert.equal(f.document.activeElement, f.control);
  assert.equal(f.state.focusOptions.preventScroll, true);
  assert.deepEqual(f.state.selection, [3, 8, "backward"]);
});

test("focus restoration accepts exact-root rollback but never a closed or replaced dialog", () => {
  const f = focusFixture(),
    restore = f.context.captureSessionControlFocus(f.session);
  f.document.activeElement = f.document.body;
  f.state.live = structuredClone(f.session);
  assert.equal(restore(), true);
  f.document.activeElement = f.document.body;
  f.state.hidden = true;
  assert.equal(restore(), false);
  f.state.hidden = false;
  f.root.dataset.sessionId = "other";
  assert.equal(restore(), false);
});

test("focus restoration preserves deliberate other focus and skips hidden, disconnected or locked controls", () => {
  for (const kind of [
    "other-focus",
    "hidden",
    "disconnected",
    "disabled",
    "stale-session",
  ]) {
    const f = focusFixture(),
      restore = f.context.captureSessionControlFocus(f.session);
    f.document.activeElement = kind === "other-focus" ? {} : f.document.body;
    if (kind === "hidden") f.state.controlHidden = true;
    if (kind === "disconnected") f.control.isConnected = false;
    if (kind === "disabled") f.control.disabled = true;
    if (kind === "stale-session") f.context.currentSessionId = "other";
    assert.equal(restore(), false, kind);
    assert.equal(f.state.selection, undefined, kind);
  }
});

test("focus restoration tolerates controls without text-selection support", () => {
  const f = focusFixture();
  f.control.setSelectionRange = () => {
    throw Error("unsupported");
  };
  const restore = f.context.captureSessionControlFocus(f.session);
  f.document.activeElement = f.document.body;
  assert.equal(restore(), true);
});

test("successful unchanged activity clears the exact submitted draft, applies defaults and advances", () => {
  const f = fixture(),
    { form, submitted } = f.form();
  f.document.activeElement = form.elements.note;
  assert.equal(
    f.context.finishSessionActivitySave(form, { submitted, advance: true }),
    true,
  );
  assert.equal(form.elements.studentId.value, "b");
  assert.equal(form.elements.value.value, "0.25");
  assert.equal(form.elements.note.value, "");
  f.flush();
  assert.equal(f.state.focused, "value");
});

for (const field of ["studentId", "type", "value", "note"])
  test(`a newer ${field} draft is not cleared or defaulted after an earlier activity save`, () => {
    const f = fixture(),
      { form, submitted } = f.form();
    form.elements[field].value = "newer";
    assert.equal(
      f.context.finishSessionActivitySave(form, { submitted, advance: true }),
      false,
    );
    assert.equal(form.elements[field].value, "newer");
    assert.equal(f.state.defaults, 0);
    assert.equal(
      form.elements.note.value,
      field === "note" ? "newer" : "pending note",
    );
  });

test("deferred successful focus never steals focus after a newer draft or note focus", () => {
  for (const change of ["draft", "focus", "panel", "closed", "session"]) {
    const f = fixture(),
      { form, submitted } = f.form();
    f.context.finishSessionActivitySave(form, { submitted });
    if (change === "draft") form.elements.note.value = "next note";
    if (change === "focus") f.document.activeElement = form.elements.note;
    if (change === "panel") f.state.panel = "attendance";
    if (change === "closed") f.state.hidden = true;
    if (change === "session") f.context.currentSessionId = "another";
    f.flush();
    assert.equal(f.state.focused, undefined, change);
  }
});

test("successful programmatic submission returns focus from a neutral modal ancestor", () => {
  const f = fixture(),
    { form, submitted } = f.form();
  f.document.activeElement = { contains: (node) => node === form };
  assert.equal(f.context.finishSessionActivitySave(form, { submitted }), true);
  f.flush();
  assert.equal(f.state.focused, "value");
});

test("successful programmatic submission returns focus from the now-hidden attendance panel", () => {
  const f = fixture(),
    { form, submitted } = f.form(),
    attendanceSearch = {
      closest: (selector) => (selector === "[hidden]" ? {} : null),
    };
  f.root.contains = (node) => node === attendanceSearch;
  f.document.activeElement = attendanceSearch;
  assert.equal(f.context.finishSessionActivitySave(form, { submitted }), true);
  f.flush();
  assert.equal(f.state.focused, "value");
});

test("programmatic activity save never steals focus from a visible other control", () => {
  for (const insideRoot of [false, true]) {
    const f = fixture(),
      { form, submitted } = f.form(),
      other = { closest: () => null };
    f.root.contains = (node) => insideRoot && node === other;
    f.document.activeElement = other;
    assert.equal(
      f.context.finishSessionActivitySave(
        form,
        { submitted },
        form.elements.value,
      ),
      true,
    );
    f.flush();
    assert.equal(f.state.focused, undefined);
  }
});

test("successful programmatic submission restores value focus from the unchanged prewrite attendance tab", () => {
  const f = fixture(),
    { form, submitted } = f.form(),
    attendanceTab = { closest: () => null };
  f.root.contains = (node) => node === attendanceTab;
  f.document.activeElement = attendanceTab;
  assert.equal(
    f.context.finishSessionActivitySave(form, { submitted }, attendanceTab),
    true,
  );
  f.flush();
  assert.equal(f.state.focused, "value");
});

test("successful activity save preserves a new visible tab focus chosen while its write was pending", () => {
  const f = fixture(),
    { form, submitted } = f.form(),
    originalTab = { closest: () => null },
    newTab = { closest: () => null };
  f.root.contains = (node) => node === originalTab || node === newTab;
  f.document.activeElement = newTab;
  assert.equal(
    f.context.finishSessionActivitySave(form, { submitted }, originalTab),
    true,
  );
  f.flush();
  assert.equal(f.state.focused, undefined);
});

test("deferred completion focus never replaces a new tab or form-control focus", () => {
  for (const nextFocus of ["tab", "note", "student"]) {
    const f = fixture(),
      { form, submitted } = f.form(),
      originalTab = { closest: () => null },
      newTab = { closest: () => null };
    const formContains = f.root.contains;
    f.root.contains = (node) =>
      node === originalTab || node === newTab || formContains(node);
    f.document.activeElement = originalTab;
    assert.equal(
      f.context.finishSessionActivitySave(form, { submitted }, originalTab),
      true,
    );
    f.document.activeElement =
      nextFocus === "tab"
        ? newTab
        : form.elements[nextFocus === "note" ? "note" : "studentId"];
    f.flush();
    assert.equal(f.state.focused, undefined, nextFocus);
  }
});

test("successful activity save preserves a new unchanged note focus chosen during its write", () => {
  const f = fixture(),
    { form, submitted } = f.form();
  f.document.activeElement = form.elements.note;
  assert.equal(
    f.context.finishSessionActivitySave(
      form,
      { submitted },
      form.elements.value,
    ),
    true,
  );
  f.flush();
  assert.equal(f.state.focused, undefined);
});
