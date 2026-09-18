// 菜单页面
const app = getApp()

Page({
  data: {
    isChef: true,
    activeCategory: '全部',
    categories: [
      { name: '全部', count: 35 },
      { name: '主食', count: 5 },
      { name: '荤菜', count: 5 },
      { name: '汤品', count: 5 },
      { name: '素菜', count: 5 },
      { name: '甜品', count: 5 },
      { name: '饮品', count: 5 }
    ],
    dishList: [
      // 主食
      { _id: '1', name: '西红柿鸡蛋面', description: '经典家常味，酸酸甜甜', category: '主食', imageUrl: '', tasteTags: ['家常', '酸甜'] },
      { _id: '2', name: '酱油炒饭', description: '粒粒分明，焦香四溢', category: '主食', imageUrl: '', tasteTags: ['咸香'] },
      { _id: '3', name: '牛肉水饺', description: '皮薄馅大，一口爆汁', category: '主食', imageUrl: '', tasteTags: ['咸鲜'] },
      { _id: '4', name: '葱油拌面', description: '葱香浓郁，简单美味', category: '主食', imageUrl: '', tasteTags: ['葱香'] },
      { _id: '5', name: '腊肠炒饭', description: '广式腊肠，油香十足', category: '主食', imageUrl: '', tasteTags: ['咸香'] },
      // 荤菜
      { _id: '6', name: '小炒黄牛肉', description: '香辣下饭，嫩到打滑', category: '荤菜', imageUrl: '', tasteTags: ['麻辣', '下饭菜'] },
      { _id: '7', name: '可乐鸡翅', description: '甜香入味，小朋友最爱', category: '荤菜', imageUrl: '', tasteTags: ['甜味', '孩子最爱'] },
      { _id: '8', name: '红烧排骨', description: '软烂脱骨，酱香浓郁', category: '荤菜', imageUrl: '', tasteTags: ['咸香', '大菜'] },
      { _id: '9', name: '水煮虾', description: '鲜甜Q弹，原汁原味', category: '荤菜', imageUrl: '', tasteTags: ['清淡', '海鲜'] },
      { _id: '10', name: '回锅肉', description: '肥而不腻，香辣下饭', category: '荤菜', imageUrl: '', tasteTags: ['麻辣', '川菜'] },
      // 汤品
      { _id: '11', name: '西红柿蛋汤', description: '经典快手汤，酸甜开胃', category: '汤品', imageUrl: '', tasteTags: ['清淡', '家常'] },
      { _id: '12', name: '玉米排骨汤', description: '清甜鲜美，营养丰富', category: '汤品', imageUrl: '', tasteTags: ['清淡', '滋补'] },
      { _id: '13', name: '紫菜蛋花汤', description: '5分钟搞定，鲜美快手', category: '汤品', imageUrl: '', tasteTags: ['清淡', '快手'] },
      { _id: '14', name: '冬瓜虾仁汤', description: '清爽低脂，鲜掉眉毛', category: '汤品', imageUrl: '', tasteTags: ['清淡', '低脂'] },
      { _id: '15', name: '番茄牛腩汤', description: '浓郁醇厚，软烂入味', category: '汤品', imageUrl: '', tasteTags: ['浓郁', '大菜'] },
      // 素菜
      { _id: '16', name: '干煸豆角', description: '香辣下饭，嘎嘣脆', category: '素菜', imageUrl: '', tasteTags: ['麻辣', '下饭菜'] },
      { _id: '17', name: '手撕包菜', description: '镬气十足，酸辣爽口', category: '素菜', imageUrl: '', tasteTags: ['酸辣', '快手'] },
      { _id: '18', name: '地三鲜', description: '东北经典，咸香入味', category: '素菜', imageUrl: '', tasteTags: ['咸香', '东北菜'] },
      { _id: '19', name: '蒜蓉西兰花', description: '低脂健康，翠绿爽脆', category: '素菜', imageUrl: '', tasteTags: ['清淡', '低脂'] },
      { _id: '20', name: '醋溜土豆丝', description: '酸辣开胃，国民下饭菜', category: '素菜', imageUrl: '', tasteTags: ['酸辣', '快手'] },
      // 甜品
      { _id: '21', name: '双皮奶', description: '嫩滑香甜，入口即化', category: '甜品', imageUrl: '', tasteTags: ['甜味', '奶香'] },
      { _id: '22', name: '蛋挞', description: '外酥里嫩，蛋香浓郁', category: '甜品', imageUrl: '', tasteTags: ['甜味', '酥脆'] },
      { _id: '23', name: '红糖糍粑', description: '外脆里糯，香甜拉丝', category: '甜品', imageUrl: '', tasteTags: ['甜味', '软糯'] },
      { _id: '24', name: '杨枝甘露', description: '芒果香浓，清爽解腻', category: '甜品', imageUrl: '', tasteTags: ['甜味', '果香'] },
      { _id: '25', name: '提拉米苏', description: '咖啡香醇，入口即化', category: '甜品', imageUrl: '', tasteTags: ['咖啡味', '浓郁'] },
      // 饮品
      { _id: '26', name: '柠檬蜂蜜水', description: '酸甜清爽，解腻神器', category: '饮品', imageUrl: '', tasteTags: ['酸甜', '解腻'] },
      { _id: '27', name: '珍珠奶茶', description: '香浓丝滑，珍珠Q弹', category: '饮品', imageUrl: '', tasteTags: ['甜味', '奶香'] },
      { _id: '28', name: '鲜榨西瓜汁', description: '现榨清甜，夏天必备', category: '饮品', imageUrl: '', tasteTags: ['清爽', '果香'] },
      { _id: '29', name: '桂花酸梅汤', description: '酸甜开胃，古法熬制', category: '饮品', imageUrl: '', tasteTags: ['酸甜', '开胃'] },
      { _id: '30', name: '热可可', description: '浓郁巧克力，暖心暖胃', category: '饮品', imageUrl: '', tasteTags: ['浓郁', '巧克力'] }
    ],
    filteredDishes: [],
    cartList: []
  },

  onLoad() {
    this.setData({
      isChef: app.globalData.userRole === 'chef'
    })
    this.filterDishes()
  },

  onShow() {
    this.loadDishes()
  },

  // 加载菜品数据
  async loadDishes() {
    this.filterDishes()
  },

  // 切换身份
  switchRole() {
    const newRole = this.data.isChef ? 'foodie' : 'chef'
    app.switchRole(newRole)
    this.setData({
      isChef: newRole === 'chef'
    })
  },

  // 选择分类
  selectCategory(e) {
    const category = e.currentTarget.dataset.category
    this.setData({
      activeCategory: category
    })
    this.filterDishes()
  },

  // 筛选菜品
  filterDishes() {
    const { dishList, activeCategory } = this.data
    if (activeCategory === '全部') {
      this.setData({ filteredDishes: dishList })
    } else {
      this.setData({
        filteredDishes: dishList.filter(dish => dish.category === activeCategory)
      })
    }
  },

  // 添加菜品
  addDish() {
    wx.navigateTo({
      url: '/pages/dish-edit/index'
    })
  },

  // 管理分类
  manageCategory() {
    wx.showToast({
      title: '管理分类',
      icon: 'none'
    })
  },

  // 菜品排序
  sortDish() {
    wx.showToast({
      title: '菜品排序',
      icon: 'none'
    })
  },

  // 加入购物车
  addToCart(e) {
    const dish = e.currentTarget.dataset.dish
    const cartList = [...this.data.cartList]
    const existing = cartList.find(item => item._id === dish._id)
    
    if (existing) {
      existing.count += 1
    } else {
      cartList.push({ ...dish, count: 1 })
    }
    
    this.setData({ cartList })
    wx.showToast({
      title: '已加入选菜清单',
      icon: 'success'
    })
  },

  // 提交订单
  async submitOrder() {
    if (this.data.cartList.length === 0) return
    
    try {
      wx.showLoading({ title: '提交中...' })
      
      wx.hideLoading()
      wx.showToast({
        title: '订单已提交',
        icon: 'success'
      })
      
      this.setData({ cartList: [] })
      
      setTimeout(() => {
        wx.switchTab({
          url: '/pages/order/index'
        })
      }, 1500)
      
    } catch (err) {
      wx.hideLoading()
      wx.showToast({
        title: '提交失败',
        icon: 'none'
      })
    }
  }
})
