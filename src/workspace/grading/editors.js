        function buildKardaneshEditor(c, l) {
          return buildAssessmentEditor(c, l);
        }
        function buildAssessmentEditor(c, l) {
          let html =
            '<div class="card assessment-editor"><h3>نمرات کاردانش — ' +
            esc(l.name) +
            "</h3><p>هر مرحله: عملی ۷۰٪ + تئوری ۳۰٪. نتیجه سالانه: میانگین میان‌ترم و پایان‌ترم هر دو نوبت؛ هر چهار نمره لازم است.</p>";
          for (const stage of ["midterm", "final"]) {
            const mid = stage === "midterm";
            html +=
              '<details class="assessment-stage" ' +
              (!mid ? "open" : "") +
              "><summary>" +
              (mid ? "میان‌ترم" : "پایان‌ترم") +
              " نوبت " +
              esc(workspace.term) +
              '</summary><div class="assessment-students">';
            for (const st of getSortedStudents(c)) {
              const r = assessmentResult(l, st.id, stage);
              html +=
                '<article class="assessment-student"><h4>' +
                esc(st.name) +
                '</h4><div class="assessment-inputs"><label>عملی' +
                gradeCell(c, l, st, mid ? "midtermPractical" : "practical", {
                  value: r.practical,
                }) +
                "</label><label>تئوری" +
                gradeCell(c, l, st, mid ? "midtermTheory" : "theory", {
                  value: r.theory,
                }) +
                '</label></div><p>نمره این مرحله: <strong data-assessment-final="' +
                esc(st.id) +
                '" data-stage="' +
                stage +
                '">' +
                finalText(r) +
                "</strong> <span data-assessment-status>" +
                (r.complete ? gradeStatus(r) : "ناقص") +
                "</span></p></article>";
            }
            html += "</div></details>";
          }
          return html + "</div>";
        }
        function buildKardaneshSummary(c, l, sid) {
          if (l.gradingPolicy) return courseUI.table(c, l, sid, false);
          return (
            '<div class="card"><h3>کاردانش — ' +
            esc(l.name) +
            '</h3><p>عملی ۷۰٪ + تئوری ۳۰٪؛ حد قبولی ۱۴. وضعیت قبولی با محاسبه ده‌دهی دقیق تعیین می‌شود.</p><div class="table-scroll"><table><thead><tr><th>دانش‌آموز</th><th>عملی</th><th>تئوری</th><th>نهایی</th><th>وضعیت</th></tr></thead><tbody>' +
            getSortedStudents(sid ? { students: knownStudents(c) } : c)
              .filter((st) => !sid || st.id === sid)
              .map((st) => {
                const r = calcV24(c, l, st.id);
                return (
                  "<tr><td>" +
                  esc(st.name) +
                  "</td><td>" +
                  (r.practical ?? "—") +
                  "</td><td>" +
                  (r.theory ?? "—") +
                  "</td><td>" +
                  finalText(r) +
                  "</td><td>" +
                  gradeStatus(r) +
                  "</td></tr>"
                );
              })
              .join("") +
            "</tbody></table></div></div>"
          );
        }

        function refreshGradeResults() {
          for (const el of document.querySelectorAll(
            "[data-assessment-final]",
          )) {
            const article = el.closest(".assessment-student"),
              source = article?.querySelector("[data-grade]")?.dataset;
            const c = findClass(source?.class),
              l = getLessonObj(c, source?.lesson);
            if (!l) continue;
            const result = assessmentResult(
              l,
              el.dataset.assessmentFinal,
              el.dataset.stage,
            );
            el.textContent = finalText(result);
            article.querySelector("[data-assessment-status]").textContent =
              result.complete ? gradeStatus(result) : "ناقص";
          }
          document.querySelectorAll("[data-kfinal]").forEach((el) => {
            const source =
                el.parentElement?.querySelector("[data-grade]")?.dataset,
              c = findClass(source?.class || state.classId),
              l = getLessonObj(c, source?.lesson || state.lessonId);
            if (!l) return;
            const sid = el.dataset.kfinal,
              r = calcV24(c, l, sid);
            el.textContent = finalText(r);
            const statusEl = el.parentElement?.querySelector("[data-kstatus]");
            if (statusEl) statusEl.textContent = gradeStatus(r);
          });
          refreshPolicyResults();
          document.querySelectorAll("[data-grade]").forEach((input) => {
            const note = input.parentElement.querySelector(".grade-note"),
              item = drafts.get(inputKey(contextFromInput(input)));
            if (note)
              note.textContent = item
                ? item.error || "در انتظار ذخیره"
                : "ذخیره شد";
          });
        }

        async function openBulkV24(lid) {
          await flushDrafts({ strict: true });
          const c = getClassObj(state.schoolId, state.classId),
            l = getLessonObj(c, lid);
          if (!l) return;
          if (l.gradeMode === "kardanesh") {
            showModal("نمرات میان‌ترم و پایان‌ترم", buildKardaneshEditor(c, l));
            return;
          }
          if (l.gradingPolicy) {
            showModal(
              "ثبت نمرات براساس قواعد درس",
              courseUI.table(c, l, null, true),
            );
            return;
          }
          if (l.gradeMode === "kardanesh") {
            showModal("ثبت نمرات کاردانش", buildKardaneshEditor(c, l));
            return;
          }
          let html =
            "<p>ورودی فارسی و انگلیسی؛ ذخیره خودکار با نمایش وضعیت. ثبت گروهی بر نمره جلسات اولویت دارد.</p>";
          for (const p of l.poudmans)
            for (const u of p.units)
              html +=
                '<div class="card"><h3>' +
                esc(p.name + " / " + u.name) +
                "</h3><table><thead><tr><th>دانش‌آموز</th><th>مستمر</th><th>پایانی</th></tr></thead><tbody>" +
                getSortedStudents(c)
                  .map(
                    (st) =>
                      "<tr><td>" +
                      esc(st.name) +
                      "</td><td>" +
                      gradeCell(c, l, st, "m", {
                        kind: "u",
                        pid: p.id,
                        uid: u.id,
                        value: ownScoreRecord(u.unitScores, st.id)?.m,
                      }) +
                      "</td><td>" +
                      gradeCell(c, l, st, "p", {
                        kind: "u",
                        pid: p.id,
                        uid: u.id,
                        value: ownScoreRecord(u.unitScores, st.id)?.p,
                      }) +
                      "</td></tr>",
                  )
                  .join("") +
                "</tbody></table></div>";
          showModal("ثبت گروهی نمرات", html);
        }

