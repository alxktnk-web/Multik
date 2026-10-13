// Собирает лабораторию в один HTML-фрагмент для страницы claude.ai (dist/artifact.html):
// стиль и скрипт встраиваются, обёртку <!doctype>/<head>/<body> добавляет сама платформа.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dist = resolve('dist');
const html = readFileSync(join(dist, 'lab/index.html'), 'utf8');
const asset = (re) => {
  const m = html.match(re);
  if (!m) throw new Error(`не найдено: ${re}`);
  return readFileSync(join(dist, 'lab', m[1]), 'utf8');
};
const css = asset(/<link rel="stylesheet"[^>]*href="([^"]+)"/);
const js = asset(/<script type="module"[^>]*src="([^"]+)"/).replace(/<\/script/gi, '<\\/script');
const body = html
  .slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/<script type="module"[^>]*><\/script>/, '')
  .trim();
const out = `<title>Лаборатория Мультика</title>\n<style>${css}</style>\n${body}\n<script type="module">${js}</script>\n`;
writeFileSync(join(dist, 'artifact.html'), out);
console.log(`dist/artifact.html: ${(out.length / 1024).toFixed(1)} КБ`);
