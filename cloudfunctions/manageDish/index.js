const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const collection = db.collection("dishes");

exports.main = async (event = {}) => {
  const action = event.action || "list";

  if (action === "add") {
    return addDish(event.dish || {});
  }
  if (action === "update") {
    return updateDish(event.id, event.dish || {});
  }
  if (action === "delete") {
    return deleteDish(event.id);
  }

  return listDishes();
};

async function listDishes() {
  const res = await collection.orderBy("popularityScore", "desc").limit(200).get();
  return {
    dishes: (res.data || []).map((d) => Object.assign({ _id: d._id }, normalizeDish(d)))
  };
}

async function addDish(dish) {
  const data = normalizeDish(dish);
  const res = await collection.add({
    data: Object.assign({}, data, {
      _createdAt: Date.now(),
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    })
  });
  return { ok: true, id: res._id };
}

async function updateDish(id, dish) {
  if (!id) throw new Error("missing dish id");
  await collection.doc(id).update({
    data: Object.assign({}, normalizeDish(dish), {
      updateTime: db.serverDate()
    })
  });
  return { ok: true, id };
}

async function deleteDish(id) {
  if (!id) throw new Error("missing dish id");
  await collection.doc(id).remove();
  return { ok: true, id };
}

function normalizeDish(dish) {
  return {
    name: String(dish.name || "").trim(),
    emoji: String(dish.emoji || "🍳").slice(0, 8),
    cuisine: dish.cuisine || "家常菜",
    category: normalizeCategory(dish.category),
    difficulty: dish.difficulty || "简单",
    time: Number(dish.time || 0) || 0,
    desc: String(dish.desc || "").trim(),
    price: Number(dish.price || 0),
    image: dish.image || "",
    tags: normalizeTags(dish.tags),
    ingredients: normalizeIngredients(dish.ingredients),
    steps: normalizeSteps(dish.steps),
    tips: String(dish.tips || "").trim(),
    popularityScore: Number(dish.popularityScore || 80)
  };
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return tags.map((item) => String(item).trim()).filter(Boolean).slice(0, 12);
  }
  return String(tags || "").split(/[、,，\s]+/).map((item) => item.trim()).filter(Boolean).slice(0, 12);
}

function normalizeIngredients(ingredients) {
  if (!Array.isArray(ingredients)) return [];
  return ingredients
    .map((item) => {
      if (typeof item === "string") {
        return { name: String(item).trim(), amount: "适量" };
      }
      return {
        name: String(item.name || "").trim(),
        amount: String(item.amount || "").trim() || "适量"
      };
    })
    .filter((item) => item.name)
    .slice(0, 30);
}

function normalizeSteps(steps) {
  if (!Array.isArray(steps)) return [];
  return steps.map((s) => String(s).trim()).filter(Boolean).slice(0, 30);
}

function normalizeCategory(category) {
  const map = {
    "早餐": "主食",
    "午餐": "主食",
    "晚餐": "热菜",
    "夜宵": "小吃",
    "荤菜": "荤菜",
    "素菜": "素菜",
    "汤品": "汤品",
    "凉菜": "凉菜",
    "甜品饮品": "甜品饮品",
    "甜点": "甜品饮品",
    "小吃": "小吃",
    "热菜": "热菜",
    "主食": "主食"
  };
  return map[category] || category || "热菜";
}
