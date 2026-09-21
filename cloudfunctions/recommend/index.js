const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async () => {
  const dishRes = await db.collection("dishes").limit(200).get();
  const orderRes = await db
    .collection("orders")
    .where({ status: "done" })
    .orderBy("createTime", "desc")
    .limit(100)
    .get()
    .catch(() => ({ data: [] }));
  const dishes = applyHistoryWeight(dishRes.data || [], orderRes.data || []);
  return {
    dishes: weightedPick(dishes, 3)
  };
};

function applyHistoryWeight(dishes, orders) {
  const now = Date.now();
  const history = {};
  orders.forEach((order) => {
    const time = new Date(order.createTime).getTime();
    (order.items || []).forEach((item) => {
      const key = item.dishId || item.name;
      if (!history[key]) {
        history[key] = { count: 0, lastTime: 0 };
      }
      history[key].count += Number(item.count || 1);
      history[key].lastTime = Math.max(history[key].lastTime, time || 0);
    });
  });

  return dishes.map((dish) => {
    const key = dish._id || dish.name;
    const itemHistory = history[key] || history[dish.name];
    let score = Number(dish.popularityScore || 1);
    if (!itemHistory) {
      score *= 1.25;
    } else {
      const daysSince = itemHistory.lastTime ? (now - itemHistory.lastTime) / (24 * 60 * 60 * 1000) : 30;
      if (daysSince <= 3) score *= 0.35;
      else if (daysSince <= 7) score *= 0.65;
      else if (daysSince >= 21) score *= 1.2;
      score *= Math.max(0.55, 1 - itemHistory.count * 0.04);
    }
    return Object.assign({}, dish, {
      recommendationScore: Math.max(1, Math.round(score))
    });
  });
}

function weightedPick(list, count) {
  const pool = list.slice();
  const result = [];

  while (pool.length && result.length < count) {
    const total = pool.reduce((sum, item) => sum + Number(item.recommendationScore || item.popularityScore || 1), 0);
    let cursor = Math.random() * total;
    let selectedIndex = 0;

    for (let i = 0; i < pool.length; i += 1) {
      cursor -= Number(pool[i].recommendationScore || pool[i].popularityScore || 1);
      if (cursor <= 0) {
        selectedIndex = i;
        break;
      }
    }

    result.push(pool.splice(selectedIndex, 1)[0]);
  }

  return result;
}
