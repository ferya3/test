# آزمون عملکرد پیوستهٔ دیداری‌شنیداری به سبک IVA-2 (فارسی/انگلیسی)

[English below](#english)

برنامه‌ای مستقل و آفلاین که پارادایم آزمون **IVA-2** (Integrated Visual and Auditory Continuous Performance Test) را با
دستورالعمل، صدا و گزارش **فارسی** (و انگلیسی) اجرا می‌کند. به نصب، سرور یا اینترنت نیاز ندارد.

> **هشدار:** این برنامه نسخهٔ رسمی IVA-2 (محصول BrainTrain) نیست، هنجارهای آن را ندارد و نمره‌هایش با IVA-2 قابل مقایسه
> نیست. نتیجهٔ هیچ آزمون عملکرد پیوسته‌ای به‌تنهایی برای تشخیص ADHD کافی نیست و باید توسط متخصص و در کنار سایر
> ارزیابی‌ها تفسیر شود.

## اجرا

1. فایل `iva2/index.html` را در Chrome، Edge یا Firefox به‌روز باز کنید (دوبار کلیک کافی است).
2. از منوی «آزمون جدید» مشخصات آزمودنی را وارد کنید، صدا را بررسی کنید و دستورالعمل را به آزمودنی نشان دهید.
3. آزمون تمام‌صفحه اجرا می‌شود (حدود ۱۴ دقیقه). آزماینده با `Esc` آزمون را متوقف می‌کند.
4. پس از پایان، گزارش نمایش داده می‌شود: چاپ/PDF، خروجی CSV کوشش‌ها و JSON جلسه.

برای اجرا روی تبلت یا از روی شبکه، پوشهٔ `iva2/` را روی هر سرور فایل ایستا بگذارید (مثلاً `python3 -m http.server`).
ضبط صدا با میکروفن فقط روی `file://`، `localhost` یا `https` کار می‌کند.

## امکانات IVA-2 و آنچه این برنامه پیاده کرده است

از وب‌سایت BrainTrain و گزارش‌های نمونهٔ منتشرشده‌اش (دسترسی مستقیم به سایت از محیط توسعه ممکن نبود؛ اطلاعات از
طریق جستجو گردآوری شد):

| IVA-2 | این برنامه |
| --- | --- |
| عددهای ۱ (هدف) و ۲ (غیرهدف)، دیداری و شنیداری درهم؛ هر ۱٫۵ ثانیه یک محرک | ✅ همان؛ صدای «یک/دو» فارسی یا «one/two» انگلیسی؛ عدد فارسی (۱/۲) یا لاتین |
| محرک دیداری ۱۶۷ میلی‌ثانیه، شنیداری ۵۰۰ میلی‌ثانیه | ✅ دیداری هم‌تراز با فریم صفحه؛ شنیداری با زمان‌بندی دقیق Web Audio |
| ۵۰۰ کوشش؛ بلوک‌های ۵۰تایی پرتقاضا (۸۴٪ هدف) و کم‌تقاضا (۱۶٪ هدف) به‌تناوب | ✅ ۵ مجموعه × (۵۰ پرتقاضا + ۵۰ کم‌تقاضا)؛ ترتیب شبه‌تصادفی ثابت برای همه |
| گرم‌کردن و سردکردن (زمان واکنش ساده)، تمرین | ✅ ۱۰ دیداری + ۱۰ شنیداری در هر کدام؛ تمرین ۲۰ کوششی با تکرار در صورت درستی کمتر از ۷۰٪ |
| کنترل پاسخ: احتیاط، ثبات، استقامت | ✅ برای شنیداری، دیداری و کلی |
| توجه: گوش‌به‌زنگی، تمرکز، سرعت | ✅ برای شنیداری، دیداری و کلی |
| مقیاس‌های ویژگی (توازن، آمادگی) | ✅ توازن و آمادگی؛ به‌اضافهٔ «تنظیم حرکتی ظریف» (پاسخ‌های پیش‌دستانه و کلیک‌های اضافه) |
| مقیاس‌های اعتبار: درک تکلیف، پشتکار، حسی‌حرکتی | ✅ به‌اضافهٔ هشدارهای خودکار اعتبار اجرا |
| تحلیل پنج‌گانه (Quintile)، توزیع زمان واکنش، پرتقاضا/کم‌تقاضا | ✅ نمودار و جدول در گزارش |
| بهره‌های استاندارد (میانگین ۱۰۰، انحراف معیار ۱۵) با هنجار ۱٬۷۰۰ نفر، ۶ تا ۹۶ سال | ⚠️ هنجار رسمی منتشر نشده است؛ به‌جای آن **ساخت هنجار محلی** از آزمودنی‌های سالم خودتان (به تفکیک سن و جنس) |
| چند گزارش تفسیری، ۸۲ مقیاس، ۱۰ نوع تحلیل | ⚠️ یک گزارش جامع قابل چاپ با همهٔ مقیاس‌های بالا |
| مقیاس‌های «توجه پایدار» (Acuity، Dependability، Elasticity، Reliability، Steadiness، Swiftness) | ❌ فرمول‌ها منتشر نشده‌اند |
| تحلیل تمارض، مقیاس‌های درجه‌بندی والد/معلم، نگارندهٔ گزارش، اجرای از راه دور | ❌ پیاده نشده است |

## روش اجرای آزمون

1. **گرم‌کردن:** ۱۰ بار عدد ۱ دیداری، سپس ۱۰ بار «یک» شنیداری؛ فقط واکنش ساده.
2. **تمرین:** ۲۰ کوشش (نیمی دیداری، نیمی شنیداری؛ نیمی ۱، نیمی ۲). اگر درستی کمتر از ۷۰٪ باشد تا دو بار دیگر تکرار می‌شود.
3. **آزمون اصلی:** ۵۰۰ کوشش در ۵ مجموعه. هر مجموعه: ۵۰ کوشش پرتقاضا (۴۲ هدف، ۸ غیرهدف) و سپس ۵۰ کوشش کم‌تقاضا (۸ هدف، ۴۲ غیرهدف). در هر بلوک ۲۵ کوشش دیداری و ۲۵ شنیداری است، حداکثر ۴ کوشش پشت‌سرهم از یک حس، و بین دو محرک نادر دست‌کم دو محرک رایج.
4. **سردکردن:** مانند گرم‌کردن.

ترتیب کوشش‌ها با بذر ثابت ساخته می‌شود، پس همهٔ آزمودنی‌ها دقیقاً یک ترتیب را می‌بینند. نوع اجرای «کوتاه» (۱۰۰ کوشش) فقط
برای نمایش و آزمایش دستگاه است و تفسیر نمی‌شود.

## نمره‌گذاری

پاسخی که زودتر از **۱۲۵ میلی‌ثانیه** پس از شروع محرک ثبت شود «پیش‌دستانه» است و پاسخ به آن محرک حساب نمی‌شود. اولین
پاسخ بعدی تا شروع محرک بعدی، پاسخ کوشش است و پاسخ‌های بعدی «کلیک اضافه».

| مقیاس | تعریف نمرهٔ خام در این برنامه | بهتر |
| --- | --- | --- |
| احتیاط (Prudence) | درصد خطای ارتکاب (پاسخ به ۲) | کمتر |
| ثبات (Consistency) | دامنهٔ میان‌چارکی زمان واکنش پاسخ‌های درست ÷ میانه × ۱۰۰ | کمتر |
| استقامت (Stamina) | میانگین زمان واکنش ۴۰٪ اول آزمون (۲۰۰ کوشش) ÷ ۴۰٪ آخر × ۱۰۰ | بیشتر |
| گوش‌به‌زنگی (Vigilance) | درصد خطای حذف (پاسخ ندادن به ۱) | کمتر |
| تمرکز (Focus) | انحراف معیار زمان واکنش پاسخ‌های درست (میلی‌ثانیه) | کمتر |
| سرعت (Speed) | میانگین زمان واکنش پاسخ‌های درست (میلی‌ثانیه) | کمتر |
| توازن (Balance) | زمان واکنش شنیداری ÷ دیداری × ۱۰۰ | توصیفی |
| آمادگی (Readiness) | زمان واکنش بلوک‌های کم‌تقاضا ÷ پرتقاضا × ۱۰۰ | توصیفی |
| تنظیم حرکتی ظریف | تعداد پاسخ‌های پیش‌دستانه + کلیک‌های اضافه | کمتر |
| درک تکلیف (Comprehension) | (ارتکاب در کم‌تقاضا + حذف در پرتقاضا) ÷ محرک‌های همان دو گروه × ۱۰۰ | کمتر |
| پشتکار (Persistence) | میانگین ۳ واکنش سریع گرم‌کردن ÷ ۳ واکنش سریع سردکردن × ۱۰۰ | بیشتر |
| حسی‌حرکتی (Sensory/Motor) | میانگین زمان واکنش ساده در گرم‌کردن و سردکردن | کمتر |

فرمول‌های دقیق IVA-2 منتشر نشده‌اند؛ تعریف‌های بالا مال همین برنامه‌اند و طوری انتخاب شده‌اند که همان چیزی را بسنجند که
هر مقیاس IVA-2 برای سنجیدنش معرفی شده است.

## هنجار محلی و نمرهٔ استاندارد

1. گروهی از افراد سالم را با اجرای **استاندارد** آزمون کنید و تیک «عضو نمونهٔ هنجاری» را بزنید (در فرم یا در فهرست نتایج).
2. در بخش «هنجارها»، «ساخت هنجار» را بزنید. برای هر گروه سنی، هر جنس و کل نمونه (هر گروه دست‌کم ۱۰ نفر) میانگین و
   انحراف معیار ساخته می‌شود.
3. از آن پس گزارش‌ها نمرهٔ استاندارد (۱۰۰ ± ۱۵، بالاتر = بهتر)، صدک، سطح و **شاخص کنترل پاسخ** و **شاخص توجه** (برای
   هر حس و کلی) را هم نشان می‌دهند. برای هر آزمودنی خاص‌ترین گروهی که وجود دارد به کار می‌رود.

فایل هنجار (JSON) قابل خروجی و وارد کردن است تا مراکز مختلف بتوانند از یک هنجار استفاده کنند؛ فقط به شرطی که با
همان صدا، همان نوع دستگاه و همان روش پاسخ اجرا شده باشد.

## صدا

صدای داخلی با موتور سنتز گفتار [eSpeak NG](https://github.com/espeak-ng/espeak-ng) ساخته شده و طبیعی نیست. برای
صدای طبیعی، در «تنظیمات» هر کلمه را با میکروفن ضبط کنید یا فایل صوتی بدهید؛ سکوت ابتدا خودکار حذف و طول به کمتر از
نیم ثانیه محدود می‌شود. برای جایگزینی دائمی صدای داخلی، فایل‌های `audio/*.wav` را عوض کنید و
`python3 iva2/tools/build_audio.py` را اجرا کنید.

## دقت زمانی

زمان‌ها با ساعت `performance.now()` مرورگر ثبت می‌شوند؛ زمان پاسخ از `event.timeStamp` خود رویداد گرفته می‌شود. شروع
محرک دیداری از روی فریم نمایش (دقت حدود یک فریم، ۱۷ میلی‌ثانیه در ۶۰ هرتز) و شروع محرک شنیداری از ساعت صوتی با
احتساب تأخیر خروجی ثبت می‌شود. تأخیر سخت‌افزار (ماوس، صفحه‌نمایش، هدفون بلوتوث) قابل اندازه‌گیری نیست؛ همهٔ آزمودنی‌هایی
را که مقایسه می‌کنید با یک دستگاه آزمون کنید. اطلاعات زمان‌بندی هر جلسه (نرخ فریم، خطای شروع محرک) در JSON جلسه ذخیره می‌شود.

## داده‌ها

همه‌چیز فقط در `localStorage` همین مرورگر ذخیره می‌شود و به هیچ جا ارسال نمی‌شود. از بخش «نتایج» به‌طور منظم خروجی
JSON بگیرید؛ پاک کردن داده‌های مرورگر نتایج را پاک می‌کند. خروجی «جدول خلاصه» (CSV) یک ردیف برای هر جلسه دارد و برای
SPSS یا Excel مناسب است.

## توسعه

```bash
cd iva2 && node --test
```

| مسیر | محتوا |
| --- | --- |
| `index.html`، `css/app.css` | رابط کاربری |
| `js/protocol.js` | ساختار آزمون و ساخت ترتیب کوشش‌ها |
| `js/engine.js` | اجرای کوشش‌ها و زمان‌بندی |
| `js/scoring.js`، `js/norms.js` | نمره‌گذاری و هنجار (بدون وابستگی به مرورگر، با آزمون واحد) |
| `js/audio.js` | پخش و ضبط صدا |
| `js/report.js` | گزارش، نمودارها، خروجی‌ها |
| `js/storage.js` | ذخیره در مرورگر |
| `js/i18n.js` | متن‌های فارسی و انگلیسی |
| `tools/build_audio.py`، `tools/build_fonts.py` | ساخت صدای داخلی و جاسازی قلم وزیرمتن |

قلم [وزیرمتن](https://github.com/rastikerdar/vazirmatn) تحت مجوز SIL Open Font License است (`css/LICENSE-Vazirmatn.txt`).

---

<a id="english"></a>

# IVA-2 style Visual & Auditory Continuous Performance Test (Persian/English)

A standalone, offline program that runs the **IVA-2** (Integrated Visual and Auditory Continuous Performance Test)
paradigm with **Persian** (and English) instructions, voice and report. No install, server or internet needed.

> **Warning:** this is not the official IVA-2 (a BrainTrain product), it does not include the IVA-2 norms, and its scores
> are not comparable to IVA-2 scores. No continuous performance test is sufficient on its own to diagnose ADHD; results
> must be interpreted by a professional alongside other assessment.

## Running it

1. Open `iva2/index.html` in an up-to-date Chrome, Edge or Firefox (double-clicking works).
2. Under “New test”, enter the participant, check the sound, and show the instructions to the participant.
3. The test runs full screen (about 14 minutes). The examiner pauses it with `Esc`.
4. The report follows: print/PDF, trial-level CSV and session JSON.

To use it on a tablet or over a network, put the `iva2/` folder on any static file server (for example
`python3 -m http.server`). Microphone recording works only on `file://`, `localhost` or `https`.

## IVA-2 features and what this program implements

From BrainTrain’s website and published sample reports (the site itself could not be reached from the development
environment; the information was gathered through web search):

| IVA-2 | This program |
| --- | --- |
| Digits 1 (target) and 2 (foil), visual and auditory intermixed; one every 1.5 s | ✅ Same; spoken Persian “yek/do” or English “one/two”; Persian (۱/۲) or Latin digits |
| Visual stimuli 167 ms, auditory 500 ms | ✅ Visual frame-aligned; auditory scheduled on the Web Audio clock |
| 500 trials; alternating 50-trial high-demand (84% targets) and low-demand (16% targets) blocks | ✅ 5 sets × (50 high + 50 low demand); one fixed pseudo-random order for everyone |
| Warm-up and cool-down (simple RT), practice | ✅ 10 visual + 10 auditory each; 20-trial practice, repeated below 70% accuracy |
| Response control: Prudence, Consistency, Stamina | ✅ Auditory, visual and full scale |
| Attention: Vigilance, Focus, Speed | ✅ Auditory, visual and full scale |
| Attribute scales (Balance, Readiness) | ✅ Balance and Readiness; plus “fine motor regulation” (anticipatory and extra clicks) |
| Validity scales: Comprehension, Persistence, Sensory/Motor | ✅ Plus automatic administration-validity flags |
| Quintile analysis, RT distribution, high/low demand | ✅ Charts and tables in the report |
| Standard-score quotients (mean 100, SD 15) from norms of 1,700 people aged 6–96 | ⚠️ Official norms are unpublished; instead **build local norms** from your own healthy participants (by age and sex) |
| Several interpretive reports, 82 scales, 10 analyses | ⚠️ One comprehensive printable report with all of the above |
| Sustained-attention scales (Acuity, Dependability, Elasticity, Reliability, Steadiness, Swiftness) | ❌ Formulas unpublished |
| Malingering analysis, parent/teacher rating scales, report writer, remote testing | ❌ Not implemented |

## Procedure

1. **Warm-up:** 10 visual 1s, then 10 spoken “one”s; simple reaction time.
2. **Practice:** 20 trials (half visual, half auditory; half 1s, half 2s), repeated up to twice more below 70% accuracy.
3. **Main test:** 500 trials in 5 sets. Each set is 50 high-demand trials (42 targets, 8 foils) then 50 low-demand trials (8 targets, 42 foils). Every block has 25 visual and 25 auditory trials, at most 4 in a row from one sense, and at least two common stimuli between rare ones.
4. **Cool-down:** like the warm-up.

The order comes from a fixed seed, so every participant gets exactly the same sequence. The “short” length (100 trials)
is for demonstrations and checking a computer, not for interpretation.

## Scoring

A response within **125 ms** of stimulus onset is anticipatory and does not count as a response to that stimulus. The
first later response before the next stimulus is the trial’s response; any further ones are extra clicks.

| Scale | Raw definition in this program | Better |
| --- | --- | --- |
| Prudence | Commission errors (responding to 2), % | lower |
| Consistency | Interquartile range of correct-response RTs ÷ median × 100 | lower |
| Stamina | Mean RT over the first 40% of the test (200 trials) ÷ the last 40% × 100 | higher |
| Vigilance | Omission errors (not responding to 1), % | lower |
| Focus | SD of correct-response RTs (ms) | lower |
| Speed | Mean correct-response RT (ms) | lower |
| Balance | Auditory RT ÷ visual RT × 100 | descriptive |
| Readiness | Low-demand RT ÷ high-demand RT × 100 | descriptive |
| Fine motor regulation | Anticipatory responses + extra clicks (count) | lower |
| Comprehension | (Low-demand commissions + high-demand omissions) ÷ stimuli of those two kinds × 100 | lower |
| Persistence | Mean of the 3 fastest warm-up RTs ÷ the 3 fastest cool-down RTs × 100 | higher |
| Sensory/Motor | Mean simple RT across warm-up and cool-down | lower |

The IVA-2’s exact formulas are unpublished. These definitions are this program’s own, chosen to measure what each IVA-2
scale is described as measuring.

## Local norms and standard scores

1. Test a group of healthy people with the **standard** length and tick “normative” (on the form or in the results list).
2. Under Norms, press “Build norms”. Means and SDs are computed for every age band, each sex, and the whole sample
   (groups need at least 10 people).
3. Reports then add standard scores (100 ± 15, higher is better), percentiles, levels, and the **Response Control** and
   **Attention** quotients for each sense and full scale, using the most specific group available for each participant.

Norm files (JSON) can be exported and imported so several sites can share norms, provided they test with the same voice,
the same kind of device and the same response method.

## Voice

The built-in voice is synthesized with [eSpeak NG](https://github.com/espeak-ng/espeak-ng) and does not sound natural. For
a natural voice, record each word in Settings or provide an audio file; leading silence is removed and the length capped
below half a second. To replace the built-in voice permanently, replace `audio/*.wav` and run
`python3 iva2/tools/build_audio.py`.

## Timing accuracy

Times use the browser’s `performance.now()` clock; responses use the event’s own `timeStamp`. Visual onsets are taken
from the display frame (accurate to about one frame, 17 ms at 60 Hz) and auditory onsets from the audio clock including
output latency. Hardware latency (mouse, display, Bluetooth headphones) cannot be measured: test everyone you compare on
the same equipment. Each session’s timing data (frame rate, onset error) is kept in its JSON.

## Data

Everything is stored only in this browser’s `localStorage` and never sent anywhere. Export JSON from Results regularly;
clearing browser data deletes results. The summary CSV has one row per session, ready for SPSS or Excel.

## Development

```bash
cd iva2 && node --test
```

| Path | Contents |
| --- | --- |
| `index.html`, `css/app.css` | Interface |
| `js/protocol.js` | Test structure and trial sequence |
| `js/engine.js` | Trial runner and timing |
| `js/scoring.js`, `js/norms.js` | Scoring and norms (browser-independent, unit-tested) |
| `js/audio.js` | Playback and recording |
| `js/report.js` | Report, charts, exports |
| `js/storage.js` | Browser storage |
| `js/i18n.js` | Persian and English text |
| `tools/build_audio.py`, `tools/build_fonts.py` | Build the built-in voice and embed the Vazirmatn font |

The [Vazirmatn](https://github.com/rastikerdar/vazirmatn) font is under the SIL Open Font License (`css/LICENSE-Vazirmatn.txt`).
