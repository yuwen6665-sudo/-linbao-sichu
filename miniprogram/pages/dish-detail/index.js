// 菜品详情页 —— 数据从云数据库 dishId / _id 查出来
const app = getApp()
const api = require('../../utils/api.js')
const dishImage = require('../../utils/dish-image.js')

Page({
  data: {
    isChef: true,
    loading: true,
    dish: null,
    _id: ''
  },

  async onLoad(options) {
    this.setData({ isChef: app.globalData.userRole === 'chef' })

    // 兼容两种入口：老的链接传的是数字 id，新的传的是云数据库 _id
    const id = options.id || options._id
    if (!id) {
      wx.showToast({ title: '没有这道菜', icon: 'none' })
      return
    }
    this.setData({ _id: id })
    await this.loadDish(id)
  },

  async loadDish(id) {
    this.setData({ loading: true })

    const appGlobal = getApp()

    // 缓存里的优先
    let dish = null
    const cache = appGlobal.globalData.dishCache || []
    dish = cache.find(function (d) { return d._id === id || String(d.dishId) === String(id) })

    if (!dish) {
      const res = await api.getDishes()
      if (res.ok) {
        dish = (res.data || []).find(function (d) {
          return d._id === id || String(d.dishId) === String(id)
        })
      }
    }

    if (!dish) {
      this.setData({ loading: false })
      wx.showToast({ title: '找不到这道菜', icon: 'none' })
      return
    }

    // 补插画
    dish = dishImage.attachImages([dish])[0]

    this.setData({ dish: dish, loading: false }, () => {
      wx.setNavigationBarTitle({ title: dish.name })
    })
  },

  // 吃货端：加入清单（这里不直接下单，回菜单统一提交）
  addToCart() {
    const dish = this.data.dish
    const appGlobal = getApp()
    if (!appGlobal.globalData.cart) appGlobal.globalData.cart = []

    const cart = appGlobal.globalData.cart
    const exist = cart.find(function (item) { return item._id === dish._id })
    if (exist) {
      exist.count += 1
    } else {
      cart.push({
        _id: dish._id,
        dishId: dish.dishId || '',
        name: dish.name,
        image: dish.image || '',
        count: 1,
        calories: dish.calories || 0
      })
    }

    wx.showToast({ title: '已加入清单', icon: 'success' })
    setTimeout(() => {
      wx.navigateBack()
    }, 800)
  },

  // 厨神端：编辑这道菜
  editDish() {
    if (!this.data.dish.isBuiltin) {
      wx.navigateTo({ url: '/pages/dish-edit/index?id=' + this.data._id })
    } else {
      wx.showToast({ title: '内置菜暂不支持编辑', icon: 'none' })
    }
  }
})
