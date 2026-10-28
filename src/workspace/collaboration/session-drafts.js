function preferredPeriod() {
  try {
    const id = sessionStorage.getItem("Edu24.activePeriod");
    if (id) return id;
  } catch (ignore) {}
  try {
    return localStorage.getItem("Edu24.activePeriod");
  } catch (ignore) {
    return null;
  }
}

function rememberPeriod(id) {
  try {
    sessionStorage.setItem("Edu24.activePeriod", id);
  } catch (ignore) {}
  try {
    localStorage.setItem("Edu24.activePeriod", id);
  } catch (ignore) {}
}

async function claimTab() {
  const navigation = performance.getEntriesByType("navigation")[0]?.type;
  if (navigation === "navigate" || !tabId) tabId = uid();
  try {
    sessionStorage.setItem("Edu24.tabId", tabId);
  } catch (ignore) {}
  tabClaimed = true;
}

function tabMessage(message) {
  if (message.type === "claim-tab") {
    if (
      message.tabId === tabId &&
      message.documentToken !== documentToken &&
      (tabClaimed || documentToken < message.documentToken)
    )
      broadcast({
        type: "tab-alive",
        tabId,
        to: message.documentToken,
      });
    return true;
  }
  if (message.type === "tab-alive") {
    if (message.to === documentToken && message.tabId === tabId)
      collision = true;
    return true;
  }
  return false;
}

async function openOtherDrafts() {
  const prefix = "Edu24.drafts." + workspace.id + ".",
    byTab = new Map();
  for (const row of await persistedGradeDrafts(prefix)) {
    if (row.key === draftBaseKey() || row.key.startsWith(draftBaseKey() + "."))
      continue;
    const entry = {
      key: row.key,
      items: row.entries,
      generation: row.generation,
      at: row.updatedAt,
    };
    const otherTab = row.key.slice(prefix.length).split(".")[0],
      old = byTab.get(otherTab);
    if (
      !old ||
      entry.generation > old.generation ||
      (entry.generation === old.generation && entry.at > old.at)
    )
      byTab.set(otherTab, entry);
  }
  const entries = [...byTab.values()].filter((x) => x.items.length);
  showModal(
    "پیش‌نویس نشست‌های دیگر",
    '<div class="other-drafts"><header class="other-drafts-heading"><span>' + entries.length.toLocaleString("fa-IR") +
      ' نشست دارای پیش‌نویس</span><p>فقط جدیدترین پیش‌نویس هر نشست نمایش داده می‌شود. دریافت آن نیازمند بررسی و تأیید مقدار ثبت‌شده است.</p></header><div class="other-drafts-list">' +
      (entries.length
        ? entries
            .map(
              (entry) =>
                '<article class="other-draft-entry"><div class="other-draft-info"><strong>' +
                entry.items.length +
                ' ورودی ثبت‌نشده</strong><span class="other-draft-time" dir="auto">' +
                esc(entry.items.at(-1)?.at || "") +
                '</span></div><button class="ghost" data-key="' +
                esc(entry.key) +
                '" data-workspace-action="adopt-drafts">دریافت برای بررسی</button></article>',
            )
            .join("")
        : '<div class="other-drafts-empty">پیش‌نویس دیگری یافت نشد.</div>') + '</div></div>',
  );
}

async function consumeDraftSource(record) {
  const same = (raw) => {
    if (!raw) return true;
    const entries = Array.isArray(raw) ? raw : raw.entries || [];
    const generation = Array.isArray(raw) ? 0 : Number(raw.generation || 0);
    return (
      generation === record.generation &&
      JSON.stringify(entries) === JSON.stringify(record.entries) &&
      (raw.updatedAt || "") === record.updatedAt
    );
  };
  const updatedAt = new Date(
    Math.max(Date.now(), Date.parse(record.updatedAt) || 0) + 1,
  ).toISOString();
  const tombstone = {
    key: record.key,
    workspace: workspace.id,
    owner: "received",
    generation: record.generation,
    entries: [],
    updatedAt,
  };
  const tx = connection.transaction("drafts", "readwrite"),
    done = transactionDone(tx);
  const store = tx.objectStore("drafts"),
    request = store.get(record.key);
  request.onsuccess = () => {
    if (same(request.result)) store.put(tombstone);
  };
  await done;
  try {
    const raw = JSON.parse(localStorage.getItem(record.key) || "null");
    if (same(raw)) localStorage.setItem(record.key, JSON.stringify(tombstone));
  } catch {}
}

async function adoptDrafts(key) {
  const prefix = "Edu24.drafts." + workspace.id + ".";
  if (!key.startsWith(prefix) || key === draftStorageKey())
    throw Error("کلید معتبر نیست.");
  const record = (await persistedGradeDrafts(prefix)).find(
    (row) => row.key === key,
  );
  if (!record) throw Error("پیش‌نویس پیدا نشد.");
  const items = record.entries;
  if (!Array.isArray(items)) throw Error("پیش‌نویس نامعتبر است.");
  if (items.some((item) => !isSupportedGradeDraft(item)))
    throw Error("ورودی نامعتبر است؛ هیچ پیش‌نویسی دریافت نشد.");
  for (const original of items) {
    const item = {
      ...original,
      review: true,
      error: "بازیابی از نشست دیگر؛ نیازمند بررسی",
    };
    drafts.set(inputKey(item), item);
  }
  await storeDrafts();
  await consumeDraftSource(record);
  reviewDrafts();
}

function broadcast(message) {
  try {
    if (channel) channel.postMessage(message);
  } catch (ignore) {}
}
function draftBaseKey() {
  return "Edu24.drafts." + workspace.id + "." + tabId;
}
