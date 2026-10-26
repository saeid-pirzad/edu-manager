async function rawRecoveryV24() {
  const legacy = localStorage.getItem(STORAGE_KEY);
  if (legacy !== null) {
    downloadLocalFile(
      new Blob([legacy], { type: "application/json" }),
      "school-legacy-raw-recovery.json",
    );
    return;
  }
  if (!connection)
    throw Error("بانک محلی در دسترس نیست؛ فایل پشتیبان مستقل را بازیابی کنید.");
  const catalog = await allFrom("catalog"),
    records = await allFrom("records");
  downloadJSON(
    {
      version: 24,
      recoveryDump: true,
      exportedAt: new Date().toISOString(),
      catalog,
      records,
    },
    "school-indexeddb-raw-recovery.json",
  );
  setStatus(
    "نسخه خام برای بررسی و ترمیم دریافت شد؛ این فایل پشتیبان معمولی قابل ورود مستقیم نیست.",
    "saved",
  );
}
