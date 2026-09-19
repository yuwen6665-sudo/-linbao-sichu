// 云函数：把云存储 fileID 换成临时 HTTPS 链接
//
// 为什么需要它：
//   云开发的免费套餐不允许把文件权限改成「所有用户可读」，
//   对方手机上直接拿 cloud:// 地址可能显示不出来。
//   这里统一换一次临时链接，有效期约 2 小时，够用。
//
// 入参 event.fileIDs: 数组，形如 ['cloud://xxx/dishes/西红柿鸡蛋面.png']
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const fileIDs = event.fileIDs || []
  if (fileIDs.length === 0) return { success: true, list: [] }

  try {
    const res = await cloud.getTempFileURL({ fileList: fileIDs })
    const list = res.fileList.map(function (f) {
      return {
        fileID: f.fileID,
        tempFileURL: f.tempFileURL || ''
      }
    })
    return { success: true, list: list }
  } catch (err) {
    console.error('换链接失败', err)
    return { success: false, error: err.errMsg || err.message || String(err) }
  }
}
