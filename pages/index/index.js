const app = getApp();
const CONST = require('../../utils/const.js');

Page({
  data: {
    recommend: [],
    diceDish: null,
    diceAdded: false,
    rolling: false,
    loading: true,
    identityText: '琳宝（客人）',
    identityEmoji: '🍽️',
    heroSub: '今天想吃什么呀？',
    kitchenTitle: '琳宝私厨 🍳',
    festival: null,
    // 谁吃这一口：转盘
    wheelAngle: 0,
    wheelRolling: false,
    wheelResult: '',
    // 双头像身份卡
    isChef: false
  },

  async onLoad(options) {
    const user = await app.ensureAuth();
    this.applyIdentity();
    this.applyHero(user);
    this.applyFestival();
    await this.loadAll();
    this.setData({ loading: false });
    this.handleFriendEntry(options);
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    this.applyIdentity();
  },

  applyIdentity() {
    this.setData({
      identityText: app.identityLabel(),
      identityEmoji: app.isChef() ? '👨‍🍳' : '🍽️',
      isChef: app.isChef()
    });
  },

  // 双头像卡：点击切换身份
  async switchTo(e) {
    const role = e.currentTarget.dataset.role;
    if ((role === 'chef') === this.data.isChef) return;
    wx.showLoading({ title: '切换中' });
    try {
      await app.setIdentity(role);
      this.applyIdentity();
      wx.showToast({ title: role === 'chef' ? '现在是汶宝（厨师）👨‍🍳' : '现在是琳宝（客人）🍽️', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  applyHero(user) {
    const days = app.daysTogether();
    const kitchenName = app.getKitchenName();
    this.setData({
      heroSub: days
        ? `这是咱俩在一起的第 ${days} 天 🌷`
        : '今天想吃什么呀？',
      kitchenTitle: kitchenName ? `${kitchenName} 🍳` : '琳宝私厨 🍳'
    });
  },

  applyFestival() {
    const festival = app.nextFestival();
    if (!festival) return;
    const map = {
      春节: '🧧',
      端午节: '🐲',
      七夕节: '💞',
      中秋节: '🎑',
      元旦: '🎆',
      情人节: '💝',
      劳动节: '🌾',
      国庆节: '🎉',
      圣诞节: '🎄'
    };
    this.setData({ festival: Object.assign({}, festival, { emoji: map[festival.name] || '🎉' }) });
  },

  async loadAll() {
    const res = await app.callCloud('manageDish', { action: 'list' });
    const all = ((res && res.dishes) || []).map((d) => app.normalizeDish(d));
    this.allDishes = all;

    // 智能推荐
    const recRes = await app.callCloud('recommend');
    const recDishes = ((recRes && recRes.dishes) || []).map((d) => app.normalizeDish(d));
    this.setData({
      recommend: (recDishes.length ? recDishes : all.slice(0, 3)).map((d) => this.decorate(d))
    });
  },

  decorate(dish) {
    return Object.assign({}, dish, {
      _inCart: this.inCart(dish._id),
      _fav: app.isFav(dish._id),
      _reason: this.reasonFor(dish)
    });
  },

  reasonFor(dish) {
    if (app.isFav(dish._id)) return '你们收藏过 ❤';
    if (dish.tags && dish.tags.some((t) => t === '下饭')) return '超下饭，配饭一绝';
    if (dish.category === '汤品') return '暖胃一汤，先喝一口';
    if (dish.category === '甜点') return '甜甜的收尾，幸福感拉满';
    if (dish.category === '早餐') return '元气早餐，吃了就有劲';
    if (dish.popularityScore >= 90) return '你俩最近常点';
    if (dish.cuisine === '家常菜') return '家常暖心，怎么都好吃';
    return '换个口味试试看';
  },

  inCart(id) {
    return (app.getCart() || []).some((item) => item._id === id);
  },

  // 今天吃什么：随机摇
  rollDice() {
    const all = this.allDishes || [];
    if (!all.length) {
      wx.showToast({ title: '菜单还是空的哦', icon: 'none' });
      return;
    }
    this.setData({ rolling: true, diceAdded: false });
    let count = 0;
    clearInterval(this._timer);
    this._timer = setInterval(() => {
      const d = all[Math.floor(Math.random() * all.length)];
      this.setData({ diceDish: d });
      count += 1;
      if (count > 8) {
        clearInterval(this._timer);
        this.setData({ rolling: false });
        wx.vibrateShort && wx.vibrateShort({ type: 'light' });
      }
    }, 90);
  },

  diceDetail() {
    if (this.data.diceDish) {
      wx.navigateTo({ url: '/pages/detail/detail?id=' + this.data.diceDish._id });
    }
  },

  diceChoose() {
    const dish = this.data.diceDish;
    if (!dish) {
      wx.showToast({ title: '先摇一摇呀', icon: 'none' });
      return;
    }
    if (this.data.diceAdded) {
      wx.switchTab({ url: '/pages/cart/cart' });
      return;
    }
    try {
      app.addToCart(dish);
      this.setData({ diceAdded: true });
      wx.showToast({ title: '加好啦，去清单看看 🛒', icon: 'none' });
      setTimeout(() => {
        if (this.data.diceAdded) {
          this.setData({ recommend: this.data.recommend.map((d) => this.decorate(d)) });
        }
      }, 300);
    } catch (err) {
      console.error('diceChoose error', err);
      wx.showModal({ title: '加菜出错', content: String((err && err.message) || err), showCancel: false });
    }
  },

  async onAdd(e) {
    try {
      const id = e.detail.id;
      const dish = (this.allDishes || []).find((d) => d._id === id);
      if (!dish) return;
      const before = this.inCart(id);
      app.addToCart(dish);
      wx.showToast({ title: before ? '已从清单移除' : '加好啦 ❤', icon: 'none' });
      setTimeout(() => this.setData({ recommend: this.data.recommend.map((d) => this.decorate(d)) }), 300);
    } catch (err) {
      console.error('onAdd error', err);
      wx.showModal({ title: '加菜出错', content: String((err && err.message) || err), showCancel: false });
    }
  },

  async onFav(e) {
    const id = e.detail.id;
    const faved = await app.toggleFav(id);
    wx.showToast({ title: faved ? '已收藏 ❤' : '已取消收藏', icon: 'none' });
    this.setData({ recommend: this.data.recommend.map((d) => this.decorate(d)) });
  },

  // 谁吃这一口：转盘随机选 琳宝/汶宝
  spinWheel() {
    if (this.data.wheelRolling) return;
    const base = this.data.wheelAngle;
    const target = base + 360 * 5 + Math.floor(Math.random() * 360);
    this.setData({ wheelRolling: true, wheelResult: '', wheelAngle: target });
    clearTimeout(this._wheelTimer);
    this._wheelTimer = setTimeout(() => {
      const angle = (360 - (target % 360)) % 360;
      const idx = Math.floor(angle / 45);
      const result = idx % 2 === 0 ? '琳宝' : '汶宝';
      this.setData({ wheelRolling: false, wheelResult: result });
      wx.vibrateShort && wx.vibrateShort({ type: 'light' });
    }, 4200);
  },

  onUnload() {
    clearTimeout(this._wheelTimer);
    clearInterval(this._timer);
  },

  onDetail(e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.detail.id });
  },

  goMenu() {
    wx.switchTab({ url: '/pages/menu/menu' });
  },

  goIdeaMenu() {
    wx.navigateTo({ url: '/pages/ideaMenu/ideaMenu' });
  },

  goDiscover() {
    wx.navigateTo({ url: '/pages/discover/discover' });
  },

  // 好友点菜：从分享卡片进来
  handleFriendEntry(options) {
    if (!options || !options.friend) return;
    const from = decodeURIComponent(options.from || '琳宝');
    wx.showModal({
      title: '💌 好友点菜',
      content: `${from} 想请你帮忙点菜～去菜单帮她选一道想吃的吧`,
      confirmText: '去点菜',
      confirmColor: '#9B59B6',
      success: (res) => {
        if (res.confirm) wx.switchTab({ url: '/pages/menu/menu' });
      }
    });
  },

  // 转发：小程序卡片
  onShareAppMessage() {
    const name = app.getKitchenName() || '琳宝私厨';
    const myName = app.isChef() ? '汶宝' : '琳宝';
    return {
      title: `${name} · ${myName}想请你帮忙点菜 🍽️`,
      path: `/pages/index/index?friend=1&from=${encodeURIComponent(myName)}`
    };
  },

  // 转发截图：生成海报并保存相册
  drawShare() {
    const plan = (this.data.recommend || []).slice(0, 3);
    const kitchenName = app.getKitchenName() || '琳宝私厨';
    const days = app.daysTogether();
    const query = this.createSelectorQuery();
    query
      .select('#shareCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) {
          wx.showToast({ title: '生成失败，再试一次', icon: 'none' });
          return;
        }
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getSystemInfoSync().pixelRatio || 2;
        canvas.width = 375 * dpr;
        canvas.height = 500 * dpr;
        ctx.scale(dpr, dpr);

        // 背景渐变
        const grad = ctx.createLinearGradient(0, 0, 0, 500);
        grad.addColorStop(0, '#FFF0FA');
        grad.addColorStop(1, '#F1E6FB');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 375, 500);

        // 装饰圆
        ctx.fillStyle = '#FFE9F5';
        ctx.beginPath();
        ctx.arc(45, 45, 60, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#E8D9F9';
        ctx.beginPath();
        ctx.arc(330, 60, 45, 0, Math.PI * 2);
        ctx.fill();

        // 标题
        ctx.textAlign = 'center';
        ctx.fillStyle = '#7A4BB5';
        ctx.font = 'bold 30px sans-serif';
        ctx.fillText(kitchenName, 187, 95);
        ctx.font = '14px sans-serif';
        ctx.fillStyle = '#B89BD6';
        ctx.fillText(days ? `咱俩在一起的第 ${days} 天 🌷` : '今天想吃什么呀？', 187, 125);

        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#C9A9E8';
        const now = new Date();
        ctx.fillText(`${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`, 187, 150);

        // 菜品卡片
        const roles = ['🍖', '🥬', '🥣'];
        plan.forEach((dish, index) => {
          const y = 180 + index * 95;
          ctx.fillStyle = '#FFFFFF';
          ctx.strokeStyle = '#F0E3FA';
          ctx.lineWidth = 1;
          this.roundRect2d(ctx, 30, y, 315, 75, 12);
          ctx.stroke();
          ctx.fill();
          ctx.fillStyle = '#F3E9FB';
          ctx.beginPath();
          ctx.arc(75, y + 37.5, 26, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = '22px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#8A5BB8';
          ctx.fillText(roles[index] || '🍽️', 75, y + 46);
          ctx.textAlign = 'left';
          ctx.font = 'bold 16px sans-serif';
          ctx.fillStyle = '#4A3B5A';
          ctx.fillText(dish.name, 118, y + 40);
          ctx.font = '11px sans-serif';
          ctx.fillStyle = '#B89BD6';
          const tags = (dish.tags || []).slice(0, 3).join(' · ');
          ctx.fillText(tags || dish.category || '家常菜', 118, y + 60);
        });

        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#B89BD6';
        ctx.fillText('两个人的专属小厨房 · 今天吃什么，交给琳宝私厨', 187, 470);

        wx.canvasToTempFilePath({
          canvas,
          success: (res) => this.saveToAlbum(res.tempFilePath),
          fail: (err) => {
            console.error('canvasToTempFilePath error', err);
            wx.showToast({ title: '生成失败，再试一次', icon: 'none' });
          }
        });
      });
  },

  roundRect2d(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  },

  saveToAlbum(path) {
    wx.saveImageToPhotosAlbum({
      filePath: path,
      success: () => {
        wx.showModal({
          title: '已保存到相册 📤',
          content: '去相册把这张海报发给 TA 吧～',
          showCancel: false,
          confirmText: '好哒',
          confirmColor: '#9B59B6'
        });
      },
      fail: (err) => {
        if (err.errMsg && err.errMsg.indexOf('auth') >= 0) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中允许保存到相册，才能生成转发截图哦',
            confirmText: '去设置',
            confirmColor: '#9B59B6',
            success: (res) => {
              if (res.confirm) wx.openSetting();
            }
          });
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' });
        }
      }
    });
  },

  goFridge() {
    wx.navigateTo({ url: '/pages/fridge/fridge' });
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/edit/edit' });
  },

  switchIdentity() {
    wx.navigateTo({ url: '/pages/identity/identity?force=1' });
  }
});
