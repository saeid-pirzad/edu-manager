      async function legacy_exportBackup() {
        const data = { version: 23, exportedAt: new Date().toISOString(), db };
        const jsonString = JSON.stringify(data, null, 2);
        const fileName = `پشتیبان-مدرسه-${todayISO()}.json`;
        if (window.showSaveFilePicker) {
          try {
            const handle = await window.showSaveFilePicker({
              suggestedName: fileName,
              types: [
                {
                  description: "فایل JSON",
                  accept: { "application/json": [".json"] },
                },
              ],
            });
            const writable = await handle.createWritable();
            await writable.write(jsonString);
            await writable.close();
            alert("✅ پشتیبان با موفقیت ذخیره شد.");
            return;
          } catch (err) {
            if (err.name === "AbortError") return;
          }
        }
        const blob = new Blob([jsonString], { type: "application/json" });
        downloadLocalFile(blob, fileName);
      }

      function legacy_handleImport(e) {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 20 * 1024 * 1024) {
          e.target.value = "";
          return alert("حداکثر حجم فایل ۲۰ مگابایت است.");
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const parsed = JSON.parse(ev.target.result);
            if (
              parsed.version !== undefined &&
              (!Number.isInteger(parsed.version) || parsed.version > 23)
            )
              throw Error("نسخه پشتیبان پشتیبانی نمی‌شود.");
            const candidate = prepareDB(parsed.db || parsed);
            if (
              !confirm(
                "پشتیبان معتبر جایگزین شود؟ نسخه قبلی برای بازیابی نگه داشته می‌شود.",
              )
            )
              return;
            const old = localStorage.getItem(STORAGE_KEY);
            if (old !== null)
              localStorage.setItem(STORAGE_KEY + "_beforeImport", old);
            const raw = JSON.stringify(candidate);
            localStorage.setItem(STORAGE_KEY, raw);
            db = candidate;
            storageSnapshot = raw;
            storageBlocked = false;
            storageProblem = "";
            isAuthenticated = false;
            state = {
              view: "schools",
              schoolId: null,
              classId: null,
              lessonId: null,
              tab: "students",
              masterFilter: null,
              reportTab: "comprehensive",
            };
            lessonReportFilter = { schoolId: "", classId: "", lessonId: "" };
            karnamehFilter = { schoolId: "", classId: "", studentId: "" };
            resetGlobalFilters();
            render();
            alert("بازیابی انجام شد.");
          } catch (err) {
            alert("بازیابی انجام نشد: " + err.message);
          } finally {
            e.target.value = "";
          }
        };
        reader.onerror = () => {
          e.target.value = "";
          alert("خواندن فایل انجام نشد.");
        };
        reader.readAsText(file, "UTF-8");
      }

      function legacy_wipeAllData() {
        const t1 = confirm(
          "⚠️ آیا از پاک کردن کامل تمام داده‌ها مطمئن هستید؟ این عمل غیرقابل بازگشت است.",
        );
        if (!t1) return;
        const t2 = confirm(
          "🚨 آخرین هشدار: تمام مدارس، کلاس‌ها، دانش‌آموزان، نمرات و برنامه هفتگی برای همیشه حذف می‌شوند. ادامه می‌دهید؟",
        );
        if (!t2) return;
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_KEY + "_beforeImport");
        storageSnapshot = null;
        storageBlocked = false;
        storageProblem = "";
        db = defaultDB();
        isAuthenticated = false;
        state = {
          view: "schools",
          schoolId: null,
          classId: null,
          lessonId: null,
          tab: "students",
          masterFilter: null,
          reportTab: "comprehensive",
        };
        globalFilter = {
          schoolId: "",
          classId: "",
          lessonId: "",
          studentId: "",
          period: "",
          date: "",
          showAttendance: true,
          showScores: true,
          showPosNeg: true,
          showHomework: true,
          reportMode: "detailed",
          showPresentNames: true,
          showAbsentNames: true,
          showLateNames: true,
        };
        lessonReportFilter = { schoolId: "", classId: "", lessonId: "" };
        karnamehFilter = { schoolId: "", classId: "", studentId: "" };
        render();
        alert("✅ تمام داده‌ها با موفقیت حذف شدند.");
      }

