/******************************************
 * @name 慧幸福定时下单
 * @author CarryDream
 * @update 2025-06-01
 * @version 2.1.0
 * @description 抓取商品列表 -> 获取默认地址 -> 积分下单
 ******************************************
 */

/*
[task_local]
0 9 * * * https://raw.githubusercontent.com/CarryDream/Sub/refs/heads/main/Tasks/xiangerxue_order.js?id=17&num=1, tag=慧幸福定时下单, img-url=https://icon.uiboy.com/icons/1607434573_preview.png, enabled=true
#
# 可选参数：
# id=17                指定商品ID（优先级最高，正式下单时跳过列表请求）
# keyword=冬季套装      按商品名/副标题关键字匹配
# num=1                下单数量
# page=1               商品列表页码
# size=10              商品列表每页数量
# order=               商品列表排序参数（可留空）
# pay_type=score       支付类型，默认 score
# remark=              订单备注
# address_id=          指定地址ID（跳过地址请求，进一步加速）
# dry_run=0            1=仅查询不下单(输出完整信息供配置)，0=真实下单
# allow_zero_stock=0   1=库存为0也允许尝试下单，0=默认跳过库存0
# run_minutes=5        重试执行时长（分钟），默认5
# retry_min_ms=200     重试最小间隔毫秒，默认200
# retry_max_ms=500     重试最大间隔毫秒，默认500
# req_timeout=5000     单次请求超时毫秒，默认5000
#
# ===== 使用步骤 =====
# 第一步：dry_run 查询信息
# ?dry_run=1
# 控制台会输出所有商品和地址信息，以及推荐配置参数
#
# 第二步：复制推荐配置，正式下单
# ?id=xxx&address_id=xxx&num=1&retry_min_ms=150&retry_max_ms=300
#
# 旧版秒级参数兼容：
# retry_min_sec / retry_max_sec 仍可使用，会自动转换为毫秒

[rewrite_local]
^https:\/\/yidian\.xiangerxue\.cn\/api\/life\/.* url script-request-header https://raw.githubusercontent.com/CarryDream/Sub/refs/heads/main/Tasks/xiangerxue_order.js

[mitm]
hostname = yidian.xiangerxue.cn
*/

const $ = new Env("慧幸福定时下单");
const tokenKey = "xiangerxue_token";
const STOCK_OUT_MSG = "商品库存不足";
const TOKEN_INVALID_KEYWORDS = ["token", "登录", "过期", "unauthorized", "身份"];

// ==================== 工具函数 ====================

function clipText(text, len) {
  const s = String(text || "");
  return s.length > len ? `${s.slice(0, len)}...` : s;
}

function maskToken(token) {
  const s = String(token || "");
  if (!s) return "空";
  if (s.length <= 8) return `${s.slice(0, 2)}***${s.slice(-2)}`;
  return `${s.slice(0, 4)}***${s.slice(-4)}`;
}

function logStep(stage, detail) {
  $.log(`[${$.name}] [${stage}] ${detail}`);
}

function logOk(stage, detail) {
  $.log(`[${$.name}] [${stage}] ✅ ${detail}`);
}

function logWarn(stage, detail) {
  $.log(`[${$.name}] [${stage}] ⚠️ ${detail}`);
}

function logBlock(title, lines) {
  const content = (lines || []).map((x) => `  - ${x}`).join("\n");
  $.log(`\n[${$.name}] ===== ${title} =====\n${content}\n[${$.name}] ====================`);
}

function logTable(title, rows) {
  const sep = "-".repeat(70);
  let output = `\n[${$.name}] ===== ${title} =====\n${sep}`;
  rows.forEach((row) => {
    output += `\n${row}`;
  });
  output += `\n${sep}`;
  $.log(output);
}

function getStock(product) {
  return Math.max(0, parseInt(product && product.stock, 10) || 0);
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTokenError(msg) {
  if (!msg) return false;
  const lower = msg.toLowerCase();
  return TOKEN_INVALID_KEYWORDS.some((kw) => lower.includes(kw));
}

function nowStr() {
  return new Date().toLocaleTimeString("zh-CN", { hour12: false });
}

// ==================== 参数解析 ====================

function parseArgs() {
  const args = {
    id: "",
    keyword: "",
    num: 1,
    page: 1,
    size: 10,
    order: "",
    pay_type: "score",
    remark: "",
    address_id: "",
    dry_run: "0",
    allow_zero_stock: "0",
    run_minutes: 5,
    retry_min_ms: 200,
    retry_max_ms: 500,
    retry_min_sec: 0,
    retry_max_sec: 0,
    req_timeout: 5000
  };

  let input = null;
  if (typeof $argument !== "undefined") {
    input = $argument;
  } else if (typeof $environment !== "undefined" && $environment.sourcePath) {
    input = $environment.sourcePath.split(/[?#]/)[1];
  }
  if (!input) return finalize(args);

  const raw = typeof input === "object" ? input : String(input).trim().replace(/^\?/, "");
  if (typeof raw === "object") {
    Object.keys(raw).forEach((k) => {
      if (raw[k] !== undefined && raw[k] !== null && k in args) args[k] = String(raw[k]);
    });
  } else {
    raw.split(/&|,/).forEach((item) => {
      const [k, v] = item.split("=");
      if (!k || typeof v === "undefined") return;
      const key = decodeURIComponent(k.trim());
      const val = decodeURIComponent(v.trim());
      if (key in args) args[key] = val;
    });
  }

  return finalize(args);
}

function finalize(args) {
  args.num = Math.max(1, parseInt(args.num, 10) || 1);
  args.page = Math.max(1, parseInt(args.page, 10) || 1);
  args.size = Math.max(1, parseInt(args.size, 10) || 10);
  args.dry_run = String(args.dry_run) === "1" ? "1" : "0";
  args.allow_zero_stock = String(args.allow_zero_stock) === "1" ? "1" : "0";
  args.run_minutes = Math.max(1, parseInt(args.run_minutes, 10) || 5);
  args.req_timeout = Math.max(1000, parseInt(args.req_timeout, 10) || 5000);

  const hasOldSec = (parseInt(args.retry_min_sec, 10) || 0) > 0 || (parseInt(args.retry_max_sec, 10) || 0) > 0;
  const hasNewMs = String(args.retry_min_ms) !== "200" || String(args.retry_max_ms) !== "500";

  if (hasOldSec && !hasNewMs) {
    args.retry_min_ms = Math.max(100, (parseInt(args.retry_min_sec, 10) || 1) * 1000);
    args.retry_max_ms = Math.max(100, (parseInt(args.retry_max_sec, 10) || 3) * 1000);
  } else {
    args.retry_min_ms = Math.max(100, parseInt(args.retry_min_ms, 10) || 200);
    args.retry_max_ms = Math.max(100, parseInt(args.retry_max_ms, 10) || 500);
  }

  if (args.retry_max_ms < args.retry_min_ms) args.retry_max_ms = args.retry_min_ms;
  return args;
}

const ARGS = parseArgs();

// ==================== 主入口 ====================

!(async () => {
  if (typeof $request !== "undefined") {
    captureToken();
    $.done({});
    return;
  }

  logBlock("启动参数", [
    `模式=${ARGS.dry_run === "1" ? "🧪 DRY RUN（仅查询）" : "🔥 正式下单"}`,
    `id=${ARGS.id || "未指定"}`,
    `keyword=${ARGS.keyword || "无"}`,
    `num=${ARGS.num}`,
    `pay_type=${ARGS.pay_type}`,
    `address_id=${ARGS.address_id || "自动获取"}`,
    `allow_zero_stock=${ARGS.allow_zero_stock}`,
    `run_minutes=${ARGS.run_minutes}`,
    `retry_interval=${ARGS.retry_min_ms}-${ARGS.retry_max_ms}ms`,
    `req_timeout=${ARGS.req_timeout}ms`
  ]);

  if (ARGS.dry_run === "1") {
    await dryRunFlow();
  } else {
    await mainFlow();
  }
  $.done();
})().catch((e) => {
  logWarn("主流程", `脚本执行异常: ${e}`);
  $.msg($.name, "❌ 脚本异常", String(e));
  $.done();
});

// ==================== Token 抓取 ====================

function captureToken() {
  const val = $request.headers.token || $request.headers.Token || $request.headers.TOKEN;
  if (!val) return;
  const oldVal = $.getdata(tokenKey);
  if (val !== oldVal) {
    $.setdata(val, tokenKey);
    // $.setdata(String(Date.now()), tokenKey + "_time");
    logOk("Token", `已更新并保存: ${maskToken(val)}`);
    $.msg($.name, "✅ Token 已获取", "隐私信息已过滤保存");
  } else {
    logStep("Token", `检测到相同 token，保持不变: ${maskToken(val)}`);
  }
}

// ==================== HTTP 封装 ====================

function buildHeaders(token) {
  return {
    Host: "yidian.xiangerxue.cn",
    token: token,
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.66(0x18004237) NetType/WIFI Language/zh_CN",
    "content-type": "application/json"
  };
}

function httpGet(url, token) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      logWarn("HTTP", `GET 超时(${ARGS.req_timeout}ms): ${url}`);
      resolve({ error: "timeout", body: null });
    }, ARGS.req_timeout);

    $.http
      .get({ url, headers: buildHeaders(token) })
      .then((res) => {
        clearTimeout(timer);
        resolve({ error: null, body: res.body });
      })
      .catch((e) => {
        clearTimeout(timer);
        logWarn("HTTP", `GET 异常: ${e}`);
        resolve({ error: String(e), body: null });
      });
  });
}

function httpPost(url, token, data) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      logWarn("HTTP", `POST 超时(${ARGS.req_timeout}ms): ${url}`);
      resolve({ error: "timeout", body: null });
    }, ARGS.req_timeout);

    $.http
      .post({ url, headers: buildHeaders(token), body: JSON.stringify(data) })
      .then((res) => {
        clearTimeout(timer);
        resolve({ error: null, body: res.body });
      })
      .catch((e) => {
        clearTimeout(timer);
        logWarn("HTTP", `POST 异常: ${e}`);
        resolve({ error: String(e), body: null });
      });
  });
}

// ==================== 接口调用 ====================

async function fetchProductList(token) {
  const url = `https://yidian.xiangerxue.cn/api/life/getProductList?page=${ARGS.page}&size=${ARGS.size}&order=${encodeURIComponent(ARGS.order || "")}`;
  logStep("商品", `请求商品列表: page=${ARGS.page}, size=${ARGS.size}`);

  const resp = await httpGet(url, token);
  if (resp.error) {
    logWarn("商品", `请求失败: ${resp.error}`);
    return null;
  }

  try {
    const result = JSON.parse(resp.body || "{}");

    if (result.code !== 1) {
      if (isTokenError(result.msg)) {
        logWarn("Token", `Token 可能失效: ${result.msg}`);
        $.msg($.name, "❌ Token 已失效", "请重新打开小程序获取 Token");
        return "TOKEN_INVALID";
      }
      logWarn("商品", `失败: code=${result.code}, msg=${result.msg || "无"}`);
      return null;
    }

    if (!result.data || !Array.isArray(result.data.data) || !result.data.data.length) {
      logWarn("商品", "列表为空");
      return null;
    }

    return result.data.data;
  } catch (e) {
    logWarn("商品", `解析异常: ${e}`);
    return null;
  }
}

async function fetchOrderData(token, productId) {
  const url = `https://yidian.xiangerxue.cn/api/life/getOrderData?id=${productId}&address_id=`;
  logStep("地址", `获取下单信息: product_id=${productId}`);

  const resp = await httpGet(url, token);
  if (resp.error) {
    logWarn("地址", `请求失败: ${resp.error}`);
    return null;
  }

  try {
    const result = JSON.parse(resp.body || "{}");
    if (result.code !== 1 || !result.data) {
      logWarn("地址", `失败: code=${result.code}, msg=${result.msg || "无"}`);
      return null;
    }
    return result.data;
  } catch (e) {
    logWarn("地址", `解析异常: ${e}`);
    return null;
  }
}

async function submitOrder(token, productId, addressId) {
  const url = "https://yidian.xiangerxue.cn/api/life/createOrder";
  const payload = {
    address_id: addressId,
    id: String(productId),
    num: ARGS.num,
    pay_type: ARGS.pay_type || "score",
    remark: ARGS.remark || ""
  };

  const resp = await httpPost(url, token, payload);
  if (resp.error) {
    return { ok: false, code: -1, msg: resp.error };
  }

  try {
    const result = JSON.parse(resp.body || "{}");
    return {
      ok: result.code === 1,
      code: result.code,
      msg: result.msg || "",
      orderId: result.data && (result.data.order_id || result.data.id || result.data.order_sn || "")
    };
  } catch (e) {
    return { ok: false, code: -1, msg: `解析异常: ${e}` };
  }
}

// ==================== 商品筛选 ====================

function buildCandidates(list) {
  const available = ARGS.allow_zero_stock === "1" ? list : list.filter((p) => getStock(p) > 0);

  if (!available.length) {
    logWarn("筛选", ARGS.allow_zero_stock === "1" ? "商品列表为空" : "所有商品库存为0");
    return [];
  }

  if (ARGS.id) {
    const hit = available.find((p) => String(p.id) === String(ARGS.id));
    if (!hit) {
      const inAll = list.find((p) => String(p.id) === String(ARGS.id));
      if (inAll && getStock(inAll) <= 0 && ARGS.allow_zero_stock !== "1") {
        logWarn("筛选", `id=${ARGS.id} 库存为0`);
      } else {
        logWarn("筛选", `id=${ARGS.id} 不在列表中`);
      }
      return [];
    }
    logOk("筛选", `按ID命中: id=${hit.id}, ${hit.name}`);
    return [hit];
  }

  if (ARGS.keyword) {
    const kw = ARGS.keyword.toLowerCase();
    const hits = available.filter((p) => `${p.name || ""}${p.subtitle || ""}`.toLowerCase().includes(kw));
    if (!hits.length) {
      logWarn("筛选", `关键字"${ARGS.keyword}"未匹配到商品`);
      return [];
    }
    logOk("筛选", `按关键字命中 ${hits.length} 个: ${hits.map((x) => x.id).join(",")}`);
    return hits;
  }

  logOk("筛选", `未指定条件，使用全部 ${available.length} 个商品`);
  return available;
}

// ==================== Dry Run 流程（信息查询模式） ====================

async function dryRunFlow() {
  logBlock("🧪 DRY RUN 模式", [
    "仅查询商品和地址信息，不会下单",
    "请根据输出信息配置正式下单参数"
  ]);

  // 1. 检查 Token
  const token = $.getdata(tokenKey);
  if (!token) {
    $.msg($.name, "❌ Token 缺失", "请先打开小程序触发抓取");
    return;
  }
  logOk("Token", `已加载: ${maskToken(token)}`);

  /*const tokenTime = parseInt($.getdata(tokenKey + "_time") || "0", 10);
  if (tokenTime > 0) {
    const ageHours = Math.floor((Date.now() - tokenTime) / 3600000);
    logStep("Token", `获取时间: ${new Date(tokenTime).toLocaleString()} (${ageHours}小时前)${ageHours > 24 ? " ⚠️ 可能已过期" : ""}`);
  }*/

  // 2. 获取完整商品列表（dry_run 始终获取，不跳过）
  const products = await fetchProductList(token);
  if (products === "TOKEN_INVALID") return;
  if (!products || !products.length) {
    $.msg($.name, "❌ 商品列表获取失败", "请检查网络或 Token");
    return;
  }

  // 3. 输出完整商品列表
  const productRows = [];
  productRows.push(padRight("序号", 4) + padRight("ID", 8) + padRight("商品名称", 24) + padRight("积分", 8) + padRight("库存", 8) + padRight("限量", 8) + "状态");
  productRows.push("─".repeat(70));
  products.forEach((p, i) => {
    const stock = getStock(p);
    const status = stock > 0 ? "✅可下单" : "❌无库存";
    productRows.push(
      padRight(String(i + 1), 4) +
      padRight(String(p.id), 8) +
      padRight(clipText(p.name, 22), 24) +
      padRight(String(p.score || "0"), 8) +
      padRight(String(stock), 8) +
      padRight(String(p.pay_num || "-"), 8) +
      status
    );
  });
  logTable("📦 商品列表（全部）", productRows);

  // 4. 筛选候选商品
  const candidates = buildCandidates(products);
  if (candidates.length) {
    const candidateRows = [];
    candidateRows.push(padRight("序号", 4) + padRight("ID", 8) + padRight("商品名称", 24) + padRight("积分", 8) + padRight("库存", 8) + "副标题");
    candidateRows.push("─".repeat(70));
    candidates.forEach((p, i) => {
      candidateRows.push(
        padRight(String(i + 1), 4) +
        padRight(String(p.id), 8) +
        padRight(clipText(p.name, 22), 24) +
        padRight(String(p.score || "0"), 8) +
        padRight(String(getStock(p)), 8) +
        clipText(p.subtitle || "", 20)
      );
    });
    logTable("🎯 筛选结果（候选商品）", candidateRows);
  } else {
    logWarn("筛选", "无候选商品");
  }

  // 5. 获取地址信息（用第一个候选商品或第一个商品）
  const probeProductId = candidates.length ? candidates[0].id : products[0].id;
  const orderData = await fetchOrderData(token, probeProductId);

  let addressId = "";
  if (orderData && orderData.address && orderData.address.id) {
    const addr = orderData.address;
    addressId = String(addr.id);
    logTable("📍 地址信息", [
      `address_id : ${addr.id}`,
      `收件人      : ${addr.contacts || "未知"}`,
      `手机号      : ${addr.mobile || "未知"}`,
      `省市区      : ${addr.province || ""}${addr.city || ""}${addr.district || ""}`,
      `详细地址    : ${addr.address || "未知"}`,
      `是否默认    : ${addr.is_default ? "是" : "否"}`
    ]);
  } else {
    logWarn("地址", "未获取到地址信息，请确认小程序中已设置默认地址");
  }

  // 6. 如果有其他下单相关信息也输出
  if (orderData) {
    const extraInfo = [];
    if (orderData.user_score !== undefined) extraInfo.push(`当前积分余额: ${orderData.user_score}`);
    if (orderData.product) {
      const op = orderData.product;
      extraInfo.push(`商品确认: id=${op.id}, ${op.name || ""}, 积分=${op.score || ""}, 库存=${getStock(op)}`);
    }
    if (extraInfo.length) {
      logTable("👤 账户 & 商品确认", extraInfo);
    }
  }

  // 7. 输出推荐配置
  if (candidates.length && addressId) {
    const target = candidates[0];
    const estCost = (parseInt(target.score, 10) || 0) * ARGS.num;

    const configLines = [];
    configLines.push("以下为推荐的正式下单参数，可直接复制使用：");
    configLines.push("");
    configLines.push("【极速模式 - 指定ID + 地址（最快，推荐）】");
    configLines.push(`?id=${target.id}&address_id=${addressId}&num=${ARGS.num}&retry_min_ms=200&retry_max_ms=500`);
    configLines.push("");
    configLines.push("【完整参数】");
    configLines.push(`?id=${target.id}&address_id=${addressId}&num=${ARGS.num}&pay_type=${ARGS.pay_type}&retry_min_ms=200&retry_max_ms=500&run_minutes=5&req_timeout=5000`);

    if (ARGS.keyword) {
      configLines.push("");
      configLines.push("【关键字模式 + 地址】");
      configLines.push(`?keyword=${encodeURIComponent(ARGS.keyword)}&address_id=${addressId}&num=${ARGS.num}&retry_min_ms=200&retry_max_ms=500`);
    }

    if (candidates.length > 1) {
      configLines.push("");
      configLines.push("【其他候选商品ID】");
      candidates.forEach((p, i) => {
        configLines.push(`  ${i + 1}. id=${p.id} | ${p.name} | 积分=${p.score} | 库存=${getStock(p)}`);
      });
    }

    configLines.push("");
    configLines.push(`预计积分消耗: ${target.score} × ${ARGS.num} = ${estCost}`);

    logTable("📋 推荐配置（复制使用）", configLines);

    $.msg(
      $.name,
      "🧪 Dry Run 查询完成",
      `商品: ${target.name} (id=${target.id})\n地址ID: ${addressId}\n积分: ${target.score} × ${ARGS.num} = ${estCost}\n请查看控制台获取完整配置`
    );
  } else {
    $.msg(
      $.name,
      "🧪 Dry Run 查询完成",
      `商品数: ${products.length} | 候选数: ${candidates.length} | 地址: ${addressId || "未获取"}\n请查看控制台日志`
    );
  }
}

// ==================== 正式下单流程 ====================

async function mainFlow() {
  // 1. 检查 Token
  const token = $.getdata(tokenKey);
  if (!token) {
    $.msg($.name, "❌ Token 缺失", "请先打开小程序触发抓取");
    return;
  }

  const tokenTime = parseInt($.getdata(tokenKey + "_time") || "0", 10);
  if (tokenTime > 0) {
    const ageHours = Math.floor((Date.now() - tokenTime) / 3600000);
    if (ageHours > 24) {
      logWarn("Token", `Token 已获取 ${ageHours} 小时，可能已过期，建议刷新`);
    }
  }
  logOk("Token", `已加载: ${maskToken(token)}`);

  const deadline = Date.now() + ARGS.run_minutes * 60 * 1000;

  // 2. 预热：获取商品
  let candidates = [];
  let cachedAddressId = ARGS.address_id || "";

  if (ARGS.id) {
    candidates = [{ id: ARGS.id, name: `商品#${ARGS.id}`, score: "未知", stock: 999 }];
    logOk("预热", `已指定商品 id=${ARGS.id}，跳过列表请求`);
  } else {
    const listResult = await fetchProductList(token);
    if (listResult === "TOKEN_INVALID") return;
    if (!listResult || !listResult.length) {
      $.msg($.name, "❌ 商品列表获取失败", "请检查网络或 Token");
      return;
    }
    candidates = buildCandidates(listResult);
    if (!candidates.length) {
      $.msg($.name, "❌ 无可下单商品", "未筛选到符合条件的商品");
      return;
    }
  }

  // 3. 预热：获取地址
  if (!cachedAddressId) {
    const orderData = await fetchOrderData(token, candidates[0].id);
    if (orderData && orderData.address && orderData.address.id) {
      cachedAddressId = String(orderData.address.id);
      logOk("预热", `地址获取成功: id=${cachedAddressId}, 收件人=${orderData.address.contacts || "未知"}`);
    } else {
      $.msg($.name, "❌ 地址获取失败", "请确认小程序中已设置默认地址");
      return;
    }
  } else {
    logOk("预热", `使用指定地址 address_id=${cachedAddressId}`);
  }

  logBlock("预热完成，开始下单", [
    `候选商品数=${candidates.length}`,
    `首选: id=${candidates[0].id}, ${clipText(candidates[0].name, 20)}`,
    `地址ID=${cachedAddressId}`
  ]);

  // 4. 高速下单循环
  let round = 0;
  let totalScoreCost = 0;
  const resultRows = [];
  let currentIdx = 0;

  while (Date.now() < deadline) {
    round++;
    const product = candidates[currentIdx];
    const leftMs = Math.max(0, deadline - Date.now());

    if (round <= 3 || round % 50 === 0) {
      logStep("下单", `#${round} [${nowStr()}] id=${product.id}, 剩余${Math.floor(leftMs / 1000)}s`);
    }

    const orderRes = await submitOrder(token, product.id, cachedAddressId);

    if (orderRes.ok) {
      const cost = (parseInt(product.score, 10) || 0) * ARGS.num;
      totalScoreCost += cost;
      resultRows.push(`id=${product.id} | ${clipText(product.name, 16)} | ✅成功 | 积分=${cost}`);

      logBlock("🎉 下单成功", [
        `轮次=${round}`,
        `商品=${product.name} (id=${product.id})`,
        `订单号=${orderRes.orderId || "未返回"}`,
        `积分消耗=${cost}`
      ]);

      $.msg(
        $.name,
        "✅ 下单成功",
        `${product.name} x${ARGS.num}\n订单: ${orderRes.orderId || "未返回"}\n轮次: ${round} | 积分: ${cost}`
      );
      return;
    }

    // 失败处理
    const failMsg = orderRes.msg || `code=${orderRes.code}`;

    if (isTokenError(orderRes.msg)) {
      logWarn("下单", `Token 失效，终止: ${failMsg}`);
      $.msg($.name, "❌ Token 已失效", "请重新打开小程序获取 Token");
      return;
    }

    if (orderRes.msg && orderRes.msg.indexOf(STOCK_OUT_MSG) !== -1) {
      logWarn("下单", `#${round} 库存不足: id=${product.id}`);
      resultRows.push(`id=${product.id} | ${clipText(product.name, 16)} | 库存不足`);

      if (currentIdx < candidates.length - 1) {
        currentIdx++;
        logStep("切换", `尝试下一个候选: id=${candidates[currentIdx].id}`);
        if (!ARGS.address_id) {
          const newData = await fetchOrderData(token, candidates[currentIdx].id);
          if (newData && newData.address && newData.address.id) {
            cachedAddressId = String(newData.address.id);
          }
        }
        continue;
      }

      currentIdx = 0;
      logWarn("下单", "所有候选库存不足，从头重试...");
    } else if (round <= 3 || round % 20 === 0) {
      logWarn("下单", `#${round} 失败: ${failMsg}`);
    }

    if (Date.now() >= deadline) break;
    const waitMs = randomInt(ARGS.retry_min_ms, ARGS.retry_max_ms);
    await sleep(waitMs);
  }

  logBlock("执行结束", [
    `总轮次=${round}`,
    `执行时长=${ARGS.run_minutes}分钟`,
    `积分消耗=${totalScoreCost}`,
    ...resultRows
  ]);

  $.msg(
    $.name,
    "⚠️ 未能下单成功",
    `执行 ${round} 轮 / ${ARGS.run_minutes}分钟\n${resultRows.length ? resultRows[resultRows.length - 1] : "无结果"}`
  );
}

// ==================== 文本对齐工具 ====================

function padRight(str, len) {
  const s = String(str || "");
  if (s.length >= len) return s;
  return s + " ".repeat(len - s.length);
}

// ==================== 环境封装 ====================

function Env(name) {
  const isLoon = typeof $loon !== "undefined";
  const isSurge = typeof $httpClient !== "undefined" && !isLoon;
  const isQX = typeof $task !== "undefined";

  const send = (o, m) =>
    new Promise((r, j) => {
      if (isQX) {
        const opt = Object.assign({}, o, { method: m });
        $task
          .fetch(opt)
          .then((res) => r(res))
          .catch(j);
      } else {
        const c = m === "POST" ? $httpClient.post : $httpClient.get;
        c(o, (e, res, b) => {
          if (e) j(e);
          else {
            res.body = b;
            r(res);
          }
        });
      }
    });

  const http = {
    get: (o) => send(o, "GET"),
    post: (o) => send(o, "POST")
  };

  const setdata = (v, k) => (isQX ? $prefs.setValueForKey(v, k) : $persistentStore.write(v, k));
  const getdata = (k) => (isQX ? $prefs.valueForKey(k) : $persistentStore.read(k));
  const msg = (t, s, m) => {
    if (isSurge || isLoon) $notification.post(t, s, m);
    if (isQX) $notify(t, s, m);
    console.log(`${t}\n${s}\n${m}`);
  };
  const log = console.log;
  const done = (v) => $done(v);

  return { name, isLoon, isSurge, isQX, http, setdata, getdata, msg, log, done };
}
