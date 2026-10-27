function gradeCell(
  c,
  l,
  st,
  field,
  { kind = "k", pid = "", uid: unitId = "", value = null } = {},
) {
  const d = {
      kind,
      classId: c.id,
      lid: l.id,
      sid: st.id,
      pid,
      uid: unitId,
      field,
    },
    key = inputKey(d),
    draft = drafts.get(key),
    shown = draft ? draft.value : (value ?? "");
  return (
    '<div class="grade-editor"><input type="text" inputmode="decimal" autocomplete="off" dir="ltr" data-grade="1" data-kind="' +
    esc(kind) +
    '" data-class="' +
    esc(c.id) +
    '" data-lesson="' +
    esc(l.id) +
    '" data-student="' +
    esc(st.id) +
    '" data-pod="' +
    esc(pid) +
    '" data-unit="' +
    esc(unitId) +
    '" data-field="' +
    esc(field) +
    '" value="' +
    esc(shown) +
    '" placeholder="—" aria-label="' +
    esc(
      st.name +
        " " +
        (field === "practical" || field === "midtermPractical"
          ? "عملی"
          : field === "theory" || field === "midtermTheory"
            ? "تئوری"
            : field === "c"
              ? "شایستگی"
              : field === "m"
                ? "مستمر"
                : "پایانی"),
    ) +
    '"><button type="button" class="ghost grade-clear no-print" data-clear-grade aria-label="پاک‌کردن نمره" title="پاک‌کردن نمره">×</button><small class="grade-note" aria-live="polite">' +
    esc(draft ? draft.error || "در انتظار ذخیره" : "") +
    "</small></div>"
  );
}

function applyDrafts() {
  document.querySelectorAll("[data-grade]").forEach((input) => {
    const item = drafts.get(inputKey(contextFromInput(input)));
    if (item) {
      input.value = item.value;
      input.setAttribute("aria-invalid", item.error ? "true" : "false");
      const note = input.parentElement.querySelector(".grade-note");
      if (note) {
        note.textContent = item.error || "در انتظار ذخیره";
        note.dataset.state = item.error ? "error" : "pending";
      }
    }
  });
}
