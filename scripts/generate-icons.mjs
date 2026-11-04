// Renders the Tally mark into the app icon, Android adaptive icon layers and splash image.
// Run: npm run icons   (keep the paths in sync with TallyMark in apps/mobile/src/components/brand.tsx)
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAVY = '#4E6E5D'; // Sage: background of the icon and splash
const SKY = '#D3E5DA'; // Pale sage: the four strokes
const SLASH = '#F2555A'; // Red: the slash (part of the logo in every palette)

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
// Splash: transparent mark, centred on the navy splash background from app.json.
write('splash-icon.png', { size: 1024 });
write('favicon.png', { size: 196, bg: NAVY, scale: 0.85 });
