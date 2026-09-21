const CONST = require('./utils/const.js');

App({
  // 购物车云同步串行队列：防止并发请求互相覆盖（"加了又消失"的根因）
  _cartSyncQueue: Promise.resolve(),

  globalData: {
    envId: 'cloud1-d1g65es7r8c967ed3',
    openid: '',
    user: null,
    cart: [],
    cartSyncingCount: 0,
    cartSyncTimer: null,
    consts: CONST,
    // 纪念日：把下面的日期改成你们在一起的那天（格式 2025-06-01），首页问候语就会显示"在一起第 N 天"
    anniversary: '2024-02-23'
  },

  onLaunch() {
    const cachedCart = wx.getStorageSync('lb_cart');
    if (Array.isArray(cachedCart)) {
      this.globalData.cart = cachedCart;
    }
    wx.cloud.init({
      env: this.globalData.envId,
      traceUser: true
    });
  },

  // ---------- 云函数便捷调用 ----------
  callCloud(name, data) {
    return wx.cloud
      .callFunction({ name, data: data || {} })
      .then((res) => res.result || {})
      .catch((err) => {
        console.error('callCloud error', name, err);
        return null;
      });
  },

  // ---------- 登录/用户 ----------
  async ensureAuth() {
    if (this.globalData.user) return this.globalData.user;
    try {
      const res = await wx.cloud.callFunction({ name: 'login' });
      const result = res.result || {};
      this.globalData.openid = result.openid || '';
      const user = result.user || {
        openid: result.openid,
        name: '琳宝',
        lastIdentity: '',
        favoriteIds: []
      };
      this.globalData.user = user;
      if (!user.lastIdentity) {
        user.lastIdentity = wx.getStorageSync('lb_identity') || '';
      }
      return user;
    } catch (err) {
      return null;
    }
  },

  // ---------- 身份 ----------
  getIdentity() {
    const user = this.globalData.user || {};
    return user.lastIdentity || wx.getStorageSync('lb_identity') || 'guest';
  },

  isChef() {
    return this.getIdentity() === 'chef';
  },

  identityLabel() {
    return this.isChef() ? '汶宝（厨师）' : '琳宝（客人）';
  },

  async setIdentity(identity) {
    const value = identity === 'chef' ? 'chef' : 'guest';
    wx.setStorageSync('lb_identity', value);
    if (this.globalData.user) {
      this.globalData.user.lastIdentity = value;
    }
    const res = await this.callCloud('user', { action: 'setIdentity', identity: value });
    if (res && res.ok && res.name && this.globalData.user) {
      this.globalData.user.name = res.name;
    }
    return value;
  },

  async setName(name) {
    const res = await this.callCloud('user', { action: 'setName', name });
    if (res && res.ok && res.name) {
      if (this.globalData.user) this.globalData.user.name = res.name;
      return res.name;
    }
    return name;
  },

  // ---------- 共享清单 ----------
  getCart() {
    return this.globalData.cart || [];
  },

  setCart(cart) {
    this.globalData.cart = cart;
    wx.setStorageSync('lb_cart', cart);
  },

  isCartSyncing() {
    return this.globalData.cartSyncingCount > 0 || Boolean(this.globalData.cartSyncTimer);
  },

  beginCartSync() {
    this.globalData.cartSyncingCount += 1;
  },

  endCartSync() {
    this.globalData.cartSyncingCount = Math.max(0, this.globalData.cartSyncingCount - 1);
  },

  // 把购物车云同步操作排队执行，避免并发导致云端状态回退
  _syncCart(task) {
    this._cartSyncQueue = this._cartSyncQueue.then(task).catch((err) => {
      console.error('cart sync error', err);
    });
    return this._cartSyncQueue;
  },

  async fetchCart(options = {}) {
    if (this.isCartSyncing() && !options.force) {
      return this.getCart();
    }
    const res = await this.callCloud('sharedCart', { action: 'get' });
    if (res && Array.isArray(res.items)) {
      this.setCart(res.items);
      return res.items;
    }
    // 云端失败时保留本地清单，避免误清空
    return this.getCart();
  },

  addToCart(dish) {
    if (!dish || !dish._id) return this.getCart();
    try {
      const user = this.globalData.user || { name: '琳宝' };
      // 乐观更新本地
      let cart = this.getCart().slice();
      const index = cart.findIndex((item) => item._id === dish._id);
      if (index >= 0) {
        cart[index] = Object.assign({}, cart[index], { count: Number(cart[index].count || 0) + 1 });
      } else {
        cart.push({
          _id: dish._id,
          name: dish.name,
          emoji: dish.emoji || '',
          price: Number(dish.price || 0),
          image: dish.image || '',
          category: dish.category || '',
          desc: dish.desc || '',
          tags: dish.tags || [],
          addedByOpenid: this.globalData.openid,
          addedByName: user.name || '琳宝',
          count: 1
        });
      }
      this.setCart(cart);
      this.updateTabBadge();
      // 云端同步：排队执行，本地先显示、后台慢慢同步，失败也不回滚本地
      this._syncCart(() =>
        this.callCloud('sharedCart', {
          action: 'add',
          dish: Object.assign({}, dish, {
            addedByOpenid: this.globalData.openid,
            addedByName: user.name || '琳宝'
          })
        }).then((r) => {
          if (r && Array.isArray(r.items)) {
            this.setCart(r.items);
            this.updateTabBadge();
          } else {
            console.error('sharedCart add 失败，返回：', r);
          }
        })
      );
    } catch (err) {
      console.error('addToCart error', err);
    }
    return this.getCart();
  },

  removeFromCart(id) {
    // 乐观更新本地：立即移除
    let cart = this.getCart().filter((item) => item._id !== id);
    this.setCart(cart);
    this.updateTabBadge();
    // 串行同步云端
    this._syncCart(() =>
      this.callCloud('sharedCart', { action: 'remove', id }).then((r) => {
        if (r && Array.isArray(r.items)) {
          this.setCart(r.items);
          this.updateTabBadge();
        }
      })
    );
    return this.getCart();
  },

  updateCartCount(id, delta) {
    // 乐观更新本地
    let cart = this.getCart()
      .map((item) =>
        item._id === id
          ? Object.assign({}, item, { count: Math.max(0, Number(item.count || 0) + Number(delta || 0)) })
          : item
      )
      .filter((item) => item.count > 0);
    this.setCart(cart);
    this.updateTabBadge();
    // 串行同步云端
    this._syncCart(() =>
      this.callCloud('sharedCart', { action: 'update', id, delta: Number(delta || 0) }).then((r) => {
        if (r && Array.isArray(r.items)) {
          this.setCart(r.items);
          this.updateTabBadge();
        }
      })
    );
    return this.getCart();
  },

  async clearCart() {
    const res = await this.callCloud('sharedCart', { action: 'clear' });
    this.setCart((res && res.items) || []);
    this.updateTabBadge();
    return this.getCart();
  },

  updateTabBadge() {
    const count = this.globalData.cart.reduce((sum, item) => sum + Number(item.count || 0), 0);
    try {
      if (count > 0) {
        wx.setTabBarBadge({ index: 2, text: String(count) });
      } else {
        wx.removeTabBarBadge({ index: 2 });
      }
    } catch (e) {
      // 自定义 tabBar 下静默忽略
    }
  },

  // ---------- 收藏 ----------
  isFav(id) {
    const user = this.globalData.user || {};
    return (user.favoriteIds || []).indexOf(id) >= 0;
  },

  async toggleFav(id) {
    const res = await this.callCloud('user', { action: 'toggleFav', dishId: id });
    if (res && res.ok && this.globalData.user) {
      this.globalData.user.favoriteIds = res.favoriteIds || [];
      return res.faved;
    }
    return false;
  },

  // ---------- 工具 ----------
  // 下一个节日倒计时：返回 { name, days }，days=0 表示就是今天
  nextFestival() {
    const pad = (num) => String(num).padStart(2, '0');
    const toDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
    // 农历节日（公历对照表，覆盖 2024-2030）
    const lunar = [
      { name: '春节', dates: ['2024-02-10', '2025-01-29', '2026-02-17', '2027-02-06', '2028-01-26', '2029-02-13', '2030-02-03'] },
      { name: '端午节', dates: ['2024-06-10', '2025-05-31', '2026-06-19', '2027-06-09', '2028-05-28', '2029-06-16', '2030-06-05'] },
      { name: '七夕节', dates: ['2024-08-10', '2025-08-29', '2026-08-19', '2027-08-08', '2028-08-26', '2029-08-16', '2030-08-05'] },
      { name: '中秋节', dates: ['2024-09-17', '2025-10-06', '2026-09-25', '2027-09-15', '2028-10-03', '2029-09-22', '2030-09-12'] }
    ];
    // 公历固定节日
    const solar = [
      { name: '元旦', m: 1, d: 1 },
      { name: '情人节', m: 2, d: 14 },
      { name: '劳动节', m: 5, d: 1 },
      { name: '国庆节', m: 10, d: 1 },
      { name: '圣诞节', m: 12, d: 25 }
    ];
    const now = new Date();
    const today = toDay(now);
    const year = today.getFullYear();
    let best = null;
    const consider = (name, dateObj) => {
      const diff = Math.round((dateObj.getTime() - today.getTime()) / 86400000);
      if (diff >= 0 && (!best || diff < best.days)) best = { name, days: diff };
    };
    solar.forEach((f) => consider(f.name, new Date(year, f.m - 1, f.d)));
    // 兜底：下一年元旦，保证永远有结果
    consider('元旦', new Date(year + 1, 0, 1));
    lunar.forEach((f) => {
      const hit = f.dates.find((s) => s.indexOf(String(year)) === 0);
      if (hit) consider(f.name, toDay(new Date(hit.replace(/-/g, '/'))));
      const next = f.dates.find((s) => s.indexOf(String(year + 1)) === 0);
      if (next) consider(f.name, toDay(new Date(next.replace(/-/g, '/'))));
    });
    return best;
  },

  // ---------- 厨房名称 ----------
  getKitchenName() {
    const user = this.globalData.user || {};
    return (user.kitchenName && String(user.kitchenName).trim()) || '';
  },

  async setKitchenName(name) {
    const value = String(name || '').trim().slice(0, 12);
    const res = await this.callCloud('user', { action: 'setKitchenName', name: value });
    if (res && res.ok && this.globalData.user) {
      this.globalData.user.kitchenName = value;
      return value;
    }
    return value;
  },

  // ---------- 头像 ----------
  getAvatar() {
    const user = this.globalData.user || {};
    return user.avatar || '';
  },

  async setAvatar(fileID) {
    const value = String(fileID || '').trim();
    const res = await this.callCloud('user', { action: 'setAvatar', avatar: value });
    if (res && res.ok && this.globalData.user) {
      this.globalData.user.avatar = value;
      return value;
    }
    return value;
  },

  // ---------- 冰箱 ----------
  getFridgeItems() {
    const user = this.globalData.user || {};
    if (Array.isArray(user.fridgeItems)) return user.fridgeItems;
    const cached = wx.getStorageSync('lb_fridge');
    return Array.isArray(cached) ? cached : [];
  },

  async setFridgeItems(items) {
    const list = Array.isArray(items) ? items.slice(0, 200) : [];
    if (this.globalData.user) this.globalData.user.fridgeItems = list;
    wx.setStorageSync('lb_fridge', list);
    const res = await this.callCloud('user', { action: 'setFridge', items: list });
    return (res && res.ok && Array.isArray(res.fridgeItems)) ? res.fridgeItems : list;
  },

  daysTogether() {
    const anniversary = this.globalData.anniversary;
    if (!anniversary) return null;
    const start = new Date(anniversary.replace(/-/g, '/'));
    if (isNaN(start.getTime())) return null;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const days = Math.floor((today.getTime() - startDay.getTime()) / (24 * 60 * 60 * 1000));
    return days >= 0 ? days + 1 : null;
  },

  priceText(price) {
    const num = Number(price || 0);
    return num > 0 ? '¥' + num.toFixed(2) : '家常';
  },

  normalizeDish(dish) {
    return Object.assign({}, dish, {
      desc: dish.desc || dish.description || '',
      tags: Array.isArray(dish.tags) ? dish.tags : [],
      difficulty: dish.difficulty || '简单',
      time: Number(dish.time || dish.cookTime || 0),
      ingredients: Array.isArray(dish.ingredients) ? dish.ingredients : [],
      steps: Array.isArray(dish.steps) ? dish.steps : [],
      tips: dish.tips || '',
      category: dish.category || '热菜',
      cuisine: dish.cuisine || '家常菜'
    });
  },

  formatTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    const pad = (num) => String(num).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
});
