// 发现页 —— 心情日历（顶部窄条）+ 恋爱日志（下面滚动）
const app = getApp()
const api = require('../../utils/api.js')
const moodUtil = require('../../utils/mood.js')

Page({
  data: {
    loading: true,
    coupleId: null,

    // 日历
    year: 0,
    month: 0,
    monthLabel: '',
    cells: [],
    moodMap: {},          // '2026-09-18' → 'happy'
    todayStr: '',
    selectedDay: '',
    showMoodPicker: false,

    // 日志
    posts: [],
    composing: false,
    draft: '',
    draftImages: [],
    draftMood: '',
    submitting: false,

    moods: moodUtil.MOODS
  },

  async onShow() {
    if (!app.globalData.ready) await app.ensureLogin()

    const now = new Date()
    this.setData({
      coupleId: app.globalData.coupleId,
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      todayStr: moodUtil.todayStr(now)
    })

    this.buildCalendar()
    this.loadMoods()
    this.loadPosts()
  },

  /* ---------------- 日历 ---------------- */

  // 日历格子要带心情表情，WXML 里没法调函数，所以在这里算好
  buildCalendar() {
    const { year, month, moodMap } = this.data
    const cells = moodUtil.buildMonthGrid(year, month).map(function (c) {
      const key = c.dateStr
      const m = key && moodMap[key] ? moodUtil.MOOD_MAP[moodMap[key]] : null
      return Object.assign({}, c, { moodEmoji: m ? m.emoji : '' })
    })
    this.setData({
      cells: cells,
      monthLabel: year + '年' + month + '月'
    })
  },

  prevMonth() {
    let { year, month } = this.data
    month -= 1
    if (month < 1) { month = 12; year -= 1 }
    this.setData({ year: year, month: month }, () => {
      this.buildCalendar()
      this.loadMoods()
    })
  },

  nextMonth() {
    let { year, month } = this.data
    month += 1
    if (month > 12) { month = 1; year += 1 }
    this.setData({ year: year, month: month }, () => {
      this.buildCalendar()
      this.loadMoods()
    })
  },

  async loadMoods() {
    const { year, month } = this.data
    const monthStr = year + '-' + moodUtil.pad(month)
    const res = await api.getMoods(monthStr)

    const moodMap = {}
    if (res.ok) {
      (res.data || []).forEach(function (m) {
        moodMap[m.date] = m.mood
      })
    }
    this.setData({ moodMap: moodMap }, () => {
      this.buildCalendar()
    })
  },

  // 点某天 → 选心情
  onPickDay(e) {
    const cell = e.currentTarget.dataset.cell
    if (!cell || cell.empty) return

    const dateStr = cell.dateStr
    // 未来的日子不让标
    if (dateStr > this.data.todayStr) {
      wx.showToast({ title: '还没到那天呢', icon: 'none' })
      return
    }

    this.setData({ selectedDay: dateStr, showMoodPicker: true })
  },

  async chooseMood(e) {
    const mood = e.currentTarget.dataset.mood
    const dateStr = this.data.selectedDay

    this.setData({ showMoodPicker: false })

    const res = await api.setMood(dateStr, mood)
    if (!res.ok) {
      wx.showToast({ title: res.msg, icon: 'none' })
      return
    }

    const moodMap = Object.assign({}, this.data.moodMap)
    moodMap[dateStr] = mood
    this.setData({ moodMap: moodMap }, () => {
      this.buildCalendar()
    })
    wx.showToast({ title: '记下了', icon: 'none' })
  },

  closeMoodPicker() {
    this.setData({ showMoodPicker: false })
  },

  /* ---------------- 日志 ---------------- */

  async loadPosts() {
    const res = await api.getPosts(30)
    if (!res.ok) {
      this.setData({ loading: false })
      wx.showToast({ title: res.msg, icon: 'none' })
      return
    }

    const myOpenid = app.globalData.openid
    const posts = (res.data || []).map(function (p) {
      const t = new Date(p.createTime)
      return {
        _id: p._id,
        nickName: p.nickName || '',
        avatarUrl: p.avatarUrl || '',
        content: p.content,
        images: p.images || [],
        mood: p.mood || '',
        moodEmoji: p.mood && moodUtil.MOOD_MAP[p.mood] ? moodUtil.MOOD_MAP[p.mood].emoji : '',
        timeText: timeTextOf(t),
        likeCount: (p.likes || []).length,
        liked: (p.likes || []).indexOf(myOpenid) > -1,
        isMine: p.openid === myOpenid
      }
    })

    this.setData({ posts: posts, loading: false })
  },

  toggleCompose() {
    this.setData({ composing: !this.data.composing })
  },

  onDraftInput(e) {
    this.setData({ draft: e.detail.value })
  },

  pickDraftMood(e) {
    const m = e.currentTarget.dataset.mood
    this.setData({ draftMood: this.data.draftMood === m ? '' : m })
  },

  // 选图 → 传云存储
  async chooseImage() {
    if (this.data.draftImages.length >= 6) {
      wx.showToast({ title: '最多 6 张', icon: 'none' })
      return
    }
    try {
      const res = await wx.chooseImage({
        count: 6 - this.data.draftImages.length,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera']
      })
      wx.showLoading({ title: '上传中', mask: true })

      for (const path of res.tempFilePaths) {
        const up = await wx.cloud.uploadFile({
          cloudPath: 'posts/' + Date.now() + '-' + Math.floor(Math.random() * 1000) + '.png',
          filePath: path
        })
        this.setData({
          draftImages: this.data.draftImages.concat([up.fileID])
        })
      }
      wx.hideLoading()
    } catch (err) {
      wx.hideLoading()
      console.error('选图失败', err)
    }
  },

  removeDraftImage(e) {
    const idx = e.currentTarget.dataset.index
    const list = this.data.draftImages.slice()
    list.splice(idx, 1)
    this.setData({ draftImages: list })
  },

  async submitPost() {
    const content = this.data.draft.trim()
    const images = this.data.draftImages

    if (!content && images.length === 0) {
      wx.showToast({ title: '写点什么或发张图', icon: 'none' })
      return
    }
    if (!app.globalData.coupleId) {
      wx.showToast({ title: '先绑定对象，日志两个人一起写', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    const res = await api.addPost(content, images, this.data.draftMood)
    this.setData({ submitting: false })

    if (!res.ok) {
      wx.showToast({ title: res.msg, icon: 'none' })
      return
    }

    this.setData({ draft: '', draftImages: [], draftMood: '', composing: false })
    wx.showToast({ title: '写好了', icon: 'success' })
    this.loadPosts()

    // 日志里带心情的话，顺手把今天的心情也标了
    if (this.data.draftMood) {
      await api.setMood(moodUtil.todayStr(), this.data.draftMood)
      this.loadMoods()
    }
  },

  async onLike(e) {
    const id = e.currentTarget.dataset.id
    const res = await api.likePost(id)
    if (!res.ok) return

    const posts = this.data.posts.slice()
    const post = posts.find(function (p) { return p._id === id })
    if (post) {
      post.liked = res.data.liked
      post.likeCount = res.data.likeCount
      this.setData({ posts: posts })
    }
  },

  onRemovePost(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删掉这条？',
      content: '删了就找不回来了',
      success: async (r) => {
        if (!r.confirm) return
        const res = await api.removePost(id)
        if (res.ok) {
          wx.showToast({ title: '已删除', icon: 'none' })
          this.loadPosts()
        }
      }
    })
  },

  previewImage(e) {
    const url = e.currentTarget.dataset.url
    const urls = e.currentTarget.dataset.urls || [url]
    wx.previewImage({ current: url, urls: urls })
  },

  goToProfile() {
    wx.switchTab({ url: '/pages/profile/index' })
  }
})

// 时间显示：今天 / 昨天 / 具体日期
function timeTextOf(t) {
  const now = new Date()
  const today = moodUtil.todayStr(now)
  const dateStr = moodUtil.todayStr(t)
  if (dateStr === today) {
    return '今天 ' + moodUtil.pad(t.getHours()) + ':' + moodUtil.pad(t.getMinutes())
  }
  const yesterday = new Date(now.getTime() - 86400000)
  if (dateStr === moodUtil.todayStr(yesterday)) {
    return '昨天 ' + moodUtil.pad(t.getHours()) + ':' + moodUtil.pad(t.getMinutes())
  }
  return moodUtil.prettyDate(dateStr)
}
