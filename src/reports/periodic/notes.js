        const modeLabel = (mode) =>
          ({
            daily: "روزانه",
            weekly: "هفتگی",
            monthly: "ماهانه",
            annual: "سالانه",
          })[mode] || "دوره‌ای";
        const filters = {
          mode: "daily",
          annualFirstId: "",
          annualSecondId: "",
          date: localToday(),
          schoolId: "",
          classId: "",
          studentId: "",
          audience: "management",
          detailLevel: "summary",
          author: "",
        };
        // Report drafts and signatures belong to the actual academic period.

        // Only notes that have not reached local storage stay in memory.
        const notes = new Map(),
          noteReadErrors = new Map(),
          recoveryNotes = new Map();
        const context = () =>
          root.EduV24?.getReportContext() || { id: "", revision: 0 };
        const draftStorageKey = (id = context().id) =>
          "EduManager.periodicDrafts." + id;
        function storedNotes(id = context().id) {
          const saved = JSON.parse(
            localStorage.getItem(draftStorageKey(id)) || "{}",
          );
          if (
            !saved ||
            typeof saved !== "object" ||
            Array.isArray(saved) ||
            Object.values(saved).some((value) => typeof value !== "string")
          )
            throw Error("ساختار توضیحات ذخیره‌شده معتبر نیست.");
          noteReadErrors.delete(id);
          return saved;
        }
        function readNote(key) {
          if (notes.has(key)) return notes.get(key);
          const id = key.split("|")[0];
          try {
            const saved = getDrafts(id);
            if (Object.prototype.hasOwnProperty.call(saved, key))
              return saved[key];
            const parts = key.split("|");
            if (parts[1] !== "weekly" || !parts[2].startsWith("week:"))
              return "";
            const start = parts[2].slice(5),
              end = addDays(start, 6);
            const matches = Object.entries(saved)
              .filter(([oldKey, value]) => {
                const old = oldKey.split("|");
                return (
                  value.trim() &&
                  old.length === parts.length &&
                  old.every((part, i) => i === 2 || part === parts[i]) &&
                  /^\d{4}-\d{2}-\d{2}$/.test(old[2]) &&
                  old[2] >= start &&
                  old[2] <= end
                );
              })
              .sort(([a], [b]) => a.localeCompare(b));
            const unique = matches.filter(
              ([, value], i) =>
                matches.findIndex(([, other]) => other === value) === i,
            );
            if (unique.length === 1) return unique[0][1];
            return unique
              .map(
                ([oldKey, value]) =>
                  "یادداشت ثبت‌شده در " + oldKey.split("|")[2] + ":\n" + value,
              )
              .join("\n\n");
          } catch (error) {
            noteReadErrors.set(id, error.message || String(error));
            return "";
          }
        }
        function persistNote(key, value) {
          if (root.EduV24?.canWriteReportNotes?.() === false) return false;
          notes.set(key, value);
          const id = key.split("|")[0];
          try {
            const saved = storedNotes(id);
            saved[key] = value;
            localStorage.setItem(draftStorageKey(id), JSON.stringify(saved));
            notes.delete(key);
            return true;
          } catch (error) {
            noteReadErrors.set(id, error.message || String(error));
            return false;
          }
        }
        function noteWarning() {
          const pending = [...notes.keys()].filter(
            (key) => key.split("|")[0] === context().id,
          ).length;
          if (!pending && !noteReadErrors.has(context().id)) return "";
          return (
            '<div class="periodic-warnings" role="alert"><p>' +
            (pending
              ? "توضیحات " +
                pending +
                " گزارش هنوز کامل ذخیره نشده است. متن را پیش از بستن برنامه در فایل گزارش ذخیره کنید."
              : "خواندن توضیحات ذخیره‌شده انجام نشد؛ فایل پشتیبان را برای بررسی نگه دارید.") +
            '</p><button type="button" class="ghost" onclick="EduPeriodicReports.retryNotes()">تلاش مجدد ذخیره توضیحات</button></div>'
          );
        }
        function paintNoteState() {
          const el = document.getElementById("periodicNoteStatus");
          if (el) el.innerHTML = noteWarning();
        }
        function retryNotes() {
          const id = context().id;
          for (const [key, value] of [...notes])
            if (key.split("|")[0] === id) persistNote(key, value);
          try {
            storedNotes(id);
          } catch (error) {
            noteReadErrors.set(id, error.message || String(error));
          }
          paintNoteState();
          return (
            !noteReadErrors.has(id) &&
            ![...notes.keys()].some((key) => key.split("|")[0] === id)
          );
        }
        function getDrafts(id, recovery = recoveryNotes.get(id)) {
          const saved = {
            ...validateReportNotes(recovery, id),
            ...storedNotes(id),
          };
          for (const [key, value] of notes)
            if (key.split("|")[0] === id) saved[key] = value;
          return saved;
        }
        function restoreDrafts(id, value) {
          if (root.EduV24?.canWriteReportNotes?.() === false) return false;
          const recovered = validateReportNotes(value, id);
          recoveryNotes.set(id, recovered);
          let merged = { ...recovered };
          try {
            const saved = storedNotes(id);
            merged = { ...recovered, ...saved };
            for (const [key, text] of notes)
              if (key.split("|")[0] === id) merged[key] = text;
            if (
              Object.entries(merged).some(
                ([key, text]) =>
                  !Object.prototype.hasOwnProperty.call(saved, key) ||
                  saved[key] !== text,
              )
            )
              localStorage.setItem(draftStorageKey(id), JSON.stringify(merged));
            for (const [key, text] of [...notes])
              if (key.split("|")[0] === id && merged[key] === text)
                notes.delete(key);
            return true;
          } catch (error) {
            for (const [key, text] of Object.entries(merged))
              if (!notes.has(key)) notes.set(key, text);
            noteReadErrors.set(id, error.message || String(error));
            return false;
          }
        }
        function resetDrafts() {
          notes.clear();
          noteReadErrors.clear();
          recoveryNotes.clear();
          last = null;
        }
        root.addEventListener("beforeunload", (event) => {
          if (notes.size) {
            event.preventDefault();
            event.returnValue = "";
          }
        });
