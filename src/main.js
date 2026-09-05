const { app, BrowserWindow, Menu, Notification, Tray, nativeImage, session, shell } = require('electron');
const { join } = require('node:path');

const { WINDOW_DAYS, expireIfStale, startHeartbeat } = require('./session');

/**
 * SistemTakip masaüstü uygulaması.
 *
 * (5 Eyl 2026, Ahmet: "SistemTakip için masaüstü uygulaması yap ki web
 * sitesine girmek zorunda kalmayayım her seferinde. Oturum süresi son oturum
 * + 30 gün olsun.")
 *
 * İstek "yeni bir arayüz" değil, "her seferinde giriş yapmayayım"dır. Bu
 * yüzden uygulama paneli KOPYALAMAZ, yükler; kattığı tek şey kalıcı bir
 * oturum ve Dock'ta duran bir simge.
 *
 * Oturum kuralı `src/session.js`'te: son KULLANIMDAN itibaren 30 gün.
 * Tarayıcıdan farkı budur — tarayıcıda jeton ya sonsuza kadar durur ya da
 * çerez temizliğinde kaybolur; ikisi de "her seferinde giriş" ile
 * "hiç çıkmama" arasında bir seçim değil, ikisinin en kötüsüdür.
 */

const APP_URL = process.env.SISTEMTAKIP_URL || 'https://sistemtakip.com';
const PARTITION = 'persist:sistemtakip';

let mainWindow = null;
let tray = null;

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
      // Preload YOK ve gerek de yok: bu uygulama sayfadan veri OKUMUYOR,
      // yalnız barındırıyor. Gereksiz bir köprü, olmayan bir ihtiyaç için
      // açılmış bir kapı olurdu.
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(APP_URL);

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

function show() {
  if (!mainWindow) createWindow();

  mainWindow.show();
  mainWindow.focus();
}

/** Menü çubuğu simgesi — burada tek işi pencereyi geri getirmek. */
function trayIcon() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">'
    + '<rect x="1" y="3" width="14" height="9" rx="1.5" fill="none" stroke="black" stroke-width="1.6"/>'
    + '<path d="M4 8h2l1.5-2.5L9.5 10 11 8h1" fill="none" stroke="black" stroke-width="1.4"/></svg>';

  const image = nativeImage.createFromDataURL(
    'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
  );

  // Şablon görüntü: macOS koyu/açık menü çubuğunda simgeyi kendisi boyar.
  image.setTemplateImage(true);

  return image;
}

app.whenReady().then(async () => {
  const expired = await expireIfStale(session.fromPartition(PARTITION));

  startHeartbeat();
  createWindow();

  tray = new Tray(trayIcon());
  tray.setToolTip('SistemTakip');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Paneli aç', click: show },
    { type: 'separator' },
    { label: 'Yeniden yükle', click: () => mainWindow?.webContents.reload() },
    { type: 'separator' },
    { label: 'Çıkış', click: () => { app.isQuitting = true; app.quit(); } },
  ]));

  tray.on('click', show);

  if (expired) {
    // Sessizce giriş ekranına düşürmek "neden çıktım?" sorusunu doğurur.
    new Notification({
      title: 'SistemTakip oturumu yenilendi',
      body: `${WINDOW_DAYS} gündür kullanılmadığı için yeniden giriş yapmanız gerekiyor.`,
    }).show();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else show();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
