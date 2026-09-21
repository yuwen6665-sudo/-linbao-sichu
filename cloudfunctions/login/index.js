const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async () => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  let user = null;

  try {
    const userRes = await db.collection("users").where({ openid }).limit(1).get();
    user = userRes.data[0] || null;
  } catch (err) {
    user = null;
  }

  if (!user) {
    const doc = {
      openid,
      name: "琳宝",
      nameCustomized: false,
      lastIdentity: "",
      favoriteIds: [],
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    };
    try {
      const addRes = await db.collection("users").add({ data: doc });
      user = Object.assign({}, doc, { _id: addRes._id });
    } catch (err) {
      user = Object.assign({}, doc, { _id: "" });
    }
  }

  return {
    openid,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID,
    authorized: true,
    user: {
      _id: user._id,
      openid: user.openid,
      name: user.name || "琳宝",
      lastIdentity: user.lastIdentity || "",
      favoriteIds: Array.isArray(user.favoriteIds) ? user.favoriteIds : [],
      kitchenName: user.kitchenName || "",
      avatar: user.avatar || "",
      fridgeItems: Array.isArray(user.fridgeItems) ? user.fridgeItems : [],
      role: user.role || "guest"
    }
  };
};
