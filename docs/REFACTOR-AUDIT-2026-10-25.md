# ممیزی تطبیقی و نقشهٔ اجرای بازنویسی EduManager

تاریخ: `2026-10-25`  
وضعیت سند: خط مبنای ممیزی؛ فاز A و اصلاحات فاز B در جریان است.  
مرجع بیزینس: کد واقعی پروژهٔ اصلی، قراردادهای داده و سناریوهای آزمون؛ ادعای تکمیل در گفتگو یا صرف وجود یک صفحه، معیار پذیرش نیست.

## ۱. محدوده و نتیجهٔ فعلی

دو پروژهٔ مستقل بررسی شده‌اند:

- مبدأ و مرجع رفتار: `D:\2-Projects\02-1405\edu-manager`، شامل `EduManager.html`، اسکریپت‌های `assets/scripts`، سرویس‌ورکر و آزمون‌های `audit`.
- مقصد بازنویسی: `D:\2-Projects\02-1405\app`، برنامهٔ React / TypeScript / Tailwind با IndexedDB و Dexie.

مقصد، بخشی از جریان مدرسه، کلاس، هنرجو، درس، ثبت نمره، جلسه و دوره را دارد؛ هنوز معادل کامل برنامهٔ اصلی نیست. انتقال کامل پشتیبان legacy، مدل نمرهٔ فنی قدیمی، برنامهٔ هفتگی، گزارش‌های تفصیلی و سالانه، بستن دوره و کارنامهٔ ثابت، تاریخچه و بازگردانی، حفاظت هم‌زمانی و PWA هنوز کامل و پذیرفته نشده‌اند.

در این ممیزی، شواهد بر اساس مسیر و نام تابع ثبت شده‌اند؛ شماره‌خط مرجع ثابت نیست، زیرا کد اصلی هم‌زمان در حال تفکیک افزایشی است. فایل‌های دادهٔ شخصی، پروفایل اصلی مرورگر و IndexedDB کاربر مبنای آزمون نیستند. آزمون مرورگری باید با دادهٔ ساختگی و پروفایل مستقل انجام شود.

این سند، مجوز حذف یا تبدیل دادهٔ واقعی نیست. هر انتقال باید preview، اعتبارسنجی، تراکنش و گزارش نتیجه داشته باشد. قالبی که هنوز تمام فیلدهایش پشتیبانی نمی‌شود باید با توضیح روشن رد شود؛ حذف خاموش بخش‌های ناشناخته پذیرفته نیست.

## ۲. تعریف وضعیت‌ها

| وضعیت | معنی |
| --- | --- |
| جزئی | کد یا رابط اولیه وجود دارد؛ همهٔ رفتارها و سناریوهای مبدأ پوشش ندارند. |
| در حال اصلاح؛ پذیرش پس از تست | اصلاح P0 در این دور انجام می‌شود، اما تا ثبت نتیجهٔ تست، تکمیل محسوب نمی‌شود. |
| پیاده نشده / پذیرفته نشده | برابری رفتار با مرجع، کد کافی یا آزمون پذیرش ندارد. |
| تأییدشده | فقط پس از ثبت دستور، نتیجهٔ واقعی آزمون و محدودهٔ آن در بخش ۹ مجاز است. |

در زمان نگارش، هیچ ردیف بزرگِ تاریخچه، هم‌زمانی، دورهٔ بسته، legacy full backup یا PWA مقصد، «تأییدشده» نیست.

## ۳. قراردادهای غیرقابل حذف بیزینس و داده

### ۳.۱. سه مدل واقعی نمره

| مدل | ساختار و محاسبهٔ مرجع | محدودیت مهاجرت |
| --- | --- | --- |
| کاردانش | `gradeMode: "kardanesh"`؛ نمرات خام در `kardaneshScores`؛ میان‌ترم و پایان‌ترم، هرکدام عملی × ۷۰٪ + نظری × ۳۰٪؛ حد قبولی ۱۴. | نمرات پایان‌ترم قدیمی نباید به میان‌ترم ساختگی تبدیل شوند. خالی با صفر متفاوت است. |
| پودمانی رسمی فنی | `gradingPolicy.method: "modular"` و `poudmans[].podScores`؛ مستمر + شایستگی × ضریب؛ شرط حد شایستگی، حد پودمان و gate احتمالی. | نمرهٔ رسمی پودمان مستقل از نمرهٔ واحد قدیمی است. همهٔ پودمان‌ها برای قبولی لازم‌اند. |
| فنی قدیمی مبتنی بر واحد | درس `standard` بدون policy رسمی؛ `unitScores.m/p`، وزن‌های مستمر/پایانی و `applyOptions`؛ برخی نمرات از آخرین جلسه خوانده می‌شوند. | نباید به `dual` یا پودمان رسمی با نمرهٔ جعلی تبدیل شود. حفظ مستقیم داده یا مسیر legacy صریح لازم است. |

شاهد: `EduManager.html`، توابع `calcStudentLessonBase`، `calcStudentLesson`، `calcV24` و `assessmentResult`؛ `assets/scripts/grade-policy.js`، توابع `dual`، `moduleResult` و `lesson`.

مقایسهٔ قبولی پیش از گردکردن نمایشی انجام می‌شود. در سالانهٔ کاردانش، میانگین مساوی چهار مرحلهٔ دو نوبت از هشت نمرهٔ خام محاسبه می‌شود؛ نبود هر مؤلفه، نتیجه را ناقص نگه می‌دارد. میانگین موقت پودمانی با نتیجهٔ نهایی و قبولی آن یکی نیست.

### ۳.۲. هویت مشترک بین دوره‌ها

`createNewPeriod` فهرست و تعریف‌های مبدأ را کپی می‌کند و شناسهٔ مدرسه، کلاس، درس و هنرجو را نگه می‌دارد؛ workspace جدید ساخته می‌شود. `annualGradeRows` با همین هویت‌های پایدار، دو نوبت را تطبیق می‌دهد. همچنین یک هنرجو می‌تواند با همان شناسه در عضویت کلاس دیگر حضور داشته باشد؛ نام مشابه دلیل ادغام افراد نیست.

در مقصد فعلی، جدول‌های مدرسه و کلاس primary key سادهٔ `id` دارند. این ساختار پیش از پشتیبانی full legacy و کپی دوره باید تعیین تکلیف شود: کلید مرکب مانند `[workspaceId+id]` یا کلید فیزیکی مستقل همراه با هویت مبدأی پایدار. تغییر مستقل تمام شناسه‌ها در هر دوره نیز تطبیق گزارش سالانه را خراب می‌کند. تصمیم نهایی باید migration افزایشی و آزمون رفت‌وبرگشت داشته باشد.

شاهد: `EduManager.html`، `createNewPeriod`، `annualGradeRows`، `restoreFullBackup` و `saveMembership`؛ مقصد: `src/data/db.ts` و `src/domain/model.ts`.

### ۳.۳. جلسه، زمان و حضور

- `period` ذخیره‌شده در مبدأ صفرمبنا و در بازهٔ `0..11` است؛ شمارهٔ نمایشی زنگ `period + 1` است. این قرارداد با ورودی یک‌مبنای فرم اشتباه نشود.
- یکتایی جلسه بر اساس کلاس، تاریخ و زنگ است؛ درس متفاوت، مجوز ساخت جلسهٔ دوم در همان جایگاه نیست.
- تاریخ باید روز تقویمی واقعی باشد؛ تطبیق صرف الگوی `YYYY-MM-DD` کافی نیست.
- جلسه با `attendance: {}` ایجاد می‌شود؛ تعیین‌نشده از حاضر، غایب و تأخیر جداست. نبود جلسه، غیبت نیست.
- تأخیر می‌تواند دقیقهٔ `0..999` داشته باشد، مانند `late:10`؛ تبدیل آن به فقط `late` اتلاف داده است.
- `roster` عکس فهرست جلسه است. تغییر نام یا بایگانی/افزودن عضو، تاریخچهٔ جلسات گذشته را بازنویسی نمی‌کند؛ اصلاح هویت بازیابی‌شده مسیر صریح جدا دارد.

شاهد: `EduManager.html`، `validateDB`، `addManualSession`، `snapshotRoster`، `toggleAtt`، `historicalRoster` و `freezeClassRosters`؛ `assets/scripts/periodic-reports.js`، `attendance` و `build`.

### ۳.۴. نسخه‌ها و قرارداد ذخیره‌سازی مبدأ

این سه عدد مستقل‌اند: نسخهٔ فیزیکی IndexedDB، `schemaVersion` داده و نسخهٔ قالب backup.

```text
IndexedDB: EduManagerProfessional
minimum physical version: 2
data schema: 26؛ نسخه‌های قدیمی پشتیبانی‌شده: 22..26

stores:
  records(key)
  catalog(id)
  events(id autoIncrement، index workspace)
  backups(id)
  undo(id)
  reports(id)
  drafts(key، index workspace)

catalog:
  id, year, term, termKind?, revision, closed,
  createdAt, updatedAt, closedAt?, reportNotesRecovery?

records:
  key = workspaceId + "|" + logical
  workspace = workspaceId
  logical = "meta" | "class:" + id | "session:" + id
  value = record data

meta:
  schemaVersion, settings, masterSchedule, activeDays, periods,
  migrationWarnings?, layout:[{id:schoolId,name,classes:[classId,...]}]
```

شاهد: `assets/scripts/data-store-schema.js`؛ `EduManager.html`، `metaValue`، `collectRecords`، `logicalRecordType`، `decodeWorkspaceRecords` و `installWorkspace`.

### ۳.۵. قرارداد backup و restore

```text
خروجی یک دورهٔ مبدأ:
  version:25, exportedAt, excludedDrafts,
  period:{year,term}, db:{schemaVersion:26,...}

خروجی کامل مبدأ:
  format:"EduManager.FullBackup", version:2, schemaVersion:26,
  exportedAt, activeWorkspace, snapshotNotes,
  stores:{records,catalog,events,backups,undo,reports},
  reportDrafts:{workspaceId:{noteKey:text}},
  gradeDrafts:[{key,workspace,generation,entries,updatedAt}]
```

نسخهٔ ۱ full backup نیز مسیر سازگاری دارد. Full restore مبدأ، دوره‌ها را با workspace ID تازه اضافه می‌کند؛ دادهٔ موجود را overwrite نمی‌کند. IDهای درون دوره برای حفظ هویت باقی می‌مانند. یادداشت‌های گزارش و جفت‌نوبت سالانه به IDهای تازه remap می‌شوند. پیش‌نویس‌های واردشده review-only هستند و خودکار به نمره تبدیل نمی‌شوند. دوره‌ها، نسخهٔ recovery یادداشت‌ها و پیش‌نویس‌ها باید با یک تراکنش ثبت شوند. Full snapshot داخل full snapshot بعدی تو در تو جاسازی نمی‌شود.

`EduManager.ReactBackup` مقصد قالبی مستقل است. ارتقای آن به نسخهٔ ۲ و افزودن workspaces به معنی پشتیبانی از `EduManager.FullBackup` مبدأ نیست.

شاهد: `EduManager.html`، `snapshotInstallation`، `validateFullBackup`، `restoreFullBackup`، `exportBackupV24`، `remapReportNoteKey` و `portableGradeDrafts`؛ مقصد: `src/data/backup.ts`.

## ۴. ماتریس پوشش قابلیت‌ها

مسیرهای `src/...` در این جدول نسبت به پروژهٔ React، و مسیرهای دیگر نسبت به پروژهٔ اصلی هستند. ردیف‌ها عمداً ریزتر از نام صفحه‌اند تا وجود یک صفحه، تکمیل همهٔ رفتارهای آن تلقی نشود.

| شناسه | قابلیت و قاعدهٔ لازم | شاهد در مبدأ | وضعیت واقعی مقصد / محل پیگیری |
| --- | --- | --- | --- |
| F01 | دورهٔ مستقل، سال متوالی، عنوان و نوع نوبت مستقل؛ اول/دوم/تابستان | `EduManager.html`: `installWorkspace`, `academicTermKind`, `createNewPeriod` | جزئی؛ `src/features/periods/period-repository.ts` فعلاً اول/دوم دارد؛ عنوان سفارشی و تابستان کامل نیست. |
| F02 | انتخاب دوره و مالکیت مدرسه/کلاس/درس/جلسه؛ مسیر مستقیم و عملیات repository نیز محدود باشند | `checkScope`, `assertWorkspaceContext`, `assertEntityWritable` | در حال اصلاح؛ پذیرش پس از تست؛ `src/data/workspace-context.ts`, `src/app/WorkspaceRoute.tsx` و repositoryها. |
| F03 | ایجاد دوره از فهرست فعال و برنامه، بدون نمره/جلسه/بایگانی؛ حفظ هویت بین نوبت‌ها | `createNewPeriod`, `EduPolicy.identity` | پیاده نشده / پذیرفته نشده؛ مدل کلید دوره‌ای پیش‌نیاز است. |
| F04 | بستن دوره با تکمیل نمره و تأیید policy؛ کارنامه ثابت و بازگشایی بدون تغییر نسخه قدیمی | `finalReportData`, `finalizePeriod`, `reopenPeriod`, `showFrozenReport` | پیاده نشده / پذیرفته نشده؛ وجود revision در Workspace به معنی این قابلیت نیست. |
| F05 | افزودن/اصلاح مدرسه و کلاس، یکتایی نام نرمال‌شده، فرم مقصد و revision معتبر | `createEntityV24`, `openEntityEditor`, `saveEntityEditor`, `normalizedName` | جزئی؛ `src/features/schools` و `src/features/classes`؛ scoped read/write در حال اصلاح و نیازمند تست است. |
| F06 | حذف با نمایش اثر، تایپ نام، پشتیبان موفق پیش از حذف، حذف روابط و Undo | `deletionTarget`, `openDeletion`, `confirmDeletion` | جزئی؛ حذف ساده/cascade موجود است؛ برابری کامل و بازیابی حذف پذیرفته نشده. |
| F07 | هویت هنرجو، کد اختیاری یکتا در فعال و بایگانی، حفظ صفر ابتدایی، رقم فارسی/عربی و هم‌نام مستقل | `studentIdentity`, `applyStudentIdentity`, `validateV24` | جزئی؛ `src/features/students/student-repository.ts` و تست آن؛ همهٔ سناریوهای legacy هنوز پوشش ندارند. |
| F08 | مرتب‌سازی خانوادگی فارسی، جست‌وجوی فهرست و مسیر اصلاح هویت recovered | `getSortedStudents`, `filterStudentRoster`, `applyStudentIdentity` | جزئی؛ مرتب‌سازی/نمایش اولیه؛ recovery و parity کامل پذیرفته نشده. |
| F09 | بایگانی/بازگردانی با حفظ نمره و roster تاریخی، بدون تغییر عضویت کلاس دیگر | `archiveStudent`, `openMembership`, `saveMembership` | جزئی؛ `archivedAt` در مقصد وجود دارد؛ import حفظ archive در حال اصلاح، پذیرش پس از تست. |
| F10 | انتقال در برابر کپی؛ شناسه ثابت در انتقال، شناسه تازه در کپی، فعال‌سازی سوابق مقصد و عدم انتقال نمرات | `saveMembership` | پیاده نشده / پذیرفته نشده. |
| F11 | CSV با parser صحیح، preview، تصمیم صریح هم‌نام، update فقط با کد و atomic commit | `parseCSV`, `csvPlan`, `csvImportV24`, `commitCSV`, `downloadCSVTemplate` | پیاده نشده / پذیرفته نشده. |
| F12 | شناسنامه درس: دبیر، زنگ هفتگی، پایه، رشته، کد، متولی؛ جدایی metadata فعلی از policy تاریخی | `assets/scripts/course-ui.js`: `open`, `save`؛ `grade-policy.js`: `identity` | جزئی؛ `src/features/lessons`؛ metadata و policy تاریخی کامل مدل نشده‌اند. |
| F13 | قواعد version/revision/year، تأیید با کد، ابلاغیه؛ قفل روش و قواعد پس از نمره؛ کپی بدون نمره | `grade-policy.js`: `validate`, `hasGrades`, `freshCopy`؛ `course-ui.js`: `save`, `copy` | جزئی؛ حفاظت‌های P0 درس در حال اصلاح، پذیرش پس از تست؛ policy کامل/کپی تعریف هنوز ناتمام است. |
| F14 | پودمان/واحد: شناسه پایدار، تعداد معتبر، اصلاح نام پس از نمره، ممنوعیت بازسازی ساختار دارای جلسه | `course-ui.js`: `applyStructureNames`, `openNames`, `save`؛ `validateCourse` | جزئی؛ `src/features/lessons/structure-repository.ts`؛ حفاظت سوابق در حال اصلاح، پذیرش پس از تست. |
| F15 | کاردانش میان‌ترم و پایان‌ترم مستقل، ۷۰/۳۰، حد۱۴، شش اعشار، صفر معتبر و مقایسه دقیق | `grade-policy.js`: `parse`, `dual`؛ `assessmentResult`, `weightedKardanesh` | جزئی؛ `src/domain/grades.ts`, `src/features/grades`؛ تست فرمول وجود دارد، پذیرش کامل مسیر و ذخیره جداست. |
| F16 | سالانهٔ کاردانش از چهار مرحله و هشت خام، تطبیق هویت و نوبت‌های واقعی | `annualGradeRows`, `prepareAnnualReportSnapshot` | جزئی در تابع محاسبه؛ گزارش سالانه و join دو دوره پیاده نشده / پذیرفته نشده. |
| F17 | پودمانی رسمی، گام مستمر، شایستگی۱/۲/۳، حد پودمان/gate، جبران و نتیجهٔ درس فقط با قبولی همه | `grade-policy.js`: `parse`, `moduleResult`, `lesson` | جزئی؛ `src/domain/grades.ts`, `src/features/grades`؛ نتیجهٔ کامل درس و policy تاریخی نیازمند تکمیل است. |
| F18 | فنی قدیمی: unitScores، وزن۴۰/۶۰، آخرین جلسه، direct override و applyOptions | `calcStudentLessonBase`, `calcV24` | پیاده نشده / پذیرفته نشده؛ تبدیل خودکار این مدل ممنوع است. |
| F19 | برنامه هفتگی all/odd/even، روز فعال، تعداد زنگ، شنبه مبنا، فیلتر کلاس و ورود جلسه | `getWeekParity`, `getMasterEntry`, `saveMasterConfig`, `saveWeekStartDate`, `changePeriods` | پیاده نشده / پذیرفته نشده. |
| F20 | ایجاد جلسه واقعی، date صحیح، period صفرمبنا۰..۱۱، یکتایی class/date/period و برخورد درس دیگر | `addManualSession`, `startSessionFromMaster`, `validateDB` | جزئی؛ `src/features/sessions/session-repository.ts`؛ اصلاح قرارداد زنگ/تاریخ و scoping در حال انجام، پذیرش پس از تست. |
| F21 | roster تاریخی، انتخاب پودمان/واحد جلسه، تغییر تاریخ، حذف یک/همه جلسات و حفظ مالکیت | `snapshotRoster`, `historicalRoster`, `saveSessionUnitV24`, `changeSessionDate`, `deleteSession`, `deleteAllSessions` | جزئی؛ roster اولیه موجود؛ پیوند ساختار و عملیات کامل جلسه پذیرفته نشده. |
| F22 | حضور تعیین‌نشده، حاضر/غایب، تأخیر با دقیقه، پاک‌کردن ثبت و ثبت گروهی بر roster | `toggleAtt`, `setAllAttendanceV24`؛ `periodic-reports.js`: `attendance` | جزئی؛ اصلاح اولیهٔ همه‌حاضر به unset در حال انجام، پذیرش پس از تست؛ دقیقه/گروهی/پاک‌کردن کامل نیازمند تکمیل است. |
| F23 | هفت نوع ثبت جلسه، جدایی grade۰..۲۰ و points۰..۱۰۰۰، یادداشت، timestamp و حذف ثبت | `TYPE_LABELS`, `addSessionScoreV24`, `removeSessionScore` | جزئی؛ مقصد activity/classGrade/homework دارد؛ positive/negative و قرارداد legacy کامل نیست. |
| F24 | میز کار روزانه، برنامه امروز، حضور تعیین‌نشده، نمره ناقص/نیازمند جبران و عبور تاریخ روز | `dashboardWorkModel`, `dashboardEnsureToday`, `renderDashboardWork` | جزئی؛ `src/features/dashboard` آمار و جلسات اولیه دارد؛ workflow کامل پذیرفته نشده. |
| F25 | گزارش روزانه/هفتگی/ماهانه شمسی/سال تحصیلی، محدوده و snapshot معتبر | `periodic-reports.js`: `range`, `build`, `generate`؛ `prepareReportSnapshot` | پیاده نشده / پذیرفته نشده؛ `src/features/reports` فعلاً خلاصهٔ ساختار آموزشی است. |
| F26 | گزارش اولیا فقط یک فرد، عضو بایگانی/تاریخی، جزئیات summary/full، نفرـجلسه و نرخ بدون unset | `periodic-reports.js`: `build`, `reportParticipants`, `documentHtml` | پیاده نشده / پذیرفته نشده؛ چاپ جدول آمار معادل این قابلیت نیست. |
| F27 | انتخاب دو دوره واقعی در سالانه، نقش first/second، سال مشترک، رمز نوبت دیگر و یادداشت جفت | `prepareAnnualReportSnapshot`, `listAnnualReportPeriods` | پیاده نشده / پذیرفته نشده. |
| F28 | گزارش جامع/درس/کارنامه کلی و تفصیلی، متن والدین و نمرهٔ فعلی با مرزبندی زمانی روشن | `generateGlobalReport`, `buildLessonReportHtml`, `overviewV24`, `detailedV24`, `parentReportV24` | پیاده نشده / پذیرفته نشده؛ فقط گزارش ساختار اولیه وجود دارد. |
| F29 | note مستقل هر دوره/محدوده/بازه، متن خالی صریح، retry خطای ذخیره، بازیابی notes و remap جفت | `periodic-reports.js`: `noteKey`, `persistNote`, `getDrafts`, `restoreDrafts`؛ `remapReportNoteKey` | پیاده نشده / پذیرفته نشده. |
| F30 | پیش‌نویس نمره جدا از durable، نگهداری invalid، IDB+local، revision review و مصرف یک‌بار نشست دیگر | `storeDrafts`, `loadDrafts`, `flushDrafts`, `recoverDrafts`, `adoptDrafts` | پیاده نشده / پذیرفته نشده. |
| F31 | backup مقصد با workspaces، schema دقیق، graph ownership، collision rejection و restore atomic | مرجع: `snapshotInstallation`, `validateFullBackup`, `restoreFullBackup` | در حال اصلاح؛ پذیرش پس از تست؛ `src/data/backup.ts` نسخه۲ React و `src/data/schema.ts`؛ این پشتیبانی full legacy نیست. |
| F32 | import سادهٔ قابل‌پشتیبانی: preview، archive، ID mapping، نمره صفر، رد مدل/بخش ناسازگار بدون اتلاف | `normalizeDB`, `previewImport`, `confirmImport`, `validateV24` | در حال اصلاح؛ پذیرش پس از تست؛ `src/features/import/legacy-import.ts` باید fail-closed باشد. |
| F33 | full legacy v1/v2 و single-period، همه دوره‌ها/stores/notes/drafts/frozen reports و rollback کامل | `validateFullBackup`, `restoreFullBackup`, `exportBackupV24`, `confirmImport` | پیاده نشده / پذیرفته نشده؛ importer محدود معادل مهاجرت کامل نیست. |
| F34 | پشتیبان داخلی روزانه/پیش از عملیات، نگهداری۸نسخه و full خودکار۲۰دقیقه هنگام فعالیت | `putBackup`, `ensureDailyBackup`, `automaticFullBackup`, `startAutomaticBackups` | پیاده نشده / پذیرفته نشده. |
| F35 | تاریخچه diff، فایل جزئیات، Undo معتبر آخرین تغییر با کنترل revision و حفظ عنوان بازیابی | `changesBetween`, `validatedUndoCandidate`, `performUndo`, `downloadHistoryEvent` | پیاده نشده / پذیرفته نشده. |
| F36 | صف نوشتن، optimistic revision، stale form، BroadcastChannel، tab collision و rollback حافظه | `commitRecords`, `saveDBV24`, `assertWorkspaceContext`, `claimTab`, `tabMessage` | پیاده نشده / پذیرفته نشده؛ scoping اولیه و تراکنش ساده جای آن را نمی‌گیرد. |
| F37 | رمز دوره، ویرایش تنظیمات با حفظ فرم و کنترل context؛ پاک‌سازی کامل همراه reset epoch | `hashPassword`, `verifyPassword`, `saveSettingsV24`, `confirmWipe`, `resetDatabase` | پیاده نشده / پذیرفته نشده. |
| F38 | PWA staging/upgrade/offline، خروجی JSON/TXT/CSV و print snapshot، دسترس‌پذیری/RTL/موبایل | `service-worker.js`؛ `pwa-ui.js`: `update`؛ `downloadLocalFile`, `printReport`, `showModal`, `setControlLock` | جزئی در RTL، UI و print ساده؛ PWA، lifecycle فایل، فوکوس و تست واقعی دستگاه پذیرفته نشده. |

## ۵. ریسک‌های بازنویسی و اولویت

| اولویت | ریسک / شاهد | الزام عبور |
| --- | --- | --- |
| P0 | primary key ساده در مقصد در برابر هویت مشترک چند دوره؛ `src/data/db.ts` و `createNewPeriod` | طراحی کلید و migration پیش از full import و clone period؛ تست دو نوبت با IDهای یکسان. |
| P0 | strip خاموش دادهٔ legacy یا تبدیل همهٔ درس‌ها به dual؛ importer اولیه | reject صریح بخش/مدل پشتیبانی‌نشده؛ حفظ archive و raw backup؛ هیچ import ظاهراً موفق با اتلاف فیلد. |
| P0 | backup فاقد دوره یا با graph ناسازگار و overwrite هنگام restore | نسخه۲ React شامل workspaces؛ validation کل گراف پیش از write؛ رد اتمیک collision. اصلاح جاری تا پس از تست باز است. |
| P0 | دسترسی مستقیم route/repository به رکورد دورهٔ دیگر | همهٔ خواندن/نوشتن‌های scoped و روابط والد بررسی شوند؛ تست bypass رابط. اصلاح جاری تا پس از تست باز است. |
| P0 | تغییر قواعد/ساختار درس دارای نمره/جلسه و پاک‌شدن سوابق | بررسی در repository، نه صرفاً disabled UI؛ حفظ شناسه و قابلیت ویرایش نام؛ تست عدم تغییر DB پس از رد. |
| P0 | پیش‌فرض حضور حاضر، تاریخ غیرواقعی، زنگ یک‌مبنا در داده | unset اولیه، اعتبارسنجی روز واقعی، قرارداد storage صفرمبنا؛ تست مرزها و برخورد. |
| P1 | صفر به missing تبدیل شود یا rounded grade قبول شود | تست صفر، ناقص، نزدیک حد، شش اعشار و سالانه از خام؛ محاسبه و نمایش جدا. |
| P1 | roster از فهرست جاری بازسازی و تاریخ گذشته تغییر کند | snapshot پایدار، نگهداری عضو بایگانی و tests تغییر نام/افزودن/انتقال پس از جلسه. |
| P1 | دقیقه تأخیر، type فعالیت، note و recordedAt از بین برود | گسترش مدل پیش از انتقال داده؛ round-trip تمام انواع. |
| P1 | شخص با نام یکسان ادغام شود یا کد صفرابتدایی تغییر کند | هویت IDمحور، کد رشته و نرمال‌سازی رقم، تصمیم صریح CSV؛ تست فعال+بایگانی. |
| P1 | فنی قدیمی و رسمی در گزارش یکی شوند | سه مدل جدا با مبنای محاسبه نمایان؛ عدم ساخت policy/نمرهٔ جعلی. |
| P1 | parent JSON حاوی افراد دیگر یا snapshot سالانه stale باشد | فیلتر در مدل گزارش، نه فقط DOM؛ کنترل revision هر دو نوبت؛ تست محتوای JSON/TXT/چاپ. |
| P1 | draft نامعتبر ثبت یا گم شود؛ خطای ذخیره فرم را پاک کند | durable/draft مجزا، review تعارض، retry قابل‌اعتماد و آزمون شکست واقعی ذخیره. |
| P1 | نوشتن دو تب یا فرم قدیمی، ثبت دوره بسته، پاک‌سازی ناقص و بازگشت legacy | revision تراکنشی، closed guard، reset lifecycle و browser fault tests پیش از انتشار. |
| P1 | نصب/ارتقای آفلاین مقصد ناقص باشد | cache کامل atomic، حفظ نسخه قبل در failure، flush drafts و تست دو انتشار. |

## ۶. مسیر مرحله‌به‌مرحله و معیار پذیرش

هر فاز با تغییرات قابل بازبینی، آزمون متناسب و ثبت نتیجهٔ واقعی بسته می‌شود. فازها نقش‌های بیزینسی را روشن می‌کنند؛ توسعهٔ UIهای مستقل می‌تواند موازی باشد، اما دادهٔ واقعی پیش از عبور فازهای قرارداد و migration منتقل نمی‌شود.

### فاز A — ممیزی و تثبیت خط مبنا؛ جاری

- ثبت قابلیت‌ها، سه مدل نمره، نسخه‌های داده و خطرهای عدم‌اتلاف در همین سند.
- تفکیک وضعیت واقعی React از ادعاهای قبلی و از نتایج تاریخی آزمون مبدأ.
- ثبت baseline test/build، تشخیص worktree موجود و حفظ تغییرات غیرمرتبط.

معیار پذیرش: هر یک از F01 تا F38 شاهد کد و وضعیت مقصد داشته باشد؛ نتایج تازه و تاریخی برچسب جدا داشته باشند؛ موارد ناشناخته به‌صورت باز ثبت شوند. «کل پروژه تکمیل» در این فاز ادعا نمی‌شود.

### فاز B — سلامت پایهٔ داده و اصلاح P0؛ جاری

- backup نسخه۲ React با دوره‌ها، schema strict، بررسی روابط و رد اتمیک collision؛ سازگاری نسخه۱ فقط در محدوده‌ای که بدون حدس امن باشد.
- scoping در direct route و repository؛ حفاظت درس دارای سوابق؛ unset اولیهٔ حضور، تاریخ و زنگ صحیح.
- import محدود با حفظ بایگانی و fail-closed برای ساختار پشتیبانی‌نشده.
- integration tests بر IndexedDB ساختگی، بررسی rollback و عدم تغییر داده پس از رد عملیات.

معیار پذیرش: هیچ نمره orphan، مالکیت ناسازگار یا overwrite از restore وارد نشود؛ تغییر active workspace مانع نوشتن به مقصد دیگر باشد؛ دوره در backup رفت‌وبرگشت بماند؛ import ناسازگار صفر write داشته باشد؛ جلسهٔ تازه هیچ حضور ثبت‌شده نداشته باشد. نتایج تست و build باید در بخش۹ درج شوند. وضعیت فعلی «در حال اصلاح؛ پس از تست تیک نهایی» است.

### فاز C — مدل هویت دوره‌ای و migration افزایشی

- انتخاب و ثبت کلید فیزیکی/هویت پایدار و referenceهای scoped؛ طراحی schema ارتقای مقصد بدون حذف دادهٔ قبلی.
- مدل سه‌گانهٔ نمره، metadata و policy تاریخی، roster، دقیقهٔ تأخیر، همهٔ typeهای جلسه و termKind/label مستقل.
- مهاجرت داده‌های بدون دوره فقط با preview، انتخاب دوره و ثبت اتمیک؛ دادهٔ متعارض در حالت قابل بازبینی نگه داشته شود.

معیار پذیرش: دو نوبت با IDهای یکسان در مدرسه/کلاس/هنرجو/درس هم‌زمان ذخیره شوند؛ خواندن و نوشتن یکی دیگری را تغییر ندهد؛ هویت برای سالانه قابل تطبیق بماند؛ ارتقای DB مقصد از نسخه قبلی با دادهٔ ساختگی بدون اتلاف انجام شود.

### فاز D — انتقال کامل legacy و backup بازیابی‌پذیر

- پشتیبانی متمایز raw DB، single-period export، full v1/v2، همهٔ stores، notes، drafts و frozen reports.
- preview شمارش و موارد نیازمند بررسی؛ validation همهٔ گراف و کنترل آینده‌نسخه؛ mapping پایدار workspace/هویت؛ عدم overwrite.
- recovery صریح orphan legacy و review-only نگه‌داشتن draft؛ export/import رفت‌وبرگشت و گزارش موارد unsupported.

معیار پذیرش: fixture شامل هر سه مدل نمره، دو نوبت هم‌هویت، عضو بایگانی، late:N، activity۰/۱۰۰۰، grade۰/۲۰، policy/metadata، note و draft نامعتبر بدون اتلاف برگردد؛ malformed file و خطای تراکنش هیچ دادهٔ ناقصی ننویسد؛ current data پس از restore تغییری نکند.

### فاز E — مدرسه، کلاس و چرخهٔ کامل عضویت

- فرم بازبینی/بازگردانی ورودی، حفظ داده در خطا و stale-context guard.
- کد و نام، ترتیب فارسی و جست‌وجو، بایگانی، انتقال/کپی، بازیابی و CSV با تصمیم صریح.
- حذف با نمایش اثر و backup موفق و مسیر بازیابی؛ اتصال به تاریخچه هنگام آماده‌شدن فاز K.

معیار پذیرش: سناریوهای هم‌نام، کد فارسی/عربی و صفرابتدایی، duplicate فعال+بایگانی، انتقال رفت‌وبرگشت و CSV تکراری اجرا شوند؛ نمرهٔ مبدأ منتقل نشود؛ roster گذشته و تاریخچهٔ عضویت محفوظ بمانند؛ failure فرم را قابل retry نگه دارد.

### فاز F — درس، قواعد و ساختار آموزشی

- شناسنامه جاری جدا از قواعد تاریخی؛ version/revision، تأیید و ابلاغیه، کپی تعریف و تغییر سال.
- حفاظت قواعد پس از نمره؛ تغییر نام پودمان/واحد بدون تغییر شناسه؛ محدودیت بازسازی ساختار دارای جلسه.
- تعریف رسمی هر سه مدل نمره و نمایش مبنای مدل قدیمی به‌صورت صریح.

معیار پذیرش: اصلاح نام بعد نمره، policy/score/رابطه جلسه را ثابت نگه دارد؛ تغییر ممنوع از repository هم رد شود؛ copy فاقد نمره و با قواعد نیازمند تأیید باشد؛ تغییر metadata تاریخی را بازنویسی نکند.

### فاز G — برنامهٔ هفتگی و جلسات کامل

- timetable all/odd/even، روزها/تعداد زنگ/شنبه مبنا، فیلتر کلاس و ورود جلسه.
- session roster، تغییر تاریخ، پودمان/واحد، حضور unset و تأخیر دقیقه‌دار، ثبت گروهی، activity و grade جدا و حذف ثبت/جلسه.
- میز کار روزانه با دادهٔ واقعی و جلوگیری از اقدام روی روز گذشته پس از نیمه‌شب.

معیار پذیرش: اولویت odd/even بر all، زنگ۰ و۱۱، تاریخ واقعی، برخورد درس دیگر و uniqueness بررسی شود؛ همهٔ انواع فعالیت با note/time رفت‌وبرگشت بماند؛ عضویت جدید حاضر یا غایب جلسات قدیمی شمرده نشود؛ آمار روز عبور تاریخ را درست مدیریت کند.

### فاز H — ثبت نمره، نتایج و پیش‌نویس مقاوم

- میان‌ترم/پایان‌ترم کاردانش و سالانه از خام، پودمانی رسمی و جبران، فنی قدیمی از واحد و جلسات.
- draft جدا از durable در IDB، ورودی نامعتبر قابل بازیابی، clear صریح، نمایش دقیق و batch grade.
- conflict review و draft نشست دیگر همراه با integration فاز K.

معیار پذیرش: missing/zero، مرز۱۴، حد پودمان، گام مستمر، gate و incompleteها تست شوند؛ reload یا شکست ذخیره draft را از بین نبرد؛ draft ناسازگار خودکار به نمره تبدیل نشود؛ نتیجه رسمی فنی قدیمی جعل نشود.

### فاز I — گزارش‌ها و خروجی‌های قابل اتکا

- گزارش روزانه، هفته شنبه..جمعه، ماه شمسی، سال مهر..شهریور، مدیریت/اولیا، summary/full، جامع/درس/کارنامه.
- جفت واقعی نوبت‌ها، قواعد انتخاب و دسترسی، notes مستقل و remap؛ snapshot معتبر و ابطال preview stale.
- JSON/TXT/CSV/clipboard/print/PDF با lifecycle فایل و بازخورد درست درخواست/ذخیره.

معیار پذیرش: fixture شامل ماه اسفند کبیسه و مرز مهر، دو دوره بازیابی‌شده، هنرجوی بایگانی و late-minute تولید شود؛ parent output فقط یک فرد داشته باشد؛ نرخ حضور unset را حذف کند؛ JSON داده کامل همان محدوده را نگه دارد؛ نسخه stale صادر نشود؛ چاپ چندصفحه‌ای خوانا باشد.

### فاز J — دورهٔ بسته و کارنامهٔ ثابت

- validation کامل بستن دوره، backup پیش از بستن، freeze دادهٔ زمان صدور، read-only جامع و بازگشایی با حفظ snapshot قبلی.
- عنوان سفارشی و نوبت تابستان مستقل از نقش سالانه، cloning بدون سوابق و با هویت پایدار.

معیار پذیرش: نبود یکی از هشت خام کاردانش سالانه/چهار خام نوبت در جای مربوط، policy تأییدنشده یا کلاس بدون درس مانع بسته‌شدن لازم شود؛ ثبت هم‌زمان دو close فقط یک snapshot بسازد؛ تغییر پس از reopen کارنامه قبلی را تغییر ندهد؛ کارنامه‌های تاریخی فاقد assessment جدید خوانا بمانند.

### فاز K — تاریخچه، هم‌زمانی، backup داخلی و پاک‌سازی

- event/diff/Undo معتبر، نمایش و دریافت جزئیات؛ revision تراکنشی، صف writer و stale-form guard؛ پیام تب‌ها و مالک draft.
- backup داخلی با retention، زمان‌بندی۲۰دقیقه در فعالیت برنامه، بازیابی و رمز تنظیمات.
- پاک‌سازی کامل با epoch/reset marker و جلوگیری از بازگشت دادهٔ legacy یا نوشتن اتصال قدیمی.

معیار پذیرش: سناریوهای دو تب، quota، transaction abort، forced browser stop، retry undo و تنظیمات، close/restore هم‌زمان و cleanup ناموفق اجرا شوند؛ هیچ آخرین‌نویسنده‌ای بی‌اطلاع داده را بازنویسی نکند؛ پاک‌سازی ناموفق atomic باشد یا state قابل ادامه داشته باشد؛ نسخه سالم قبلی قابل بازیابی بماند.

### فاز L — PWA، دسترس‌پذیری، دستگاه واقعی و تحویل

- نصب و cache کامل منابع، ارتقای atomic بین دو انتشار، حفظ نسخه قبلی در شبکه ناقص، flush و reload کنترل‌شده.
- RTL، keyboard/focus/Escape، unsaved forms، تقویم شمسی، viewport/کیبورد، دانلود و چاپ در اندازه‌های مختلف.
- مستند اجرای توسعه، build، backup/restore و راهنمای انتقال؛ بستن ماتریس F01..F38 با شواهد یا محدودیت صریح مورد توافق.

معیار پذیرش: نصب تازه و اجرای روزمره بدون شبکه؛ ارتقای موفق و شکست‌خورده با حفظ داده؛ آزمون Android و iPhone/Safari واقعی برای نصب، کیبورد، دریافت فایل و print؛ هیچ ردیف بازِ مؤثر بر انتقال داده در تحویل نهایی پنهان نشود.

## ۷. قرارداد آزمون و شواهد موجود

مجموعه‌های مبدأ، مشخصات اجرایی قابل استفاده برای سناریوهای مقصد هستند، اما عبورشان به معنی سالم‌بودن React نیست:

- `audit/data-integrity.cjs`: شناسه‌ها، هویت/کد، مالکیت graph، نمره، roster، دوره، backup، undo و frozen report؛ سناریوهای میان‌ترم/سالانه و تقویم.
- `audit/workflow-review.cjs`: مرز activity در برابر classGrade، عدم گردکردن قبولی، incomplete close، draft نامعتبر جدا، بستن هم‌زمان، کارنامه قدیمی و ثابت، انتخاب نوبت واقعی، remap note و round-trip دو دوره.
- `audit/assets-contract.cjs`: ثبت assetهای استخراج‌شده در HTML، cache و سرورهای harness.
- `audit/data-store-contract.cjs`: نام DB، نسخه فیزیکی و قرارداد هفت مخزن.
- `audit/pwa-upgrade.cjs`: نصب/ارتقای دو انتشار، شکست دریافت و حفظ cache قبلی.

تست مقصد باید رفتار بیزینسی و عدم تغییر داده پس از خطا را بررسی کند؛ صرف snapshot JSX یا تکرار عین implementation کافی نیست. تست failure باید قبل/بعد دادهٔ پایدار را مقایسه کند. برای عملیات چندجدولی، مسیر شکست میانی و rollback ضروری است.

## ۸. محدودیت‌های باز و تصمیم‌های لازم

1. انتخاب مدل کلید دوره‌ای و strategy حفظ هویت legacy هنوز معیار پذیرش نشده است؛ full import و annual join به آن وابسته‌اند.
2. نسخهٔ backup مقصد و مبدأ جدا هستند؛ برای هر قالب باید محدوده پشتیبانی و نتیجهٔ preview روشن باشد.
3. مدل مقصد هنوز همهٔ metadata، policy، نمره واحد قدیمی، دقیقه تأخیر، typeهای فعالیت، گزارش ثابت و تاریخچه را ندارد؛ نباید این داده‌ها با schema ساده strip شوند.
4. `workspace.revision` به‌تنهایی کنترل تعارض نیست؛ باید داخل تراکنش مقایسه و افزایش یابد و context مصرف‌کننده بررسی شود.
5. رمز دوره محدودیت رابط و دسترسی محلی است؛ از آن ادعای رمزنگاری محتوای IndexedDB یا backup استنباط نشود.
6. نتایج تاریخی ۲۱۱/۲۵۴ آزمون در اسناد قبلی، اجرای تازهٔ این دور نیستند؛ فقط اجرای ثبت‌شده در بخش۹ قابل اعلام به‌عنوان نتیجهٔ جاری است.
7. شبیه‌سازی viewport جای آزمون Android/iPhone واقعی را نمی‌گیرد؛ این مورد تا ثبت شاهد دستگاه باز می‌ماند.

## ۹. دفتر ثبت اجرای واقعی این دور

این بخش را مسئول یکپارچه‌سازی، پس از پایان تغییرات و اجرای واقعی به‌روز می‌کند. ردیف pending نباید در گزارش نهایی به موفق تبدیل شود.

| پروژه | دستور / بررسی | نتیجهٔ مشاهده‌شده | محدوده / یادداشت |
| --- | --- | --- | --- |
| مبدأ | `node audit/assets-contract.cjs` | موفق؛ ۹ اسکریپت خارجی | بررسی خواندنی قرارداد asset؛ در ممیزی این دور اجرا شد. |
| مبدأ | `node audit/data-store-contract.cjs` | موفق؛ ۷ مخزن IndexedDB | بررسی خواندنی قرارداد اولیه؛ در ممیزی این دور اجرا شد. |
| مبدأ | ممیزی کد و فهرست F01..F38 | ثبت شد؛ بازبینی یکپارچه‌سازی باقی است | بدون استفاده از داده شخصی؛ ارجاع بر نام تابع. |
| مبدأ | `npm test` / browser integrity / browser persistence | در انتظار ثبت نتیجهٔ تازه | نتایج قدیمی اینجا جایگزین نتیجه تازه نیستند. |
| مقصد React | تست‌های واحد و integration اصلاحات فازB | در انتظار اجرای نهایی و ثبت تعداد واقعی | شامل backup/graph/collision، scoped repository، درس، unset و import. |
| مقصد React | `npm run build` | در انتظار اجرای نهایی | موفقیت build صرفاً type/bundle است، نه تکمیل بیزینس. |
| مقصد React | بازبینی UI و مسیر مستقیم | در انتظار ثبت | route دورهٔ دیگر، error/loading، مرور نمره/جلسه/مهاجرت. |
| مقصد React | migration full legacy، دو دورهٔ هم‌هویت | اجرا نشده / قابلیت تکمیل نشده | تا عبور فازهایC/D ادعای پشتیبانی نمی‌شود. |
| مقصد React | PWA و Android/iPhone واقعی | اجرا نشده / قابلیت تکمیل نشده | معیار انتشار فازL. |

## ۱۰. قاعدهٔ گزارش پیشرفت

هر تحویل باید روشن کند: چه رفتاری تغییر کرد، چه شاهدی آن را تأیید کرد، کدام آزمون واقعاً اجرا شد و کدام ردیف هنوز باز است. ادعای «هیچ چیز از قلم نیفتاده» فقط با بسته‌شدن این ماتریس و معیارهای پذیرش ممکن است؛ در طول توسعه، این سند فهرست کنترل زندهٔ موارد باقی‌مانده است.
