// build-art.js —— 南法庄园风「精致手绘水彩」美术资源生成
// 用 sharp(librsvg) 把带纹理滤镜的 SVG 栅格化成 PNG。
// 产出：
//   assets/tabbar/*.png        4 个 Tab 图标（详细版，含未选/选中）
//   assets/art/hero.png        首页 Hero 普罗旺斯厨窗静物插画
//   assets/art/divider.png     橄榄枝装饰分割线
//   assets/art/leaf-gobo.png   橄榄叶光斑背景（可平铺）
//   assets/art/corner.png      卡片角花
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const tabDir = path.join(__dirname, 'assets', 'tabbar');
const artDir = path.join(__dirname, 'assets', 'art');
[tabDir, artDir].forEach((d) => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// 调色板
const C = {
  cream: '#FFF8E7', parchment: '#FDFCF5', sand: '#E6E0D4',
  sage: '#9CAF88', olive: '#6B8E23', terracotta: '#E2725B',
  burnt: '#C06014', mustard: '#E1AD01', indigo: '#2E3B4E', umber: '#4B3621',
};

// 水彩质感滤镜（轻微纸张扰动 + 颗粒）
function defs(seed) {
  return `
  <defs>
    <filter id="wc" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.012 0.016" numOctaves="2" seed="${seed}" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2"/>
    </filter>
    <filter id="paper">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="${seed + 5}" result="g"/>
      <feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.05 0"/>
      <feComposite operator="over" in2="SourceGraphic"/>
    </filter>
    <radialGradient id="glow" cx="50%" cy="22%" r="75%">
      <stop offset="0%" stop-color="${C.mustard}" stop-opacity="0.28"/>
      <stop offset="45%" stop-color="${C.cream}" stop-opacity="0"/>
    </radialGradient>
  </defs>`;
}

/* =================== Tab 图标（精致版） =================== */
// 统一外框：viewBox 48，描边色 __C__，水彩填充用半透明
function tabSvg(inner, stroke) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none">
    <g stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</g></svg>`;
}

// 农舍：石屋 + 橄榄树 + 烟囱炊烟 + 窗格 + 小花圃
function homeInner(stroke, leaf, roof, warm) {
  return `
    <path d="M9 23 L23 11 L37 23" fill="${roof}" fill-opacity="0.85"/>
    <path d="M7 23 L39 23" stroke-width="2.4"/>
    <path d="M11 23 L11 39 L35 39 L35 23" fill="${C.parchment}" fill-opacity="0.95"/>
    <rect x="19" y="30" width="8" height="9" rx="1" fill="${leaf}" fill-opacity="0.55"/>
    <path d="M23 30 L23 39 M19 34.5 L27 34.5" stroke-width="1.2"/>
    <rect x="14" y="26" width="6" height="6" rx="1" fill="${warm}" fill-opacity="0.5"/>
    <path d="M30 9 L30 15 L33 15" />
    <path d="M30 9 C28 6 31 5 30 3" stroke="${stroke}" stroke-width="1.2" stroke-opacity="0.6"/>
    <g stroke="${leaf}">
      <path d="M41 39 C41 30 44 27 43 21" stroke-width="1.8"/>
      <circle cx="43" cy="20" r="3.4" fill="${leaf}" fill-opacity="0.6" stroke="none"/>
      <circle cx="40" cy="25" r="2.6" fill="${leaf}" fill-opacity="0.5" stroke="none"/>
      <circle cx="45" cy="26" r="2.2" fill="${leaf}" fill-opacity="0.5" stroke="none"/>
    </g>
    <circle cx="14" cy="40" r="1.4" fill="${C.terracotta}" stroke="none"/>
    <circle cx="18" cy="40.5" r="1.2" fill="${C.mustard}" stroke="none"/>`;
}

// 菜谱书：翻开的书 + 文字行 + 书签缎带 + 角落橄榄小枝
function menuInner(stroke, leaf, warm) {
  return `
    <path d="M24 13 C19 10 13 10 9 12 L9 37 C13 35 19 35 24 38 C29 35 35 35 39 37 L39 12 C35 10 29 10 24 13 Z" fill="${C.parchment}" fill-opacity="0.95"/>
    <path d="M24 13 L24 38" stroke-width="1.6"/>
    <path d="M12 18 L21 18 M12 23 L21 23 M12 28 L19 28" stroke="${leaf}" stroke-width="1.3"/>
    <path d="M27 18 L36 18 M27 23 L36 23 M27 28 L34 28" stroke="${leaf}" stroke-width="1.3"/>
    <path d="M31 10 L31 21 L33.5 18 L36 21 L36 10" fill="${warm}" fill-opacity="0.7"/>
    <g stroke="${leaf}">
      <path d="M9 40 C12 37 14 36 16 33" stroke-width="1.4"/>
      <circle cx="10" cy="39" r="2" fill="${leaf}" fill-opacity="0.6" stroke="none"/>
    </g>`;
}

// 食材篮：藤编纹 + 番茄 + 胡萝卜缨 + 香草
function fridgeInner(stroke, leaf, warm) {
  return `
    <path d="M10 21 L38 21 L34.5 39 L13.5 39 Z" fill="${C.burnt}" fill-opacity="0.32"/>
    <path d="M14 21 C14 12 34 12 34 21" stroke-width="2.2"/>
    <path d="M12 27 L36 27 M11.5 33 L36.5 33" stroke-width="1.2" stroke-opacity="0.7"/>
    <path d="M18 21 L20 39 M24 21 L24 39 M30 21 L28 39" stroke-width="1" stroke-opacity="0.5"/>
    <circle cx="18" cy="18" r="5" fill="${C.terracotta}" fill-opacity="0.85"/>
    <path d="M18 13 C16 11 20 11 18 13" stroke="${leaf}" stroke-width="1.2"/>
    <circle cx="29" cy="17" r="4" fill="${warm}" fill-opacity="0.8"/>
    <g stroke="${leaf}">
      <path d="M24 14 C22 9 25 7 24 4 M27 13 C26 9 29 8 28 5" stroke-width="1.4"/>
    </g>`;
}

// 炖锅：双耳锅 + 锅盖 + 蒸汽 + 橄榄枝
function cartInner(stroke, leaf, warm) {
  return `
    <path d="M11 23 L37 23 L34 38 C34 39 33 39 32 39 L16 39 C15 39 14 39 14 38 Z" fill="${leaf}" fill-opacity="0.4"/>
    <path d="M8 23 L40 23" stroke-width="2.4"/>
    <path d="M14 23 C14 19 34 19 34 23" fill="${warm}" fill-opacity="0.35"/>
    <path d="M8 23 C6 23 5 21 6 20 M40 23 C42 23 43 21 42 20" />
    <circle cx="24" cy="18.5" r="1.6" fill="${stroke}" stroke="none"/>
    <g stroke="${leaf}" stroke-width="1.5">
      <path d="M18 16 C16 12 19 10 18 6"/>
      <path d="M24 15 C22 11 25 9 24 5"/>
      <path d="M30 16 C28 12 31 10 30 6"/>
    </g>
    <path d="M20 31 L28 31" stroke="${C.parchment}" stroke-width="1.4" stroke-opacity="0.7"/>`;
}

async function renderTab(name, innerFn) {
  // 未选：暖灰描边 + 极淡填充
  const normal = tabSvg(innerFn('#8d8472', '#b9c2a6', '#cdb6a0', '#e8d5a8'), '#8d8472');
  // 选中：橄榄绿描边 + 饱和水彩
  const active = tabSvg(innerFn(C.olive, C.sage, C.terracotta, C.mustard), C.olive);
  await sharp(Buffer.from(normal)).resize(81, 81).png().toFile(path.join(tabDir, name + '.png'));
  await sharp(Buffer.from(active)).resize(81, 81).png().toFile(path.join(tabDir, name + '-active.png'));
}

/* =================== Hero：普罗旺斯厨窗静物 =================== */
function heroSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240" fill="none">
    ${defs(7)}
    <!-- 暖光背景 -->
    <rect width="320" height="240" fill="${C.cream}"/>
    <rect width="320" height="240" fill="url(#glow)"/>
    <g filter="url(#wc)">
      <!-- 拱形窗框 -->
      <path d="M60 210 L60 90 C60 45 110 28 160 28 C210 28 260 45 260 90 L260 210"
            fill="#eef1e6" stroke="${C.umber}" stroke-width="3"/>
      <path d="M70 205 L70 92 C70 52 114 38 160 38 C206 38 250 52 250 92 L250 205"
            fill="#dce6f0" fill-opacity="0.6" stroke="${C.umber}" stroke-width="1.5"/>
      <!-- 窗格 -->
      <path d="M160 38 L160 205 M75 120 L245 120" stroke="${C.umber}" stroke-width="2" stroke-opacity="0.7"/>
      <!-- 远山与柏树（窗外） -->
      <path d="M70 150 C110 130 150 140 200 128 C230 122 245 130 250 132 L250 150 Z" fill="${C.sage}" fill-opacity="0.5"/>
      <ellipse cx="120" cy="100" rx="9" ry="22" fill="${C.olive}" fill-opacity="0.55"/>
      <ellipse cx="205" cy="98" rx="7" ry="18" fill="${C.olive}" fill-opacity="0.45"/>
      <circle cx="215" cy="70" r="14" fill="${C.mustard}" fill-opacity="0.5"/>
    </g>
    <!-- 窗台静物 -->
    <g filter="url(#wc)">
      <rect x="40" y="205" width="240" height="20" rx="4" fill="${C.sand}" stroke="${C.umber}" stroke-width="2.5"/>
      <!-- 陶罐 + 橄榄枝 -->
      <path d="M86 205 C82 188 82 176 90 170 C98 176 98 188 94 205 Z" fill="${C.terracotta}" fill-opacity="0.85" stroke="${C.umber}" stroke-width="2"/>
      <g stroke="${C.olive}" stroke-width="2" fill="none">
        <path d="M90 172 C88 150 78 140 70 134"/>
        <path d="M90 172 C92 150 104 142 112 138"/>
      </g>
      <g fill="${C.sage}" fill-opacity="0.7">
        <ellipse cx="72" cy="138" rx="6" ry="3" transform="rotate(-40 72 138)"/>
        <ellipse cx="80" cy="148" rx="6" ry="3" transform="rotate(-30 80 148)"/>
        <ellipse cx="108" cy="142" rx="6" ry="3" transform="rotate(40 108 142)"/>
        <ellipse cx="100" cy="152" rx="6" ry="3" transform="rotate(28 100 152)"/>
      </g>
      <circle cx="70" cy="134" r="3" fill="${C.olive}"/>
      <circle cx="112" cy="138" r="2.6" fill="${C.mustard}"/>
      <!-- 番茄 -->
      <circle cx="150" cy="196" r="11" fill="${C.terracotta}" stroke="${C.umber}" stroke-width="2"/>
      <circle cx="167" cy="200" r="8" fill="${C.burnt}" fill-opacity="0.9" stroke="${C.umber}" stroke-width="1.6"/>
      <path d="M150 185 C148 181 152 181 150 185 M150 185 L150 196" stroke="${C.olive}" stroke-width="1.5"/>
      <!-- 法棍面包 -->
      <path d="M188 200 C200 190 224 190 236 200 C224 206 200 206 188 200 Z" fill="${C.mustard}" fill-opacity="0.65" stroke="${C.umber}" stroke-width="2"/>
      <path d="M200 196 L204 200 M210 195 L214 199 M220 196 L224 200" stroke="${C.umber}" stroke-width="1.2" stroke-opacity="0.6"/>
    </g>
    <!-- 顶部垂挂的香草束 -->
    <g filter="url(#wc)" stroke="${C.olive}" stroke-width="1.6" fill="none">
      <path d="M250 30 C252 48 248 60 246 72"/>
      <path d="M246 50 L240 46 M246 56 L252 52 M246 62 L240 58 M246 68 L252 64"/>
    </g>
    <g fill="${C.terracotta}" fill-opacity="0.8"><circle cx="248" cy="32" r="3"/></g>
  </svg>`;
}

/* =================== 装饰分割线（橄榄枝） =================== */
function dividerSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 40" fill="none">
    <g stroke="${C.sage}" stroke-width="1.6" stroke-linecap="round">
      <path d="M20 20 L130 20" stroke-dasharray="1 6"/>
      <path d="M300 20 L190 20" stroke-dasharray="1 6"/>
    </g>
    <g filter="">
      <g stroke="${C.olive}" stroke-width="1.8" fill="none">
        <path d="M160 8 C158 16 158 24 160 32"/>
        <path d="M160 14 C153 11 147 13 144 18 C150 20 156 19 160 14"/>
        <path d="M160 14 C167 11 173 13 176 18 C170 20 164 19 160 14"/>
        <path d="M160 24 C154 22 149 24 146 28 C151 30 157 28 160 24"/>
        <path d="M160 24 C166 22 171 24 174 28 C169 30 163 28 160 24"/>
      </g>
      <circle cx="160" cy="6" r="3" fill="${C.terracotta}"/>
      <circle cx="148" cy="18" r="2.4" fill="${C.sage}" fill-opacity="0.7"/>
      <circle cx="172" cy="18" r="2.4" fill="${C.mustard}" fill-opacity="0.8"/>
    </g>
  </svg>`;
}

/* =================== 卡片角花 =================== */
function cornerSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60" fill="none">
    <g stroke="${C.sage}" stroke-width="1.5" fill="none" stroke-linecap="round">
      <path d="M6 30 C6 16 16 6 30 6"/>
      <path d="M14 22 C10 18 12 13 17 12 C18 17 18 19 14 22 Z" fill="${C.sage}" fill-opacity="0.5"/>
      <path d="M22 14 C18 10 20 5 25 4 C26 9 26 11 22 14 Z" fill="${C.sage}" fill-opacity="0.5"/>
    </g>
    <circle cx="9" cy="9" r="2.4" fill="${C.terracotta}"/>
  </svg>`;
}

/* =================== 橄榄叶光斑背景（gobo） =================== */
function goboSvg() {
  // 平铺单元：几片柔和橄榄叶剪影，极低透明度
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" fill="none">
    <g fill="${C.olive}" fill-opacity="0.04">
      <ellipse cx="40" cy="36" rx="26" ry="10" transform="rotate(-30 40 36)"/>
      <ellipse cx="150" cy="60" rx="30" ry="11" transform="rotate(25 150 60)"/>
      <ellipse cx="90" cy="120" rx="24" ry="9" transform="rotate(-15 90 120)"/>
      <ellipse cx="170" cy="160" rx="22" ry="9" transform="rotate(40 170 160)"/>
      <ellipse cx="30" cy="170" rx="28" ry="10" transform="rotate(15 30 170)"/>
    </g>
    <g stroke="${C.sage}" stroke-width="1" stroke-opacity="0.05" fill="none">
      <path d="M20 30 C40 34 55 36 70 42"/>
      <path d="M130 56 C150 60 165 62 180 70"/>
    </g>
  </svg>`;
}

(async () => {
  // Tab 图标
  await renderTab('home', homeInner);
  await renderTab('menu', menuInner);
  await renderTab('fridge', fridgeInner);
  await renderTab('cart', cartInner);

  // 大图（2x 清晰）
  await sharp(Buffer.from(heroSvg())).resize(640, 480).png().toFile(path.join(artDir, 'hero.png'));
  await sharp(Buffer.from(dividerSvg())).resize(640, 80).png().toFile(path.join(artDir, 'divider.png'));
  await sharp(Buffer.from(cornerSvg())).resize(120, 120).png().toFile(path.join(artDir, 'corner.png'));
  await sharp(Buffer.from(goboSvg())).resize(400, 400).png().toFile(path.join(artDir, 'leaf-gobo.png'));

  console.log('✓ Tab 图标 4×2, hero.png, divider.png, corner.png, leaf-gobo.png 生成完成');
})();
