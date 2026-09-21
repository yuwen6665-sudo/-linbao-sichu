const app = getApp();

Page({
  data: {
    mealCount: 0,
    monthCount: 0,
    kindCount: 0,
    monthTopName: '暂无',
    lastMealText: '暂无记录',
    topDishes: [],
    trend: [],
    lineSegments: []
  },

  async onLoad() {
    await app.ensureAuth();
    this.loadStats();
  },

  async loadStats() {
    wx.showLoading({ title: '生成看板' });
    try {
      const res = await app.callCloud('order', { action: 'list' });
      const allOrders = (res && res.orders) || [];
      const orders = allOrders.filter((order) => order.status === 'done');
      const mealCount = orders.length;
      const monthStats = this.calcMonthStats(orders);
      const trend = this.calcTrend(orders);
      this.setData({
        mealCount,
        monthCount: monthStats.count,
        kindCount: this.calcKinds(orders),
        monthTopName: monthStats.topName,
        lastMealText: this.calcLastMealText(orders),
        topDishes: this.calcTopDishes(orders),
        trend,
        lineSegments: this.calcLineSegments(trend)
      });
    } finally {
      wx.hideLoading();
    }
  },

  calcKinds(orders) {
    const set = new Set();
    orders.forEach((order) => {
      (order.items || []).forEach((item) => {
        if (item.name) set.add(item.name);
      });
    });
    return set.size;
  },

  calcMonthStats(orders) {
    const now = new Date();
    const monthOrders = orders.filter((order) => {
      const date = new Date(order.createTime);
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    });
    const top = this.calcTopDishes(monthOrders)[0];
    return {
      count: monthOrders.length,
      topName: top ? top.name : '暂无'
    };
  },

  calcLastMealText(orders) {
    if (!orders.length) return '暂无记录';
    const sorted = orders.slice().sort((a, b) => new Date(b.createTime).getTime() - new Date(a.createTime).getTime());
    const date = new Date(sorted[0].createTime);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  },

  calcTopDishes(orders) {
    const map = {};
    orders.forEach((order) => {
      (order.items || []).forEach((item) => {
        map[item.name] = (map[item.name] || 0) + Number(item.count || 0);
      });
    });
    const sorted = Object.keys(map)
      .map((name) => ({ name, count: map[name] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    const max = sorted[0] ? sorted[0].count : 1;
    return sorted.map((item) =>
      Object.assign({}, item, {
        percent: Math.max(18, Math.round((item.count / max) * 100))
      })
    );
  },

  calcTrend(orders) {
    const chart = { width: 590, height: 240, padX: 28, padTop: 48, padBottom: 36 };
    const days = [];
    const pad = (num) => String(num).padStart(2, '0');
    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
      days.push({
        key,
        label: `${date.getMonth() + 1}/${date.getDate()}`,
        count: 0
      });
    }
    orders.forEach((order) => {
      const date = new Date(order.createTime);
      const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
      const target = days.find((item) => item.key === key);
      if (target) target.count += 1;
    });
    const max = Math.max(1, ...days.map((item) => item.count));
    const usableWidth = chart.width - chart.padX * 2;
    const usableHeight = chart.height - chart.padTop - chart.padBottom;
    return days.map((item, index) =>
      Object.assign({}, item, {
        x: Math.round(chart.padX + (index / 6) * usableWidth),
        y: Math.round(chart.padTop + (1 - item.count / max) * usableHeight)
      })
    );
  },

  calcLineSegments(points) {
    const segments = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      const start = points[i];
      const end = points[i + 1];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      segments.push({
        key: `${start.label}-${end.label}`,
        left: start.x,
        top: start.y,
        width: Math.round(Math.sqrt(dx * dx + dy * dy)),
        angle: (Math.atan2(dy, dx) * 180) / Math.PI
      });
    }
    return segments;
  },

  goOrders() {
    wx.switchTab({ url: '/pages/orders/orders' });
  }
});
