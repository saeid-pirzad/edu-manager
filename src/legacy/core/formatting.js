      globalThis.__EDU_SINGLE_FILE__ = true;
      const STORAGE_KEY = "schoolManagerDB_v22";
      const DAYS = [
        "شنبه",
        "یکشنبه",
        "دوشنبه",
        "سه‌شنبه",
        "چهارشنبه",
        "پنجشنبه",
        "جمعه",
      ];
      const TYPE_LABELS = {
        mostamar: "مستمر",
        payani: "پایانی",
        positive: "مثبت",
        negative: "منفی",
        classGrade: "نمره کلاسی",
        activity: "امتیاز فعالیت",
        homework: "تکلیف",
      };
      const COLORS = [
        "#4f46e5",
        "#0891b2",
        "#059669",
        "#d97706",
        "#dc2626",
        "#7c3aed",
        "#db2777",
        "#0284c7",
        "#65a30d",
        "#9333ea",
      ];

      // Shared data-boundary rules; grading maps only read their own records.
      function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      }
      function todayISO() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      }
      function faDate(iso) {
        if (!iso) return "";
        try {
          return new Date(iso + "T00:00:00").toLocaleDateString("fa-IR");
        } catch (e) {
          return iso;
        }
      }
      function toShamsi(iso) {
        return faDate(iso);
      }
      function esc(s) {
        return String(s ?? "").replace(
          /[&<>"']/g,
          (c) =>
            ({
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              '"': "&quot;",
              "'": "&#39;",
            })[c],
        );
      }
      function todayIdx() {
        return (new Date().getDay() + 1) % 7;
      }
      function clamp(v, a, b) {
        return Math.max(a, Math.min(b, v));
      }
      function getDayIdxFromDate(dateStr) {
        return (new Date(dateStr + "T00:00:00").getDay() + 1) % 7;
      }
      function getPeriodName(p) {
        return `زنگ ${p + 1}`;
      }

      // ==================== تقویم شمسی ====================
      function toFaNum(num) {
        const faDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
        return String(num).replace(/\d/g, (d) => faDigits[d]);
      }
