      function legacy_downloadExcelTemplate() {
        const csv =
          "\uFEFF" +
          "ردیف,نام و نام خانوادگی\n1,مثال: علی رضایی\n2,مثال: محمد احمدی\n";
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        downloadLocalFile(blob, "قالب-دانش‌آموزان.csv");
      }
      function legacy_handleExcelImport(e) {
        const file = e.target.files[0];
        if (!file) return;
        const schoolId = state.schoolId,
          classId = state.classId;
        if (file.size > 5 * 1024 * 1024) {
          e.target.value = "";
          return alert("حداکثر حجم CSV پنج مگابایت است.");
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const c = getClassObj(schoolId, classId);
            if (!c) throw Error("کلاس مقصد دیگر وجود ندارد.");
            const rows = parseCSV(ev.target.result);
            if (rows.length < 2)
              throw Error("CSV باید سرستون و دست‌کم یک ردیف داشته باشد.");
            const column = rows[0].findIndex((x) =>
              normalizedName(x).includes("نام"),
            );
            if (column < 0) throw Error("ستون نام یافت نشد.");
            const known = new Set(
              c.students.map((x) => normalizedName(x.name)),
            );
            let duplicate = 0,
              skipped = 0;
            const added = [];
            rows.slice(1).forEach((row, index) => {
              if (row.length !== rows[0].length)
                throw Error("تعداد ستون نامعتبر در ردیف " + (index + 2));
              const name = normalizedName(row[column]);
              if (!name || name.includes("مثال:")) {
                skipped++;
                return;
              }
              if (name.length > 200 || /[\r\n<>]/.test(name))
                throw Error("نام نامعتبر در ردیف " + (index + 2));
              if (known.has(name)) {
                duplicate++;
                return;
              }
              known.add(name);
              added.push({ id: uid(), name });
            });
            if (added.length) {
              c.students.push(...added);
              saveDB();
              render();
            }
            alert(
              "افزوده: " +
                added.length +
                " | تکراری: " +
                duplicate +
                " | خالی یا نمونه: " +
                skipped,
            );
          } catch (err) {
            alert("ورود CSV انجام نشد: " + err.message);
          } finally {
            e.target.value = "";
          }
        };
        reader.onerror = () => {
          e.target.value = "";
          alert("خواندن CSV انجام نشد.");
        };
        reader.readAsText(file, "UTF-8");
      }

