function captureWorkspaceContext() {
  return Object.freeze({
    id: workspace?.id || "",
    revision: workspace?.revision || 0,
  });
}
function assertWorkspaceReadable() {
  if (
    fileMode ||
    !ready ||
    periodLoading ||
    resetBusy ||
    connectionRetired ||
    !workspace
  )
    throw Error("اطلاعات آماده خواندن نیست؛ برنامه را دوباره باز کنید.");
  if (blocked)
    throw Error(
      "اطلاعات این پنجره قدیمی است؛ صفحه را دوباره بارگذاری و گزارش یا فرم را دوباره تهیه کنید.",
    );
  if (db.settings.password && !isAuthenticated)
    throw Error("ابتدا وارد نوبت شوید.");
}
function assertWorkspaceContext(context, { write = false } = {}) {
  assertWorkspaceReadable();
  if (
    !context ||
    context.id !== workspace.id ||
    context.revision !== workspace.revision
  )
    throw Error(
      "نوبت یا اطلاعات تغییر کرده است؛ فرم یا گزارش را دوباره باز کنید.",
    );
  if (write) assertEntityWritable();
}
function markWorkspaceConflict() {
  blocked = true;
  for (const item of drafts.values()) {
    item.review = true;
    item.error = "تعارض؛ نیازمند بررسی پس از بارگذاری مجدد";
  }
  if (drafts.size) storeDrafts();
  const message =
    "اطلاعات این نوبت در تب دیگری تغییر کرد. پیش‌نویس محفوظ است؛ صفحه را دوباره بارگذاری کنید.";
  setStatus(message, "error");
  lockControls();
  window.EduPeriodicReports?.invalidate(message);
}
function assertLiveWorkspace(live, context) {
  assertWorkspaceContext(context);
  if (!live || live.revision !== context.revision) {
    markWorkspaceConflict();
    throw Error(
      "اطلاعات بانک در پنجره دیگری تغییر کرده است؛ صفحه را دوباره بارگذاری کنید.",
    );
  }
}
async function assertReportSnapshot(context) {
  assertWorkspaceContext(context);
  if (busy || drafts.size || assessmentContext.hasDrafts())
    throw Error(
      "ثبت یا ویرایش ناتمام وجود دارد؛ گزارش را پس از ذخیره دوباره تهیه کنید.",
    );
  const catalog = context.members ? await allFrom("catalog") : null;
  const live = catalog
    ? catalog.find((row) => row.id === context.id)
    : await readRecord("catalog", context.id);
  assertLiveWorkspace(live, context);
  if (
    context.members?.some(
      (member) =>
        !catalog.some(
          (row) => row.id === member.id && row.revision === member.revision,
        ),
    )
  )
    throw Error(
      "اطلاعات یکی از نوبت‌های گزارش سالانه تغییر کرده است؛ گزارش را دوباره تهیه کنید.",
    );
  if (context.yearScope) {
    const periods = selectYearActivityPeriods(catalog, {}, workspace);
    if (
      periods.length !== context.members.length ||
      periods.some(
        (period) => !context.members.some((member) => member.id === period.id),
      )
    )
      throw Error(
        "ساختار سال تحصیلی تغییر کرده است؛ گزارش را دوباره تهیه کنید.",
      );
  }
  if (context.karnamehYear) {
    const periods = selectKarnamehPeriods(catalog, {}, workspace);
    if (
      periods.length !== context.members.length ||
      periods.some(
        (period) => !context.members.some((member) => member.id === period.id),
      )
    )
      throw Error("نوبت‌های سال تغییر کرده‌اند؛ کارنامه را دوباره تهیه کنید.");
  }
  if (busy || drafts.size || assessmentContext.hasDrafts())
    throw Error(
      "اطلاعات هنگام آماده‌سازی خروجی تغییر کرد؛ گزارش را دوباره تهیه کنید.",
    );
  return true;
}
function selectAnnualPeriods(catalog, periodIds, active) {
  let periods;
  if (periodIds.first || periodIds.second) {
    if (
      !isSafeRecordId(periodIds.first) ||
      !isSafeRecordId(periodIds.second) ||
      periodIds.first === periodIds.second
    )
      throw Error("هر دو نوبت متمایز اول و دوم را انتخاب کنید.");
    periods = [periodIds.first, periodIds.second].map((id) =>
      catalog.find((row) => row.id === id),
    );
    if (periods.some((row) => !row || row.year !== active.year))
      throw Error("هر دو نوبت باید متعلق به سال تحصیلی فعال باشند.");
  } else {
    const candidates = ["first", "second"].map((kind) =>
      catalog.filter(
        (row) =>
          row.year === active.year &&
          (row.termKind || academicTermKind(row.term)) === kind,
      ),
    );
    if (candidates.some((rows) => rows.length > 1))
      throw Error(
        "اطلاعات قدیمی این سال شامل چند نسخه از یک نوبت است؛ پیش از گزارش سالانه، ساختار نوبت‌ها باید بررسی شود.",
      );
    if (candidates.every((rows) => rows.length === 1))
      periods = candidates.map((rows) => rows[0]);
    else if (["اول", "دوم"].includes(active.term))
      periods = ["اول", "دوم"].map((term) =>
        catalog.find((row) => row.year === active.year && row.term === term),
      );
    else
      throw Error(
        "نوبت اول و دوم این سال مشخص نیست؛ بخش «نوبت‌های سال تحصیلی» را بررسی کنید.",
      );
    if (periods.some((row) => !row)) {
      const missing = !periods[0] ? "اول" : "دوم";
      throw Error(
        "نوبت " +
          missing +
          " هنوز شروع نشده است؛ گزارش سالانه پس از شروع هر دو نوبت همین سال آماده می‌شود. بخش «نوبت‌های سال تحصیلی» را باز کنید.",
      );
    }
  }
  // The legacy label fallback must obey the same role checks as an explicit
  // selection. A display label cannot override a saved annual-term role.
  for (let i = 0; i < periods.length; i++) {
    const kind = periods[i].termKind || academicTermKind(periods[i].term);
    if (kind !== ["first", "second"][i])
      throw Error("نوبت انتخاب‌شده با نوبت اول/دوم مطابقت ندارد.");
  }
  return periods;
}
async function readAnnualRecordSets(
  context,
  periodIds,
  selectPeriods = selectAnnualPeriods,
) {
  const tx = connection.transaction(["catalog", "records"], "readonly");
  const done = transactionDone(tx);
  let periods;
  const pending = new Promise((resolve, reject) => {
    const request = tx.objectStore("catalog").getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      try {
        assertLiveWorkspace(
          request.result.find((row) => row.id === context.id),
          context,
        );
        periods = selectPeriods(request.result, periodIds, workspace);
        // Queue both bounded reads inside the active IDB callback, before
        // awaiting anything. Catalog and records remain one consistent snapshot.
        Promise.all(
          periods.map(async (period) =>
            requestPromise(
              workspaceRecordRequest(tx.objectStore("records"), period.id),
            ),
          ),
        ).then(resolve, reject);
      } catch (error) {
        reject(error);
        tx.abort();
      }
    };
  });
  const [recordSets] = await Promise.all([pending, done]);
  assertWorkspaceContext(context);
  return { periods, recordSets };
}
function selectYearActivityPeriods(catalog, unused, active) {
  const kind = active.termKind || academicTermKind(active.term);
  if (!["first", "second"].includes(kind)) {
    const period = catalog.find(
      (row) => row.id === active.id && row.year === active.year,
    );
    if (!period) throw Error("اطلاعات سال تحصیلی برای گزارش موجود نیست.");
    return [period];
  }
  return selectKarnamehPeriods(catalog, unused, active);
}
function selectKarnamehPeriods(catalog, unused, active) {
  const groups = ["first", "second"].map((kind) =>
    catalog.filter(
      (row) =>
        row.year === active.year &&
        (row.termKind || academicTermKind(row.term)) === kind,
    ),
  );
  if (groups.some((rows) => rows.length > 1))
    throw Error(
      "این سال چند نسخه از یک نوبت دارد؛ مدیریت نوبت‌ها را بررسی کنید.",
    );
  const periods = groups.flat();
  if (!periods.some((period) => period.id === active.id))
    throw Error("نوع نوبت فعلی برای کارنامهٔ چهارمرحله‌ای مشخص نیست.");
  return periods;
}
async function prepareKarnamehSnapshot() {
  assertWorkspaceReadable();
  const origin = workspace.id;
  await flushDrafts({ strict: true });
  await writer.catch(() => {});
  assertWorkspaceReadable();
  if (workspace.id !== origin)
    throw Error("نوبت تغییر کرد؛ کارنامه را دوباره انتخاب کنید.");
  const context = captureWorkspaceContext();
  const { periods, recordSets } = await readAnnualRecordSets(
    context,
    {},
    selectKarnamehPeriods,
  );
  const parts = periods.map((period, index) => ({
    period: {
      ...period,
      term:
        (period.termKind || academicTermKind(period.term)) === "first"
          ? "اول"
          : "دوم",
    },
    data: decodeWorkspaceRecords(recordSets[index], { workspaceId: period.id })
      .data,
  }));
  for (const part of parts) {
    if (part.period.id === origin || !part.data.settings.password) continue;
    const password = prompt(
      "برای نمایش نمرات نوبت " +
        part.period.term +
        "، رمز همان نوبت را وارد کنید:",
    );
    if (
      password === null ||
      !(await verifyPassword(password, part.data.settings.password))
    )
      throw Error("دسترسی به نوبت دیگر تأیید نشد؛ کارنامه نمایش داده نشد.");
  }
  const guarded = {
    ...context,
    karnamehYear: workspace.year,
    members: periods.map((period) => ({
      id: period.id,
      revision: period.revision,
    })),
  };
  await assertReportSnapshot(guarded);
  return { context: guarded, parts };
}
function annualSessionCopy(part, session) {
  const classroom = part.data.schools
    .find((school) => school.id === session.schoolId)
    ?.classes.find((item) => item.id === session.classId);
  const lesson = classroom?.lessons.find(
    (item) => item.id === session.lessonId,
  );
  const module = lesson?.poudmans?.find(
    (item) => item.id === session.poudmanId,
  );
  const unit = module?.units?.find((item) => item.id === session.unitId);
  return {
    ...clone(session),
    id: part.period.id + ":" + session.id,
    academicTerm: part.period.term,
    sourcePeriodId: part.period.id,
    sourceSessionId: session.id,
    ...(!Array.isArray(session.roster)
      ? {
          roster: clone(classroom?.students || []),
          rosterInferred: true,
        }
      : {}),
    annualMetadata: {
      className: classroom?.name || "کلاس فاقد تعریف",
      lessonName: lesson?.name || "درس فاقد تعریف",
      teacher: lesson?.teacher || "",
      moduleName: module?.name || "",
      unitName: unit?.name || "",
    },
  };
}

async function prepareAnnualReportSnapshot(
  periodIds = {},
  { partial = false, interactive = true } = {},
) {
  assertWorkspaceReadable();
  const origin = workspace.id;
  await flushDrafts({ strict: true });
  await writer.catch(() => {});
  assertWorkspaceReadable();
  if (workspace.id !== origin)
    throw Error("نوبت تغییر کرد؛ گزارش سالانه را دوباره تهیه کنید.");
  const context = captureWorkspaceContext();
  const { periods, recordSets } = await readAnnualRecordSets(
    context,
    periodIds,
    partial ? selectYearActivityPeriods : selectAnnualPeriods,
  );
  const parts = periods.map((period, index) => ({
    period: {
      ...period,
      term:
        { first: "اول", second: "دوم" }[
          period.termKind || academicTermKind(period.term)
        ] || period.term,
      displayTerm:
        { first: "اول", second: "دوم" }[
          period.termKind || academicTermKind(period.term)
        ] || period.term,
    },
    data: decodeWorkspaceRecords(recordSets[index], { workspaceId: period.id })
      .data,
  }));
  for (const part of parts) {
    const password = part.data.settings.password;
    if (
      password &&
      part.period.id !== workspace.id &&
      !(isAuthenticated && password === db.settings.password)
    ) {
      if (!interactive)
        throw Error(
          "سوابق بخشی از سال با رمز دیگری محافظت شده‌اند؛ برای مشاهدهٔ همهٔ جلسات، دسترسی آن بخش را تأیید کنید.",
        );
      const supplied = prompt(
        "برای افزودن نوبت " +
          part.period.term +
          " به گزارش سالانه، رمز آن نوبت را وارد کنید:",
      );
      if (supplied === null || !(await verifyPassword(supplied, password)))
        throw Error(
          "دسترسی به نوبت " +
            part.period.term +
            " تأیید نشد؛ گزارش سالانه ساخته نشد.",
        );
    }
  }
  for (const part of parts) permitYearNoteAccess(part.period, part.data);
  await synchronizeYearNotesScope();
  // Annual identity labels consistently use the latest term, not the open tab.
  const data = clone(parts.at(-1).data);
  data.sessions = [];
  for (const part of parts) {
    for (const school of part.data.schools) {
      let targetSchool = data.schools.find((item) => item.id === school.id);
      if (!targetSchool) {
        targetSchool = { ...clone(school), classes: [] };
        data.schools.push(targetSchool);
      }
      for (const c of school.classes) {
        let targetClass = targetSchool.classes.find((item) => item.id === c.id);
        if (!targetClass) {
          targetSchool.classes.push(clone(c));
          continue;
        }
        const known = new Set(
          knownStudents(targetClass).map((student) => student.id),
        );
        for (const student of knownStudents(c))
          if (!known.has(student.id)) {
            targetClass.archivedStudents.push(clone(student));
            known.add(student.id);
          }
        for (const lesson of c.lessons)
          if (!targetClass.lessons.some((item) => item.id === lesson.id))
            targetClass.lessons.push(clone(lesson));
      }
    }
    data.sessions.push(
      ...part.data.sessions.map((session) => annualSessionCopy(part, session)),
    );
  }
  data.settings.academicTerm =
    parts.length > 1 ? "اول و دوم" : parts[0].period.term;
  const guarded = {
    ...context,
    ...(partial ? { yearScope: workspace.year } : {}),
    members: periods.map((row) => ({
      id: row.id,
      revision: row.revision,
    })),
  };
  await assertReportSnapshot(guarded);
  return { context: guarded, data, parts };
}
async function listAnnualReportPeriods() {
  assertWorkspaceReadable();
  const context = captureWorkspaceContext();
  const rows = await allFrom("catalog");
  assertLiveWorkspace(
    rows.find((row) => row.id === context.id),
    context,
  );
  return rows
    .filter(
      (row) =>
        row.year === workspace.year &&
        ["first", "second"].includes(
          row.termKind || academicTermKind(row.term),
        ),
    )
    .map((row) => {
      const termKind = row.termKind || academicTermKind(row.term);
      return {
        id: row.id,
        year: row.year,
        term: termKind === "first" ? "اول" : "دوم",
        termKind,
        closed: row.closed,
      };
    });
}
async function prepareReportSnapshot({
  annual = false,
  yearWide = false,
  periodIds,
} = {}) {
  if (yearWide)
    return prepareAnnualReportSnapshot(periodIds, { partial: true });
  if (annual) return prepareAnnualReportSnapshot(periodIds);
  assertWorkspaceReadable();
  const origin = workspace.id;
  await flushDrafts({ strict: true });
  await writer.catch(() => {});
  assertWorkspaceReadable();
  if (workspace.id !== origin)
    throw Error("نوبت هنگام تهیه گزارش تغییر کرد؛ گزارش را دوباره باز کنید.");
  const context = captureWorkspaceContext();
  const tx = connection.transaction(["catalog", "records"], "readonly"),
    done = transactionDone(tx);
  const [live, rows] = await Promise.all([
    requestPromise(tx.objectStore("catalog").get(context.id)),
    requestPromise(
      workspaceRecordRequest(tx.objectStore("records"), context.id),
    ),
  ]);
  await done;
  assertLiveWorkspace(live, context);
  if (busy || drafts.size || assessmentContext.hasDrafts())
    throw Error("ویرایش تازه‌ای ثبت شده است؛ گزارش را دوباره تهیه کنید.");
  const data = decodeWorkspaceRecords(
    rows.filter((row) => row.workspace === context.id),
    { workspaceId: context.id },
  ).data;
  // A report labels the fixed term role without relabeling stored metadata or
  // reading another term's data. Legacy titles remain intact in the database.
  data.settings.academicTerm =
    { first: "اول", second: "دوم" }[live.termKind] ||
    data.settings.academicTerm;
  return { context, data };
}
