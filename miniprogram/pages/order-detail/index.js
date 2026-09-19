// 订单详情页 —— 从云数据库读，操作写回数据库
const app = getApp()
const api = require('../../utils/api.js')
const moodUtil = require('../../utils/mood.js')
const notify = require('../../utils/notify.js')

const STATUS_INFO = {
  pending: { text: '等 TA 接单', desc: '订单刚发出去，做饭的人还没看到 / 还没点头' },
  making: { text: '正在做', desc: '已经接单啦，厨房里忙活中' },
  done: { text: '做好了', desc: '这顿饭完成了' },
  rejected: { text: '被拒绝', desc: '对方今天做不了' },
  canceled: { text: '已取消', desc: '这一单不算数' }
}

Page({
  data: {
    loading: true,
    orderId: '',
    order: null,
    statusText: '',
    statusDesc: '',
    totalCount: 0,
    timeText: '',
    isChef: true,
    fromMe: false,

    // 评价
    rating: 0,
    comment: '',
    photos: []
  },

  async onLoad(options) {
    this.setData({ isChef: app.globalData.userRole === 'chef' })
    if (options.id) {
      this.setData({ orderId: options.id })
      await this.loadDetail(options.id)
    } else {
      wx.showToast({ title: '订单不存在', icon: 'none' })
    }
  },

  // 离开页面时把可能残留的 loading 清掉。
  // loading 是全局遮罩，一旦没关，回到别的页面就整屏点不动。
  onUnload() {
    wx.hideLoading()
  },

  async loadDetail(id) {
    this.setData({ loading: true })
    const res = await api.getOrderDetail(id)

    if (!res.ok) {
      this.setData({ loading: false })
      wx.showToast({ title: res.msg, icon: 'none' })
      return
    }

    const o = res.data
    const info = STATUS_INFO[o.status] || { text: o.status, desc: '' }

    // 厨神要照着做，先把「这一单要买什么」拉过来
    if (this.data.isChef) await this.attachIngredients(o)

    this.setData({
      order: o,
      statusText: info.text,
      statusDesc: info.desc,
      totalCount: (o.items || []).reduce(function (s, i) { return s + (i.count || 1) }, 0),
      timeText: formatTime(new Date(o.createTime)),
      fromMe: o.fromOpenid === app.globalData.openid,
      rating: o.rating || 0,
      comment: o.ratingComment || '',
      photos: o.ratingPhotos || [],
      loading: false
    })
  },

  /**
   * 给订单里每道菜补上食材清单。
   *
   * 为什么只补食材不补步骤：一单可能好几道菜，每道菜的步骤全铺开
   * 一屏根本放不下，做饭时得一直往上滑 —— 反而添乱。
   * 食材是"要买什么"，步骤是"怎么做"，前者才是下单后最要紧的。
   * 想看步骤，点订单里的菜名进详情页就有。
   *
   * 只按 _id 取这一单用到的几道菜，不拉整个菜库。
   */
  async attachIngredients(order) {
    const items = order.items || []
    const ids = []
    items.forEach(function (it) {
      if (it.dishId && ids.indexOf(it.dishId) === -1) ids.push(it.dishId)
    })
    if (ids.length === 0) {
      order.ingredientCount = 0
      return
    }

    const res = await api.getDishesByIds(ids)
    if (!res.ok) {
      order.ingredientCount = 0
      return
    }

    const map = {}
    ;(res.data || []).forEach(function (d) { map[d._id] = d })

    order.items = items.map(function (it) {
      const d = map[it.dishId]
      return Object.assign({}, it, {
        ingredients: (d && d.ingredients) || []
      })
    })

    order.ingredientCount = order.items.reduce(function (s, it) {
      return s + (it.ingredients || []).length
    }, 0)
  },

  async changeStatus(e) {
    const action = e.currentTarget.dataset.action
    wx.showLoading({ title: '处理中', mask: true })
    const res = await api.updateOrderStatus(this.data.orderId, action)
    wx.hideLoading()

    if (!res.ok) {
      wx.showToast({ title: res.msg, icon: 'none' })
      return
    }
    wx.showToast({ title: action === 'accept' ? '开始做啦' : '完成！', icon: 'success' })

    // 接单成功 → 提醒吃货准备吃饭（不等结果、失败也不报警）
    if (action === 'accept') {
      try {
        const o = this.data.order || {}
        api.sendNotify('foodie', notify.acceptedData(o.orderNo, o.fromName))
          .catch(function (e) { console.error('[提醒] 接单提醒发送失败（不影响接单）', e) })
      } catch (e) {
        console.error('[提醒] 接单提醒发送失败（不影响接单）', e)
      }
    }

    this.loadDetail(this.data.orderId)
  },

  async cancelOrder() {
    wx.showModal({
      title: '取消这一单？',
      success: async (r) => {
        if (!r.confirm) return
        const res = await api.updateOrderStatus(this.data.orderId, 'cancel')
        if (!res.ok) {
          wx.showToast({ title: res.msg, icon: 'none' })
          return
        }
        wx.showToast({ title: '已取消', icon: 'none' })
        this.loadDetail(this.data.orderId)
      }
    })
  },

  /* ---------------- 买菜清单图 ---------------- */

  /**
   * 生成一张「今天要买什么」的图片，存下来发给对方。
   *
   * 为什么不直接分享小程序卡片：未认证的小程序，分享给好友被微信限制
   * （会弹「由于小程序未完成认证，分享功能暂时无法使用」）。
   * 但把清单画成一张普通图片、存进相册再发出去，没有任何限制。
   */
  async makeShoppingList() {
    const order = this.data.order
    if (!order || (order.items || []).length === 0) {
      wx.showToast({ title: '这一单还没有菜', icon: 'none' })
      return
    }

    wx.showLoading({ title: '生成中', mask: true })
    try {
      // 加超时保护：万一画布那步卡住不回调，loading 会一直挂着，
      // 而 loading 是全局遮罩 —— 挂住了整个小程序都点不动
      const path = await withTimeout(this.drawListImage(order), 8000)
      wx.hideLoading()
      wx.previewImage({ urls: [path], current: path })
      wx.showToast({ title: '长按图片可保存或转发', icon: 'none', duration: 3000 })
    } catch (err) {
      wx.hideLoading()
      console.error('生成买菜清单失败', err)
      api.alertError({ msg: '生成失败，再试一次' }, '出错了')
    }
  },

  // 真正画图，返回图片临时路径
  drawListImage(order) {
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery().in(this)
        .select('#listCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0] || !res[0].node) {
            reject(new Error('拿不到画布'))
            return
          }

          try {
            const canvas = res[0].node
            const ctx = canvas.getContext('2d')
            const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
            const dpr = win.pixelRatio || 2

            const W = 750
            const PAD = 48
            const MAXW = W - PAD * 2 - 24

            /* ---- 先量高度，再设画布 ---- */
            ctx.font = '26px sans-serif'
            const items = order.items || []
            const blocks = []
            let h = 250

            items.forEach(function (it) {
              const ings = it.ingredients || []
              if (ings.length === 0) return

              const nameLines = wrapText(ctx, it.name + (it.count > 1 ? '  ×' + it.count : ''), MAXW)
              const ingLines = []
              ings.forEach(function (s) {
                wrapText(ctx, '· ' + s, MAXW).forEach(function (l) { ingLines.push(l) })
              })

              blocks.push({ nameLines: nameLines, ingLines: ingLines })
              h += nameLines.length * 42 + ingLines.length * 40 + 40
            })
            h += 130

            /* ---- 设画布（2d 模式必须手动设像素尺寸）---- */
            canvas.width = W * dpr
            canvas.height = h * dpr
            ctx.scale(dpr, dpr)

            ctx.fillStyle = '#FAF8FF'
            ctx.fillRect(0, 0, W, h)

            /* ---- 顶部标题卡片 ---- */
            ctx.fillStyle = '#FFFFFF'
            roundRect(ctx, PAD - 16, 40, MAXW + 56, 132, 24)

            ctx.fillStyle = '#2E2A3D'
            ctx.font = 'bold 38px sans-serif'
            ctx.fillText('今天要买的菜', PAD, 100)

            ctx.fillStyle = '#8A85A0'
            ctx.font = '24px sans-serif'
            const totalCount = items.reduce(function (s, i) { return s + (i.count || 1) }, 0)
            ctx.fillText('订单 ' + (order.orderNo || '') + ' · ' + items.length + ' 道 · ' + totalCount + ' 份', PAD, 142)

            /* ---- 逐道菜 ---- */
            let y = 240
            blocks.forEach(function (b) {
              ctx.fillStyle = '#6D5ACB'
              ctx.font = 'bold 30px sans-serif'
              b.nameLines.forEach(function (l) {
                ctx.fillText(l, PAD, y)
                y += 42
              })

              ctx.fillStyle = '#2E2A3D'
              ctx.font = '26px sans-serif'
              b.ingLines.forEach(function (l) {
                ctx.fillText(l, PAD + 14, y)
                y += 40
              })

              y += 40
            })

            /* ---- 落款 ---- */
            ctx.fillStyle = '#B8B3C9'
            ctx.font = '22px sans-serif'
            ctx.fillText('恋爱菜单助手 · 一起好好吃饭', PAD, h - 60)

            wx.canvasToTempFilePath({
              canvas: canvas,
              success: function (r) { resolve(r.tempFilePath) },
              fail: reject
            }, this)
          } catch (err) {
            reject(err)
          }
        })
    })
  },

  /* ---------------- 评价 ---------------- */

  setStar(e) {
    this.setData({ rating: Number(e.currentTarget.dataset.star) })
  },

  onCommentInput(e) {
    this.setData({ comment: e.detail.value })
  },

  async choosePhoto() {
    if (this.data.photos.length >= 3) {
      wx.showToast({ title: '最多 3 张', icon: 'none' })
      return
    }
    try {
      const res = await wx.chooseImage({
        count: 3 - this.data.photos.length,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera']
      })
      wx.showLoading({ title: '上传中', mask: true })
      for (const path of res.tempFilePaths) {
        const up = await wx.cloud.uploadFile({
          cloudPath: 'reviews/' + Date.now() + '-' + Math.floor(Math.random() * 1000) + '.png',
          filePath: path
        })
        this.setData({ photos: this.data.photos.concat([up.fileID]) })
      }
      wx.hideLoading()
    } catch (err) {
      wx.hideLoading()
    }
  },

  removePhoto(e) {
    const idx = e.currentTarget.dataset.index
    const list = this.data.photos.slice()
    list.splice(idx, 1)
    this.setData({ photos: list })
  },

  async submitRate() {
    if (!this.data.rating) {
      wx.showToast({ title: '先选几颗星', icon: 'none' })
      return
    }
    wx.showLoading({ title: '提交中', mask: true })
    const res = await api.rateOrder(this.data.orderId, this.data.rating, this.data.comment, this.data.photos)
    wx.hideLoading()

    if (!res.ok) {
      wx.showToast({ title: res.msg, icon: 'none' })
      return
    }
    wx.showToast({ title: '评价已保存', icon: 'success' })
    this.loadDetail(this.data.orderId)
  }
})

function formatTime(t) {
  const p = moodUtil.pad
  return t.getFullYear() + '年' + (t.getMonth() + 1) + '月' + t.getDate() + '日 ' + p(t.getHours()) + ':' + p(t.getMinutes())
}

// 给 promise 加超时 —— 防止某一步卡住不回调，把全局 loading 永远挂在那儿
function withTimeout(promise, ms) {
  return new Promise(function (resolve, reject) {
    let done = false
    const timer = setTimeout(function () {
      if (!done) {
        done = true
        reject(new Error('超时'))
      }
    }, ms)

    promise.then(function (v) {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(v)
    }, function (e) {
      if (done) return
      done = true
      clearTimeout(timer)
      reject(e)
    })
  })
}

// 把一段文字按画布宽度切成多行（canvas 不会自动换行，得自己切）
function wrapText(ctx, text, maxWidth) {
  const lines = []
  let line = ''
  for (let i = 0; i < text.length; i++) {
    const test = line + text[i]
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = text[i]
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

// 圆角矩形（canvas 原生没有，自己画路径）
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
  ctx.fill()
}
