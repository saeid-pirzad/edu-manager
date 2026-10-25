        function buildArchiveV24(c) {
          if (!c.archivedStudents?.length) return "";
          return (
            '<div class="card"><h3>سوابق بایگانی‌شده</h3>' +
            c.archivedStudents
              .map(
                (st) =>
                  '<div class="row"><span>' +
                  esc(st.name) +
                  (st.recovered ? " · نام نیازمند بررسی" : "") +
                  '</span><button class="ghost" onclick="showArchivedKarnameh(\'' +
                  st.id +
                  '\')">کارنامه</button><button class="ghost" data-mutating="1" onclick="openEditStudentModal(\'' +
                  st.id +
                  '\')">اصلاح مشخصات</button><button class="ghost" data-mutating="1" onclick="restoreStudent(\'' +
                  st.id +
                  "')\">بازگردانی</button></div>",
              )
              .join("") +
            "</div>"
          );
        }
