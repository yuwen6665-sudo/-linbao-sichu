/**
 * 全局主题 —— 淡紫色
 * 改配色只改这里。页面里的 wxss 通过 var() 引用不到 js，
 * 所以数值和 app.wxss 里的保持一致，改的时候两边都要动。
 */

module.exports = {
  // 主色（大面积浅底用这个的浅色版，文字/图标用这个）
  PRIMARY: '#8B7BE8',
  // 深一点的主色：白字按钮必须用这个，纯主色对比度不够
  PRIMARY_DEEP: '#6D5ACB',
  // 主色的浅色底
  PRIMARY_LIGHT: '#EDE9FF',
  // 页面底色
  BG: '#FAF8FF',
  // 点缀粉：只用在与「对象」相关的地方，占比别超一成
  ACCENT: '#E48CB0',
  // 文字
  TEXT: '#2E2A3D',
  TEXT_SUB: '#8A85A0',
  TEXT_LIGHT: '#B8B3C9',
  // 分隔线 / 卡片底
  BORDER: '#EFECFA',
  CARD: '#FFFFFF'
}
