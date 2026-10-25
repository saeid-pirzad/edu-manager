        function render(mode) {
          initialize(mode);
          if (mode === "annual") setTimeout(loadAnnualPeriodChoices, 0);
          const f = filters,
            school = db.schools.find((s) => s.id === f.schoolId),
            c = school?.classes.find((c) => c.id === f.classId);
          const people = new Map(
            [...(c?.students || []), ...(c?.archivedStudents || [])].map(
              (st) => [st.id, st],
            ),
          );
          if (c)
            for (const x of db.sessions.filter(
              (x) => x.schoolId === school.id && x.classId === c.id,
            ))
              for (const st of x.roster || [])
                if (!people.has(st.id)) people.set(st.id, st);
          const option = (value, label, chosen) =>
            '<option value="' +
            esc(value) +
            '" ' +
            (value === chosen ? "selected" : "") +
            ">" +
            esc(label) +
            "</option>";
          let h =
            '<section class="card periodic-controls no-print"><h3>تهیه گزارش ' +
            modeLabel(mode) +
            '</h3><p>هفتگی: شنبه تا جمعه. ماهانه: ماه شمسی. سالانه: مهر تا شهریور، نوبت اول و دوم سال تحصیلی فعال. گزارش اولیا فقط اطلاعات هنرجوی انتخاب‌شده را در بر می‌گیرد.</p><div class="periodic-control-grid"><label>مخاطب<select onchange="EduPeriodicReports.set(\'audience\',this.value)">' +
            option("management", "مدیریت مدرسه", f.audience) +
            option("parent", "اولیای یک هنرجو", f.audience) +
            "</select></label><label>" +
            (mode === "annual"
              ? "سال تحصیلی " + esc(db.settings.academicYear)
              : mode === "weekly"
                ? "یک تاریخ از هفته"
                : mode === "monthly"
                  ? "یک تاریخ از ماه شمسی"
                  : "تاریخ گزارش") +
            '<input type="' +
            (mode === "annual" ? "hidden" : "date") +
            '" value="' +
            esc(f.date) +
            '" onchange="EduPeriodicReports.set(\'date\',this.value)"></label><label>مدرسه<select onchange="EduPeriodicReports.set(\'schoolId\',this.value)">' +
            option("", "انتخاب مدرسه", f.schoolId) +
            db.schools.map((s) => option(s.id, s.name, f.schoolId)).join("") +
            "</select></label><label>کلاس<select onchange=\"EduPeriodicReports.set('classId',this.value)\">" +
            option(
              "",
              f.audience === "parent"
                ? "انتخاب کلاس"
                : "همه کلاس‌های این مدرسه",
              f.classId,
            ) +
            (school?.classes || [])
              .map((c) => option(c.id, c.name, f.classId))
              .join("") +
            "</select></label>";
          if (mode === "annual") {
            for (const [field, id, label] of [
              ["annualFirstId", "annualFirstPeriod", "اطلاعات نوبت اول"],
              ["annualSecondId", "annualSecondPeriod", "اطلاعات نوبت دوم"],
            ])
              h +=
                "<label>" +
                label +
                '<select id="' +
                id +
                '" onchange="EduPeriodicReports.set(\'' +
                field +
                "',this.value)\">" +
                option("", "انتخاب خودکار در صورت نبود ابهام", f[field]) +
                annualPeriodList
                  .map((row) =>
                    option(
                      row.id,
                      row.term + (row.closed ? " · بسته" : ""),
                      f[field],
                    ),
                  )
                  .join("") +
                "</select></label>";
          }
          if (f.audience === "parent")
            h +=
              "<label>هنرجو<select onchange=\"EduPeriodicReports.set('studentId',this.value)\">" +
              option("", "انتخاب هنرجو", f.studentId) +
              [...people.values()]
                .sort((a, b) => a.name.localeCompare(b.name, "fa"))
                .map((st) =>
                  option(
                    st.id,
                    st.name + (st.code ? " — " + st.code : ""),
                    f.studentId,
                  ),
                )
                .join("") +
              "</select></label>";
          if (f.audience === "management")
            h +=
              '<label>سطح جزئیات<select onchange="EduPeriodicReports.set(\'detailLevel\',this.value)"><option value="summary" ' +
              (f.detailLevel === "summary" ? "selected" : "") +
              '>خلاصه مدیریتی و فعالیت‌ها</option><option value="full" ' +
              (f.detailLevel === "full" ? "selected" : "") +
              ">جزئیات کامل حضور هر جلسه</option></select></label>";
          h +=
            '<label>نام تنظیم‌کننده (اختیاری)<input value="' +
            esc(f.author) +
            '" maxlength="200" oninput="EduPeriodicReports.author(this.value)"></label></div><label class="periodic-note-field">توضیحات این گزارش (اختیاری)<textarea rows="3" maxlength="' +
            Math.max(10000, readNote(noteKey(f)).length) +
            '" oninput="EduPeriodicReports.note(this.value)">' +
            esc(readNote(noteKey(f))) +
            '</textarea></label><div id="periodicNoteStatus">' +
            noteWarning() +
            '</div><button class="periodic-build" onclick="EduPeriodicReports.generate()">تهیه گزارش ' +
            modeLabel(mode) +
            '</button><p id="periodicError" role="alert"></p></section><div id="periodicReportOutput">';
          h +=
            last && last.signature === reportSignature()
              ? documentHtml(last.model)
              : '<div class="card empty" role="status">' +
                (last
                  ? "اطلاعات یا دوره تغییر کرده است؛ برای نمایش نتیجه معتبر، گزارش را دوباره تهیه کنید."
                  : "محدوده و مخاطب را انتخاب کنید و «تهیه گزارش» را بزنید.") +
                "</div>";
          return h + "</div>";
        }
