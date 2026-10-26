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
    "<p>" +
      esc(new Date(event.at).toLocaleString("fa-IR")) +
      " · " +
      event.changes.length +
      ' تغییر</p><button class="ghost" data-workspace-action="download-event" data-key="' +
      esc(event.id) +
      '">دریافت جزئیات کامل</button><table><thead><tr><th>بخش</th><th>قبل</th><th>بعد</th></tr></thead><tbody>' +
      event.changes
        .slice(0, limit)
        .map(
          (change) =>
            "<tr><td>" +
            esc(changeLabel(change.path)) +
            "</td><td>" +
            esc(display(change.before)) +
            "</td><td>" +
            esc(display(change.after)) +
            "</td></tr>",
        )
        .join("") +
      "</tbody></table>" +
      (event.changes.length > limit
        ? '<button data-workspace-action="history-event" data-key="' +
          esc(event.id) +
          '" data-limit="' +
          (limit + 100) +
          '">نمایش تغییرهای بیشتر</button>'
        : ""),
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
  await writer.catch(() => {});
  const events = await new Promise((resolve, reject) => {
    const tx = connection.transaction("events", "readonly"),
      request = tx
        .objectStore("events")
        .index("workspace")
        .openCursor(IDBKeyRange.only(workspace.id), "prev"),
      rows = [];
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor && rows.length < limit + 1) {
        rows.push(cursor.value);
        cursor.continue();
      } else resolve(rows);
    };
  });
  const undo = await readRecord("undo", workspace.id);
  showModal(
    "تاریخچه تغییرات",
    "<p>زمان و مقادیر قبل و بعد هر تغییر ثبت می‌شوند.</p>" +
      (undo
        ? '<button data-mutating="1" data-workspace-action="undo">بازگردانی آخرین تغییر: ' +
          esc(undo.action) +
          "</button>"
        : "") +
      events
        .slice(0, limit)
        .map(
          (e) =>
            '<div class="row"><span>' +
            esc(new Date(e.at).toLocaleString("fa-IR") + " — " + e.action) +
            " · " +
            e.changes.length +
            ' تغییر</span><button class="ghost" data-workspace-action="history-event" data-key="' +
            esc(e.id) +
            '">جزئیات</button></div>',
        )
        .join("") +
      (events.length > limit
        ? '<button data-workspace-action="history-more" data-limit="' +
          (limit + 50) +
          '">نمایش موارد بیشتر</button>'
        : ""),
  );
}
