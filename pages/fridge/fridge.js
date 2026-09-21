const app = getApp();

// 食材保质期映射（按关键词），单位：天
function shelfDays(name) {
  const n = String(name || '');
  if (/(肉|鱼|虾|鸡|鸭|牛|羊|排骨|培根|火腿|腊)/.test(n)) return 3;
  if (/(蛋)/.test(n)) return 15;
  if (/(奶|酸奶)/.test(n)) return 7;
  if (/(菜|瓜|茄|豆|葱|姜|蒜|椒|菇|笋|萝卜|芹|苗|叶)/.test(n)) return 5;
  if (/(米|面|粉|糖|盐|酱|醋|油|干货|木耳|香菇)/.test(n)) return 30;
  return 7;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

Page({
  data: {
    pool: [],
    fridge: [],
    selectedMap: {},
    list: [],
    selectedCount: 0,
    loading: true
  },

  async onLoad() {
    await app.ensureAuth();
    const res = await app.callCloud('manageDish', { action: 'list' });
    this.allDishes = ((res && res.dishes) || []).map((d) => app.normalizeDish(d));
    this.buildPool();
    this.setData({ loading: false });
    this.refreshFridge();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
    this.refreshFridge();
  },

  // 食材池：从菜品食材清单汇总去重
  buildPool() {
    const set = new Set();
    (this.allDishes || []).forEach((d) => {
      const ings = Array.isArray(d.ingredients) && d.ingredients.length ? d.ingredients : (d.tags || []);
      ings.forEach((ing) => {
        const name = typeof ing === 'string' ? ing : (ing.name || '');
        if (name && name.length <= 6) set.add(name);
      });
    });
    this.setData({ pool: [...set] });
  },

  // 刷新冰箱列表（含临期状态）
  refreshFridge() {
    const items = app.getFridgeItems() || [];
    const today = new Date(todayStr().replace(/-/g, '/'));
    const fridge = items.map((item) => {
      const start = new Date(String(item.addDate || '').replace(/-/g, '/'));
      const used = isNaN(start.getTime()) ? 0 : Math.floor((today.getTime() - start.getTime()) / 86400000);
      const total = shelfDays(item.name);
      const left = total - used;
      let status = 'fresh';
      let statusText = `剩 ${left} 天`;
      if (left <= 0) {
        status = 'expired';
        statusText = '过期啦 🥀';
      } else if (left <= 1) {
        status = 'soon';
        statusText = '今天吃完 ⏰';
      } else if (left <= 2) {
        status = 'soon';
        statusText = `剩 ${left} 天`;
      }
      return Object.assign({}, item, { left, status, statusText });
    });
    this.fridgeNames = new Set(fridge.map((f) => f.name));
    const selectedMap = {};
    this.fridgeNames.forEach((n) => {
      selectedMap[n] = true;
    });
    this.setData({ fridge, selectedMap });
    this.compute();
  },

  // 加入/移出冰箱
  async toggleIng(e) {
    const name = e.currentTarget.dataset.ing;
    if (!name) return;
    let items = (app.getFridgeItems() || []).slice();
    const idx = items.findIndex((item) => item.name === name);
    if (idx >= 0) {
      items.splice(idx, 1);
      wx.showToast({ title: `${name} 已拿出冰箱`, icon: 'none' });
    } else {
      items.push({ name, addDate: todayStr() });
      wx.showToast({ title: `${name} 放入冰箱 ❄️`, icon: 'none' });
    }
    await app.setFridgeItems(items);
    this.refreshFridge();
  },

  async clearAll() {
    if (!this.fridgeNames || !this.fridgeNames.size) return;
    wx.showModal({
      title: '清空冰箱',
      content: '确定把冰箱里的食材全部清空吗？',
      confirmText: '清空',
      confirmColor: '#E57373',
      success: async (res) => {
        if (!res.confirm) return;
        await app.setFridgeItems([]);
        this.refreshFridge();
        wx.showToast({ title: '冰箱清空啦', icon: 'none' });
      }
    });
  },

  // 智能组菜：按冰箱食材匹配
  compute() {
    const names = this.fridgeNames || new Set();
    let list = [];
    if (names.size > 0) {
      list = (this.allDishes || [])
        .map((d) => {
          const ings = Array.isArray(d.ingredients) && d.ingredients.length ? d.ingredients : (d.tags || []);
          const match = ings.filter((ing) => {
            const n = typeof ing === 'string' ? ing : (ing.name || '');
            return names.has(n);
          }).length;
          return Object.assign({}, d, {
            _match: match,
            _inCart: this.inCart(d._id),
            _fav: app.isFav(d._id)
          });
        })
        .filter((d) => d._match > 0)
        .sort((a, b) => b._match - a._match);
    }
    this.setData({ selectedCount: names.size, list });
  },

  inCart(id) {
    return (app.getCart() || []).some((item) => item._id === id);
  },

  async onAdd(e) {
    try {
      const id = e.detail.id;
      const dish = (this.allDishes || []).find((d) => d._id === id);
      if (!dish) return;
      const before = this.inCart(id);
      app.addToCart(dish);
      wx.showToast({ title: before ? '已从清单移除' : '加好啦 ❤', icon: 'none' });
      setTimeout(() => this.compute(), 300);
    } catch (err) {
      console.error('onAdd error', err);
      wx.showModal({ title: '加菜出错', content: String((err && err.message) || err), showCancel: false });
    }
  },

  async onFav(e) {
    const id = e.detail.id;
    const faved = await app.toggleFav(id);
    wx.showToast({ title: faved ? '已收藏 ❤' : '已取消收藏', icon: 'none' });
    this.compute();
  },

  onDetail(e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.detail.id });
  }
});
