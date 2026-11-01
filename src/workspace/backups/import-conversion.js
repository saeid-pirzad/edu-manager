// Convert a validated older backup into the same whole-installation replacement
// contract as modern files. Never inspect or append the current installation.
function legacyBackupReplacement(parsed) {
  assertSafeDataTree(parsed);
  if (!isDataObject(parsed))
    throw Error("ساختار فایل پشتیبان قدیمی معتبر نیست.");
  if (parsed.format !== undefined)
    throw Error("قالب این فایل برای تبدیل پشتیبان قدیمی پشتیبانی نمی‌شود.");
  const validVersion = (value, label) => {
    if (
      value !== undefined &&
      (!Number.isInteger(value) || value < 1 || value > 26)
    )
      throw Error("نسخهٔ " + label + " پشتیبانی نمی‌شود.");
  };
  validVersion(parsed.version, "پشتیبان");
  validVersion(parsed.schemaVersion, "ساختار");
  const wrapped = Object.hasOwn(parsed, "db"),
    source = wrapped ? parsed.db : parsed;
  if (!isDataObject(source))
    throw Error("اطلاعات اصلی فایل پشتیبان معتبر نیست.");
  if (source !== parsed && source.format !== undefined)
    throw Error("قالب اطلاعات داخل پشتیبان قدیمی معتبر نیست.");
  validVersion(source.schemaVersion, "ساختار");
  if (source.version !== undefined) validVersion(source.version, "اطلاعات");
  const period = parsed.period;
  if (period !== undefined && !isDataObject(period))
    throw Error("مشخصات سال تحصیلی در فایل معتبر نیست.");
  if (period?.id !== undefined && !isSafeRecordId(period.id))
    throw Error("شناسهٔ اطلاعات فایل پشتیبان معتبر نیست.");
  if (period?.closed !== undefined && typeof period.closed !== "boolean")
    throw Error("وضعیت بسته‌بودن اطلاعات فایل معتبر نیست.");
  if (source.settings !== undefined && !isDataObject(source.settings))
    throw Error("تنظیمات فایل پشتیبان معتبر نیست.");
  const input = clone(source);
  input.settings ||= {};
  if (input.settings.academicYear === undefined && period?.year !== undefined)
    input.settings.academicYear = period.year;
  if (input.settings.academicTerm === undefined && period?.term !== undefined)
    input.settings.academicTerm = period.term;
  const normalized = normalizeDB(input, {
      legacy: (source.schemaVersion ?? parsed.version ?? 23) < 24,
    }),
    id = period?.id || "restored-file",
    now = new Date().toISOString(),
    exportedAt =
      typeof parsed.exportedAt === "string" &&
      Number.isFinite(Date.parse(parsed.exportedAt))
        ? parsed.exportedAt
        : now,
    catalog = {
      id,
      year: normalized.settings.academicYear,
      term: normalized.settings.academicTerm,
      termKind: academicTermKind(normalized.settings.academicTerm),
      revision: 1,
      closed: period?.closed ?? false,
      createdAt: exportedAt,
      updatedAt: exportedAt,
    },
    replacement = {
      format: "EduManager.FullBackup",
      version: 2,
      schemaVersion: 26,
      exportedAt,
      activeWorkspace: id,
      stores: {
        catalog: [catalog],
        records: [...collectRecords(normalized)].map(([logical, value]) => ({
          key: id + "|" + logical,
          workspace: id,
          logical,
          value,
        })),
        events: [],
        undo: [],
        reports: [],
        backups: [],
      },
      reportDrafts: {},
      gradeDrafts: [],
    };
  validateFullBackup(replacement);
  return replacement;
}
