        function fileModeBanner(app) {
          const warning = document.createElement("div");
          warning.id = "fileMigrationBanner";
          warning.className = "card";
          const title = document.createElement("h3");
          title.textContent = "حالت انتقال سوابق؛ فقط خواندنی";
          const text = document.createElement("p");
          text.textContent =
            "برای استفاده روزمره، نسخه نصب‌شده برنامه یا نشانی HTTPS آن را باز کنید. ابتدا فایل پشتیبان سوابق قبلی را دریافت و سپس در همان نسخه بازیابی کنید.";
          const button = document.createElement("button");
          button.textContent = "دریافت فایل انتقال سوابق";
          button.onclick = () => exportBackup();
          warning.append(title, text, button);
          app.prepend(warning);
        }
        function parseDraft(item) {
          const l = getLessonObj(findClass(item.classId), item.lid);
          if (!l) return { ok: false, message: "درس پیش‌نویس موجود نیست." };
          if (item.kind === "pod") {
            if (
              l.gradingPolicy?.method !== "modular" ||
              !["m", "c"].includes(item.field)
            )
              return { ok: false, message: "نوع نمره پودمان نامعتبر است." };
            return EduPolicy.parse(
              item.value,
              l.gradingPolicy,
              item.field,
              item.kind,
            );
          }
          return parseGrade(item.value);
        }

        function validateCourse(l, ids, year) {
          if (l.gradingPolicy) {
            EduPolicy.validate(l.gradingPolicy);
            if (l.gradingPolicy.year !== year)
              throw Error(
                "سال قواعد درس با دوره تحصیلی یکسان نیست؛ برای سال جدید دوره مستقل بسازید.",
              );
            const p = l.gradingPolicy;
            if ((l.gradeMode === "kardanesh") !== (p.method === "dual"))
              throw Error("روش درس با قواعد آن یکسان نیست.");
            if (
              p.method === "modular" &&
              (!l.poudmans.length ||
                l.poudmans.length > 20 ||
                l.poudmans.some((x) => !x.units.length || x.units.length > 10))
            )
              throw Error("ساختار پودمان و واحد معتبر نیست.");
          }
          for (const pod of l.poudmans || []) {
            if (pod.podScores === undefined) continue;
            if (
              !pod.podScores ||
              typeof pod.podScores !== "object" ||
              Array.isArray(pod.podScores)
            )
              throw Error("نمرات پودمان نامعتبر است.");
            for (const [sid, g] of Object.entries(pod.podScores)) {
              if (
                !ids.has(sid) ||
                !g ||
                typeof g !== "object" ||
                Array.isArray(g)
              )
                throw Error("دانش‌آموز یا نمره پودمان نامعتبر است.");
              if (g.gate !== undefined && typeof g.gate !== "boolean")
                throw Error("وضعیت معیارهای الزامی نامعتبر است.");
              for (const field of ["m", "c"])
                if (g[field] != null) {
                  if (
                    typeof g[field] !== "number" ||
                    !Number.isFinite(g[field]) ||
                    l.gradingPolicy?.method !== "modular"
                  )
                    throw Error("نمره پودمان فاقد قواعد معتبر است.");
                  if (
                    !EduPolicy.parse(
                      String(g[field]),
                      l.gradingPolicy,
                      field,
                      "pod",
                    ).ok
                  )
                    throw Error("بازه یا گام نمره پودمان نامعتبر است.");
                }
            }
          }
        }

