# فويد: أثر في الزمكان (PWA)

لعبة أركيد دقيقة (HTML5 Canvas) — ١٢ مرحلة في ٣ عوالم، قصة، قدرات، إنجازات. تشتغل أوفلاين بعد أول فتح.

## التشغيل على GitHub Pages
1. فك الزيب وارفع **محتوى** المجلد على ريبو جديد (index.html في الجذر).
2. Settings → Pages → Deploy from branch → `main` / root.
3. افتح الرابط من الموبايل (Chrome) → "Add to Home screen" عشان تتثبت كتطبيق.

## تجربة محلية
`python3 -m http.server 8000` ثم افتح http://localhost:8000

## التحكم
- موبايل: اسحب بصباعك في نص الشاشة الشمال (عصا طايرة) · الأزرار على اليمين.
- كيبورد: WASD/أسهم · Space اندفاع · E بلع · Q درع · R تمدد الزمن · F طيف · B انفجار الكتلة · Esc إيقاف.

## البنية
`index.html` · `js/` (audio, game, ui) · `css/` · `data/` (levels.json, story.json) · `assets/` (محسّنة) · `sw.js` · `tools/build_assets.py` (يعيد بناء الأصول من الملفات الخام).
