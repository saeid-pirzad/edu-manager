(function (root) {
  "use strict";
  const D = root.EduQuestionBank,
    R = root.EduQuestionBankRepository,
    F = root.EduQuestionBankFileBackup.service;
  let pendingChanges = () => false,
    activePage = null,
    savedView = null;
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
  const contextAction = (label, action, parent) => {
    const b = button(label, action, parent);
    b.classList.add("qb-context-action");
    b.setAttribute("aria-label", label);
    b.title = label;
    return b;
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
  function fitOptions(container) {
    const doc = container.ownerDocument;
    const context = doc.createElement("canvas").getContext("2d");
    if (!context) return;
    for (const list of container.querySelectorAll(
      ".qb-options,.qb-sheet-options",
    )) {
      if (!list.clientWidth) continue;
      const style = doc.defaultView.getComputedStyle(list);
      const required = Math.max(
        ...[...list.children].map((item) => {
          const css = doc.defaultView.getComputedStyle(item);
          const widths = [...item.children].map((span) => {
            const font = doc.defaultView.getComputedStyle(span);
            context.font = `${font.fontWeight} ${font.fontSize} ${font.fontFamily}`;
            return Math.max(
              ...span.textContent
                .split("\n")
                .map((line) => context.measureText(line).width),
              parseFloat(font.flexBasis) || 0,
            );
          });
          return (
            widths.reduce((a, b) => a + b, 0) +
            (parseFloat(css.columnGap) || 0) +
            parseFloat(css.paddingLeft) +
            parseFloat(css.paddingRight) +
            parseFloat(css.borderLeftWidth) +
            parseFloat(css.borderRightWidth)
          );
        }),
      );
      list.dataset.columns =
        required <=
        (list.clientWidth - 3 * (parseFloat(style.columnGap) || 0)) / 4
          ? "4"
          : "2";
    }
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
    const sticker = el("span", "🌱", "qb-sheet-sticker");
    sticker.setAttribute("aria-hidden", "true");
    motivation.append(sticker, el("span", "باور کن؛ از پسش برمی‌آیی."));
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
      const item = el("div", undefined, "qb-sheet-meta-item qb-student-field");
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
      const prompt = el("p", q.text);
      if (q.type === "boolean") {
        prompt.append(
          document.createTextNode("  "),
          el("span", "□ صحیح     □ غلط", "qb-sheet-boolean"),
        );
      }
      body.append(
        el("span", `${number(i + 1)}.`, "qb-sheet-number"),
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
        q.options.forEach((option, j) => {
          const item = el("li");
          item.append(el("span", `${letters[j]})`), el("span", option));
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
      if (q.type === "blank" && !/_{2,}|…|\.{3,}|ـ{3,}/u.test(q.text))
        row.append(
          el(
            "p",
            "پاسخ: ................................................",
            "qb-short-answer",
          ),
        );
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
  function openBank() {
    root.goQuestionBank();
    return activePage?.ready;
  }
  function mountBank(host) {
    if (!host) return Promise.resolve();
    if (activePage) {
      activePage.mount(host);
      return activePage.ready;
    }
    const pageRoot = el("section", undefined, "qb-page");
    const header = el("header", undefined, "qb-page-header"),
      title = el("h2", "بانک سؤال و طراحی آزمون"),
      message = el("p", "در حال خواندن…", "qb-message"),
      content = el("div", undefined, "qb-body");
    title.id = "qb-title";
    title.insertAdjacentHTML("afterbegin", root.EduIcons.html("book"));
    pageRoot.setAttribute("aria-labelledby", title.id);
    message.setAttribute("role", "status");
    const storage = el("div", undefined, "qb-storage-bar");
    const storageState = el("span", "ذخیره در مرورگر", "qb-storage-state");
    storageState.setAttribute("role", "status");
    let persistentMessage = "",
      persistentMessageOrigin = "",
      transientMessage = "";
    const storageAction = button(
      "فعال‌سازی خودکار",
      () => {
        if (F.state().state === "permission" && F.supported())
          saveBankFile().catch(error);
        else if (!F.state().connected && F.supported()) F.choose().catch(error);
        else
          discard(() => {
            tab = "backup";
            render();
          });
      },
      storage,
    );
    storage.prepend(storageState);
    storageAction.insertAdjacentHTML("afterbegin", root.EduIcons.html("save"));
    storageAction.dataset.uiTone = "settings";
    const tabScopes = savedView?.tabScopes || {
      questions: { courseId: "", unitId: "" },
      builder: { courseId: null, unitId: "" },
    };
    let bank,
      courseId = savedView?.courseId || "",
      unitId = savedView?.unitId || "",
      tab = savedView?.tab || "questions",
      page = savedView?.page || 0,
      search = savedView?.search || "",
      archiveQuery = savedView?.archiveQuery || "",
      archiveCourse = savedView?.archiveCourse || "",
      archivePage = savedView?.archivePage || 0,
      questionType = savedView?.questionType || "",
      dirty = false,
      busy = false,
      alive = true,
      leaving = false,
      renderSnapshot = null,
      mountedSnapshot = null,
      restoreRenderFrame = null,
      confirmation = null,
      cancelConfirmation = () => {},
      unsubscribeBackup = () => {};
    pendingChanges = () => dirty || busy;
    const error = (e, persistent = false) => {
      if (!alive) return;
      const detail = e.message || String(e);
      if (persistent) {
        persistentMessage = detail;
        persistentMessageOrigin = "data";
        transientMessage = "";
      } else transientMessage = detail;
      showMessage();
    };
    const unsubscribeStorage = F.subscribe((state) => {
      if (!alive) return;
      storage.dataset.state = state.state;
      const attention = ["error", "paused", "permission"].includes(state.state);
      storageState.textContent = attention
        ? state.message
        : state.state === "active"
          ? "فایل خودکار فعال است"
          : state.state === "busy"
            ? "در حال ذخیرهٔ فایل…"
            : state.connected
              ? "ذخیرهٔ فایل نیاز به بررسی دارد"
              : "ذخیره در مرورگر";
      storageState.title = state.message;
      storageState.setAttribute("role", attention ? "alert" : "status");
      storageAction.querySelector(".ui-button-label").textContent =
        state.state === "permission" && F.supported()
          ? "اجازه مجدد"
          : state.connected || !F.supported()
            ? "تنظیمات ذخیره"
            : "فعال‌سازی خودکار";
      storageAction.disabled = state.state === "busy";
      if (
        persistentMessageOrigin === "file" &&
        ["active", "inactive"].includes(state.state)
      ) {
        persistentMessage = "";
        persistentMessageOrigin = "";
        showMessage();
      }
    });
    function showMessage() {
      const details = [...new Set([transientMessage, persistentMessage])]
        .filter(Boolean)
        .join(" ");
      message.hidden = !details;
      message.textContent = details;
      if (details) {
        message.dataset.state = "error";
        message.setAttribute("role", "alert");
      } else {
        message.setAttribute("role", "status");
        delete message.dataset.state;
      }
    }
    function clearTransientMessage() {
      transientMessage = "";
      showMessage();
    }
    function confirmAction(label, action, onCancel = () => {}) {
      if (!alive || !pageRoot.isConnected || confirmation || busy) {
        onCancel();
        return;
      }
      closeOwnedCalendar();
      const box = el("section", undefined, "qb-confirm");
      box.setAttribute("role", "region");
      box.setAttribute("aria-label", label);
      box.append(el("h4", "تأیید عملیات", "qb-editor-title"));
      box.append(el("p", label));
      const previous = document.activeElement;
      const previousWindowScroll = { left: root.scrollX, top: root.scrollY };
      const selection = previous?.selectionStart;
      const selectionEnd = previous?.selectionEnd;
      const selectionDirection = previous?.selectionDirection;
      const contentWasInert = content.inert;
      const storageWasInert = storage.inert;
      const cancel = (accepted = false) => {
        if (confirmation !== box) return false;
        box.remove();
        confirmation = null;
        cancelConfirmation = () => {};
        content.inert = contentWasInert;
        storage.inert = storageWasInert;
        if (alive && previous?.isConnected) {
          previous.focus({ preventScroll: true });
          if (selection !== null && selection !== undefined)
            previous.setSelectionRange?.(
              selection,
              selectionEnd,
              selectionDirection,
            );
        }
        if (!accepted) onCancel();
        if (!accepted && alive)
          root.scrollTo({ ...previousWindowScroll, behavior: "instant" });
        keepEditingVisible();
        return true;
      };
      cancelConfirmation = cancel;
      const actions = el("div", undefined, "qb-confirm-actions");
      box.append(actions);
      const cancelButton = button("انصراف", () => cancel(), actions);
      const confirm = button(
        "تأیید",
        async () => {
          if (!cancel(true)) return;
          try {
            await action();
          } catch (e) {
            error(e);
          }
        },
        actions,
      );
      confirm.dataset.uiTone = /حذف|جایگزین/.test(label) ? "danger" : "save";
      box.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        cancel();
      });
      content.inert = true;
      storage.inert = true;
      pageRoot.insertBefore(box, message);
      confirmation = box;
      cancelButton.focus({ preventScroll: true });
      updateLayout();
    }
    function discard(action) {
      if (!alive || busy || confirmation) return;
      if (dirty)
        confirmAction("تغییرات فرم ذخیره نشده‌اند؛ کنار گذاشته شوند؟", () => {
          dirty = false;
          action();
        });
      else action();
    }
    function closeOwnedCalendar() {
      if (
        pageRoot.querySelector('[data-gregorian-target][aria-expanded="true"]')
      )
        root.closeShamsiCalendar();
    }
    function cacheView() {
      if (tabScopes[tab]) Object.assign(tabScopes[tab], { courseId, unitId });
      savedView = structuredClone({
        tabScopes,
        courseId,
        unitId,
        tab,
        page,
        search,
        archiveQuery,
        archiveCourse,
        archivePage,
        questionType,
      });
    }
    function preserveForRender() {
      if (!alive) {
        renderSnapshot = null;
        return;
      }
      const focused = pageRoot.contains(document.activeElement)
        ? document.activeElement
        : null;
      const scrollers = [content];
      for (
        let parent = focused;
        parent && parent !== pageRoot;
        parent = parent.parentElement
      )
        scrollers.push(parent);
      renderSnapshot = {
        focused,
        windowScroll: mountedSnapshot?.windowScroll || {
          left: root.scrollX,
          top: root.scrollY,
        },
        start: focused?.selectionStart,
        end: focused?.selectionEnd,
        direction: focused?.selectionDirection,
        scroll: [...new Set(scrollers)].map((node) => [
          node,
          node.scrollTop,
          node.scrollLeft,
        ]),
      };
    }
    function restoreRenderSnapshot(snapshot) {
      if (!snapshot) return;
      root.scrollTo({ ...snapshot.windowScroll, behavior: "instant" });
      if (snapshot.focused?.isConnected) {
        snapshot.focused.focus({ preventScroll: true });
        if (snapshot.start !== null && snapshot.start !== undefined)
          snapshot.focused.setSelectionRange?.(
            snapshot.start,
            snapshot.end,
            snapshot.direction,
          );
      }
      for (const [node, top, left] of snapshot.scroll) {
        node.scrollTop = top;
        node.scrollLeft = left;
      }
    }
    function mount(host) {
      if (!alive) return;
      host.append(pageRoot);
      mountedSnapshot = renderSnapshot;
      renderSnapshot = null;
      updateLayout();
      restoreRenderSnapshot(mountedSnapshot);
    }
    function completeRender() {
      updateLayout();
      // The workspace adds its status bar and tools after mounting this page.
      // Restore again once those elements establish the full document height.
      restoreRenderSnapshot(mountedSnapshot);
      cancelAnimationFrame(restoreRenderFrame);
      if (!mountedSnapshot) return;
      // Header enhancement also runs on the next animation frame. Retain the
      // original position through consecutive renders until that layout settles.
      restoreRenderFrame = requestAnimationFrame(() => {
        restoreRenderFrame = requestAnimationFrame(() => {
          if (!alive || !pageRoot.isConnected) return;
          restoreRenderSnapshot(mountedSnapshot);
          mountedSnapshot = null;
          updateLayout();
        });
      });
    }
    function dispose() {
      if (!alive) return;
      closeOwnedCalendar();
      alive = false;
      root.visualViewport?.removeEventListener("resize", keepEditingVisible);
      root.visualViewport?.removeEventListener("scroll", keepEditingVisible);
      root.removeEventListener("resize", keepEditingVisible);
      cancelAnimationFrame(editingFrame);
      cancelAnimationFrame(restoreRenderFrame);
      optionResize.disconnect();
      optionChanges.disconnect();
      unsubscribeBackup();
      unsubscribeStorage();
      cancelConfirmation();
      restoreKeyboardScroll();
      pendingChanges = () => false;
      pageRoot.remove();
      if (activePage?.element === pageRoot) activePage = null;
    }
    function requestLeave(action) {
      if (!alive || busy || leaving || confirmation) return false;
      const leave = () => {
        cacheView();
        dispose();
        action();
      };
      if (dirty) {
        leaving = true;
        confirmAction(
          "تغییرات فرم ذخیره نشده‌اند؛ کنار گذاشته شوند؟",
          leave,
          () => {
            leaving = false;
          },
        );
        return false;
      }
      leave();
      return true;
    }
    header.append(title);
    pageRoot.append(header, storage, message, content);
    host.append(pageRoot);
    let editingFrame,
      keyboardScroll = null;
    function restoreKeyboardScroll() {
      if (!keyboardScroll) return;
      const previous = keyboardScroll;
      keyboardScroll = null;
      delete pageRoot.dataset.keyboardViewport;
      pageRoot.style.removeProperty("--qb-keyboard-scroll-space");
      root.scrollTo({ left: previous.x, top: previous.y, behavior: "instant" });
    }
    function updateLayout() {
      if (!alive || !pageRoot.isConnected) return;
      const viewport = root.visualViewport;
      const top = viewport?.offsetTop || 0;
      const form = content.querySelector(".qb-form");
      const mobile = root.matchMedia(
        "(max-width: 700px), (max-height: 500px) and (pointer: coarse)",
      ).matches;
      const reduced = viewport && root.innerHeight - viewport.height > 120;
      if (
        mobile &&
        form &&
        reduced &&
        (keyboardScroll || form.contains(document.activeElement))
      ) {
        if (!keyboardScroll)
          keyboardScroll = { x: root.scrollX, y: root.scrollY };
        pageRoot.dataset.keyboardViewport = "true";
        // Keep enough document height to pan the application header away even
        // while this page follows the smaller visible viewport. The page itself
        // stays in normal flow and its own body remains the editing scroller.
        pageRoot.style.setProperty(
          "--qb-keyboard-scroll-space",
          root.innerHeight + "px",
        );
        const distance = pageRoot.getBoundingClientRect().top - top - 4;
        if (Math.abs(distance) > 1)
          root.scrollBy({ top: distance, left: 0, behavior: "instant" });
      } else restoreKeyboardScroll();
      let bottom = top + (viewport?.height || root.innerHeight);
      const navigation = document.getElementById("uiBottomNav");
      if (
        navigation?.getClientRects().length &&
        root.getComputedStyle(navigation).visibility !== "hidden"
      ) {
        const bounds = navigation.getBoundingClientRect();
        if (bounds.top < bottom && bounds.bottom > top)
          bottom = Math.min(bottom, bounds.top);
      }
      if (confirmation) {
        const bounds = confirmation.getBoundingClientRect();
        if (bounds.top < top + 12 || bounds.bottom > bottom - 12)
          confirmation.scrollIntoView({ block: "center", behavior: "instant" });
      }
      pageRoot.style.setProperty(
        "--qb-page-available-height",
        Math.max(
          0,
          bottom -
            Math.max(top, pageRoot.getBoundingClientRect().top) -
            (keyboardScroll ? 4 : 12),
        ) + "px",
      );
    }
    function keepEditingVisible() {
      if (!alive || !pageRoot.isConnected) return;
      cancelAnimationFrame(editingFrame);
      editingFrame = requestAnimationFrame(() => {
        if (!alive || !pageRoot.isConnected) return;
        updateLayout();
        if (
          !root.matchMedia(
            "(max-width: 700px), (max-height: 500px) and (pointer: coarse)",
          ).matches
        )
          return;
        const form = content.querySelector(".qb-form");
        if (!form) return;
        const bounds = content.getBoundingClientRect();
        const actions = form.querySelector(".record-editor-actions");
        content.style.setProperty(
          "--qb-textarea-max-height",
          Math.max(
            44,
            content.clientHeight - (actions?.offsetHeight || 0) - 24,
          ) + "px",
        );
        const active = document.activeElement;
        if (!form.contains(active)) return;
        // A sticky footer can move as its form scrolls. Recheck its actual
        // position after scrolling, with a fixed limit and no focus changes.
        for (let attempt = 0; attempt < 3; attempt++) {
          const field = active.getBoundingClientRect();
          const footer = actions?.getBoundingClientRect();
          const visibleBottom = Math.min(
            bounds.bottom,
            footer && !actions.contains(active) ? footer.top : bounds.bottom,
          );
          const padding = Math.max(
            0,
            Math.min(12, (visibleBottom - bounds.top - field.height) / 2),
          );
          const top = bounds.top + padding;
          const bottom = visibleBottom - padding;
          let distance = 0;
          if (field.height > bottom - top) {
            if (field.top >= bottom - 40 || field.bottom <= top + 40)
              distance = field.top - top;
          } else if (field.bottom > bottom) distance = field.bottom - bottom;
          else if (field.top < top) distance = field.top - top;
          if (Math.abs(distance) < 0.5) break;
          const previous = content.scrollTop;
          content.scrollTop += distance;
          if (Math.abs(content.scrollTop - previous) < 0.5) break;
        }
      });
    }
    root.visualViewport?.addEventListener("resize", keepEditingVisible);
    root.visualViewport?.addEventListener("scroll", keepEditingVisible);
    content.addEventListener("focusin", keepEditingVisible);
    content.addEventListener("input", keepEditingVisible);
    content.addEventListener("keyup", (event) => {
      if (/^(Arrow|Home$|End$|Page)/.test(event.key)) keepEditingVisible();
    });
    root.addEventListener("resize", keepEditingVisible);
    const updateOptions = () => {
      if (alive && pageRoot.isConnected) fitOptions(content);
    };
    const optionResize = new ResizeObserver(updateOptions);
    const optionChanges = new MutationObserver(updateOptions);
    optionResize.observe(content);
    optionChanges.observe(content, { childList: true, subtree: true });
    content.addEventListener("toggle", updateOptions, true);
    document.fonts.ready.then(() => {
      if (alive && pageRoot.isConnected) updateOptions();
    });
    pageRoot.addEventListener("input", (e) => {
      if (e.target.closest("form") && !e.target.closest(".qb-toolbar"))
        dirty = true;
    });
    async function commit(next, prepare) {
      if (!alive || busy || confirmation) return false;
      try {
        D.validate(next);
      } catch (e) {
        error(e);
        return false;
      }
      busy = true;
      pageRoot.setAttribute("aria-busy", "true");
      content.inert = true;
      try {
        if (prepare) await prepare();
        if (!alive) return false;
        bank = await R.save(next, bank.revision);
        if (!alive) return false;
        dirty = false;
        const fileState = F.state();
        if (["error", "paused", "permission"].includes(fileState.state)) {
          persistentMessage = `در مرورگر ذخیره شد. ${fileState.message}`;
          persistentMessageOrigin = "file";
          transientMessage = "";
          showMessage();
          return true;
        }
        persistentMessage = "";
        persistentMessageOrigin = "";
        transientMessage = "";
        showMessage();
        storageState.textContent =
          fileState.state === "active"
            ? "در مرورگر ذخیره شد؛ فایل در حال به‌روزرسانی"
            : "در مرورگر ذخیره شد";
        return true;
      } catch (e) {
        error(e, true);
        return false;
      } finally {
        busy = false;
        if (alive) {
          content.inert = false;
          pageRoot.removeAttribute("aria-busy");
        }
      }
    }
    const mutate = async (action) => {
      const next = structuredClone(bank);
      action(next);
      if (await commit(next)) render();
    };
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
        if (!alive || busy || confirmation) return;
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
    function unitLabel() {
      return bank.courses.find((c) => c.id === courseId)?.structure === "module"
        ? "پودمان"
        : "فصل";
    }
    function entityMenu(parent, label, selected, add, edit, remove) {
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
      const units = bank.units.filter((u) => u.courseId === courseId);
      const unitIds = new Set(units.map((u) => u.id));
      const questions = bank.questions.filter((q) =>
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
      const count = bank.questions.filter(
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
        const current = bank.courses.find((c) => c.id === courseId);
        const f = form(
          content,
          async () => {
            const next = structuredClone(bank);
            if (edit) {
              const course = next.courses.find((c) => c.id === courseId);
              course.title = name.value.trim();
              if (!bank.units.some((u) => u.courseId === courseId))
                course.structure = structure.value;
            } else {
              const c = {
                id: crypto.randomUUID(),
                title: name.value.trim(),
                structure: structure.value,
              };
              next.courses.push(c);
              if (await commit(next)) {
                courseId = c.id;
                unitId = "";
                if (tab === "builder") tabScopes.builder.unitIds = [];
                search = "";
                questionType = "";
                page = 0;
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
          edit && bank.units.some((u) => u.courseId === courseId);
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
            const next = structuredClone(bank);
            const id = existing?.id || crypto.randomUUID();
            if (existing)
              next.units.find((u) => u.id === id).title = name.value.trim();
            else next.units.push({ id, courseId, title: name.value.trim() });
            if (await commit(next)) {
              unitId = id;
              search = "";
              questionType = "";
              page = 0;
              render();
            }
          },
          {
            title: existing ? `ویرایش ${unitLabel()}` : `${unitLabel()} جدید`,
            subtitle:
              bank.courses.find((course) => course.id === courseId)?.title ||
              "",
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
            if (q.type === "mcq")
              q.options = options.map((n) => n.value.trim());
            D.question(q);
            if (
              q.type === "mcq" &&
              (existing?.type !== "mcq" ||
                q.options.some(
                  (value, index) => value !== existing.options[index].trim(),
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
            ...bank.units
              .filter((u) => u.courseId === courseId)
              .map((u) => [u.id, u.title]),
          ],
          existing?.unitId || unitId,
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
                field(area, `گزینه ${i + 1}`, draft?.options[i] || ""),
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
        const optional = el("details", undefined, "qb-optional qb-field-wide");
        optional.append(el("summary", "توضیح پاسخ (اختیاری)"));
        optional.open = Boolean(existing?.explanation);
        f.append(optional);
        const explanation = field(
            optional,
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
      const unitMap = new Map(units.map((unit) => [unit.id, unit]));
      const entry = el("section", undefined, "qb-question-entry");
      entry.setAttribute("aria-label", "انتخاب بخش و افزودن سؤال");
      parent.append(entry);
      const coursePicker = parent.querySelector(".qb-toolbar");
      if (coursePicker) {
        coursePicker.classList.add("qb-entry-course");
        entry.append(coursePicker);
      }
      const library = el("section", undefined, "qb-question-library");
      library.setAttribute("aria-label", "بانک سؤال‌های درس");
      parent.append(library);
      const controls = el("section", undefined, "qb-question-controls");
      controls.setAttribute("aria-label", "جست‌وجو و فیلتر سؤال‌ها");
      library.append(controls);
      const sections = el("div", undefined, "qb-section-picker");
      entry.append(sections);
      const filters = el("div", undefined, "course-grid qb-filters");
      controls.append(filters);
      const filter = select(
        sections,
        unitLabel(),
        [
          [
            "",
            units.length
              ? `انتخاب ${unitLabel()}`
              : `ابتدا ${unitLabel()} بسازید`,
          ],
          ...units.map((u) => [u.id, u.title]),
        ],
        unitId,
      );
      filter.disabled = !units.length;
      const sectionActions = el(
        "div",
        undefined,
        "qb-actions qb-course-actions",
      );
      sections.append(sectionActions);
      entityMenu(
        sectionActions,
        unitLabel(),
        Boolean(unitId),
        () => manageUnit(),
        () => manageUnit(units.find((u) => u.id === unitId)),
        () => discard(() => removeUnit(units.find((u) => u.id === unitId))),
      );
      const kind = select(
        filters,
        "نوع سؤال",
        [["", "همه"], ...Object.entries(D.types)],
        questionType,
      );
      const find = field(filters, "جست‌وجو در سؤال‌ها", search);
      find.type = "search";
      find.placeholder = "متن سؤال…";
      filters.prepend(find.parentElement);
      const heading = el("div", undefined, "qb-list-heading");
      const headingCopy = el("div");
      const count = el("span", undefined, "qb-library-count");
      const range = el("p");
      count.setAttribute("aria-live", "polite");
      headingCopy.append(el("h4", "بانک سؤال‌ها"), range);
      heading.append(headingCopy, count);
      const add = button("افزودن سؤال", () => editQuestion(), entry);
      add.dataset.uiVariant = "solid";
      add.disabled = !unitId;
      add.title = unitId
        ? `افزودن سؤال به ${filter.selectedOptions[0].textContent}`
        : `ابتدا یک ${unitLabel()} انتخاب کنید`;
      controls.prepend(heading);
      const results = el("div", undefined, "qb-results");
      results.tabIndex = 0;
      results.setAttribute("role", "region");
      results.setAttribute("aria-label", "فهرست سؤال‌ها");
      const pager = el("nav", undefined, "qb-actions qb-pager");
      pager.setAttribute("aria-label", "صفحه‌بندی سؤال‌ها");
      library.append(results, pager);
      function draw() {
        results.replaceChildren();
        pager.replaceChildren();
        const list = bank.questions.filter(
          (q) =>
            unitMap.has(q.unitId) &&
            (!unitId || q.unitId === unitId) &&
            (!questionType || q.type === questionType) &&
            D.searchText(q.text).includes(D.searchText(search)),
        );
        page = Math.min(page, Math.max(0, Math.ceil(list.length / 15) - 1));
        count.textContent = `${number(list.length)} سؤال`;
        range.textContent = list.length
          ? `نمایش ${number(page * 15 + 1)} تا ${number(Math.min((page + 1) * 15, list.length))} از سؤال‌های این محدوده`
          : "سؤال‌های این درس را اینجا مدیریت کنید.";
        list.slice(page * 15, page * 15 + 15).forEach((q, index) => {
          const card = el("details", undefined, "qb-question qb-question-row");
          card.setAttribute("name", "qb-question-list");
          card.dataset.questionType = q.type;
          const toggle = el("summary", undefined, "qb-question-toggle");
          const copy = el("span", undefined, "qb-row-copy");
          const metadata = el("span", undefined, "qb-row-meta");
          metadata.append(el("span", D.types[q.type], "qb-kind-badge"));
          if (!unitId)
            metadata.append(
              el("span", unitMap.get(q.unitId).title, "qb-row-unit"),
            );
          copy.append(el("span", q.text, "qb-row-excerpt"), metadata);
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
              search || questionType
                ? "سؤالی با این فیلترها پیدا نشد"
                : units.length
                  ? `اولین سؤال ${units.find((u) => u.id === unitId)?.title || "این درس"} را بسازید`
                  : `اولین ${unitLabel()} این درس را بسازید`,
            ),
            el(
              "p",
              search || questionType
                ? "جست‌وجو یا فیلترها را تغییر دهید تا سؤال‌های بیشتری ببینید."
                : units.length
                  ? "سؤال‌ها را همراه پاسخ و بارم ثبت کنید تا برای آزمون‌های بعدی آماده باشند."
                  : `از دکمهٔ «${unitLabel()} جدید» شروع کنید؛ سپس سؤال‌های آن را ثبت کنید.`,
            ),
          );
          if (search || questionType)
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
          results.append(empty);
        }
        button(
          "قبلی",
          () => {
            page--;
            draw();
            results.scrollTop = 0;
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
            results.scrollTop = 0;
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
      const f = form(
        parent,
        async () => {
          f.dataset.submitted = "true";
          update();
          if (!f.reportValidity()) return;
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
            totalScore: totalScore.value,
          });
          const next = structuredClone(bank);
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
      const intro = el("div", undefined, "qb-builder-intro qb-field-wide");
      intro.append(el("p", "انتخاب بخش‌ها ← ترکیب سؤال‌ها ← مشخصات آزمون"));
      f.append(intro);
      const units = bank.units.filter((u) => u.courseId === courseId),
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
            `${number(bank.questions.filter((q) => q.unitId === u.id).length)} سؤال`,
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
        tabScopes.builder.unitIds = checks
          .filter((c) => c.checked)
          .map((c) => c.value);
        let total = 0;
        const selected = new Set(
          checks.filter((c) => c.checked).map((c) => c.value),
        );
        selectAll.disabled =
          checks.length === 0 || selected.size === checks.length;
        clearAll.disabled = selected.size === 0;
        for (const type of Object.keys(D.types)) {
          const capacity = bank.questions.filter(
            (q) => q.type === type && selected.has(q.unitId),
          ).length;
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
        scope.dataset.empty = String(selected.size === 0);
        checks[0]?.setCustomValidity(
          selected.size ? "" : `حداقل یک ${unitLabel()} انتخاب کنید.`,
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
          el("span", `${number(selected.size)} بخش انتخاب‌شده`),
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
          dirty = true;
          update();
        },
        selectionActions,
      );
      const clearAll = button(
        "لغو انتخاب",
        () => {
          checks.forEach((c) => (c.checked = false));
          dirty = true;
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
    function preview(exam) {
      if (!alive) return;
      clearTransientMessage();
      closeOwnedCalendar();
      restoreKeyboardScroll();
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
      root.scrollTo({ top: 0, left: 0, behavior: "instant" });
      updateLayout();
    }
    function saveBankFile() {
      if (!alive) return Promise.resolve(false);
      return F.saveNow(
        (name, counts) =>
          new Promise((resolve) =>
            confirmAction(
              `فایل «${name}» با ${number(counts.questions)} سؤال و ${number(counts.exams)} آزمون فعلی جایگزین شود؟ نسخهٔ قبلی این فایل از بین می‌رود؛ اگر لازم است ابتدا یک کپی نگه دارید.`,
              () => resolve(true),
              () => resolve(false),
            ),
          ),
      );
    }
    function files(parent) {
      const details = el("section", undefined, "qb-backup");
      details.append(
        el("h4", "پشتیبان و بازیابی بانک سؤال", "qb-form-heading"),
        el(
          "p",
          "نام فایل: Classyar-QuestionBank.json؛ نسخه‌های شماره‌دار مانند (1) هم پذیرفته می‌شوند. فایل‌های قدیمی را ابتدا تغییر نام دهید. فقط تغییرات ثبت‌شده در پشتیبان قرار می‌گیرند.",
        ),
      );
      parent.append(details);
      const manual = el("section", undefined, "qb-backup-manual");
      manual.append(el("h4", "پشتیبان دستی"));
      details.append(manual);
      button(
        "دریافت فایل بانک",
        async () => {
          try {
            const current = await R.read();
            if (!alive) return;
            const json = D.size(D.validate(current));
            const url = URL.createObjectURL(
                new Blob([json], { type: "application/json" }),
              ),
              a = el("a");
            a.href = url;
            a.download = F.suggestedName();
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          } catch (e) {
            error(e);
          }
        },
        manual,
      );
      const upload = field(manual, "بازیابی بانک از JSON");
      upload.type = "file";
      upload.accept = ".json,application/json";
      upload.parentElement.hidden = true;
      const restore = button("بازیابی از فایل", () => upload.click(), manual);
      restore.dataset.uiTone = "create";
      restore.insertAdjacentHTML("afterbegin", root.EduIcons.html("folder"));
      upload.onchange = async () => {
        try {
          const file = upload.files[0];
          if (!file) return;
          root.EduQuestionBankFileBackup.assertFileName(file.name);
          if (file.size > D.LIMIT)
            throw Error("سقف فایل ورودی ۲۰ مگابایت است.");
          const incoming = D.parse(await file.text());
          if (!alive) return;
          discard(() =>
            confirmAction(
              `فایل «${file.name}»: ${incoming.courses.length} درس، ${incoming.questions.length} سؤال و ${incoming.exams.length} آزمون. تمام بانک سؤال فعلی جایگزین می‌شود؛ اطلاعات مدرسه تغییر نمی‌کند. ادامه؟`,
              async () => {
                if (await commit(incoming, () => F.suspend())) {
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
      const automatic = el("section", undefined, "qb-backup-automatic");
      automatic.append(
        el("h4", "ذخیرهٔ خودکار در فایل"),
        el(
          "p",
          "فایل را یک‌بار انتخاب کنید؛ هنگام باز بودن برنامه، همان فایل پس از ثبت تغییرات به‌روز می‌شود. فایل خودکار، اطلاعات را به برنامه وارد نمی‌کند.",
        ),
      );
      const fileSummary = el("div", undefined, "qb-file-summary");
      const fileLabel = el("span", undefined, "qb-file-meta");
      const fileName = el("bdi", undefined, "qb-file-name");
      fileName.dir = "ltr";
      const fileSaved = el("span", undefined, "qb-file-meta");
      fileSummary.append(fileLabel, fileName, fileSaved);
      const status = el("p", undefined, "qb-file-status");
      const actions = el("div", undefined, "qb-file-actions");
      automatic.append(fileSummary, status, actions);
      details.append(automatic);
      const choose = button("انتخاب فایل", () => F.choose(), actions);
      const save = button("ذخیره اکنون", () => saveBankFile(), actions);
      const stop = button("قطع اتصال", () => F.stop().catch(error), actions);
      for (const [control, tone, icon] of [
        [choose, "create", "folder"],
        [save, "settings", "save"],
        [stop, "danger", "close"],
      ]) {
        control.dataset.uiTone = tone;
        control.insertAdjacentHTML("afterbegin", root.EduIcons.html(icon));
      }
      unsubscribeBackup();
      unsubscribeBackup = F.subscribe((state) => {
        if (!alive || !status.isConnected) return;
        fileLabel.textContent = state.connected
          ? "فایل متصل"
          : "فایل پشتیبان انتخاب نشده";
        fileName.hidden = !state.connected;
        fileName.textContent = state.connected
          ? state.name || "نام فایل در دسترس نیست"
          : "";
        fileName.title = state.name || "";
        fileSaved.hidden = !state.connected;
        const savedAt = state.savedAt ? new Date(state.savedAt) : null;
        if (state.connected && savedAt && Number.isFinite(savedAt.getTime())) {
          const time = el(
            "time",
            savedAt.toLocaleString("fa-IR-u-ca-persian", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            }),
          );
          time.dateTime = savedAt.toISOString();
          fileSaved.replaceChildren("آخرین ذخیره: ", time);
        } else {
          fileSaved.textContent = state.connected ? "هنوز ذخیره نشده" : "";
        }
        status.textContent =
          state.connected && state.state === "permission"
            ? "این فایل قبلاً انتخاب شده است؛ برای تأیید مجوز همین فایل، «اجازه مجدد» را بزنید."
            : state.message;
        status.dataset.state = state.state;
        status.setAttribute(
          "role",
          state.state === "error" ? "alert" : "status",
        );
        choose.disabled = !F.supported() || state.state === "busy";
        save.querySelector(".ui-button-label").textContent =
          state.state === "permission" ? "اجازه مجدد" : "ذخیره اکنون";
        save.title =
          state.state === "permission"
            ? "تأیید مجوز فایل بانک سؤال"
            : "ذخیره اکنون";
        save.disabled =
          !state.connected || !F.supported() || state.state === "busy";
        stop.disabled =
          !state.connected || !F.supported() || state.state === "busy";
      });
    }
    function exams(parent) {
      const library = el("section", undefined, "qb-exam-library");
      library.setAttribute("aria-label", "آزمون‌های ذخیره‌شده");
      parent.append(library);
      const controls = el("div", undefined, "qb-archive-controls");
      const heading = el(
        "div",
        undefined,
        "qb-list-heading qb-archive-heading",
      );
      const archiveTitle = el("h4", "آزمون‌های من");
      archiveTitle.insertAdjacentHTML("afterbegin", root.EduIcons.html("copy"));
      heading.append(archiveTitle);
      controls.append(heading);
      library.append(controls);
      const filters = el("div", undefined, "course-grid qb-archive-filters");
      controls.append(filters);
      const find = field(filters, "جست‌وجوی آزمون", archiveQuery);
      find.type = "search";
      find.placeholder = "عنوان آزمون یا نام درس…";
      const courseFilter = select(
        filters,
        "درس آزمون",
        [
          ["", "همهٔ درس‌ها"],
          ...[...new Set(bank.exams.map((e) => e.courseTitle))].map((title) => [
            title,
            title,
          ]),
        ],
        archiveCourse,
      );
      const results = el("div", undefined, "qb-exam-results");
      results.tabIndex = 0;
      results.setAttribute("role", "region");
      results.setAttribute("aria-label", "فهرست آزمون‌ها");
      const pager = el("nav", undefined, "qb-actions qb-pager");
      pager.setAttribute("aria-label", "صفحه‌بندی آزمون‌ها");
      const count = el("span", undefined, "qb-library-count");
      count.setAttribute("role", "status");
      heading.append(count);
      library.append(results, pager);
      function draw() {
        results.scrollTop = 0;
        results.replaceChildren();
        pager.replaceChildren();
        const query = D.searchText(find.value);
        const list = [...bank.exams]
          .reverse()
          .filter(
            (exam) =>
              (!courseFilter.value ||
                exam.courseTitle === courseFilter.value) &&
              D.searchText(`${exam.title} ${exam.courseTitle}`).includes(query),
          );
        archivePage = Math.min(
          archivePage,
          Math.max(0, Math.ceil(list.length / 12) - 1),
        );
        count.textContent = `${number(list.length)} آزمون${query || courseFilter.value ? ` از ${number(bank.exams.length)}` : ""}`;
        for (const exam of list.slice(
          archivePage * 12,
          archivePage * 12 + 12,
        )) {
          const row = el("section", undefined, "qb-question qb-exam-card");
          const copy = el("div", undefined, "qb-exam-copy");
          const title = el("h3", exam.title);
          title.title = exam.title;
          const context = el("div", undefined, "qb-exam-context");
          context.append(
            el("span", exam.courseTitle, "qb-exam-course"),
            el("span", dateLabel(exam.date), "qb-exam-date-label"),
          );
          copy.append(title, context);
          row.append(copy);
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
          copy.append(meta);
          row.append(actions);
          button("مشاهده آزمون", () => preview(exam), actions);
          const printButton = button(
            "چاپ",
            () => print(exam).catch(error),
            actions,
          );
          printButton.title = "چاپ / ذخیرهٔ PDF";
          printButton.setAttribute(
            "aria-label",
            `چاپ / PDF آزمون ${exam.title}`,
          );
          const remove = button(
            "حذف آزمون",
            () =>
              confirmAction(
                `آزمون «${exam.title}» از درس «${exam.courseTitle}» حذف شود؟ سؤال‌های بانک حفظ می‌شوند.`,
                () =>
                  mutate((next) => {
                    next.exams = next.exams.filter((e) => e.id !== exam.id);
                  }),
              ),
            actions,
          );
          remove.setAttribute("aria-label", `حذف آزمون ${exam.title}`);
          remove.title = "حذف آزمون";
          results.append(row);
        }
        if (!list.length)
          results.append(
            el(
              "p",
              bank.exams.length
                ? "آزمونی با این عبارت پیدا نشد."
                : "هنوز آزمونی ساخته نشده است.",
              "qb-empty",
            ),
          );
        button(
          "قبلی",
          () => {
            archivePage--;
            draw();
          },
          pager,
        ).disabled = archivePage === 0;
        pager.append(
          el(
            "span",
            `صفحه ${number(archivePage + 1)} از ${number(Math.max(1, Math.ceil(list.length / 12)))}`,
          ),
        );
        button(
          "بعدی",
          () => {
            archivePage++;
            draw();
          },
          pager,
        ).disabled = (archivePage + 1) * 12 >= list.length;
        pager.hidden = list.length <= 12;
      }
      find.oninput = () => {
        archiveQuery = find.value;
        archivePage = 0;
        draw();
      };
      courseFilter.onchange = () => {
        archiveCourse = courseFilter.value;
        archivePage = 0;
        draw();
      };
      draw();
    }
    function render() {
      if (!alive) return;
      const wasEditing = Boolean(content.querySelector(".qb-form"));
      clearTransientMessage();
      if (!bank.courses.some((course) => course.id === courseId)) courseId = "";
      if (
        !bank.units.some(
          (unit) => unit.id === unitId && unit.courseId === courseId,
        )
      )
        unitId = "";
      if (tabScopes[tab]) Object.assign(tabScopes[tab], { courseId, unitId });
      closeOwnedCalendar();
      unsubscribeBackup();
      unsubscribeBackup = () => {};
      content.replaceChildren();
      dirty = false;
      const tabs = el("nav", undefined, "tabs qb-actions qb-tabs");
      tabs.setAttribute("aria-label", "بخش‌های بانک سؤال و طراحی آزمون");
      content.append(tabs);
      for (const [id, label] of [
        ["questions", "بانک سؤال"],
        ["builder", "طراحی آزمون"],
        ["exams", "آزمون‌های من"],
        ["backup", "پشتیبان"],
      ]) {
        const b = button(
          label,
          () =>
            discard(() => {
              if (tabScopes[tab])
                Object.assign(tabScopes[tab], { courseId, unitId });
              tab = id;
              const scope = tabScopes[tab];
              courseId = scope ? (scope.courseId ?? courseId) : "";
              unitId = scope?.unitId || "";
              page = 0;
              render();
            }),
          tabs,
        );
        b.title = label;
        b.setAttribute("aria-pressed", String(tab === id));
      }
      const panel = el("section", undefined, "qb-panel");
      panel.classList.toggle(
        "qb-course-empty",
        !courseId && (tab === "questions" || tab === "builder"),
      );
      content.append(panel);
      if (tab === "questions" || tab === "builder") {
        const toolbar = el("div", undefined, "qb-actions qb-toolbar");
        toolbar.classList.toggle("qb-course-required", !courseId);
        panel.append(toolbar);
        const course = select(
          toolbar,
          "درس",
          [["", "انتخاب درس"], ...bank.courses.map((c) => [c.id, c.title])],
          courseId,
        );
        course.onchange = () => {
          const requestedCourse = course.value;
          course.value = courseId;
          discard(() => {
            courseId = requestedCourse;
            unitId = "";
            if (tab === "builder") tabScopes.builder.unitIds = [];
            page = 0;
            render();
          });
        };
        const courseActions = el(
          "div",
          undefined,
          "qb-actions qb-course-actions",
        );
        toolbar.append(courseActions);
        entityMenu(
          courseActions,
          "درس",
          Boolean(courseId),
          () => manageCourse(),
          () => manageCourse(true),
          () =>
            discard(() =>
              removeCourse(bank.courses.find((c) => c.id === courseId)),
            ),
        );
      }
      if (tab === "exams") {
        exams(panel);
      } else if (tab === "backup") {
        files(panel);
      } else if (!courseId) {
        const empty = el("div", undefined, "qb-empty");
        empty.insertAdjacentHTML("afterbegin", root.EduIcons.html("book"));
        empty.append(
          el("h4", "ابتدا درس را انتخاب کنید"),
          el(
            "p",
            "درس این تب را انتخاب کنید. برای ساخت درس تازه، منوی بیشتر کنار انتخاب‌گر را باز کنید.",
          ),
        );
        panel.append(empty);
      } else if (tab === "builder") builder(panel);
      else questions(panel);
      if (wasEditing && !content.querySelector(".qb-form")) {
        restoreKeyboardScroll();
        root.scrollTo({ top: 0, left: 0, behavior: "instant" });
        updateLayout();
      }
    }
    const controller = {
      element: pageRoot,
      ready: null,
      mount,
      preserveForRender,
      requestLeave,
      dispose,
      updateLayout: completeRender,
    };
    activePage = controller;
    controller.ready = (async () => {
      try {
        const current = await R.read();
        if (!alive) return;
        bank = D.validate(current);
        await F.init();
        if (!alive) return;
        message.textContent = "";
        message.hidden = true;
        render();
        updateLayout();
      } catch (e) {
        error(e, true);
      }
    })();
    updateLayout();
    return controller.ready;
  }
  root.EduQuestionBankUI = {
    open: openBank,
    mount: mountBank,
    isMounted: () => Boolean(activePage),
    isPageActive: () => Boolean(activePage?.element.isConnected),
    isPreviewActive: () =>
      Boolean(
        activePage?.element.isConnected &&
        activePage.element.querySelector(".qb-sheet"),
      ),
    requestLeave: (action) =>
      activePage ? activePage.requestLeave(action) : (action(), true),
    dispose: () => activePage?.dispose(),
    updateLayout: () => activePage?.updateLayout(),
    preserveForRender: () => activePage?.preserveForRender(),
    sheet,
    print,
    hasPendingChanges: () => pendingChanges() || F.state().state === "busy",
  };
})(globalThis);
