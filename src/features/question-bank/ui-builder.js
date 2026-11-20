(function (root) {
  "use strict";
  function create({
    state,
    D,
    el,
    button,
    field,
    number,
    form,
    saveButton,
    questionCountsByUnit,
    unitLabel,
    tabScopes,
    commit,
    preview,
    content,
  }) {
    function builder(parent) {
      const f = form(
        parent,
        async () => {
          f.dataset.submitted = "true";
          update();
          if (!f.reportValidity()) return;
          const exam = D.generate(state.bank, {
            courseId: state.courseId,
            unitIds: checks.filter((c) => c.checked).map((c) => c.value),
            counts: Object.fromEntries(
              Object.entries(counts).map(([k, n]) => [k, n.value]),
            ),
            title: name.value,
            school: school.value,
            teacher: teacher.value,
            date: date.value,
            duration: duration.value,
            totalScore: totalScore.value,
          });
          const next = structuredClone(state.bank);
          next.exams.push(exam);
          if (await commit(next)) preview(exam);
        },
        {
          title: "طراحی آزمون",
          subtitle: "انتخاب بخش‌ها، ترکیب سؤال‌ها و مشخصات آزمون",
          kind: "exam",
        },
      );
      f.classList.add("qb-builder");
      const units = state.bank.units.filter(
          (u) => u.courseId === state.courseId,
        ),
        questionTypes = Object.keys(D.types),
        questionCounts = questionCountsByUnit(state.bank.questions, units),
        scope = el("fieldset", undefined, "qb-unit-selection");
      scope.append(el("legend", `۱ · درس و ${unitLabel()}‌های آزمون`));
      f.append(scope);
      const coursePicker = parent.querySelector(".qb-toolbar");
      if (coursePicker) {
        coursePicker.classList.add("qb-builder-course");
        scope.append(coursePicker);
      }
      const unitList = el("div", undefined, "qb-builder-units");
      scope.append(unitList);
      if (!units.length)
        scope.append(
          el(
            "p",
            `ابتدا در تب بانک سؤال، ${unitLabel()} و سؤال‌های آن را ثبت کنید.`,
            "qb-help",
          ),
        );
      const checks = units.map((u) => {
        const n = field(unitList, u.title);
        n.type = "checkbox";
        n.parentElement.prepend(n);
        n.value = u.id;
        n.checked = tabScopes.builder.unitIds?.includes(u.id) || false;
        n.parentElement.append(
          el(
            "small",
            `${number(questionCounts.get(u.id).total)} سؤال`,
            "qb-unit-count",
          ),
        );
        return n;
      });
      const counts = {},
        available = {};
      const plan = el("div", undefined, "qb-plan-summary qb-field-wide");
      plan.setAttribute("role", "status");
      plan.setAttribute("aria-live", "polite");
      const update = () => {
        const selected = checks.filter((c) => c.checked).map((c) => c.value);
        tabScopes.builder.unitIds = selected;
        const capacities = Object.fromEntries(
          questionTypes.map((type) => [type, 0]),
        );
        for (const id of selected)
          for (const type of questionTypes)
            capacities[type] += questionCounts.get(id).types[type];
        let total = 0;
        selectAll.disabled =
          checks.length === 0 || selected.length === checks.length;
        clearAll.disabled = selected.length === 0;
        for (const type of questionTypes) {
          const capacity = capacities[type];
          const requested = Number(D.digits(counts[type].value));
          if (Number.isInteger(requested) && requested > 0) total += requested;
          available[type].replaceChildren(
            el("span", number(capacity)),
            el("span", " سؤال موجود", "qb-capacity-caption"),
          );
          available[type].setAttribute(
            "aria-label",
            `${number(capacity)} سؤال موجود`,
          );
          available[type].title = `${number(capacity)} سؤال موجود`;
          counts[type].setCustomValidity(
            !/^\d+$/.test(D.digits(counts[type].value)) ||
              !Number.isInteger(requested) ||
              requested < 0 ||
              requested > 500
              ? "تعداد را با عدد صحیح از صفر تا ۵۰۰ وارد کنید."
              : requested > capacity
                ? `فقط ${number(capacity)} سؤال از این نوع در بخش‌های انتخاب‌شده موجود است.`
                : "",
          );
          counts[type].setAttribute(
            "aria-invalid",
            String(!counts[type].validity.valid),
          );
          counts[type].parentElement.dataset.shortage = String(
            Number.isFinite(requested) && requested > capacity,
          );
        }
        scope.dataset.empty = String(selected.length === 0);
        checks[0]?.setCustomValidity(
          selected.length ? "" : `حداقل یک ${unitLabel()} انتخاب کنید.`,
        );
        let scoreError = "";
        try {
          D.examScore(totalScore.value);
        } catch (e) {
          scoreError = e.message;
        }
        if (total === 0 || total > 500)
          scoreError = "مجموع سؤال‌های آزمون باید بین ۱ و ۵۰۰ باشد.";
        totalScore.setCustomValidity(scoreError);
        totalScore.setAttribute(
          "aria-invalid",
          String(
            Boolean(scoreError) &&
              (totalScore.dataset.touched === "true" ||
                f.dataset.submitted === "true"),
          ),
        );
        for (const input of Object.values(counts))
          input.setAttribute("aria-invalid", String(!input.validity.valid));
        plan.replaceChildren(
          el("span", `${number(selected.length)} بخش انتخاب‌شده`),
          el("strong", `${number(total)} سؤال در آزمون`),
        );
      };
      const selectionActions = el("div", undefined, "qb-selection-actions");
      selectionActions.setAttribute("role", "group");
      selectionActions.setAttribute("aria-label", "انتخاب بخش‌های آزمون");
      scope.append(selectionActions);
      const selectAll = button(
        "انتخاب همه",
        () => {
          checks.forEach((c) => (c.checked = true));
          state.dirty = true;
          update();
        },
        selectionActions,
      );
      const clearAll = button(
        "لغو انتخاب",
        () => {
          checks.forEach((c) => (c.checked = false));
          state.dirty = true;
          update();
        },
        selectionActions,
      );
      selectAll.insertAdjacentHTML("afterbegin", root.EduIcons.html("check"));
      clearAll.insertAdjacentHTML("afterbegin", root.EduIcons.html("minus"));
      checks.forEach((c) => (c.onchange = update));
      const composition = el(
        "fieldset",
        undefined,
        "qb-composition qb-field-wide",
      );
      composition.append(el("legend", "۲ · ترکیب سؤال‌ها"));
      composition.append(
        el(
          "p",
          "تعداد هر نوع و نمرهٔ کل را مشخص کنید؛ بارم سؤال‌های تصادفی دقیقاً برابر نمرهٔ کل خواهد بود.",
          "qb-composition-hint",
        ),
      );
      f.append(composition);
      const totalScore = field(composition, "نمرهٔ کل آزمون", "20");
      totalScore.parentElement.classList.add("qb-target-score");
      totalScore.inputMode = "decimal";
      totalScore.required = true;
      totalScore.onfocus = totalScore.onclick = () => totalScore.select();
      totalScore.oninput = () => {
        totalScore.dataset.touched = "true";
        update();
      };
      const countGrid = el(
        "div",
        undefined,
        "course-grid qb-field-wide qb-count-grid",
      );
      composition.append(countGrid);
      for (const [type, label] of Object.entries(D.types)) {
        counts[type] = field(countGrid, `تعداد ${label}`, "0");
        counts[type].inputMode = "numeric";
        counts[type].onfocus = counts[type].onclick = () =>
          counts[type].select();
        counts[type].oninput = update;
        counts[type].parentElement.classList.add("qb-count-field");
        counts[type].parentElement.dataset.questionType = type;
        const countTitle = el("span", undefined, "qb-count-title");
        const countPrefix = el("span", "تعداد ");
        countPrefix.hidden = true;
        countTitle.append(countPrefix, document.createTextNode(label));
        counts[type].parentElement.firstChild.replaceWith(countTitle);
        available[type] = el("small", undefined, "qb-capacity-badge");
        available[type].id = `qb-capacity-${type}`;
        counts[type].setAttribute("aria-describedby", available[type].id);
        counts[type].parentElement.append(available[type]);
      }
      composition.append(plan);
      const details = el(
        "fieldset",
        undefined,
        "course-grid qb-exam-details qb-field-wide",
      );
      details.append(el("legend", "۳ · مشخصات آزمون"));
      f.append(details);
      update();
      const name = field(details, "عنوان آزمون");
      name.required = true;
      name.placeholder = "مثلاً آزمون فصل اول";
      name.parentElement.classList.add("qb-field-wide");
      const school = field(details, "نام مدرسه (اختیاری)"),
        teacher = field(details, "نام دبیر (اختیاری)");
      school.autocomplete = "organization";
      teacher.autocomplete = "name";
      const today = new Date();
      const localDate = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, "0"),
        String(today.getDate()).padStart(2, "0"),
      ].join("-");
      const date = field(details, "تاریخ آزمون", localDate);
      date.type = "date";
      date.required = true;
      date.id = "qb-exam-date";
      date.setAttribute("aria-label", "تاریخ آزمون");
      root.initShamsiPickers();
      const duration = field(details, "مدت آزمون (دقیقه)", "60");
      duration.inputMode = "numeric";
      duration.required = true;
      duration.oninput = () => {
        const minutes = Number(D.digits(duration.value));
        duration.setCustomValidity(
          /^\d+$/.test(D.digits(duration.value)) &&
            Number.isInteger(minutes) &&
            minutes >= 1 &&
            minutes <= 600
            ? ""
            : "مدت آزمون را از ۱ تا ۶۰۰ دقیقه وارد کنید.",
        );
      };
      saveButton(f, "ساخت آزمون");
      requestAnimationFrame(() => {
        if (!f.isConnected) return;
        const fields = f.querySelector(".qb-form-fields");
        content.style.setProperty(
          "--qb-builder-scrollbar",
          `${fields.offsetWidth - fields.clientWidth}px`,
        );
      });
    }
    return { builder };
  }
  root.EduQuestionBankBuilderUI = { create };
})(globalThis);
