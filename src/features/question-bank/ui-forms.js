(function (root) {
  "use strict";
  // A mount owns state; accessors keep deferred form callbacks on that live state.
  function create({
    state,
    D,
    el,
    button,
    field,
    select,
    contextAction,
    number,
    discard,
    render,
    clearTransientMessage,
    closeOwnedCalendar,
    commit,
    mutate,
    unitLabel,
    error,
    content,
    tabScopes,
    confirmAction,
  }) {
    function form(parent, submit, { title, subtitle, kind }) {
      const panel = el(
        "details",
        undefined,
        "card quick-create entity-quick-create create-panel qb-editor-panel",
      );
      panel.open = true;
      const heading = el("summary");
      const symbol = el("span", undefined, "create-panel-symbol");
      symbol.setAttribute("aria-hidden", "true");
      symbol.insertAdjacentHTML("afterbegin", root.EduIcons.html("book"));
      const copy = el("span", undefined, "create-panel-title");
      const name = el("strong", title);
      name.id = `qb-editor-${crypto.randomUUID()}`;
      copy.append(name, el("small", subtitle));
      const toggle = el("span", undefined, "create-panel-toggle");
      toggle.setAttribute("aria-hidden", "true");
      heading.append(symbol, copy, toggle);
      const f = el("form", undefined, "qb-form record-editor course-grid");
      f.dataset.qbEditor = kind;
      f.setAttribute("aria-labelledby", name.id);
      f.noValidate = true;
      f.onsubmit = async (e) => {
        e.preventDefault();
        if (!state.alive || state.busy || state.confirmation) return;
        try {
          await submit(f);
        } catch (e) {
          error(e);
        }
      };
      panel.append(heading, f);
      parent.append(panel);
      return f;
    }
    function saveButton(f, label = "ذخیره") {
      const b = el("button", label);
      b.type = "submit";
      b.className = "ui-button ui-button-flat";
      b.dataset.uiTone = "save";
      b.dataset.uiVariant = "solid";
      b.insertAdjacentHTML("afterbegin", root.EduIcons.html("save"));
      const actions = el(
        "div",
        undefined,
        "record-editor-actions qb-field-wide",
      );
      actions.append(b);
      button("بازگشت", () => discard(render), actions);
      const fields = el(
        "div",
        undefined,
        "course-grid qb-form-fields qb-field-wide",
      );
      fields.append(...f.childNodes);
      f.append(fields, actions);
    }
    function entityMenu(
      parent,
      label,
      selected,
      add,
      edit,
      remove,
      extra = [],
    ) {
      const trigger = contextAction(`بیشتر ${label}`, () => {}, parent);
      trigger.querySelector("svg")?.remove();
      trigger.insertAdjacentHTML("afterbegin", root.EduIcons.html("more"));
      const menu = el("div", undefined, "qb-entity-menu");
      menu.id = `qb-menu-${crypto.randomUUID()}`;
      menu.setAttribute("popover", "auto");
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-label", `مدیریت ${label}`);
      parent.append(menu);
      trigger.setAttribute("aria-haspopup", "menu");
      trigger.setAttribute("aria-controls", menu.id);
      trigger.setAttribute("aria-expanded", "false");
      const actions = [
        [`${label} جدید`, add, false],
        [`ویرایش ${label}`, edit, !selected],
        [`حذف ${label}`, remove, !selected],
        ...extra,
      ].map(([title, action, disabled]) => {
        const item = button(
          title,
          () => {
            menu.hidePopover();
            trigger.focus();
            action();
          },
          menu,
        );
        item.setAttribute("role", "menuitem");
        item.disabled = disabled;
        return item;
      });
      trigger.onclick = () => {
        if (menu.matches(":popover-open")) return menu.hidePopover();
        menu.showPopover();
        const rect = trigger.getBoundingClientRect();
        menu.style.left = `${Math.max(8, Math.min(rect.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 8))}px`;
        menu.style.top = `${Math.max(8, Math.min(rect.bottom + 6, innerHeight - menu.offsetHeight - 8))}px`;
        actions.find((item) => !item.disabled)?.focus();
      };
      menu.addEventListener("toggle", () => {
        trigger.setAttribute(
          "aria-expanded",
          String(menu.matches(":popover-open")),
        );
      });
      menu.onkeydown = (event) => {
        const enabled = actions.filter((item) => !item.disabled);
        const index = enabled.indexOf(document.activeElement);
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? enabled.length - 1
                : (index +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    enabled.length) %
                  enabled.length;
          enabled[next].focus();
        } else if (event.key === "Escape") {
          event.preventDefault();
          menu.hidePopover();
          trigger.focus();
        }
      };
    }
    function removeCourse(current) {
      const units = state.bank.units.filter(
        (u) => u.courseId === state.courseId,
      );
      const unitIds = new Set(units.map((u) => u.id));
      const questions = state.bank.questions.filter((q) =>
        unitIds.has(q.unitId),
      ).length;
      confirmAction(
        `درس «${current.title}» با ${number(units.length)} بخش و ${number(questions)} سؤال حذف شود؟ این حذف از بانک قابل برگشت نیست؛ آزمون‌های ذخیره‌شده حفظ می‌شوند.`,
        () =>
          mutate((next) => {
            next.courses = next.courses.filter((c) => c.id !== current.id);
            next.units = next.units.filter((u) => !unitIds.has(u.id));
            next.questions = next.questions.filter(
              (q) => !unitIds.has(q.unitId),
            );
          }),
      );
    }
    function removeUnit(existing) {
      const count = state.bank.questions.filter(
        (q) => q.unitId === existing.id,
      ).length;
      confirmAction(
        `بخش «${existing.title}» و ${number(count)} سؤال آن حذف شوند؟ این حذف از بانک قابل برگشت نیست؛ آزمون‌های ذخیره‌شده حفظ می‌شوند.`,
        () =>
          mutate((next) => {
            next.units = next.units.filter((u) => u.id !== existing.id);
            next.questions = next.questions.filter(
              (q) => q.unitId !== existing.id,
            );
          }),
      );
    }
    function manageCourse(edit = false) {
      discard(() => {
        clearTransientMessage();
        closeOwnedCalendar();
        content.replaceChildren();
        const current = state.bank.courses.find((c) => c.id === state.courseId);
        const f = form(
          content,
          async () => {
            const next = structuredClone(state.bank);
            if (edit) {
              const course = next.courses.find((c) => c.id === state.courseId);
              course.title = name.value.trim();
              if (!state.bank.units.some((u) => u.courseId === state.courseId))
                course.structure = structure.value;
            } else {
              const c = {
                id: crypto.randomUUID(),
                title: name.value.trim(),
                structure: structure.value,
              };
              next.courses.push(c);
              if (await commit(next)) {
                state.courseId = c.id;
                state.unitId = "";
                if (state.tab === "builder") tabScopes.builder.unitIds = [];
                state.search = "";
                state.questionType = "";
                state.page = 0;
                render();
              }
              return;
            }
            if (await commit(next)) render();
          },
          {
            title: edit ? "ویرایش درس" : "درس جدید",
            subtitle: "نام درس و ساختار فصل‌ها یا پودمان‌ها",
            kind: "course",
          },
        );
        const name = field(f, "عنوان درس", edit ? current.title : "");
        const structure = select(
          f,
          "نوع درس",
          [
            ["chapter", "عمومی (فصلی)"],
            ["module", "پودمانی"],
          ],
          edit ? current.structure : "chapter",
        );
        structure.disabled =
          edit && state.bank.units.some((u) => u.courseId === state.courseId);
        if (edit) {
          const remove = button("حذف درس", () => removeCourse(current), f);
          remove.classList.add("qb-field-wide", "qb-delete-entity");
        }
        saveButton(f);
        name.focus();
      });
    }
    function manageUnit(existing) {
      discard(() => {
        clearTransientMessage();
        closeOwnedCalendar();
        content.replaceChildren();
        const f = form(
          content,
          async () => {
            const next = structuredClone(state.bank);
            const id = existing?.id || crypto.randomUUID();
            if (existing)
              next.units.find((u) => u.id === id).title = name.value.trim();
            else
              next.units.push({
                id,
                courseId: state.courseId,
                title: name.value.trim(),
              });
            if (await commit(next)) {
              state.unitId = id;
              state.search = "";
              state.questionType = "";
              state.page = 0;
              render();
            }
          },
          {
            title: existing ? `ویرایش ${unitLabel()}` : `${unitLabel()} جدید`,
            subtitle:
              state.bank.courses.find((course) => course.id === state.courseId)
                ?.title || "",
            kind: "unit",
          },
        );
        const name = field(f, `عنوان ${unitLabel()}`, existing?.title || "");
        name.placeholder = `${unitLabel()} اول`;
        if (existing) {
          const remove = button(
            `حذف ${unitLabel()}`,
            () => removeUnit(existing),
            f,
          );
          remove.classList.add("qb-field-wide", "qb-delete-entity");
        }
        saveButton(f);
        name.focus();
      });
    }
    function editQuestion(existing) {
      discard(() => {
        clearTransientMessage();
        closeOwnedCalendar();
        content.replaceChildren();
        const f = form(
          content,
          async () => {
            const q = {
              id: existing?.id || crypto.randomUUID(),
              unitId: unit.value,
              type: type.value,
              text: body.value,
              answer:
                type.value === "mcq"
                  ? answer.value === ""
                    ? null
                    : Number(answer.value)
                  : type.value === "boolean"
                    ? answer.value === "true"
                      ? true
                      : answer.value === "false"
                        ? false
                        : null
                    : answer.value,
              explanation: explanation.value,
              score: D.score(mark.value),
            };
            if (q.type === "mcq") q.options = options.map((n) => n.value);
            D.question(q);
            if (
              q.type === "mcq" &&
              (existing?.type !== "mcq" ||
                q.options.some(
                  (value, index) => value !== existing.options[index],
                )) &&
              new Set(q.options.map(D.optionKey)).size !== 4
            )
              throw Error(
                "گزینه‌ها نباید فقط در شکل نوشتن ی، ک یا فاصله تفاوت داشته باشند؛ چهار پاسخ متمایز بنویسید.",
              );
            await mutate((next) => {
              const index = next.questions.findIndex((x) => x.id === q.id);
              if (index < 0) next.questions.push(q);
              else next.questions[index] = q;
            });
          },
          {
            title: existing ? "ویرایش سؤال" : "افزودن سؤال",
            subtitle: "صورت سؤال، پاسخ صحیح و بارم",
            kind: "question",
          },
        );
        const context = el(
          "div",
          undefined,
          "course-grid qb-field-wide qb-question-context",
        );
        f.classList.add("qb-question-form");
        f.append(context);
        const unit = select(
          context,
          unitLabel(),
          [
            ["", "انتخاب بخش"],
            ...state.bank.units
              .filter((u) => u.courseId === state.courseId)
              .map((u) => [u.id, u.title]),
          ],
          existing?.unitId || state.unitId,
        );
        const type = select(
          context,
          "نوع سؤال",
          Object.entries(D.types),
          existing?.type || "mcq",
        );
        const body = field(f, "متن سؤال", existing?.text || "", "textarea"),
          area = el(
            "fieldset",
            undefined,
            "course-grid qb-field-wide qb-answer-editor",
          );
        f.append(area);
        let answer,
          options = [],
          activeType;
        const drafts = new Map();
        if (existing)
          drafts.set(existing.type, {
            answer: String(existing.answer),
            options: existing.options || [],
          });
        function answers() {
          if (activeType)
            drafts.set(activeType, {
              answer: answer.value,
              options: options.map((n) => n.value),
            });
          activeType = type.value;
          const draft = drafts.get(activeType);
          area.replaceChildren();
          area.append(
            el(
              "legend",
              type.value === "mcq" ? "گزینه‌ها و پاسخ" : "پاسخ سؤال",
            ),
          );
          options = [];
          if (type.value === "mcq") {
            for (let i = 0; i < 4; i++)
              options.push(
                field(
                  area,
                  `گزینه ${i + 1}`,
                  draft?.options[i] || "",
                  /[\r\n]/.test(draft?.options[i] || "") ? "textarea" : "input",
                ),
              );
            answer = select(
              area,
              "پاسخ صحیح",
              [
                ["", "انتخاب پاسخ"],
                ...[0, 1, 2, 3].map((i) => [String(i), `گزینه ${i + 1}`]),
              ],
              draft?.answer ?? "",
            );
          } else if (type.value === "boolean")
            answer = select(
              area,
              "پاسخ صحیح",
              [
                ["", "انتخاب پاسخ"],
                ["true", "صحیح"],
                ["false", "غلط"],
              ],
              draft?.answer ?? "",
            );
          else
            answer = field(area, "پاسخ صحیح", draft?.answer ?? "", "textarea");
          answer.parentElement.classList.add("qb-field-wide");
        }
        type.onchange = answers;
        answers();
        const mark = field(
          f,
          "بارم",
          existing ? String(existing.score / 100) : "1",
        );
        mark.parentElement.classList.add("qb-field-wide");
        mark.inputMode = "decimal";
        const optional = el("details", undefined, "qb-optional qb-field-wide");
        optional.append(el("summary", "توضیح پاسخ (اختیاری)"));
        optional.open = Boolean(existing?.explanation);
        f.append(optional);
        const explanation = field(
          optional,
          "توضیح پاسخ (اختیاری)",
          existing?.explanation || "",
          "textarea",
        );
        saveButton(f);
        body.focus();
      });
    }
    function importQuestions() {
      discard(() => {
        if (!state.unitId) return;
        clearTransientMessage();
        closeOwnedCalendar();
        content.replaceChildren();
        const destinationCourse = state.courseId,
          destinationUnit = state.unitId;
        root.EduQuestionBankImportUI.mount({
          parent: content,
          bank: state.bank,
          unitId: state.unitId,
          courseTitle: state.bank.courses.find((c) => c.id === state.courseId)
            .title,
          unitTitle: state.bank.units.find((u) => u.id === state.unitId).title,
          el,
          button,
          isCurrent: () =>
            state.alive &&
            state.courseId === destinationCourse &&
            state.unitId === destinationUnit,
          onPending: (value) => {
            state.dirty = value;
          },
          onSave: async (next, isCurrent) => {
            if (await commit(next, { isCurrent })) {
              render();
              const note = el(
                "p",
                "سؤال‌ها با موفقیت به بخش انتخاب‌شده افزوده شدند.",
                "qb-import-success",
              );
              note.setAttribute("role", "status");
              content.prepend(note);
            }
          },
          onClose: () =>
            discard(() => {
              state.dirty = false;
              render();
            }),
        });
      });
    }
    return {
      form,
      saveButton,
      entityMenu,
      removeCourse,
      removeUnit,
      manageCourse,
      manageUnit,
      editQuestion,
      importQuestions,
    };
  }
  root.EduQuestionBankFormsUI = { create };
})(globalThis);
