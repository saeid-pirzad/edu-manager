// Device-only filename reservations, separate from educational data.
const SINGLE_FILE_NAMES_KEY = "EduManager.singleFileNames.v2";
let singleFileNameLedger = { count: 0, token: "" },
  singleFileNameReservationSequence = 0;

function assertClassroomFileName(name, { allowText = false } = {}) {
  const pattern = allowText
    ? /^Classyar-Classroom(?: ?\([1-9]\d*\))?\.(?:json|txt)$/
    : /^Classyar-Classroom(?: ?\([1-9]\d*\))?\.json$/;
  if (typeof name !== "string" || !pattern.test(name))
    throw Error(
      "نام فایل کلاس‌داری باید Classyar-Classroom.json یا نسخهٔ شماره‌دار آن مانند Classyar-Classroom(1).json باشد. نام فعلی: «" +
        (typeof name === "string" ? name : "نامشخص") +
        "». فایل‌های قدیمی را ابتدا تغییر نام دهید و دوباره انتخاب کنید؛ محتوای آن‌ها نیز بررسی می‌شود.",
    );
}
function readSingleFileNames() {
  try {
    const saved = JSON.parse(localStorage.getItem(SINGLE_FILE_NAMES_KEY));
    if (
      saved?.version === 2 &&
      Number.isSafeInteger(saved.count) &&
      saved.count >= 0 &&
      saved.count < Number.MAX_SAFE_INTEGER &&
      typeof saved.token === "string" &&
      saved.token.length <= 100 &&
      saved.count >= singleFileNameLedger.count
    )
      return { count: saved.count, token: saved.token };
  } catch {
    // Storage may be denied or full.
  }
  return { ...singleFileNameLedger };
}
function rememberSingleFileNames(value) {
  singleFileNameLedger = { ...value };
  try {
    localStorage.setItem(
      SINGLE_FILE_NAMES_KEY,
      JSON.stringify({ version: 2, ...value }),
    );
  } catch {
    // Keep reservations in memory when storage is unavailable.
  }
}
function reserveSingleFileName() {
  const previous = readSingleFileNames(),
    count = previous.count + 1,
    token =
      Date.now().toString(36) +
      "-" +
      ++singleFileNameReservationSequence +
      "-" +
      Math.random().toString(36).slice(2);
  rememberSingleFileNames({ count, token });
  let released = false;
  return {
    name: "Classyar-Classroom" + (count > 1 ? `(${count - 1})` : "") + ".json",
    release() {
      if (released) return false;
      released = true;
      const current = readSingleFileNames();
      if (current.count !== count || current.token !== token) return false;
      rememberSingleFileNames(previous);
      return true;
    },
  };
}
