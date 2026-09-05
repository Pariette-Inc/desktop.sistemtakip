# SistemTakip Masaüstü

macOS için Electron kabuğu. `sistemtakip.com` panelini kendi penceresinde açar
ve **oturumu son kullanımdan itibaren 30 gün** açık tutar.

> 5 Eyl 2026, Ahmet: "SistemTakip için masaüstü uygulaması yap ki web sitesine
> girmek zorunda kalmayayım her seferinde. Oturum süresi son oturum + 30 gün
> olsun."

## Kurulum (geliştirme)

```bash
npm install
npm start
```

Başka bir kuruluma bağlanmak için: `SISTEMTAKIP_URL=https://… npm start`

## Paketleme

```bash
npm run dist            # .dmg + .zip
npm run dist:universal  # Intel + Apple Silicon
```

İmzalama ve noter onayı yapılandırılmadı; imzasız uygulama ilk açılışta
"geliştirici doğrulanamadı" uyarısı verir (sağ tık → Aç ile geçilir).

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
