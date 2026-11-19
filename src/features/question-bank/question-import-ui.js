(function (root) {
  "use strict";
  const I = root.EduQuestionBankImport;
  function mount({
    parent,
    bank,
    unitId,
    courseTitle,
    unitTitle,
    el,
    button,
    isCurrent,
    onPending,
    onSave,
    onClose,
  }) {
    const panel = el("section", undefined, "qb-import");
    panel.setAttribute("aria-label", "ورود گروهی سؤال‌ها");
    parent.append(panel);
    const current = () => panel.isConnected && isCurrent();
    const heading = el("header", undefined, "qb-import-heading");
    heading.append(
      el("h3", "ورود گروهی سؤال‌ها"),
      el("p", `${courseTitle} · ${unitTitle}`, "qb-import-destination"),
    );
    panel.append(heading);
    const actions = el("div", undefined, "qb-import-steps");
    panel.append(actions);
    const templateStep = el("div", undefined, "qb-import-step");
    const uploadStep = el("div", undefined, "qb-import-step");
    for (const [container, number, title, detail] of [
      [
        templateStep,
        "۱",
        "آماده‌سازی سؤال‌ها",
        "الگوی اکسل را دریافت و تکمیل کنید؛ نمونه و راهنما داخل فایل است.",
      ],
      [
        uploadStep,
        "۲",
        "بررسی و پیش‌نمایش",
        "فایل تکمیل‌شده را انتخاب کنید؛ قبل از ثبت، سؤال‌ها را می‌بینید.",
      ],
    ]) {
      container.append(
        el("span", number, "qb-import-step-number"),
        el("h4", title),
        el("p", detail),
      );
      actions.append(container);
    }
    const status = el(
      "p",
      "فقط XLSX؛ حداکثر ۱۰۰۰ سؤال و ۵ مگابایت. نمونه‌ها و راهنما در برگه‌های جدا هستند.",
      "qb-import-status",
    );
    status.setAttribute("role", "status");
    const input = el("input");
    input.type = "file";
    input.accept =
      ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    input.hidden = true;
    const template = button(
      "دریافت الگو",
      () => {
        try {
          const blob = root.EduPeriodicReports.createWorkbook(
            I.templateSheets(),
          );
          const url = URL.createObjectURL(blob),
            link = el("a");
          link.href = url;
          link.download = "Classyar-Questions-Template-v1.xlsx";
          document.body.append(link);
          link.click();
          link.remove();
          root.setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (error) {
          showError(error);
        }
      },
      templateStep,
    );
    const choose = button(
      "انتخاب فایل",
      () => {
        input.value = "";
        input.click();
      },
      uploadStep,
    );
    template.classList.add("qb-import-template");
    choose.dataset.uiVariant = "solid";
    choose.insertAdjacentHTML("afterbegin", root.EduIcons.html("upload"));
    panel.append(input, status);
    const preview = el("div", undefined, "qb-import-preview");
    preview.hidden = true;
    panel.append(preview);
    const footer = el("div", undefined, "qb-actions qb-import-footer");
    panel.append(footer);
    footer.append(
      el(
        "small",
        "سؤال‌های قبلی حفظ می‌شوند؛ ثبت فقط پس از تأیید شما انجام می‌شود.",
        "qb-import-safety",
      ),
    );
    let report = null,
      sequence = 0,
      busy = false,
      page = 0;
    const save = button(
      "ثبت سؤال‌ها",
      async () => {
        if (!current() || busy || !report || report.errors || !report.ready)
          return;
        busy = true;
        lock(true);
        try {
          const next = I.prepare(report, bank);
          if (current()) await onSave(next, current);
        } catch (error) {
          showError(error);
        } finally {
          busy = false;
          if (current()) lock(false);
        }
      },
      footer,
    );
    save.dataset.uiVariant = "solid";
    save.disabled = true;
    const close = button(
      "بازگشت",
      () => {
        if (!busy) onClose();
      },
      footer,
    );
    function lock(value) {
      panel.setAttribute("aria-busy", String(value));
      choose.disabled = template.disabled = close.disabled = value;
      save.disabled = value || !report || report.errors > 0 || !report.ready;
    }
    function showError(error) {
      if (!current()) return;
      status.textContent = error.message || String(error);
      status.dataset.state = "error";
      status.setAttribute("role", "alert");
    }
    function draw() {
      preview.hidden = false;
      preview.replaceChildren();
      const counts = el("div", undefined, "qb-import-counts");
      for (const [kind, label, count] of [
        ["ready", "آماده", report.ready],
        ["duplicate", "تکراری؛ ثبت نمی‌شود", report.duplicates],
        ["error", "خطا", report.errors],
      ]) {
        const badge = el("span", `${label}: ${count.toLocaleString("fa-IR")}`);
        badge.dataset.state = kind;
        counts.append(badge);
      }
      preview.append(counts);
      const list = el("ol", undefined, "qb-import-rows");
      list.setAttribute("aria-label", "پیش‌نمایش ردیف‌های فایل");
      for (const row of report.results.slice(page * 25, (page + 1) * 25)) {
        const item = el("li");
        item.dataset.state = row.status;
        item.append(
          el(
            "strong",
            `ردیف ${row.number.toLocaleString("fa-IR")} · ${row.status === "ready" ? "آمادهٔ ثبت" : row.status === "error" ? "خطا" : "تکراری"}`,
          ),
          el("p", row.text || "متن سؤال خالی است."),
        );
        if (row.question) {
          const q = row.question;
          if (q.options)
            item.append(
              el(
                "p",
                q.options
                  .map((option, index) => `${index + 1}) ${option}`)
                  .join(" · "),
              ),
            );
          const answer =
            q.type === "mcq"
              ? `گزینهٔ ${q.answer + 1}`
              : q.type === "boolean"
                ? q.answer
                  ? "صحیح"
                  : "غلط"
                : q.answer;
          item.append(
            el(
              "small",
              `${root.EduQuestionBank.types[q.type]} · بارم: ${(q.score / 100).toLocaleString("fa-IR")} · پاسخ: ${answer}`,
            ),
          );
          if (q.explanation) item.append(el("small", q.explanation));
        }
        if (row.message) item.append(el("small", row.message));
        list.append(item);
      }
      preview.append(list);
      if (report.results.length > 25) {
        const pager = el("nav", undefined, "qb-actions qb-pager");
        pager.setAttribute("aria-label", "صفحه‌بندی پیش‌نمایش ورود سؤال");
        const previous = button(
          "قبلی",
          () => {
            page--;
            draw();
          },
          pager,
        );
        previous.disabled = page === 0;
        pager.append(
          el(
            "span",
            `${(page + 1).toLocaleString("fa-IR")} / ${Math.ceil(report.results.length / 25).toLocaleString("fa-IR")}`,
          ),
        );
        const next = button(
          "بعدی",
          () => {
            page++;
            draw();
          },
          pager,
        );
        next.disabled = (page + 1) * 25 >= report.results.length;
        preview.append(pager);
      }
    }
    input.addEventListener("change", async () => {
      const file = input.files[0];
      if (!file || busy || !current()) return;
      const request = ++sequence;
      report = null;
      preview.replaceChildren();
      busy = true;
      preview.hidden = true;
      lock(true);
      onPending(false);
      status.removeAttribute("data-state");
      status.setAttribute("role", "status");
      status.textContent = "در حال بررسی فایل…";
      try {
        const rows = await I.readXlsx(file);
        if (!current() || request !== sequence) return;
        report = I.preview(rows, bank, unitId);
        page = 0;
        onPending(report.ready > 0);
        status.textContent = report.errors
          ? "فایل دارای خطاست. ردیف‌های مشخص‌شده را در اکسل اصلاح و فایل را دوباره انتخاب کنید؛ هنوز هیچ سؤالی ثبت نشده است."
          : `فایل «${file.name}» بررسی شد. مقصد را بررسی کنید و برای افزودن سؤال‌های آماده، «ثبت سؤال‌ها» را بزنید.`;
        if (report.errors) {
          status.dataset.state = "error";
          status.setAttribute("role", "alert");
        }
        save.querySelector(".ui-button-label").textContent =
          `ثبت ${report.ready.toLocaleString("fa-IR")} سؤال`;
        draw();
      } catch (error) {
        showError(error);
      } finally {
        busy = false;
        if (current()) lock(false);
      }
    });
  }
  root.EduQuestionBankImportUI = { mount };
})(globalThis);
