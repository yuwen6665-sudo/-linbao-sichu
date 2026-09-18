// 添加/编辑菜品页面
Page({
  data: {
    form: {
      name: '',
      description: '',
      imageUrl: '',
      category: '主食',
      tasteTags: [],
      calories: ''
    },
    categories: ['主食', '荤菜', '汤品', '素菜', '甜品', '饮品'],
    categoryIndex: 0,
    tasteOptions: ['麻辣', '清淡', '咸香', '甜味', '酸味', '蒜香', '葱香', '酥脆', '软糯', '爽口']
  },

  onLoad(options) {
    if (options.id) {
      // 编辑模式，加载菜品数据
      this.loadDishData(options.id)
    }
  },

  // 加载菜品数据（编辑模式）
  async loadDishData(id) {
    // 从数据库加载菜品数据
  },

  // 上传图片
  async uploadImage() {
    try {
      const res = await wx.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera']
      })
      
      wx.showLoading({ title: '上传中...' })
      
      // 上传到云存储
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath: `dishes/${Date.now()}.png`,
        filePath: res.tempFilePaths[0]
      })
      
      wx.hideLoading()
      
      this.setData({
        'form.imageUrl': uploadRes.fileID
      })
      
      wx.showToast({
        title: '上传成功',
        icon: 'success'
      })
      
    } catch (err) {
      wx.hideLoading()
      wx.showToast({
        title: '上传失败',
        icon: 'none'
      })
    }
  },

  // 表单输入
  onInputChange(e) {
    const field = e.currentTarget.dataset.field
    this.setData({
      [`form.${field}`]: e.detail.value
    })
  },

  // 分类选择
  onCategoryChange(e) {
    const index = e.detail.value
    this.setData({
      categoryIndex: index,
      'form.category': this.data.categories[index]
    })
  },

  // 切换标签
  toggleTag(e) {
    const tag = e.currentTarget.dataset.tag
    const tags = [...this.data.form.tasteTags]
    const index = tags.indexOf(tag)
    
    if (index > -1) {
      tags.splice(index, 1)
    } else {
      tags.push(tag)
    }
    
    this.setData({
      'form.tasteTags': tags
    })
  },

  // 保存菜品
  async saveDish() {
    const { name, imageUrl, category } = this.data.form
    
    if (!name) {
      wx.showToast({ title: '请输入菜名', icon: 'none' })
      return
    }
    
    if (!imageUrl) {
      wx.showToast({ title: '请上传菜品图片', icon: 'none' })
      return
    }
    
    wx.showLoading({ title: '保存中...' })
    
    try {
      // 调用云函数保存菜品
      await wx.cloud.database().collection('dishes').add({
        data: {
          ...this.data.form,
          coupleId: getApp().globalData.coupleId,
          createTime: new Date()
        }
      })
      
      wx.hideLoading()
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })
      
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      
    } catch (err) {
      wx.hideLoading()
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      })
    }
  }
})
