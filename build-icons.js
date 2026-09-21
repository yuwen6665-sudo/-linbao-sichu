// 把 assets/icons/*.svg 转成可在 WXSS 里用的 url-encoded data URI，
// 输出到 assets/icons/icons-datauri.txt 方便复制，同时生成 utils/icons.js（base64）。
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'assets', 'icons');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.svg'));

function urlEncodeSvg(svg) {
  // 去掉注释、压缩空白后做 URL 编码（保留可读字符）
  const compact = svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\r?\n/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return (
    'data:image/svg+xml,' +
    compact
      .replace(/"/g, "'")
      .replace(/%/g, '%25')
      .replace(/#/g, '%23')
      .replace(/</g, '%3C')
      .replace(/>/g, '%3E')
      .replace(/&/g, '%26')
      .replace(/\{/g, '%7B')
      .replace(/\}/g, '%7D')
  );
}

const out = {};
const lines = [];
files.forEach((f) => {
  const svg = fs.readFileSync(path.join(dir, f), 'utf8');
  const key = f.replace('.svg', '');
  const uri = urlEncodeSvg(svg);
  out[key] = uri;
  lines.push('/* ' + key + ' */\n' + uri + '\n');
});

fs.writeFileSync(path.join(dir, 'icons-datauri.txt'), lines.join('\n'), 'utf8');

// 生成 utils/icons.js
const js =
  '// 自动生成：手绘植物图标 data URI（南法庄园风）\n' +
  '// 由 build-icons.js 生成，勿手改\n' +
  'module.exports = ' +
  JSON.stringify(out, null, 2) +
  ';\n';
fs.writeFileSync(path.join(__dirname, 'utils', 'icons.js'), js, 'utf8');

console.log('生成图标:', files.join(', '));
console.log('共', files.length, '个 -> utils/icons.js, assets/icons/icons-datauri.txt');
