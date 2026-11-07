// Session mutations keep the open form and edit lease intact. These view-only
// helpers never authorize a write and only accept the current live session.
const sessionActivityViews = new WeakMap();

function liveSessionWorkspace(session) {
  const root = document.querySelector("#modalBody .session-workspace"),
    modal = document.getElementById("modal");
  return session &&
    session.id === currentSessionId &&
    getSessionById(session.id) === session &&
    root?.isConnected &&
    root.dataset.sessionId === session.id &&
    modal &&
    !modal.classList.contains("hidden")
    ? root
    : null;
}

function captureSessionControlFocus(session) {
  const root = liveSessionWorkspace(session),
    control = document.activeElement;
  if (
    !root ||
    !root.contains(control) ||
    !control.matches("input,select,textarea")
  )
    return () => false;
  const id = session.id,
    selection = {
      start: control.selectionStart,
      end: control.selectionEnd,
      direction: control.selectionDirection,
    };
  return () => {
    if (
      liveSessionWorkspace(getSessionById(id)) !== root ||
      !control.isConnected ||
      !root.contains(control) ||
      control.disabled ||
      control.closest("[hidden]") ||
      (document.activeElement !== document.body &&
        document.activeElement !== control)
    )
      return false;
    control.focus({ preventScroll: true });
    if (Number.isInteger(selection.start) && Number.isInteger(selection.end)) {
      try {
        control.setSelectionRange(
          selection.start,
          selection.end,
          selection.direction,
        );
      } catch {
        // Date/number controls may not support restoring a text selection.
      }
    }
    return true;
  };
}

function refreshSessionAttendanceRows(session) {
  const root = liveSessionWorkspace(session);
  if (!root) return false;
  for (const group of root.querySelectorAll(".att-btns[data-sid]")) {
    const status = session.attendance[group.dataset.sid] || "";
    for (const button of group.querySelectorAll("button")) {
      const kind = ["present", "late", "leave", "absent"].find((name) =>
        button.classList.contains(name),
      );
      if (!kind) continue;
      const active =
          kind === "late" ? status.startsWith("late") : status === kind,
        pressed = String(active);
      if (button.classList.contains("active") !== active)
        button.classList.toggle("active", active);
      if (button.getAttribute("aria-pressed") !== pressed)
        button.setAttribute("aria-pressed", pressed);
      if (kind === "late") {
        const hasMinutes = active && status.includes(":"),
          minutes = hasMinutes ? Number(status.split(":")[1]) : 0,
          text = "تأخیر" + (hasMinutes ? " (" + minutes + "د)" : "");
        if (button.textContent.trim() !== text) button.textContent = text;
      }
    }
  }
  refreshSessionAttendanceProgress();
  return true;
}

function sessionActivityRowHtml(session, classroom, score, index) {
  const student = sessionStudent(classroom, session, score.studentId);
  return `<tr><td>${esc(student ? student.name : "—")}</td>
        <td><span class="badge ${score.type}">${TYPE_LABELS[score.type]}</span></td>
        <td>${score.value}</td><td>${esc(score.note || "")}</td>
        <td><button type="button" class="danger" data-mutating="1" aria-label="حذف فعالیت ${esc(student?.name || "هنرجو")}" data-legacy-click="sessions-dialog:12" data-legacy-click-arg5="${esc(session.id)}" data-legacy-click-arg6="${esc(index)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg></button></td></tr>`;
}

function sessionActivityTableHtml(session, classroom) {
  return `<table class="karnameh-table session-score-table"><thead><tr><th>دانش‌آموز</th><th>نوع</th><th>مقدار</th><th>توضیح</th><th>عملیات</th></tr></thead><tbody>${session.scores.map((score, index) => sessionActivityRowHtml(session, classroom, score, index)).join("")}</tbody></table>`;
}

function sessionActivityRecordsHtml(session, classroom) {
  return (
    "<h4>فعالیت‌های ثبت‌شده</h4>" +
    (session.scores.length
      ? sessionActivityTableHtml(session, classroom)
      : '<div class="empty">امتیازی ثبت نشده</div>')
  );
}

function bindSessionActivityRecords(session) {
  const root = liveSessionWorkspace(session),
    records = root?.querySelector(".session-activity-records");
  if (!records) return false;
  const rows = [...records.querySelectorAll("tbody > tr")];
  if (rows.length !== session.scores.length) return false;
  sessionActivityViews.set(records, {
    root,
    session,
    scope: [session.id, session.schoolId, session.classId, session.lessonId],
    rows: new Map(session.scores.map((score, index) => [score, rows[index]])),
    snapshots: new Map(
      rows.map((row, index) => [row, JSON.stringify(session.scores[index])]),
    ),
  });
  return true;
}

function currentSessionActivityView(session) {
  const root = liveSessionWorkspace(session),
    records = root?.querySelector(".session-activity-records"),
    view = records && sessionActivityViews.get(records);
  if (
    !view ||
    view.root !== root ||
    view.scope.some(
      (value, index) =>
        value !==
        [session.id, session.schoolId, session.classId, session.lessonId][
          index
        ],
    )
  )
    return null;
  return { records, view };
}

function rebindSessionActivityView(view, session) {
  if (view.session === session) return true;
  // A failed save may reload durable data without replacing the open modal.
  // Rebind only an exact ordered snapshot; never infer identity by student name.
  const rows = [...view.rows.values()];
  if (
    rows.length !== session.scores.length ||
    rows.some(
      (row, index) =>
        view.snapshots.get(row) !== JSON.stringify(session.scores[index]),
    )
  )
    return false;
  view.session = session;
  view.rows = new Map(
    session.scores.map((score, index) => [score, rows[index]]),
  );
  return true;
}

function prepareSessionActivityRecords(session) {
  const current = currentSessionActivityView(session);
  return !!current && rebindSessionActivityView(current.view, session);
}

function sessionActivityControlMatches(control, session, index) {
  const current = currentSessionActivityView(session);
  if (
    !current ||
    !control?.isConnected ||
    !rebindSessionActivityView(current.view, session)
  )
    return false;
  const row = current.view.rows.get(session.scores[index]);
  return (
    !!row &&
    row.isConnected &&
    current.view.snapshots.get(row) === JSON.stringify(session.scores[index]) &&
    row.contains(control) &&
    control.closest("tr") === row &&
    current.records.contains(row)
  );
}

function refreshSessionActivityRecords(session) {
  const current = currentSessionActivityView(session);
  if (!current) return false;
  const { records, view } = current,
    classroom = getClassObj(session.schoolId, session.classId);
  if (!classroom) return false;
  if (!rebindSessionActivityView(view, session)) {
    // A legitimate rebound model that differs from the rendered snapshot needs
    // only its records region rebuilt; pending form inputs remain untouched.
    records.innerHTML = sessionActivityRecordsHtml(session, classroom);
    bindSessionActivityRecords(session);
  } else if (!session.scores.length) {
    if (view.rows.size) {
      records.innerHTML = sessionActivityRecordsHtml(session, classroom);
      bindSessionActivityRecords(session);
    }
  } else {
    let body = records.querySelector("tbody");
    if (!body) {
      records.innerHTML = sessionActivityRecordsHtml(session, classroom);
      bindSessionActivityRecords(session);
    } else {
      const desired = new Map(
          session.scores.map((score) => [score, JSON.stringify(score)]),
        ),
        nextRows = new Map(),
        nextSnapshots = new Map();
      // Remove obsolete rows before positioning survivors, so deleting one
      // record does not move every following row around the removed node.
      for (const [score, row] of view.rows)
        if (
          !desired.has(score) ||
          view.snapshots.get(row) !== desired.get(score)
        )
          row.remove();
      for (const [index, score] of session.scores.entries()) {
        const snapshot = desired.get(score);
        let row = view.rows.get(score);
        if (!row || view.snapshots.get(row) !== snapshot) {
          const template = document.createElement("template");
          template.innerHTML = sessionActivityRowHtml(
            session,
            classroom,
            score,
            index,
          );
          row = template.content.firstElementChild;
        }
        const position = body.children[index];
        if (position !== row) body.insertBefore(row, position || null);
        const remove = row.querySelector(
          '[data-legacy-click="sessions-dialog:12"]',
        );
        if (remove.dataset.legacyClickArg6 !== String(index))
          remove.dataset.legacyClickArg6 = String(index);
        nextRows.set(score, row);
        nextSnapshots.set(row, snapshot);
      }
      view.rows = nextRows;
      view.snapshots = nextSnapshots;
    }
  }
  return true;
}

function finishSessionActivitySave(
  form,
  { submitted, advance = false },
  focusOrigin = document.activeElement,
) {
  const names = ["studentId", "type", "value", "note"],
    root = form?.closest(".session-workspace"),
    session = root && getSessionById(root.dataset.sessionId);
  if (
    !form?.isConnected ||
    !submitted ||
    liveSessionWorkspace(session) !== root ||
    names.some((name) => form.elements[name].value !== submitted[name])
  )
    return false;
  form.elements.value.value = "";
  form.elements.note.value = "";
  if (advance) {
    const select = form.elements.studentId;
    select.value = select.options[select.selectedIndex + 1]?.value || "";
  }
  refreshSessionActivityInput(form);
  const cleared = names.map((name) => form.elements[name].value),
    focusAtCompletion = document.activeElement;
  setTimeout(() => {
    const active = document.activeElement;
    if (
      form.isConnected &&
      liveSessionWorkspace(session) === root &&
      root
        .querySelector('[data-session-tab="activity"]')
        ?.getAttribute("aria-pressed") === "true" &&
      !form.elements.value.disabled &&
      names.every(
        (name, index) => form.elements[name].value === cleared[index],
      ) &&
      active === focusAtCompletion &&
      (active === document.body ||
        active === form.elements.value ||
        (active === focusOrigin && root.contains(active)) ||
        active?.contains?.(form) ||
        (root.contains(active) && active.closest?.("[hidden]")))
    )
      form.elements.value.focus({ preventScroll: true });
  }, 0);
  return true;
}
