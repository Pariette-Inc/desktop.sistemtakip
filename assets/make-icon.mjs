import { hsl, mix, inRR, onPath, render, writePng } from './icongen.mjs';

// SistemTakip: indigo squircle + ekran çerçevesi ve nabız çizgisi.
// Menü çubuğu simgesiyle aynı işaret (bkz. src/main.js trayIcon) — küçükte
// ve büyükte aynı şeyi gören bir kullanıcı ikisini birleştirebilsin.
const S = 1024, C = S / 2;
const TOP = hsl(243, 100, 72), BOT = hsl(243, 82, 40);
const INK = [255, 255, 255], PULSE = hsl(172, 100, 52);
const MY = 462; // ekranın merkezi (ayak aşağıda yer kaplıyor)

const px = render(S, (x, y) => {
  if (!inRR(x, y, C, C, 824, 824, 190)) return null;
  const bg = mix(TOP, BOT, (x + y) / (2 * S));

  const frame = inRR(x, y, C, MY, 560, 392, 56) && !inRR(x, y, C, MY, 496, 328, 30);
  const neck = inRR(x, y, C, 700, 132, 78, 10);
  const foot = inRR(x, y, C, 760, 320, 40, 20);
  const pulse = inRR(x, y, C, MY, 496, 328, 30) && onPath(x, y, [
    [280, MY], [372, MY], [424, MY - 96], [512, MY + 104], [566, MY], [744, MY],
  ], 34);

  if (pulse) return [...PULSE, 1];
  if (frame || neck || foot) return [...INK, 1];
  return [...bg, 1];
});

writePng(new URL('./icon.png', import.meta.url).pathname, S, px);
