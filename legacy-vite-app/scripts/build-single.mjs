// Builds the whole app into ONE self-contained HTML file.
//   dist-single/pos.html          React from cdnjs (jsDelivr fallback)
//   dist-single/pos-offline.html  React inlined too; works with no internet
// Usage: node scripts/build-single.mjs
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'dist-single');
fs.mkdirSync(outDir, { recursive: true });
const nm = (p) => path.join(root, 'node_modules', p);

// React comes from window globals (UMD). CSS imports are handled separately.
const globalsPlugin = {
  name: 'umd-globals',
  setup(b) {
    b.onResolve({ filter: /^react(-dom(\/client)?)?$/ }, (a) => ({ path: a.path, namespace: 'umd' }));
    b.onLoad({ filter: /.*/, namespace: 'umd' }, (a) => ({
      loader: 'js',
      contents:
        a.path === 'react'
          ? 'module.exports = window.React;'
          : a.path === 'react-dom'
            ? 'module.exports = window.ReactDOM;'
            : 'module.exports = { createRoot: function (el, o) { return window.ReactDOM.createRoot(el, o); } };',
    }));
    b.onResolve({ filter: /\.css$/ }, (a) => ({ path: a.path, namespace: 'css-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'css-stub' }, () => ({ contents: '', loader: 'js' }));
  },
};

const result = await build({
  entryPoints: [path.join(root, 'src/main.jsx')],
  bundle: true,
  write: false,
  format: 'iife',
  minify: true,
  legalComments: 'none',
  target: ['es2020', 'chrome91', 'safari15', 'firefox90'],
  jsx: 'transform',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [globalsPlugin],
  logLevel: 'warning',
});
const js = result.outputFiles[0].text;

const css = execFileSync(
  path.join(root, 'node_modules/.bin/tailwindcss'),
  ['-c', path.join(root, 'tailwind.config.cjs'), '-i', path.join(root, 'src/index.css'), '--minify'],
  { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
);

const b64 = (p) => fs.readFileSync(p).toString('base64');
const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT =
  'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';
const face = (family, file, range) =>
  `@font-face{font-family:"${family}";font-style:normal;font-display:swap;font-weight:200 800;src:url(data:font/woff2;base64,${b64(file)}) format("woff2");unicode-range:${range}}`;
const next = nm('@fontsource-variable/atkinson-hyperlegible-next/files');
const mono = nm('@fontsource-variable/atkinson-hyperlegible-mono/files');
const fonts = [
  face('Atkinson Hyperlegible Next', path.join(next, 'atkinson-hyperlegible-next-latin-wght-normal.woff2'), LATIN),
  face('Atkinson Hyperlegible Next', path.join(next, 'atkinson-hyperlegible-next-latin-ext-wght-normal.woff2'), LATIN_EXT),
  face('Atkinson Hyperlegible Mono', path.join(mono, 'atkinson-hyperlegible-mono-latin-wght-normal.woff2'), LATIN),
].join('');

const safe = (s) => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const cdn = [
  '<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js"></script>',
  `<script>window.React||document.write('<script src="https://cdn.jsdelivr.net/npm/react@18.2.0/umd/react.production.min.js"><\\/script>')</script>`,
  '<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"></script>',
  `<script>window.ReactDOM||document.write('<script src="https://cdn.jsdelivr.net/npm/react-dom@18.2.0/umd/react-dom.production.min.js"><\\/script>')</script>`,
].join('\n');
const inline = [nm('react/umd/react.production.min.js'), nm('react-dom/umd/react-dom.production.min.js')]
  .map((f) => `<script>${safe(fs.readFileSync(f, 'utf8'))}</script>`)
  .join('\n');

const page = (reactTags) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#123422">
<meta name="color-scheme" content="light dark">
<title>POS and inventory</title>
<style>${fonts}</style>
<style>${css}</style>
<style>.boot-msg{display:flex;height:100%;align-items:center;justify-content:center;padding:24px;text-align:center;font:600 15px/1.5 system-ui,sans-serif;color:rgb(var(--muted))}</style>
</head>
<body>
<div id="root"><div class="boot-msg">Opening the register…</div></div>
${reactTags}
<script>${safe(js)}</script>
<script>setTimeout(function(){if(!window.__posBooted){var r=document.getElementById('root');if(r)r.innerHTML='<div class="boot-msg">The POS couldn\\u2019t start. Check the internet connection, then reload the page.</div>';}},8000)</script>
</body>
</html>
`;

fs.writeFileSync(path.join(outDir, 'pos.html'), page(cdn));
fs.writeFileSync(path.join(outDir, 'pos-offline.html'), page(inline));
const kb = (f) => `${Math.round(fs.statSync(path.join(outDir, f)).size / 1024)} KB`;
console.log(`dist-single/pos.html ${kb('pos.html')}, dist-single/pos-offline.html ${kb('pos-offline.html')} (js ${Math.round(js.length / 1024)} KB, css ${Math.round(css.length / 1024)} KB)`);
