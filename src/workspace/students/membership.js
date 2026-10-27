let membershipContext = null,
  membershipBusy = false;
function freezeClassRosters(c) {
  for (const session of db.sessions.filter((x) => x.classId === c.id))
    if (!session.roster) session.roster = historicalRoster(c, session);
}
async function openMembership(action, studentId) {
  try {
    assertEntityWritable();
    const origin = {
      workspace: workspace.id,
      schoolId: state.schoolId,
      classId: state.classId,
    };
    await flushDrafts({ strict: true });
    assertEntityWritable();
    if (
      origin.workspace !== workspace.id ||
      origin.schoolId !== state.schoolId ||
      origin.classId !== state.classId
    )
      throw Error("صفحه یا دوره تغییر کرده است؛ عملیات را دوباره باز کنید.");
    const c = getClassObj(origin.schoolId, origin.classId);
    const student = (
      action === "restore" ? c?.archivedStudents : c?.students
    )?.find((x) => x.id === studentId);
    if (!student) throw Error("هنرجو در فهرست موردنظر وجود ندارد.");
    const context = {
      ...origin,
      action,
      studentId,
      revision: workspace.revision,
    };
    const title =
      action === "transfer"
        ? "انتقال یا کپی هنرجو"
        : action === "archive"
          ? "بایگانی هنرجو"
          : "بازگردانی هنرجو";
    const activeElsewhere = db.schools.flatMap((s) =>
      s.classes
        .filter(
          (cl) =>
            cl.id !== c.id && cl.students.some((st) => st.id === studentId),
        )
        .map((cl) => s.name + " / " + cl.name),
    );
    let body =
      '<form class="record-editor" data-workspace-submit="save-membership"><div class="record-editor-context"><h4>' +
      esc(student.name) +
      "</h4><p>" +
      esc(getSchool(origin.schoolId).name + " / " + c.name) +
      "</p></div>";
    if (action === "transfer") {
      const options = db.schools.flatMap((s) =>
        s.classes
          .filter((cl) => cl.id !== c.id)
          .map(
            (cl) =>
              '<option value="' +
              esc(cl.id) +
              '">' +
              esc(s.name + " / " + cl.name) +
              "</option>",
          ),
      );
      body +=
        '<label for="transferTarget">کلاس مقصد</label><select id="transferTarget"><option value="">کلاس مقصد را انتخاب کنید</option>' +
        options.join("") +
        "</select><p>انتقال: عضویت فعال در مبدأ بایگانی می‌شود و شناسه هنرجو در مقصد حفظ می‌شود. کپی: هنرجویی با شناسه جدید در مقصد ساخته می‌شود و مبدأ فعال می‌ماند.</p><p>نمرات و جلسات مبدأ به مقصد منتقل نمی‌شوند. اگر همین هنرجو قبلاً در مقصد بوده، انتقال دوباره، عضویت او را با حفظ سوابق قبلی مقصد فعال می‌کند.</p>";
      if (!options.length)
        body += "<p>کلاس دیگری وجود ندارد؛ ابتدا کلاس مقصد را تعریف کنید.</p>";
    } else if (action === "archive") {
      body +=
        "<p>هنرجو از فهرست فعال خارج می‌شود؛ نمرات، حضور‌وغیاب و نام او در جلسات گذشته حفظ می‌شوند. بازگردانی از بخش سوابق بایگانی‌شده امکان‌پذیر است.</p>";
    } else {
      body +=
        "<p>عضویت فعال در این کلاس با همان شناسه و نمرات قبلی برقرار می‌شود. جلسات گذشته تغییر نمی‌کنند.</p>";
      if (activeElsewhere.length)
        body +=
          "<p>این هنرجو در " +
          esc(activeElsewhere.join("، ")) +
          " نیز فعال است. بازگردانی، عضویت او در آن کلاس‌ها را لغو نمی‌کند.</p>";
    }
    body +=
      '<p id="membershipError" role="alert"></p><div class="row record-editor-actions"><button type="button" class="ghost" data-workspace-action="close">انصراف</button>';
    if (action === "transfer")
      body +=
        '<button type="button" class="ghost" data-workspace-action="copy-membership">کپی به مقصد</button>';
    body +=
      '<button type="submit">' +
      (action === "transfer"
        ? "انتقال به مقصد"
        : action === "archive"
          ? "بایگانی هنرجو"
          : "بازگردانی هنرجو") +
      "</button></div></form>";
    if (showModal(title, body) !== false) {
      membershipContext = context;
      rememberRecordEditor();
    }
  } catch (error) {
    handleError(error);
  }
}
async function saveMembership(mode = "") {
  if (membershipBusy) return;
  const form = document
    .querySelector("#modal:not(.hidden) #membershipError")
    ?.closest("form");
  if (!form) return;
  membershipBusy = true;
  const finish = beginRecordEditorSave(form);
  try {
    const context = membershipContext;
    const sourceConnection = connection;
    const check = () => {
      assertEntityWritable();
      if (
        !context ||
        membershipContext !== context ||
        connection !== sourceConnection ||
        state.schoolId !== context.schoolId ||
        state.classId !== context.classId ||
        context.workspace !== workspace.id ||
        context.revision !== workspace.revision
      )
        throw Error("دوره یا اطلاعات تغییر کرده است؛ فرم را دوباره باز کنید.");
      const c = getClassObj(context.schoolId, context.classId);
      const student = (
        context.action === "restore" ? c?.archivedStudents : c?.students
      )?.find((x) => x.id === context.studentId);
      if (!student) throw Error("هنرجو دیگر در فهرست موردنظر وجود ندارد.");
      return { c, student };
    };
    check();
    await flushDrafts({ strict: true });
    await writer.catch(() => {});
    const { c, student } = check();
    let action;
    if (context.action === "transfer") {
      const targetId = document.getElementById("transferTarget").value;
      const destination = findClass(targetId);
      if (!destination || destination.id === c.id)
        throw recordFieldError(
          "یک کلاس مقصد معتبر انتخاب کنید.",
          "transferTarget",
        );
      const isCopy = mode === "copy";
      if (!isCopy && destination.students.some((x) => x.id === student.id))
        throw recordFieldError(
          "هنرجو در مقصد فعال است؛ انتقال دوباره انجام نمی‌شود.",
          "transferTarget",
        );
      if (
        student.code &&
        knownStudents(destination).some(
          (x) => x.code === student.code && (isCopy || x.id !== student.id),
        )
      )
        throw recordFieldError(
          "کد هنرجو در فهرست فعال یا بایگانی مقصد وجود دارد؛ ابتدا هویت رکورد مقصد را بررسی کنید.",
          "transferTarget",
        );
      freezeClassRosters(destination);
      if (isCopy) destination.students.push({ ...clone(student), id: uid() });
      else {
        destination.archivedStudents = (
          destination.archivedStudents || []
        ).filter((x) => x.id !== student.id);
        destination.students.push(clone(student));
        archiveStudent(c, student);
      }
      action =
        (isCopy ? "کپی " : "انتقال ") +
        student.name +
        " از " +
        c.name +
        " به " +
        destination.name;
    } else if (context.action === "archive") {
      archiveStudent(c, student);
      action = "بایگانی هنرجو: " + student.name;
    } else {
      if (c.students.some((x) => x.id === student.id))
        throw Error("هنرجو در این کلاس فعال است.");
      if (student.code && c.students.some((x) => x.code === student.code))
        throw Error(
          "کد هنرجو در فهرست فعال تکراری است؛ ابتدا مشخصات را اصلاح کنید.",
        );
      freezeClassRosters(c);
      c.students.push(clone(student));
      c.archivedStudents = c.archivedStudents.filter(
        (x) => x.id !== student.id,
      );
      action = "بازگردانی هنرجو: " + student.name;
    }
    await saveDBV24({ action });
    if (
      membershipContext !== context ||
      connection !== sourceConnection ||
      workspace.id !== context.workspace ||
      state.schoolId !== context.schoolId ||
      state.classId !== context.classId ||
      periodLoading ||
      resetBusy ||
      connectionRetired
    )
      return;
    finish();
    rememberRecordEditor();
    membershipContext = null;
    closeModal();
    render();
    setStatus(action + "؛ سوابق جلسات قبلی حفظ شدند.", "saved");
  } catch (error) {
    if (!showRecordEditorError(error, "membershipError")) handleError(error);
  } finally {
    membershipBusy = false;
    finish();
  }
}
