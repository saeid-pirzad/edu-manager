        function currentYearLabel() {
          const parts = new Intl.DateTimeFormat("en-u-ca-persian", {
            year: "numeric",
            month: "numeric",
          }).formatToParts(new Date());
          const y = Number(parts.find((x) => x.type === "year").value),
            m = Number(parts.find((x) => x.type === "month").value);
          const start = m >= 7 ? y : y - 1;
          return start + "-" + (start + 1);
        }

        function v24DefaultDB() {
          const d = old.defaultDB();
          d.schemaVersion = 26;
          d.settings.academicYear = currentYearLabel();
          d.settings.academicTerm = "اول";
          return d;
        }

        function clone(value) {
          return structuredClone(value);
        }

        function asciiDigits(value) {
          return String(value ?? "")
            .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776))
            .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632))
            .replace(/[٫،]/g, ".")
            .trim();
        }

        function parseGrade(value) {
          const text = asciiDigits(value);
          if (text === "")
            return {
              ok: false,
              empty: true,
              message: "برای حذف نمره از دکمه پاک‌کردن استفاده کنید.",
            };
          if (!/^(?:\d{1,2}(?:\.\d{1,6})?|\.\d{1,6})$/.test(text))
            return {
              ok: false,
              message: "عدد صفر تا بیست، با حداکثر شش رقم اعشار وارد کنید.",
            };
          const number = Number(text);
          return number >= 0 && number <= 20
            ? { ok: true, value: number }
            : { ok: false, message: "نمره باید بین صفر و بیست باشد." };
        }

        function fraction(value) {
          const text = String(value).toLowerCase();
          const [mantissa, exp = "0"] = text.split("e");
          const negative = mantissa.startsWith("-"),
            clean = mantissa.replace("-", ""),
            [whole, dec = ""] = clean.split(".");
          let n = BigInt(whole + dec) * (negative ? -1n : 1n),
            scale = dec.length - Number(exp);
          return scale >= 0
            ? { n, d: 10n ** BigInt(scale) }
            : { n: n * 10n ** BigInt(-scale), d: 1n };
        }

        function weightedKardanesh(practical, theory) {
          if (practical == null || theory == null)
            return { final: null, passed: null };
          const a = fraction(practical),
            b = fraction(theory),
            n = 7n * a.n * b.d + 3n * b.n * a.d,
            d = 10n * a.d * b.d;
          return { final: finiteRatio(n, d), passed: n >= 14n * d };
        }

        function finalText(result) {
          if (result.final == null) return "—";
          const text = result.final.toFixed(2);
          if (
            result.threshold != null &&
            result.final < result.threshold &&
            Number(text) >= result.threshold
          )
            return String(result.final) + " (کمتر از " + result.threshold + ")";
          return result.passed === false &&
            result.final < 14 &&
            text === "14.00"
            ? String(result.final) + " (کمتر از ۱۴)"
            : text;
        }

