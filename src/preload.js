const { contextBridge, ipcRenderer } = require('electron');

/**
 * Menü çubuğunu besleyen köprü.
 *
 * ── Neden burada, ana süreçte değil ─────────────────────────────────────
 * Panelin oturum jetonu `localStorage['token']`'da (bkz. sistemtakip.web
 * src/lib/axios.ts). Ana süreç oraya erişemez ve erişebilseydi bile ikinci
 * bir kimlik yolu açmış olurduk. Burada, sayfanın KENDİ kaynağında ve kendi
 * jetonuyla okuyoruz: masaüstü uygulaması panelden fazla hiçbir şey göremez.
 *
 * ── Sayfaya hiçbir şey EKLENMEZ ─────────────────────────────────────────
 * `contextBridge` yalnız tek yönlü bir dinleyici açar (ana süreç → sayfa).
 * Panel kodu bu uygulamadan habersiz kalmalı; masaüstünde farklı davranan
 * bir web uygulaması, iki ayrı ürün demektir.
 */

const POLL_MS = 60_000;

/** API paneldeki ile AYNI kaynakta, `/api` altında (NEXT_PUBLIC_API_URL). */
function apiBase() {
  return `${location.origin}/api`;
}

function token() {
  try {
    return window.localStorage.getItem('token');
  } catch {
    return null;
  }
}

function teamId() {
  try {
    return window.localStorage.getItem('current_team_id');
  } catch {
    return null;
  }
}

async function get(path) {
  const auth = token();

  if (!auth) throw new Error('oturum yok');

  const headers = {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    Authorization: `Bearer ${auth}`,
  };
  const team = teamId();

  // Takım başlığı: API'nin modül yetki kontrolü (EnsureModuleEnabled) bunu
  // okuyor; göndermezsek panelde görünen bildirimlerin bir kısmı gelmez.
  if (team) headers['X-Team-Id'] = team;

  const response = await fetch(`${apiBase()}${path}`, { headers });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  return response.json();
}

async function poll() {
  try {
    /*
     * İki uç, tek tur. `allSettled`: biri düşse de diğerini gösterelim —
     * menü çubuğunun tamamen boşalması, tek bir yavaş uca ödenecek bedel
     * değil.
     */
    const [list, unread] = await Promise.allSettled([
      get('/notifications'),
      get('/notifications/unread-count'),
    ]);

    const items = list.status === 'fulfilled'
      ? (Array.isArray(list.value) ? list.value : (list.value?.data ?? []))
      : [];

    ipcRenderer.send('st:poll', {
      notifications: items.slice(0, 8),
      unread: unread.status === 'fulfilled' ? Number(unread.value?.count ?? 0) : 0,
      error: list.status === 'rejected' ? String(list.reason?.message ?? list.reason) : null,
    });
  } catch (error) {
    ipcRenderer.send('st:poll', {
      notifications: [], unread: 0, error: String(error?.message ?? error),
    });
  }
}

/*
 * İlk tur gecikmeli: sayfa açılır açılmaz jeton henüz yazılmamış olabilir
 * (giriş akışı) ve menü çubuğu boşuna "oturum yok" derdi.
 */
setTimeout(poll, 4000);
setInterval(poll, POLL_MS);

ipcRenderer.on('st:refresh', poll);

/*
 * Ana süreçten gelen yönlendirme. `location.assign` kullanılıyor, Next
 * router'ına dokunulmuyor: panel kendi yönlendiricisiyle çalışsın, biz
 * yalnız adresi söyleyelim. SistemTakip'te dil öneki YOK
 * (i18n/routing.ts → localePrefix: 'never'), yol olduğu gibi gider.
 */
ipcRenderer.on('st:navigate', (_event, path) => {
  location.assign(path);
});

contextBridge.exposeInMainWorld('sistemtakipDesktop', { version: 1 });
