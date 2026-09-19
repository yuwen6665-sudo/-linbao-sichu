// 订单页 —— 数据来自云数据库，两个人看到的是同一份
const app = getApp()
const api = require('../../utils/api.js')
const notify = require('../../utils/notify.js')

// 状态 → 显示文案
const STATUS_TEXT = {
  pending: '待接单',
  making: '制作中',
  done: '已完成',
  rejected: '被拒绝了',
  canceled: '已取消'
}

Page({
  data: {
    isChef: true,
    loading: true,
    activeTab: 'pending',
    allOrders: [],
    visibleOrders: [],
    stats: { dishCount: 0, pendingCount: 0, doneCount: 0 }
  },

  onLoad() {
    this.setData({ isChef: app.globalData.userRole === 'chef' })
  },

  async onShow() {
    if (!app.globalData.ready) await app.ensureLogin()
    this.setData({ isChef: app.globalData.userRole === 'chef' })
    this.loadOrders()
  },

  onPullDownRefresh() {
    this.loadOrders().then(() => wx.stopPullDownRefresh())
  },

  async loadOrders() {
    this.setData({ loading: true })

    const res = await api.getOrders()
    if (!res.ok) {
      this.setData({ loading: false })
      wx.showToast({ title: res.msg, icon: 'none' })
      return
    }

    const myOpenid = app.globalData.openid
    const list = (res.data || []).map(function (o) {
      const t = new Date(o.createTime)
      return {
        _id: o._id,
        orderNo: o.orderNo,
        fromName: o.fromName || '',     // 下单人昵称，接单提醒要用
        status: o.status,
        statusText: STATUS_TEXT[o.status] || o.status,
        items: o.items || [],
        totalCount: (o.items || []).reduce(function (s, i) { return s + (i.count || 1) }, 0),
        remark: o.remark || '',
        rating: o.rating || 0,
        createTime: o.createTime,
        timeText: formatTime(t),
        // 我是下单的还是接单的
        fromMe: o.fromOpenid === myOpenid,
        evaluating: false
      }
    })

    this.setData({ allOrders: list, loading: false }, () => {
      this.applyTab()
      this.updateStats()
    })
  },

  updateStats() {
    const list = this.data.allOrders
    let dishCount = 0
    let pendingCount = 0
    let doneCount = 0

    list.forEach(function (o) {
      o.items.forEach(function (i) { dishCount += (i.count || 1) })
      if (o.status === 'pending' || o.status === 'making') pendingCount++
      if (o.status === 'done') doneCount++
    })

    this.setData({
      stats: { dishCount: dishCount, pendingCount: pendingCount, doneCount: doneCount }
    })
  },

  switchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab }, () => this.applyTab())
  },

  applyTab() {
    const { allOrders, activeTab } = this.data
    const visible = allOrders.filter(function (o) {
      if (activeTab === 'pending') return o.status === 'pending' || o.status === 'making'
      if (activeTab === 'done') return o.status === 'done'
      return o.status === 'rejected' || o.status === 'canceled'
    })
    this.setData({ visibleOrders: visible })
  },

  goToDetail(e) {
    wx.navigateTo({ url: '/pages/order-detail/index?id=' + e.currentTarget.dataset.id })
  },

  /* ---------------- 状态操作 ---------------- */

  async changeStatus(e) {
    const id = e.currentTarget.dataset.id
    const action = e.currentTarget.dataset.action

    if (action === 'accept') wx.showLoading({ title: '接单中', mask: true })
    if (action === 'finish') wx.showLoading({ title: '提交中', mask: true })

    const res = await api.updateOrderStatus(id, action)
    wx.hideLoading()

    if (!res.ok) {
      wx.showToast({ title: res.msg, icon: 'none' })
      return
    }

    const msg = action === 'accept' ? '开始做啦' : '做好了！'
    wx.showToast({ title: msg, icon: 'success' })

    // 接单成功 → 提醒吃货准备吃饭（不等结果、失败也不报警）
    if (action === 'accept') this.notifyFoodie(id)

    this.loadOrders()
  },

  // 接单后提醒吃货。
  // 找不到订单信息就静默跳过 —— 提醒是附带动作，绝不该影响接单本身。
  notifyFoodie(orderId) {
    try {
      const o = this.data.allOrders.find(function (x) { return x._id === orderId })
      if (!o) return
      api.sendNotify('foodie', notify.acceptedData(o.orderNo, o.fromName))
        .catch(function (e) { console.error('[提醒] 接单提醒发送失败（不影响接单）', e) })
    } catch (e) {
      console.error('[提醒] 接单提醒发送失败（不影响接单）', e)
    }
  },

  async rejectOrder(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '拒绝这一单？',
      content: '对方会看到「被拒绝了」，可以顺便在备注里说为什么',
      editable: true,
      placeholderText: '比如：今天不在家（可以不填）',
      success: async (r) => {
        if (!r.confirm) return
        wx.showLoading({ title: '处理中', mask: true })
        const res = await api.updateOrderStatus(id, 'reject', { reason: r.content || '' })
        wx.hideLoading()
        if (!res.ok) {
          wx.showToast({ title: res.msg, icon: 'none' })
          return
        }
        wx.showToast({ title: '已拒绝', icon: 'none' })
        this.loadOrders()
      }
    })
  },

  async cancelOrder(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '取消这一单？',
      content: '只在对方还没接单时能取消',
      success: async (r) => {
        if (!r.confirm) return
        const res = await api.updateOrderStatus(id, 'cancel')
        if (!res.ok) {
          wx.showToast({ title: res.msg, icon: 'none' })
          return
        }
        wx.showToast({ title: '已取消', icon: 'none' })
        this.loadOrders()
      }
    })
  },

  /* ---------------- 评价（闭环第 5 步） ---------------- */

  toggleRate(e) {
    const id = e.currentTarget.dataset.id
    const list = this.data.visibleOrders.slice()
    const order = list.find(function (o) { return o._id === id })
    if (!order) return
    order.evaluating = !order.evaluating
    order.tempRating = order.rating || 0
    this.setData({ visibleOrders: list })
  },

  setStar(e) {
    const id = e.currentTarget.dataset.id
    const star = Number(e.currentTarget.dataset.star)
    const list = this.data.visibleOrders.slice()
    const order = list.find(function (o) { return o._id === id })
    if (!order) return
    order.tempRating = star
    this.setData({ visibleOrders: list })
  },

  async submitRate(e) {
    const id = e.currentTarget.dataset.id
    const list = this.data.visibleOrders.slice()
    const order = list.find(function (o) { return o._id === id })
    if (!order || !order.tempRating) {
      wx.showToast({ title: '先选几颗星', icon: 'none' })
      return
    }

    const res = await api.rateOrder(id, order.tempRating, '')
    if (!res.ok) {
      wx.showToast({ title: res.msg, icon: 'none' })
      return
    }

    wx.showToast({ title: '谢谢你打分', icon: 'success' })
    this.loadOrders()
  },

  goToMenu() {
    wx.switchTab({ url: '/pages/menu/index' })
  }
})

function formatTime(t) {
  const p = function (n) { return n < 10 ? '0' + n : '' + n }
  return (t.getMonth() + 1) + '月' + t.getDate() + '日 ' + p(t.getHours()) + ':' + p(t.getMinutes())
}
