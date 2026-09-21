const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

const STATUS_TEXT = {
  pending: "待接单",
  cooking: "制作中",
  done: "已完成",
  cancelled: "已取消"
};

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const action = event.action || "list";
  const user = await getUser(openid);

  if (action === "create") {
    return createOrder(user, event);
  }
  if (action === "list") {
    return listOrders();
  }
  if (action === "accept") {
    return acceptOrder(event.id, user);
  }
  if (action === "complete") {
    return completeOrder(event.id, user, event);
  }
  if (action === "cancel") {
    return cancelOrder(event.id, user, event);
  }
  if (action === "remove") {
    return removeOrder(event.id);
  }

  return { ok: false, error: "unknown_action" };
};

async function getUser(openid) {
  try {
    const res = await db.collection("users").where({ openid }).limit(1).get();
    return res.data[0] || { openid, name: "琳宝" };
  } catch (err) {
    return { openid, name: "琳宝" };
  }
}

async function createOrder(user, event) {
  const items = (event.items || []).filter((item) => item && item.dishId && Number(item.count || 0) > 0);
  if (!items.length) {
    return { ok: false, error: "empty_items" };
  }
  const total = items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.count || 0), 0);
  const res = await db.collection("orders").add({
    data: {
      openid: user.openid,
      placedByName: user.name || "琳宝",
      items: items.map((item) => ({
        dishId: item.dishId,
        name: item.name,
        emoji: item.emoji || "",
        price: Number(item.price || 0),
        image: item.image || "",
        category: item.category || "",
        count: Number(item.count || 0)
      })),
      total: Math.round(total * 100) / 100,
      remark: String(event.remark || "").trim().slice(0, 60),
      status: "pending",
      statusText: STATUS_TEXT.pending,
      acceptedBy: "",
      acceptedByName: "",
      doneBy: "",
      doneByName: "",
      mood: "",
      mealImage: "",
      cancelReason: "",
      cancelledBy: "",
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }
  });
  return { ok: true, id: res._id };
}

async function listOrders() {
  const res = await db.collection("orders").orderBy("createTime", "desc").limit(100).get();
  return {
    ok: true,
    orders: (res.data || []).map((order) =>
      Object.assign({}, order, {
        total: Number(order.total || 0),
        statusText: STATUS_TEXT[order.status] || order.statusText || "未知"
      })
    )
  };
}

async function acceptOrder(id, user) {
  if (!id) return { ok: false, error: "missing_id" };
  const order = await getOrder(id);
  if (!order) return { ok: false, error: "not_found" };
  if (order.status !== "pending") return { ok: false, error: "wrong_status" };

  await db.collection("orders").doc(id).update({
    data: {
      status: "cooking",
      statusText: STATUS_TEXT.cooking,
      acceptedBy: user.openid,
      acceptedByName: user.name || "琳宝",
      updateTime: db.serverDate()
    }
  });
  return { ok: true };
}

async function completeOrder(id, user, event) {
  if (!id) return { ok: false, error: "missing_id" };
  const order = await getOrder(id);
  if (!order) return { ok: false, error: "not_found" };
  if (order.status !== "cooking") return { ok: false, error: "wrong_status" };

  await db.collection("orders").doc(id).update({
    data: {
      status: "done",
      statusText: STATUS_TEXT.done,
      doneBy: user.openid,
      doneByName: user.name || "琳宝",
      mood: String(event.mood || "").trim().slice(0, 20),
      mealImage: event.mealImage || "",
      updateTime: db.serverDate()
    }
  });
  return { ok: true };
}

async function cancelOrder(id, user, event) {
  if (!id) return { ok: false, error: "missing_id" };
  const order = await getOrder(id);
  if (!order) return { ok: false, error: "not_found" };
  if (order.status !== "pending") return { ok: false, error: "wrong_status" };

  const by = event.by === "chef" ? "chef" : "guest";
  await db.collection("orders").doc(id).update({
    data: {
      status: "cancelled",
      statusText: STATUS_TEXT.cancelled,
      cancelledBy: by,
      cancelReason: by === "chef" ? "厨师拒单" : "客人取消",
      updateTime: db.serverDate()
    }
  });
  return { ok: true };
}

async function removeOrder(id) {
  if (!id) return { ok: false, error: "missing_id" };
  await db.collection("orders").doc(id).remove();
  return { ok: true };
}

async function getOrder(id) {
  try {
    const res = await db.collection("orders").doc(id).get();
    return res.data || null;
  } catch (err) {
    return null;
  }
}
