<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Article;
use App\Models\ArticleCategory;
use App\Support\Enums\ArticleStatus;
use Illuminate\Database\Seeder;

class ArticleSeeder extends Seeder
{
    public function run(): void
    {
        $categories = [];

        foreach ($this->categories() as $position => [$slug, $nameFa, $nameEn]) {
            $categories[$slug] = ArticleCategory::updateOrCreate(
                ['slug' => $slug],
                [
                    'name' => ['fa' => $nameFa, 'en' => $nameEn],
                    'position' => $position,
                    'is_active' => true,
                ],
            );
        }

        foreach ($this->articles() as $index => $definition) {
            Article::updateOrCreate(
                ['slug' => $definition['slug']],
                [
                    'article_category_id' => $categories[$definition['category']]->getKey(),
                    'title' => $definition['title'],
                    'excerpt' => $definition['excerpt'],
                    'body' => $definition['body'],
                    'reading_time' => $definition['reading_time'],
                    'status' => ArticleStatus::Published,
                    'published_at' => now()->subDays(($index + 1) * 11),
                    'is_featured' => $index < 2,
                ],
            );
        }
    }

    /**
     * @return list<array{0: string, 1: string, 2: string}>
     */
    private function categories(): array
    {
        return [
            ['buying-guides', 'راهنمای خرید', 'Buying Guides'],
            ['technical-knowledge', 'دانش فنی', 'Technical Knowledge'],
            ['interior-design', 'طراحی داخلی', 'Interior Design'],
            ['factory-news', 'اخبار کارخانه', 'Factory News'],
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function articles(): array
    {
        return [
            [
                'slug' => 'choosing-cabinet-panel-thickness',
                'category' => 'buying-guides',
                'reading_time' => 7,
                'title' => [
                    'fa' => 'ضخامت مناسب پنل کابینت را چطور انتخاب کنیم؟',
                    'en' => 'How to choose the right cabinet panel thickness',
                ],
                'excerpt' => [
                    'fa' => 'تفاوت ۱۶ و ۱۸ میلی‌متر در بدنه و درب کابینت چیست و کجا باید کدام را انتخاب کرد.',
                    'en' => 'What separates 16 mm from 18 mm in carcasses and doors, and where each belongs.',
                ],
                'body' => [
                    'fa' => "ضخامت پنل تعیین‌کننده باربری قفسه، پایداری درب و نوع یراق قابل استفاده است.\n\nبرای بدنه کابینت، ۱۶ میلی‌متر در دهانه‌های تا ۸۰ سانتی‌متر پاسخ می‌دهد. با افزایش دهانه یا بار قفسه، ۱۸ میلی‌متر انتخاب درست‌تری است چون خمش قفسه در طول زمان کمتر می‌شود.\n\nبرای درب، ۱۸ میلی‌متر استاندارد رایج است. درب‌های بلندتر از ۱۰۰ سانتی‌متر با ۱۸ میلی‌متر پایداری بهتری دارند و لولا نیز محل نشست مطمئن‌تری پیدا می‌کند.\n\nدر نهایت انتخاب ضخامت را با یراق و نوع اتصال هماهنگ کنید: پیچ و مینی‌فیکس برای ۱۶ و ۱۸ میلی‌متر طراحی متفاوتی دارند.",
                    'en' => "Panel thickness determines shelf load capacity, door stability and which hardware you can use.\n\nFor cabinet carcasses, 16 mm is adequate for spans up to 800 mm. As the span or the shelf load grows, 18 mm becomes the better choice because long-term shelf deflection is lower.\n\nFor doors, 18 mm is the common standard. Doors taller than 1000 mm are noticeably more stable in 18 mm, and hinges get a more reliable seat.\n\nFinally, match the thickness to your hardware and joinery: screws and cam fittings are specified differently for 16 mm and 18 mm.",
                ],
            ],
            [
                'slug' => 'high-gloss-vs-super-matte',
                'category' => 'buying-guides',
                'reading_time' => 6,
                'title' => [
                    'fa' => 'های‌گلاس یا سوپرمات؟ مقایسه عملی',
                    'en' => 'High gloss or super matte? A practical comparison',
                ],
                'excerpt' => [
                    'fa' => 'کدام سطح برای آشپزخانه پرکاربرد مناسب‌تر است و نگهداری هرکدام چه تفاوتی دارد.',
                    'en' => 'Which surface suits a hard-working kitchen, and how maintenance differs.',
                ],
                'body' => [
                    'fa' => "های‌گلاس عمق رنگ و بازتاب نور بیشتری می‌دهد و فضای کوچک را بازتر نشان می‌دهد. در عوض اثر انگشت و گرد و غبار روی آن دیده می‌شود و برای پاک‌کردن به دستمال میکروفایبر نیاز دارد.\n\nسوپرمات بازتاب را حذف می‌کند و اثر انگشت روی آن بسیار کمتر دیده می‌شود. پوشش ضد اثر انگشت روی نسخه‌های جدید، تمیزکردن را ساده کرده است.\n\nاگر آشپزخانه نور طبیعی کمی دارد، های‌گلاس کمک می‌کند. اگر خانه پرتردد است و تمیزکاری روزانه دشوار است، سوپرمات انتخاب راحت‌تری است.",
                    'en' => "High gloss gives deeper colour and more light reflection, which makes a small room read as larger. In exchange, fingerprints and dust show, and it wants a microfibre cloth.\n\nSuper matte removes reflection and shows fingerprints far less. The anti-fingerprint coating on current versions makes cleaning straightforward.\n\nIf the kitchen has little natural light, high gloss helps. If the household is busy and daily cleaning is unrealistic, super matte is the easier choice.",
                ],
            ],
            [
                'slug' => 'understanding-e1-formaldehyde-class',
                'category' => 'technical-knowledge',
                'reading_time' => 8,
                'title' => [
                    'fa' => 'کلاس E1 فرمالدهید چه معنایی دارد؟',
                    'en' => 'What the E1 formaldehyde class actually means',
                ],
                'excerpt' => [
                    'fa' => 'استاندارد رهایش فرمالدهید، روش اندازه‌گیری و اهمیت آن برای فضای بسته.',
                    'en' => 'The emission standard, how it is measured, and why it matters indoors.',
                ],
                'body' => [
                    'fa' => "فرمالدهید در چسب‌های اوره فرمالدهید که در تولید تخته فشرده استفاده می‌شوند وجود دارد و به‌آرامی از سطح آزاد می‌شود.\n\nکلاس E1 سقف مجاز رهایش را تعیین می‌کند. اندازه‌گیری در محفظه آزمون با دما، رطوبت و نرخ تعویض هوای کنترل‌شده انجام می‌شود و نتیجه بر حسب میلی‌گرم بر متر مکعب گزارش می‌شود.\n\nبرای فضای بسته مانند آشپزخانه و کمد دیواری، انتخاب پنل E1 اهمیت مستقیم بر کیفیت هوای داخل دارد. هنگام خرید، شماره گواهی و تاریخ اعتبار آن را از تأمین‌کننده بخواهید.",
                    'en' => "Formaldehyde is present in the urea-formaldehyde adhesives used to make engineered board, and it releases slowly from the surface.\n\nThe E1 class sets the permitted emission ceiling. Measurement takes place in a test chamber with controlled temperature, humidity and air exchange rate, and the result is reported in milligrams per cubic metre.\n\nFor enclosed spaces such as kitchens and fitted wardrobes, specifying E1 panels has a direct bearing on indoor air quality. When buying, ask the supplier for the certificate number and its validity date.",
                ],
            ],
            [
                'slug' => 'preventing-panel-warping',
                'category' => 'technical-knowledge',
                'reading_time' => 6,
                'title' => [
                    'fa' => 'چرا پنل تاب برمی‌دارد و چطور جلوگیری کنیم؟',
                    'en' => 'Why panels warp, and how to prevent it',
                ],
                'excerpt' => [
                    'fa' => 'نقش رطوبت، انبارش و تعادل روکش دو طرف در پایداری ابعادی ورق.',
                    'en' => 'The role of moisture, storage and two-sided facing balance in dimensional stability.',
                ],
                'body' => [
                    'fa' => "تاب‌برداشتن تقریباً همیشه نتیجه اختلاف رطوبت یا اختلاف کشش بین دو روی ورق است.\n\nاگر یک طرف ورق روکش‌دار و طرف دیگر خام باشد، دو سطح رطوبت را با نرخ متفاوتی جذب می‌کنند و ورق به سمت طرف خام جمع می‌شود. راه‌حل، روکش متعادل روی هر دو طرف است.\n\nانبارش نیز مهم است: ورق باید افقی و روی سطح تخت با فاصله‌گذار یکنواخت نگهداری شود، نه تکیه‌داده به دیوار. ورق را پیش از برش چند روز در محیط نصب نگه دارید تا با رطوبت محل به تعادل برسد.",
                    'en' => "Warping is almost always the result of a moisture differential or unequal tension between the two faces of a sheet.\n\nIf one face is faced and the other left raw, the two surfaces take up moisture at different rates and the sheet cups towards the raw side. The fix is balanced facing on both faces.\n\nStorage matters too: sheets should lie flat on a level surface with evenly spaced bearers, not leaned against a wall. Let sheets acclimatise in the installation environment for a few days before cutting so they reach equilibrium with local humidity.",
                ],
            ],
            [
                'slug' => 'wood-decor-trends-for-kitchens',
                'category' => 'interior-design',
                'reading_time' => 5,
                'title' => [
                    'fa' => 'طرح‌های چوب محبوب در آشپزخانه امروز',
                    'en' => 'Wood decors that work in today\'s kitchens',
                ],
                'excerpt' => [
                    'fa' => 'از بلوط روشن تا گردو دودی: کدام طرح با کدام سبک هماهنگ است.',
                    'en' => 'From pale oak to smoked walnut: which decor suits which style.',
                ],
                'body' => [
                    'fa' => "بلوط روشن با رگه‌های آرام، پرکاربردترین طرح چوب در آشپزخانه‌های مینیمال است. با سطح مات و یراق مخفی، نتیجه‌ای آرام و بی‌زمان می‌دهد.\n\nگردو دودی حس گرم‌تر و سنگین‌تری دارد و در ترکیب با سنگ روشن، تعادل خوبی بین گرمی و روشنایی ایجاد می‌کند.\n\nطرح‌های شیاردار و آکوستیک، دیوار پشت جزیره را از یک سطح خالی به یک عنصر بافت‌دار تبدیل می‌کنند بدون آنکه رنگ اضافه‌ای به فضا وارد شود.",
                    'en' => "Pale oak with a quiet grain is the most widely used wood decor in minimal kitchens. Paired with a matte surface and concealed hardware, the result is calm and timeless.\n\nSmoked walnut reads warmer and heavier, and combined with a light stone it strikes a good balance between warmth and brightness.\n\nSlatted and acoustic panels turn the wall behind an island from a blank plane into a textured element without introducing another colour.",
                ],
            ],
            [
                'slug' => 'new-super-matte-line-commissioned',
                'category' => 'factory-news',
                'reading_time' => 3,
                'title' => [
                    'fa' => 'راه‌اندازی خط جدید سوپرمات',
                    'en' => 'New super matte line commissioned',
                ],
                'excerpt' => [
                    'fa' => 'ظرفیت تولید پنل سوپرمات ضد اثر انگشت افزایش یافت.',
                    'en' => 'Capacity for anti-fingerprint super matte panels has increased.',
                ],
                'body' => [
                    'fa' => "خط جدید روکش سوپرمات با پوشش ضد اثر انگشت راه‌اندازی شد و ظرفیت تولید این گروه محصول را افزایش داد.\n\nاین خط امکان تولید در ضخامت‌های ۱۶، ۱۸ و ۲۲ میلی‌متر را فراهم می‌کند و رنگ‌بندی آن با گروه های‌گلاس هماهنگ است، بنابراین ترکیب دو سطح در یک پروژه بدون اختلاف رنگ امکان‌پذیر است.\n\nسفارش‌گیری از این خط از ابتدای فصل جاری آغاز شده است.",
                    'en' => "A new super matte facing line with an anti-fingerprint coating has come online, increasing capacity for this product group.\n\nThe line runs 16, 18 and 22 mm thicknesses, and its colour range is matched to the high gloss group, so the two surfaces can be combined in one project without a colour mismatch.\n\nOrders against this line opened at the start of the current season.",
                ],
            ],
        ];
    }
}
