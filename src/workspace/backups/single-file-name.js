// Device-only filename reservations; never part of the educational backup.
const SINGLE_FILE_NAMES_KEY = "EduManager.singleFileNames",
  SINGLE_FILE_NAMES_LIMIT = 366;
let singleFileNameLedger = Object.create(null),
  singleFileNameReservationSequence = 0;

function readSingleFileNames() {
  const merged = { ...singleFileNameLedger };
  try {
    const raw = localStorage.getItem(SINGLE_FILE_NAMES_KEY);
    if (!raw || raw.length > 65536) return merged;
    const saved = JSON.parse(raw);
    if (
      saved?.version !== 1 ||
      !saved.days ||
      typeof saved.days !== "object" ||
      Array.isArray(saved.days)
    )
      return merged;
    for (const [day, entry] of Object.entries(saved.days)) {
      if (
        !/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(day) ||
        !Number.isSafeInteger(entry?.count) ||
        entry.count < 1 ||
        entry.count >= Number.MAX_SAFE_INTEGER ||
        typeof entry.token !== "string" ||
        entry.token.length > 100 ||
        !/^[a-z0-9-]+$/.test(entry.token)
      )
        continue;
      if (!merged[day] || entry.count >= merged[day].count)
        merged[day] = { count: entry.count, token: entry.token };
    }
  } catch {
    // Storage can be denied or full. Naming must not disable a real backup.
  }
  return merged;
}
function rememberSingleFileNames(days, preferredDay) {
  const keys = Object.keys(days).sort().reverse();
  if (days[preferredDay]) {
    keys.splice(keys.indexOf(preferredDay), 1);
    keys.unshift(preferredDay);
  }
  singleFileNameLedger = Object.fromEntries(
    keys.slice(0, SINGLE_FILE_NAMES_LIMIT).map((day) => [day, days[day]]),
  );
  try {
    localStorage.setItem(
      SINGLE_FILE_NAMES_KEY,
      JSON.stringify({ version: 1, days: singleFileNameLedger }),
    );
  } catch {
    // Continue with this page's reservations until storage becomes available.
  }
}
function reserveSingleFileName(date = new Date()) {
  const day = gregorianToJalali(
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate(),
    )
      .map((part, index) => String(part).padStart(index ? 2 : 4, "0"))
      .join("-"),
    days = readSingleFileNames(),
    previous = days[day],
    count = (previous?.count || 0) + 1,
    token =
      Date.now().toString(36) +
      "-" +
      (++singleFileNameReservationSequence).toString(36) +
      "-" +
      Math.random().toString(36).slice(2);
  days[day] = { count, token };
  // This synchronous reservation must happen before the user-activated picker.
  rememberSingleFileNames(days, day);
  let released = false;
  return {
    name: "MySchool-" + day + (count > 1 ? "-" + count : "") + ".json",
    release() {
      if (released) return false;
      released = true;
      const current = readSingleFileNames();
      if (current[day]?.count !== count || current[day]?.token !== token)
        return false;
      if (previous) current[day] = previous;
      else delete current[day];
      rememberSingleFileNames(current, day);
      return true;
    },
  };
}
