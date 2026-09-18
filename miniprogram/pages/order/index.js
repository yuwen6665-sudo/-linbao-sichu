// 订单页面
const app = getApp()
const util = require('../../utils/util.js')

Page({
  data: {
    isChef: true,
    activeTab: 'pending',
    stats: {
      dishCount: 0,
      pendingCount: 0,
      doneCount: 0
    },
    orderList: [],
    filteredOrders: []
  },

  onLoad() {
    this.setData({
      isChef: app.globalData.userRole === 'chef'
    })
  },

  onShow() {
    this.loadOrders()
  },

  // 加载订单数据
  async loadOrders() {
    // 模拟数据，实际从云数据库读取
    const mockOrders = []
    
    this.setData({
      orderList: mockOrders
    })
    this.filterOrders()
    this.updateStats()
  },

  // 更新统计
  updateStats() {
    const { orderList } = this.data
    const pending = orderList.filter(o => o.status === 'pending' || o.status === 'making')
    const done = orderList.filter(o => o.status === 'done')
    
    let dishCount = 0
    orderList.forEach(order => {
      order.items.forEach(item => {
        dishCount += item.count
      })
    })
    
    this.setData({
      stats: {
        dishCount,
        pendingCount: pending.length,
        doneCount: done.length
      }
    })
  },

  // 切换Tab
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
    this.filterOrders()
  },

  // 筛选订单
  filterOrders() {
    const { orderList, activeTab } = this.data
    if (activeTab === 'pending') {
      this.setData({
        filteredOrders: orderList.filter(o => o.status === 'pending' || o.status === 'making')
      })
    } else {
      this.setData({
        filteredOrders: orderList.filter(o => o.status === 'done')
      })
    }
  },

  // 接单
  async acceptOrder(e) {
    const id = e.currentTarget.dataset.id
    wx.showLoading({ title: '接单中...' })
    
    // 调用云函数更新订单状态
    try {
      await wx.cloud.callFunction({
        name: 'updateOrderStatus',
        data: {
          orderId: id,
          status: 'making'
        }
      })
      wx.hideLoading()
      wx.showToast({ title: '已接单', icon: 'success' })
      this.loadOrders()
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  // 完成订单
  async finishOrder(e) {
    const id = e.currentTarget.dataset.id
    wx.showLoading({ title: '提交中...' })
    
    try {
      await wx.cloud.callFunction({
        name: 'updateOrderStatus',
        data: {
          orderId: id,
          status: 'done'
        }
      })
      wx.hideLoading()
      wx.showToast({ title: '已完成制作', icon: 'success' })
      this.loadOrders()
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  // 拒绝订单
  rejectOrder(e) {
    wx.showModal({
      title: '提示',
      content: '确定要拒绝这个订单吗？',
      success: (res) => {
        if (res.confirm) {
          wx.showToast({ title: '已拒绝', icon: 'success' })
        }
      }
    })
  },

  // 跳转菜单
  goToMenu() {
    wx.switchTab({
      url: '/pages/menu/index'
    })
  }
})
