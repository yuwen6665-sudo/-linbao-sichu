// 发现页面
Page({
  data: {
    activeTab: 'love',
    lovePosts: [
      {
        _id: '1',
        userName: '老周私房菜和果果的厨房',
        userAvatar: '',
        date: '8月15日',
        content: '好吃😋',
        images: [],
        dishes: ['小炒河虾 ×1', '香肠蛋炒饭 ×1', '西红柿炒鸡蛋 ×1'],
        likes: ['我是轩啊👑', '恋爱菜单338769']
      }
    ],
    recipeDishes: [
      {
        _id: '1',
        name: '水煮大虾',
        author: '小崔天天做饭',
        description: '好吃',
        imageUrl: '',
        category: '荤菜'
      },
      {
        _id: '2',
        name: '江西菜',
        author: '小崔天天做饭',
        description: '很辣 能接受的辣度上限',
        imageUrl: '',
        category: '未分类'
      }
    ]
  },

  onLoad() {
    this.loadPosts()
  },

  // 加载数据
  async loadPosts() {
    // 模拟数据，实际从云数据库读取
  },

  // 切换Tab
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
  },

  // 点赞
  likePost(e) {
    const id = e.currentTarget.dataset.id
    wx.showToast({
      title: '已点赞',
      icon: 'success'
    })
  },

  // 偷菜
  stealDish(e) {
    wx.showToast({
      title: '已偷到你的菜单',
      icon: 'success'
    })
  }
})
