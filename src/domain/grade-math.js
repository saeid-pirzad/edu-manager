"use strict";

      function finiteRatio(n, d) {
        if (d === 0n) throw Error("مخرج محاسبه نمره صفر است.");
        if (n === 0n) return 0;
        const negative = n < 0n !== d < 0n;
        n = n < 0n ? -n : n;
        d = d < 0n ? -d : d;
        let exponent = n.toString().length - d.toString().length;
        if (
          exponent >= 0
            ? n < d * 10n ** BigInt(exponent)
            : n * 10n ** BigInt(-exponent) < d
        )
          exponent--;
        const scale = 20 - exponent;
        const numerator = scale >= 0 ? n * 10n ** BigInt(scale) : n;
        const denominator = scale >= 0 ? d : d * 10n ** BigInt(-scale);
        const significant = (numerator + denominator / 2n) / denominator;
        const result = Number(
          (negative ? "-" : "") + significant.toString() + "e" + String(-scale),
        );
        if (!Number.isFinite(result))
          throw Error("نتیجه محاسبه نمره خارج از دامنه معتبر است.");
        return result;
      }
      function reduceGradeFraction(n, d) {
        let a = n < 0n ? -n : n,
          b = d;
        while (b) {
          const remainder = a % b;
          a = b;
          b = remainder;
        }
        return { n: n / (a || 1n), d: d / (a || 1n) };
      }
