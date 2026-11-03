// A selected assessment is an editing context inside the current academic
// year. Its storage term never becomes the application's active workspace.
const assessmentContext = (() => {
  let selected = null,
    selectionGeneration = 0,
    flushingAssessment = null;
  const fields = new Set([
    "practical",
    "theory",
    "midtermPractical",
    "midtermTheory",
  ]);
  const scopeSuffix = (context) =>
    "-assessment-" +
    context.classroom.id.length +
    "_" +
    context.classroom.id +
    "-" +
    context.lesson.id.length +
    "_" +
    context.lesson.id +
    "-" +
    context.stage;
  const stageField = (context, field) =>
    fields.has(field) &&
    field.startsWith("midterm") === (context.stage === "midterm") &&
    !(
      context.lesson.gradingPolicy?.subjectType === "general" &&
      ["practical", "midtermPractical"].includes(field)
    );
  const owner = (context) => context.owner;
  const storageKey = (context) =>
    "Edu24.drafts." + context.period.id + "." + owner(context);
  const entryKey = (item) => item.sid + "|" + item.field;
  const getClass = (data, schoolId, classId) =>
    data.schools
      .find((school) => school.id === schoolId)
      ?.classes.find((classroom) => classroom.id === classId);
  function check(context, { write = false } = {}) {
    assertWorkspaceReadable();
    if (
      selected !== context ||
      connection !== context.connection ||
      workspace.id !== context.origin.id ||
      workspace.year !== context.origin.year ||
      (workspace.id === context.period.id &&
        workspace.revision !== context.origin.revision) ||
      periodLoading ||
      resetBusy ||
      connectionRetired
    )
      throw Error(
        "صفحه یا اطلاعات سال تغییر کرده است؛ صفحه را دوباره بارگذاری و پیش‌نویس‌های محفوظ را بررسی کنید.",
      );
    if (write && context.period.closed)
      throw Error(
        "این مرحلهٔ ارزشیابی فقط قابل مشاهده است؛ ابتدا ترم آن را بازگشایی کنید.",
      );
    if (write && (context.stale || !context.authenticated))
      throw Error(
        "اطلاعات یا دسترسی این مرحله تغییر کرده است؛ صفحه را دوباره بارگذاری و پیش‌نویس‌های محفوظ را بررسی کنید.",
      );
  }
  function handles(input) {
    return !!input?.dataset?.assessmentContext;
  }
  function inputContext(input) {
    const context = selected;
    if (!context || input.dataset.assessmentContext !== context.token)
      throw Error(
        "کادر نمره به مرحلهٔ فعلی تعلق ندارد؛ مرحله را دوباره باز کنید.",
      );
    check(context, { write: true });
    if (
      input.dataset.class !== context.classroom.id ||
      input.dataset.lesson !== context.lesson.id ||
      !context.classroom.students.some(
        (student) => student.id === input.dataset.student,
      ) ||
      !stageField(context, input.dataset.field)
    )
      throw Error("دانش‌آموز، درس یا نوع نمرهٔ این مرحله معتبر نیست.");
    return context;
  }
  function showInputState(input, item) {
    input.setAttribute("aria-invalid", item.error ? "true" : "false");
    const note = input.parentElement?.querySelector(".grade-note");
    if (note) {
      note.textContent = item.error || "در انتظار ذخیره";
      note.dataset.state = item.error ? "error" : "pending";
    }
    const row = input.closest?.(".assessment-student");
    if (row)
      row.dataset.editState = [...selected.entries.values()].some(
        (entry) => entry.sid === input.dataset.student && entry.error,
      )
        ? "error"
        : "pending";
  }
  function refreshInput(input) {
    const context = selected;
    if (!context || input.dataset.assessmentContext !== context.token) return;
    const item = context.entries.get(
      entryKey({ sid: input.dataset.student, field: input.dataset.field }),
    );
    input.setAttribute("aria-invalid", item?.error ? "true" : "false");
    const note = input.parentElement?.querySelector(".grade-note");
    if (note) {
      const filled = input.value.trim() !== "";
      note.textContent = item
        ? item.error || "در انتظار ذخیره"
        : filled
          ? "ذخیره شد"
          : "";
      note.dataset.state = item
        ? item.error
          ? "error"
          : "pending"
        : filled
          ? "saved"
          : "idle";
    }
  }
  function sameInstallation(context) {
    return (
      !context.abandoned &&
      !resetBusy &&
      !connectionRetired &&
      connection === context.connection &&
      (typeof installationToken === "undefined" ? "" : installationToken) ===
        context.installation
    );
  }
  function persist(context) {
    if (!sameInstallation(context)) return Promise.resolve();
    const entry = {
      key: storageKey(context),
      workspace: context.period.id,
      owner: owner(context),
      generation: ++context.generation,
      entries: clone([...context.entries.values()]),
      updatedAt: new Date().toISOString(),
    };
    let localFailure = false;
    try {
      localStorage.setItem(entry.key, JSON.stringify(entry));
    } catch {
      localFailure = true;
    }
    const targetConnection = context.connection;
    draftWritesPending++;
    const operation = draftWriter
      .catch(() => {})
      .then(async () => {
        if (!sameInstallation(context) || connection !== targetConnection)
          return;
        const tx = targetConnection.transaction(
            ["records", "drafts"],
            "readwrite",
          ),
          done = transactionDone(tx),
          store = tx.objectStore("drafts"),
          epoch = tx
            .objectStore("records")
            .get(
              typeof RESET_RECORD_KEY === "undefined"
                ? "@installation-reset"
                : RESET_RECORD_KEY,
            );
        let persistenceFailure;
        epoch.onsuccess = () => {
          if (
            (epoch.result?.value?.token || "") !== context.installation ||
            !sameInstallation(context)
          ) {
            persistenceFailure = Object.assign(
              Error(
                "اطلاعات سیستم در پنجرهٔ دیگری جایگزین شده است؛ پیش‌نویس قدیمی ثبت نشد.",
              ),
              { code: "INSTALLATION_CHANGED" },
            );
            // A replacement may reuse period IDs and revisions. Do not let
            // this tab's rejected local draft reappear after the next reload.
            try {
              if (localStorage.getItem(entry.key) === JSON.stringify(entry))
                localStorage.removeItem(entry.key);
            } catch {}
            tx.abort();
            return;
          }
          const request = store.get(entry.key);
          request.onsuccess = () => {
            if (
              !request.result ||
              request.result.generation <= entry.generation
            )
              store.put(entry);
          };
        };
        try {
          await done;
        } catch (error) {
          throw persistenceFailure || error;
        }
        context.persistenceError = "";
        if (localFailure && entry.entries.length)
          setStatus("پیش‌نویس این مرحله در بانک داخلی محفوظ است.", "pending");
      })
      .catch((error) => {
        context.persistenceError = error.message;
        draftRecoveryFailed = true;
        setStatus(
          "پیش‌نویس مرحله هنوز پایدار نشده است: " + error.message,
          "error",
        );
        throw error;
      })
      .finally(() => {
        draftWritesPending--;
      });
    draftWriter = operation;
    operation.catch(() => {});
    return operation;
  }
  async function recover(context) {
    const prefix = "Edu24.drafts." + context.period.id + ".",
      rows = new Map(),
      add = (row) => {
        if (
          !row?.key?.startsWith(prefix) ||
          !row.key.split(".")[3]?.includes("-assessment") ||
          !Array.isArray(row.entries) ||
          !Number.isSafeInteger(row.generation)
        )
          return;
        const previous = rows.get(row.key);
        if (
          !previous ||
          previous.generation < row.generation ||
          (previous.generation === row.generation &&
            previous.updatedAt < row.updatedAt)
        )
          rows.set(row.key, row);
      };
    try {
      for (const key of Object.keys(localStorage))
        if (key.startsWith(prefix)) {
          try {
            add(JSON.parse(localStorage.getItem(key)));
          } catch {}
        }
    } catch {}
    const tx = context.connection.transaction("drafts", "readonly"),
      done = transactionDone(tx),
      saved = await requestPromise(
        tx.objectStore("drafts").index("workspace").getAll(context.period.id),
      );
    await done;
    check(context);
    for (const row of saved) add(row);
    const candidates = [...rows.values()].sort(
      (a, b) =>
        b.generation - a.generation ||
        String(b.updatedAt).localeCompare(String(a.updatedAt)),
    );
    context.generation = Math.max(
      0,
      ...candidates.map((row) => row.generation),
    );
    const suffix = scopeSuffix(context),
      relevant = candidates.filter(
        (row) =>
          row.key.endsWith(suffix) ||
          row.entries.some(
            (item) =>
              item?.classId === context.classroom.id &&
              item?.lid === context.lesson.id &&
              stageField(context, item?.field),
          ),
      ),
      empty = relevant
        .filter((row) => !row.entries.length)
        .sort(
          (a, b) =>
            String(b.updatedAt).localeCompare(String(a.updatedAt)) ||
            b.generation - a.generation,
        )[0],
      latest = new Map();
    for (const row of relevant) {
      if (
        empty &&
        String(row.updatedAt) <= String(empty.updatedAt) &&
        row.generation <= empty.generation
      )
        continue;
      for (const original of row.entries) {
        if (
          !isSupportedGradeDraft(original) ||
          original.kind !== "k" ||
          original.classId !== context.classroom.id ||
          original.lid !== context.lesson.id ||
          !stageField(context, original.field) ||
          !context.classroom.students.some(
            (student) => student.id === original.sid,
          )
        )
          continue;
        const key = entryKey(original),
          previous = latest.get(key);
        if (
          !previous ||
          String(row.updatedAt) > String(previous.row.updatedAt) ||
          (row.updatedAt === previous.row.updatedAt &&
            row.generation > previous.row.generation)
        )
          latest.set(key, { row, original });
      }
    }
    for (const { original } of latest.values()) {
      const item = clone(original);
      if (item.baseRevision !== context.period.revision || item.review) {
        item.review = true;
        item.error =
          "دادهٔ این مرحله تغییر کرده است؛ مقدار را بررسی و دوباره وارد کنید.";
      }
      context.entries.set(entryKey(item), item);
    }
  }
  async function select(kind, stage, identity) {
    if (
      !["first", "second"].includes(kind) ||
      !["midterm", "final"].includes(stage)
    )
      throw Error("مرحلهٔ ارزشیابی معتبر نیست.");
    await flush({ strict: true });
    assertWorkspaceReadable();
    const generation = ++selectionGeneration,
      origin = {
        id: workspace.id,
        revision: workspace.revision,
        year: workspace.year,
      },
      targetConnection = connection,
      assertOrigin = () => {
        if (
          generation !== selectionGeneration ||
          connection !== targetConnection ||
          workspace.id !== origin.id ||
          workspace.year !== origin.year ||
          workspace.revision !== origin.revision ||
          periodLoading ||
          resetBusy ||
          connectionRetired
        )
          throw Error(
            "صفحه یا سال هنگام انتخاب مرحله تغییر کرد؛ دوباره تلاش کنید.",
          );
      };
    const period = await ensureAcademicAssessmentTerm(kind);
    assertOrigin();
    if (
      !period ||
      period.year !== origin.year ||
      (period.termKind || academicTermKind(period.term)) !== kind
    )
      throw Error("نوبت ارزشیابی متعلق به سال فعال نیست.");
    const snapshot = await readWorkspaceSnapshot(period.id);
    assertOrigin();
    if (snapshot.period.revision !== period.revision)
      throw Error(
        "اطلاعات مرحله تغییر کرده است؛ انتخاب آن را دوباره انجام دهید.",
      );
    const classroom = getClass(
        snapshot.data,
        identity.schoolId,
        identity.classId,
      ),
      lesson = classroom?.lessons.find((item) => item.id === identity.lessonId);
    if (!lesson || lesson.gradeMode !== "kardanesh")
      throw Error("درس نظری و عملی در مرحلهٔ انتخاب‌شده وجود ندارد.");
    const password = snapshot.data.settings.password;
    if (password && period.id !== workspace.id) {
      const supplied = prompt(
        "برای ورود به نمرات نوبت " +
          (kind === "first" ? "اول" : "دوم") +
          "، رمز همان نوبت را وارد کنید:",
      );
      if (supplied === null || !(await verifyPassword(supplied, password)))
        throw Error("دسترسی به نمرات این نوبت تأیید نشد.");
      assertOrigin();
    }
    const context = {
      token: uid(),
      origin,
      connection: targetConnection,
      period: clone(snapshot.period),
      data: snapshot.data,
      classroom,
      lesson,
      schoolId: identity.schoolId,
      stage,
      password,
      authenticated: true,
      entries: new Map(),
      generation: 0,
      owner: documentToken + scopeSuffix({ classroom, lesson, stage }),
      installation:
        typeof installationToken === "undefined" ? "" : installationToken,
      timer: null,
      persistenceError: "",
    };
    selected = context;
    try {
      await recover(context);
      check(context);
    } catch (error) {
      if (selected === context) {
        context.abandoned = true;
        selected = null;
      }
      throw error;
    }
    if (context.entries.size)
      setStatus(
        "ورودی‌های ذخیره‌نشدهٔ این مرحله بازیابی شدند؛ پیام کادرها را بررسی کنید.",
        "pending",
      );
    return context;
  }
  function resolve(classroom, lesson) {
    const context = selected;
    if (
      !context ||
      context.origin.id !== workspace.id ||
      context.origin.year !== workspace.year ||
      context.classroom.id !== classroom?.id ||
      context.lesson.id !== lesson?.id
    )
      return null;
    if (
      workspace.id === context.period.id &&
      workspace.revision !== context.origin.revision
    )
      workspaceChanged({
        workspace: context.period.id,
        revision: workspace.revision,
      });
    return context;
  }
  function cell(classroom, lesson, student, field, { value = null } = {}) {
    const context = resolve(classroom, lesson);
    if (!context)
      return gradeCell(classroom, lesson, student, field, { value });
    const item = context.entries.get(entryKey({ sid: student.id, field })),
      shown = item ? item.value : (value ?? ""),
      locked = readOnly({ dataset: { assessmentContext: context.token } });
    return (
      '<div class="grade-editor"><input type="text" inputmode="decimal" autocomplete="off" dir="ltr" data-grade="1" data-kind="k" data-assessment-context="' +
      esc(context.token) +
      '" data-class="' +
      esc(classroom.id) +
      '" data-lesson="' +
      esc(lesson.id) +
      '" data-student="' +
      esc(student.id) +
      '" data-pod="" data-unit="" data-field="' +
      esc(field) +
      '" aria-invalid="' +
      (item?.error ? "true" : "false") +
      '" value="' +
      esc(shown) +
      '" placeholder="—" aria-label="' +
      esc(
        student.name +
          " " +
          (field === "practical" || field === "midtermPractical"
            ? "عملی"
            : "تئوری"),
      ) +
      '"' +
      (locked ? ' readonly aria-readonly="true"' : "") +
      '><button type="button" class="ghost grade-clear no-print" data-clear-grade aria-label="پاک‌کردن نمره"' +
      (locked ? " disabled" : "") +
      '>×</button><small class="grade-note" aria-live="polite" data-state="' +
      (item
        ? item.error
          ? "error"
          : "pending"
        : String(shown).trim() !== ""
          ? "saved"
          : "idle") +
      '">' +
      esc(item ? item.error || "در انتظار ذخیره" : "") +
      "</small></div>"
    );
  }
  function input(input) {
    const context = inputContext(input),
      item = {
        kind: "k",
        baseRevision: context.period.revision,
        classId: context.classroom.id,
        lid: context.lesson.id,
        sid: input.dataset.student,
        pid: "",
        uid: "",
        field: input.dataset.field,
        value: input.value,
        at: new Date().toISOString(),
      },
      parsed = parseGrade(item.value);
    item.error = parsed.ok ? "" : parsed.message;
    context.entries.set(entryKey(item), item);
    showInputState(input, item);
    persist(context);
    clearTimeout(context.timer);
    if (parsed.ok)
      context.timer = setTimeout(() => flush().catch(() => {}), 180);
    setStatus(
      parsed.ok ? "نمرهٔ این مرحله در انتظار ذخیره است." : parsed.message,
      parsed.ok ? "pending" : "error",
    );
  }
  function clear(input) {
    const context = inputContext(input);
    if (!confirm("نمرهٔ همین مرحله پاک شود؟ این تغییر در تاریخچه ثبت می‌شود."))
      return;
    const item = {
      kind: "k",
      baseRevision: context.period.revision,
      classId: context.classroom.id,
      lid: context.lesson.id,
      sid: input.dataset.student,
      pid: "",
      uid: "",
      field: input.dataset.field,
      value: "",
      remove: true,
      error: "",
      at: new Date().toISOString(),
    };
    context.entries.set(entryKey(item), item);
    input.value = "";
    showInputState(input, item);
    persist(context);
    flush().catch(() => {});
  }
  async function commit(context, entries) {
    check(context, { write: true });
    const snapshot = await readWorkspaceSnapshot(context.period.id);
    check(context, { write: true });
    if (
      snapshot.period.revision !== context.period.revision ||
      snapshot.period.closed ||
      snapshot.data.settings.password !== context.password
    ) {
      const error = Error(
        "نمرات یا دسترسی این مرحله در پنجرهٔ دیگری تغییر کرد؛ پیش‌نویس محفوظ است.",
      );
      error.code = "WORKSPACE_CONFLICT";
      throw error;
    }
    const classroom = getClass(
        snapshot.data,
        context.schoolId,
        context.classroom.id,
      ),
      lesson = classroom?.lessons.find((item) => item.id === context.lesson.id);
    if (!lesson || lesson.gradeMode !== "kardanesh")
      throw Error("درس مرحله دیگر وجود ندارد.");
    for (const [, item] of entries) {
      if (
        !classroom.students.some((student) => student.id === item.sid) ||
        !stageField(context, item.field)
      )
        throw Error("هنرجو یا نوع نمرهٔ مرحله تغییر کرده است.");
      const grades = lesson.kardaneshScores || (lesson.kardaneshScores = {}),
        target = writableScoreRecord(grades, item.sid);
      grades[item.sid] = target;
      if (item.remove) delete target[item.field];
      else {
        const result = parseGrade(item.value);
        if (!result.ok) throw Error(result.message);
        target[item.field] = result.value;
      }
    }
    deriveClass(classroom);
    validateV24({
      ...snapshot.data,
      schools: [
        {
          id: context.schoolId,
          name: snapshot.data.schools.find(
            (school) => school.id === context.schoolId,
          ).name,
          classes: [classroom],
        },
      ],
      masterSchedule: {},
      sessions: [],
    });
    const records = collectRecords(snapshot.data, { classId: classroom.id }),
      plan = EduRecordCommitPlan.create(records, snapshot.records),
      annualChanged = [],
      directorySourceUpdates = [];
    if (!plan.changed.length && !plan.removed.length) return snapshot;
    const next = await EduRecordTransaction.commit({
      connection: context.connection,
      workspace: snapshot.period,
      records,
      ...plan,
      action:
        "ثبت نمرهٔ " +
        (context.stage === "midterm" ? "میان‌ترم " : "پایان‌ترم ") +
        ((snapshot.period.termKind ||
          academicTermKind(snapshot.period.term)) === "first"
          ? "اول"
          : "دوم"),
      keepUndo: true,
      normalizedName,
      academicTermKind,
      annualChanged,
      decodeRecords: decodeWorkspaceRecords,
      historicalRoster,
      directorySourceUpdates,
    });
    const active =
      connection === context.connection &&
      workspace.id === snapshot.period.id &&
      workspace.revision === snapshot.period.revision &&
      !resetBusy &&
      !connectionRetired;
    if (active) {
      const liveClass = getClass(db, context.schoolId, classroom.id);
      for (const updated of classroom.lessons) {
        const liveLesson = liveClass?.lessons.find(
          (item) => item.id === updated.id,
        );
        if (liveLesson)
          liveLesson.kardaneshScores = clone(updated.kardaneshScores);
      }
      for (const [key, json] of plan.changed) committed.set(key, json);
      for (const key of plan.removed) committed.delete(key);
      workspace = next;
      context.origin.revision = next.revision;
    }
    for (const [key, json] of plan.changed) snapshot.records.set(key, json);
    snapshot.period = next;
    context.period = clone(next);
    if (connection === context.connection && !resetBusy && !connectionRetired) {
      broadcast({ workspace: next.id, revision: next.revision });
      for (const change of annualChanged)
        broadcast({ ...change, annualModular: true });
      scheduleSingleFile();
    }
    return snapshot;
  }
  async function flush({ strict = false } = {}) {
    if (flushingAssessment) {
      await flushingAssessment;
      if (strict && selected?.entries.size)
        throw Error("ورودی ذخیره‌نشدهٔ مرحله را بررسی کنید.");
      return;
    }
    const context = selected;
    if (!context || !context.entries.size) return;
    clearTimeout(context.timer);
    if (
      strict &&
      [...context.entries.values()].some(
        (item) => item.review || (!item.remove && !parseGrade(item.value).ok),
      )
    )
      throw Error(
        "ابتدا پیش‌نویس نامعتبر یا نیازمند بررسی این مرحله را اصلاح کنید.",
      );
    const entries = [...context.entries].filter(
      ([, item]) => !item.review && (item.remove || parseGrade(item.value).ok),
    );
    if (!entries.length) return;
    check(context, { write: true });
    busy++;
    paintStatus();
    const operation = writer
      .catch(() => {})
      .then(() => commit(context, entries));
    writer = operation;
    flushingAssessment = operation
      .then(async (snapshot) => {
        context.period = clone(snapshot.period);
        context.data = snapshot.data;
        context.classroom = getClass(
          snapshot.data,
          context.schoolId,
          context.classroom.id,
        );
        context.lesson = context.classroom.lessons.find(
          (item) => item.id === context.lesson.id,
        );
        for (const [key, item] of entries)
          if (context.entries.get(key) === item) context.entries.delete(key);
        for (const item of context.entries.values())
          item.baseRevision = context.period.revision;
        await persist(context);
        if (selected === context) {
          setStatus(
            context.entries.size
              ? "برخی ورودی‌های مرحله هنوز کامل نیستند."
              : "نمرات این مرحله ذخیره شدند.",
            context.entries.size ? "pending" : "saved",
          );
          refreshGradeResults();
        }
      })
      .catch(async (error) => {
        for (const [, item] of entries) {
          item.error = "ذخیره نشد: " + error.message;
          if (error.code === "WORKSPACE_CONFLICT") item.review = true;
        }
        await persist(context).catch(() => {});
        if (selected === context) {
          setStatus(
            "نمرات این مرحله ذخیره نشدند؛ پیش‌نویس محفوظ است. " + error.message,
            "error",
          );
          apply();
        }
        throw error;
      })
      .finally(() => {
        busy--;
        paintStatus();
        flushingAssessment = null;
      });
    await flushingAssessment;
    if (strict && context.entries.size)
      throw Error("ورودی ذخیره‌نشدهٔ مرحله را بررسی کنید.");
    if (
      [...context.entries.values()].some(
        (item) => !item.review && (item.remove || parseGrade(item.value).ok),
      )
    )
      context.timer = setTimeout(() => flush().catch(() => {}), 180);
  }
  function apply() {
    const context = selected;
    if (!context) return;
    for (const input of document.querySelectorAll(
      "[data-assessment-context]",
    )) {
      if (input.dataset.assessmentContext !== context.token) continue;
      const item = context.entries.get(
        entryKey({ sid: input.dataset.student, field: input.dataset.field }),
      );
      if (item) {
        input.value = item.value;
        showInputState(input, item);
      }
    }
  }
  async function dispose({ discard = false, abandon = false } = {}) {
    if (!selected) return;
    if (abandon) {
      selected.abandoned = true;
      clearTimeout(selected.timer);
      selected = null;
      selectionGeneration++;
      return;
    }
    if (!discard) await flush({ strict: true });
    const context = selected;
    clearTimeout(context.timer);
    if (discard) {
      context.entries.clear();
      await persist(context);
    }
    selected = null;
    selectionGeneration++;
  }
  function readOnly(input) {
    const context = selected;
    return (
      !context ||
      input?.dataset?.assessmentContext !== context.token ||
      context.period.closed ||
      (workspace.id === context.period.id &&
        workspace.revision !== context.origin.revision) ||
      context.stale ||
      !context.authenticated ||
      blocked ||
      resetBusy ||
      connectionRetired ||
      periodLoading
    );
  }
  function workspaceChanged(message) {
    const context = selected;
    if (
      !context ||
      (message?.workspace && message.workspace !== context.period.id) ||
      (message?.revision && message.revision <= context.period.revision)
    )
      return;
    context.stale = true;
    context.authenticated = false;
    for (const item of context.entries.values()) {
      item.review = true;
      item.error =
        typeof message === "string"
          ? message
          : "اطلاعات این مرحله در پنجرهٔ دیگری تغییر کرده است؛ پیش‌نویس نیازمند بررسی است.";
    }
    if (context.entries.size) persist(context);
    apply();
  }
  function snapshot() {
    if (!selected?.entries.size) return null;
    return clone({
      key: storageKey(selected),
      workspace: selected.period.id,
      owner: owner(selected),
      generation: selected.generation,
      entries: [...selected.entries.values()],
      updatedAt: new Date().toISOString(),
    });
  }
  return Object.freeze({
    handles,
    select,
    resolve,
    cell,
    input,
    clear,
    refreshInput,
    flush,
    apply,
    dispose,
    readOnly,
    workspaceChanged,
    snapshot,
    persist: () => (selected ? persist(selected) : Promise.resolve()),
    hasDrafts: () => !!selected?.entries.size,
    get pending() {
      return selected?.entries.size || 0;
    },
  });
})();
