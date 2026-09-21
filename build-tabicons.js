// 生成 TabBar 用的 PNG 图标（南法庄园风手绘单线）
// 每个图标两种状态：normal(未选 灰赭色) / active(选中 橄榄绿)
// 输出到 assets/tabbar/*.png  （81x81，微信推荐尺寸）
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const outDir = path.join(__dirname, 'assets', 'tabbar');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const NORMAL = '#9A9281';   // 未选：暖灰
const ACTIVE = '#6B8E23';   // 选中：橄榄绿
const FILL_N = 'none';
const FILL_A = 'rgba(156,175,136,0.35)'; // 选中态淡水彩填充

// 每个图标返回 svg 字符串，stroke/fill 用占位符替换
function svgWrap(inner) {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none">' +
    '<g stroke="__C__" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
    inner +
    '</g></svg>'
  );
}

// 农舍（首页）
const home = svgWrap(
  '<path d="M9 22 L24 10 L39 22" fill="__F__"/>' +
  '<path d="M12 22 L12 38 L36 38 L36 22" fill="__F__"/>' +
  '<rect x="20" y="29" width="8" height="9" fill="__F__"/>' +
  '<path d="M31 13 L31 18" />'
);

// 笔记本（菜单）
const menu = svgWrap(
  '<rect x="12" y="9" width="24" height="30" rx="3" fill="__F__"/>' +
  '<path d="M12 9 L12 39" stroke-width="2.8"/>' +
  '<path d="M18 18 L31 18 M18 24 L31 24 M18 30 L27 30" stroke-width="1.8"/>'
);

// 食材篮（食材）
const basket = svgWrap(
  '<path d="M10 20 L38 20 L34 38 L14 38 Z" fill="__F__"/>' +
  '<path d="M15 20 C15 11 33 11 33 20" />' +
  '<path d="M19 20 L21 38 M28 20 L26 38" stroke-width="1.6"/>' +
  '<path d="M24 12 C22 9 24 6 27 6" stroke-width="1.8"/>'
);

// 炖锅（购物车）
const pot = svgWrap(
  '<path d="M11 22 L37 22 L34 38 L14 38 Z" fill="__F__"/>' +
  '<path d="M8 22 L40 22" stroke-width="2.8"/>' +
  '<path d="M8 22 L5 19 M40 22 L43 19" />' +
  '<path d="M19 16 C18 12 21 11 20 8 M28 16 C27 12 30 11 29 8" stroke-width="1.8"/>'
);

const ICONS = { home: home, menu: menu, fridge: basket, cart: pot };

async function render(name, svgTpl, color, fill, file) {
  const svg = svgTpl.replace(/__C__/g, color).replace(/__F__/g, fill);
  await sharp(Buffer.from(svg)).resize(81, 81).png().toFile(path.join(outDir, file));
}

(async () => {
  for (const key of Object.keys(ICONS)) {
    await render(key, ICONS[key], NORMAL, FILL_N, key + '.png');
    await render(key, ICONS[key], ACTIVE, FILL_A, key + '-active.png');
  }
  console.log('生成 TabBar 图标:', Object.keys(ICONS).map((k) => k + '.png / ' + k + '-active.png').join(', '));
})();
