async function discardDrafts() {
  if (!drafts.size) return;
  if (
    !confirm(
      "ویرایش‌های ثبت‌نشده کنار گذاشته شوند؟ داده‌های ذخیره‌شده تغییر نمی‌کنند.",
    )
  )
    return;
  const previous = [...drafts];
  drafts.clear();
  clearTimeout(draftTimer);
  try {
    await storeDrafts();
  } catch (error) {
    for (const [key, value] of previous) drafts.set(key, value);
    await storeDrafts().catch(() => {});
    throw error;
  }
  db = (await readWorkspace(workspace.id)).data;
  setStatus("ویرایش‌های ثبت‌نشده لغو شدند.", "saved");
  render();
}

function reviewDrafts() {
  const items = [...drafts.values()].filter((x) => x.review);
  showModal(
    "بررسی پیش‌نویس پس از تعارض",
    '<div class="draft-review"><header class="draft-review-heading"><span class="draft-review-count">' +
      items.length.toLocaleString("fa-IR") +
      ' پیش‌نویس نیازمند بررسی</span><p>این ورودی‌ها پیش از تغییر داده در تب دیگر نوشته شده‌اند و خودکار اعمال نمی‌شوند. مقدار ثبت‌شده جدید و ویرایش خود را بررسی کنید.</p></header><div class="table-scroll draft-review-table"><table><thead><tr><th>هنرجو، درس و بخش</th><th>ثبت‌شده جدید</th><th>ویرایش شما</th></tr></thead><tbody>' +
      items
        .map((item) => {
          const c = findClass(item.classId),
            l = getLessonObj(c, item.lid),
            st = getStudentObj(c, item.sid);
          const pod = l?.poudmans?.find((p) => p.id === item.pid);
          const source =
            item.kind === "k"
              ? ownScoreRecord(l?.kardaneshScores, item.sid)
              : item.kind === "pod"
                ? ownScoreRecord(pod?.podScores, item.sid)
                : ownScoreRecord(
                    pod?.units.find((u) => u.id === item.uid)?.unitScores,
                    item.sid,
                  );
          const fieldLabel =
            {
              practical: "عملی",
              theory: "نظری",
              midtermPractical: "عملی میان‌ترم",
              midtermTheory: "نظری میان‌ترم",
              m: "مستمر",
              p: "پایانی",
              c: "شایستگی",
            }[item.field] || item.field;
          const description = [
            c?.name,
            st?.name || item.sid,
            l?.name || item.lid,
            item.kind === "pod" ? pod?.name : "",
            fieldLabel,
          ]
            .filter(Boolean)
            .join(" / ");
          return (
            "<tr><td>" +
            esc(description) +
            '</td><td class="draft-review-current"><strong dir="auto">' +
            esc(source?.[item.field] ?? "—") +
            '</strong></td><td class="draft-review-proposed"><strong dir="auto">' +
            esc(item.remove ? "حذف نمره" : item.value) +
            "</strong></td></tr>"
          );
        })
        .join("") +
      '</tbody></table></div><div class="draft-review-actions"><button data-workspace-action="approve-drafts">ورودی‌ها را بررسی کرده‌ام؛ اعمال شوند</button><button class="ghost" data-workspace-action="discard-drafts">لغو این ویرایش‌ها</button></div></div>',
  );
}

async function approveDrafts() {
  if (blocked)
    throw Error("ابتدا صفحه را دوباره بارگذاری کنید تا داده جدید خوانده شود.");
  for (const item of drafts.values())
    if (item.review) {
      item.review = false;
      item.baseRevision = workspace.revision;
      item.error = "";
    }
  await storeDrafts();
  await flushDrafts({ strict: true });
  closeModal();
  render();
}
