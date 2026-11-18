(function (root) {
  "use strict";

  // Presentation only: neither file handles nor a storage service belong here.
  // Both backup adapters supply their own actions and state to this one view.
  const escape = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (character) => {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[character];
    });
  function classes(...values) {
    return escape(
      [...new Set(values.flatMap((value) => String(value || "").split(/\s+/)))]
        .filter(Boolean)
        .join(" "),
    );
  }
  function idAttribute(value) {
    return value ? ' id="' + escape(value) + '"' : "";
  }
  function attributes(value) {
    return Object.entries(value || {})
      .filter(
        ([name, item]) =>
          /^(?:data-[\w-]+|aria-[\w-]+|id|title|name)$/.test(name) &&
          item !== null &&
          item !== undefined &&
          item !== false,
      )
      .map(([name, item]) => " " + name + '="' + escape(item) + '"')
      .join("");
  }
  function summaryHtml(options = {}) {
    const {
      name = "",
      savedAt,
      needsReview = false,
      detailed = false,
    } = options;
    if (detailed) {
      const state =
        options.supported === false
          ? "unsupported"
          : options.state ||
            (name ? (needsReview ? "paused" : "active") : "inactive");
      const labels = {
        inactive: "بدون اتصال",
        active: "متصل · ذخیرهٔ خودکار فعال",
        permission: "نیاز به تأیید مجوز",
        paused: "اتصال متوقف است",
        error: "خطا در ذخیره",
        busy: "در حال ذخیره",
        unsupported: "ذخیرهٔ خودکار پشتیبانی نمی‌شود",
      };
      const file = name
        ? '<bdi class="schools-file-name" dir="auto" title="' +
          escape(name) +
          '">' +
          escape(name) +
          "</bdi>"
        : "انتخاب نشده";
      let date;
      try {
        date = savedAt ? new Date(savedAt) : null;
      } catch {
        date = null;
      }
      const saved = date && Number.isFinite(date.getTime());
      const time = saved
        ? '<time datetime="' +
          escape(date.toISOString()) +
          '">' +
          escape(
            date.toLocaleString("fa-IR-u-ca-persian", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            }),
          ) +
          "</time>"
        : "هنوز ذخیره نشده";
      return (
        '<div class="backup-connection" data-state="' +
        escape(state) +
        '"><span>وضعیت اتصال</span><strong>' +
        escape(labels[state] || labels.error) +
        '</strong></div><dl class="backup-file-details"><div class="backup-file-name-row"><dt>نام فایل</dt><dd>' +
        file +
        '</dd></div><div><dt>نوع فایل</dt><dd><bdi dir="ltr">JSON</bdi> · ' +
        "فایل پشتیبان مستقل" +
        "</dd></div><div><dt>آخرین ذخیرهٔ موفق</dt><dd>" +
        time +
        "</dd></div></dl>"
      );
    }
    if (!name)
      return '<span class="schools-file-meta">فایل پشتیبان انتخاب نشده</span>';
    let date;
    try {
      date = savedAt ? new Date(savedAt) : null;
    } catch {
      date = null;
    }
    const saved = date && Number.isFinite(date.getTime());
    return (
      '<bdi class="schools-file-name" dir="auto" title="' +
      escape(name) +
      '">' +
      escape(name) +
      '</bdi><span class="schools-file-meta">' +
      (saved
        ? 'آخرین ذخیره: <time datetime="' +
          escape(date.toISOString()) +
          '">' +
          escape(
            date.toLocaleString("fa-IR-u-ca-persian", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            }),
          ) +
          "</time>"
        : "هنوز ذخیره نشده") +
      (needsReview ? " · نیاز به بررسی" : "") +
      "</span>"
    );
  }
  function noticeHtml({
    purpose = "",
    name = "",
    message = "",
    permission = null,
  } = {}) {
    return (
      '<span class="single-file-message" role="status">' +
      '<strong class="backup-file-purpose">' +
      escape(purpose) +
      "</strong>" +
      (name
        ? '<bdi class="backup-notice-filename" dir="ltr">' +
          escape(name) +
          "</bdi>"
        : "") +
      '<span class="backup-file-detail">' +
      escape(message) +
      "</span></span>" +
      (permission
        ? '<button type="button" class="single-file-permission-action" data-backup-file-action="permission"' +
          attributes({
            ...permission.attributes,
            ...(permission.ariaLabel === undefined
              ? {}
              : { "aria-label": permission.ariaLabel }),
          }) +
          ">اجازه مجدد</button>"
        : "")
    );
  }
  function html(options = {}) {
    const {
      supported = true,
      open = false,
      noticeHidden = false,
      fallback = false,
      ids = {},
      aliases = {},
      actions = {},
      disabled = {},
      className = "",
    } = options;
    const action = (key, label, title) =>
      '<button type="button" class="' +
      classes(key === "choose" ? "" : "ghost", aliases[key]) +
      '" data-backup-file-action="' +
      key +
      '" title="' +
      escape(title) +
      '"' +
      attributes(actions[key]) +
      (!supported || disabled[key] ? " disabled" : "") +
      ">" +
      label +
      "</button>";
    const summary =
      '<div class="' +
      classes("backup-file-summary", aliases.summary) +
      '"' +
      idAttribute(ids.summary) +
      ">" +
      summaryHtml({ ...options, detailed: true }) +
      "</div>";
    return (
      '<details class="' +
      classes("backup-automatic", className) +
      '"' +
      (open ? " open" : "") +
      "><summary><span>ذخیره خودکار</span><small>اختیاری</small></summary>" +
      (supported
        ? "<p>فایل را یک‌بار انتخاب کنید؛ هنگام باز بودن برنامه، همان فایل به‌روز می‌شود.</p>" +
          summary +
          '<div class="' +
          classes(
            "single-file-notice backup-automatic-notice",
            aliases.status,
          ) +
          '"' +
          idAttribute(ids.status) +
          " data-backup-file-status" +
          (noticeHidden ? " hidden" : "") +
          ">" +
          noticeHtml({ ...options, permission: null }) +
          '</div><div class="' +
          classes("backup-automatic-fallback", aliases.fallback) +
          '"' +
          idAttribute(ids.fallback) +
          (fallback ? "" : " hidden") +
          "><p>فایل خالی پشتیبان نیست؛ فعلاً «دریافت فایل» را بزنید.</p></div>"
        : '<p role="status"' +
          idAttribute(ids.status) +
          " data-backup-file-status" +
          ">ذخیرهٔ خودکار در این مرورگر در دسترس نیست؛ از «دریافت فایل» استفاده کنید.</p>" +
          summary) +
      '<div class="' +
      classes("row backup-automatic-actions", aliases.actions) +
      '">' +
      action("choose", "انتخاب فایل", "انتخاب فایل و محل ذخیرهٔ خودکار") +
      action("save", "ذخیره اکنون", "ذخیره اکنون / اجازه مجدد") +
      action("stop", "قطع اتصال", "قطع اتصال") +
      '</div><p class="backup-automatic-help">«ذخیره اکنون» فایل را فوراً ذخیره و در صورت نیاز مجوز نوشتن را درخواست می‌کند. «قطع اتصال» ذخیرهٔ خودکار را متوقف می‌کند؛ فایل حذف نمی‌شود.</p></details>'
    );
  }
  root.EduBackupAutomaticView = Object.freeze({
    html,
    summaryHtml,
    noticeHtml,
  });
})(globalThis);
