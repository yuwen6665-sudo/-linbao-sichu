const app = getApp();

Page({
  data: {
    memories: [],
    total: 0,
    loading: true
  },

  async onLoad() {
    await app.ensureAuth();
    await this.loadMemories();
  },

  async loadMemories() {
    const res = await app.callCloud('order', { action: 'list' });
    const orders = ((res && res.orders) || [])
      .filter((order) => order.status === 'done')
      .map((order) => this.normalize(order));
    this.setData({
      memories: orders,
      total: orders.length,
      loading: false
    });
  },

  normalize(order) {
    const items = (order.items || []).map((item) =>
      Object.assign({}, item, { image: item.image || '' })
    );
    const names = items.map((item) => item.name).join('、');
    const date = new Date(order.createTime);
    const pad = (n) => String(n).padStart(2, '0');
    return Object.assign({}, order, {
      items,
      names,
      dateText: `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`,
      monthText: `${date.getFullYear()}年${date.getMonth() + 1}月`,
      coverImage: order.mealImage || (items[0] && items[0].image) || '',
      coverEmoji: (items[0] && (items[0].emoji || '🍳')) || '🍳',
      moodText: order.mood || '干饭快乐 🍚',
      doneByName: order.doneByName || '汶宝',
      placedByName: order.placedByName || '琳宝'
    });
  },

  goOrders() {
    wx.switchTab({ url: '/pages/orders/orders' });
  }
});
