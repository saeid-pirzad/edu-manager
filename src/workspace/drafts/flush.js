async function flushDrafts({ strict = false } = {}) {
  if (resetBusy || connectionRetired)
    throw Error("ثبت هنگام پاک‌سازی یا تغییر بانک متوقف است.");
  clearTimeout(draftTimer);
  if (flushing) {
    await flushing;
    if (strict && drafts.size)
      throw Error("نمره ذخیره‌نشده یا نامعتبر وجود دارد.");
    return;
  }
  const invalid = [...drafts.values()].filter(
    (x) => !x.remove && !parseDraft(x).ok,
  );
  if (strict && [...drafts.values()].some((x) => x.review))
    throw Error("پیش‌نویس تعارض نیازمند بررسی و تأیید است.");
  if (strict && invalid.length)
    throw Error(
      "ابتدا ورودی نامعتبر یا خالی را اصلاح کنید یا با دکمه پاک‌کردن حذف کنید.",
    );
  const entries = [...drafts.entries()].filter(
    ([, x]) => !x.review && (x.remove || parseDraft(x).ok),
  );
  if (!entries.length) return;
  flushing = (async () => {
    const groups = new Map();
    for (const [key, item] of entries) {
      if (!groups.has(item.classId)) groups.set(item.classId, []);
      groups.get(item.classId).push([key, item]);
    }
    for (const [classId, items] of groups) {
      const c = findClass(classId);
      if (!c) throw Error("کلاس پیش‌نویس موجود نیست.");
      for (const [, item] of items) {
        const l = getLessonObj(c, item.lid);
        if (!l || !c.students.some((st) => st.id === item.sid))
          throw Error("دانش‌آموز یا درس پیش‌نویس فعال نیست.");
        let target;
        if (item.kind === "k") {
          if (
            l.gradeMode !== "kardanesh" ||
            ![
              "practical",
              "theory",
              "midtermPractical",
              "midtermTheory",
            ].includes(item.field)
          )
            throw Error("نوع نمره معتبر نیست.");
          target = writableScoreRecord(
            l.kardaneshScores || (l.kardaneshScores = {}),
            item.sid,
          );
          l.kardaneshScores[item.sid] = target;
        } else if (item.kind === "pod") {
          const pod = l.poudmans.find((p) => p.id === item.pid);
          if (
            !pod ||
            l.gradingPolicy?.method !== "modular" ||
            !["m", "c"].includes(item.field)
          )
            throw Error("پودمان یا نوع نمره نامعتبر است.");
          pod.podScores = pod.podScores || {};
          target = writableScoreRecord(pod.podScores, item.sid);
          pod.podScores[item.sid] = target;
        } else {
          if (l.gradingPolicy)
            throw Error("نمرات رسمی را در فرم قواعد درس ثبت کنید.");
          if (!["m", "p"].includes(item.field))
            throw Error("نوع نمره واحد نامعتبر است.");
          const unit = l.poudmans
            .find((p) => p.id === item.pid)
            ?.units.find((u) => u.id === item.uid);
          if (!unit) throw Error("واحد پیش‌نویس موجود نیست.");
          target = writableScoreRecord(
            unit.unitScores || (unit.unitScores = {}),
            item.sid,
          );
          unit.unitScores[item.sid] = target;
        }
        if (item.remove) delete target[item.field];
        else {
          const parsed = parseDraft(item);
          if (!parsed.ok) throw Error(parsed.message);
          target[item.field] = parsed.value;
        }
      }
      await saveDBV24({ classId, action: "ثبت نمره (" + c.name + ")" });
      for (const [key, item] of items)
        if (drafts.get(key) === item) drafts.delete(key);
      await storeDrafts();
    }
    if (!drafts.size) setStatus("همه نمرات ذخیره شدند.", "saved");
    else
      setStatus(
        "برخی ورودی‌ها هنوز ذخیره نشده‌اند؛ پیام کنار کادر را بررسی کنید.",
        "error",
      );
    refreshGradeResults();
    if (!document.activeElement?.matches?.("[data-grade]")) render();
  })()
    .catch(async (error) => {
      try {
        db = (await readWorkspace(workspace.id)).data;
      } catch (ignore) {}
      for (const [key] of entries) {
        const item = drafts.get(key);
        if (item) {
          item.error = "ذخیره نشد: " + error.message;
          if (blocked) item.review = true;
        }
      }
      await storeDrafts();
      setStatus(
        "نمرات ذخیره نشدند؛ پیش‌نویس محفوظ است. " + error.message,
        "error",
      );
      render();
      throw error;
    })
    .finally(() => {
      flushing = null;
    });
  await flushing;
  if (drafts.size && [...drafts.values()].some((x) => !x.error && !x.review))
    draftTimer = setTimeout(() => flushDrafts().catch(() => {}), 180);
}

async function recoverDrafts() {
  if (!drafts.size) return;
  if ([...drafts.values()].some((x) => x.review)) {
    setStatus(
      "پیش‌نویس تعارض خودکار اعمال نشد؛ دکمه بررسی پیش‌نویس را بزنید.",
      "error",
    );
    applyDrafts();
    return;
  }
  setStatus("پیش‌نویس ویرایش قبلی بازیابی شد.", "pending");
  applyDrafts();
  if (!db.settings.password || isAuthenticated)
    await flushDrafts().catch(() => {});
}
