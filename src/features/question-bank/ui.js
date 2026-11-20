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
  function renderPager(pager, page, pageCount, goToPage) {
    pager.replaceChildren();
    pager.classList.add("qb-numbered-pager");
    button("قبلی", () => goToPage(page - 1), pager).disabled = page === 0;
    const pages = el("div", undefined, "qb-page-numbers");
    pager.append(pages);
    const startPage = Math.max(0, Math.min(page - 1, pageCount - 3));
    for (
      let target = startPage;
      target < Math.min(pageCount, startPage + 3);
      target++
    ) {
      const item = button(number(target + 1), () => goToPage(target), pages);
      item.dataset.uiTone = "navigate";
      item.setAttribute("aria-label", `صفحه ${number(target + 1)}`);
      if (target === page) {
        item.setAttribute("aria-current", "page");
        item.dataset.uiVariant = "solid";
      }
    }
    button("بعدی", () => goToPage(page + 1), pager).disabled =
      page === pageCount - 1;
    const status = el(
      "span",
      `صفحه ${number(page + 1)} از ${number(pageCount)}`,
      "qb-page-status",
    );
    status.setAttribute("role", "status");
    pager.append(status);
    pager.hidden = pageCount <= 1;
  }
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
  let numberFormatter, dateFormatter;
  const number = (value) =>
    (numberFormatter ||= new Intl.NumberFormat("fa-IR", {
      maximumFractionDigits: 2,
    })).format(value);
  const letters = ["الف", "ب", "ج", "د"];
  const dateLabel = (date) =>
    (dateFormatter ||= new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "long",
      timeZone: "UTC",
    })).format(new Date(date));
  function questionSearch(questions, unitMap) {
    // This index belongs to one render; committed edits and restores rebuild it.
    const scoped = questions.filter((q) => unitMap.has(q.unitId));
    const normalized = new Map();
    let previous;
    return (unitId, type, value) => {
      const query = D.searchText(value);
      if (
        previous &&
        previous.unitId === unitId &&
        previous.type === type &&
        previous.query === query
      )
        return previous.list;
      const list = scoped.filter((q) => {
        if ((unitId && q.unitId !== unitId) || (type && q.type !== type))
          return false;
        if (!query) return true;
        if (!normalized.has(q)) normalized.set(q, D.searchText(q.text));
        return normalized.get(q).includes(query);
      });
      previous = { unitId, type, query, list };
      return list;
    };
  }
  function questionCountsByUnit(questions, units) {
    const types = Object.keys(D.types);
    const counts = new Map(
      units.map((unit) => [
        unit.id,
        {
          total: 0,
          types: Object.fromEntries(types.map((type) => [type, 0])),
        },
      ]),
    );
    for (const question of questions) {
      const unit = counts.get(question.unitId);
      if (!unit) continue;
      unit.total++;
      unit.types[question.type]++;
    }
    return counts;
  }
  function fitOptions(container) {
    const doc = container.ownerDocument;
    const context = doc.createElement("canvas").getContext("2d");
    if (!context) return;
    for (const list of container.querySelectorAll(
      ".qb-options,.qb-sheet-options,.qb-import-options",
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
      const gap = parseFloat(style.columnGap) || 0;
      list.dataset.columns =
        list.dataset.multiline === "true" ||
        [...list.children].some(
          (item) =>
            /[\r\n]/.test(item.textContent) ||
            item.querySelectorAll(".qb-sheet-line,.qb-import-line").length > 1,
        ) ||
        required > (list.clientWidth - gap) / 2
          ? "1"
          : required <= (list.clientWidth - 3 * gap) / 4
            ? "4"
            : "2";
    }
  }
  const { sheet, print, previewText } = root.EduQuestionBankPaperUI.create({
    el,
    number,
    dateLabel,
    letters,
    fitOptions,
  });
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
    let persistentMessage = "",
      persistentMessageOrigin = "",
      transientMessage = "";
    const tabScopes = savedView?.tabScopes || {
      questions: { courseId: "", unitId: "" },
      builder: { courseId: null, unitId: "" },
    };
    let bank,
      courseId = savedView?.courseId || "",
      unitId = savedView?.unitId || "",
      tab = ["questions", "builder", "exams"].includes(savedView?.tab)
        ? savedView.tab
        : "questions",
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
      refreshSequence = 0;
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
      const cancel = (accepted = false) => {
        if (confirmation !== box) return false;
        box.remove();
        confirmation = null;
        cancelConfirmation = () => {};
        content.inert = contentWasInert;
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
    pageRoot.append(header, message, content);
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
    async function commit(next, { isCurrent = () => true } = {}) {
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
        if (!alive) return false;
        bank = await R.save(next, bank.revision, {
          isCurrent: () => alive && pageRoot.isConnected && isCurrent(),
        });
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
    const viewState = {
      get bank() {
        return bank;
      },
      get courseId() {
        return courseId;
      },
      set courseId(value) {
        courseId = value;
      },
      get unitId() {
        return unitId;
      },
      set unitId(value) {
        unitId = value;
      },
      get tab() {
        return tab;
      },
      set tab(value) {
        tab = value;
      },
      get search() {
        return search;
      },
      set search(value) {
        search = value;
      },
      get questionType() {
        return questionType;
      },
      set questionType(value) {
        questionType = value;
      },
      get page() {
        return page;
      },
      set page(value) {
        page = value;
      },
      get dirty() {
        return dirty;
      },
      set dirty(value) {
        dirty = value;
      },
      get alive() {
        return alive;
      },
      get busy() {
        return busy;
      },
      get confirmation() {
        return confirmation;
      },
    };
    const {
      form,
      saveButton,
      entityMenu,
      removeCourse,
      removeUnit,
      manageCourse,
      manageUnit,
      editQuestion,
      importQuestions,
    } = root.EduQuestionBankFormsUI.create({
      state: viewState,
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
    });
    const { builder } = root.EduQuestionBankBuilderUI.create({
      state: viewState,
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
    });
    function unitLabel() {
      return bank.courses.find((c) => c.id === courseId)?.structure === "module"
        ? "پودمان"
        : "فصل";
    }
    function questions(parent) {
      const units = bank.units.filter((u) => u.courseId === courseId);
      const unitMap = new Map(units.map((unit) => [unit.id, unit]));
      const searchQuestions = questionSearch(bank.questions, unitMap);
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
      const entryActions = el("div", undefined, "qb-question-entry-actions");
      entry.append(entryActions);
      const add = button("افزودن سؤال", () => editQuestion(), entryActions);
      add.classList.add("qb-add-question");
      add.disabled = !unitId;
      const bulk = button("ورود از اکسل", importQuestions, entryActions);
      bulk.classList.add("qb-import-entry");
      bulk.dataset.uiTone = "excel";
      bulk.insertAdjacentHTML("afterbegin", root.EduIcons.html("upload"));
      bulk.disabled = !unitId;
      bulk.title = unitId
        ? "ورود سؤال‌ها از الگوی اکسل به بخش انتخاب‌شده"
        : `ابتدا یک ${unitLabel()} انتخاب کنید`;
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
      const pageSize = 10;
      library.append(results, pager);
      function draw() {
        results.replaceChildren();
        pager.replaceChildren();
        const list = searchQuestions(unitId, questionType, search);
        const pageCount = Math.max(1, Math.ceil(list.length / pageSize));
        page = Math.max(0, Math.min(page, pageCount - 1));
        count.textContent = `${number(list.length)} سؤال`;
        range.textContent = list.length
          ? `نمایش ${number(page * pageSize + 1)} تا ${number(Math.min((page + 1) * pageSize, list.length))} از سؤال‌های این محدوده`
          : "سؤال‌های این درس را اینجا مدیریت کنید.";
        list
          .slice(page * pageSize, (page + 1) * pageSize)
          .forEach((q, index) => {
            const card = el(
              "details",
              undefined,
              "qb-question qb-question-row",
            );
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
              el(
                "span",
                number(page * pageSize + index + 1),
                "qb-question-number",
              ),
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
        const goToPage = (target) => {
          page = target;
          draw();
          results.focus({ preventScroll: true });
          results.scrollIntoView({ block: "start", behavior: "instant" });
        };
        renderPager(pager, page, pageCount, goToPage);
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
      const word = button(
        "دریافت Word بدون سربرگ",
        () => {
          try {
            root.EduQuestionBankSchoolWord.download(exam);
          } catch (failure) {
            error(failure);
          }
        },
        actions,
      );
      word.dataset.qbSchoolWord = "";
      word.dataset.uiTone = "copy";
      word.title =
        "فایل Word قابل‌ویرایش؛ فقط سؤال‌ها و بارم، بدون سربرگ و پاسخ صحیح";
      content.append(sheet(exam));
      root.scrollTo({ top: 0, left: 0, behavior: "instant" });
      updateLayout();
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
      const pageSize = 10;
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
        const pageCount = Math.max(1, Math.ceil(list.length / pageSize));
        archivePage = Math.max(0, Math.min(archivePage, pageCount - 1));
        count.textContent = `${number(list.length)} آزمون${query || courseFilter.value ? ` از ${number(bank.exams.length)}` : ""}`;
        for (const exam of list.slice(
          archivePage * pageSize,
          (archivePage + 1) * pageSize,
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
        renderPager(pager, archivePage, pageCount, (target) => {
          archivePage = target;
          draw();
          results.focus({ preventScroll: true });
          results.scrollIntoView({ block: "start", behavior: "instant" });
        });
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
      content.replaceChildren();
      dirty = false;
      const tabs = el("nav", undefined, "tabs qb-actions qb-tabs");
      tabs.setAttribute("aria-label", "بخش‌های بانک سؤال و طراحی آزمون");
      content.append(tabs);
      for (const [id, label] of [
        ["questions", "بانک سؤال"],
        ["builder", "طراحی آزمون"],
        ["exams", "آزمون‌های من"],
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
          [
            [
              "افزودن نمونهٔ یازدهم شبکه و نرم‌افزار",
              () =>
                discard(() =>
                  confirmAction(
                    "۲ درس، ۲۴ سؤال تألیفی و ۴ آزمون آزمایشی اضافه شوند؟ اطلاعات موجود حفظ می‌شود. این نمونه‌ها محتوای رسمی کتاب درسی نیستند و در پشتیبان بانک سؤال نیز ذخیره خواهند شد.",
                    async () => {
                      try {
                        const next = root.EduQuestionBankSample.addTo(bank);
                        if (await commit(next)) {
                          courseId = "net11-web";
                          unitId = "";
                          tab = "questions";
                          page = 0;
                          render();
                        }
                      } catch (e) {
                        error(e);
                      }
                    },
                  ),
                ),
              false,
            ],
          ],
        );
      }
      if (tab === "exams") {
        exams(panel);
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
    async function refreshAfterRestore() {
      if (!alive) return false;
      const refuse = () => {
        error(
          Error(
            "بانک سؤال از فایل بازیابی شده است؛ فرم ذخیره‌نشدهٔ شما دست‌نخورده ماند. پیش از ثبت، تغییر اطلاعات را بررسی کنید.",
          ),
          true,
        );
        return false;
      };
      if (dirty || busy || confirmation) return refuse();
      const sequence = ++refreshSequence;
      const current = await R.read();
      if (!alive || sequence !== refreshSequence) return false;
      if (dirty || busy || confirmation) return refuse();
      bank = D.validate(current);
      courseId =
        unitId =
        search =
        questionType =
        archiveQuery =
        archiveCourse =
          "";
      page = archivePage = 0;
      Object.assign(tabScopes.questions, { courseId: "", unitId: "" });
      Object.assign(tabScopes.builder, {
        courseId: null,
        unitId: "",
        unitIds: [],
      });
      persistentMessage = persistentMessageOrigin = transientMessage = "";
      render();
      updateLayout();
      return true;
    }
    const controller = {
      element: pageRoot,
      ready: null,
      mount,
      preserveForRender,
      requestLeave,
      dispose,
      refreshAfterRestore,
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
    refreshAfterRestore: () =>
      activePage?.refreshAfterRestore() || Promise.resolve(true),
    sheet,
    print,
    previewText,
    hasPendingChanges: () => pendingChanges() || F.state().state === "busy",
  };
  root.addEventListener("edu-question-bank-restored", () => {
    savedView = null;
    const page = activePage;
    page?.refreshAfterRestore().catch(() => {});
  });
})(globalThis);
