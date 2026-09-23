/**
 * 全局主题 —— 薰衣草紫
 * 改配色只改这里。页面里的 wxss 通过 var() 引用不到 js，
 * 所以数值和 app.wxss 里的保持一致，改的时候两边都要动。
 *
 * 【2026-09-23】整体往「薰衣草紫 + 藕粉」靠，方向是**降饱和、提明度**。
 * ⚠️ PRIMARY_DEEP 是承载白字的色，可以略降饱和但不能变浅，否则白字压不住。
 */

module.exports = {
  // 主色（大面积浅底用这个的浅色版，文字/图标用这个）
  PRIMARY: '#9B8BD8',
  // 深一点的主色：白字按钮必须用这个，纯主色对比度不够
  PRIMARY_DEEP: '#6A5AA8',
  // 主色的浅色底
  PRIMARY_LIGHT: '#EDE7F9',
  // 页面底色
  BG: '#FBF8FC',
  // 点缀粉：只用在与「对象」相关的地方，占比别超一成
  ACCENT: '#E8A0BE',
  // 文字
  TEXT: '#3A3345',
  TEXT_SUB: '#6B6380',
  TEXT_LIGHT: '#A49CB6',
  // 分隔线 / 卡片底
  BORDER: '#F0EBF6',
  CARD: '#FFFFFF'
}
