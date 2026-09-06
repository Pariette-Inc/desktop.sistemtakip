const { app, BrowserWindow, Menu, Notification, Tray, ipcMain, nativeImage, session, shell } = require('electron');
const { join } = require('node:path');

const { WINDOW_DAYS, expireIfStale, startHeartbeat } = require('./session');

/**
 * SistemTakip masaüstü uygulaması.
 *
 * (5 Eyl 2026, Ahmet: "SistemTakip için masaüstü uygulaması yap ki web
 * sitesine girmek zorunda kalmayayım her seferinde. Oturum süresi son oturum
 * + 30 gün olsun.")
 * (6 Eyl 2026: "programı açtığım anda login olucam, normal web sitesini
 * görmeye ihtiyacım yok. Uygulamalar Mac sağ üst menüdeki ikonların oraya da
 * gelecek, bildirimleri ordaki modülden okuyabilicem.")
 *
 * Uygulama paneli KOPYALAMAZ, yükler. Ekranları yeniden yazmak, ilk web
 * güncellemesinde iki farklı SistemTakip demekti. Masaüstünün kattığı şey
 * ekran değil YERLEŞİM: kalıcı oturum, kendi penceresi, menü çubuğu.
 *
 * Oturum kuralı `src/session.js`'te: son KULLANIMDAN itibaren 30 gün.
 *
 * ── Menü çubuğu veriyi NEREDEN alıyor ───────────────────────────────────
 * Panelin oturum jetonu `localStorage`'ta. Ana süreç oraya erişemez; veriyi
 * pencerenin KENDİSİ çeker (preload → `st:poll`) ve IPC ile buraya verir.
 * Ayrı bir kimlik ya da ikinci bir jeton üretmiyoruz.
 */

/*
 * Uygulama PANELDE açılır, tanıtım sitesinde değil. Önceki sürüm kökü
 * (`https://sistemtakip.com`) yüklüyordu; orası `(marketing)` grubunun ana
 * sayfası. Buraya gelen kişi zaten müşteri; karşılama sayfasını görmesi için
 * bir sebep yok.
 *
 * SistemTakip'te dil öneki YOK (sistemtakip.web src/i18n/routing.ts →
 * localePrefix: 'never'), yollar öneksiz yazılır.
 */
const ORIGIN = process.env.SISTEMTAKIP_URL || 'https://sistemtakip.com';
const HOME = '/dashboard';
const APP_URL = ORIGIN + HOME;
const PARTITION = 'persist:sistemtakip';

let mainWindow = null;
let tray = null;
/** Menü çubuğunun gösterdiği son veri. Pencere kapalıyken de elde kalır. */
let latest = { notifications: [], unread: 0, error: null, at: null };
/** Masaüstü bildirimi gösterilenler — aynı bildirim iki kez çıkmasın. */
const notified = new Set();
/** İlk tur bildirim YAĞDIRMASIN: açılışta birikmiş 8 kayıt uyarıya dönüşmesin. */
let seeded = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'SistemTakip',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0e1116',
    webPreferences: {
      partition: PARTITION,
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(APP_URL);

  mainWindow.webContents.on('did-navigate', (_event, url) => bounceHome(url));

  // Dış bağlantılar TARAYICIDA: uygulama penceresi oturumlu bir yüzeydir,
  // izlenen müşterinin sitesine oradan gitmek onu bu oturumun içinde
  // çalıştırmak olurdu.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);

    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isInternal(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // macOS'ta kapatmak ÇIKMAK değildir: menü çubuğu simgesi çalışmaya devam
  // etsin diye pencere yalnız gizlenir.
  mainWindow.on('close', (event) => {
    if (!app.isQuitting && process.platform === 'darwin') {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function isInternal(url) {
  try {
    const host = new URL(url).host;

    return host === new URL(APP_URL).host || host.endsWith('.sistemtakip.com');
  } catch {
    return false;
  }
}

/**
 * Tanıtım sitesinin KÖKÜ panele çevrilir.
 *
 * Yalnız kök (`/`). Daha geniş bir kural bütün `(marketing)` yollarını
 * yakalardı; sözleşme ve iletişim sayfaları da oradan geçiyor.
 *
 * Giriş yapılmamışsa panel kendisi `/login`'e atar; döngü olmaz, çünkü
 * `/login` kök değil.
 */
function bounceHome(url) {
  try {
    const parsed = new URL(url);

    if (!isInternal(url)) return;
    if (parsed.pathname !== '/' && parsed.pathname !== '') return;

    mainWindow?.loadURL(parsed.origin + HOME);
  } catch {
    // Adres çözülemiyorsa dokunma: yanlış bir yönlendirme, yanlış yerde
    // kalmaktan daha kötü.
  }
}

/** Pencereyi gösterir ve istenen yola götürür. */
function openAt(path) {
  if (!mainWindow) createWindow();

  mainWindow.show();
  mainWindow.focus();

  if (path) mainWindow.webContents.send('st:navigate', path);
}

// ── Menü çubuğu ────────────────────────────────────────────────────────────

function trayIcon(unread) {
  /*
   * Şablon görüntü (`setTemplateImage`): macOS koyu/açık menü çubuğunda
   * simgeyi kendisi boyar. Renkli bir PNG açık temada okunmuyordu.
   *
   * Uygulama simgesiyle (assets/icon.png) aynı işaret: ekran + nabız.
   * Okunmamış varken sağ üstte bir nokta çıkar.
   */
  const base = '<rect x="1" y="3" width="14" height="9" rx="1.5" fill="none" stroke="black" stroke-width="1.6"/>'
    + '<path d="M4 8h2l1.5-2.5L9.5 10 11 8h1" fill="none" stroke="black" stroke-width="1.4"/>';
  const dot = unread > 0 ? '<circle cx="14" cy="3" r="2.6" fill="black"/>' : '';

  const image = nativeImage.createFromDataURL(
    'data:image/svg+xml;base64,' + Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">${base}${dot}</svg>`
    ).toString('base64')
  );

  image.setTemplateImage(true);

  return image;
}

function relative(iso) {
  if (!iso) return '';

  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);

  if (minutes < 1) return 'şimdi';
  if (minutes < 60) return `${minutes} dk`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} sa`;

  return `${Math.round(minutes / 1440)} gün`;
}

/** Bildirimin kendi hedefi varsa oraya, yoksa listeye. */
function target(item) {
  const link = item?.data?.url || item?.data?.link;

  return typeof link === 'string' && link.startsWith('/') ? link : '/notifications';
}

function buildTrayMenu() {
  const items = [];

  if (latest.error) {
    items.push({ label: `Okunamadı: ${latest.error}`, enabled: false });
  } else if (latest.notifications.length === 0) {
    items.push({ label: 'Bildirim yok', enabled: false });
  } else {
    /*
     * Menüde BİLDİRİMİN KENDİSİ yazar, sayı değil. "3 yeni bildirim" satırı
     * için uygulamayı açmak gerekiyordu; oysa menü çubuğunun tek işi,
     * açmadan okutmak.
     */
    for (const item of latest.notifications) {
      const dot = item.read_at ? '' : '● ';

      items.push({
        label: `${dot}${String(item.title || '').slice(0, 60)}`,
        sublabel: `${String(item.body || '').split('\n')[0].slice(0, 70)} · ${relative(item.created_at)}`,
        click: () => openAt(target(item)),
      });
    }
  }

  items.push({ type: 'separator' });

  items.push({
    label: latest.unread > 0 ? `Bildirimler (${latest.unread} okunmamış)` : 'Bildirimler',
    click: () => openAt('/notifications'),
  });

  items.push({ label: 'Uyarılar', click: () => openAt('/alerts') });
  items.push({ label: 'İşlerim', click: () => openAt('/my-work') });
  items.push({ label: 'Paneli aç', click: () => openAt(HOME) });
  items.push({ type: 'separator' });
  items.push({ label: 'Şimdi yenile', click: () => mainWindow?.webContents.send('st:refresh') });
  items.push({ type: 'separator' });
  items.push({ label: 'Çıkış', click: () => { app.isQuitting = true; app.quit(); } });

  tray.setContextMenu(Menu.buildFromTemplate(items));
  tray.setImage(trayIcon(latest.unread));

  // Başlıkta yalnız okunmamış SAYI durur; sıfırken hiçbir şey yazmaz —
  // menü çubuğunda sürekli duran bir "0" gürültüdür.
  tray.setTitle(latest.unread > 0 ? String(latest.unread) : '');
}

/**
 * Yeni ve OKUNMAMIŞ bildirimler için sistem bildirimi.
 *
 * İlk tur yalnız "tohumlar": uygulamayı açar açmaz haftanın birikmiş
 * bildirimleri masaüstüne yağmasın. Ondan sonra gelen her yeni okunmamış
 * kayıt bir kez gösterilir.
 */
function notifyNew(items) {
  for (const item of items) {
    if (notified.has(item.id)) continue;

    notified.add(item.id);

    if (!seeded || item.read_at) continue;

    new Notification({
      title: String(item.title || 'SistemTakip').slice(0, 80),
      body: String(item.body || '').slice(0, 160),
    })
      .on('click', () => openAt(target(item)))
      .show();
  }

  seeded = true;

  // Küme sınırsız büyümesin: uygulama günlerce açık kalıyor.
  if (notified.size > 500) {
    for (const id of Array.from(notified).slice(0, 250)) notified.delete(id);
  }
}

// ── Açılış ─────────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  const expired = await expireIfStale(session.fromPartition(PARTITION));

  startHeartbeat();
  createWindow();

  tray = new Tray(trayIcon(0));
  tray.setToolTip('SistemTakip');
  buildTrayMenu();

  if (expired) {
    // Sessizce giriş ekranına düşürmek "neden çıktım?" sorusunu doğurur.
    new Notification({
      title: 'SistemTakip oturumu yenilendi',
      body: `${WINDOW_DAYS} gündür kullanılmadığı için yeniden giriş yapmanız gerekiyor.`,
    }).show();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else openAt(null);
  });
});

// Pencere kapansa da uygulama menü çubuğunda yaşamaya devam eder.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/** Preload'un getirdiği veri. Hata da bir sonuçtur ve menüde yazılır. */
ipcMain.on('st:poll', (_event, payload) => {
  latest = {
    notifications: Array.isArray(payload?.notifications) ? payload.notifications : [],
    unread: Number(payload?.unread ?? 0),
    error: payload?.error ?? null,
    at: Date.now(),
  };

  notifyNew(latest.notifications);
  buildTrayMenu();
});
