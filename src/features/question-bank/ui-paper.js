(function (root) {
  "use strict";
  // Each application UI supplies its existing DOM and formatting helpers.
  function create({ el, number, dateLabel, letters, fitOptions }) {
    function sheetTextDirection(text, fallback = "rtl") {
      const line =
        sheetCleanText(text)
          .split(/\r\n|\r|\n/)
          .find((value) => value.trim()) || "";
      if (
        !/؟\s*$/.test(line) &&
        /^\s*(?:(?:const|let|var|function|return|throw|echo|def|class|import|from)\s|(?:if|for|while|switch|catch)\s*\(|[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*(?:\(|[+\-*/]?=(?!=))|<\/?[A-Za-z][\w:-]*(?:\s|\/?>)|\/\/|\/\*|\*\/|[{}][;,\s]*$)/.test(
          line,
        )
      )
        return "ltr";
      const chars = Array.from(line);
      if (
        chars.some(
          (char) =>
            /\p{Letter}/u.test(char) &&
            /[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(char),
        )
      )
        return "rtl";
      return chars.some((char) => /\p{Letter}/u.test(char)) ? "ltr" : fallback;
    }
    function sheetCleanText(text) {
      return String(text).replace(
        /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,
        "",
      );
    }
    function sheet(exam) {
      const s = el("article", undefined, "qb-sheet");
      s.dir = "rtl";
      const pageName = `qb-exam-${crypto.randomUUID()}`;
      s.style.page = pageName;
      const compact = (value, limit) => {
        const chars = Array.from(value.replace(/\s+/g, " ").trim());
        return chars.length > limit
          ? chars.slice(0, limit - 1).join("") + "…"
          : chars.join("");
      };
      const cssString = (value) =>
        '"' +
        Array.from(value, (char) => {
          const code = char.codePointAt(0);
          return code < 32 || code === 127 || char === '"' || char === "\\"
            ? "\\" + code.toString(16) + " "
            : char;
        }).join("") +
        '"';
      const runningTitle = cssString(
        `${compact(exam.courseTitle, 35)}  |  ${compact(exam.title, 50)}`,
      );
      const pages = el("style");
      pages.media = "print";
      pages.textContent = `@page ${pageName}{size:A4 portrait;margin:23mm 15mm 18mm;
      @top-center{content:${runningTitle};font-family:IRANSans,sans-serif;font-size:9pt;font-weight:500;color:#374151;direction:rtl;text-align:right;vertical-align:bottom;padding-bottom:3mm;margin-bottom:4mm;border-bottom:0.3mm solid #aab4c0;width:180mm}
      @bottom-center{content:"صفحهٔ " counter(page) " از " counter(pages);font-family:IRANSans,sans-serif;font-size:9pt;color:#4b5563;direction:rtl}}
      @page ${pageName}:first{margin-top:15mm;@top-center{content:none;border:0}}`;
      s.append(pages);
      const header = el("header", undefined, "qb-sheet-header");
      header.append(el("p", "به نام خدا", "qb-sheet-invocation"));
      const motivation = el("p", undefined, "qb-sheet-motivation");
      motivation.textContent = "با آرامش بیندیشید و با اطمینان پاسخ دهید.";
      header.append(motivation);
      const meta = el("div", undefined, "qb-sheet-meta");
      for (const [label, value] of [
        ["مدرسه", exam.school],
        ["درس", exam.courseTitle],
        ["آزمون", exam.title],
        ["دبیر", exam.teacher],
        ["تاریخ", dateLabel(exam.date)],
        ["مدت", `${number(exam.duration)} دقیقه`],
        [
          "بارم کل",
          number(exam.questions.reduce((sum, q) => sum + q.score, 0) / 100),
        ],
      ]) {
        if (!value && label !== "مدرسه" && label !== "دبیر") continue;
        const item = el("div", undefined, "qb-sheet-meta-item");
        item.append(
          el("span", `${label}: `),
          el(label === "آزمون" ? "h1" : "strong", value || "—"),
        );
        meta.append(item);
      }
      for (const label of ["نام و نام خانوادگی", "کلاس"]) {
        const item = el(
          "div",
          undefined,
          "qb-sheet-meta-item qb-student-field",
        );
        item.append(el("span", `${label}:`), el("span", "", "qb-student-line"));
        meta.append(item);
      }
      header.append(meta);
      s.append(header);
      const columns = el("div", undefined, "qb-sheet-columns");
      columns.setAttribute("aria-hidden", "true");
      columns.append(
        el("span", "ردیف"),
        el("span", "سؤال‌ها"),
        el("span", "بارم"),
      );
      s.append(columns);
      exam.questions.forEach((q, i) => {
        const row = el("section", undefined, "qb-sheet-question");
        const body = el("div", undefined, "qb-sheet-prompt");
        const questionDirection = sheetTextDirection(q.text);
        const questionText = sheetCleanText(q.text);
        const prompt = el(
          "p",
          questionDirection === "ltr"
            ? `${i + 1}. ${questionText}`
            : questionText,
        );
        prompt.dir = questionDirection;
        if (/[\r\n]/.test(q.text)) {
          prompt.textContent = "";
          questionText.split(/\r\n|\r|\n/).forEach((line, lineIndex) => {
            const part = el(
              "span",
              (lineIndex === 0 && questionDirection === "ltr"
                ? `${i + 1}. `
                : "") + line,
              "qb-sheet-line",
            );
            part.dir = sheetTextDirection(line, questionDirection);
            prompt.append(part);
          });
        }
        if (q.type === "boolean") {
          const choices = el(
            "span",
            questionDirection === "rtl"
              ? "□ صحیح     □ غلط"
              : "□ True     □ False",
            "qb-sheet-boolean",
          );
          choices.dir = questionDirection;
          prompt.append(document.createTextNode("  "), choices);
        }
        const questionNumber = el(
          "span",
          questionDirection === "rtl" ? `${number(i + 1)}.` : "",
          "qb-sheet-number",
        );
        questionNumber.dir = "ltr";
        if (questionDirection === "ltr")
          questionNumber.setAttribute("aria-hidden", "true");
        body.append(
          questionNumber,
          prompt,
          el("span", number(q.score / 100), "qb-sheet-score"),
        );
        body.lastElementChild.setAttribute(
          "aria-label",
          `بارم ${number(q.score / 100)} نمره`,
        );
        row.append(body);
        if (q.type === "mcq") {
          const options = el("ol", undefined, "qb-sheet-options");
          options.dir = questionDirection;
          q.options.forEach((option, j) => {
            const item = el("li");
            item.dir = questionDirection;
            const optionText = el("bdi", sheetCleanText(option));
            optionText.dir = sheetTextDirection(option, questionDirection);
            if (/[\r\n]/.test(option)) {
              optionText.textContent = "";
              sheetCleanText(option)
                .split(/\r\n|\r|\n/)
                .forEach((line) => {
                  const part = el("span", line, "qb-sheet-line");
                  part.dir = sheetTextDirection(line, questionDirection);
                  optionText.append(part);
                });
            }
            item.append(
              el(
                "span",
                `${questionDirection === "rtl" ? letters[j] : ["A", "B", "C", "D"][j]})`,
              ),
              optionText,
            );
            options.append(item);
          });
          row.append(options);
        }
        if (q.type === "essay") {
          const space = el("div", undefined, "qb-answer-space");
          space.setAttribute("aria-label", "محل پاسخ تشریحی");
          for (let line = 0; line < 4; line++) space.append(el("span"));
          row.append(space);
        }
        if (q.type === "blank" && !/_{2,}|…|\.{3,}|ـ{3,}/u.test(q.text)) {
          const answer = el(
            "p",
            (questionDirection === "rtl" ? "پاسخ: " : "Answer: ") +
              "................................................",
            "qb-short-answer",
          );
          answer.dir = questionDirection;
          row.append(answer);
        }
        s.append(row);
      });
      const footer = el("footer", undefined, "qb-sheet-footer");
      const closing = el("p", undefined, "qb-sheet-closing");
      closing.append(
        el("span", "با آرامش و دقت پاسخ دهید؛"),
        document.createTextNode(" "),
        el("strong", "موفق باشید."),
      );
      const total = el("p", undefined, "qb-sheet-total");
      total.setAttribute(
        "aria-label",
        `تعداد کل سؤال‌ها: ${number(exam.questions.length)}`,
      );
      total.append(
        el("strong", number(exam.questions.length)),
        el("span", "سؤال"),
      );
      footer.append(closing, total);
      s.append(footer);
      return s;
    }
    async function print(exam) {
      const frame = el("iframe");
      frame.className = "qb-print-frame";
      frame.style.width = "794px";
      frame.style.visibility = "hidden";
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
          "@page{size:A4 portrait;margin:15mm}body{margin:0;font-family:IRANSans,sans-serif;background:white;color:black}body>.qb-sheet{display:block!important;padding:0}.qb-sheet-question{break-inside:avoid;overflow-wrap:anywhere}h1{font-size:20px}";
        doc.head.append(style);
        doc.body.append(doc.importNode(sheet(exam), true));
        doc.body.style.width = "180mm";
        await doc.fonts.load("16px IRANSans");
        await doc.fonts.ready;
        fitOptions(doc.body);
        await new Promise((resolve) =>
          frame.contentWindow.requestAnimationFrame(resolve),
        );
        frame.contentWindow.addEventListener(
          "afterprint",
          () => frame.remove(),
          {
            once: true,
          },
        );
        frame.contentWindow.focus();
        frame.contentWindow.print();
      } catch (error) {
        frame.remove();
        throw error;
      } finally {
        if (frame.isConnected) setTimeout(() => frame.remove(), 60000);
      }
    }
    return {
      sheet,
      print,
      previewText: { direction: sheetTextDirection, clean: sheetCleanText },
    };
  }
  root.EduQuestionBankPaperUI = { create };
})(globalThis);
