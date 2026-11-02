"use strict";

function calendarSnapshot() {
  const popup = document.getElementById("calPopup"),
    rules = [
      ["popup", popup],
      ["header", popup.querySelector(".cal-header")],
      ["title", popup.querySelector(".cal-title")],
      ["navigation", popup.querySelector("[data-calendar-direction]")],
      ["day", popup.querySelector(".cal-days button:not(.empty)")],
      ["selected", popup.querySelector(".cal-days .selected")],
      ["close", popup.querySelector(".calendar-close")],
    ],
    properties = [
      "fontFamily",
      "fontSize",
      "lineHeight",
      "fontWeight",
      "backgroundColor",
      "color",
      "borderRadius",
      "padding",
      "gap",
    ];
  return {
    markup: popup.innerHTML,
    className: popup.className,
    styles: Object.fromEntries(
      rules.map(([key, node]) => {
        const style = getComputedStyle(node),
          bounds = node.getBoundingClientRect();
        return [
          key,
          {
            ...Object.fromEntries(
              properties.map((name) => [name, style[name]]),
            ),
            width: Math.round(bounds.width * 100) / 100,
            height: Math.round(bounds.height * 100) / 100,
          },
        ];
      }),
    ),
    resources: [...document.scripts]
      .map((script) => script.src)
      .filter((src) => /\/calendar-ui\.js(?:\?|$)/.test(src)),
  };
}

// All records and browser contexts belong to data-integrity's synthetic profile.
// Production code is never patched; both independent installations are restored.
async function prepareTeacherExchange(changeTeacher) {
  const cases = [],
    check = (id, name, pass, observed = {}) =>
      cases.push({ id, name, pass: !!pass, observed }),
    wait = async (predicate) => {
      for (let i = 0; i < 240; i++) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw Error(
        "Teacher deputy flow timed out: " +
          (document.getElementById("deputyExportError")?.textContent || ""),
      );
    };
  closeModal();
  await EduV24.test.settle();
  const original = await EduV24.snapshotInstallation(),
    fixture = structuredClone(original),
    year = "1405-1406",
    ids = {
      first: "deputy_audit_first",
      second: "deputy_audit_second",
      school: "deputy_audit_school",
      secret: "deputy_audit_private_school",
      classroom: "deputy_audit_class",
      secondClass: "deputy_audit_class_two",
      a: "deputy_audit_student_a",
      b: "deputy_audit_student_b",
      archived: "deputy_audit_student_archived",
      dual: "deputy_audit_dual",
      general: "deputy_audit_general",
      modular: "deputy_audit_modular",
    },
    people = [
      { id: ids.a, name: "هنرجوی هم‌نام آزمایشی", code: "100" },
      { id: ids.b, name: "هنرجوی هم‌نام آزمایشی", code: "200" },
    ],
    archived = {
      id: ids.archived,
      name: "هنرجوی بایگانی آزمایشی",
      code: "300",
    };
  fixture.activeWorkspace = ids.second;
  fixture.gradeDrafts = [];
  fixture.snapshotNotes = [];
  fixture.reportDrafts = {};
  fixture.stores = {
    records: [],
    catalog: [],
    reports: [],
    events: [],
    undo: [],
    backups: [],
  };
  for (const [index, id] of [ids.first, ids.second].entries()) {
    const general = EduPolicy.defaults("dual", year);
    general.subjectType = "general";
    const dual = {
        id: ids.dual,
        name: "درس عملی و نظری آزمایشی",
        teacher: "دبیر آزمایشی",
        gradeMode: "kardanesh",
        gradingPolicy: EduPolicy.defaults("dual", year),
        kardaneshScores: {
          [ids.a]: index
            ? {
                practical: 20,
                theory: 10,
                midtermPractical: 20,
                midtermTheory: 20,
              }
            : {
                practical: 0,
                theory: 20,
                midtermPractical: 10,
                midtermTheory: null,
              },
        },
        poudmans: [],
      },
      data = EduV24.normalizeDB({
        ...defaultDB(),
        settings: {
          ...db.settings,
          academicYear: year,
          academicTerm: index ? "دوم" : "اول",
          password: "",
        },
        schools: [
          {
            id: ids.school,
            name: "هنرستان آزمایشی معاون",
            classes: [
              {
                id: ids.classroom,
                name: "کلاس آزمایشی معاون",
                grade: "11",
                field: "رشتهٔ آزمایشی",
                students: structuredClone(people),
                archivedStudents: [structuredClone(archived)],
                lessons: [
                  dual,
                  {
                    id: ids.general,
                    name: "درس عمومی آزمایشی",
                    teacher: "دبیر آزمایشی",
                    gradeMode: "kardanesh",
                    gradingPolicy: general,
                    kardaneshScores: {
                      [ids.a]: {
                        theory: index ? 20 : 0,
                        midtermTheory: index ? 0 : 15,
                      },
                    },
                    poudmans: [],
                  },
                  {
                    id: ids.modular,
                    name: "درس پودمانی سالانهٔ آزمایشی",
                    teacher: "دبیر آزمایشی",
                    gradeMode: "standard",
                    gradingPolicy: EduPolicy.defaults("modular", year),
                    kardaneshScores: {},
                    poudmans: [
                      {
                        id: "deputy_audit_pod",
                        name: "پودمان آزمایشی",
                        podScores: {
                          [ids.a]: { m: 2, c: 3 },
                          [ids.b]: { m: 0, c: 2 },
                        },
                        units: [
                          {
                            id: "deputy_audit_unit",
                            name: "واحد آزمایشی",
                            unitScores: {},
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                id: ids.secondClass,
                name: "کلاس دوم بدون جلسه",
                students: [],
                archivedStudents: [],
                lessons: [],
              },
            ],
          },
          {
            id: ids.secret,
            name: "PRIVATE_OTHER_SCHOOL_MUST_NOT_LEAK",
            classes: [],
          },
        ],
        sessions: [
          {
            id: "deputy_audit_session_" + index,
            schoolId: ids.school,
            classId: ids.classroom,
            lessonId: index ? ids.modular : ids.dual,
            date: index ? "2026-11-02" : "2026-11-01",
            period: index,
            poudmanId: index ? "deputy_audit_pod" : null,
            unitId: index ? "deputy_audit_unit" : null,
            roster: structuredClone(index ? people : [...people, archived]),
            attendance: {
              [ids.a]: index ? "present" : "late:10",
              [ids.b]: index ? "leave" : "absent",
            },
            scores: [
              {
                studentId: ids.a,
                type: "classGrade",
                value: 0,
                note: "فعالیت با نمرهٔ صفر",
              },
            ],
          },
        ],
        masterSchedule: {},
        migrationWarnings: [],
      }),
      { schools, sessions, ...meta } = data;
    meta.layout = schools.map((school) => ({
      id: school.id,
      name: school.name,
      classes: school.classes.map((classroom) => classroom.id),
    }));
    fixture.stores.catalog.push({
      id,
      year,
      term: index ? "دوم" : "اول",
      termKind: index ? "second" : "first",
      closed: !index,
      revision: 1,
      createdAt: "2026-11-02T00:00:00Z",
      updatedAt: "2026-11-02T00:00:00Z",
    });
    for (const [logical, value] of [
      ["meta", meta],
      ...schools.flatMap((school) =>
        school.classes.map((classroom) => ["class:" + classroom.id, classroom]),
      ),
      ...sessions.map((session) => ["session:" + session.id, session]),
    ])
      fixture.stores.records.push({
        key: id + "|" + logical,
        workspace: id,
        logical,
        value,
      });
    fixture.reportDrafts[id] = {};
  }
  EduV24.previewFullBackup(fixture);
  document.getElementById("fullRestoreConfirmed").checked = true;
  await EduV24.restoreFullBackup();
  await EduV24.test.settle();
  const signature = (snapshot) =>
    JSON.stringify({
      catalog: snapshot.stores.catalog,
      records: snapshot.stores.records,
      reports: snapshot.stores.reports,
    });
  const before = signature(await EduV24.snapshotInstallation()),
    delivery = localStorage.getItem("Edu24.fullBackupDelivery"),
    downloads = [],
    originalDownload = downloadLocalFile;
  try {
    downloadLocalFile = (blob, name) => {
      void blob.text().then((text) =>
        downloads.push({
          name,
          text,
          bytes: blob.size,
          packet: JSON.parse(text),
        }),
      );
    };
    goReports();
    state.reportTab = "daily";
    render();
    const setReportChoice = (token, value) => {
      const select = document.querySelector(
        '[data-legacy-change="reports-periodic-render:' + token + '"]',
      );
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setReportChoice(0, "parent");
    setReportChoice(2, ids.school);
    setReportChoice(3, ids.classroom);
    setReportChoice(5, ids.a);
    const entry = document.querySelector(
      '[data-workspace-action="deputy-export"]',
    );
    if (!entry) throw Error("Actual teacher deputy export entry is missing");
    entry.click();
    await wait(() =>
      document.querySelector(
        "#deputyExportPanel [data-deputy-export-prepare]:not(:disabled)",
      ),
    );
    const form = document.getElementById("deputyExportPanel");
    check(
      "DEPUTY_ROLE_TEACHER",
      "teacher navigation and the actual export modal contain no deputy-app cross-links",
      ![...document.querySelectorAll("a[href]")].some((link) =>
        new URL(link.href).pathname.endsWith("/Deputy.html"),
      ),
    );
    form.elements.deputySchool.value = ids.school;
    form.elements.deputySchoolCode.value = "audit-school-۱";
    form.elements.deputySenderName.value = "دبیر آزمایشی معاون";
    form.elements.deputySenderCode.value = "audit-teacher-A";
    form.elements.deputyConsent.checked = true;
    form.requestSubmit();
    await wait(
      () =>
        document.querySelector(
          '[data-workspace-action="export-deputy-packet"]:not([hidden])',
        ) || document.getElementById("deputyExportError").textContent,
    );
    check(
      "DEPUTY01",
      "teacher performs a separate full-school/year preview before explicit download",
      downloads.length === 0 &&
        !document.querySelector("[data-deputy-export-preview]").hidden,
      { error: document.getElementById("deputyExportError").textContent },
    );
    document
      .querySelector('[data-workspace-action="export-deputy-packet"]')
      .click();
    await wait(
      () =>
        downloads.length === 1 ||
        document.getElementById("deputyExportError").textContent,
    );
    if (!downloads.length)
      throw Error(document.getElementById("deputyExportError").textContent);
    const packet = EduDeputyExchange.validate(downloads[0].packet),
      text = JSON.stringify(packet),
      grades = EduDeputyExchange.gradeRows(packet),
      dual = grades.find(
        (row) => row.lessonId === ids.dual && row.studentId === ids.a,
      ),
      modular = grades.find(
        (row) => row.lessonId === ids.modular && row.studentId === ids.a,
      );
    check(
      "DEPUTY02",
      "actual exported JSON is privacy-whitelisted, normalized and contains both terms rather than the daily filter",
      packet.periods.length === 2 &&
        packet.school.code === "AUDIT-SCHOOL-1" &&
        !text.includes("PRIVATE_OTHER_SCHOOL") &&
        !text.includes(ids.secret) &&
        !text.includes('"password"') &&
        /^edu-deputy-AUDIT-SCHOOL-1-AUDIT-TEACHER-A-1405-1406-\d{14}Z\.json$/.test(
          downloads[0].name,
        ),
    );
    check(
      "DEPUTY03",
      "official exchange retains all four dual stages, zero practical, partial grades and annual modules",
      dual.stages.length === 4 &&
        dual.stages.find(
          (stage) => stage.termKind === "first" && stage.stage === "final",
        ).practical === 0 &&
        dual.stages.find(
          (stage) => stage.termKind === "first" && stage.stage === "midterm",
        ).final === null &&
        modular.modules[0].final === 17,
    );
    const wholeClass = packet.periods[0].school.classes.find(
      (item) => item.id === ids.classroom,
    );
    check(
      "DEPUTY_FULL_SCHOOL_FILTER",
      "a teacher report filtered to one student still exports the entire selected school, including the same-name peer and archived student",
      EduPeriodicReports.filters.studentId === ids.a &&
        wholeClass.students.length === 2 &&
        wholeClass.students.some((item) => item.id === ids.b) &&
        wholeClass.archivedStudents.some((item) => item.id === ids.archived),
    );
    check(
      "DEPUTY04",
      "teacher export leaves all persisted teacher records and backup-delivery badges unchanged",
      signature(await EduV24.snapshotInstallation()) === before &&
        localStorage.getItem("Edu24.fullBackupDelivery") === delivery,
    );
    closeModal();
    cases.push(...(await changeTeacher(ids)));
    goReports();
    state.reportTab = "daily";
    render();
    document.querySelector('[data-workspace-action="deputy-export"]').click();
    await wait(() =>
      document.querySelector(
        "#deputyExportPanel [data-deputy-export-prepare]:not(:disabled)",
      ),
    );
    const nextForm = document.getElementById("deputyExportPanel");
    nextForm.elements.deputySchool.value = ids.school;
    nextForm.elements.deputySchoolCode.value = "audit-school-۱";
    nextForm.elements.deputySenderName.value = "دبیر آزمایشی معاون";
    nextForm.elements.deputySenderCode.value = "audit-teacher-A";
    nextForm.elements.deputyConsent.checked = true;
    nextForm.requestSubmit();
    await wait(
      () =>
        document.querySelector(
          '[data-workspace-action="export-deputy-packet"]:not([hidden])',
        ) || document.getElementById("deputyExportError").textContent,
    );
    document
      .querySelector('[data-workspace-action="export-deputy-packet"]')
      .click();
    await wait(
      () =>
        downloads.length === 2 ||
        document.getElementById("deputyExportError").textContent,
    );
    if (downloads.length !== 2)
      throw Error(document.getElementById("deputyExportError").textContent);
    const nextPacket = EduDeputyExchange.validate(downloads[1].packet);
    check(
      "DEPUTY_COMPACT_EXPORT",
      "both actual teacher exchange downloads use compact UTF-8 JSON instead of larger pretty-printed files",
      downloads.every(
        (file) =>
          file.text === JSON.stringify(file.packet) &&
          file.bytes === new TextEncoder().encode(file.text).byteLength,
      ),
      { bytes: downloads.map((file) => file.bytes) },
    );
    check(
      "DEPUTY_SECOND_EXPORT",
      "a second actual teacher download carries newer durable revisions and not an edited copy of the first exchange file",
      nextPacket.id !== packet.id &&
        nextPacket.periods.every(
          (term) =>
            term.revision >
            packet.periods.find((old) => old.id === term.id).revision,
        ),
    );
    closeModal();
    return {
      original,
      packet,
      nextPacket,
      before: signature(await EduV24.snapshotInstallation()),
      ids,
      cases,
    };
  } finally {
    downloadLocalFile = originalDownload;
    closeModal();
  }
}

async function exerciseDeputyUI(packet, ids, nextPacket) {
  const cases = [],
    check = (id, name, pass, observed = {}) =>
      cases.push({ id, name, pass: !!pass, observed }),
    wait = async (predicate) => {
      for (let i = 0; i < 240; i++) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw Error("Deputy UI timed out: " + EduDeputyUI.status().message);
    },
    idle = () => wait(() => !EduDeputyUI.status().busy),
    click = async (action) => {
      const button = document.querySelector(
        '[data-deputy-action="' + action + '"]',
      );
      if (!button || button.disabled)
        throw Error("Deputy action unavailable: " + action);
      button.click();
      await idle();
    },
    tab = (name) =>
      document.querySelector('[data-deputy-tab="' + name + '"]').click(),
    change = (id, value) => {
      const input = document.getElementById(id);
      if (!input) throw Error("Deputy field unavailable: " + id);
      input.value = value;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
    file = async (value, inputId = "deputyImportFile", raw = false) => {
      tab("receive");
      const transfer = new DataTransfer();
      transfer.items.add(
        new File(
          [raw ? value : JSON.stringify(value)],
          "synthetic-deputy.json",
          { type: "application/json" },
        ),
      );
      const input = document.getElementById(inputId);
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await idle();
    },
    setNote = (text) => {
      const input = document.getElementById("deputyNoteText");
      input.value = text;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    },
    downloadAction = async (action) => {
      const originalCreateURL = URL.createObjectURL,
        originalClick = HTMLAnchorElement.prototype.click,
        blobs = new Map(),
        downloads = [];
      try {
        URL.createObjectURL = function (blob) {
          const url = originalCreateURL.call(URL, blob);
          blobs.set(url, blob);
          return url;
        };
        HTMLAnchorElement.prototype.click = function () {
          const blob = blobs.get(this.href);
          if (this.download && blob)
            void blob.text().then((text) =>
              downloads.push({
                name: this.download,
                text,
                bytes: blob.size,
                value: JSON.parse(text),
              }),
            );
          else originalClick.call(this);
        };
        const panel = document.querySelector(".ed-help");
        if (panel) panel.open = true;
        await click(action);
        await wait(() => downloads.length === 1);
        return downloads[0];
      } finally {
        URL.createObjectURL = originalCreateURL;
        HTMLAnchorElement.prototype.click = originalClick;
      }
    },
    store = await EduDeputyStore.open(),
    original = await store.backup();
  try {
    check(
      "DEPUTY_ROLE_DEPUTY",
      "deputy navigation has no teacher-app cross-link while retaining its independent read-only application",
      ![...document.querySelectorAll("a[href]")].some((link) =>
        new URL(link.href).pathname.endsWith("/EduManager.html"),
      ) && !globalThis.EduV24,
    );
    await store.restore(
      {
        format: "EduManager.DeputyBackup",
        version: 1,
        revision: 0,
        exportedAt: new Date().toISOString(),
        streams: [],
        followups: [],
      },
      original.revision,
    );
    await EduDeputyUI.refresh();
    await file(packet);
    check(
      "DEPUTY05",
      "selecting a teacher file displays a real import preview without writing records",
      !!document.getElementById("deputyImportPreview") &&
        (await store.list()).length === 0,
    );
    await click("cancel-preview");
    check(
      "DEPUTY06",
      "cancelling a teacher import preserves the entire deputy database",
      (await store.list()).length === 0 &&
        (await store.followups()).length === 0,
    );
    await file(packet);
    await click("confirm-import");
    const keyA = EduDeputyExchange.key(packet);
    check(
      "DEPUTY07",
      "explicit import creates exactly one independent teacher/school/year stream",
      (await store.list()).length === 1 &&
        (await store.list())[0].key === keyA &&
        !EduDeputyUI.status().error,
    );
    await file(packet);
    check(
      "DEPUTY08",
      "a repeated file is identified as duplicate and actual confirmation is disabled",
      document.querySelector('[data-deputy-action="confirm-import"]')
        .disabled && (await store.list()).length === 1,
    );
    await click("cancel-preview");
    const invalid = structuredClone(packet);
    invalid.periods[0].sessions[0].attendance[ids.a] = "fake-status";
    await file(invalid);
    check(
      "DEPUTY09",
      "invalid attendance is rejected before any import write",
      EduDeputyUI.status().error &&
        (await store.list()).length === 1 &&
        !(await store.followups()).length,
    );
    await file("not valid JSON", "deputyImportFile", true);
    check(
      "DEPUTY10",
      "a malformed JSON document fails explicitly without changing received sources",
      EduDeputyUI.status().error && (await store.list()).length === 1,
    );
    const stale = structuredClone(packet);
    stale.periods[0].revision = 0;
    await file(stale);
    check(
      "DEPUTY11",
      "an older academic revision cannot replace newer received attendance or grades",
      EduDeputyUI.status().error &&
        JSON.stringify((await store.list())[0].packet) ===
          JSON.stringify(packet),
    );
    tab("reports");
    change("deputyTerm", "first");
    const metrics = [...document.querySelectorAll(".ed-metric")].map(
      (node) => node.textContent,
    );
    check(
      "DEPUTY12",
      "real deputy report counts late pupils inside present and labels the first zero-based bell as bell one",
      metrics.some(
        (text) => text.includes("حاضر، شامل تأخیر") && text.includes("۱"),
      ) &&
        metrics.some((text) => text.includes("غایب") && text.includes("۱")) &&
        document
          .querySelector(".ed-session summary")
          .textContent.includes("زنگ ۱"),
    );
    check(
      "DEPUTY13",
      "real deputy report displays raw zero activities and all three official course types",
      document.querySelector(".ed-activities").textContent.includes("۰") &&
        document.querySelectorAll(".ed-lesson").length === 3 &&
        document.querySelector(".ed-grade-values").textContent.length > 0,
    );
    change("deputyTerm", "all");
    const firstDual = [...document.querySelectorAll(".ed-lesson")].find(
      (node) => node.textContent.includes("درس عملی و نظری آزمایشی"),
    );
    check(
      "DEPUTY14",
      "both-term report renders the four dual assessment stages and annual modular marks without duplicating annual rows",
      firstDual.querySelector(".ed-grade").querySelectorAll(".ed-grade-stage")
        .length === 4 &&
        document.querySelectorAll(".ed-session").length === 2 &&
        document.querySelectorAll(".ed-lesson").length === 3,
    );
    tab("followups");
    change("deputyNoteClass", ids.classroom);
    change("deputyNoteStudent", ids.a);
    const hostileNote =
      '<img src=x onerror="globalThis.__deputyXSS=1"> پیگیری آزمایشی';
    setNote(hostileNote);
    document.getElementById("deputyFollowupForm").requestSubmit();
    await idle();
    let note = (await store.followups())[0];
    check(
      "DEPUTY15",
      "actual followup submission stores an independent note under the selected source without executing imported note HTML",
      note?.streamKey === keyA &&
        note.studentId === ids.a &&
        document.querySelector(".ed-note").textContent === hostileNote &&
        !document.querySelector(".ed-note img") &&
        !globalThis.__deputyXSS,
    );
    await click("toggle-note");
    check(
      "DEPUTY16",
      "actual followup completion updates only the deputy note and retains its identity",
      (await store.followups())[0].status === "done" &&
        (await store.followups())[0].id === note.id,
    );
    const packetB = structuredClone(packet);
    packetB.id = "deputy_audit_sender_b";
    packetB.sender.code = "AUDIT-TEACHER-B";
    await file(packetB);
    await click("confirm-import");
    const keyB = EduDeputyExchange.key(packetB);
    check(
      "DEPUTY17",
      "two senders with identical names and local student IDs remain separate streams",
      (await store.list()).length === 2 &&
        new Set((await store.list()).map((row) => row.key)).size === 2 &&
        (await store.followups()).length === 1,
    );
    tab("followups");
    change("deputySource", keyA);
    await click("edit-note");
    check(
      "DEPUTY18",
      "editing a followup fixes its original source and student instead of allowing a misleading retarget",
      !document.getElementById("deputyNoteClass") &&
        !document.getElementById("deputyNoteStudent") &&
        !!document.getElementById("deputyNoteText"),
    );
    setNote("پیش‌نویس ویرایش منبع الف");
    packetB.id = "deputy_audit_sender_b_update";
    packetB.periods.forEach((period) => period.revision++);
    await file(packetB);
    await click("confirm-import");
    tab("followups");
    check(
      "DEPUTY19",
      "importing sender B while editing A preserves A's draft and never silently switches the note's source",
      document.getElementById("deputySource").value === keyA &&
        document.getElementById("deputyNoteText").value ===
          "پیش‌نویس ویرایش منبع الف",
    );
    const previousConfirm = confirm;
    window.confirm = () => false;
    change("deputySource", keyB);
    check(
      "DEPUTY20",
      "declining source change preserves the visible source and unsaved note draft",
      document.getElementById("deputySource").value === keyA &&
        document.getElementById("deputyNoteText").value ===
          "پیش‌نویس ویرایش منبع الف",
    );
    window.confirm = previousConfirm;
    document.getElementById("deputyFollowupForm").requestSubmit();
    await idle();
    note = (await store.followups())[0];
    check(
      "DEPUTY21",
      "a preserved edit writes only the original A note, never another sender's identical student ID",
      note.note === "پیش‌نویس ویرایش منبع الف" &&
        note.streamKey === keyA &&
        (await store.followups()).length === 1,
    );
    const otherBeforeSync = JSON.stringify(
      (await store.list()).find((row) => row.key === keyB),
    );
    await file(nextPacket);
    check(
      "DEPUTY_SYNC_PREVIEW",
      "the second real teacher export previews a newer academic update before changing deputy records",
      !!document.getElementById("deputyImportPreview") &&
        JSON.stringify(
          (await store.list()).find((row) => row.key === keyA).packet,
        ) === JSON.stringify(packet),
    );
    await click("confirm-import");
    const synchronized = (await store.list()).find(
        (row) => row.key === keyA,
      ).packet,
      syncedGrades = EduDeputyExchange.gradeRows(synchronized),
      syncedDual = syncedGrades.find(
        (row) => row.lessonId === ids.dual && row.studentId === ids.a,
      ),
      syncedGeneral = syncedGrades.find(
        (row) => row.lessonId === ids.general && row.studentId === ids.a,
      ),
      syncedModular = syncedGrades.find(
        (row) => row.lessonId === ids.modular && row.studentId === ids.a,
      ),
      stage = (row, termKind, kind) =>
        row.stages.find(
          (item) => item.termKind === termKind && item.stage === kind,
        );
    check(
      "DEPUTY_SYNC_GRADES",
      "file-based sync replaces actual corrected second-term grades while retaining the original first-term grades and missing-value semantics",
      stage(syncedDual, "first", "final").final === 6 &&
        stage(syncedDual, "second", "final").practical === 0 &&
        stage(syncedDual, "second", "final").theory === 12 &&
        Math.abs(stage(syncedDual, "second", "final").final - 3.6) < 1e-10 &&
        stage(syncedGeneral, "first", "final").final === 0 &&
        stage(syncedGeneral, "second", "final").final === 0 &&
        stage(syncedGeneral, "second", "midterm").final === null,
    );
    check(
      "DEPUTY_SYNC_ANNUAL",
      "file-based sync carries the same annual modular zero and cleared competency from both actual teacher term records",
      syncedModular.modules[0].m === 0 &&
        syncedModular.modules[0].c === null &&
        syncedModular.modules[0].final === null &&
        synchronized.periods.every((term) => {
          const score = term.school.classes
            .find((item) => item.id === ids.classroom)
            .lessons.find((item) => item.id === ids.modular).poudmans[0]
            .podScores[ids.a];
          return score.m === 0 && score.c == null;
        }),
    );
    const syncedAttendance = synchronized.periods.find(
      (period) => period.termKind === "second",
    ).sessions[0].attendance;
    check(
      "DEPUTY_SYNC_ATTENDANCE",
      "file-based sync updates actual corrected attendance without retaining stale presence or leave",
      syncedAttendance[ids.a] === "absent" &&
        syncedAttendance[ids.b] === "late:10",
    );
    check(
      "DEPUTY_SYNC_ISOLATION",
      "receiving corrected teacher data preserves deputy note identity/content/status and leaves the other sender byte-for-byte unchanged",
      (await store.followups()).length === 1 &&
        (await store.followups())[0].id === note.id &&
        (await store.followups())[0].note === note.note &&
        (await store.followups())[0].status === note.status &&
        JSON.stringify((await store.list()).find((row) => row.key === keyB)) ===
          otherBeforeSync,
    );
    const update = structuredClone(nextPacket);
    update.id = "deputy_audit_delete_update";
    update.periods.forEach((period) => period.revision++);
    update.periods[0].sessions = [];
    await file(update);
    check(
      "DEPUTY22",
      "a full-scope newer file previews deletion before replacing prior source sessions",
      document
        .getElementById("deputyImportPreview")
        .textContent.includes("حذف‌شده") &&
        (await store.list()).find((row) => row.key === keyA).packet.periods[0]
          .sessions.length === 1,
    );
    await click("confirm-import");
    check(
      "DEPUTY23",
      "confirmed full-scope update applies source deletions while preserving deputy followups and the other sender",
      (await store.list()).find((row) => row.key === keyA).packet.periods[0]
        .sessions.length === 0 &&
        (await store.list()).find((row) => row.key === keyB).packet.periods[0]
          .sessions.length === 1 &&
        (await store.followups())[0].note === "پیش‌نویس ویرایش منبع الف",
    );
    await file(packet);
    check(
      "DEPUTY24",
      "resending the original older file after a source update cannot resurrect deleted sessions",
      EduDeputyUI.status().error &&
        (await store.list()).find((row) => row.key === keyA).packet.periods[0]
          .sessions.length === 0,
    );
    const concurrent = structuredClone(update);
    concurrent.id = "deputy_audit_concurrent_import";
    concurrent.periods.forEach((period) => period.revision++);
    await file(concurrent);
    await store.commit(await store.preview(concurrent));
    await click("confirm-import");
    check(
      "DEPUTY_RACE",
      "a real second IndexedDB connection invalidates a held import preview instead of silently overwriting newer receipt data",
      EduDeputyUI.status().error &&
        (await store.list()).find((row) => row.key === keyA).packet.periods[0]
          .revision === concurrent.periods[0].revision &&
        (await store.followups())[0].id === note.id,
    );
    const backup = await store.backup(),
      exportedBackup = await downloadAction("backup");
    check(
      "DEPUTY25",
      "the actual deputy backup button exports a separate validated backup containing all sources and notes",
      exportedBackup.value.format === "EduManager.DeputyBackup" &&
        EduDeputyStore.validateBackup(exportedBackup.value).streams.length ===
          2 &&
        exportedBackup.value.followups[0].id === note.id,
    );
    tab("followups");
    await click("toggle-note");
    check(
      "DEPUTY26",
      "a saved post-backup note change exists before exercising the restore path",
      (await store.followups())[0].status !== backup.followups[0].status,
    );
    const preRestoreState = await store.backup();
    await file(backup, "deputyRestoreFile");
    check(
      "DEPUTY27",
      "restoring a deputy backup requires its own explicit replacement consent",
      !!document.getElementById("deputyRestorePreview") &&
        document.querySelector('[data-deputy-action="confirm-restore"]')
          .disabled &&
        (await store.followups())[0].status !== backup.followups[0].status,
    );
    const consent = document.getElementById("deputyRestoreConsent");
    consent.checked = true;
    consent.dispatchEvent(new Event("change", { bubbles: true }));
    await click("confirm-restore");
    check(
      "DEPUTY28",
      "the real deputy restore replaces only its independent data and restores source snapshots plus note content/status",
      (await store.list()).length === 2 &&
        (await store.followups())[0].status === backup.followups[0].status &&
        (await store.followups())[0].note === backup.followups[0].note &&
        !EduDeputyUI.status().error,
    );
    const safety = await downloadAction("safety-backup");
    check(
      "DEPUTY_SAFETY",
      "the actual last-restore safety download contains the displaced deputy records and notes without changing the restored live state",
      safety.name.startsWith("kelas-yar-deputy-before-restore-") &&
        EduDeputyStore.validateBackup(safety.value).followups[0].status ===
          preRestoreState.followups[0].status &&
        JSON.stringify(safety.value.streams) ===
          JSON.stringify(preRestoreState.streams) &&
        (await store.followups())[0].status === backup.followups[0].status &&
        !JSON.stringify(safety.value).includes('"lastSafety"'),
    );
    check(
      "DEPUTY_COMPACT_BACKUPS",
      "actual deputy backup and safety downloads use compact UTF-8 JSON matching the validator's byte limit",
      [exportedBackup, safety].every(
        (file) =>
          file.text === JSON.stringify(file.value) &&
          file.bytes === new TextEncoder().encode(file.text).byteLength,
      ),
      { backupBytes: exportedBackup.bytes, safetyBytes: safety.bytes },
    );
    const absentSource = structuredClone(nextPacket);
    absentSource.id = "deputy_audit_absent_restore_epoch";
    absentSource.sender.code = "DEPUTY-EPOCH-NEW";
    const heldAbsentPreview = await store.preview(absentSource),
      beforePeerRestore = await store.backup(),
      peer = await EduDeputyStore.open();
    try {
      await peer.restore(beforePeerRestore, beforePeerRestore.revision);
      const restoredPeerState = await peer.backup();
      let rejectedCode = "";
      try {
        await store.commit(heldAbsentPreview);
      } catch (error) {
        rejectedCode = error.code;
      }
      const afterRejectedCommit = await store.backup();
      check(
        "DEPUTY_ABSENT_RESTORE_EPOCH",
        "a real restore on a second connection rejects a pre-restore absent-source preview even though its source version remains zero",
        heldAbsentPreview.version === 0 &&
          rejectedCode === "DEPUTY_REVISION_CONFLICT" &&
          afterRejectedCommit.revision === restoredPeerState.revision &&
          JSON.stringify(afterRejectedCommit.streams) ===
            JSON.stringify(restoredPeerState.streams) &&
          JSON.stringify(afterRejectedCommit.followups) ===
            JSON.stringify(restoredPeerState.followups),
        {
          heldSourceVersion: heldAbsentPreview.version,
          rejection: rejectedCode,
          sources: afterRejectedCommit.streams.length,
          notes: afterRejectedCommit.followups.length,
        },
      );
      const freshAbsentPreview = await store.preview(absentSource);
      check(
        "DEPUTY_FRESH_RESTORE_EPOCH",
        "a fresh absent-source preview reads the newer restore epoch without creating a third source or changing existing notes",
        freshAbsentPreview.restoreRevision >
          heldAbsentPreview.restoreRevision &&
          freshAbsentPreview.version === 0 &&
          freshAbsentPreview.plan.status === "new" &&
          (await store.list()).length === 2 &&
          (await store.followups()).length === 1,
        {
          previousEpoch: heldAbsentPreview.restoreRevision,
          freshEpoch: freshAbsentPreview.restoreRevision,
        },
      );
    } finally {
      peer.close();
    }
    await EduDeputyUI.refresh();
    tab("reports");
    change("deputySource", keyA);
    change("deputyTerm", "all");
    window.__deputyAuditExpected = {
      keyA,
      keyB,
      noteId: note.id,
      noteText: backup.followups[0].note,
    };
    return { cases, original, expected: window.__deputyAuditExpected };
  } catch (error) {
    check(
      "DEPUTY99",
      "teacher exchange, deputy import, reporting, followup and backup restore complete",
      false,
      { error: error.stack || String(error) },
    );
    return { cases, original, expected: null };
  } finally {
    store.close();
  }
}

async function run({ cdp, evaluate, cases, delay }) {
  const fs = require("node:fs"),
    path = require("node:path"),
    os = require("node:os"),
    artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "edu-deputy-browser-"));
  const record = (id, name, pass, observed = {}) =>
    cases.push({ id, name, pass: !!pass, observed });
  const inspectManifest = async (role) => {
    const result = await cdp("Page.getAppManifest"),
      content = JSON.parse(result.data),
      install = await cdp("Page.getInstallabilityErrors"),
      expectedEntry = role === "teacher" ? "EduManager.html" : "Deputy.html",
      scope = new URL(content.scope, result.url),
      start = new URL(content.start_url, result.url),
      id = new URL(content.id, result.url),
      base = new URL("./", result.url),
      errors = install.installabilityErrors || [];
    record(
      "DEPUTY_MANIFEST_" + role,
      "Chromium parses the " +
        role +
        " manifest with a stable separate identity and its own entry-file scope",
      scope.href === new URL(expectedEntry, base).href &&
        start.pathname === scope.pathname &&
        id.href ===
          new URL(role === "teacher" ? "./" : "./deputy", result.url).href &&
        !result.errors.length &&
        !errors.some((error) =>
          /scope|start.?url|invalid.manifest/i.test(error.errorId),
        ),
      {
        role,
        manifest: result.url,
        scope: scope.href,
        start: start.href,
        id: id.href,
        parseErrors: result.errors,
        installabilityErrors: errors,
      },
    );
  };
  await require("./browser-ready.cjs")({ cdp, evaluate, delay });
  const teacherURL = await evaluate("location.href"),
    deputyURL = new URL("Deputy.html", teacherURL).href;
  const navigate = async (url, deputy, { reload = false } = {}) => {
    await evaluate("globalThis.__deputyAuditBeforeNavigation=true");
    if (reload) await cdp("Page.reload");
    else await cdp("Page.navigate", { url });
    for (let i = 0; i < 200; i++) {
      try {
        if (
          await evaluate(
            "!globalThis.__deputyAuditBeforeNavigation && " +
              (deputy
                ? "!!globalThis.EduDeputyUI?.status().ready"
                : "!!globalThis.EduV24?.getReportContext().ready"),
          )
        )
          return;
      } catch (error) {
        if (
          !/Execution context was destroyed|Cannot find (?:default execution )?context|Inspected target navigated/i.test(
            error.message || String(error),
          )
        )
          throw error;
      }
      await delay(100);
    }
    throw Error(
      "Deputy browser navigation did not reach a fresh ready context: " + url,
    );
  };
  let teacher, deputy;
  try {
    await inspectManifest("teacher");
    teacher = {
      original: await evaluate("EduV24.snapshotInstallation()"),
      before: null,
    };
    teacher = await evaluate(
      "(" +
        prepareTeacherExchange.toString() +
        ")(" +
        require("./flows/deputyTeacherEdits.cjs").toString() +
        ")",
    );
    cases.push(...teacher.cases);
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 900,
      screenWidth: 1280,
      screenHeight: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const teacherCalendar = await evaluate(
      "(async()=>{await document.fonts.ready;goReports();state.reportTab='daily';render();let date=document.querySelector('.periodic-controls input[type=date]');date.value='2026-11-01';date.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,30));initShamsiPickers();date=document.querySelector('.periodic-controls input[type=date]');date.nextElementSibling.click();const result=(" +
        calendarSnapshot.toString() +
        ")();closeShamsiCalendar();return result})()",
    );
    record(
      "DEPUTY_CALENDAR_TEACHER_BASELINE",
      "the real teacher report opens the shared calendar with the fixed selected month used for deputy parity",
      teacherCalendar.resources.length === 1 &&
        teacherCalendar.markup.includes('data-calendar-action="select"') &&
        teacherCalendar.styles.popup.width > 0,
      { resources: teacherCalendar.resources, styles: teacherCalendar.styles },
    );
    await navigate(deputyURL, true);
    await inspectManifest("deputy");
    deputy = await evaluate(
      "(" +
        exerciseDeputyUI.toString() +
        ")(" +
        JSON.stringify(teacher.packet) +
        "," +
        JSON.stringify(teacher.ids) +
        "," +
        JSON.stringify(teacher.nextPacket) +
        ")",
    );
    cases.push(...deputy.cases);
    if (!deputy.expected) return;
    await require("./deputy-student-browser.cjs")({
      cdp,
      evaluate,
      cases,
      ids: teacher.ids,
      expected: deputy.expected,
      artifacts,
      teacherCalendar,
      calendarSnapshot: calendarSnapshot.toString(),
    });
    for (const [width, height, touch] of [
      [320, 780, true],
      [390, 844, true],
      [844, 390, true],
      [768, 1024, true],
      [1024, 768, true],
      [1280, 900, false],
    ]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        screenWidth: width,
        screenHeight: height,
        deviceScaleFactor: 1,
        mobile: touch,
        screenOrientation: {
          type: width > height ? "landscapePrimary" : "portraitPrimary",
          angle: width > height ? 90 : 0,
        },
      });
      await cdp("Emulation.setTouchEmulationEnabled", {
        enabled: touch,
        maxTouchPoints: touch ? 5 : 1,
      });
      await cdp("Emulation.setEmulatedMedia", {
        media: "",
        features: [
          { name: "pointer", value: touch ? "coarse" : "fine" },
          { name: "hover", value: touch ? "none" : "hover" },
        ],
      });
      for (const view of [
        "receive",
        "reports",
        "calendar",
        "followups",
        "import-preview",
        "restore-preview",
        "backup",
      ]) {
        const result = await evaluate(
          "(" +
            require("./flows/deputyLayout.cjs").toString() +
            ")(" +
            JSON.stringify({
              width,
              height,
              touch,
              view,
              packet: teacher.nextPacket,
            }) +
            ")",
        );
        cases.push(...result);
        if (
          ["receive", "reports", "followups"].includes(view) ||
          width === 390 ||
          width === 1024
        ) {
          const filename = path.join(
              artifacts,
              "deputy-" + view + "-" + width + "x" + height + ".png",
            ),
            shot = await cdp("Page.captureScreenshot", { format: "png" });
          fs.writeFileSync(filename, Buffer.from(shot.data, "base64"));
          result[0].observed.screenshot = filename;
        }
        if (view === "followups" && width === 390) {
          await evaluate(
            "(()=>{const field=document.getElementById('deputyNoteText');for(let el=field.parentElement;el;el=el.parentElement)if(el.tagName==='DETAILS')el.open=true;field.focus();field.scrollIntoView({block:'center',behavior:'instant'})})()",
          );
          await cdp("Input.dispatchKeyEvent", {
            type: "keyDown",
            key: "Tab",
            code: "Tab",
            windowsVirtualKeyCode: 9,
            nativeVirtualKeyCode: 9,
          });
          await cdp("Input.dispatchKeyEvent", {
            type: "keyUp",
            key: "Tab",
            code: "Tab",
            windowsVirtualKeyCode: 9,
            nativeVirtualKeyCode: 9,
          });
          const keyboard = await evaluate(
            "(()=>{const el=document.activeElement,r=el.getBoundingClientRect(),nav=document.getElementById('deputyBottomNav');return {tag:el.tagName,label:el.textContent.trim(),focus:el.matches(':focus-visible'),top:r.top,bottom:r.bottom,limit:nav?.getBoundingClientRect().top||innerHeight}})()",
          );
          record(
            "DEPUTY_KEYBOARD",
            "keyboard Tab moves from followup text to a visible, focus-indicated action above mobile navigation",
            keyboard.tag === "BUTTON" &&
              keyboard.focus &&
              keyboard.top >= 0 &&
              keyboard.bottom <= keyboard.limit + 1,
            keyboard,
          );
        }
        if (view === "import-preview")
          await evaluate(
            "document.querySelector('[data-deputy-action=cancel-preview]').click()",
          );
        if (view === "restore-preview")
          await evaluate(
            "document.querySelector('[data-deputy-action=cancel-restore]').click()",
          );
        if (view === "calendar") {
          await evaluate(
            "document.querySelector('#calPopup .selected,#calPopup .today,#calPopup .cal-days button:not(:disabled)').focus()",
          );
          await cdp("Input.dispatchKeyEvent", {
            type: "keyDown",
            key: "Escape",
            code: "Escape",
            windowsVirtualKeyCode: 27,
            nativeVirtualKeyCode: 27,
          });
          await cdp("Input.dispatchKeyEvent", {
            type: "keyUp",
            key: "Escape",
            code: "Escape",
            windowsVirtualKeyCode: 27,
            nativeVirtualKeyCode: 27,
          });
          const escaped = await evaluate(
            "new Promise(resolve=>requestAnimationFrame(()=>resolve({closed:!document.getElementById('calPopup')?.classList.contains('open'),focus:document.activeElement?.id})))",
          );
          record(
            "DEPUTY_CALENDAR_ESCAPE_" + width + "x" + height,
            "actual Escape dismisses the Jalali dialog and restores its opener at " +
              width +
              "x" +
              height,
            escaped.closed && escaped.focus === "deputyFrom-shamsi",
            escaped,
          );
        }
      }
    }
    await cdp("Emulation.setTouchEmulationEnabled", { enabled: false });
    await cdp("Emulation.setEmulatedMedia", { media: "", features: [] });
    await evaluate(
      "[...document.querySelectorAll('[data-deputy-tab=reports]')].find(node=>node.getClientRects().length).click();document.getElementById('deputyTerm').value='all';document.getElementById('deputyTerm').dispatchEvent(new Event('change',{bubbles:true}))",
    );
    await evaluate(
      "window.print=()=>{window.__deputyPrinted=true};document.querySelector('[data-deputy-action=print]').click()",
    );
    const printState = await evaluate(
      "({printed:!!window.__deputyPrinted,active:document.body.classList.contains('ed-print-report'),allOpen:[...document.querySelectorAll('.ed-printable details')].every(node=>node.open),noteLeak:document.querySelector('.ed-printable').textContent.includes('پیش‌نویس ویرایش منبع الف')})",
    );
    await cdp("Emulation.setEmulatedMedia", { media: "print" });
    const printGeometry = await evaluate(
      "({app:{display:getComputedStyle(document.getElementById('deputyApp')).display,height:document.getElementById('deputyApp').getBoundingClientRect().height},report:{display:getComputedStyle(document.querySelector('.ed-printable')).display,height:document.querySelector('.ed-printable').getBoundingClientRect().height},cards:[...document.querySelectorAll('.ed-printable .ed-grade')].filter(node=>node.getBoundingClientRect().height>0).length})",
    );
    const printShot = await cdp("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    fs.writeFileSync(
      path.join(artifacts, "deputy-print.png"),
      Buffer.from(printShot.data, "base64"),
    );
    const pdf = await cdp("Page.printToPDF", {
        printBackground: true,
        preferCSSPageSize: true,
      }),
      pdfName = path.join(artifacts, "deputy-report.pdf");
    fs.writeFileSync(pdfName, Buffer.from(pdf.data, "base64"));
    record(
      "DEPUTY_PDF",
      "actual deputy report printing opens report details and produces PDF without private followup notes",
      printState.printed &&
        printState.active &&
        printState.allOpen &&
        !printState.noteLeak &&
        printGeometry.app.display !== "none" &&
        printGeometry.app.height > 100 &&
        printGeometry.report.display !== "none" &&
        printGeometry.report.height > 100 &&
        printGeometry.cards > 0 &&
        Buffer.from(pdf.data, "base64").length > 10000 &&
        Buffer.from(pdf.data, "base64").subarray(0, 5).toString() === "%PDF-",
      {
        ...printState,
        ...printGeometry,
        bytes: Buffer.from(pdf.data, "base64").length,
        pdf: pdfName,
        screenshot: path.join(artifacts, "deputy-print.png"),
      },
    );
    await cdp("Emulation.setEmulatedMedia", { media: "" });
    await evaluate("window.dispatchEvent(new Event('afterprint'))");
    await navigate(deputyURL, true, { reload: true });
    const persisted = await evaluate(
      "(async()=>{const s=await EduDeputyStore.open();try{return {rows:(await s.list()).length,notes:await s.followups()}}finally{s.close()}})()",
    );
    record(
      "DEPUTY_RELOAD",
      "deputy sources and followups survive a fresh browser reload",
      persisted.rows === 2 &&
        persisted.notes.some(
          (note) =>
            note.id === deputy.expected.noteId &&
            note.note === deputy.expected.noteText,
        ),
    );
    await evaluate("navigator.serviceWorker.ready.then(()=>true)");
    await cdp("Network.enable");
    await cdp("Network.emulateNetworkConditions", {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    await cdp("Network.overrideNetworkState", {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    const networkBefore = await evaluate(
      "fetch(new URL('./__deputy_offline_probe__?before='+Date.now(),location.href),{cache:'no-store'}).then(response=>({blocked:false,status:response.status}),error=>({blocked:true,error:error.name}))",
    );
    try {
      await navigate(deputyURL, true, { reload: true });
      const offline = await evaluate(
        "(async()=>{const s=await EduDeputyStore.open();try{return {ready:EduDeputyUI.status().ready,rows:(await s.list()).length,notes:(await s.followups()).length,offline:!navigator.onLine,network:await fetch(new URL('./__deputy_offline_probe__?after='+Date.now(),location.href),{cache:'no-store'}).then(response=>({blocked:false,status:response.status}),error=>({blocked:true,error:error.name}))}}finally{s.close()}})()",
      );
      record(
        "DEPUTY_OFFLINE",
        "the cached deputy entry reloads fully offline with its independent sources and followups",
        offline.ready &&
          networkBefore.blocked &&
          offline.network.blocked &&
          offline.rows === 2 &&
          offline.notes === 1,
        { ...offline, networkBefore },
      );
      await navigate(
        new URL("Deputy.html?audit=offline-role", deputyURL).href,
        true,
      );
      const deputyQuery = await evaluate(
        "(async()=>({deputy:!!globalThis.EduDeputyUI?.status().ready,teacher:!!globalThis.EduV24,query:location.search,blocked:await fetch(new URL('./__role_probe__?deputy='+Date.now(),location.href),{cache:'no-store'}).then(()=>false,()=>true)}))()",
      );
      record(
        "DEPUTY_QUERY_OFFLINE",
        "a query-string deputy entry remains the deputy shell fully offline, not the teacher navigation fallback",
        deputyQuery.deputy &&
          !deputyQuery.teacher &&
          deputyQuery.blocked &&
          deputyQuery.query.includes("offline-role"),
        deputyQuery,
      );
      await navigate(
        new URL("EduManager.html?audit=offline-role", teacherURL).href,
        false,
      );
      const teacherQuery = await evaluate(
        "(async()=>({teacher:!!globalThis.EduV24?.getReportContext().ready,deputy:!!globalThis.EduDeputyUI,query:location.search,blocked:await fetch(new URL('./__role_probe__?teacher='+Date.now(),location.href),{cache:'no-store'}).then(()=>false,()=>true)}))()",
      );
      record(
        "TEACHER_QUERY_OFFLINE",
        "a query-string teacher entry remains the teacher shell fully offline, never the deputy shell",
        teacherQuery.teacher &&
          !teacherQuery.deputy &&
          teacherQuery.blocked &&
          teacherQuery.query.includes("offline-role"),
        teacherQuery,
      );
    } finally {
      await cdp("Network.overrideNetworkState", {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
      await cdp("Network.emulateNetworkConditions", {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
    }
  } catch (error) {
    record(
      "DEPUTY_BROWSER_ERROR",
      "end-to-end deputy browser workflow completes",
      false,
      { error: error.stack || String(error), artifacts },
    );
  } finally {
    try {
      await cdp("Emulation.setEmulatedMedia", { media: "" });
      await cdp("Emulation.setTouchEmulationEnabled", { enabled: false });
      await cdp("Network.overrideNetworkState", {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
      await cdp("Network.emulateNetworkConditions", {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
      if (deputy?.original) {
        if (!(await evaluate("!!globalThis.EduDeputyUI?.status().ready")))
          await navigate(deputyURL, true);
        await evaluate(
          "(async()=>{const s=await EduDeputyStore.open();try{await s.restore(" +
            JSON.stringify(deputy.original) +
            ",(await s.backup()).revision)}finally{s.close()}})()",
        );
      }
      if (teacher) {
        await navigate(teacherURL, false);
        const signature = await evaluate(
          "(async()=>{await EduV24.test.settle();const s=await EduV24.snapshotInstallation();return JSON.stringify({catalog:s.stores.catalog,records:s.stores.records,reports:s.stores.reports})})()",
        );
        if (teacher.before)
          record(
            "DEPUTY_ISOLATION",
            "all deputy imports, followups, updates, restore and offline reload leave teacher academic records untouched",
            signature === teacher.before,
          );
        await evaluate(
          "(async()=>{closeModal();EduV24.previewFullBackup(" +
            JSON.stringify(teacher.original) +
            ");document.getElementById('fullRestoreConfirmed').checked=true;await EduV24.restoreFullBackup();await EduV24.test.settle();closeModal()})()",
        );
      }
      await cdp("Emulation.clearDeviceMetricsOverride");
    } catch (error) {
      record(
        "DEPUTY_CLEANUP",
        "the isolated deputy fixture restores its starting teacher and deputy installations",
        false,
        { error: error.stack || String(error) },
      );
    }
  }
}

module.exports = run;
if (require.main === module)
  require("./data-integrity.cjs")
    .main({ stage: "deputy-exchange-browser", runExtra: run })
    .catch((error) => {
      console.error(error);
      process.exitCode = 2;
    });
