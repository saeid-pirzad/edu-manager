async function showHistoryEvent(id, limit = 100) {
  const event = await readRecord("events", Number(id));
  if (!event || event.workspace !== workspace.id)
    throw Error("رویداد پیدا نشد.");
  const display = (value) => {
    const text = JSON.stringify(value);
    return text && text.length > 1500
      ? text.slice(0, 1500) + "… (نسخه کامل در فایل جزئیات)"
      : text;
  };
  showModal(
    event.action,
    '<div class="history-detail"><header class="history-detail-heading"><p>' +
      esc(new Date(event.at).toLocaleString("fa-IR")) +
      " · " +
      event.changes.length +
      ' تغییر</p><button class="ghost" data-workspace-action="download-event" data-key="' +
      esc(event.id) +
      '">دریافت جزئیات کامل</button></header><div class="table-scroll history-diff"><table><thead><tr><th>بخش</th><th>قبل</th><th>بعد</th></tr></thead><tbody>' +
      event.changes
        .slice(0, limit)
        .map(
          (change) =>
            "<tr><td>" +
            esc(changeLabel(change.path)) +
            '</td><td><pre dir="auto">' +
            esc(display(change.before)) +
            '</pre></td><td><pre dir="auto">' +
            esc(display(change.after)) +
            "</pre></td></tr>",
        )
        .join("") +
      "</tbody></table></div>" +
      (event.changes.length > limit
        ? '<button data-workspace-action="history-event" data-key="' +
          esc(event.id) +
          '" data-limit="' +
          (limit + 100) +
          '">نمایش تغییرهای بیشتر</button>'
        : "") +
      "</div>",
  );
}

async function downloadHistoryEvent(id) {
  const event = await readRecord("events", Number(id));
  if (event?.workspace === workspace.id)
    downloadJSON(event, "تاریخچه-" + event.id + ".json");
}

function changeLabel(path) {
  const fields = {
    midtermPractical: "عملی میان‌ترم",
    midtermTheory: "تئوری میان‌ترم",
    practical: "عملی",
    theory: "تئوری",
    final: "نهایی",
    passed: "قبولی",
    c: "شایستگی",
    gate: "معیارهای الزامی",
    gradingPolicy: "قواعد ابلاغیه",
    podScores: "نمرات پودمان",
    m: "مستمر",
    p: "پایانی",
    name: "نام",
    code: "کد",
    date: "تاریخ",
    period: "زنگ",
    poudmanId: "پودمان",
    unitId: "واحد",
    attendance: "حضور و غیاب",
    password: "رمز ورود",
    academicYear: "سال تحصیلی",
    academicTerm: "نوبت",
    masterSchedule: "برنامه هفتگی",
  };
  const pieces = path.split("."),
    record = pieces.shift();
  let label =
    record === "meta"
      ? "تنظیمات"
      : record.startsWith("class:")
        ? findClass(record.slice(6))?.name || "کلاس حذف‌شده"
        : record.startsWith("session:")
          ? "جلسه " +
            (faDate(getSessionById(record.slice(8))?.date) || "حذف‌شده")
          : "اطلاعات";
  let c = record.startsWith("class:")
    ? findClass(record.slice(6))
    : findClass(getSessionById(record.slice(8))?.classId);
  for (let i = 0; i < pieces.length; i++) {
    const key = pieces[i];
    if (key === "lessons" && c) {
      const l = c.lessons[Number(pieces[++i])];
      if (l) label += " / " + l.name;
      continue;
    }
    if (
      ["kardaneshScores", "unitScores", "podScores", "attendance"].includes(key)
    ) {
      const sid = pieces[++i];
      label += " / " + (getStudentObj(c, sid)?.name || "دانش‌آموز");
      continue;
    }
    if (fields[key]) label += " / " + fields[key];
  }
  return label;
}

async function openHistoryV24(limit = 50) {
  return openHistory(limit);
}

function renderHistory(events, undo, limit) {
  showModal(
    "تاریخچه تغییرات",
    '<div class="history-hub"><p class="history-intro">زمان و مقادیر قبل و بعد هر تغییر ثبت می‌شوند.</p>' +
      (undo
        ? '<button data-mutating="1" data-workspace-action="undo">بازگردانی آخرین تغییر: ' +
          esc(undo.action) +
          "</button>"
        : "") +
      '<div class="history-list">' +
      (!events.length
        ? '<div class="history-empty">هنوز تغییری برای این دوره ثبت نشده است.</div>'
        : "") +
      events
        .slice(0, limit)
        .map(
          (e) =>
            '<article class="history-entry"><div class="history-entry-info"><h4>' +
            esc(e.action) +
            '</h4><div class="history-entry-meta"><time datetime="' +
            esc(e.at) +
            '">' +
            esc(new Date(e.at).toLocaleString("fa-IR")) +
            '</time><span class="history-count">' +
            e.changes.length +
            ' تغییر</span></div></div><button class="ghost" data-workspace-action="history-event" data-key="' +
            esc(e.id) +
            '">جزئیات</button></article>',
        )
        .join("") +
      "</div>" +
      (events.length > limit
        ? '<button data-workspace-action="history-more" data-limit="' +
          (limit + 50) +
          '">نمایش موارد بیشتر</button>'
        : "") +
      "</div>",
  );
}
