const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const action = event.action || "get";

  const userRes = await db.collection("users").where({ openid }).limit(1).get();
  const user = userRes.data[0] || null;
  if (!user) {
    return { ok: false, error: "user_not_found" };
  }

  if (action === "setIdentity") {
    const identity = event.identity === "chef" || event.identity === "guest" ? event.identity : "guest";
    const updateData = { lastIdentity: identity, updatedAt: db.serverDate() };
    // 未自定义过昵称时，按身份给默认名：客人=琳宝，厨师=汶宝
    if (!user.nameCustomized) {
      updateData.name = identity === "chef" ? "汶宝" : "琳宝";
    }
    await db.collection("users").doc(user._id).update({
      data: updateData
    });
    return { ok: true, lastIdentity: identity, name: updateData.name || user.name || "琳宝" };
  }

  if (action === "setName") {
    const name = String(event.name || "").trim().slice(0, 12) || "琳宝";
    await db.collection("users").doc(user._id).update({
      data: { name, nameCustomized: true, updatedAt: db.serverDate() }
    });
    return { ok: true, name };
  }

  if (action === "setKitchenName") {
    const kitchenName = String(event.name || "").trim().slice(0, 12);
    await db.collection("users").doc(user._id).update({
      data: { kitchenName, updatedAt: db.serverDate() }
    });
    return { ok: true, kitchenName };
  }

  if (action === "setAvatar") {
    const avatar = String(event.avatar || "").trim().slice(0, 300);
    await db.collection("users").doc(user._id).update({
      data: { avatar, updatedAt: db.serverDate() }
    });
    return { ok: true, avatar };
  }

  if (action === "setFridge") {
    const fridgeItems = Array.isArray(event.items)
      ? event.items
          .filter((item) => item && item.name)
          .slice(0, 200)
          .map((item) => ({ name: String(item.name).slice(0, 20), addDate: String(item.addDate || "") }))
      : [];
    await db.collection("users").doc(user._id).update({
      data: { fridgeItems, updatedAt: db.serverDate() }
    });
    return { ok: true, fridgeItems };
  }

  if (action === "toggleFav") {
    const dishId = event.dishId;
    const favoriteIds = Array.isArray(user.favoriteIds) ? user.favoriteIds : [];
    const idx = favoriteIds.indexOf(dishId);
    if (idx >= 0) favoriteIds.splice(idx, 1);
    else favoriteIds.push(dishId);
    await db.collection("users").doc(user._id).update({
      data: { favoriteIds, updatedAt: db.serverDate() }
    });
    return { ok: true, favoriteIds, faved: idx < 0 };
  }

  if (action === "setFavs") {
    const favoriteIds = Array.isArray(event.favoriteIds) ? event.favoriteIds.slice(0, 200) : [];
    await db.collection("users").doc(user._id).update({
      data: { favoriteIds, updatedAt: db.serverDate() }
    });
    return { ok: true, favoriteIds };
  }

  return { ok: true, user };
};
