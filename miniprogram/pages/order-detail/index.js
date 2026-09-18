// 订单详情页面
const app = getApp()

Page({
  data: {
    isChef: true,
    order: {
      orderNo: '202609160001',
      status: 'pending',
      statusText: '待接单',
      createTime: '2026/09/16 19:00',
      fromUser: '吃货小可爱',
      items: [
        { name: '西红柿炒鸡蛋', count: 1 }
      ]
    },
    statusDesc: '厨神正在赶来的路上...',
    totalCount: 1
  },

  onLoad(options) {
    this.setData({
      isChef: app.globalData.userRole === 'chef'
    })
    
    if (options.id) {
      this.loadOrderDetail(options.id)
    }
    
    this.calculateTotal()
  },

  // 加载订单详情
  async loadOrderDetail(id) {
    // 从数据库加载订单详情
  },

  // 计算总数量
  calculateTotal() {
    let total = 0
    this.data.order.items.forEach(item => {
      total += item.count
    })
    this.setData({
      totalCount: total
    })
  },

  // 接单
  async acceptOrder() {
    wx.showLoading({ title: '接单中...' })
    try {
      // 更新订单状态
      wx.hideLoading()
      wx.showToast({ title: '已接单', icon: 'success' })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  // 完成订单
  async finishOrder() {
    wx.showLoading({ title: '提交中...' })
    try {
      // 更新订单状态
      wx.hideLoading()
      wx.showToast({ title: '已完成制作', icon: 'success' })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  // 取消订单
  cancelOrder() {
    wx.showModal({
      title: '提示',
      content: '确定要取消这个订单吗？',
      success: (res) => {
        if (res.confirm) {
          wx.showToast({ title: '订单已取消', icon: 'success' })
          setTimeout(() => {
            wx.navigateBack()
          }, 1500)
        }
      }
    })
  }
})
