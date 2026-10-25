# ترتیب بارگذاری اسکریپت‌ها

این پوشه شامل اسکریپت‌های classic است، نه ES module. دلیل آن حفظ سازگاری با
توابع global موجود در برنامه تا زمان تکمیل refactor است.

ترتیب درج در `EduManager.html` بخشی از قرارداد برنامه است:

1. `data-store-schema.js`، `data-store-runtime.js` و `data-store.js`: قرارداد داده، Promiseها و اتصال IndexedDB
2. ابتدا `calendar-math.js`، سپس `calendar-ui.js` و سپس `legacy-ui.js`: محاسبات تاریخ و picker پیش از راه‌اندازی رابط آماده می‌شوند؛ رابط متغیرها و توابع عمومی legacy را تعریف می‌کند.
   `calendar-ui.js` مالک وضعیت تقویم، فیلدهای شمسی، رویدادهای انتخاب تاریخ، فوکوس و صفحه‌کلید است؛ helperهای نمایشی legacy را هنگام استفاده فراخوانی می‌کند.
   `csv-parser.js` پس از آن بارگذاری می‌شود؛ parser مستقل ورود CSV با تست واحد است.
   تبدیل‌های مستقل شمسی/میلادی در بازهٔ ۲۰۰۰ تا ۲۰۵۰ با تقویم Persian در Intl و تبدیل رفت‌وبرگشت آزمایش می‌شوند.
   `password-service.js` ساخت و بررسی هش PBKDF2 و سازگاری رمز قدیمی را بر عهده دارد؛ به DOM یا state وابسته نیست. این سرویس داده‌های پایگاه را رمزگذاری نمی‌کند.
   `dialogs-ui.js` پس از helperهای legacy و پیش از `course-ui.js` بارگذاری می‌شود؛ مالک بازوبسته‌شدن modal، بازگرداندن فوکوس، تشخیص تغییر فرم و قفل کنترل‌ها هنگام ذخیره است. render و تقویم را از APIهای legacy فراخوانی می‌کند.
3. `grade-policy.js` و `course-ui.js`: قواعد و factory تنظیمات درس؛ پیش از ساخت `EduV24` بارگذاری می‌شوند.
4. `workspace-records.js` سپس `workspace-runtime.js`: codec رکوردها از طریق factory، clone و اعتبارسنجی را دریافت می‌کند؛ runtime مالک state دوره، ذخیره‌سازی، backup و ساخت `EduV24` است و هنوز نیازمند تفکیک داخلی است.
   `history-changes.js` پیش از runtime بارگذاری می‌شود؛ تفاوت داده‌ها را برای تاریخچه تولید و فیلدهای password را حتی هنگام افزودن/حذف یک شیء کامل پوشانده نگه می‌دارد.
   `record-commit-plan.js` پس از تاریخچه و پیش از runtime، فهرست نوشتن/حذف و دادهٔ undo را بدون تغییر ورودی محاسبه می‌کند.
   `record-transaction.js` تراکنش اتمیک records/catalog/events/undo و بررسی revision و عنوان تکراری را انجام می‌دهد. runtime نتیجهٔ موفق را در حافظه اعمال می‌کند و هنگام WORKSPACE_CONFLICT ذخیره را مسدود می‌کند.
   `full-backup-validator.js` پیش از runtime بارگذاری می‌شود؛ قواعد پشتیبان نسخه‌های ۱/۲ و schemaهای ۲۵/۲۶ را اجرا می‌کند. اعتبارسنج‌های دامنه را از factory دریافت می‌کند و خودش DOM یا پایگاه را تغییر نمی‌دهد.
   `frozen-report-validator.js` ساختار کارنامهٔ ثابت و سازگاری محاسبات ذخیره‌شده را بررسی می‌کند؛ helperهای دامنه را هنگام validate دریافت می‌کند و دادهٔ تاریخی را تغییر نمی‌دهد.
5. `pwa-manifest.js`: راه‌اندازی manifest
6. `app-shell-ui.js`: وابسته به DOM و APIهای public رابط
7. `pwa-ui.js`: وابسته به DOM و service worker
8. `periodic-reports.js`: وابسته به `EduV24` و `EduPolicy`؛ صادرکنندهٔ `EduPeriodicReports`

هر فایل جدید باید هم در `service-worker.js`، هم در سرور test harness، و هم در
آزمون upgrade PWA ثبت شود. در غیر این صورت نصب تازهٔ آفلاین نباید منتشر شود.

## گام بعدی

هستهٔ باقی‌مانده باید بر اساس مسئولیت، نه صرفاً تعداد خط، به این مرزها تقسیم شود:

- `data-store.js`: IndexedDB، تراکنش، revision و migration
- `backup-service.js`: snapshot، export/import و restore
- `workspace-service.js`: دورهٔ تحصیلی، وضعیت جاری و تعارض تب‌ها

تا وقتی آزمون‌های داده برای هر مرز جدا نشده‌اند، این سه بخش نباید هم‌زمان جابه‌جا شوند.
