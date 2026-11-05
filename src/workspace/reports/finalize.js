function finalReportData() {
  const classes = [];
  let missing = [];
  for (const school of db.schools)
    for (const c of school.classes) {
      const students = getSortedStudents(c).map((st) => {
        const lessons = c.lessons.map((l) => {
          const result = calcV24(c, l, st.id);
          const assessments =
            l.gradeMode === "kardanesh"
              ? {
                  version: 1,
                  midterm: assessmentResult(l, st.id, "midterm"),
                  final: assessmentResult(l, st.id, "final"),
                }
              : null;
          if (assessments)
            for (const [stage, r] of [
              ["میان‌ترم", assessments.midterm],
              ["پایان‌ترم", assessments.final],
            ]) {
              if (
                l.gradingPolicy?.subjectType !== "general" &&
                r.practical === null
              )
                missing.push(
                  c.name +
                    " / " +
                    st.name +
                    " / " +
                    l.name +
                    " / " +
                    stage +
                    " / عملی",
                );
              if (r.theory === null)
                missing.push(
                  c.name +
                    " / " +
                    st.name +
                    " / " +
                    l.name +
                    " / " +
                    stage +
                    " / تئوری",
                );
            }
          // The first term freezes progress without ending annual modules.
          const annualModuleInProgress =
            l.gradingPolicy?.method === "modular" &&
            (workspace.termKind || academicTermKind(workspace.term)) ===
              "first";
          if (
            !annualModuleInProgress &&
            result.final === null &&
            result.passed !== false
          )
            missing.push(c.name + " / " + st.name + " / " + l.name);
          return {
            id: l.id,
            name: l.name,
            mode: l.gradeMode,
            ...(assessments ? { assessments } : {}),
            policy: l.gradingPolicy ? clone(l.gradingPolicy) : null,
            courseInfo: EduPolicy.identity(l, workspace.year),
            modules:
              result.modules?.map((module) => {
                const pod = l.poudmans.find((item) => item.id === module.id),
                  inputs = ownScoreRecord(pod?.podScores, st.id);
                return {
                  ...clone(module),
                  inputs: { m: inputs.m ?? null, c: inputs.c ?? null },
                };
              }) || null,
            reason: result.reason || "",
            teacher: l.teacher || "",
            practical: result.practical ?? null,
            theory: result.theory ?? null,
            mostamar: result.avgM,
            payani: result.avgP,
            final: result.final,
            passed: result.passed ?? null,
          };
        });
        return {
          id: st.id,
          name: st.name,
          code: st.code || "",
          lessons,
          average:
            lessons.length && lessons.every((l) => l.final !== null)
              ? lessons.reduce((n, l) => n + l.final, 0) / lessons.length
              : null,
        };
      });
      if (c.students.length && !c.lessons.length)
        missing.push(c.name + " / بدون درس");
      classes.push({ school: school.name, name: c.name, students });
    }
  if (!classes.some((c) => c.students.length))
    missing.push("دانش‌آموزی برای صدور کارنامه وجود ندارد.");
  return { classes, missing };
}

async function finalizePeriod() {
  assertWorkspaceReadable();
  assertEntityWritable();
  const origin = workspace.id,
    database = connection,
    sourceInstallation = installationToken;
  const assertInstallation = (token) => {
    if (token !== sourceInstallation)
      throw Object.assign(
        Error("نوبت یا اتصال بانک هنگام بستن تغییر کرد؛ دوباره تلاش کنید."),
        {
          code: "INSTALLATION_CHANGED",
        },
      );
  };
  if (fileMode)
    throw Error(
      "این عملیات را در نسخه نصب‌شده برنامه یا نشانی HTTPS آن انجام دهید.",
    );
  await flushDrafts({ strict: true });
  await writer.catch(() => {});
  if (workspace.id !== origin || connection !== database)
    throw Error("نوبت یا اتصال بانک هنگام بستن تغییر کرد؛ دوباره تلاش کنید.");
  assertInstallation(installationToken);
  const context = captureWorkspaceContext();
  const report = finalReportData();
  if (report.missing.length) {
    handleError(
      Error(
        "بستن نوبت ممکن نیست؛ نمرات ناقص: " +
          report.missing.slice(0, 10).join(" | ") +
          (report.missing.length > 10 ? " و موارد دیگر" : ""),
      ),
    );
    return;
  }
  const term =
    workspace.termKind === "first"
      ? "اول"
      : workspace.termKind === "second"
        ? "دوم"
        : workspace.term;
  if (
    !confirm(
      "نوبت " +
        term +
        " سال تحصیلی " +
        workspace.year +
        " بسته و کارنامه ثابت آن ثبت شود؟",
    )
  )
    return;
  const assertFinalizationCurrent = () => {
    assertWorkspaceContext(context, { write: true });
    assertInstallation(installationToken);
    if (connection !== database)
      throw Error("اتصال بانک هنگام بستن نوبت تغییر کرد؛ دوباره تلاش کنید.");
    if (busy || drafts.size || assessmentContext.hasDrafts())
      throw Error(
        "ویرایش تازه‌ای هنگام بستن نوبت ایجاد شد؛ ابتدا آن را ذخیره و دوباره تلاش کنید.",
      );
  };
  assertFinalizationCurrent();
  const at = new Date().toISOString(),
    snapshot = {
      id: uid(),
      workspace: context.id,
      year: workspace.year,
      term: workspace.term,
      at,
      classes: report.classes,
    };
  validateFrozenReport(snapshot);
  let finalizedWorkspace;
  let finalizationError;
  const tx = database.transaction(
      ["catalog", "records", "reports", "events", "undo"],
      "readwrite",
    ),
    done = transactionDone(tx);
  const request = tx.objectStore("catalog").get(context.id),
    epoch = tx.objectStore("records").get(RESET_RECORD_KEY);
  let remaining = 2;
  const finalize = () => {
    if (--remaining) return;
    try {
      assertFinalizationCurrent();
      assertInstallation(epoch.result?.value?.token || "");
      if (
        !request.result ||
        request.result.closed ||
        request.result.revision !== context.revision ||
        workspace.id !== context.id ||
        workspace.revision !== context.revision
      ) {
        tx.abort();
        return;
      }
      finalizedWorkspace = {
        ...request.result,
        closed: true,
        closedAt: at,
        revision: request.result.revision + 1,
      };
      tx.objectStore("catalog").put(finalizedWorkspace);
      tx.objectStore("reports").put(snapshot);
      tx.objectStore("undo").delete(context.id);
      tx.objectStore("events").add({
        workspace: context.id,
        at,
        revision: finalizedWorkspace.revision,
        action: "بستن نوبت و ثبت کارنامه ثابت",
        changes: [],
      });
    } catch (error) {
      finalizationError = error;
      tx.abort();
    }
  };
  request.onsuccess = finalize;
  epoch.onsuccess = finalize;
  try {
    await done;
  } catch (error) {
    throw finalizationError || error;
  }
  if (installationToken !== sourceInstallation) return;
  broadcast({
    workspace: context.id,
    revision: finalizedWorkspace.revision,
  });
  if (workspace.id !== context.id || workspace.revision !== context.revision)
    return;
  workspace = finalizedWorkspace;
  await openPeriods();
  render();
}

async function reopenPeriod() {
  assertWorkspaceReadable();
  if (fileMode)
    throw Error(
      "این عملیات را در نسخه نصب‌شده برنامه یا نشانی HTTPS آن انجام دهید.",
    );
  if (!workspace.closed) return;
  if (
    !confirm(
      "نوبت جاری بازگشایی شود؟ کارنامه ثابت قبلی حفظ می‌شود و تغییرات جدید جدا ثبت می‌شوند.",
    )
  )
    return;
  const context = captureWorkspaceContext();
  let reopenedWorkspace;
  const tx = connection.transaction(["catalog", "events"], "readwrite"),
    done = transactionDone(tx),
    request = tx.objectStore("catalog").get(context.id);
  request.onsuccess = () => {
    if (
      !request.result ||
      !request.result.closed ||
      request.result.revision !== context.revision ||
      workspace.id !== context.id ||
      workspace.revision !== context.revision
    ) {
      tx.abort();
      return;
    }
    reopenedWorkspace = {
      ...request.result,
      closed: false,
      revision: request.result.revision + 1,
    };
    tx.objectStore("catalog").put(reopenedWorkspace);
    tx.objectStore("events").add({
      workspace: context.id,
      at: new Date().toISOString(),
      revision: reopenedWorkspace.revision,
      action: "بازگشایی نوبت؛ کارنامه ثابت پیشین محفوظ است",
      changes: [],
    });
  };
  await done;
  broadcast({
    workspace: context.id,
    revision: reopenedWorkspace.revision,
  });
  if (workspace.id !== context.id || workspace.revision !== context.revision)
    return;
  workspace = reopenedWorkspace;
  await openPeriods();
  render();
}
