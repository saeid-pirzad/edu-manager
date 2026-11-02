async function openAcademicYear() {
  assertWorkspaceReadable();
  await flushDrafts({ strict: true });
  await writer;
  const origin = captureWorkspaceContext(),
    database = connection,
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
      '<details class="period-list"><summary>کارنامه‌های ثابت و قفل نمرات نوبت</summary><p class="period-intro">بستن نوبت اختیاری است و برای ثبت کارنامهٔ ثابت و قفل‌کردن نمرات آن به‌کار می‌رود.</p><button type="button" class="ghost" data-workspace-action="term-records">مدیریت کارنامه‌های ثابت</button></details></div>',
  );
}
