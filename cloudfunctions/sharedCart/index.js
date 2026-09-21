const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const CART_COLLECTION = "sharedCarts";
const CART_ID = "current";

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const user = await getUser(openid);

  const action = event.action || "get";
  if (action === "add") {
    return updateCart(openid, user, (items) => addItem(items, event.dish));
  }
  if (action === "update") {
    return updateCart(openid, user, (items) => updateItem(items, event.id, Number(event.delta || 0)));
  }
  if (action === "remove") {
    return updateCart(openid, user, (items) => items.filter((item) => item._id !== event.id));
  }
  if (action === "clear") {
    return saveCart([], openid, user);
  }
  if (action === "replace") {
    return saveCart(normalizeItems(event.items || []), openid, user);
  }

  const cart = await getCart();
  return {
    authorized: true,
    items: cart.items,
    updatedBy: cart.updatedBy,
    updateTime: cart.updateTime
  };
};

async function getUser(openid) {
  try {
    const res = await db.collection("users").where({ openid }).limit(1).get();
    return res.data[0] || { openid, name: "琳宝" };
  } catch (err) {
    return { openid, name: "琳宝" };
  }
}

async function getCart() {
  try {
    const res = await db.collection(CART_COLLECTION).doc(CART_ID).get();
    return {
      items: res.data.items || [],
      updatedBy: res.data.updatedBy || "",
      updateTime: res.data.updateTime || null
    };
  } catch (err) {
    return { items: [], updatedBy: "", updateTime: null };
  }
}

async function updateCart(openid, user, updater) {
  const cart = await getCart();
  const items = updater(cart.items || []);
  return saveCart(items, openid, user);
}

async function saveCart(items, openid, user) {
  await db.collection(CART_COLLECTION).doc(CART_ID).set({
    data: {
      items,
      updatedBy: user.name || openid,
      updatedByOpenid: openid,
      updateTime: db.serverDate()
    }
  });
  return {
    authorized: true,
    items,
    updatedBy: user.name || openid
  };
}

function addItem(items, dish = {}) {
  if (!dish._id) return items;
  const next = items.slice();
  const index = next.findIndex((item) => item._id === dish._id);
  if (index >= 0) {
    next[index].count += 1;
  } else {
    next.push({
      _id: dish._id,
      name: dish.name,
      emoji: dish.emoji || "",
      price: Number(dish.price || 0),
      image: dish.image,
      category: dish.category,
      description: dish.desc || dish.description || "",
      tags: dish.tags || [],
      difficulty: dish.difficulty || "",
      time: Number(dish.time || 0),
      addedByOpenid: dish.addedByOpenid || "",
      addedByName: dish.addedByName || "",
      count: 1
    });
  }
  return next;
}

function updateItem(items, id, delta) {
  return items
    .map((item) => {
      if (item._id === id) {
        return Object.assign({}, item, {
          count: Math.max(0, Number(item.count || 0) + delta)
        });
      }
      return item;
    })
    .filter((item) => item.count > 0);
}

function normalizeItems(items) {
  return items
    .filter((item) => item && item._id && Number(item.count || 0) > 0)
    .map((item) => ({
      _id: item._id,
      name: item.name,
      emoji: item.emoji || "",
      price: Number(item.price || 0),
      image: item.image,
      category: item.category,
      description: item.description || "",
      tags: item.tags || [],
      difficulty: item.difficulty || "",
      time: Number(item.time || 0),
      addedByOpenid: item.addedByOpenid || "",
      addedByName: item.addedByName || "",
      count: Number(item.count || 0)
    }));
}
