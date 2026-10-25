# آزمون‌های EduManager

`npm test` کنترل همگامی خروجی ساخت، تست‌های واحد، قرارداد asset/cache، قرارداد داده
و آزمون مرورگر با دادهٔ ساختگی را اجرا می‌کند. Node.js 22+ و Edge لازم‌اند؛ مرورگر
جایگزین با `EDUMANAGER_EDGE` تعیین می‌شود. هیچ profile شخصی یا دادهٔ واقعی استفاده نمی‌شود.

- `*.test.cjs`: تست‌های واحد با runner داخلی Node؛ بدون نصب dependency.
- `flows/`: سناریوهای مرورگر به تفکیک داده، پشتیبان، گزارش، فرم‌ها و جریان کاری.
- `data-integrity.cjs`: سرور loopback و profile موقت Edge؛ runner قابل استفادهٔ مجدد.
- `workflow-review.cjs`: مرور کامل‌تر و تست ارتقای دو نسخه از طریق extension مشخص runner.
- `data-store-browser.cjs`: ساخت schema، ترمیم index، حفظ داده و اتمیک‌بودن ذخیره.
- `pwa-upgrade.cjs`: نصب نسخهٔ قدیمی Git و ارتقا؛ به commit `594217b` نیاز دارد.
- `application-files.cjs`: فهرست فایل‌های لازم، استخراج‌شده از HTML.
- `assets-contract.cjs`: تطابق دقیق cache و فایل‌ها و بررسی نحو اسکریپت‌های انتشار.

گزارش تازه و screenshotها در پوشهٔ موقت چاپ‌شده در `resultFile` ذخیره می‌شوند.
JSONهای قدیمی موجود در این پوشه، شواهد تاریخی‌اند و نتیجهٔ اجرای امروز نیستند.
کد خروجی ۱ شکست assertion و کد ۲ خطای harness است.

دستورات:

```text
npm test
npm run test:unit
npm run test:integrity
npm run test:assets
npm run test:data-contract
```
