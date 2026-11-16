(function (root) {
  "use strict";
  const D = root.EduQuestionBank,
    R = root.EduQuestionBankRepository;
  const el = (tag, value, className) => {
    const n = document.createElement(tag);
    if (value !== undefined) n.textContent = value;
    if (className) n.className = className;
    return n;
  };
  const button = (label, action, parent) => {
    const b = el("button");
    b.append(el("span", label, "ui-button-label"));
    b.className = "ghost ui-button ui-button-flat";
    const [tone, icon] = label.startsWith("حذف")
      ? ["danger", "trash"]
      : /افزودن|جدید/.test(label)
        ? ["create", "add"]
        : /ویرایش/.test(label)
          ? ["edit", "edit"]
          : /چاپ/.test(label)
            ? ["print", "print"]
            : /دریافت/.test(label)
              ? ["download", "download"]
              : /بستن/.test(label)
                ? ["neutral", "close"]
                : /بازگشت|قبلی/.test(label)
                  ? ["navigate", "chevron-right"]
                  : /بعدی/.test(label)
                    ? ["navigate", "chevron-left"]
                    : ["neutral", ""];
    b.dataset.uiTone = tone;
    if (icon) b.insertAdjacentHTML("afterbegin", root.EduIcons.html(icon));
    b.type = "button";
    b.onclick = action;
    parent.append(b);
    return b;
  };
  const field = (parent, label, value = "", tag = "input") => {
    const l = el("label", label, "course-field"),
      n = el(tag);
    if (tag === "textarea") l.classList.add("qb-field-wide");
    n.value = value;
    l.append(n);
    parent.append(l);
    return n;
  };
  function select(parent, label, entries, value = "") {
    const n = field(parent, label, "", "select");
    for (const [id, title] of entries) {
      const o = el("option", title);
      o.value = id;
      n.append(o);
    }
    n.value = value;
    return n;
  }
  const number = (value) =>
    new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(value);
  const letters = ["الف", "ب", "ج", "د"];
  const dateLabel = (date) =>
    new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "long",
      timeZone: "UTC",
    }).format(new Date(date));
  function sheet(exam) {
    const s = el("article", undefined, "qb-sheet");
    s.dir = "rtl";
    const header = el("header", undefined, "qb-sheet-header");
    header.append(el("h1", exam.title));
    const meta = el("div", undefined, "qb-sheet-meta");
    for (const [label, value] of [
      ["درس", exam.courseTitle],
      ["مدرسه", exam.school],
      ["دبیر", exam.teacher],
      ["تاریخ", dateLabel(exam.date)],
      ["مدت", `${number(exam.duration)} دقیقه`],
      [
        "بارم کل",
        number(exam.questions.reduce((sum, q) => sum + q.score, 0) / 100),
      ],
    ]) {
      if (!value) continue;
      const item = el("p");
      item.append(el("span", `${label}: `), el("strong", value));
      meta.append(item);
    }
    const identity = el("div", undefined, "qb-student-fields");
    identity.append(
      el("p", "نام و نام خانوادگی هنرجو: …………………………"),
      el("p", "کلاس: ……………"),
    );
    header.append(meta, identity);
    s.append(header);
    exam.questions.forEach((q, i) => {
      const row = el("section", undefined, "qb-sheet-question");
      const body = el("div", undefined, "qb-sheet-prompt");
      body.append(
        el("span", `${number(i + 1)}.`, "qb-sheet-number"),
        el("p", q.text),
        el("span", `${number(q.score / 100)} نمره`, "qb-sheet-score"),
      );
      row.append(body);
      if (q.type === "mcq") {
        const options = el("ol", undefined, "qb-sheet-options");
        q.options.forEach((option, j) => {
          const item = el("li");
          item.append(el("span", `${letters[j]})`), el("span", option));
          options.append(item);
        });
        row.append(options);
      }
      if (q.type === "boolean")
        row.append(el("p", "□ صحیح     □ غلط", "qb-sheet-boolean"));
      if (q.type === "essay") row.append(el("div", "", "qb-answer-space"));
      s.append(row);
    });
    s.append(
      el(
        "p",
        `تعداد کل سؤال‌ها: ${number(exam.questions.length)}`,
        "qb-sheet-total",
      ),
    );
    return s;
  }
  async function print(exam) {
    const frame = el("iframe");
    frame.className = "qb-print-frame";
    frame.title = "چاپ آزمون";
    document.body.append(frame);
    const doc = frame.contentDocument;
    try {
      doc.documentElement.lang = "fa";
      doc.documentElement.dir = "rtl";
      // Reuse the actual application styles, including its embedded offline font.
      const loads = [
        ...document.querySelectorAll('link[rel="stylesheet"]'),
      ].map(
        (source) =>
          new Promise((resolve, reject) => {
            const copy = source.cloneNode();
            copy.onload = resolve;
            copy.onerror = () => reject(Error("فونت و سبک چاپ بارگیری نشد."));
            doc.head.append(copy);
          }),
      );
      await Promise.all(loads);
      const style = doc.createElement("style");
      style.textContent =
        "@page{size:A4 portrait;margin:15mm}body{font-family:IRANSans,sans-serif;background:white;color:black}body>.qb-sheet{display:block!important}.qb-sheet-question{break-inside:avoid;overflow-wrap:anywhere}.qb-answer-space{height:30mm;border-bottom:1px dotted #888}h1{font-size:20px}";
      doc.head.append(style);
      doc.body.append(doc.importNode(sheet(exam), true));
      await doc.fonts.load("16px IRANSans");
      await doc.fonts.ready;
      await new Promise((resolve) =>
        frame.contentWindow.requestAnimationFrame(resolve),
      );
      frame.contentWindow.addEventListener("afterprint", () => frame.remove(), {
        once: true,
      });
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch (error) {
      frame.remove();
      throw error;
    } finally {
      if (frame.isConnected) setTimeout(() => frame.remove(), 60000);
    }
  }
  async function openBank() {
    if (document.querySelector(".qb-dialog")) return;
    const opener = document.activeElement,
      dialog = el("dialog", undefined, "qb-dialog modal-dialog");
    const header = el("header", undefined, "modal-header"),
      title = el("h3", "بانک سؤال"),
      message = el("p", "در حال خواندن…", "qb-message"),
      content = el("div", undefined, "modal-body qb-body");
    title.id = "qb-title";
    dialog.setAttribute("aria-labelledby", title.id);
    message.setAttribute("role", "status");
    let bank,
      courseId = "",
      unitId = "",
      tab = "questions",
      page = 0,
      search = "",
      questionType = "",
      dirty = false,
      busy = false,
      confirmation = null;
    const error = (e) => {
      message.textContent = e.message || String(e);
      message.dataset.state = "error";
    };
    function confirmAction(label, action) {
      if (confirmation || busy) return;
      const box = el("dialog", undefined, "qb-confirm modal-dialog qb-body");
      box.setAttribute("aria-label", label);
      box.append(el("p", label));
      const previous = document.activeElement;
      const cancel = () => {
        box.close();
        box.remove();
        confirmation = null;
        previous?.focus();
      };
      button("انصراف", cancel, box);
      button(
        "تأیید",
        async () => {
          cancel();
          try {
            await action();
          } catch (e) {
            error(e);
          }
        },
        box,
      );
      box.addEventListener("cancel", (e) => {
        e.preventDefault();
        cancel();
      });
      dialog.append(box);
      confirmation = box;
      box.showModal();
    }
    function discard(action) {
      if (busy) return;
      if (dirty)
        confirmAction("تغییرات فرم ذخیره نشده‌اند؛ کنار گذاشته شوند؟", () => {
          dirty = false;
          action();
        });
      else action();
    }
    function close() {
      discard(() => {
        dialog.close();
        dialog.remove();
        let target = opener?.isConnected
          ? opener
          : document.querySelector(".question-bank-entry") ||
            document.getElementById("workspaceToolsToggle") ||
            document.getElementById("headerNavigationToggle");
        for (
          let parent = target?.parentElement;
          parent;
          parent = parent.parentElement
        )
          if (parent.tagName === "DETAILS" && !parent.open)
            target = parent.querySelector(":scope > summary");
        target?.focus({ preventScroll: true });
      });
    }
    const closeButton = button("بستن", close, header);
    closeButton.classList.add("ui-button-icon-only", "qb-close");
    closeButton.setAttribute("aria-label", "بستن");
    closeButton.title = "بستن";
    closeButton.querySelector(".ui-button-label").hidden = true;
    header.prepend(title);
    dialog.append(header, message, content);
    document.body.append(dialog);
    dialog.showModal();
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      if (!confirmation) close();
    });
    dialog.addEventListener("input", (e) => {
      if (e.target.closest("form")) dirty = true;
    });
    async function commit(next) {
      if (busy) return false;
      busy = true;
      dialog.setAttribute("aria-busy", "true");
      content.inert = true;
      try {
        bank = await R.save(next, bank.revision);
        dirty = false;
        message.textContent = "در مرورگر ذخیره شد.";
        delete message.dataset.state;
        return true;
      } catch (e) {
        error(e);
        return false;
      } finally {
        busy = false;
        content.inert = false;
        dialog.removeAttribute("aria-busy");
      }
    }
    const mutate = async (action) => {
      const next = structuredClone(bank);
      action(next);
      if (await commit(next)) render();
    };
    function form(parent, submit) {
      const f = el("form", undefined, "qb-form course-grid");
      f.noValidate = true;
      f.onsubmit = async (e) => {
        e.preventDefault();
        if (busy) return;
        try {
          await submit(f);
        } catch (e) {
          error(e);
        }
      };
      parent.append(f);
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
      f.append(actions);
    }
    function manageCourse(edit = false) {
      discard(() => {
        content.replaceChildren();
        content.append(
          el("h4", edit ? "ویرایش درس" : "درس جدید", "qb-editor-title"),
        );
        const current = bank.courses.find((c) => c.id === courseId);
        const f = form(content, async () => {
          const next = structuredClone(bank);
          if (edit)
            next.courses.find((c) => c.id === courseId).title =
              name.value.trim();
          else {
            const c = {
              id: crypto.randomUUID(),
              title: name.value.trim(),
              structure: structure.value,
            };
            next.courses.push(c);
            if (await commit(next)) {
              courseId = c.id;
              unitId = "";
              render();
            }
            return;
          }
          if (await commit(next)) render();
        });
        const name = field(f, "عنوان درس", edit ? current.title : "");
        const structure = select(
          f,
          "ساختار",
          [
            ["chapter", "فصل‌بندی"],
            ["module", "پودمانی"],
          ],
          current?.structure || "chapter",
        );
        structure.disabled = edit;
        saveButton(f);
        name.focus();
      });
    }
    function manageUnit(existing) {
      discard(() => {
        content.replaceChildren();
        content.append(
          el(
            "h4",
            existing ? "ویرایش فصل / پودمان" : "افزودن فصل / پودمان",
            "qb-editor-title",
          ),
        );
        const f = form(content, async () => {
          await mutate((next) => {
            if (existing)
              next.units.find((u) => u.id === existing.id).title =
                name.value.trim();
            else
              next.units.push({
                id: crypto.randomUUID(),
                courseId,
                title: name.value.trim(),
              });
          });
        });
        const name = field(f, "عنوان فصل / پودمان", existing?.title || "");
        saveButton(f);
        name.focus();
      });
    }
    function editQuestion(existing) {
      discard(() => {
        content.replaceChildren();
        content.append(
          el("h4", existing ? "ویرایش سؤال" : "افزودن سؤال", "qb-editor-title"),
        );
        const f = form(content, async () => {
          const q = {
            id: existing?.id || crypto.randomUUID(),
            unitId: unit.value,
            type: type.value,
            text: body.value.trim(),
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
                  : answer.value.trim(),
            explanation: explanation.value.trim(),
            score: D.score(mark.value),
          };
          if (q.type === "mcq") q.options = options.map((n) => n.value.trim());
          D.question(q);
          await mutate((next) => {
            const index = next.questions.findIndex((x) => x.id === q.id);
            if (index < 0) next.questions.push(q);
            else next.questions[index] = q;
          });
        });
        const unit = select(
          f,
          "فصل / پودمان",
          [
            ["", "انتخاب بخش"],
            ...bank.units
              .filter((u) => u.courseId === courseId)
              .map((u) => [u.id, u.title]),
          ],
          existing?.unitId || unitId,
        );
        const type = select(
          f,
          "نوع سؤال",
          Object.entries(D.types),
          existing?.type || "mcq",
        );
        const body = field(f, "متن سؤال", existing?.text || "", "textarea"),
          area = el("div", undefined, "course-grid qb-field-wide");
        f.append(area);
        let answer,
          options = [];
        function answers() {
          area.replaceChildren();
          options = [];
          if (type.value === "mcq") {
            for (let i = 0; i < 4; i++)
              options.push(
                field(
                  area,
                  `گزینه ${i + 1}`,
                  existing?.type === "mcq" ? existing.options[i] : "",
                ),
              );
            answer = select(
              area,
              "پاسخ صحیح",
              [
                ["", "انتخاب پاسخ"],
                ...[0, 1, 2, 3].map((i) => [String(i), `گزینه ${i + 1}`]),
              ],
              existing?.type === "mcq" ? String(existing.answer) : "",
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
              existing?.type === "boolean" ? String(existing.answer) : "",
            );
          else
            answer = field(
              area,
              "پاسخ صحیح",
              existing && existing.type === type.value ? existing.answer : "",
              "textarea",
            );
        }
        type.onchange = answers;
        answers();
        const explanation = field(
            f,
            "توضیح پاسخ (اختیاری)",
            existing?.explanation || "",
            "textarea",
          ),
          mark = field(
            f,
            "بارم",
            existing ? String(existing.score / 100) : "1",
          );
        mark.inputMode = "decimal";
        saveButton(f);
        body.focus();
      });
    }
    function questions(parent) {
      const units = bank.units.filter((u) => u.courseId === courseId);
      const filters = el("div", undefined, "course-grid qb-filters");
      parent.append(filters);
      const filter = select(
        filters,
        "فصل / پودمان",
        [["", "همه"], ...units.map((u) => [u.id, u.title])],
        unitId,
      );
      const kind = select(
        filters,
        "نوع سؤال",
        [["", "همه"], ...Object.entries(D.types)],
        questionType,
      );
      const find = field(filters, "جست‌وجو در سؤال‌ها", search);
      find.type = "search";
      find.placeholder = "بخشی از متن سؤال را بنویسید…";
      const heading = el("div", undefined, "qb-list-heading");
      const headingCopy = el("div");
      const count = el("h4");
      const range = el("p");
      count.setAttribute("aria-live", "polite");
      headingCopy.append(count, range);
      heading.append(headingCopy);
      button("افزودن سؤال", () => editQuestion(), heading).disabled =
        !units.length;
      parent.append(heading);
      const results = el("div", undefined, "qb-results");
      const pager = el("nav", undefined, "qb-actions qb-pager");
      pager.setAttribute("aria-label", "صفحه‌بندی سؤال‌ها");
      parent.append(results, pager);
      function draw() {
        results.replaceChildren();
        pager.replaceChildren();
        const list = bank.questions.filter(
          (q) =>
            units.some((u) => u.id === q.unitId) &&
            (!unitId || q.unitId === unitId) &&
            (!questionType || q.type === questionType) &&
            q.text.includes(search),
        );
        page = Math.min(page, Math.max(0, Math.ceil(list.length / 15) - 1));
        count.textContent = `${number(list.length)} سؤال`;
        range.textContent = list.length
          ? `نمایش ${number(page * 15 + 1)} تا ${number(Math.min((page + 1) * 15, list.length))} از سؤال‌های این محدوده`
          : "سؤال‌های این درس را اینجا مدیریت کنید.";
        list.slice(page * 15, page * 15 + 15).forEach((q, index) => {
          const card = el("details", undefined, "qb-question qb-question-row");
          card.setAttribute("name", "qb-question-list");
          const toggle = el("summary", undefined, "qb-question-toggle");
          const copy = el("span", undefined, "qb-row-copy");
          copy.append(
            el("span", q.text, "qb-row-excerpt"),
            el(
              "span",
              `${D.types[q.type]} · ${units.find((u) => u.id === q.unitId).title}`,
              "qb-row-meta",
            ),
          );
          toggle.append(
            el("span", number(page * 15 + index + 1), "qb-question-number"),
            copy,
            el("span", `${number(q.score / 100)} نمره`, "qb-score"),
          );
          toggle.insertAdjacentHTML(
            "beforeend",
            root.EduIcons.html("chevron-left"),
          );
          const expanded = el("div", undefined, "qb-question-expanded");
          card.append(toggle, expanded);
          expanded.append(el("p", q.text, "qb-question-text"));

          if (q.options) {
            const options = el("ol", undefined, "qb-options");
            options.setAttribute("aria-label", "گزینه‌های سؤال");
            q.options.forEach((option, i) => {
              const row = el("li");
              row.append(
                el("span", letters[i], "qb-option-letter"),
                el("span", option, "qb-option-text"),
              );
              options.append(row);
            });
            expanded.append(options);
          }
          const footer = el("div", undefined, "qb-question-footer");
          const details = el("details", undefined, "qb-solution");
          const summary = el("summary", "پاسخ و توضیح");
          summary.insertAdjacentHTML(
            "afterbegin",
            root.EduIcons.html("chevron-left"),
          );
          const answer =
            q.type === "mcq"
              ? `${letters[q.answer]}) ${q.options[q.answer]}`
              : q.type === "boolean"
                ? q.answer
                  ? "صحیح"
                  : "غلط"
                : q.answer;
          const answerBody = el("div", undefined, "qb-answer-content");
          answerBody.append(el("small", "پاسخ صحیح"), el("p", answer));
          if (q.explanation)
            answerBody.append(
              el("small", "توضیح پاسخ"),
              el("p", q.explanation),
            );
          details.append(summary, answerBody);
          const actions = el("div", undefined, "qb-question-actions");
          button("ویرایش سؤال", () => editQuestion(q), actions);
          button(
            "حذف سؤال",
            () =>
              confirmAction(
                "این سؤال حذف شود؟ آزمون‌های قبلی حفظ می‌شوند.",
                () =>
                  mutate((next) => {
                    next.questions = next.questions.filter(
                      (x) => x.id !== q.id,
                    );
                  }),
              ),
            actions,
          );
          footer.append(details, actions);
          expanded.append(footer);
          results.append(card);
        });
        if (!list.length) {
          const empty = el("div", undefined, "qb-empty");
          empty.insertAdjacentHTML("afterbegin", root.EduIcons.html("book"));
          empty.append(
            el(
              "h4",
              search || questionType || unitId
                ? "سؤالی با این فیلترها پیدا نشد"
                : "اولین سؤال این درس را بسازید",
            ),
            el(
              "p",
              search || questionType || unitId
                ? "جست‌وجو یا فیلترها را تغییر دهید تا سؤال‌های بیشتری ببینید."
                : units.length
                  ? "سؤال‌ها را همراه پاسخ و بارم ثبت کنید تا برای آزمون‌های بعدی آماده باشند."
                  : "ابتدا یک فصل یا پودمان به درس اضافه کنید.",
            ),
          );
          if (search || questionType || unitId)
            button(
              "پاک‌کردن فیلترها",
              () => {
                search = "";
                questionType = "";
                unitId = "";
                page = 0;
                render();
              },
              empty,
            );
          else if (!units.length)
            button("افزودن بخش", () => manageUnit(), empty);
          results.append(empty);
        }
        button(
          "قبلی",
          () => {
            page--;
            draw();
            results.scrollIntoView({ block: "start" });
          },
          pager,
        ).disabled = page === 0;
        pager.append(
          el(
            "span",
            `صفحه ${number(page + 1)} از ${number(Math.max(1, Math.ceil(list.length / 15)))}`,
          ),
        );
        button(
          "بعدی",
          () => {
            page++;
            draw();
            results.scrollIntoView({ block: "start" });
          },
          pager,
        ).disabled = (page + 1) * 15 >= list.length;
        pager.hidden = list.length <= 15;
      }
      filter.onchange = () => {
        unitId = filter.value;
        page = 0;
        render();
      };
      kind.onchange = () => {
        questionType = kind.value;
        page = 0;
        draw();
      };
      find.oninput = find.onchange = () => {
        search = find.value;
        page = 0;
        draw();
      };
      draw();
    }
    function builder(parent) {
      const f = form(parent, async () => {
        const exam = D.generate(bank, {
          courseId,
          unitIds: checks.filter((c) => c.checked).map((c) => c.value),
          counts: Object.fromEntries(
            Object.entries(counts).map(([k, n]) => [k, n.value]),
          ),
          title: name.value,
          school: school.value,
          teacher: teacher.value,
          date: date.value,
          duration: duration.value,
        });
        const next = structuredClone(bank);
        next.exams.push(exam);
        if (await commit(next)) preview(exam);
      });
      const units = bank.units.filter((u) => u.courseId === courseId),
        scope = el("fieldset", undefined, "qb-unit-selection");
      scope.append(el("legend", "فصل‌ها / پودمان‌ها"));
      f.append(scope);
      const checks = units.map((u) => {
        const n = field(scope, u.title);
        n.type = "checkbox";
        n.value = u.id;
        n.parentElement.append(
          el(
            "small",
            `${number(bank.questions.filter((q) => q.unitId === u.id).length)} سؤال`,
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
        let total = 0;
        for (const type of Object.keys(D.types)) {
          const capacity = bank.questions.filter(
            (q) =>
              q.type === type &&
              checks.some((c) => c.checked && c.value === q.unitId),
          ).length;
          const requested = Number(D.digits(counts[type].value));
          if (Number.isInteger(requested) && requested > 0) total += requested;
          available[type].textContent =
            `${number(capacity)} سؤال موجود در بخش‌های انتخاب‌شده`;
          counts[type].parentElement.dataset.shortage = String(
            Number.isFinite(requested) && requested > capacity,
          );
        }
        plan.textContent = `${number(checks.filter((c) => c.checked).length)} بخش انتخاب‌شده · ${number(total)} سؤال در طرح آزمون`;
      };
      button(
        "انتخاب همه",
        () => {
          checks.forEach((c) => (c.checked = true));
          dirty = true;
          update();
        },
        scope,
      );
      button(
        "پاک‌کردن انتخاب‌ها",
        () => {
          checks.forEach((c) => (c.checked = false));
          dirty = true;
          update();
        },
        scope,
      );
      checks.forEach((c) => (c.onchange = update));
      f.append(el("h4", "ترکیب سؤال‌ها", "qb-form-heading qb-field-wide"));
      for (const [type, label] of Object.entries(D.types)) {
        counts[type] = field(f, `تعداد ${label}`, "0");
        counts[type].inputMode = "numeric";
        counts[type].oninput = update;
        counts[type].parentElement.classList.add("qb-count-field");
        available[type] = el("small");
        counts[type].parentElement.append(available[type]);
      }
      f.append(plan, el("h4", "مشخصات آزمون", "qb-form-heading qb-field-wide"));
      update();
      const name = field(f, "عنوان آزمون"),
        school = field(f, "نام مدرسه (اختیاری)"),
        teacher = field(f, "نام دبیر (اختیاری)"),
        date = field(f, "تاریخ آزمون", new Date().toISOString().slice(0, 10));
      date.type = "date";
      const shamsi = el("p");
      f.append(shamsi);
      const updateDate = () => {
        try {
          shamsi.textContent = dateLabel(date.value);
        } catch {
          shamsi.textContent = "تاریخ معتبر وارد کنید.";
        }
      };
      date.onchange = updateDate;
      updateDate();
      const duration = field(f, "مدت آزمون (دقیقه)", "60");
      duration.inputMode = "numeric";
      saveButton(f, "ساخت و ذخیره آزمون تصادفی");
    }
    function preview(exam) {
      content.replaceChildren();
      const actions = el("div", undefined, "qb-actions qb-preview-actions");
      content.append(actions);
      button(
        "بازگشت به آزمون‌های من",
        () => {
          tab = "exams";
          render();
        },
        actions,
      );
      button("چاپ / PDF آزمون", () => print(exam).catch(error), actions);
      content.append(sheet(exam));
    }
    function files(parent) {
      const details = el("details");
      details.append(
        el("summary", "فایل مستقل بانک سؤال"),
        el(
          "p",
          "تغییرات در مرورگر ذخیره می‌شوند. فایل JSON فقط هنگام دریافت ساخته می‌شود و خودکار به‌روز نمی‌شود. پاک‌کردن کل داده‌های سایت، بانک را نیز حذف می‌کند؛ فایل دانلودشده روی دستگاه باقی می‌ماند.",
        ),
      );
      parent.append(details);
      button(
        "دریافت فایل بانک",
        async () => {
          try {
            const current = await R.read();
            const json = D.size(D.validate(current));
            const url = URL.createObjectURL(
                new Blob([json], { type: "application/json" }),
              ),
              a = el("a");
            a.href = url;
            a.download = `Classyar-QuestionBank-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          } catch (e) {
            error(e);
          }
        },
        details,
      );
      const upload = field(details, "بازیابی بانک از JSON");
      upload.type = "file";
      upload.accept = ".json,application/json";
      upload.onchange = async () => {
        try {
          const file = upload.files[0];
          if (!file) return;
          if (file.size > D.LIMIT)
            throw Error("سقف فایل ورودی ۲۰ مگابایت است.");
          const incoming = D.parse(await file.text());
          discard(() =>
            confirmAction(
              `${incoming.courses.length} درس، ${incoming.questions.length} سؤال و ${incoming.exams.length} آزمون. تمام بانک سؤال فعلی جایگزین می‌شود؛ اطلاعات مدرسه تغییر نمی‌کند. ادامه؟`,
              async () => {
                if (await commit(incoming)) {
                  courseId = "";
                  unitId = "";
                  render();
                }
              },
            ),
          );
        } catch (e) {
          error(e);
        } finally {
          upload.value = "";
        }
      };
    }
    function render() {
      content.replaceChildren();
      dirty = false;
      const toolbar = el("div", undefined, "qb-actions qb-toolbar");
      content.append(toolbar);
      const course = select(
        toolbar,
        "درس",
        [["", "انتخاب درس"], ...bank.courses.map((c) => [c.id, c.title])],
        courseId,
      );
      course.onchange = () =>
        discard(() => {
          courseId = course.value;
          unitId = "";
          page = 0;
          render();
        });
      const management = el("details", undefined, "qb-course-tools");
      const managementToggle = el("summary");
      managementToggle.setAttribute("aria-label", "مدیریت درس و بخش‌ها");
      managementToggle.title = "مدیریت درس و بخش‌ها";
      managementToggle.insertAdjacentHTML(
        "afterbegin",
        root.EduIcons.html("more"),
      );
      managementToggle.append(el("span", "مدیریت درس"));
      const managementActions = el("div", undefined, "qb-course-tools-actions");
      management.append(managementToggle, managementActions);
      toolbar.append(management);
      button("درس جدید", () => manageCourse(), managementActions);
      if (courseId) {
        button("ویرایش عنوان درس", () => manageCourse(true), managementActions);
        button("افزودن بخش", () => manageUnit(), managementActions);
        if (unitId)
          button(
            "ویرایش عنوان بخش",
            () => manageUnit(bank.units.find((u) => u.id === unitId)),
            managementActions,
          );
      }
      const tabs = el("nav", undefined, "tabs qb-actions qb-tabs");
      tabs.setAttribute("aria-label", "بخش‌های بانک سؤال");
      content.append(tabs);
      for (const [id, label] of [
        ["questions", "سؤال‌ها"],
        ["builder", "طرح آزمون"],
        ["exams", "آزمون‌های من"],
      ]) {
        const b = button(
          label,
          () =>
            discard(() => {
              tab = id;
              render();
            }),
          tabs,
        );
        b.setAttribute("aria-pressed", String(tab === id));
      }
      const panel = el("section");
      content.append(panel);
      if (tab === "exams") {
        for (const exam of [...bank.exams].reverse()) {
          const row = el("section", undefined, "qb-question qb-exam-card");
          row.append(
            el("h3", exam.title),
            el("p", `${exam.courseTitle} — ${dateLabel(exam.date)}`),
          );
          const meta = el("div", undefined, "qb-exam-meta");
          meta.append(
            el("span", `${number(exam.questions.length)} سؤال`),
            el(
              "span",
              `${number(exam.questions.reduce((sum, q) => sum + q.score, 0) / 100)} نمره`,
            ),
            el("span", `${number(exam.duration)} دقیقه`),
          );
          const actions = el("div", undefined, "qb-actions qb-exam-actions");
          row.append(meta, actions);
          button("مشاهده آزمون", () => preview(exam), actions);
          button(
            "حذف آزمون",
            () =>
              confirmAction("آزمون حذف شود؟ سؤال‌های بانک حفظ می‌شوند.", () =>
                mutate((next) => {
                  next.exams = next.exams.filter((e) => e.id !== exam.id);
                }),
              ),
            actions,
          );
          panel.append(row);
        }
        if (!bank.exams.length)
          panel.append(el("p", "هنوز آزمونی ساخته نشده است."));
      } else if (!courseId) {
        const empty = el("div", undefined, "qb-empty");
        empty.insertAdjacentHTML("afterbegin", root.EduIcons.html("book"));
        empty.append(
          el("h4", "سؤال‌های هر درس، در یک جا"),
          el(
            "p",
            "یک درس انتخاب کنید یا درس تازه‌ای بسازید و سؤال‌های آن را به بانک اضافه کنید.",
          ),
        );
        button("درس جدید", () => manageCourse(), empty);
        panel.append(empty);
      } else if (tab === "builder") builder(panel);
      else questions(panel);
      files(content);
    }
    try {
      bank = D.validate(await R.read());
      message.textContent = "بانک مستقل از اطلاعات مدرسه است.";
      render();
    } catch (e) {
      error(e);
    }
  }
  root.EduQuestionBankUI = { open: openBank, sheet, print };
})(globalThis);
