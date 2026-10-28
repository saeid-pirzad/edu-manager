let printAuthorization = null;

function beforeReportPrint() {
  try {
    if (!printAuthorization || !document.getElementById("printRoot"))
      throw Error("برای چاپ معتبر، از دکمه «چاپ / PDF» گزارش استفاده کنید.");
    if (!fileMode) assertWorkspaceContext(printAuthorization);
    if (busy || drafts.size || draftWritesPending || draftRecoveryFailed)
      throw Error(
        "ثبت اطلاعات کامل نشده است؛ پس از ذخیره، گزارش را دوباره چاپ کنید.",
      );
    return;
  } catch (error) {
    printAuthorization = null;
    document.getElementById("printRoot")?.remove();
    const root = document.createElement("div");
    root.id = "printRoot";
    root.textContent = "چاپ انجام نشد: " + error.message;
    document.body.append(root);
  }
}

function preparePrint(button) {
  printAuthorization = null;
  document.getElementById("printRoot")?.remove();
  const modal = document.getElementById("modal"),
    isModal = button
      ? button.closest("#modal")
      : !modal.classList.contains("hidden");
  let source = isModal
    ? document.getElementById("modalBody")
    : button?.closest(
        ".report-document,#karnamehTabOutput,#lessonReportTabOutput,#lessonReportOutput,#globalReportOutput,#periodicReportOutput",
      ) ||
      button?.closest(".card") ||
      document.getElementById("karnamehTabOutput") ||
      document.getElementById("lessonReportTabOutput") ||
      document.getElementById("lessonReportOutput") ||
      document.getElementById("globalReportOutput") ||
      document.getElementById("periodicReportOutput") ||
      document.getElementById("app");
  if (!source) throw Error("گزارشی برای چاپ انتخاب نشده است.");
  const copy = source.cloneNode(true);
  copy
    .querySelectorAll("button,.no-print,form,script,select")
    .forEach((x) => x.remove());
  copy.querySelectorAll("input,textarea").forEach((input) => {
    const span = document.createElement("span");
    span.textContent =
      input.type === "checkbox" ? (input.checked ? "بله" : "خیر") : input.value;
    input.replaceWith(span);
  });
  copy.querySelectorAll("*").forEach((el) => {
    for (const attr of [...el.attributes])
      if (attr.name.startsWith("on") || attr.name === "id")
        el.removeAttribute(attr.name);
    el.style.removeProperty("overflow");
    el.style.removeProperty("overflow-x");
    el.style.removeProperty("overflow-y");
    el.style.removeProperty("max-height");
    el.style.removeProperty("height");
  });
  const root = document.createElement("div");
  root.id = "printRoot";
  root.innerHTML =
    "<header><h1>گزارش مدرسه</h1><p>" +
    esc(workspace.year + " / " + workspace.term) +
    " · " +
    esc(new Date().toLocaleString("fa-IR")) +
    "</p></header>";
  root.append(copy);
  document.body.append(root);
  const columns = Math.max(
    0,
    ...[...copy.querySelectorAll("tr")].map((tr) =>
      [...tr.children].reduce(
        (sum, cell) => sum + (Number(cell.colSpan) || 1),
        0,
      ),
    ),
  );
  document.getElementById("printPageStyle")?.remove();
  const style = document.createElement("style");
  style.id = "printPageStyle";
  style.textContent =
    "@page { size: A4 " +
    (columns > 8 ? "landscape" : "portrait") +
    "; margin: 12mm; }";
  document.head.append(style);
  return root;
}

async function printReport(button, { context, validate } = {}) {
  try {
    const expected = context || captureWorkspaceContext();
    await flushDrafts({ strict: true });
    await writer.catch(() => {});
    if (!fileMode) await assertReportSnapshot(expected);
    if (validate && !validate())
      throw Error(
        "محدوده یا متن گزارش تغییر کرده است؛ گزارش را دوباره تهیه کنید.",
      );
    preparePrint(button);
    printAuthorization = expected;
    if (!globalThis.__EDU_PRINT_TEST__) window.print();
    return true;
  } catch (error) {
    if (context) throw error;
    handleError(error);
    return false;
  }
}
