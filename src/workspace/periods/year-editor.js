async function openAcademicYear() {
  assertWorkspaceReadable();
  const sourceWorkspace = workspace.id,
    database = connection,
    sourceInstallation =
      typeof installationToken === "undefined" ? "" : installationToken;
  await flushDrafts({ strict: true });
  // Failed writes already restored durable data; they must not strand navigation.
  await writer.catch(() => {});
  assertWorkspaceReadable();
  if (
    workspace.id !== sourceWorkspace ||
    connection !== database ||
    (typeof installationToken === "undefined" ? "" : installationToken) !==
      sourceInstallation
  )
    throw Error("نوبت یا اتصال سال تغییر کرده است؛ سال را دوباره باز کنید.");
  const origin = captureWorkspaceContext(),
    rows = await allFrom("catalog");
  assertWorkspaceContext(origin);
  if (connection !== database) throw Error("اتصال سال تغییر کرده است.");
  const openTerms = rows.filter(
    (row) =>
      row.year === workspace.year &&
      !row.closed &&
      ["first", "second"].includes(row.termKind || academicTermKind(row.term)),
  );
  const continuation =
    workspace.closed &&
    openTerms.length === 1 &&
    openTerms[0].id !== workspace.id
      ? '<section class="period-management"><h4>ادامهٔ کار در همین سال</h4><p class="period-intro">بخش فعلی برای حفظ کارنامه و نمرات بسته است. برای ثبت حضور و فعالیت‌های جدید، بخش باز همین سال را انتخاب کنید.</p><button type="button" data-workspace-action="switch-period" data-key="' +
        esc(openTerms[0].id) +
        '">ادامهٔ ثبت روزانه در همین سال</button></section>'
      : "";
  showModal(
    "سال تحصیلی",
    '<div class="period-hub academic-year-hub"><div class="record-editor-context"><span>سال فعال</span><h4><bdi>' +
      esc(workspace.year) +
      "</bdi></h4><p>مدرسه‌ها، کلاس‌ها، هنرجویان، درس‌ها و برنامهٔ هفتگی در تمام سال مشترک‌اند.</p></div>" +
      '<p class="period-intro">میان‌ترم اول، پایان‌ترم اول، میان‌ترم دوم و پایان‌ترم دوم را داخل دفتر نمرهٔ همان درس انتخاب کنید؛ برای ادامهٔ کار نیازی به ساخت یا بستن ترم نیست.</p>' +
      continuation +
      '<details class="period-list academic-records"><summary><span class="academic-records-icon" aria-hidden="true">' +
      EduIcons.html("shield") +
      '</span><span class="academic-records-copy"><strong>کارنامه‌های ثابت</strong><span>قفل نمرات نوبت</span></span><span class="academic-records-chevron" aria-hidden="true">' +
      EduIcons.html("chevron-left") +
      '</span></summary><div class="academic-records-body"><p>بستن نوبت اختیاری است و برای ثبت کارنامهٔ ثابت و قفل‌کردن نمرات آن به‌کار می‌رود.</p><button type="button" class="ghost" data-workspace-action="term-records">مدیریت کارنامه‌های ثابت</button></div></details></div>',
  );
}
