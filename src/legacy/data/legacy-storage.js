      function loadDB() {
        try {
          storageSnapshot = localStorage.getItem(STORAGE_KEY);
          if (storageSnapshot) return prepareDB(JSON.parse(storageSnapshot));
        } catch (e) {
          storageBlocked = true;
          storageProblem =
            "داده قابل خواندن نیست؛ ذخیره مسدود شد. نسخه خام را دریافت و پشتیبان سالم بازیابی کنید.";
          console.error(e);
        }
        return defaultDB();
      }

      function migrateUnitScores(d) {
        (d.schools || []).forEach((s) =>
          s.classes.forEach((c) => {
            (c.lessons || []).forEach((l) => {
              (l.poudmans || []).forEach((p) => {
                (p.units || []).forEach((u) => {
                  if (!u.unitScores) u.unitScores = {};
                  if (!u.applyOptions) u.applyOptions = {};
                  u.applyOptions = Object.assign(
                    {
                      pos: false,
                      neg: false,
                      hw: false,
                      present: false,
                      late: false,
                    },
                    u.applyOptions,
                  );
                });
              });
            });
          }),
        );
      }

      function migrateToMaster(d) {
        if (!d.masterSchedule) d.masterSchedule = {};
        if (!d.periods) {
          let mx = 6;
          (d.schools || []).forEach((s) =>
            s.classes.forEach((c) => {
              if (c.periods > mx) mx = c.periods;
            }),
          );
          d.periods = mx;
        }
        if (!d.activeDays) d.activeDays = [0, 1, 2, 3, 4, 5];
      }

      function saveDB() {
        try {
          if (storageBlocked) throw Error(storageProblem);
          if (localStorage.getItem(STORAGE_KEY) !== storageSnapshot)
            throw Error(
              "داده در تب دیگری تغییر کرده؛ صفحه را دوباره بارگذاری کنید.",
            );
          const next = prepareDB(db),
            raw = JSON.stringify(next);
          localStorage.setItem(STORAGE_KEY, raw);
          storageSnapshot = raw;
          db = next;
          return true;
        } catch (e) {
          try {
            db = storageSnapshot
              ? prepareDB(JSON.parse(storageSnapshot))
              : defaultDB();
          } catch (ignore) {}
          alert("ذخیره انجام نشد؛ تغییر اخیر ثبت نشده است. " + e.message);
          throw e;
        }
      }
