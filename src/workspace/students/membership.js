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
    let hasDestination = true;
    let body =
      '<form class="record-editor membership-editor" data-workspace-submit="save-membership"><div class="record-editor-context"><span>هنرجو و کلاس مبدأ</span><h4>' +
      esc(student.name) +
      "</h4><p>" +
      esc(getSchool(origin.schoolId).name + " / " + c.name) +
      "</p></div>";
    if (action === "transfer") {
      const options = db.schools
        .map((school) => {
          const classes = school.classes.filter((cl) => cl.id !== c.id);
          if (!classes.length) return "";
          return (
            '<optgroup label="' +
            esc(school.name) +
            '">' +
            classes
              .map(
                (cl) =>
                  '<option value="' +
                  esc(cl.id) +
                  '">' +
                  esc(cl.name) +
                  "</option>",
              )
              .join("") +
            "</optgroup>"
          );
        })
        .filter(Boolean);
      hasDestination = options.length > 0;
      if (hasDestination)
        body +=
          '<label class="membership-destination" for="transferTarget">کلاس مقصد<select id="transferTarget" required aria-describedby="membershipError"><option value="">کلاس مقصد را انتخاب کنید</option>' +
          options.join("") +
          '</select></label><fieldset class="membership-mode"><legend>نوع عملیات</legend><label><input type="radio" name="membershipMode" value="transfer" checked><span><strong>انتقال</strong><small>در مقصد فعال و در مبدأ بایگانی می‌شود.</small></span></label><label><input type="radio" name="membershipMode" value="copy" id="membershipCopy"><span><strong>کپی</strong><small>نسخه‌ای جدا در مقصد ساخته می‌شود؛ مبدأ باقی می‌ماند.</small></span></label></fieldset><p class="membership-note">نمرات و حضور و غیاب قبلی در مبدأ محفوظ می‌مانند و به مقصد منتقل نمی‌شوند.</p>';
      else
        body +=
          '<p class="membership-empty" role="status">کلاس مقصدی وجود ندارد. ابتدا یک کلاس دیگر بسازید، سپس برای انتقال یا کپی برگردید.</p>';
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
    if (hasDestination)
      body +=
        '<button type="submit">' +
        (action === "transfer"
          ? "انتقال هنرجو"
          : action === "archive"
            ? "بایگانی هنرجو"
            : "بازگردانی هنرجو") +
        "</button>";
    body += "</div></form>";
    if (showModal(title, body) !== false) {
      membershipContext = context;
      rememberRecordEditor();
      if (action === "transfer" && hasDestination) {
        const form = document.querySelector("#modal .membership-editor");
        form.addEventListener("change", (event) => {
          if (event.target.name !== "membershipMode") return;
          form.querySelector('button[type="submit"]').textContent =
            form.querySelector("#membershipCopy").checked
              ? "کپی هنرجو"
              : "انتقال هنرجو";
        });
      }
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
      const isCopy =
        mode === "copy" ||
        (mode === "" &&
          document.getElementById("membershipCopy")?.checked === true);
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
