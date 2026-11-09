// Builds an offline Lively Wallpaper package:
//   build/lively/          -> unpacked wallpaper folder (add via Lively "+" > folder / drag index.html)
//   build/Su33-lively.zip  -> drag-and-drop into Lively to import
// Everything (JS, CSS, font) is inlined into one index.html with a classic <script>,
// so it runs from file:// with no network and no ES-module CORS issues.
import { build } from 'vite';
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const tmp = join(root, 'build', '.wallpaper-tmp');
const out = join(root, 'build', 'lively');
const zip = join(root, 'build', 'Su33-lively.zip');
const src = join(root, 'wallpaper');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

rmSync(tmp, { recursive: true, force: true });
rmSync(out, { recursive: true, force: true });
rmSync(zip, { force: true });

await build({
  root,
  configFile: false,
  logLevel: 'warn',
  base: './',
  build: {
    outDir: tmp,
    emptyOutDir: true,
    modulePreload: false,
    chunkSizeWarningLimit: 5000,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } },
  },
});

const assets = join(tmp, 'assets');
const files = readdirSync(assets);
const js = files.filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
const font = readFileSync(join(src, 'JetBrainsMono-Bold-latin.woff2')).toString('base64');

const fontFace = `@font-face{font-family:"JetBrains Mono";font-style:normal;font-weight:700;font-display:block;src:url(data:font/woff2;base64,${font}) format("woff2");}`;
const safeJs = js.replace(/<\/script/gi, '<\\/script');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Su33</title>
<style>${fontFace}\n${css}</style>
</head>
<body>
<canvas id="c"></canvas>
<div id="labels"></div>
<script>${safeJs}</script>
</body>
</html>
`;

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'index.html'), html);

const info = {
  AppVersion: '2.0.6.1',
  Title: 'Su-33',
  Thumbnail: 'thumbnail.jpg',
  Preview: existsSync(join(src, 'preview.gif')) ? 'preview.gif' : '',
  Desc: 'Monochrome ASCII Su-33 loop: carrier launch, cobra, weapons, trap. Runs fully offline.',
  Author: 'Karam Hittini',
  License: 'Font: JetBrains Mono (OFL, see OFL.txt)',
  Contact: 'https://su33.karamhittini.com',
  Type: 1,
  FileName: 'index.html',
  Arguments: '',
  IsAbsolutePath: false,
};
if (!info.Preview) delete info.Preview;
writeFileSync(join(out, 'LivelyInfo.json'), JSON.stringify(info, null, 2));
copyFileSync(join(src, 'LivelyProperties.json'), join(out, 'LivelyProperties.json'));
copyFileSync(join(src, 'OFL.txt'), join(out, 'OFL.txt'));
for (const f of ['thumbnail.jpg', 'preview.gif']) {
  if (existsSync(join(src, f))) copyFileSync(join(src, f), join(out, f));
}
rmSync(tmp, { recursive: true, force: true });

// Zip with LivelyInfo.json at the archive root (Windows-only; Lively is Windows-only).
execFileSync('powershell', ['-NoProfile', '-Command',
  `Compress-Archive -Path '${out}\\*' -DestinationPath '${zip}' -Force`], { stdio: 'inherit' });

const kb = (p) => (readFileSync(p).length / 1024).toFixed(0) + ' KB';
console.log(`v${pkg.version} wallpaper -> ${out} (index.html ${kb(join(out, 'index.html'))})`);
console.log(`zip -> ${zip} (${kb(zip)})`);
