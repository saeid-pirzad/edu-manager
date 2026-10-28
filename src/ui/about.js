"use strict";

function openAboutDialog() {
  closeDataMenu();
  const opened = showModal(
    "درباره کلاس‌یار و ارتباط با ما",
    '<div class="about-app"><header class="about-hero"><span class="about-mark" aria-hidden="true">' +
      EduIcons.html("book") +
      '</span><div><span class="about-eyebrow">دفتر همراه هنرآموز</span><h4>کلاس‌یار</h4><p>از اولین کلاس تا آخرین کارنامه، کنار شما.</p></div></header>' +
      '<p class="about-description">مدیریت مدرسه‌ها و کلاس‌ها، حضور و غیاب، ثبت نمرات، برنامه هفتگی و تهیه گزارش؛ در یک فضای ساده و یکپارچه.</p>' +
      '<div class="about-features" aria-label="ویژگی‌های برنامه"><span>قابل استفاده آفلاین</span><span>نگهداری محلی اطلاعات</span><span>پشتیبان مستقل</span></div>' +
      '<section class="about-section"><h4>اطلاعات شما کجا نگهداری می‌شود؟</h4><p>اطلاعات در همین مرورگر و روی همین دستگاه ذخیره می‌شود. همگام‌سازی خودکار بین دستگاه‌ها وجود ندارد؛ برای نگهداری یا انتقال اطلاعات، پشتیبان کامل بگیرید.</p></section>' +
      '<section class="about-section about-contact"><h4>ارتباط با ما</h4><p>برای پرسش، پیشنهاد یا گزارش مشکل، از راه‌های زیر با سازنده در ارتباط باشید.</p>' +
      '<div class="about-contact-list"><a class="about-contact-link" href="mailto:saeid_pirzad@yahoo.com"><span>ایمیل</span><bdi dir="ltr">saeid_pirzad@yahoo.com</bdi></a>' +
      '<a class="about-contact-link" href="mailto:pirzad93@gmail.com"><span>ایمیل دیگر</span><bdi dir="ltr">pirzad93@gmail.com</bdi></a>' +
      "</div>" +
      '<a class="about-project-link" href="https://github.com/saeid-pirzad/edu-manager" target="_blank" rel="noopener noreferrer">صفحه پروژه در گیت‌هاب<span aria-hidden="true">↗</span></a></section>' +
      '<footer class="about-signature"><span>طراحی و توسعه نرم‌افزار</span><strong>سعید پیرزاد</strong><span class="about-role">هنرآموز کامپیوتر و توسعه‌دهنده فول‌استک</span><p>طراحی‌شده برای مدیریت آسان‌تر کلاس و ثبت دقیق سوابق آموزشی.</p></footer>' +
      '<div class="about-actions"><button type="button" class="ghost" data-about-action="offline">راهنمای نصب و استفاده آفلاین</button><button type="button" class="ghost" data-about-action="close">بستن</button></div></div>',
  );
  if (opened !== false) document.getElementById("modalBody").scrollTop = 0;
}

document.addEventListener("click", (event) => {
  const control = event.target.closest?.("button[data-about-action]");
  if (
    control?.dataset.aboutAction === "open" &&
    !control.disabled &&
    !control.closest("[inert]") &&
    control.closest("#app .schools-welcome")
  ) {
    openAboutDialog();
    return;
  }
  if (!control || control.disabled || !control.closest("#modalBody .about-app"))
    return;
  if (control.dataset.aboutAction === "close") closeModal();
  else if (control.dataset.aboutAction === "offline") window.EduPWA?.help();
});
