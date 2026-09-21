// 琳宝私厨 · 菜品元数据同步（一次性）
// 按菜名把「图片 + 热量 + 功效 + 营养标签 + 难度 + 耗时」写回数据库中的菜品记录
// 部署后在云函数控制台运行一次即可；重复运行幂等
const cloud = require("wx-server-sdk");
const { META } = require("./meta.js");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const collection = db.collection("dishes");
const CONCURRENCY = 5;

async function updateOne(meta) {
  try {
    const res = await collection.where({ name: meta.name }).update({
      data: {
        image: meta.image,
        kcal: Number(meta.kcal) || 0,
        benefit: meta.benefit || "",
        nutritionTags: meta.nutritionTags || [],
        difficulty: meta.difficulty || "简单",
        time: Number(meta.time) || 20,
        updateTime: db.serverDate()
      }
    });
    const updatedCount = res.stats && res.stats.updated;
    if (updatedCount > 0) {
      return { name: meta.name, status: "ok" };
    }
    return { name: meta.name, status: "not_found" };
  } catch (err) {
    return { name: meta.name, status: "error", error: String((err && err.message) || err) };
  }
}

exports.main = async () => {
  const results = [];
  // 每 5 个并发跑，避免超时
  for (let i = 0; i < META.length; i += CONCURRENCY) {
    const chunk = META.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(chunk.map(updateOne));
    results.push(...chunkResults);
  }

  const updated = results.filter((r) => r.status === "ok").length;
  const missing = results.filter((r) => r.status === "not_found").length;
  const errors = results.filter((r) => r.status === "error");

  return {
    total: META.length,
    updated,
    missing,
    errors,
    missingNames: results.filter((r) => r.status === "not_found").map((r) => r.name)
  };
};
