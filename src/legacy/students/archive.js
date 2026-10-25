      function normalizedName(name) {
        return name
          .normalize("NFKC")
          .replace(/ي/g, "ی")
          .replace(/ك/g, "ک")
          .replace(/[\s\u200c]+/g, " ")
          .trim();
      }

      async function restoreStudent(studentId) {
        const c = getClassObj(state.schoolId, state.classId),
          st = (c?.archivedStudents || []).find((x) => x.id === studentId);
        if (!st) return;
        if (c.students.some((x) => x.id === studentId))
          return alert("دانش‌آموز در فهرست فعال وجود دارد.");
        c.students.push({ ...st });
        c.archivedStudents = c.archivedStudents.filter(
          (x) => x.id !== studentId,
        );
        await saveDB({ classId: c.id });
        render();
      }

      function buildArchiveHtml(c) {
        if (!c.archivedStudents?.length) return "";
        return (
          '<div class="card"><h3>سوابق بایگانی‌شده</h3><p>سوابق کلاس قبلی حفظ شده‌اند. بازگردانی، عضویت فعال در این کلاس را دوباره برقرار می‌کند.</p>' +
          c.archivedStudents
            .map(
              (st) =>
                '<div class="row"><span>' +
                esc(st.name) +
                '</span><button class="ghost" data-id="' +
                st.id +
                '" onclick="showArchivedKarnameh(this.dataset.id)">کارنامه</button><button class="ghost" data-id="' +
                st.id +
                '" onclick="restoreStudent(this.dataset.id)">بازگردانی</button></div>',
            )
            .join("") +
          "</div>"
        );
      }

      function showArchivedKarnameh(studentId) {
        const c = getClassObj(state.schoolId, state.classId);
        if (c)
          showModal("کارنامه بایگانی", buildDetailedKarnamehHtml(c, studentId));
      }
