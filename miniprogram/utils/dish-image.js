/**
 * 菜品插画 —— 菜名 → 云存储文件路径
 *
 * 为什么不直接查数据库：每次列表渲染多查一次，30 道菜会明显卡。
 * 图片路径是固定的，提前约定好直接拼就行。
 *
 * 用法：
 *   1. 先把画好的图传到云存储的 dishes 目录下，文件名 = 菜名.png
 *   2. 把下面 CLOUD_PREFIX 改成你的云存储前缀（见「怎么拿前缀」）
 *   3. 在 ILLUSTRATED 里把对应的菜名加上（没加的自动回落到原来的图）
 *
 * 怎么拿前缀：
 *   云开发控制台 → 存储 → 点开任意一张刚上传的图 → 复制「文件地址」
 *   形如 cloud://xxx.yyy/dishes/西红柿鸡蛋面.png
 *   把最后的 dishes/... 去掉，剩下的就是前缀，末尾保留那个斜杠
 */

// 已经画好插画的菜（画完一批往这里加，其他地方不用改）
const ILLUSTRATED = [
  '西红柿鸡蛋面',
  '小炒黄牛肉',
  '玉米排骨汤',
  '蒜蓉西兰花',
  '提拉米苏'
]

// 云存储前缀。留空表示还没配置 → 自动回落到原来的图，不会显示白块
const CLOUD_PREFIX = ''

// 云存储里的目录
const CLOUD_DIR = 'dishes'

/**
 * 把菜名换算成云存储 fileID
 * @param {string} name 菜名
 * @returns {string} fileID；没画过或前缀没配，返回 ''
 */
function imageFor(name) {
  if (!name) return ''
  if (!CLOUD_PREFIX) return ''
  if (ILLUSTRATED.indexOf(name) === -1) return ''
  return CLOUD_PREFIX + CLOUD_DIR + '/' + name + '.png'
}

/**
 * 给一批菜补图片字段
 * 优先级：数据库里已有的 > 插画 > 原来的外链
 */
function attachImages(dishes) {
  if (!dishes || !dishes.length) return dishes
  return dishes.map(function (d) {
    if (!d.image) {
      const illustrated = imageFor(d.name)
      d.image = illustrated || d.imageUrl || d.originImage || ''
    }
    if (!d.imageUrl) d.imageUrl = d.image
    return d
  })
}

module.exports = {
  ILLUSTRATED: ILLUSTRATED,
  CLOUD_PREFIX: CLOUD_PREFIX,
  CLOUD_DIR: CLOUD_DIR,
  imageFor: imageFor,
  attachImages: attachImages
}
