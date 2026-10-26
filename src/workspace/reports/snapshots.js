function captureWorkspaceContext() {
  return Object.freeze({
    id: workspace?.id || "",
    revision: workspace?.revision || 0,
  });
}
function assertWorkspaceReadable() {
  if (fileMode || !ready || resetBusy || connectionRetired || !workspace)
    throw Error("اطلاعات آماده خواندن نیست؛ برنامه را دوباره باز کنید.");
  if (blocked)
    throw Error(
      "اطلاعات این پنجره قدیمی است؛ صفحه را دوباره بارگذاری و گزارش یا فرم را دوباره تهیه کنید.",
    );
  if (db.settings.password && !isAuthenticated)
    throw Error("ابتدا وارد دوره شوید.");
}
function assertWorkspaceContext(context, { write = false } = {}) {
  assertWorkspaceReadable();
  if (
    !context ||
    context.id !== workspace.id ||
    context.revision !== workspace.revision
  )
    throw Error(
      "دوره یا اطلاعات تغییر کرده است؛ فرم یا گزارش را دوباره باز کنید.",
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
    "داده این دوره در تب دیگری تغییر کرد. پیش‌نویس محفوظ است؛ صفحه را دوباره بارگذاری کنید.";
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
  if (busy || drafts.size)
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
  if (busy || drafts.size)
    throw Error(
      "اطلاعات هنگام آماده‌سازی خروجی تغییر کرد؛ گزارش را دوباره تهیه کنید.",
    );
  return true;
}
async function prepareAnnualReportSnapshot(periodIds = {}) {
  assertWorkspaceReadable();
  const origin = workspace.id;
  await flushDrafts({ strict: true });
  await writer.catch(() => {});
  assertWorkspaceReadable();
  if (workspace.id !== origin)
    throw Error("دوره تغییر کرد؛ گزارش سالانه را دوباره تهیه کنید.");
  const context = captureWorkspaceContext();
  const tx = connection.transaction(["catalog", "records"], "readonly"),
    done = transactionDone(tx);
  const [catalog, records] = await Promise.all([
    requestPromise(tx.objectStore("catalog").getAll()),
    requestPromise(tx.objectStore("records").getAll()),
  ]);
  await done;
  assertLiveWorkspace(
    catalog.find((row) => row.id === context.id),
    context,
  );
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
    if (periods.some((row) => !row || row.year !== workspace.year))
      throw Error("هر دو نوبت باید متعلق به سال تحصیلی فعال باشند.");
    for (let i = 0; i < periods.length; i++) {
      const kind = periods[i].termKind || academicTermKind(periods[i].term);
      if (kind && kind !== ["first", "second"][i])
        throw Error("نوع دوره انتخاب‌شده با نوبت اول/دوم مطابقت ندارد.");
    }
  } else {
    const candidates = ["first", "second"].map((kind) =>
      catalog.filter(
        (row) =>
          row.year === workspace.year &&
          (row.termKind || academicTermKind(row.term)) === kind,
      ),
    );
    if (
      candidates.every((rows) => rows.length === 1) &&
      candidates.some((rows) => rows[0].id === workspace.id)
    )
      periods = candidates.map((rows) => rows[0]);
    else if (["اول", "دوم"].includes(workspace.term))
      periods = ["اول", "دوم"].map((term) =>
        catalog.find((row) => row.year === workspace.year && row.term === term),
      );
    else
      throw Error(
        "برای دوره بازیابی‌شده یا عنوان سفارشی، هر دو نوبت اول و دوم را در فرم گزارش انتخاب کنید؛ انتخاب خودکار مبهم است.",
      );
    if (periods.some((row) => !row))
      throw Error(
        "برای گزارش سالانه، هر دو نوبت همین سال تحصیلی باید وجود داشته باشند؛ آن‌ها را انتخاب یا ایجاد کنید.",
      );
  }
  const parts = periods.map((period, index) => ({
    period: {
      ...period,
      term: index === 0 ? "اول" : "دوم",
      displayTerm: period.term,
    },
    data: decodeWorkspaceRecords(
      records.filter((row) => row.workspace === period.id),
      { workspaceId: period.id },
    ).data,
  }));
  for (const part of parts) {
    const password = part.data.settings.password;
    if (password && part.period.id !== workspace.id) {
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
  const data = clone(
    parts.find((part) => part.period.id === workspace.id)?.data ||
      parts[1].data,
  );
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
      ...part.data.sessions.map((session) => ({
        ...clone(session),
        id: part.period.id + ":" + session.id,
        academicTerm: part.period.term,
      })),
    );
  }
  data.settings.academicTerm = "اول و دوم";
  const guarded = {
    ...context,
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
    .filter((row) => row.year === workspace.year)
    .map((row) => ({
      id: row.id,
      year: row.year,
      term: row.term,
      termKind: row.termKind || academicTermKind(row.term),
      closed: row.closed,
    }));
}
async function prepareReportSnapshot({ annual = false, periodIds } = {}) {
  if (annual) return prepareAnnualReportSnapshot(periodIds);
  assertWorkspaceReadable();
  const origin = workspace.id;
  await flushDrafts({ strict: true });
  await writer.catch(() => {});
  assertWorkspaceReadable();
  if (workspace.id !== origin)
    throw Error("دوره هنگام تهیه گزارش تغییر کرد؛ گزارش را دوباره باز کنید.");
  const context = captureWorkspaceContext();
  const tx = connection.transaction(["catalog", "records"], "readonly"),
    done = transactionDone(tx);
  const [live, rows] = await Promise.all([
    requestPromise(tx.objectStore("catalog").get(context.id)),
    requestPromise(tx.objectStore("records").getAll()),
  ]);
  await done;
  assertLiveWorkspace(live, context);
  if (busy || drafts.size)
    throw Error("ویرایش تازه‌ای ثبت شده است؛ گزارش را دوباره تهیه کنید.");
  const data = decodeWorkspaceRecords(
    rows.filter((row) => row.workspace === context.id),
    { workspaceId: context.id },
  ).data;
  return { context, data };
}
