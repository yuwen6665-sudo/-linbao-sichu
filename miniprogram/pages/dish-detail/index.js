// 菜品详情页 —— 数据从云数据库按 _id 单独取一道（含做法，列表接口不带这些）
const app = getApp()
const api = require('../../utils/api.js')
const dishImage = require('../../utils/dish-image.js')

Page({
  data: {
    isChef: true,
    loading: true,
    dish: null,
    nutrition: [],
    loadError: '',
    _id: ''
  },

  async onLoad(options) {
    this.setData({ isChef: app.globalData.userRole === 'chef' })

    // 兼容两种入口：老的链接传的是数字 id，新的传的是云数据库 _id
    const id = options.id || options._id
    if (!id) {
      // 留在页面上，别只弹 toast —— 一闪就没，而且 loading 会一直挂着「加载中…」转不出来
      this.setData({ loading: false, loadError: '没有这道菜：链接里没带菜品编号' })
      return
    }
    this.setData({ _id: id })
    await this.loadDish(id)
  },

  // 切身份之后回到这里，「准备食材 / 做法 / 小窍门」该不该显示得跟着变。
  // 角色的源头是服务端的（login 返回的 role），但本页只在 onLoad 读一次。
  onShow() {
    const isChef = app.globalData.userRole === 'chef'
    if (isChef !== this.data.isChef) this.setData({ isChef: isChef })
  },

  async loadDish(id) {
    this.setData({ loading: true, loadError: '' })

    // 列表接口为了省流量把做法裁掉了（235 道全量 555KB → 只带列表字段 132KB），
    // 所以详情页单独来取这一道，别再指望从缓存里翻。
    const res = await api.getDishDetail(id)

    if (!res.ok || !res.data) {
      console.error('[详情] 取菜失败：', res.msg, res.detail || '')
      this.setData({
        loading: false,
        dish: null,
        loadError: '打不开这道菜：' + (res.msg || '未知原因')
      })
      api.alertError(res, '打不开这道菜')
      return
    }

    // 补插画
    const dish = dishImage.attachImages([res.data])[0]

    // 营养那一行：热量人人都有，蛋白/脂肪/碳水只有原来手写的那批菜谱才有。
    // 没有的就不显示 —— 不要填 0 充数，那是假数据。
    const nutrition = [{ value: dish.calories || 0, label: '大卡' }]
    if (typeof dish.protein === 'number') nutrition.push({ value: dish.protein, label: '蛋白质 g' })
    if (typeof dish.fat === 'number') nutrition.push({ value: dish.fat, label: '脂肪 g' })
    if (typeof dish.carbs === 'number') nutrition.push({ value: dish.carbs, label: '碳水 g' })

    this.setData({ dish: dish, nutrition: nutrition, loading: false }, () => {
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
