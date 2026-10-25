# فایل‌های اجرایی تولیدشده

JavaScriptهای این پوشه خروجی `npm run build` هستند. برای تغییر کد، فایل متناظر را
در `src/` و فهرست منابع را در `source-map.json` پیدا کنید. راهنما: `src/README.md`.

`legacy-ui.js` از فایل‌های موضوعی `src/legacy/` و `workspace-runtime.js` از
`src/workspace/` تولید می‌شوند. باقی فایل‌ها از ماژول‌های مستقل دامنه، data، validation،
UI، PWA و گزارش ساخته می‌شوند. ترتیب scriptهای `EduManager.html` قرارداد اجرای
classic برنامه است؛ build محدودهٔ خصوصی state و factoryهای موجود را حفظ می‌کند.

پس از ویرایش منبع:

```text
npm run build
npm test
```

ساخت فهرست cache و VERSION سرویس‌ورکر را خودکار به‌روزرسانی می‌کند. نیازی به ثبت
دستی فایل در سرورهای تست نیست؛ آن‌ها وابستگی‌ها را از HTML استخراج می‌کنند.
