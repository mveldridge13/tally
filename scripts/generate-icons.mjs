// Renders the Tally mark into the app icon, Android adaptive icon layers and splash image.
// Run: npm run icons   (keep the paths in sync with TallyMark in apps/mobile/src/components/brand.tsx)
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAVY = '#605574'; // Deep purple: background of the icon and splash
const SKY = '#FAF0EB'; // Cream: the four strokes
const SLASH = '#EF4444'; // Red: the slash (part of the logo in every palette)

const STROKES = [
  { d: 'M29 21.5 C 27.6 40, 30.2 58, 28.6 79', w: 7.4 },
  { d: 'M43 19.5 C 44.6 38, 41.8 60, 43.4 80.5', w: 6.8 },
  { d: 'M57.2 22 C 55.6 40, 58.2 59, 56.6 79', w: 7.2 },
  { d: 'M71 20.5 C 72.2 39, 69.8 58, 71.4 80', w: 6.6 },
];
const SLASH_PATH = { d: 'M15 70.5 C 33 61.5, 51 50.5, 65 41.5 S 80.5 31.5, 87 29', w: 7.8 };

function svg({ size, bg, bar = SKY, slash = SLASH, scale = 1 }) {
  const t = (100 - 100 * scale) / 2;
  const paths = [...STROKES.map((s) => ({ ...s, c: bar })), { ...SLASH_PATH, c: slash }]
    .map((p) => `<path d="${p.d}" stroke="${p.c}" stroke-width="${p.w}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">${
    bg ? `<rect width="100" height="100" fill="${bg}"/>` : ''
  }<g transform="translate(${t} ${t}) scale(${scale})" fill="none" stroke-linecap="round">${paths}</g></svg>`;
}

// Splash: the mark with the wordmark "tally." underneath, both cream, on a transparent square
// (the purple background comes from app.json). Mirrors the Wordmark in brand.tsx.
function splashSvg(size) {
  const paths = [...STROKES.map((s) => ({ ...s, c: SKY })), { ...SLASH_PATH, c: SLASH }]
    .map((p) => `<path d="${p.d}" stroke="${p.c}" stroke-width="${p.w}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">` +
    `<g transform="translate(22 6) scale(0.56)" fill="none" stroke-linecap="round">${paths}</g>` +
    `<text x="50" y="86" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif" font-weight="800" ` +
    `font-size="21" letter-spacing="-0.6" fill="${SKY}">tally.</text></svg>`;
}

const out = join(dirname(fileURLToPath(import.meta.url)), '../apps/mobile/assets/images');
const write = (file, opts) => {
  writeFileSync(join(out, file), new Resvg(svg(opts)).render().asPng());
  console.log('wrote', file);
};

// iOS / store icon: full-bleed navy with the mark.
write('icon.png', { size: 1024, bg: NAVY, scale: 0.78 });
// Android adaptive icon: the launcher masks to ~66% of the canvas, so keep the mark inside that.
write('android-icon-foreground.png', { size: 1024, scale: 0.6 });
write('android-icon-background.png', { size: 1024, bg: NAVY, scale: 0, bar: NAVY, slash: NAVY });
write('android-icon-monochrome.png', { size: 1024, scale: 0.6, bar: '#FFFFFF', slash: '#FFFFFF' });
// Splash: the mark and "tally.", centred on the purple splash background from app.json.
writeFileSync(join(out, 'splash-icon.png'), new Resvg(splashSvg(1024), { font: { loadSystemFonts: true } }).render().asPng());
console.log('wrote splash-icon.png');
write('favicon.png', { size: 196, bg: NAVY, scale: 0.85 });
