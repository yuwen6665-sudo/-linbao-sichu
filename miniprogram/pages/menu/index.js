// 菜单页 —— 左分类竖排 + 右菜品列表
// 数据来自云数据库（内置菜库 + 你们自己加的菜）
const app = getApp()
const api = require('../../utils/api.js')
const dishImage = require('../../utils/dish-image.js')
const notify = require('../../utils/notify.js')

Page({
  data: {
    isChef: true,
    loading: true,
    allDishes: [],
    categories: [],
    activeCategory: '全部',
    filteredDishes: [],
    cartList: [],
    cartCount: 0,
    cartCalories: 0,
    showCart: false,
    keyword: '',
    loadError: '',     // 取菜失败时显示在页面上，方便一眼看出原因
    loadHint: ''
  },

  onLoad() {
    this.setData({ isChef: app.globalData.userRole === 'chef' })
  },

  async onShow() {
    // 保险：别的页面要是因为异常留下了全局 loading 遮罩，
    // 回到这里会整屏点不动 —— 进场先清一次
    wx.hideLoading()

    this.setData({ isChef: app.globalData.userRole === 'chef' })
    // 第一次进来可能登录还没完成，等一下
    if (!app.globalData.ready) await app.ensureLogin()
    this.loadDishes()
  },

  onPullDownRefresh() {
    api.clearDishCache()
    this.loadDishes().then(() => wx.stopPullDownRefresh())
  },

  // 拉菜品（带二级缓存 + 搜索过滤）
  async loadDishes() {
    this.setData({ loading: true })
    const res = await api.getDishes()

    if (!res.ok) {
      // 失败原因留在页面上，别只弹一下就没了（截图给我就能定位）
      console.error('[菜单] 取菜失败：', res.msg, res.detail || '')
      this.setData({
        loading: false,
        loadError: '取菜失败：' + (res.msg || '未知原因'),
        loadHint: res.detail ? '详情：' + res.detail : '把上面这句发我，一看就知道哪步没做'
      })
      return
    }

    // 抽、详情页选的菜都先记在全局，进菜单时收进来
    this.mergeGlobalCart()

    // 补上插画路径
    const list = dishImage.attachImages(res.data || [])
    if (list.length === 0) {
      this.setData({
        loading: false,
        loadError: '连上了，但数据库里一道菜都没有',
        // 别再教人去控制台「导入」了 —— 那条路漏一个 coupleId 字段就会变成现在这样，
        // 而且报错看不出来。一键灌库的云函数会把字段全部补好。
        loadHint: '云开发控制台 → 云函数 → initDishes →「云端测试」→ 参数填 {} → 运行'
      })
      return
    }

    this.setData({ allDishes: list, loading: false, loadError: '', loadHint: '' }, () => {
      this.buildCategories()
      this.applyFilter()
    })
    this.mergeGlobalCart()
  },

  // 首页「今晚吃啥」、详情页「就吃这个」加的菜，合并进本页清单
  mergeGlobalCart() {
    const pending = getApp().globalData.cart || []
    if (pending.length === 0) return

    const cartList = this.data.cartList.slice()
    pending.forEach(function (item) {
      const exist = cartList.find(function (c) { return c._id === item._id })
      if (exist) {
        exist.count += item.count || 1
      } else {
        cartList.push({
          _id: item._id,
          dishId: item.dishId || '',
          name: item.name,
          image: item.image || '',
          count: item.count || 1,
          calories: item.calories || 0
        })
      }
    })

    // 收完清空，免得下次进来重复加
    getApp().globalData.cart = []
    this.setData({ cartList: cartList }, () => this.refreshCart())
  },

  // 分类条：数量按实际算，不再写死
  buildCategories() {
    const cats = ['全部']
    const counts = { 全部: this.data.allDishes.length }

    this.data.allDishes.forEach(function (d) {
      if (cats.indexOf(d.category) === -1) cats.push(d.category)
      counts[d.category] = (counts[d.category] || 0) + 1
    })

    // 保序：全部在最前，其余按 api.CATEGORY_ORDER
    // 兜底：菜库里冒出一个没登记过的分类（比如导入数据里写了「甜品饮品」）时，
    // indexOf 会返回 -1，按老写法它会排到最前面去 —— 这里一律踢到最后。
    const order = api.CATEGORY_ORDER
    const rank = function (n) {
      const i = order.indexOf(n)
      return i === -1 ? order.length : i
    }
    const sorted = cats.slice(1).sort(function (a, b) {
      return rank(a) - rank(b)
    })

    this.setData({
      categories: [{ name: '全部', count: counts['全部'] }].concat(
        sorted.map(function (n) { return { name: n, count: counts[n] } })
      )
    })
  },

  selectCategory(e) {
    this.setData({ activeCategory: e.currentTarget.dataset.category })
    this.applyFilter()
  },

  onSearch(e) {
    this.setData({ keyword: e.detail.value.trim() })
    this.applyFilter()
  },

  applyFilter() {
    const { allDishes, activeCategory, keyword } = this.data
    let list = allDishes

    if (activeCategory !== '全部') {
      list = list.filter((d) => d.category === activeCategory)
    }
    if (keyword) {
      list = list.filter((d) => {
        const name = d.name || ''
        const desc = d.description || ''
        const tags = (d.tasteTags || []).join('')
        return name.indexOf(keyword) > -1 || desc.indexOf(keyword) > -1 || tags.indexOf(keyword) > -1
      })
    }
    this.setData({ filteredDishes: list })
  },

  // 详情页（吃货端点了菜是进详情，厨神端是管理）
  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/dish-detail/index?id=' + id })
  },

  // 厨神端：加菜
  addDish() {
    wx.navigateTo({ url: '/pages/dish-edit/index' })
  },

  // 吃货端：选它
  addToCart(e) {
    const dish = e.currentTarget.dataset.dish
    const cartList = this.data.cartList.slice()
    const exist = cartList.find((item) => item._id === dish._id)

    if (exist) {
      exist.count += 1
    } else {
      cartList.push({
        _id: dish._id,
        dishId: dish.dishId || '',
        name: dish.name,
        image: dish.image || '',
        count: 1,
        calories: dish.calories || 0
      })
    }

    this.setData({ cartList: cartList }, () => this.refreshCart())
    wx.showToast({ title: '已加入清单', icon: 'none', duration: 800 })
  },

  // 清单里减一份
  minusFromCart(e) {
    const id = e.currentTarget.dataset.id
    const cartList = this.data.cartList.slice()
    const exist = cartList.find((item) => item._id === id)
    if (!exist) return
    exist.count -= 1

    const next = cartList.filter((item) => item.count > 0)
    this.setData({ cartList: next }, () => this.refreshCart())
  },

  refreshCart() {
    let count = 0
    let calories = 0
    this.data.cartList.forEach(function (item) {
      count += item.count
      calories += item.calories * item.count
    })
    this.setData({ cartCount: count, cartCalories: calories })
  },

  toggleCart() {
    this.setData({ showCart: !this.data.showCart })
  },

  clearCart() {
    this.setData({ cartList: [], cartCount: 0, cartCalories: 0, showCart: false })
  },

  async switchRole() {
    const newRole = this.data.isChef ? 'foodie' : 'chef'
    const res = await app.switchRole(newRole)
    // 服务端没改成，本地就不能改 —— 否则本地显示和服务端会打架
    if (res && res.ok === false) return
    this.setData({ isChef: newRole === 'chef', cartList: [], cartCount: 0 })
  },

  // 下单成功后，提醒**厨神**买菜（故意不等结果）
  //
  // 为什么只发厨神、不给双方都发：
  //   微信的一次性订阅是「一次同意 = 只能发一条」，额度很紧。
  //   下单提醒厨神、接单提醒吃货 —— 每方每次刚好用一条，两个提醒才都送得出去。
  //   （2026-09-19 与用户确认后改成这样）
  notifyChef(cartList, orderNo) {
    try {
      const me = (app.globalData.userInfo && app.globalData.userInfo.nickName) || 'TA'
      const data = notify.buildData(orderNo, me, notify.buildNote(cartList))
      api.sendNotify('chef', data).catch(function (e) {
        console.error('[提醒] 下单提醒发送失败（不影响订单）', e)
      })
    } catch (e) {
      console.error('[提醒] 下单提醒发送失败（不影响订单）', e)
    }
  },

  // 提交订单 —— 真正写进云数据库，对方才看得到
  async submitOrder() {
    const cartList = this.data.cartList
    if (cartList.length === 0) return

    if (!app.globalData.coupleId) {
      wx.showModal({
        title: '还没有绑定对象',
        content: '去「我的」页面生成邀请码，让对方扫描或点击绑定后，订单才能发过去。',
        confirmText: '去绑定',
        success: (res) => {
          if (res.confirm) wx.switchTab({ url: '/pages/profile/index' })
        }
      })
      return
    }

    // 先请求一次订阅授权（买菜提醒）。
    // 微信规定这类授权必须由用户点击触发 ——「提交」这一下正好合规。
    // 用户点「拒绝」也没关系：只是收不到提醒，订单照下。
    // 第一次会弹一下，勾上「总是保持以上选择」之后就再也不弹了。
    await notify.requestSubscribe()

    wx.showLoading({ title: '提交中', mask: true })

    const items = cartList.map(function (item) {
      return {
        dishId: item._id,
        name: item.name,
        count: item.count,
        calories: item.calories,
        image: item.image
      }
    })

    const res = await api.createOrder(items, '')

    wx.hideLoading()

    if (!res.ok) {
      wx.showToast({ title: res.msg, icon: 'none', duration: 2000 })
      return
    }

    // 订单已经落库了。提醒属于「锦上添花」——所以不等它、也不把失败弹给用户：
    // 对方没点过同意、或额度用完了都会失败，这是正常情况，不该报警。
    this.notifyChef(cartList, res.data && res.data.orderNo)

    this.clearCart()
    wx.showToast({ title: '订单已发出', icon: 'success' })
    setTimeout(() => {
      wx.switchTab({ url: '/pages/order/index' })
    }, 1200)
  }
})
