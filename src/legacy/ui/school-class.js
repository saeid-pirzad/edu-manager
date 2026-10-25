      function renderSchools() {
        let h =
          headerHtml() +
          '<section class="workflow-welcome no-print"><h2>مدرسه‌های من</h2><p>مدرسه را انتخاب کنید؛ سپس دانش‌آموزان و درس‌های کلاس را آماده کنید.</p><button onclick="goMaster()">برنامه هفتگی من</button></section>';
        h += dashboardDirectory(db.schools, "schools");
        h +=
          '<div class="card"><h3>افزودن مدرسه</h3><form onsubmit="addSchool(event)" data-entity-create="school" class="row"><input id="schoolCreateName" name="name" placeholder="نام مدرسه" aria-label="نام مدرسه جدید" aria-describedby="schoolCreateError" required maxlength="500" style="flex:1"><button type="submit" data-mutating="1">افزودن مدرسه</button><p id="schoolCreateError" class="entity-create-error" role="alert"></p></form></div>';
        return h;
      }
      function renderSchool() {
        const school = getSchool(state.schoolId);
        if (!school) {
          state.view = "schools";
          return renderSchools();
        }
        let h =
          headerHtml() +
          '<div class="breadcrumb"><a onclick="goSchools()">مدارس</a> ← ' +
          esc(school.name) +
          "</div>";
        const count = school.classes.reduce((n, c) => n + c.students.length, 0);
        h +=
          '<section class="school-overview no-print"><div><span>' +
          school.classes.length.toLocaleString("fa-IR") +
          " کلاس</span><span>" +
          count.toLocaleString("fa-IR") +
          " هنرجو</span></div><button onclick=\"openReportScope('" +
          esc(school.id) +
          "')\">گزارش این مدرسه ←</button></section>";
        h +=
          '<div class="entity-context-edit no-print"><button class="ghost" data-mutating="1" onclick="EduV24.openEntityEditor(\'school\',\'' +
          esc(school.id) +
          "')\">ویرایش مشخصات مدرسه</button></div>";
        h += dashboardDirectory(school.classes, "classes", school.id);
        h +=
          '<div class="card"><h3>افزودن کلاس</h3><form onsubmit="addClass(event)" data-entity-create="class" class="row"><input id="classCreateName" name="name" placeholder="نام کلاس" aria-label="نام کلاس جدید" aria-describedby="classCreateError" required maxlength="500" style="flex:1"><button type="submit" data-mutating="1">افزودن کلاس</button><p id="classCreateError" class="entity-create-error" role="alert"></p></form></div>';
        return h;
      }

      function renderClass() {
        const c = getClassObj(state.schoolId, state.classId);
        if (!c) {
          state.view = "school";
          return renderSchool();
        }
        const school = getSchool(state.schoolId);
        let h = headerHtml();
        h += `<div class="breadcrumb"><a onclick="goSchools()">مدارس</a> ← <a onclick="goSchool('${school.id}')">${esc(school.name)}</a> ← ${esc(c.name)}</div>`;
        h +=
          '<div class="class-context-actions no-print"><button onclick="openReportScope(\'' +
          esc(school.id) +
          "','" +
          esc(c.id) +
          "','karnameh')\">کارنامه این کلاس</button><button class=\"ghost\" onclick=\"goMaster('" +
          esc(c.id) +
          "')\">برنامه کلاس</button></div>";
        h +=
          '<div class="entity-context-edit no-print"><button class="ghost" data-mutating="1" onclick="EduV24.openEntityEditor(\'class\',\'' +
          esc(c.id) +
          "','" +
          esc(school.id) +
          "')\">ویرایش مشخصات کلاس</button></div>";
        h += `<div class="tabs">
    <button class="${state.tab === "lessons" ? "active" : ""}" onclick="setTab('lessons')">📚 دروس</button>
    <button class="${state.tab === "students" ? "active" : ""}" onclick="setTab('students')">👥 دانش‌آموزان</button>
  </div>`;
        if (state.tab === "lessons") h += renderLessonsTab(c);
        else h += renderStudentsTab(c);
        return h;
      }

      function renderLessonsTab(c) {
        const lessons = c.lessons || [];
        const book =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15"/></svg>';
        let h =
          '<section class="lesson-schedule no-print"><div><strong>برنامه هفتگی کلاس</strong><p>روز و ساعت برگزاری درس‌ها را تنظیم کنید.</p></div><button class="ghost" onclick="goMaster(\'' +
          esc(c.id) +
          "')\">مشاهده برنامه ←</button></section>";
        h +=
          '<details class="card lesson-create no-print" ' +
          (!lessons.length ? "open" : "") +
          '><summary><span><strong>افزودن درس جدید</strong><small>تعریف درس و روش ارزشیابی</small></span><span class="lesson-plus" aria-hidden="true">+</span></summary><form onsubmit="addLesson(event)" class="lesson-create-form"><label>نام درس<input name="name" placeholder="مثلاً دانش فنی پایه" required></label><label>نام دبیر <span class="muted">(اختیاری)</span><input name="teacher" placeholder="نام و نام خانوادگی"></label><label>زنگ در هفته<input name="periods" type="number" value="2" min="1" max="10" required inputmode="numeric"></label><label>روش ارزشیابی<select name="gradeMode"><option value="kardanesh">کاردانش — عملی و تئوری</option><option value="standard">فنی — پودمان و واحد کار</option></select></label><button type="submit">افزودن درس</button></form><p class="lesson-form-note">کاردانش: عملی ۷۰٪ و تئوری ۳۰٪. فنی: پودمان و واحد کار. تنظیمات بیشتر در صورت نیاز در دسترس است.</p></details>';
        h +=
          '<section class="card class-lessons"><header class="lesson-list-heading"><div><h3>دروس کلاس <span class="lesson-count">' +
          lessons.length.toLocaleString("fa-IR") +
          '</span></h3><p>ورود به درس، ثبت نمره و مدیریت ارزشیابی</p></div></header><div class="lesson-items">';
        if (!lessons.length)
          h +=
            '<div class="empty lesson-empty">' +
            book +
            "<strong>اولین درس کلاس را تعریف کنید</strong><p>نام درس و روش ارزشیابی را در فرم بالا وارد کنید.</p></div>";
        for (const l of lessons) {
          const id = esc(l.id),
            dual = l.gradeMode === "kardanesh";
          h +=
            '<article class="lesson-item"><div class="lesson-identity"><span class="lesson-symbol ' +
            (dual ? "dual" : "modular") +
            '">' +
            book +
            "</span><div><h4>" +
            esc(l.name) +
            "</h4><p>" +
            esc(l.teacher || "دبیر تعیین نشده") +
            '</p></div></div><div class="lesson-meta"><span class="lesson-mode ' +
            (dual ? "dual" : "modular") +
            '">' +
            (dual ? "نظری و عملی" : "پودمانی") +
            '</span><span class="lesson-period">' +
            Number(l.periodsPerWeek || 2).toLocaleString("fa-IR") +
            ' زنگ در هفته</span></div><p class="lesson-policy">' +
            esc(EduPolicy.describe(l)) +
            '</p><div class="lesson-actions no-print"><button class="lesson-enter" onclick="goLesson(\'' +
            id +
            '\')">ورود به درس <span aria-hidden="true">←</span></button><button class="ghost" onclick="openBulkScoreModal(\'' +
            id +
            '\')">ثبت گروهی نمره</button><button class="lesson-config ghost" onclick="openLessonConfig(\'' +
            id +
            '\')">تنظیمات درس</button><details class="lesson-more"><summary id="lesson-menu-' +
            id +
            '" aria-label="عملیات بیشتر برای ' +
            esc(l.name) +
            '">بیشتر</summary><div class="lesson-more-menu">' +
            (!dual && l.poudmans.length
              ? '<button class="ghost" data-mutating="1" onclick="EduV24.course.openNames(\'' +
                id +
                "').catch(EduV24.course.error)\">ویرایش نام پودمان‌ها</button>"
              : "") +
            '<button class="ghost" onclick="EduV24.course.copy(\'' +
            id +
            '\').catch(EduV24.course.error)">کپی تعریف بدون نمرات</button><button class="danger" onclick="deleteLesson(\'' +
            id +
            "')\">حذف درس</button></div></details></div></article>";
        }
        return h + "</div></section>";
      }

      function filterStudentRoster(control) {
        const root = control.closest(".student-directory"),
          list = root.querySelector(".student-roster");
        const norm = (s) =>
          String(s || "")
            .replace(/ي/g, "ی")
            .replace(/ك/g, "ک")
            .replace(/[۰-۹]/g, (c) => c.charCodeAt(0) - 1776)
            .replace(/[٠-٩]/g, (c) => c.charCodeAt(0) - 1632)
            .replace(/‌/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        const query = norm(root.querySelector('input[type="search"]').value),
          sort = root.querySelector("select").value,
          collator = new Intl.Collator("fa", {
            numeric: true,
            sensitivity: "base",
          });
        const cards = [...list.children];
        cards.sort((a, b) => {
          if (sort === "family")
            return Number(a.dataset.order) - Number(b.dataset.order);
          if (sort === "code") {
            if (!a.dataset.code)
              return b.dataset.code
                ? 1
                : Number(a.dataset.order) - Number(b.dataset.order);
            if (!b.dataset.code) return -1;
            return (
              collator.compare(norm(a.dataset.code), norm(b.dataset.code)) ||
              Number(a.dataset.order) - Number(b.dataset.order)
            );
          }
          return (
            collator.compare(a.dataset.name, b.dataset.name) ||
            Number(a.dataset.order) - Number(b.dataset.order)
          );
        });
        let count = 0;
        for (const card of cards) {
          card.hidden = !norm(
            card.dataset.name + " " + card.dataset.code,
          ).includes(query);
          if (!card.hidden) count++;
          list.append(card);
        }
        root.querySelector(".roster-results").textContent =
          count.toLocaleString("fa-IR") +
          " نفر از " +
          cards.length.toLocaleString("fa-IR") +
          " هنرجو";
        root.querySelector(".roster-no-results").hidden =
          count > 0 || cards.length === 0;
      }
      function renderStudentsTab(c) {
        const students = getSortedStudents(c);
        let h =
          '<details class="card quick-create student-add" ' +
          (!students.length ? "open" : "") +
          '><summary>افزودن هنرجوی جدید</summary><form onsubmit="addStudent(event)" class="student-add-form" data-entity-create="student" novalidate><label>نام و نام خانوادگی<input id="studentCreateName" name="name" aria-describedby="studentCreateError" placeholder="نام کامل هنرجو" required maxlength="200"></label><label>کد دانش‌آموزی <span class="muted">(اختیاری)</span><input id="studentCreateCode" name="code" maxlength="120" aria-describedby="studentCreateError" placeholder="کد یکتا در کلاس" inputmode="numeric"></label><button type="submit">افزودن هنرجو</button><p id="studentCreateError" class="entity-create-error" role="alert"></p></form></details>';
        h +=
          '<details class="card student-import no-print"><summary>افزودن گروهی از فایل CSV</summary><p>ابتدا قالب را بگیرید، نام هنرجویان را وارد کنید و فایل تکمیل‌شده را برای بررسی بارگذاری کنید.</p><div class="row"><button class="ghost" onclick="downloadExcelTemplate()">دریافت قالب CSV</button><button onclick="document.getElementById(\'excelFile\').click()">انتخاب فایل CSV</button></div></details>';
        h +=
          '<section class="card student-directory"><header class="roster-heading"><div><h3>هنرجویان کلاس <span class="lesson-count">' +
          students.length.toLocaleString("fa-IR") +
          "</span></h3><p>مشخصات، کارنامه و مدیریت اعضای کلاس</p></div></header>";
        if (!students.length)
          h +=
            '<div class="empty"><strong>هنوز هنرجویی در این کلاس نیست</strong><p>از فرم بالا یک هنرجو اضافه کنید یا فهرست کلاس را با CSV وارد کنید.</p></div>';
        h +=
          '<div class="roster-toolbar no-print" ' +
          (!students.length ? "hidden" : "") +
          '><label class="roster-search"><span>جست‌وجو در کلاس</span><input type="search" placeholder="نام یا کد دانش‌آموزی…" oninput="filterStudentRoster(this)"></label><label class="roster-sort"><span>مرتب‌سازی</span><select onchange="filterStudentRoster(this)"><option value="family">نام خانوادگی</option><option value="name">نام</option><option value="code">کد دانش‌آموزی</option></select></label></div><p class="roster-results" role="status" aria-live="polite">' +
          students.length.toLocaleString("fa-IR") +
          " نفر از " +
          students.length.toLocaleString("fa-IR") +
          ' هنرجو</p><div class="student-roster">';
        for (const [i, st] of students.entries()) {
          const id = esc(st.id),
            initial = esc(
              st.name
                .trim()
                .split(/\s+/)
                .map((x) => [...x][0])
                .filter(Boolean)
                .slice(0, 2)
                .join(" "),
            );
          h +=
            '<article class="student-profile" data-name="' +
            esc(st.name) +
            '" data-code="' +
            esc(st.code || "") +
            '" data-order="' +
            i +
            '"><div class="student-profile-main"><span class="student-avatar" aria-hidden="true">' +
            initial +
            '</span><div class="student-profile-info"><h4>' +
            esc(st.name) +
            "</h4><p>" +
            (st.code
              ? "کد دانش‌آموزی: <bdi>" + esc(st.code) + "</bdi>"
              : '<span class="student-code-missing">کد ثبت نشده</span>') +
            '</p></div><span class="student-row-number" aria-label="ردیف ' +
            (i + 1) +
            '">' +
            (i + 1).toLocaleString("fa-IR") +
            '</span></div><div class="student-profile-actions no-print"><button class="ghost" onclick="openEditStudentModal(\'' +
            id +
            "')\">ویرایش مشخصات</button><button class=\"student-report\" onclick=\"showModal('کارنامه هنرجو',buildDetailedKarnamehHtml(getClassObj(state.schoolId,state.classId),'" +
            id +
            '\'))">کارنامه</button><details class="student-more"><summary id="student-menu-' +
            esc(c.id) +
            "-" +
            id +
            '" aria-label="عملیات بیشتر برای ' +
            esc(st.name) +
            '">بیشتر</summary><div class="student-more-menu"><button class="ghost" onclick="openTransferModal(\'' +
            id +
            '\')">انتقال / کپی به کلاس دیگر</button><button class="danger" onclick="deleteStudent(\'' +
            id +
            "')\">بایگانی هنرجو</button></div></details></div></article>";
        }
        h +=
          '</div><div class="empty roster-no-results" hidden>هنرجویی پیدا نشد؛ نام یا کد دیگری جست‌وجو کنید.</div></section>';
        return h + buildArchiveHtml(c);
      }

      // Keep the link alive while mobile browsers hand the file to their download manager.
