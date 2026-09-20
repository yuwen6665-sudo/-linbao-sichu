// 云函数：情侣绑定
//
// 【2026-09-19 重做】以前的设计有个大毛病：生成邀请码的时候就把人塞进 couples 了，
// 于是「刚生成码」和「已经绑上」在数据上分不出来，前端一看 couple 有值就显示成已绑定。
// 现在改成：
//
//   1. 生成邀请码 ≠ 已绑定。生成只是拿到一个码，谁都不绑。
//   2. 邀请码唯一，而且只能用一次；用过立刻作废。
//   3. 必须双方都确认（一方给码、一方输码）才真的建立 couple。
//   4. 解绑后邀请码作废，想再绑要重新生成。
//
// 数据落在哪：
//   users.inviteCode  —— 我生成、等别人来用的码（绑定成功 / 解绑后清空）
//   couples           —— 只有真的绑上了才创建，members 恒为 2 人
//
// action：createInvite / acceptInvite / unbind / info / setAnniversary

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

// 生成 6 位邀请码（去掉容易看错的 0/O/1/I）
function makeInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

async function getUserByOpenid(openid) {
  const res = await db.collection('users').where({ _openid: openid }).get()
  return res.data.length > 0 ? res.data[0] : null
}

// 这个码有没有被别人占着（users 和 couples 都查一遍，保证唯一）
async function isCodeTaken(code) {
  const u = await db.collection('users').where({ inviteCode: code }).get()
  if (u.data.length > 0) return true
  const c = await db.collection('couples').where({ inviteCode: code }).get()
  return c.data.length > 0
}

async function newUniqueCode() {
  for (let i = 0; i < 20; i++) {
    const code = makeInviteCode()
    if (!(await isCodeTaken(code))) return code
  }
  return null
}

// 取「真的绑上了」的 couple —— 必须满 2 人才算
async function getBoundCouple(coupleId) {
  if (!coupleId) return null
  try {
    const res = await db.collection('couples').doc(coupleId).get()
    const c = res.data
    if (c && c.status === 'active' && (c.members || []).length >= 2) return c
  } catch (e) {
    // 文档不存在会抛错，当作没绑
  }
  return null
}

// 清掉「只有自己一个人」的废弃 couple（旧版本留下的脏数据）
async function dropLonelyCouple(user) {
  if (!user || !user.coupleId) return
  try {
    const res = await db.collection('couples').doc(user.coupleId).get()
    const c = res.data
    if (c && (c.members || []).length < 2) {
      await db.collection('couples').doc(user.coupleId).remove()
      await db.collection('users').doc(user._id).update({ data: { coupleId: null } })
    }
  } catch (e) {
    // 查不到这条 couple，顺手把用户身上的引用清干净
    await db.collection('users').doc(user._id).update({ data: { coupleId: null } })
  }
}

/**
 * 把云存储的 fileID 换成临时链接。
 *
 * 为什么要这么绕：头像存在云存储里，fileID 是 cloud:// 开头的。
 * 如果存储权限是「仅创建者可读」，那对方就看不到我的头像 —— 白圆圈一个。
 * 云函数有管理员权限，由它统一换成临时链接（约 2 小时有效），谁都看得到。
 * 页面每次进来都会重新拉，所以不怕过期。
 */
async function toTempUrls(fileIDs) {
  const ids = (fileIDs || []).filter(function (id) {
    return id && id.indexOf('cloud://') === 0
  })
  if (ids.length === 0) return {}

  try {
    const res = await cloud.getTempFileURL({ fileList: ids })
    const map = {}
    ;(res.fileList || []).forEach(function (f) {
      if (f.tempFileURL) map[f.fileID] = f.tempFileURL
    })
    return map
  } catch (e) {
    console.error('换临时链接失败', e)
    return {}
  }
}

// 把 couple 文档整理成前端好用的样子
async function buildCoupleView(couple) {
  if (!couple) return null

  const members = []
  for (const m of couple.members) {
    const u = await getUserByOpenid(m.openid)
    members.push({
      openid: m.openid,
      role: m.role,
      nickName: (u && u.nickName) || '',
      avatarUrl: (u && u.avatarUrl) || ''
    })
  }

  // 头像统一换成临时链接，免得因为存储权限对方看不到
  const urlMap = await toTempUrls(members.map(function (m) { return m.avatarUrl }))
  members.forEach(function (m) {
    if (urlMap[m.avatarUrl]) m.avatarUrl = urlMap[m.avatarUrl]
  })

  return {
    _id: couple._id,
    anniversary: couple.anniversary || '',
    createTime: couple.createTime,
    members: members
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const action = event.action

  if (!openid) return { success: false, error: '拿不到用户身份' }

  try {
    const user = await getUserByOpenid(openid)
    if (!user) return { success: false, error: '用户不存在，退出小程序重进一次' }

    const bound = await getBoundCouple(user.coupleId)

    /* ---------- 生成邀请码 ---------- */
    if (action === 'createInvite') {
      if (bound) return { success: false, error: '你已经绑定对象了' }

      // 旧版本留下的单人 couple 清掉
      await dropLonelyCouple(user)

      // 已经有码就直接还给他，不重复生成（免得码变来变去）
      if (user.inviteCode) {
        return { success: true, inviteCode: user.inviteCode, reused: true }
      }

      const code = await newUniqueCode()
      if (!code) return { success: false, error: '邀请码生成失败，再点一次' }

      await db.collection('users').doc(user._id).update({ data: { inviteCode: code } })
      return { success: true, inviteCode: code, reused: false }
    }

    /* ---------- 接受邀请 ---------- */
    if (action === 'acceptInvite') {
      const code = (event.inviteCode || '').trim().toUpperCase()
      if (!code) return { success: false, error: '邀请码是空的' }
      if (bound) return { success: false, error: '你已经绑定对象了，要先解绑' }

      // 按码找人。
      // ⚠️ 要查两处：users 是新版的存法，couples 是旧版（生成码时就建 couple）的存法。
      //    只查 users 的话，对象的码要是「重做绑定逻辑之前」生成的，就会误报「码不对」。
      let owner = null
      const ownerRes = await db.collection('users').where({ inviteCode: code }).get()
      if (ownerRes.data.length > 0) {
        owner = ownerRes.data[0]
      } else {
        const legacyRes = await db.collection('couples').where({ inviteCode: code }).get()
        for (const c of legacyRes.data) {
          // 旧版生成码时建的那条 couple 只有自己一个人 —— 用它反推是谁的码
          if ((c.members || []).length === 1) {
            const u = await getUserByOpenid(c.members[0].openid)
            if (u && !u.inviteCode) {
              await db.collection('users').doc(u._id).update({ data: { inviteCode: code } })
              owner = Object.assign({}, u, { inviteCode: code })
              break
            }
          }
        }
      }

      if (!owner) {
        return { success: false, error: '这个邀请码不对，或者已经被用过了' }
      }
      if (owner._openid === openid) {
        return { success: false, error: '这是你自己生成的邀请码' }
      }

      // 对方是不是已经有对象了
      const ownerBound = await getBoundCouple(owner.coupleId)
      if (ownerBound) {
        return {
          success: false,
          error: 'TA 已经有对象了。让 TA 在 TA 手机上的「我的」页点「解除绑定」，之后你再来绑'
        }
      }

      // 双方各自的废弃单人 couple 都清掉
      await dropLonelyCouple(owner)
      await dropLonelyCouple(user)

      // 角色：出码方保持自己的身份，用码的那个自动取反
      const hostRole = owner.role || 'chef'
      const myRole = hostRole === 'chef' ? 'foodie' : 'chef'

      const coupleData = {
        inviteCode: null,          // 用掉了就作废
        members: [
          { openid: owner._openid, role: hostRole },
          { openid: openid, role: myRole }
        ],
        anniversary: '',
        createTime: new Date(),
        status: 'active'
      }
      const addRes = await db.collection('couples').add({ data: coupleData })

      await db.collection('users').doc(owner._id).update({
        data: { coupleId: addRes._id, inviteCode: null }
      })
      await db.collection('users').doc(user._id).update({
        data: { coupleId: addRes._id, inviteCode: null, role: myRole }
      })

      const fresh = await db.collection('couples').doc(addRes._id).get()
      return {
        success: true,
        coupleId: addRes._id,
        role: myRole,
        couple: await buildCoupleView(fresh.data)
      }
    }

    /* ---------- 查看绑定信息 ---------- */
    if (action === 'info') {
      if (bound) {
        // ⚠️ 身份以 couple 里记的为准，不要读 users.role。
        //    页面显示的角色本来就读 couple.members —— 两处不同源迟早对不上。
        const me = (bound.members || []).find(function (m) { return m.openid === openid })
        return {
          success: true,
          couple: await buildCoupleView(bound),
          pendingInvite: '',
          role: (me && me.role) || user.role
        }
      }

      // 还没真的绑上。看看有没有生成过邀请码
      let pending = user.inviteCode || ''

      // 兼容旧数据：老版本把码存在那条单人 couple 上
      if (!pending && user.coupleId) {
        try {
          const old = await db.collection('couples').doc(user.coupleId).get()
          if (old.data && old.data.inviteCode) {
            pending = old.data.inviteCode
            await db.collection('users').doc(user._id).update({ data: { inviteCode: pending } })
          }
        } catch (e) {}
      }

      return {
        success: true,
        couple: null,
        pendingInvite: pending,
        role: user.role
      }
    }

    /* ---------- 设置纪念日 ---------- */
    if (action === 'setAnniversary') {
      if (!bound) return { success: false, error: '先绑定对象再设纪念日' }
      const anniversary = event.anniversary || ''
      if (anniversary && !/^\d{4}-\d{2}-\d{2}$/.test(anniversary)) {
        return { success: false, error: '日期格式要写成 2024-05-20' }
      }
      await db.collection('couples').doc(bound._id).update({
        data: { anniversary: anniversary }
      })
      return { success: true, anniversary: anniversary }
    }

    /* ---------- 解绑 ---------- */
    if (action === 'unbind') {
      if (!bound) {
        // 本来就没绑上，但可能有脏数据，顺手收拾干净
        await dropLonelyCouple(user)
        await db.collection('users').doc(user._id).update({ data: { inviteCode: null } })
        return { success: true }
      }

      // 双方都清掉 coupleId 和邀请码
      await db.collection('users').where({ coupleId: bound._id }).update({
        data: { coupleId: null, inviteCode: null }
      })
      await db.collection('couples').doc(bound._id).update({
        data: { status: 'inactive', inviteCode: null }
      })

      return { success: true }
    }

    return { success: false, error: '不知道要干什么：' + action }
  } catch (err) {
    console.error('绑定失败', err)
    return { success: false, error: err.errMsg || err.message || String(err) }
  }
}
