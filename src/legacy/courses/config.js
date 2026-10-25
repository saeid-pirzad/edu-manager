      function openLessonConfig(lId) {
        const c = getClassObj(state.schoolId, state.classId);
        const lesson = getLessonObj(c, lId);
        if (!lesson) return;
        let h = `<div class="form-row"><label>نام درس:</label><input id="cfgName" value="${esc(lesson.name)}" style="flex:1"></div>
    <div class="form-row"><label>نام دبیر:</label><input id="cfgTeacher" value="${esc(lesson.teacher || "")}" placeholder="مثلاً آقای احمدی" style="flex:1"></div>
    <div class="form-row"><label>گروه درسی:</label><select id="cfgGradeMode" onchange="document.getElementById('cfgTechnical').hidden=this.value==='kardanesh';document.getElementById('cfgKardanesh').hidden=this.value!=='kardanesh'"><option value="standard" ${lesson.gradeMode !== "kardanesh" ? "selected" : ""}>فنی (پودمانی)</option><option value="kardanesh" ${lesson.gradeMode === "kardanesh" ? "selected" : ""}>کاردانش (تئوری و عملی)</option></select></div>
    <p class="muted">تغییر نوع، نمرات قبلی را تبدیل نمی‌کند؛ سوابق هر روش جداگانه حفظ می‌شوند. تنظیمات پودمان و وزن‌های مستمر و پایانی مخصوص گروه فنی هستند.</p>
    <div class="form-row"><label>زنگ/هفته:</label><input id="cfgPeriods" type="number" min="1" max="10" value="${lesson.periodsPerWeek || 2}" style="width:100px"></div>
    <p id="cfgKardanesh" ${lesson.gradeMode === "kardanesh" ? "" : "hidden"}>کاردانش: تئوری ۳۰٪، عملی ۷۰٪؛ نمره نهایی خودکار و حد قبولی ۱۴. ثبت نمرات از بخش نمرات درس انجام می‌شود.</p><div id="cfgTechnical" ${lesson.gradeMode === "kardanesh" ? "hidden" : ""}><div class="form-row"><label>وزن مستمر (%):</label><input id="cfgWeightM" type="number" min="0" max="100" value="${lesson.weightMostamar ?? 40}" style="width:90px">
    <label>وزن پایانی (%):</label><input id="cfgWeightP" type="number" min="0" max="100" value="${lesson.weightPayani ?? 60}" style="width:90px"></div>
    <h4>پودمان‌ها و واحدها</h4>`;
        (lesson.poudmans.length
          ? lesson.poudmans
          : makeDefaultPoudmans()
        ).forEach((p, pi) => {
          h += `<div style="margin:10px 0;padding:10px;background:#f8fafc;border-radius:8px">
      <div class="form-row"><label>پودمان ${pi + 1}:</label><input class="cfgPname" data-pi="${pi}" value="${esc(p.name)}" style="flex:1"></div>`;
          p.units.forEach((u, ui) => {
            h += `<div class="form-row" style="margin-right:20px"><label>واحد ${ui + 1}:</label>
        <input class="cfgUname" data-pi="${pi}" data-ui="${ui}" value="${esc(u.name)}" style="flex:1"></div>`;
          });
          h += `</div>`;
        });
        h += `</div><div class="row" style="justify-content:flex-end;margin-top:14px">
    <button class="ghost" onclick="closeModal()">انصراف</button>
    <button onclick="saveLessonConfig('${lId}')">💾 ذخیره</button></div>`;
        showModal("تنظیمات درس", h);
      }
      async function saveLessonConfig(lId) {
        const c = getClassObj(state.schoolId, state.classId);
        const lesson = getLessonObj(c, lId);
        const mode = document.getElementById("cfgGradeMode").value;
        const wm = Number(document.getElementById("cfgWeightM").value),
          wp = Number(document.getElementById("cfgWeightP").value),
          periods = Number(document.getElementById("cfgPeriods").value);
        if (!Number.isInteger(periods) || periods < 1 || periods > 10)
          return alert("زنگ هفتگی باید ۱ تا ۱۰ باشد.");
        if (
          !Number.isFinite(wm) ||
          !Number.isFinite(wp) ||
          wm < 0 ||
          wp < 0 ||
          wm > 100 ||
          wp > 100 ||
          (mode === "standard" && wm + wp !== 100)
        )
          return alert(
            "وزن‌ها باید صفر تا صد و مجموع وزن‌های مستمر و پایانی صد باشد.",
          );
        if (
          mode !== (lesson.gradeMode || "standard") &&
          !confirm(
            "نوع نمره‌دهی تغییر کند؟ سوابق تبدیل نمی‌شوند و جداگانه حفظ می‌شوند.",
          )
        )
          return;
        if (mode === "standard" && !lesson.poudmans.length)
          lesson.poudmans = makeDefaultPoudmans();
        lesson.gradeMode = mode;
        lesson.name =
          document.getElementById("cfgName").value.trim() || lesson.name;
        lesson.teacher = document.getElementById("cfgTeacher").value.trim();
        lesson.periodsPerWeek =
          parseInt(document.getElementById("cfgPeriods").value) || 2;
        lesson.weightMostamar = wm;
        lesson.weightPayani = wp;
        document
          .querySelectorAll(
            mode === "standard" ? ".cfgPname" : ".no-course-fields",
          )
          .forEach(
            (i) => (lesson.poudmans[+i.dataset.pi].name = i.value.trim()),
          );
        document
          .querySelectorAll(
            mode === "standard" ? ".cfgUname" : ".no-course-fields",
          )
          .forEach(
            (i) =>
              (lesson.poudmans[+i.dataset.pi].units[+i.dataset.ui].name =
                i.value.trim()),
          );
        await saveDB({ classId: c.id });
        closeModal();
        render();
      }

