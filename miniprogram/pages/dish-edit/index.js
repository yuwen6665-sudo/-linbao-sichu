// 添加 / 编辑菜品
const api = require('../../utils/api.js')

Page({
  data: {
    editing: false,
    _id: '',
    categories: api.CATEGORY_ORDER,
    // 默认分类是「主食」。下标必须跟着 CATEGORY_ORDER 算，
    // 写死 0 的话，一旦分类顺序变了（比如前面加了「凉菜」），
    // 下拉框显示的和实际存进去的就会对不上。
    categoryIndex: api.CATEGORY_ORDER.indexOf('主食'),
    form: {
      name: '',
      description: '',
      // ⚠️ form.image 存的是**真正的 fileID**，保存时写回数据库的就是它。
      // 显示时用 form.imagePreview（临时链接），别混用 —— 详见 loadDish 里的注释。
      image: '',
      imagePreview: '',
      category: '主食',
      tasteTags: [],
      calories: '',
      cookTime: ''
    },
    tasteOptions: ['麻辣', '清淡', '咸香', '甜味', '酸味', '蒜香', '葱香', '酥脆', '软糯', '快手'],
    submitting: false
  },

  async onLoad(options) {
    if (!getApp().globalData.ready) await getApp().ensureLogin()

    // 编辑模式
    if (options.id) {
      this.setData({ editing: true, _id: options.id })
      await this.loadDish(options.id)
    }
  },

  async loadDish(id) {
    const app = getApp()
    const cache = app.globalData.dishCache || []
    let dish = cache.find(function (d) { return d._id === id })

    if (!dish) {
      api.clearDishCache()
      const res = await api.getDishes()
      if (res.ok) {
        dish = (res.data || []).find(function (d) { return d._id === id })
      }
    }

    if (!dish) {
      wx.showToast({ title: '没找到这道菜', icon: 'none' })
      return
    }

    const idx = this.data.categories.indexOf(dish.category)
    this.setData({
      form: {
        name: dish.name || '',
        description: dish.description || '',
        // ⚠️ 这两行别合并，也别写反：
        //   image        = 真正的 fileID（imageFileID 是 data 云函数专门留的那份原始值）
        //                  —— 保存时要写回库里的，**绝对不能存临时链接**，2 小时后就失效
        //   imagePreview = 临时 https 链接，只给 <image> 显示用
        //                  （云存储文件是云函数上传的，权限「仅创建者可读写」，
        //                    前端直接拿 cloud:// 是读不到的）
        image: dish.imageFileID || dish.image || '',
        imagePreview: dish.image || '',
        category: dish.category || '主食',
        tasteTags: dish.tasteTags || [],
        calories: dish.calories ? String(dish.calories) : '',
        cookTime: dish.cookTime || ''
      },
      categoryIndex: idx > -1 ? idx : 0
    })
    wx.setNavigationBarTitle({ title: '编辑「' + dish.name + '」' })
  },

  async uploadImage() {
    try {
      const res = await wx.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera']
      })
      wx.showLoading({ title: '上传中', mask: true })

      const up = await wx.cloud.uploadFile({
        cloudPath: 'dishes/' + Date.now() + '-' + Math.floor(Math.random() * 1000) + '.png',
        filePath: res.tempFilePaths[0]
      })

      wx.hideLoading()
      // 两者一起改：image 用来保存，imagePreview 用来显示
      this.setData({ 'form.image': up.fileID, 'form.imagePreview': up.fileID })
      wx.showToast({ title: '上传好了', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      console.error('上传失败', err)
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ ['form.' + field]: e.detail.value })
  },

  onCategoryChange(e) {
    const index = Number(e.detail.value)
    this.setData({
      categoryIndex: index,
      'form.category': this.data.categories[index]
    })
  },

  toggleTag(e) {
    const tag = e.currentTarget.dataset.tag
    const tags = this.data.form.tasteTags.slice()
    const idx = tags.indexOf(tag)
    if (idx > -1) {
      tags.splice(idx, 1)
    } else {
      tags.push(tag)
    }
    this.setData({ 'form.tasteTags': tags })
  },

  async saveDish() {
    const form = this.data.form

    if (!form.name.trim()) {
      wx.showToast({ title: '菜名不能空着', icon: 'none' })
      return
    }

    const app = getApp()
    if (!app.globalData.coupleId) {
      wx.showToast({ title: '先绑定对象才能加菜', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    let res

    if (this.data.editing) {
      res = await this.updateDish()
    } else {
      res = await api.addDish(form)
    }

    this.setData({ submitting: false })

    if (!res.ok) {
      wx.showToast({ title: res.msg, icon: 'none' })
      return
    }

    api.clearDishCache()
    wx.showToast({ title: '保存好了', icon: 'success' })
    setTimeout(() => wx.navigateBack(), 1200)
  },

  // 更新已有菜品（只能改自己家加的菜）
  async updateDish() {
    const form = this.data.form
    try {
      await wx.cloud.database().collection('dishes').doc(this.data._id).update({
        data: {
          name: form.name.trim(),
          description: form.description,
          image: form.image,
          imageUrl: form.image,
          category: form.category,
          categoryOrder: api.CATEGORY_ORDER.indexOf(form.category),
          tasteTags: form.tasteTags,
          calories: Number(form.calories) || 0,
          cookTime: form.cookTime
        }
      })
      return { ok: true }
    } catch (err) {
      console.error('更新菜品失败', err)
      return { ok: false, msg: '保存失败，再试一次' }
    }
  }
})
