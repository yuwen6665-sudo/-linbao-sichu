const cloud = require("wx-server-sdk");
const recipesData = require("./data.js");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const collection = db.collection("dishes");
const BATCH_SIZE = 20;

const PICTURE_DISHES = [
  { name: "虾仁滑蛋吐司", price: 22, image: "/assets/dishes/shrimp-toast.png", category: "主食", popularityScore: 88, cuisine: "家常菜", emoji: "🍤" },
  { name: "豆乳燕麦杯", price: 16, image: "/assets/dishes/oat-cup.png", category: "甜品饮品", popularityScore: 72, cuisine: "甜点", emoji: "🥛" },
  { name: "牛油果鸡蛋贝果", price: 28, image: "/assets/dishes/bagel.png", category: "主食", popularityScore: 66, cuisine: "西餐", emoji: "🥯" },
  { name: "番茄牛腩饭", price: 36, image: "/assets/dishes/beef-rice.png", category: "主食", popularityScore: 96, cuisine: "家常菜", emoji: "🍅" },
  { name: "照烧鸡腿饭", price: 32, image: "/assets/dishes/chicken-rice.png", category: "主食", popularityScore: 91, cuisine: "家常菜", emoji: "🍗" },
  { name: "鲜虾云吞面", price: 30, image: "/assets/dishes/wonton-noodle.png", category: "主食", popularityScore: 77, cuisine: "粤菜", emoji: "🍜" },
  { name: "芝士牛肉汉堡", price: 42, image: "/assets/dishes/burger.png", category: "主食", popularityScore: 82, cuisine: "西餐", emoji: "🍔" },
  { name: "蒜香黄油意面", price: 38, image: "/assets/dishes/pasta.png", category: "主食", popularityScore: 89, cuisine: "西餐", emoji: "🍝" },
  { name: "寿喜烧双人锅", price: 88, image: "/assets/dishes/sukiyaki.png", category: "热菜", popularityScore: 98, cuisine: "家常菜", emoji: "🍲" },
  { name: "脆皮炸鸡拼盘", price: 48, image: "/assets/dishes/fried-chicken.png", category: "小吃", popularityScore: 93, cuisine: "家常菜", emoji: "🍗" },
  { name: "热辣小龙虾", price: 68, image: "/assets/dishes/crayfish.png", category: "热菜", popularityScore: 85, cuisine: "湘菜", emoji: "🦞" },
  { name: "草莓奶油松饼", price: 26, image: "/assets/dishes/pancake.png", category: "甜品饮品", popularityScore: 70, cuisine: "甜点", emoji: "🍓" }
];

exports.main = async () => {
  // 1) 一次查出所有已存在的菜名（只取 name 字段）
  const existRes = await collection.field({ name: true }).limit(1000).get();
  const existNames = new Set((existRes.data || []).map((item) => item.name));

  // 2) 组装目标菜品：带图菜品 + 内置菜谱
  const targets = [];
  PICTURE_DISHES.forEach((dish) => {
    targets.push(
      Object.assign({}, dish, {
        difficulty: "简单",
        time: 20,
        desc: "",
        tags: [],
        ingredients: [],
        steps: [],
        tips: "",
        price: Number(dish.price || 0)
      })
    );
  });
  (recipesData.RECIPES || []).forEach((r) => {
    targets.push({
      name: r.name,
      emoji: r.emoji || "🍳",
      cuisine: r.cuisine || "家常菜",
      category: r.category || "荤菜",
      difficulty: r.difficulty || "简单",
      time: Number(r.time || 0) || 20,
      desc: r.desc || "",
      price: 0,
      image: "",
      tags: r.tags || [],
      ingredients: r.ingredients || [],
      steps: r.steps || [],
      tips: r.tips || "",
      popularityScore: 80
    });
  });

  // 3) 去重并收集待插入
  const seen = new Set();
  const toAdd = [];
  let skipped = 0;
  targets.forEach((dish) => {
    const key = dish.name;
    if (existNames.has(key) || seen.has(key)) {
      skipped += 1;
      return;
    }
    seen.add(key);
    toAdd.push(
      Object.assign({}, dish, {
        _createdAt: Date.now(),
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      })
    );
  });

  // 4) 分批批量写入（每批 20 条）
  let added = 0;
  for (let i = 0; i < toAdd.length; i += BATCH_SIZE) {
    const batch = toAdd.slice(i, i + BATCH_SIZE);
    await collection.add({ data: batch });
    added += batch.length;
  }

  return {
    total: targets.length,
    added,
    skipped
  };
};
