# SistemTakip Masaüstü

macOS için Electron kabuğu. Doğrudan **panelde** (`/dashboard`) açılır,
**oturumu son kullanımdan itibaren 30 gün** açık tutar ve **menü çubuğuna**
yerleşir — bildirimler saatin yanından okunur.

> 5 Eyl 2026, Ahmet: "SistemTakip için masaüstü uygulaması yap ki web sitesine
> girmek zorunda kalmayayım her seferinde. Oturum süresi son oturum + 30 gün
> olsun."
>
> 6 Eyl 2026: "Programı açtığım anda login olucam, normal web sitesini görmeye
> ihtiyacım yok. dmg formatında app olacak, click ile çalışmalı, npm start
> değil. Uygulamalar Mac sağ üst menüdeki ikonların oraya da gelecek,
> bildirimleri ordaki modülden okuyabilicem."

## Kurulum

`npm` gerekmez — `dist/` altındaki **DMG'yi açıp uygulamayı Applications'a
sürükleyin**, sonra çift tıklayın.

Paket **ad-hoc imzalıdır** (`build/afterPack.js`). Apple Silicon'da imzasız bir
paket hiç açılmaz; ad-hoc mühür bunu çözer ve Apple geliştirici sertifikası
gerektirmez. Dağıtım imzası DEĞİLDİR: DMG başka bir Mac'e **indirilerek**
giderse Gatekeeper karantinası devreye girer, ilk açılışta sağ tık → Aç gerekir
(ya da `xattr -dr com.apple.quarantine /Applications/SistemTakip.app`).

## Paketleme

```bash
npm run dist            # .dmg + .zip (bu makinenin mimarisi)
npm run dist:universal  # Intel + Apple Silicon
npm run icon            # assets/icon.png'i yeniden çizer
```

Uygulama simgesi repoda ikili dosya olarak durmuyor; `assets/make-icon.mjs`
onu bağımlılıksız üretiyor (zlib + elle PNG parçaları). Renk panelin
`--primary`sinden geliyor, böylece web ile aynı mürekkep kullanılıyor.

## Geliştirme

```bash
npm install
npm start
```

Başka bir kuruluma bağlanmak için: `SISTEMTAKIP_URL=https://… npm start`

## Menü çubuğu

Sağ üstte, ekran + nabız işareti. Okunmamış bildirim varsa simgeye bir nokta
ve başlığa sayı eklenir; sıfırken hiçbir şey yazmaz — menü çubuğunda sürekli
duran bir "0" gürültüdür.

Menüde **bildirimin kendisi** yazar, sayı değil: "3 yeni bildirim" satırı için
uygulamayı açmak gerekiyordu, oysa menü çubuğunun tek işi açmadan okutmak.
Satıra tıklamak bildirimin hedefini (`data.url`) ya da `/notifications` sayfasını
açar.

Veri **panelin kendi jetonuyla** çekilir: jeton `localStorage`'ta ve ana süreç
oraya erişemez, bu yüzden isteği pencerenin kendisi atar (`src/preload.js` →
IPC `st:poll`). Ayrı bir kimlik ya da ikinci bir jeton üretilmiyor — masaüstü
uygulamasının panelden fazla yetkisi yok.

Yeni gelen okunmamış bildirimler ayrıca sistem bildirimi olarak gösterilir.
İlk tur yalnız "tohumlar": uygulamayı açar açmaz haftanın birikmişi masaüstüne
yağmasın.

## Oturum kuralı

`src/session.js`:

- Her açılışta ve 5 dakikada bir "son görüldü" damgası yazılır; kapanışta da
  bir kez.
- Açılışta damga **30 günden eskiyse** oturum verisi (çerez + localStorage)
  temizlenir ve kullanıcı giriş ekranına düşer; ayrıca bir bildirim gösterilir —
  sessizce çıkarmak "neden çıktım?" sorusunu doğuruyor.
- Süre **girişten değil kullanımdan** sayılır ("son oturum + 30 gün"): her gün
  açan hiç giriş yapmaz, bir ay dokunmayan yeniden girer.
- Damga yazılamıyorsa (disk hatası) oturum süresi dolmuş SAYILMAZ: yanlış
  yönde hata yapmak, kullanıcıyı boşuna dışarı atmaktan iyidir.

Bu, tarayıcının iki uç davranışının ortasıdır: tarayıcıda jeton ya sonsuza
kadar durur ya da çerez temizliğinde kaybolur.

## Neden panel kopyalanmadı

İstek "yeni bir arayüz" değil, "her seferinde giriş yapmayayım". Ekranları
yeniden yazmak, ilk web güncellemesinde iki farklı SistemTakip demekti.
