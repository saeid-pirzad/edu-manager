      function selectScheduleDay(day) {
        state.scheduleDay = Number(day);
        render();
      }
      function renderMaster() {
        const today = todayIdx(),
          date = todayISO(),
          parity = getWeekParity(date);
        const days = [...(db.activeDays || [0, 1, 2, 3, 4, 5])].sort(
            (a, b) => a - b,
          ),
          periods = db.periods || 6;
        const selected = days.includes(state.scheduleDay)
          ? state.scheduleDay
          : days.includes(today)
            ? today
            : days[0];
        const number = (n) => n.toLocaleString("fa-IR");
        let weekly = 0;
        for (const day of days)
          for (let p = 0; p < periods; p++) {
            const e = getMasterEntry(day, p, date);
            if (e && (!state.masterFilter || e.classId === state.masterFilter))
              weekly++;
          }
        const slot = (day, p, compact = false) => {
          const entry = getMasterEntry(day, p, date),
            other =
              entry &&
              state.masterFilter &&
              entry.classId !== state.masterFilter;
          const cls = entry ? findClassById(entry.classId) : null,
            lesson = cls ? getLessonObj(cls.classObj, entry.lessonId) : null;
          const filled = entry && !other && lesson;
          let s =
            '<article class="week-slot ' +
            (filled ? "is-filled" : other ? "is-other" : "is-empty") +
            '">';
          if (!compact)
            s +=
              '<div class="week-period"><span>زنگ</span><strong>' +
              number(p + 1) +
              "</strong></div>";
          s += '<div class="week-slot-content">';
          if (filled) {
            s +=
              '<div class="week-class-label"><span class="week-color" style="background:' +
              getClassColor(entry.classId) +
              '"></span>' +
              esc(cls.classObj.name) +
              '<span class="week-school">' +
              esc(cls.school.name) +
              "</span></div><h4>" +
              esc(lesson.name) +
              "</h4><p>" +
              esc(lesson.teacher || "دبیر تعیین نشده") +
              '</p><div class="week-slot-actions no-print"><button onclick="clickMasterCell(' +
              day +
              "," +
              p +
              ')">بازکردن جلسه</button><button class="ghost" onclick="openMasterConfig(' +
              day +
              "," +
              p +
              ')" aria-label="تنظیم ' +
              esc(DAYS[day]) +
              " زنگ " +
              (p + 1) +
              '">تنظیم زنگ</button></div>';
          } else if (other) {
            s +=
              '<h4>برنامه کلاس دیگر</h4><p>کلاس انتخاب‌شده در این زنگ برنامه ندارد.</p><button class="ghost no-print" onclick="clickMasterCell(' +
              day +
              "," +
              p +
              ')">بررسی برنامه</button>';
          } else {
            s +=
              "<h4>" +
              (entry ? "درس نیازمند بررسی است" : "زنگ آزاد") +
              "</h4><p>" +
              (entry
                ? "تعریف درس این زنگ در دسترس نیست."
                : "برای این زنگ کلاس و درس انتخاب کنید.") +
              '</p><button class="week-add ghost no-print" onclick="' +
              (entry ? "openMasterConfig" : "clickMasterCell") +
              "(" +
              day +
              "," +
              p +
              ')">+ تنظیم برنامه</button>';
          }
          return s + "</div></article>";
        };
        let h = headerHtml();
        h +=
          "<header class=\"week-heading\"><div><p>برنامه آموزشی شما</p><h2>برنامه هفتگی</h2></div><button class=\"ghost no-print\" onclick=\"document.querySelector('.week-settings').open=true;document.querySelector('.week-settings').scrollIntoView({block:'start'});\">تنظیمات برنامه</button></header>";
        h +=
          '<section class="card week-overview"><div class="week-overview-info"><span class="week-parity ' +
          parity +
          '">هفته ' +
          (parity === "odd" ? "فرد" : "زوج") +
          "</span><strong>از " +
          esc(faDate(getSaturdayOf(date))) +
          "</strong><span>" +
          number(weekly) +
          ' زنگ برنامه‌ریزی‌شده</span></div><label class="week-filter no-print">نمایش برنامه کلاس<select onchange="state.masterFilter=this.value||null;render()"><option value="">همه کلاس‌ها</option>';
        for (const school of db.schools)
          for (const c of school.classes)
            h +=
              '<option value="' +
              esc(c.id) +
              '" ' +
              (state.masterFilter === c.id ? "selected" : "") +
              ">" +
              esc(school.name) +
              " — " +
              esc(c.name) +
              "</option>";
        h += "</select></label></section>";
        if (!days.length)
          h +=
            '<div class="card empty"><strong>روز کاری انتخاب نشده است</strong><p>از تنظیمات برنامه، روزهای تدریس خود را فعال کنید.</p></div>';
        else {
          h +=
            '<section class="week-agenda"><nav class="week-day-picker no-print" aria-label="انتخاب روز برنامه">';
          for (const d of days)
            h +=
              '<button type="button" aria-pressed="' +
              (d === selected) +
              '" onclick="selectScheduleDay(' +
              d +
              ')"><span>' +
              esc(DAYS[d]) +
              "</span>" +
              (d === today ? "<small>امروز</small>" : "") +
              "</button>";
          const count = Array.from({ length: periods }, (_, p) =>
            getMasterEntry(selected, p, date),
          ).filter(
            (e) =>
              e && (!state.masterFilter || e.classId === state.masterFilter),
          ).length;
          h +=
            '</nav><div class="week-day-heading"><h3>' +
            esc(DAYS[selected]) +
            "</h3><span>" +
            number(count) +
            " زنگ دارای برنامه · " +
            number(periods) +
            ' زنگ</span></div><div class="week-slot-list">';
          for (let p = 0; p < periods; p++) h += slot(selected, p);
          h += "</div></section>";
          h +=
            '<section class="card week-desktop"><header><h3>نمای کامل هفته</h3><p>برای ثبت اطلاعات، جلسه را باز کنید؛ برای تغییر درس از تنظیم زنگ استفاده کنید.</p></header><div class="table-scroll"><table class="week-table"><thead><tr><th>روز / زنگ</th>';
          for (let p = 0; p < periods; p++)
            h += "<th>زنگ " + number(p + 1) + "</th>";
          h += "</tr></thead><tbody>";
          for (const d of days) {
            h +=
              '<tr><td class="week-day-cell">' +
              esc(DAYS[d]) +
              (d === today ? "<small>امروز</small>" : "") +
              "</td>";
            for (let p = 0; p < periods; p++)
              h += "<td>" + slot(d, p, true) + "</td>";
            h += "</tr>";
          }
          h += "</tbody></table></div></section>";
        }
        h +=
          '<details class="card week-settings no-print" ' +
          (state.masterSettingsOpen ? "open" : "") +
          ' ontoggle="state.masterSettingsOpen=this.open"><summary>تنظیمات روزها و زنگ‌ها</summary><section><h4>روزهای کاری</h4><p>روزهای تدریس خود را مشخص کنید.</p><div class="week-working-days">';
        for (const [i, day] of DAYS.entries())
          h +=
            '<label><input type="checkbox" ' +
            (days.includes(i) ? "checked" : "") +
            ' onchange="toggleActiveDay(' +
            i +
            ')"><span>' +
            esc(day) +
            "</span></label>";
        h +=
          '</div></section><section><h4>تعداد زنگ‌های روزانه</h4><div class="week-period-controls"><button class="ghost" onclick="changePeriods(-1)" aria-label="کاهش تعداد زنگ">−</button><strong>' +
          number(periods) +
          ' زنگ</strong><button class="ghost" onclick="changePeriods(1)" aria-label="افزایش تعداد زنگ">+</button></div></section><section><h4>مبنای هفته‌های فرد و زوج</h4><p>تاریخ شنبه‌ای را انتخاب کنید که مبنای محاسبه هفته‌ها باشد.</p><div class="week-start-date"><label>تاریخ شروع<input type="date" id="weekStartInput" data-mutating="1" value="' +
          esc(db.settings.weekStartDate || date) +
          '" onchange="document.getElementById(\'shamsiWeekStart\').textContent=toShamsi(this.value)"></label><span class="shamsi-display" id="shamsiWeekStart">' +
          esc(toShamsi(db.settings.weekStartDate || date)) +
          '</span><button onclick="saveWeekStartDate()">ذخیره تاریخ مبنا</button></div></section></details>';
        return h;
      }

      async function toggleActiveDay(dayIdx) {
        if (!db.activeDays) db.activeDays = [0, 1, 2, 3, 4, 5];
        const idx = db.activeDays.indexOf(dayIdx);
        if (idx === -1) db.activeDays.push(dayIdx);
        else db.activeDays.splice(idx, 1);
        db.activeDays.sort((a, b) => a - b);
        await saveDB();
        render();
      }
      async function saveWeekStartDate() {
        const v = document.getElementById("weekStartInput").value;
        if (!v) return alert("تاریخ را وارد کنید");
        db.settings.weekStartDate = v;
        await saveDB();
        render();
        alert("✅ تاریخ شروع محاسبه ذخیره شد");
      }
      async function changePeriods(d) {
        const next = clamp((db.periods || 6) + d, 1, 12);
        const occupied = Object.entries(db.masterSchedule || {}).filter(
          ([key, value]) => value && Number(key.split("-")[1]) >= next,
        );
        if (next < (db.periods || 6) && occupied.length) {
          alert(
            "کاهش تعداد زنگ‌ها انجام نشد؛ ابتدا برنامه زنگ‌های " +
              [
                ...new Set(
                  occupied.map(([key]) => Number(key.split("-")[1]) + 1),
                ),
              ]
                .sort((a, b) => a - b)
                .join("، ") +
              " را جابه‌جا یا پاک کنید.",
          );
          return;
        }
        db.periods = next;
        await saveDB();
        render();
      }

      function openMasterConfig(day, period) {
        const cur = getBothEntries(day, period);
        const allClasses = [];
        db.schools.forEach((s) =>
          s.classes.forEach((c) => allClasses.push({ school: s, class: c })),
        );
        if (!allClasses.length) {
          showModal(
            "تنظیم زنگ",
            `<p class="empty">ابتدا مدرسه و کلاس بسازید</p><button onclick="closeModal()">بستن</button>`,
          );
          return;
        }
        function classSelect(id, val) {
          return `<select id="${id}" style="flex:1" onchange="updateLessonOptions('${id}')">
      <option value="">— هیچ —</option>
      ${allClasses.map((x) => `<option value="${x.class.id}" ${x.class.id === val ? "selected" : ""}>${esc(x.school.name)} / ${esc(x.class.name)}</option>`).join("")}
    </select>`;
        }
        function lessonSelect(id, classId, lessonId) {
          if (!classId)
            return `<select id="${id}" style="flex:1"><option value="">— اول کلاس —</option></select>`;
          const cls = findClassById(classId);
          if (!cls)
            return `<select id="${id}" style="flex:1"><option value="">— خطا —</option></select>`;
          return `<select id="${id}" style="flex:1">
      <option value="">— درس —</option>
      ${(cls.classObj.lessons || []).map((l) => `<option value="${l.id}" ${l.id === lessonId ? "selected" : ""}>${esc(l.name)}</option>`).join("")}
    </select>`;
        }

        let h =
          '<div class="week-config-intro"><strong>' +
          esc(DAYS[day]) +
          " · زنگ " +
          (period + 1).toLocaleString("fa-IR") +
          '</strong><p>برنامه ثابت را انتخاب کنید؛ اگر درس هفته‌های فرد و زوج متفاوت است، استثناها را هم مشخص کنید.</p></div><section class="week-config-section"><h4>برنامه ثابت همه هفته‌ها</h4><label for="cfgAllClass">کلاس</label>' +
          classSelect("cfgAllClass", cur.all?.classId) +
          '<label for="cfgAllLesson">درس</label>' +
          lessonSelect("cfgAllLesson", cur.all?.classId, cur.all?.lessonId) +
          "</section>";
        h +=
          '<details class="week-config-exceptions" ' +
          (cur.odd || cur.even ? "open" : "") +
          '><summary>برنامه متفاوت برای هفته فرد یا زوج</summary><section class="week-config-section"><h4>هفته‌های فرد</h4><label for="cfgOddClass">کلاس</label>' +
          classSelect("cfgOddClass", cur.odd?.classId) +
          '<label for="cfgOddLesson">درس</label>' +
          lessonSelect("cfgOddLesson", cur.odd?.classId, cur.odd?.lessonId) +
          '</section><section class="week-config-section"><h4>هفته‌های زوج</h4><label for="cfgEvenClass">کلاس</label>' +
          classSelect("cfgEvenClass", cur.even?.classId) +
          '<label for="cfgEvenLesson">درس</label>' +
          lessonSelect("cfgEvenLesson", cur.even?.classId, cur.even?.lessonId) +
          '</section></details><p class="week-config-note">برنامه فرد یا زوج، در همان هفته جایگزین برنامه ثابت می‌شود. نام دبیر از مشخصات درس خوانده می‌شود.</p><div class="week-config-actions"><button onclick="saveMasterConfig(' +
          day +
          "," +
          period +
          ')">ذخیره برنامه</button><button class="ghost" onclick="closeModal()">انصراف</button><button class="danger" onclick="clearMasterConfig(' +
          day +
          "," +
          period +
          ')">پاک‌کردن این زنگ</button></div>';

        showModal(`تنظیم ${DAYS[day]} — زنگ ${period + 1}`, h);
      }

      function updateLessonOptions(classSelectId) {
        const classId = document.getElementById(classSelectId).value;
        const lessonSelectId = classSelectId.replace("Class", "Lesson");
        const sel = document.getElementById(lessonSelectId);
        if (!sel) return;
        if (!classId) {
          sel.innerHTML = '<option value="">— اول کلاس —</option>';
          return;
        }
        const cls = findClassById(classId);
        if (!cls) {
          sel.innerHTML = '<option value="">— خطا —</option>';
          return;
        }
        sel.innerHTML =
          '<option value="">— درس —</option>' +
          (cls.classObj.lessons || [])
            .map((l) => `<option value="${l.id}">${esc(l.name)}</option>`)
            .join("");
      }

      async function saveMasterConfig(day, period) {
        db.masterSchedule = db.masterSchedule || {};
        const map = {
          all: { c: "cfgAllClass", l: "cfgAllLesson" },
          odd: { c: "cfgOddClass", l: "cfgOddLesson" },
          even: { c: "cfgEvenClass", l: "cfgEvenLesson" },
        };
        Object.keys(map).forEach((k) => {
          const classId = document.getElementById(map[k].c).value;
          const lessonId = document.getElementById(map[k].l).value;
          const key = `${day}-${period}-${k}`;
          if (classId && lessonId) {
            const cls = findClassById(classId);
            if (cls)
              db.masterSchedule[key] = {
                schoolId: cls.school.id,
                classId,
                lessonId,
              };
          } else {
            delete db.masterSchedule[key];
          }
        });
        await saveDB();
        closeModal();
        render();
      }

      async function clearMasterConfig(day, period) {
        if (!confirm("کل تنظیمات این زنگ پاک شوند؟")) return;
        delete db.masterSchedule[`${day}-${period}-all`];
        delete db.masterSchedule[`${day}-${period}-odd`];
        delete db.masterSchedule[`${day}-${period}-even`];
        await saveDB();
        closeModal();
        render();
      }

      function legacy_clickMasterCell(day, period) {
        const entry = getMasterEntry(day, period, todayISO());
        if (!entry || !entry.lessonId) {
          openMasterConfig(day, period);
          return;
        }
        const cls = findClassById(entry.classId);
        if (!cls) {
          alert("کلاس/درس حذف شده. لطفاً مجدد تنظیم کنید");
          openMasterConfig(day, period);
          return;
        }

        const allClasses = [];
        db.schools.forEach((s) =>
          s.classes.forEach((c) => allClasses.push({ school: s, class: c })),
        );

        const existing = db.sessions
          .filter((s) => {
            const sd = getDayIdxFromDate(s.date);
            return (
              s.classId === entry.classId && s.period === period && sd === day
            );
          })
          .sort((a, b) => b.date.localeCompare(a.date));

        let h = `<div style="background:#f8fafc;padding:12px;border-radius:8px;margin-bottom:14px">
    <div style="margin-bottom:10px">
      <strong>${DAYS[day]} — زنگ ${period + 1}</strong>
    </div>

    <div class="form-row" style="margin-bottom:6px">
      <label style="min-width:60px">کلاس:</label>
      <select id="sessNewClass" style="flex:1" onchange="updateSessionLessonOptions()">
        ${allClasses.map((x) => `<option value="${x.class.id}" ${x.class.id === entry.classId ? "selected" : ""}>${esc(x.school.name)} / ${esc(x.class.name)}</option>`).join("")}
      </select>
    </div>
    <div class="form-row" style="margin-bottom:6px">
      <label style="min-width:60px">درس:</label>
      <select id="sessNewLesson" style="flex:1">
        ${(cls.classObj.lessons || []).map((l) => `<option value="${l.id}" ${l.id === entry.lessonId ? "selected" : ""}>${esc(l.name)}</option>`).join("")}
      </select>
    </div>
  </div>

  <p>📅 تاریخ جلسه را انتخاب کنید:</p>
  <div class="form-row">
    <input type="date" id="sessNewDate" value="${todayISO()}" onchange="document.getElementById('shamsiSessNew').textContent=toShamsi(this.value)" style="flex:1">
    <span class="shamsi-display" id="shamsiSessNew">${toShamsi(todayISO())}</span>
    <button onclick="startSessionFromMaster(${day},${period})">📝 ایجاد / بازکردن</button>
  </div>
  <p class="muted" style="font-size:.85em">می‌توانید کلاس و درس را به صورت دستی تغییر دهید. اگر جلسه‌ای با این تاریخ و زنگ وجود داشته باشد باز می‌شود.</p>`;

        if (existing.length) {
          h += `<h4 style="margin-top:16px">جلسات ثبت‌شده این زنگ (${existing.length}):</h4><div>`;
          existing.slice(0, 15).forEach((s) => {
            const present = Object.values(s.attendance).filter(
              (x) => x === "present",
            ).length;
            const total = Object.keys(s.attendance).length;
            h += `<div class="list-item" onclick="openExistingSession('${s.id}')">
        <div><strong>${faDate(s.date)}</strong></div>
        <div class="muted" style="font-size:.85em">${present}/${total} حاضر | ${s.scores.length} امتیاز</div></div>`;
          });
          h += `</div>`;
        }
        showModal("ثبت جلسه", h);
      }

      function updateSessionLessonOptions() {
        const classId = document.getElementById("sessNewClass").value;
        const sel = document.getElementById("sessNewLesson");
        if (!sel) return;
        const cls = findClassById(classId);
        if (!cls) return;
        sel.innerHTML = (cls.classObj.lessons || [])
          .map((l) => `<option value="${l.id}">${esc(l.name)}</option>`)
          .join("");
      }

      async function startSessionFromMaster(day, period) {
        const date = document.getElementById("sessNewDate").value;
        const classId = document.getElementById("sessNewClass").value;
        const lessonId = document.getElementById("sessNewLesson").value;

        if (!date) return alert("تاریخ را انتخاب کنید");
        if (!classId || !lessonId) return alert("کلاس و درس را انتخاب کنید");

        const dIdx = getDayIdxFromDate(date);
        if (dIdx !== day) {
          if (
            !confirm(
              `تاریخ ${faDate(date)} روز ${DAYS[dIdx]} است، نه ${DAYS[day]}. ادامه می‌دهید؟`,
            )
          )
            return;
        }

        let session = db.sessions.find(
          (s) =>
            s.classId === classId && s.date === date && s.period === period,
        );
        if (!session) {
          const cls = findClassById(classId);
          session = {
            id: uid(),
            schoolId: cls.school.id,
            classId: classId,
            date,
            period,
            lessonId: lessonId,
            poudmanId: null,
            unitId: null,
            attendance: {},
            scores: [],
            roster: snapshotRoster(cls.classObj),
          };
          db.sessions.push(session);
          await saveDB({ sessionId: session.id });
        } else if (session.lessonId !== lessonId) {
          alert(
            "این زنگ برای درس دیگری ثبت شده است؛ برای حفظ سابقه جلسه قبلی باز می‌شود.",
          );
        }
        openSessionModal(session);
      }
      function openExistingSession(id) {
        const sess = db.sessions.find((s) => s.id === id);
        if (sess) openSessionModal(sess);
      }

