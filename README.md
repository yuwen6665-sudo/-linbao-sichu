# 🍳 钱老板私人定制 · 专属厨房

> 一个为爱定制的微信小程序：她负责点菜，你负责下厨。
> 每道菜都有食材清单和分步教程，还能按食材推荐、随机摇一摇、收藏、自己加菜谱。

视觉风格：**南法庄园现代风（South France Countryside Modern）** —— 阳光奶油底色、鼠尾草绿与陶土红配色、衬线标题、手绘水彩植物插画。

---

## ✨ 功能特性

| 功能 | 说明 |
| --- | --- |
| 🏡 首页 | 普罗旺斯厨窗插画 Hero、今日推荐、按菜系浏览 |
| 🎲 今天吃什么 | 随机摇一摇，帮你决定今天做哪道菜 |
| 📖 菜单 | 按菜系 / 分类筛选，支持菜名、食材搜索 |
| 🧺 食材点菜 | 勾选现有食材，按匹配度推荐能做的菜 |
| ❤ 收藏 | 收藏喜欢的菜谱，首页单独展示 |
| 🛒 购物车 + 下单 | 加入购物车下单（免费），下单成功随机弹出甜蜜短句 |
| 📋 菜谱详情 | 食材清单、分步图文教程、小贴士 |
| ✏️ 新增 / 编辑菜谱 | 手动填写，或**粘贴文字 / 拍照 OCR 智能识别**自动拆解成食材和步骤 |

菜品覆盖 **川菜 / 粤菜 / 湘菜 / 东北菜 / 家常菜 / 西餐 / 汤羹 / 甜点** 等多菜系，分类含荤菜 / 素菜 / 汤品 / 主食 / 凉菜 / 早餐 / 甜点。

---

## 📁 项目结构

```
.
├── app.js / app.json / app.wxss      小程序入口、全局配置、全局样式
├── project.config.json               项目配置
├── sitemap.json
├── components/
│   └── dish-card/                    菜品卡片组件（加购 / 收藏 / 详情）
├── pages/
│   ├── index/                        首页（Hero / 今天吃什么 / 推荐 / 菜系）
│   ├── menu/                         全部菜品（筛选 + 搜索）
│   ├── fridge/                       食材点菜
│   ├── cart/                         购物车 + 下单
│   ├── detail/                       菜谱详情
│   └── edit/                         新增 / 编辑菜谱（含智能识别）
├── utils/
│   ├── data.js                       内置菜品数据 + 菜系/分类 + 甜蜜短句
│   ├── store.js                      菜谱仓库（内置 + 用户新增/编辑/删除 合并）
│   ├── parser.js                     文字解析 + 图片 OCR
│   └── icons.js                      手绘图标 data URI（构建生成）
├── assets/
│   ├── tabbar/                       TabBar 图标（PNG，构建生成）
│   ├── art/                          插画美术（hero / divider / corner / gobo）
│   └── icons/                        手绘图标源 SVG
├── build-icons.js                    SVG 图标 → data URI 构建脚本
├── build-tabicons.js                 TabBar PNG 构建脚本
├── build-art.js                      精致水彩美术资源构建脚本
└── preview.html                      浏览器预览页（无需开发者工具即可看效果）
```

---

## 🚀 快速开始

### 在微信开发者工具中运行

1. 下载并安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 「导入项目」，目录选择本仓库根目录
3. AppID 选择「测试号」即可预览（无需真实 AppID）

### 浏览器快速预览

直接双击 `preview.html`，即可在浏览器里查看整体视觉与交互效果（读取真实菜品数据）。
> 注意：图片 OCR（拍照识别）仅在微信小程序真机 / 插件环境可用，预览页用文字识别演示。

---

## 🎨 美术资源构建（可选）

美术资源（图标、插画）已生成并随仓库提供，**正常使用无需重新构建**。
如需修改图标 / 插画，编辑 `assets/icons/*.svg` 或 `build-art.js` 后重新生成：

```bash
npm install          # 安装构建依赖 sharp
npm run build:art    # 生成 TabBar 图标 + 插画
npm run build:icons  # 生成手绘图标 data URI
```

---

## 🖼️ 图片文字识别（OCR）说明

新增菜谱时支持拍照识别。小程序端依赖微信的 OCR 能力：

- 优先使用「微信 OCR」插件（需在 [微信公众平台](https://mp.weixin.qq.com/) → 设置 → 第三方设置 → 插件 添加）
- 无 OCR 环境时会提示，可手动粘贴文字再「一键拆解」，功能不阻塞

---

## 🙏 致谢

- 灵感参考：[liu-ziting/what-to-eat（一饭封神）](https://github.com/liu-ziting/what-to-eat)
- 美术资源由 [sharp](https://github.com/lovell/sharp) 渲染生成

---

## 📄 License

[MIT](./LICENSE)
