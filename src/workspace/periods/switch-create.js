        async function openPeriods() {
          await flushDrafts({ strict: true });
          const all = (await allFrom("catalog")).sort((a, b) =>
            b.createdAt.localeCompare(a.createdAt),
          );
          const reports = (await allFrom("reports")).filter(
            (r) => r.workspace === workspace.id,
          );
          showModal(
            "دوره‌های تحصیلی و کارنامه نهایی",
            "<p>هر دوره، کلاس‌ها، نمرات و جلسات مستقل دارد. بستن دوره فقط پس از تکمیل همه نمرات انجام می‌شود و نسخه ثابت کارنامه نگه داشته می‌شود.</p><table><thead><tr><th>سال / نوبت</th><th>وضعیت</th><th></th></tr></thead><tbody>" +
              all
                .map(
                  (w) =>
                    "<tr><td>" +
                    esc(w.year + " / " + w.term) +
                    "</td><td>" +
                    (w.closed ? "بسته" : "باز") +
                    '</td><td><button class="ghost" onclick="EduV24.switchPeriod(\'' +
                    w.id +
                    "')\">" +
                    (w.id === workspace.id ? "دوره فعلی" : "بازکردن") +
                    "</button></td></tr>",
                )
                .join("") +
              '</tbody></table><div class="row"><button onclick="EduV24.openNewPeriod()">دوره جدید با فهرست فعلی و بدون نمره</button>' +
              (workspace.closed
                ? '<button onclick="EduV24.reopenPeriod()">بازگشایی با ثبت در تاریخچه</button>'
                : '<button onclick="EduV24.finalizePeriod()">بستن دوره و ثبت کارنامه نهایی</button><button class="ghost" onclick="EduV24.editPeriodLabel()">اصلاح عنوان دوره</button>') +
              "</div>" +
              reports
                .map(
                  (r) =>
                    '<div class="row"><span>کارنامه ثابت ' +
                    esc(new Date(r.at).toLocaleString("fa-IR")) +
                    '</span><button class="ghost" onclick="EduV24.showFrozenReport(\'' +
                    r.id +
                    "')\">مشاهده / چاپ</button></div>",
                )
                .join("") +
              '<p id="operationError" role="alert"></p>',
          );
        }

        function hydrateReportNotes(period) {
          if (
            !period.reportNotesRecovery ||
            !Object.keys(period.reportNotesRecovery).length
          )
            return true;
          const saved = window.EduPeriodicReports?.restoreDrafts(
            period.id,
            period.reportNotesRecovery,
          );
          if (saved === false)
            setStatus(
              "اطلاعات خوانده شد؛ توضیحات بازیابی‌شده در بانک داخلی محفوظ است. ذخیره توضیحات را از صفحه گزارش دوباره امتحان کنید.",
              "error",
            );
          return saved !== false;
        }
        async function switchPeriod(id) {
          if (id === workspace.id) {
            closeModal();
            return;
          }
          await flushDrafts({ strict: true });
          await writer.catch(() => {});
          const next = await readRecord("catalog", id);
          if (!next) throw Error("دوره موجود نیست.");
          const loaded = await readWorkspace(id);
          workspace = next;
          db = loaded.data;
          committed = loaded.records;
          blocked = false;
          storageBlocked = false;
          drafts.clear();
          isAuthenticated = false;
          state = {
            view: "schools",
            schoolId: null,
            classId: null,
            lessonId: null,
            tab: "students",
            reportTab: "comprehensive",
          };
          rememberPeriod(id);
          hydrateReportNotes(workspace);
          await loadDrafts();
          closeModal();
          render();
          await recoverDrafts();
        }

        function openNewPeriod() {
          showModal(
            "دوره تحصیلی جدید",
            '<label>سال تحصیلی <input id="periodYear" value="' +
              esc(currentYearLabel()) +
              '"></label><label>نوبت <select id="periodTerm"><option>اول</option><option>دوم</option><option>تابستان</option></select></label><p>فهرست دانش‌آموزان فعال، دروس و تنظیم برنامه کپی می‌شود. نمرات، جلسات و بایگانی دوره قبلی منتقل نمی‌شوند.</p><button onclick="EduV24.createNewPeriod()">ایجاد دوره مستقل</button>',
          );
        }

        async function createNewPeriod() {
          if (fileMode)
            throw Error(
              "این عملیات را در نسخه نصب‌شده برنامه یا نشانی HTTPS آن انجام دهید.",
            );
          await flushDrafts({ strict: true });
          const year = asciiDigits(document.getElementById("periodYear").value),
            term = document.getElementById("periodTerm").value;
          if (
            !/^\d{4}-\d{4}$/.test(year) ||
            Number(year.slice(5)) - Number(year.slice(0, 4)) !== 1
          )
            throw Error("سال را مانند 1405-1406 وارد کنید.");
          const existing = await allFrom("catalog");
          if (existing.some((x) => x.year === year && x.term === term))
            throw Error("این سال و نوبت قبلاً ساخته شده است.");
          const next = clone(db);
          next.sessions = [];
          next.migrationWarnings = [];
          next.settings.academicYear = year;
          next.settings.academicTerm = term;
          for (const school of next.schools)
            for (const c of school.classes) {
              c.archivedStudents = [];
              for (const l of c.lessons) {
                l.kardaneshScores = {};
                const info = EduPolicy.identity(l, year);
                if (l.gradingPolicy) {
                  const changedYear = l.gradingPolicy.year !== year;
                  const changedIdentity = Object.entries(info).some(
                    ([key, value]) => l.gradingPolicy[key] !== value,
                  );
                  Object.assign(l.gradingPolicy, info);
                  if (changedYear || changedIdentity) {
                    l.gradingPolicy.confirmed = false;
                    l.gradingPolicy.revision = 1;
                  }
                  if (changedYear) {
                    l.gradingPolicy.circularNumber = "";
                    l.gradingPolicy.circularDate = "";
                    l.gradingPolicy.reference = "";
                  }
                }
                if (l.courseInfo || l.gradingPolicy) l.courseInfo = info;
                for (const p of l.poudmans) p.podScores = {};
                for (const p of l.poudmans)
                  for (const u of p.units) u.unitScores = {};
              }
            }
          const created = await installWorkspace(normalizeDB(next), {
            year,
            term,
          });
          await switchPeriod(created.id);
        }

