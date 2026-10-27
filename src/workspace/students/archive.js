function buildArchiveV24(c) {
  if (!c.archivedStudents?.length) return "";
  return (
    '<div class="card student-archive"><h3>سوابق بایگانی‌شده</h3>' +
    c.archivedStudents
      .map(
        (st) =>
          '<div class="row"><span>' +
          esc(st.name) +
          (st.recovered ? " · نام نیازمند بررسی" : "") +
          '</span><button class="ghost" data-workspace-action="archived-report" data-key="' +
          esc(st.id) +
          '">کارنامه</button><button class="ghost" data-mutating="1" data-workspace-action="edit-student" data-key="' +
          esc(st.id) +
          '">اصلاح مشخصات</button><button class="ghost" data-mutating="1" data-workspace-action="restore-student" data-key="' +
          esc(st.id) +
          '">بازگردانی</button></div>',
      )
      .join("") +
    "</div>"
  );
}
