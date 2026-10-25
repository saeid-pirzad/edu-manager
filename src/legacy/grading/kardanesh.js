      function calcStudentLesson(c, lesson, stId, source = db) {
        const r = calcStudentLessonBase(c, lesson, stId, source);
        if (lesson.gradeMode !== "kardanesh") return r;
        const g = ownScoreRecord(lesson.kardaneshScores, stId);
        r.practical = g.practical ?? null;
        r.theory = g.theory ?? null;
        r.avgM = r.theory;
        r.avgP = r.practical;
        r.final =
          r.practical !== null && r.theory !== null
            ? (r.practical * 7 + r.theory * 3) / 10
            : null;
        r.passed = r.final === null ? null : r.final >= 14;
        return r;
      }

      function gradeStatus(r) {
        return r.final === null ? "ناقص" : r.passed ? "قبول" : "مردود";
      }

      function buildKardaneshSummaryHtml(c, l, studentId) {
        return (
          '<div class="card"><h3>کاردانش — ' +
          esc(l.name) +
          '</h3><p>نهایی = عملی × ۷۰٪ + تئوری × ۳۰٪؛ قبولی از ۱۴. هر دو نمره الزامی است.</p><div style="overflow-x:auto"><table><thead><tr><th>دانش‌آموز</th><th>عملی</th><th>تئوری</th><th>نهایی</th><th>وضعیت</th></tr></thead><tbody>' +
          getSortedStudents(
            studentId
              ? { students: [...c.students, ...(c.archivedStudents || [])] }
              : c,
          )
            .filter((st) => !studentId || st.id === studentId)
            .map((st) => {
              const r = calcStudentLesson(c, l, st.id);
              return (
                "<tr><td>" +
                esc(st.name) +
                "</td><td>" +
                (r.practical ?? "—") +
                "</td><td>" +
                (r.theory ?? "—") +
                "</td><td>" +
                (r.final === null ? "—" : r.final.toFixed(2)) +
                "</td><td>" +
                gradeStatus(r) +
                "</td></tr>"
              );
            })
            .join("") +
          "</tbody></table></div></div>"
        );
      }

      function buildKardaneshGradesHtml(c, l) {
        return (
          '<div class="card"><h3>ثبت نمرات کاردانش — ' +
          esc(l.name) +
          '</h3><p>نمره نهایی = عملی × ۷۰٪ + تئوری × ۳۰٪؛ قبولی از ۱۴. حضور و امتیازها این فرمول را تغییر نمی‌دهند. نهایی خودکار ذخیره می‌شود.</p><div style="overflow-x:auto"><table><thead><tr><th>دانش‌آموز</th><th>عملی (۷۰٪)</th><th>تئوری (۳۰٪)</th><th>نهایی</th><th>وضعیت</th></tr></thead><tbody>' +
          getSortedStudents(c)
            .map((st) => {
              const r = calcStudentLesson(c, l, st.id);
              return (
                "<tr><td>" +
                esc(st.name) +
                "</td>" +
                ["practical", "theory"]
                  .map(
                    (field) =>
                      '<td><input aria-label="' +
                      (field === "midtermPractical"
                        ? "عملی میان‌ترم"
                        : field === "midtermTheory"
                          ? "تئوری میان‌ترم"
                          : field === "practical"
                            ? "عملی"
                            : "تئوری") +
                      " " +
                      esc(st.name) +
                      '" type="number" min="0" max="20" step="any" value="' +
                      (r[field] ?? "") +
                      '" data-lesson="' +
                      l.id +
                      '" data-student="' +
                      st.id +
                      '" data-field="' +
                      field +
                      '" onchange="saveKardaneshScore(this)"></td>',
                  )
                  .join("") +
                '<td data-kfinal="' +
                st.id +
                '">' +
                (r.final === null ? "—" : r.final.toFixed(2)) +
                '</td><td data-kstatus="' +
                st.id +
                '">' +
                gradeStatus(r) +
                "</td></tr>"
              );
            })
            .join("") +
          "</tbody></table></div></div>"
        );
      }

      async function saveKardaneshScore(input) {
        const { lesson: lid, student: sid, field } = input.dataset,
          c = getClassObj(state.schoolId, state.classId),
          l = getLessonObj(c, lid);
        if (
          !l ||
          l.gradeMode !== "kardanesh" ||
          !c.students.some((st) => st.id === sid) ||
          !["practical", "theory"].includes(field)
        )
          return;
        const value = input.value.trim() === "" ? null : Number(input.value);
        if (
          value !== null &&
          (!Number.isFinite(value) || value < 0 || value > 20)
        ) {
          input.setCustomValidity("نمره باید صفر تا بیست باشد.");
          input.reportValidity();
          return;
        }
        input.setCustomValidity("");
        const g = writableScoreRecord(
          l.kardaneshScores || (l.kardaneshScores = {}),
          sid,
        );
        if (value === null) delete g[field];
        else g[field] = value;
        l.kardaneshScores[sid] = g;
        await saveDB();
        const r = calcStudentLesson(
          getClassObj(state.schoolId, state.classId),
          getLessonObj(getClassObj(state.schoolId, state.classId), lid),
          sid,
        );
        document
          .querySelectorAll('[data-kfinal="' + sid + '"]')
          .forEach(
            (el) =>
              (el.textContent = r.final === null ? "—" : r.final.toFixed(2)),
          );
        document
          .querySelectorAll('[data-kstatus="' + sid + '"]')
          .forEach((el) => (el.textContent = gradeStatus(r)));
      }

