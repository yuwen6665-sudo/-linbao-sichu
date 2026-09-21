// 订单页 —— 数据来自云数据库，两个人看到的是同一份
const app = getApp()
const api = require('../../utils/api.js')
const orderAction = require('../../utils/order-action.js')

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
      return {
        _id: o._id,
        orderNo: o.orderNo,
        fromName: o.fromName || '',     // 下单人昵称，接单提醒要用
        status: o.status,
        statusText: orderAction.STATUS_TEXT[o.status] || o.status,
        items: o.items || [],
        totalCount: (o.items || []).reduce(function (s, i) { return s + (i.count || 1) }, 0),
        remark: o.remark || '',
        rating: o.rating || 0,
        createTime: o.createTime,
        timeText: orderAction.formatTime(o.createTime),
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
    const wanted = orderAction.TAB_FILTER[activeTab] || []
    const visible = allOrders.filter(function (o) {
      return wanted.indexOf(o.status) > -1
    })
    this.setData({ visibleOrders: visible })
  },

  goToDetail(e) {
    wx.navigateTo({ url: '/pages/order-detail/index?id=' + e.currentTarget.dataset.id })
  },

  /* ---------------- 状态操作 ----------------
     具体逻辑都在 utils/order-action.js（和订单详情页共用一份）。
     这里保留同名方法是因为 wxml 绑的就是这些名字，不能删。 */

  async changeStatus(e) {
    const id = e.currentTarget.dataset.id
    const action = e.currentTarget.dataset.action
    const order = this.data.allOrders.find(function (x) { return x._id === id })

    const res = await orderAction.changeStatus(id, action, order)
    if (!res.ok) return

    this.loadOrders()
  },

  async rejectOrder(e) {
    const id = e.currentTarget.dataset.id
    const res = await orderAction.rejectOrder(id)
    if (!res.ok || res.skipped) return

    this.loadOrders()
  },

  async cancelOrder(e) {
    const id = e.currentTarget.dataset.id
    const res = await orderAction.cancelOrder(id)
    if (!res.ok || res.skipped) return

    this.loadOrders()
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
