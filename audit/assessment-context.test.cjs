"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const clone = structuredClone,
  plain = (value) => JSON.parse(JSON.stringify(value));
function fixture({
  second = true,
  protectedSecond = false,
  closedSecond = false,
} = {}) {
  const periods = new Map(),
    data = new Map(),
    rows = new Map(),
    local = new Map(),
    effects = {
      writes: [],
      drafts: [],
      creates: [],
      broadcasts: [],
      renders: 0,
      prompts: 0,
    },
    timers = new Map();
  let token = 0,
    timer = 0;
  const storage = new Proxy(
    {},
    {
      ownKeys: () => [...local.keys()],
      getOwnPropertyDescriptor: () => ({
        enumerable: true,
        configurable: true,
      }),
      get: (_target, key) =>
        key === "getItem"
          ? (name) => local.get(name) ?? null
          : key === "setItem"
            ? (name, value) => local.set(name, value)
            : key === "removeItem"
              ? (name) => local.delete(name)
              : local.get(key),
    },
  );
  const connection = {
    transaction(name, mode) {
      assert.equal(name, "drafts");
      let resolve, reject;
      const tx = {
        done: new Promise((yes, no) => {
          resolve = yes;
          reject = no;
        }),
      };
      const request = (value) => {
        const req = {};
        queueMicrotask(() => {
          try {
            req.result = clone(value);
            req.onsuccess?.();
            queueMicrotask(resolve);
          } catch (error) {
            reject(error);
            req.error = error;
            req.onerror?.();
          }
        });
        return req;
      };
      tx.objectStore = () => ({
        get: (key) => request(rows.get(key)),
        put: (row) => {
          assert.equal(mode, "readwrite");
          rows.set(row.key, clone(row));
          effects.drafts.push(clone(row));
        },
        index: () => ({
          getAll: (id) =>
            request([...rows.values()].filter((row) => row.workspace === id)),
        }),
      });
      return tx;
    },
  };
  const c = vm.createContext({
    structuredClone,
    Map,
    clone,
    connection,
    installationToken: "installation-a",
    documentToken: "document-a",
    localStorage: storage,
    draftWriter: Promise.resolve(),
    writer: Promise.resolve(),
    draftWritesPending: 0,
    draftRecoveryFailed: false,
    busy: 0,
    blocked: false,
    ready: true,
    resetBusy: false,
    connectionRetired: false,
    periodLoading: false,
    isAuthenticated: true,
    state: {
      view: "lesson",
      tab: "grades",
      schoolId: "school",
      classId: "classroom",
      lessonId: "lesson",
    },
    document: { querySelectorAll: () => [], getElementById: () => null },
    setTimeout: (callback) => {
      timers.set(++timer, callback);
      return timer;
    },
    clearTimeout: (id) => timers.delete(id),
    uid: () => "token_" + ++token,
    setStatus() {},
    paintStatus() {},
    scheduleSingleFile() {},
    confirm: () => true,
    prompt: () => {
      effects.prompts++;
      return "correct";
    },
    verifyPassword: async (value, hash) =>
      value === "correct" && hash === "protected",
    normalizedName: (value) => String(value).trim(),
    academicTermKind: (term) => ({ اول: "first", دوم: "second" })[term] || null,
    transactionDone: (tx) => tx.done,
    requestPromise: (request) =>
      new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
    assertWorkspaceReadable() {
      if (
        !c.ready ||
        c.blocked ||
        c.resetBusy ||
        c.connectionRetired ||
        c.periodLoading ||
        (c.db.settings.password && !c.isAuthenticated)
      )
        throw Error("not readable");
    },
    broadcast: (value) => effects.broadcasts.push(clone(value)),
    validateV24(value) {
      for (const school of value.schools)
        for (const classroom of school.classes)
          for (const lesson of classroom.lessons)
            for (const grade of Object.values(lesson.kardaneshScores || {}))
              for (const field of [
                "practical",
                "theory",
                "midtermPractical",
                "midtermTheory",
              ])
                if (
                  grade[field] != null &&
                  (grade[field] < 0 || grade[field] > 20)
                )
                  throw Error("invalid grade");
      return true;
    },
    getSortedStudents: (classroom) => classroom.students,
    esc: (value) => String(value ?? "").replaceAll('"', "&quot;"),
    gradeStatus: () => "status",
    refreshPolicyResults() {},
    gradeCell: () => '<input data-grade="1" data-fallback="1">',
    historicalRoster: (classroom) => clone(classroom.students),
    render: () => {
      effects.renders++;
    },
    flushDrafts: async () => c.contextUnderTest.flush({ strict: true }),
    preserveAsyncTarget: () => {
      const source = c.workspace.id;
      return () => {
        if (source !== c.workspace.id) throw Error("workspace changed");
      };
    },
    showModal() {},
  });
  for (const file of [
    "domain/grade-math.js",
    "domain/data-boundary.js",
    "domain/grade-policy.js",
    "domain/grade-drafts.js",
    "domain/history-changes.js",
    "data/commit-plan.js",
    "data/workspace-records.js",
    "workspace/domain/defaults-numbers.js",
    "workspace/grading/scope.js",
    "workspace/grading/results.js",
    "workspace/grading/assessment-context.js",
    "workspace/grading/editors.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      c,
    );
  vm.runInContext("globalThis.contextUnderTest=assessmentContext", c);
  c.isSupportedGradeDraft = c.EduGradeDrafts.isSupportedGradeDraft;
  const codec = c.EduWorkspaceRecords.create({
    clone,
    normalizeDB: (value) => clone(value),
    isDataObject: c.isDataObject,
    isSafeRecordId: c.isSafeRecordId,
  });
  Object.assign(c, codec);
  const database = (kind) => ({
    schemaVersion: 26,
    settings: {
      academicYear: "1405-1406",
      academicTerm: kind === "first" ? "اول" : "دوم",
      password: kind === "second" && protectedSecond ? "protected" : "",
    },
    schools: [
      {
        id: "school",
        name: "School",
        classes: [
          {
            id: "classroom",
            name: "Class",
            students: [{ id: "student", name: "Student" }],
            archivedStudents: [],
            lessons: ["lesson", "other"].map((id) => ({
              id,
              name: "Course " + id,
              teacher: "Teacher",
              gradeMode: "kardanesh",
              poudmans: [],
              kardaneshScores: {
                student: { practical: kind === "first" ? 12 : 18, theory: 10 },
              },
            })),
          },
        ],
      },
    ],
    sessions: [
      {
        id: kind + "_session",
        date: "2026-11-02",
        classId: "classroom",
        lessonId: "lesson",
        attendance: {},
        scores: [],
      },
    ],
    masterSchedule: {},
    migrationWarnings: [],
  });
  const add = (kind) => {
    const row = {
      id: kind,
      year: "1405-1406",
      term: kind === "first" ? "اول" : "دوم",
      termKind: kind,
      revision: 1,
      closed: kind === "second" && closedSecond,
    };
    periods.set(kind, row);
    data.set(kind, database(kind));
    return clone(row);
  };
  add("first");
  if (second) add("second");
  c.workspace = clone(periods.get("first"));
  c.db = clone(data.get("first"));
  c.committed = new Map(
    [...codec.collectRecords(c.db)].map(([key, value]) => [
      key,
      JSON.stringify(value),
    ]),
  );
  c.getClassObj = () => c.db.schools[0].classes[0];
  c.getLessonObj = (classroom, id) =>
    classroom?.lessons.find((lesson) => lesson.id === id);
  c.findClass = () => c.db.schools[0].classes[0];
  c.ensureAcademicAssessmentTerm = async (kind) => {
    if (!periods.has(kind)) {
      add(kind);
      data.get(kind).sessions = [];
      for (const lesson of data.get(kind).schools[0].classes[0].lessons)
        lesson.kardaneshScores = {};
      effects.creates.push(kind);
    }
    return clone(periods.get(kind));
  };
  c.readWorkspaceSnapshot = async (id) => {
    const value = clone(data.get(id));
    return {
      period: clone(periods.get(id)),
      data: value,
      records: new Map(
        [...codec.collectRecords(value)].map(([key, record]) => [
          key,
          JSON.stringify(record),
        ]),
      ),
    };
  };
  c.EduRecordTransaction = {
    async commit(args) {
      const live = periods.get(args.workspace.id);
      if (live.revision !== args.workspace.revision) {
        const error = Error("conflict");
        error.code = "WORKSPACE_CONFLICT";
        throw error;
      }
      effects.writes.push({ id: live.id, changed: plain(args.changed) });
      for (const [key, json] of args.changed) {
        const value = JSON.parse(json);
        if (key === "class:classroom")
          data.get(live.id).schools[0].classes[0] = value;
      }
      const next = { ...live, revision: live.revision + 1 };
      periods.set(live.id, next);
      return clone(next);
    },
  };
  const identity = {
    schoolId: "school",
    classId: "classroom",
    lessonId: "lesson",
  };
  const input = (context, field, value) => ({
    dataset: {
      assessmentContext: context.token,
      class: context.classroom.id,
      lesson: context.lesson.id,
      student: "student",
      field,
    },
    value,
    setAttribute() {},
    parentElement: { querySelector: () => ({ textContent: "", dataset: {} }) },
    closest: () => null,
  });
  return {
    c,
    context: c.contextUnderTest,
    periods,
    data,
    rows,
    local,
    effects,
    timers,
    identity,
    input,
  };
}

test("selecting any of the four assessments leaves the active year workspace, sessions and application state unchanged", async () => {
  const f = fixture({ second: false }),
    before = JSON.stringify(f.c.db),
    source = f.c.workspace,
    state = f.c.state;
  for (const kind of ["first", "second"])
    for (const stage of ["midterm", "final"]) {
      const selected = await f.context.select(kind, stage, f.identity);
      assert.equal(selected.period.id, kind);
      assert.equal(selected.stage, stage);
      assert.equal(f.c.workspace, source);
      assert.equal(f.c.state, state);
      assert.equal(JSON.stringify(f.c.db), before);
    }
  assert.deepEqual(f.effects.creates, ["second"]);
  assert.equal(f.effects.writes.length, 0);
});

test("the actual assessment editor renders four flat stage buttons and selected foreign grades", async () => {
  const f = fixture();
  await f.context.select("second", "midterm", f.identity);
  const classroom = f.c.db.schools[0].classes[0],
    html = f.c.buildAssessmentEditor(classroom, classroom.lessons[0]);
  assert.equal(
    (html.match(/data-workspace-action="assessment-stage"/g) || []).length,
    4,
  );
  assert.ok(html.includes("میان‌ترم اول") && html.includes("پایان‌ترم دوم"));
  assert.ok(html.includes('data-assessment-context="'));
  assert.ok(
    html.includes('data-term="دوم" data-stage="midterm" aria-pressed="true"'),
  );
});

test("foreign assessment input writes only its target stage and preserves the active db and session references", async () => {
  const f = fixture(),
    source = f.c.workspace,
    database = f.c.db,
    before = JSON.stringify(database),
    ctx = await f.context.select("second", "midterm", f.identity);
  f.context.input(f.input(ctx, "midtermPractical", "19"));
  await f.context.flush({ strict: true });
  assert.equal(f.c.workspace, source);
  assert.equal(f.c.db, database);
  assert.equal(JSON.stringify(database), before);
  assert.equal(
    f.data.get("second").schools[0].classes[0].lessons[0].kardaneshScores
      .student.midtermPractical,
    19,
  );
  assert.equal(
    f.data.get("first").schools[0].classes[0].lessons[0].kardaneshScores.student
      .midtermPractical,
    undefined,
  );
  assert.deepEqual(
    f.effects.writes.map((row) => row.id),
    ["second"],
  );
  assert.equal(f.context.pending, 0);
  assert.equal(f.c.busy, 0);
});

test("editing the active assessment updates its catalog and committed grades while preserving entity references", async () => {
  const f = fixture(),
    db = f.c.db,
    classroom = db.schools[0].classes[0],
    lesson = classroom.lessons[0],
    ctx = await f.context.select("first", "final", f.identity);
  f.context.input(f.input(ctx, "practical", "0"));
  await f.context.flush({ strict: true });
  assert.equal(f.c.db, db);
  assert.equal(f.c.db.schools[0].classes[0], classroom);
  assert.equal(classroom.lessons[0], lesson);
  assert.equal(lesson.kardaneshScores.student.practical, 0);
  assert.equal(f.c.workspace.revision, 2);
  assert.equal(
    JSON.parse(f.c.committed.get("class:classroom")).lessons[0].kardaneshScores
      .student.practical,
    0,
  );
});

test("invalid pending assessment values persist in the existing portable draft schema and block stage changes", async () => {
  const f = fixture(),
    ctx = await f.context.select("second", "final", f.identity);
  f.context.input(f.input(ctx, "theory", "99"));
  await f.c.draftWriter;
  assert.equal(f.context.hasDrafts(), true);
  await assert.rejects(f.context.flush({ strict: true }));
  await assert.rejects(f.context.select("first", "midterm", f.identity));
  const row = [...f.rows.values()].find((value) => value.entries.length);
  assert.equal(row.workspace, "second");
  assert.equal(row.entries[0].kind, "k");
  assert.equal(row.entries[0].baseRevision, 1);
  assert.equal(row.entries[0].value, "99");
  assert.equal(f.c.isSupportedGradeDraft(row.entries[0]), true);
  const portable = f.c.EduGradeDrafts.portableGradeDrafts(
    [row],
    [...f.periods.values()],
  );
  assert.equal(portable.length, 1);
  assert.equal(portable[0].entries[0].value, "99");
  assert.equal(f.effects.writes.length, 0);
});

test("protected assessment selection verifies the target password before revealing or editing its grade data", async () => {
  const f = fixture({ protectedSecond: true });
  f.c.prompt = () => null;
  await assert.rejects(f.context.select("second", "final", f.identity));
  assert.equal(
    f.context.resolve(
      f.c.db.schools[0].classes[0],
      f.c.db.schools[0].classes[0].lessons[0],
    ),
    null,
  );
  assert.equal(f.effects.writes.length, 0);
  f.c.prompt = () => "correct";
  const ctx = await f.context.select("second", "final", f.identity);
  f.context.input(f.input(ctx, "theory", "17"));
  await f.context.flush({ strict: true });
  assert.equal(
    f.data.get("second").schools[0].classes[0].lessons[0].kardaneshScores
      .student.theory,
    17,
  );
});

test("a closed selected assessment is read-only while the active year remains unchanged", async () => {
  const f = fixture({ closedSecond: true }),
    ctx = await f.context.select("second", "final", f.identity),
    input = f.input(ctx, "theory", "20");
  assert.equal(f.context.readOnly(input), true);
  assert.throws(() => f.context.input(input));
  assert.equal(f.c.workspace.closed, false);
  assert.equal(f.effects.writes.length, 0);
  assert.ok(
    f.context
      .cell(ctx.classroom, ctx.lesson, ctx.classroom.students[0], "theory", {
        value: 10,
      })
      .includes('readonly aria-readonly="true"'),
  );
});

test("a target revision conflict keeps the draft for review and writes neither workspace", async () => {
  const f = fixture(),
    ctx = await f.context.select("second", "final", f.identity),
    input = f.input(ctx, "theory", "16");
  f.context.input(input);
  f.periods.get("second").revision++;
  await assert.rejects(
    f.context.flush({ strict: true }),
    (error) => error.code === "WORKSPACE_CONFLICT",
  );
  assert.equal(f.context.pending, 1);
  assert.equal(
    [...f.rows.values()].find((row) => row.entries.length).entries[0].review,
    true,
  );
  assert.equal(f.effects.writes.length, 0);
  assert.equal(f.c.workspace.revision, 1);
});

test("assessment commits wait for the existing writer queue before touching their target", async () => {
  const f = fixture(),
    ctx = await f.context.select("second", "midterm", f.identity);
  let resume;
  f.c.writer = new Promise((resolve) => {
    resume = resolve;
  });
  f.context.input(f.input(ctx, "midtermTheory", "18"));
  const operation = f.context.flush({ strict: true });
  await Promise.resolve();
  assert.equal(f.effects.writes.length, 0);
  resume();
  await operation;
  assert.equal(f.effects.writes.length, 1);
  assert.equal(f.c.busy, 0);
});

test("newer drafts belonging to another lesson cannot hide the selected lesson's recovered inputs", async () => {
  const f = fixture(),
    entry = (lid, value, field = "theory") => ({
      kind: "k",
      classId: "classroom",
      lid,
      sid: "student",
      pid: "",
      uid: "",
      field,
      value,
      baseRevision: 1,
    });
  f.rows.set("Edu24.drafts.second.old-assessment-classroom-lesson", {
    key: "Edu24.drafts.second.old-assessment-classroom-lesson",
    workspace: "second",
    generation: 1,
    updatedAt: "2026-11-02T00:00:00Z",
    entries: [entry("lesson", "15")],
  });
  f.rows.set("Edu24.drafts.second.new-assessment-classroom-other", {
    key: "Edu24.drafts.second.new-assessment-classroom-other",
    workspace: "second",
    generation: 10,
    updatedAt: "2026-11-02T01:00:00Z",
    entries: [entry("other", "99")],
  });
  const unrelated = clone(
      f.rows.get("Edu24.drafts.second.new-assessment-classroom-other"),
    ),
    ctx = await f.context.select("second", "final", f.identity);
  assert.equal(f.context.pending, 1);
  assert.ok(
    f.context
      .cell(ctx.classroom, ctx.lesson, ctx.classroom.students[0], "theory", {
        value: 10,
      })
      .includes('value="15"'),
  );
  await f.context.flush({ strict: true });
  assert.deepEqual(f.rows.get(unrelated.key), unrelated);
  assert.equal(
    f.data.get("second").schools[0].classes[0].lessons[0].kardaneshScores
      .student.theory,
    15,
  );
});

test("draft recovery merges independent cells from compatible assessment owners", async () => {
  const f = fixture();
  for (const [index, field] of ["practical", "theory"].entries()) {
    const key =
      "Edu24.drafts.second.owner" + index + "-assessment-classroom-lesson";
    f.rows.set(key, {
      key,
      workspace: "second",
      generation: index + 1,
      updatedAt: "2026-11-02T0" + index + ":00:00Z",
      entries: [
        {
          kind: "k",
          classId: "classroom",
          lid: "lesson",
          sid: "student",
          field,
          value: String(15 + index),
          baseRevision: 1,
        },
      ],
    });
  }
  await f.context.select("second", "final", f.identity);
  assert.equal(f.context.pending, 2);
  await f.context.flush({ strict: true });
  const grade =
    f.data.get("second").schools[0].classes[0].lessons[0].kardaneshScores
      .student;
  assert.equal(grade.practical, 15);
  assert.equal(grade.theory, 16);
});

test("abandoning a context after restore prevents its queued draft write from recreating old rows", async () => {
  const f = fixture(),
    ctx = await f.context.select("second", "final", f.identity);
  let resume;
  f.c.draftWriter = new Promise((resolve) => {
    resume = resolve;
  });
  f.context.input(f.input(ctx, "theory", "99"));
  await f.context.dispose({ abandon: true });
  f.c.installationToken = "installation-b";
  resume();
  await f.c.draftWriter;
  assert.equal(f.effects.drafts.length, 0);
  assert.equal(f.context.pending, 0);
  assert.equal(f.effects.writes.length, 0);
});

test("unrelated active-year revision changes do not redirect or invalidate a foreign assessment write", async () => {
  const f = fixture(),
    ctx = await f.context.select("second", "final", f.identity);
  f.c.workspace = { ...f.c.workspace, revision: 2 };
  f.context.input(f.input(ctx, "theory", "18"));
  await f.context.flush({ strict: true });
  assert.equal(f.c.workspace.id, "first");
  assert.equal(f.c.workspace.revision, 2);
  assert.equal(f.effects.writes[0].id, "second");
});

test("the actual stage action keeps global workspace and source sessions stable", async () => {
  const f = fixture({ second: false }),
    workspace = f.c.workspace,
    sessions = f.c.db.sessions;
  await f.c.openAssessmentStage({
    dataset: { term: "دوم", stage: "final" },
    closest: () => null,
  });
  assert.equal(f.c.workspace, workspace);
  assert.equal(f.c.db.sessions, sessions);
  assert.equal(f.c.state.lessonId, "lesson");
  assert.equal(f.c.state.tab, "grades");
  assert.deepEqual(f.effects.creates, ["second"]);
});

test("recovery adopts only the visible assessment stage and leaves hidden-stage review drafts untouched", async () => {
  const f = fixture(),
    key = "Edu24.drafts.second.previous-assessment";
  const original = {
    key,
    workspace: "second",
    generation: 3,
    updatedAt: "2026-11-02T00:00:00Z",
    entries: [
      {
        kind: "k",
        classId: "classroom",
        lid: "lesson",
        sid: "student",
        field: "theory",
        value: "99",
        baseRevision: 0,
        review: true,
      },
      {
        kind: "k",
        classId: "classroom",
        lid: "lesson",
        sid: "student",
        field: "midtermTheory",
        value: "17",
        baseRevision: 1,
      },
    ],
  };
  f.rows.set(key, clone(original));
  await f.context.select("second", "midterm", f.identity);
  assert.equal(f.context.pending, 1);
  await f.context.flush({ strict: true });
  assert.deepEqual(f.rows.get(key), original);
  assert.equal(
    f.data.get("second").schools[0].classes[0].lessons[0].kardaneshScores
      .student.midtermTheory,
    17,
  );
  await f.context.select("second", "final", f.identity);
  assert.equal(f.context.pending, 1);
  await assert.rejects(f.context.flush({ strict: true }));
});

test("a stage cannot write another stage's raw fields through a tampered input", async () => {
  const f = fixture(),
    ctx = await f.context.select("second", "midterm", f.identity);
  assert.throws(() => f.context.input(f.input(ctx, "theory", "18")));
  assert.equal(f.context.pending, 0);
  assert.equal(f.effects.writes.length, 0);
});

test("memory snapshot retains compatible pending grades when both persistent draft stores fail", async () => {
  const f = fixture(),
    ctx = await f.context.select("second", "final", f.identity);
  f.c.localStorage = {
    setItem() {
      throw Error("local quota");
    },
  };
  f.c.connection.transaction = () => {
    throw Error("IDB quota");
  };
  f.context.input(f.input(ctx, "theory", "99"));
  await assert.rejects(f.c.draftWriter);
  const row = f.context.snapshot();
  assert.equal(row.workspace, "second");
  assert.equal(row.entries[0].value, "99");
  assert.equal(
    f.c.EduGradeDrafts.portableGradeDrafts([row], [...f.periods.values()])
      .length,
    1,
  );
  row.entries[0].value = "changed";
  assert.equal(f.context.snapshot().entries[0].value, "99");
});

test("ordinary active-source saves make its selected assessment read-only with a visible reselection notice", async () => {
  const f = fixture(),
    selected = await f.context.select("first", "midterm", f.identity),
    input = f.input(selected, "midtermTheory", "18"),
    before = JSON.stringify(f.c.db),
    classroom = f.c.db.schools[0].classes[0];
  f.c.workspace = { ...f.c.workspace, revision: 2 };
  assert.equal(f.context.readOnly(input), true);
  const html = f.c.buildAssessmentEditor(classroom, classroom.lessons[0]);
  assert.match(html, /مرحله را دوباره انتخاب کنید/);
  assert.throws(() => f.context.input(input));
  assert.equal(f.context.pending, 0);
  assert.equal(f.effects.writes.length, 0);
  assert.equal(JSON.stringify(f.c.db), before);
});
