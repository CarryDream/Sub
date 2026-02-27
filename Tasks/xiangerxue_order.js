/******************************************
 * @name 慧幸福定时下单
 * @author CarryDream
 * @update 2026-02-27
 * @version 1.0.0
 * @description 抓取商品列表 -> 获取默认地址 -> 积分下单
 ******************************************
 */

/*
[task_local]
# 每天 09:00 执行定时下单（默认下单 id=17）
0 9 * * * https://raw.githubusercontent.com/CarryDream/Sub/refs/heads/main/Tasks/xiangerxue_order.js?id=17&num=1, tag=慧幸福定时下单, img-url=https://icon.uiboy.com/icons/1607434573_preview.png, enabled=true
#
# 可选参数：
# id=17                指定商品ID（优先级最高）
# keyword=冬季套装      按商品名/副标题关键字匹配
# num=1                下单数量
# page=1               商品列表页码
# size=10              商品列表每页数量
# order=               商品列表排序参数（可留空）
# pay_type=score       支付类型，默认 score
# remark=              订单备注
# dry_run=0            1=仅查询不下单，0=真实下单
# allow_zero_stock=0   1=库存为0也允许尝试下单，0=默认跳过库存0
# run_minutes=5        重试执行时长（分钟），默认5
# retry_min_sec=1      重试最小间隔秒数，默认1
# retry_max_sec=3      重试最大间隔秒数，默认3
#
# 示例：按关键字抢兑
# 0 9 * * * https://raw.githubusercontent.com/CarryDream/Sub/refs/heads/main/Tasks/xiangerxue_order.js?keyword=%E5%86%AC%E5%AD%A3&num=1&dry_run=0, tag=慧幸福定时下单(关键字), img-url=https://icon.uiboy.com/icons/1607434573_preview.png, enabled=true

[rewrite_local]
^https:\/\/yidian\.xiangerxue\.cn\/api\/life\/.* url script-request-header https://raw.githubusercontent.com/CarryDream/Sub/refs/heads/main/Tasks/xiangerxue_order.js

[mitm]
hostname = yidian.xiangerxue.cn
*/

const $ = new Env("慧幸福定时下单");
const tokenKey = "xiangerxue_token";
const STOCK_OUT_MSG = "商品库存不足";

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
  const content = (lines || []).map((x) => `- ${x}`).join("\n");
  $.log(`\n[${$.name}] ===== ${title} =====\n${content}\n[${$.name}] ====================`);
}

function getStock(product) {
  return Math.max(0, parseInt(product && product.stock, 10) || 0);
}

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
    dry_run: "0",
    allow_zero_stock: "0",
    run_minutes: 5,
    retry_min_sec: 1,
    retry_max_sec: 3
  };
  let input = null;
  if (typeof $argument !== "undefined") {
    input = $argument;
  } else if (typeof $environment !== "undefined" && $environment.sourcePath) {
    input = $environment.sourcePath.split(/[?#]/)[1];
  }
  if (!input) return args;

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

  args.num = Math.max(1, parseInt(args.num, 10) || 1);
  args.page = Math.max(1, parseInt(args.page, 10) || 1);
  args.size = Math.max(1, parseInt(args.size, 10) || 10);
  args.dry_run = String(args.dry_run) === "1" ? "1" : "0";
  args.allow_zero_stock = String(args.allow_zero_stock) === "1" ? "1" : "0";
  args.run_minutes = Math.max(1, parseInt(args.run_minutes, 10) || 5);
  args.retry_min_sec = Math.max(1, parseInt(args.retry_min_sec, 10) || 1);
  args.retry_max_sec = Math.max(1, parseInt(args.retry_max_sec, 10) || 3);
  if (args.retry_max_sec < args.retry_min_sec) args.retry_max_sec = args.retry_min_sec;
  return args;
}

const ARGS = parseArgs();

!(async () => {
  if (typeof $request !== "undefined") {
    captureToken();
    $.done({});
    return;
  }

  logBlock("启动参数", [
    `id=${ARGS.id || "未指定"}`,
    `keyword=${ARGS.keyword || "无"}`,
    `num=${ARGS.num}`,
    `pay_type=${ARGS.pay_type}`,
    `dry_run=${ARGS.dry_run}`,
    `allow_zero_stock=${ARGS.allow_zero_stock}`,
    `run_minutes=${ARGS.run_minutes}`,
    `retry_interval=${ARGS.retry_min_sec}-${ARGS.retry_max_sec}s`
  ]);
  await createOrderByFlow();
  $.done();
})().catch((e) => {
  logWarn("主流程", `脚本执行异常: ${e}`);
  $.done();
});

function captureToken() {
  const val = $request.headers.token || $request.headers.Token || $request.headers.TOKEN;
  if (!val) return;
  const oldVal = $.getdata(tokenKey);
  if (val !== oldVal) {
    $.setdata(val, tokenKey);
    logOk("Token", `已更新并保存: ${maskToken(val)}`);
    $.msg($.name, "✅ Token 已获取", "隐私信息已过滤保存");
  } else {
    logStep("Token", `检测到相同 token，保持不变: ${maskToken(val)}`);
  }
}

function buildHeaders(token) {
  return {
    Host: "yidian.xiangerxue.cn",
    token: token,
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.66(0x18004237) NetType/WIFI Language/zh_CN",
    "content-type": "application/json"
  };
}

async function createOrderByFlow() {
  const token = $.getdata(tokenKey);
  if (!token) {
    $.msg($.name, "❌ Token 缺失", "请先打开小程序触发抓取");
    logWarn("下单", "未找到 token，任务结束");
    return;
  }

  const deadline = Date.now() + ARGS.run_minutes * 60 * 1000;
  let round = 0;
  let finalRows = [];
  let finalScoreCost = 0;
  let finalMsg = "";

  while (Date.now() < deadline) {
    round++;
    const leftSec = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
    logBlock(`执行轮次 #${round}`, [`剩余执行时间=${leftSec}s`]);

    const roundResult = await runOneRound(token);
    finalRows = finalRows.concat(roundResult.resultRows.map((x) => `[第${round}轮] ${x}`));
    finalScoreCost += roundResult.totalScoreCost;
    if (roundResult.lastMsg) finalMsg = roundResult.lastMsg;

    if (roundResult.success) {
      logBlock("逐商品结果", finalRows.length ? finalRows : ["无"]);
      logBlock("积分汇总", [`本次积分消耗=${finalScoreCost}`]);
      $.msg($.name, "✅ 下单流程完成", `轮次: ${round} | 本次积分消耗: ${finalScoreCost}`);
      return;
    }

    if (ARGS.dry_run === "1") {
      logBlock("逐商品结果", finalRows.length ? finalRows : ["无"]);
      logBlock("积分汇总", [`预计积分消耗=${finalScoreCost}`]);
      $.msg($.name, "🧪 Dry Run 完成", `已演练 ${round} 轮（未真实下单）`);
      return;
    }

    if (Date.now() >= deadline) break;
    const waitSec = randomInt(ARGS.retry_min_sec, ARGS.retry_max_sec);
    logStep("重试", `本轮未成功，${waitSec}s 后开始下一轮`);
    await sleep(waitSec * 1000);
  }

  logBlock("逐商品结果", finalRows.length ? finalRows : ["无"]);
  logBlock("积分汇总", [`本次积分消耗=${finalScoreCost}`]);
  $.msg($.name, "⚠️ 下单结束", `执行时长达到 ${ARGS.run_minutes} 分钟 | 最后原因: ${finalMsg || "未命中可下单条件"}`);
}

async function runOneRound(token) {
  const products = await getProductList(token);
  if (!products || !products.length) {
    return { success: false, resultRows: ["商品列表获取失败或为空"], totalScoreCost: 0, lastMsg: "商品列表为空" };
  }

  const candidates = buildCandidates(products);
  if (!candidates.length) {
    return { success: false, resultRows: ["未筛选到可尝试商品"], totalScoreCost: 0, lastMsg: "无匹配商品" };
  }

  const resultRows = [];
  let totalScoreCost = 0;
  let lastMsg = "";

  for (let i = 0; i < candidates.length; i++) {
    const product = candidates[i];
    if (getStock(product) <= 0 && ARGS.allow_zero_stock !== "1") {
      logWarn("下单", `跳过库存为0商品: id=${product.id}, 名称=${product.name}`);
      resultRows.push(`id=${product.id} | ${clipText(product.name, 16)} | 状态=跳过(库存0) | 积分消耗=0`);
      continue;
    }
    logStep("下单", `尝试 ${i + 1}/${candidates.length}: id=${product.id}, 名称=${product.name}, 单件积分=${product.score}`);

    const orderData = await getOrderData(token, product.id);
    if (!orderData || !orderData.address || !orderData.address.id) {
      lastMsg = "地址信息缺失";
      logWarn("地址", `商品 id=${product.id} 无有效地址，跳过`);
      resultRows.push(`id=${product.id} | ${clipText(product.name, 16)} | 状态=失败(地址缺失) | 积分消耗=0`);
      continue;
    }

    const addressId = orderData.address.id;
    logOk("地址", `获取成功: address_id=${addressId}，收件人=${orderData.address.contacts || "未知"}`);

    const payload = {
      address_id: addressId,
      id: String(product.id),
      num: ARGS.num,
      pay_type: ARGS.pay_type || "score",
      remark: ARGS.remark || ""
    };

    if (ARGS.dry_run === "1") {
      logStep("下单", `dry_run=1，跳过下单请求: ${JSON.stringify(payload)}`);
      const dryCost = (parseInt(product.score, 10) || 0) * ARGS.num;
      totalScoreCost += dryCost;
      resultRows.push(`id=${product.id} | ${clipText(product.name, 16)} | 状态=DRY_RUN(未下单) | 积分消耗=${dryCost}`);
      continue;
    }

    const orderRes = await createOrder(token, product, payload);
    if (orderRes.ok) {
      const successCost = (parseInt(product.score, 10) || 0) * ARGS.num;
      totalScoreCost += successCost;
      resultRows.push(`id=${product.id} | ${clipText(product.name, 16)} | 状态=成功 | 积分消耗=${successCost}`);
      return { success: true, resultRows, totalScoreCost, lastMsg: "" };
    }

    lastMsg = orderRes.msg || `code=${orderRes.code}`;
    resultRows.push(`id=${product.id} | ${clipText(product.name, 16)} | 状态=失败(${lastMsg}) | 积分消耗=0`);
    if (orderRes.msg && orderRes.msg.indexOf(STOCK_OUT_MSG) !== -1 && i < candidates.length - 1) {
      logWarn("下单", `库存不足，自动尝试下一个候选商品`);
      continue;
    }
    break;
  }

  return { success: false, resultRows, totalScoreCost, lastMsg };
}

async function getProductList(token) {
  const url = `https://yidian.xiangerxue.cn/api/life/getProductList?page=${ARGS.page}&size=${ARGS.size}&order=${encodeURIComponent(ARGS.order || "")}`;
  logStep("商品", `请求商品列表: page=${ARGS.page}, size=${ARGS.size}, order=${ARGS.order || "空"}`);

  try {
    const response = await $.http.get({ url, headers: buildHeaders(token) });
    const result = JSON.parse(response.body || "{}");
    if (result.code !== 1 || !result.data || !Array.isArray(result.data.data)) {
      $.msg($.name, "❌ 商品列表获取失败", result.msg || "返回结构异常");
      logWarn("商品", `失败: code=${result.code}, msg=${result.msg || "无"}`);
      return null;
    }

    const list = result.data.data;
    if (!list.length) {
      $.msg($.name, "❌ 商品列表为空", "无可兑换商品");
      logWarn("商品", "列表为空");
      return null;
    }

    const lines = list.map((p, i) =>
      `${i + 1}. id=${p.id} | ${clipText(p.name, 18)} | 积分=${p.score} | 库存=${getStock(p)} | 限量=${p.pay_num}`
    );
    logBlock("商品列表", lines);

    return list;
  } catch (e) {
    $.msg($.name, "❌ 商品列表请求异常", String(e));
    logWarn("商品", `请求异常: ${e}`);
    return null;
  }
}

function buildCandidates(list) {
  const availableList = ARGS.allow_zero_stock === "1" ? list : list.filter((p) => getStock(p) > 0);
  if (!availableList.length) {
    logWarn("商品", ARGS.allow_zero_stock === "1" ? "商品列表为空" : "当前商品列表库存均为0");
    return [];
  }

  if (ARGS.id) {
    const hit = availableList.find((p) => String(p.id) === String(ARGS.id));
    if (!hit) {
      const inList = list.find((p) => String(p.id) === String(ARGS.id));
      if (inList && getStock(inList) <= 0 && ARGS.allow_zero_stock !== "1") {
        logWarn("商品", `指定 id=${ARGS.id} 库存为0，无法下单`);
      } else {
        logWarn("商品", `指定 id=${ARGS.id} 不在当前列表中`);
      }
      return [];
    }
    logOk("商品", `目标商品(按ID): id=${hit.id}, 名称=${hit.name}, 积分=${hit.score}, 库存=${getStock(hit)}, 数量=${ARGS.num}`);
    return [hit];
  }

  if (ARGS.keyword) {
    const kw = ARGS.keyword.toLowerCase();
    const hits = availableList.filter((p) => (`${p.name || ""}${p.subtitle || ""}`).toLowerCase().includes(kw));
    if (!hits.length) {
      logWarn("商品", `关键字 ${ARGS.keyword} 未匹配到商品`);
      return [];
    }
    logOk("商品", `目标商品(按关键字): ${hits.map((x) => x.id).join(",")}，将按顺序尝试`);
    return hits;
  }

  logOk("商品", `未指定 id/keyword，默认按${ARGS.allow_zero_stock === "1" ? "商品列表" : "有库存商品"}顺序尝试，首个 id=${availableList[0].id}`);
  return availableList;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getOrderData(token, productId) {
  const url = `https://yidian.xiangerxue.cn/api/life/getOrderData?id=${productId}&address_id=`;
  logStep("地址", `获取下单信息: product_id=${productId}`);

  try {
    const response = await $.http.get({ url, headers: buildHeaders(token) });
    const result = JSON.parse(response.body || "{}");
    if (result.code !== 1 || !result.data) {
      $.msg($.name, "❌ 下单信息获取失败", result.msg || "返回结构异常");
      logWarn("地址", `失败: code=${result.code}, msg=${result.msg || "无"}`);
      return null;
    }
    return result.data;
  } catch (e) {
    $.msg($.name, "❌ 下单信息请求异常", String(e));
    logWarn("地址", `请求异常: ${e}`);
    return null;
  }
}

async function createOrder(token, product, payload) {
  const url = "https://yidian.xiangerxue.cn/api/life/createOrder";
  logStep("下单", `提交订单: id=${payload.id}, num=${payload.num}, address_id=${payload.address_id}, pay_type=${payload.pay_type}`);

  try {
    const response = await $.http.post({
      url,
      headers: buildHeaders(token),
      body: JSON.stringify(payload)
    });
    const result = JSON.parse(response.body || "{}");
    logStep("下单", `接口返回: code=${result.code}, msg=${result.msg || "无"}`);

    if (result.code === 1) {
      const orderId = result.data && (result.data.order_id || result.data.id || result.data.order_sn || "");
      logOk("下单", `创建成功: ${orderId || "订单号未返回"}`);
      $.msg($.name, "✅ 下单成功", `${product.name} x${payload.num}${orderId ? ` | 订单号: ${orderId}` : ""}`);
      return { ok: true, code: result.code, msg: result.msg || "" };
    } else {
      logWarn("下单", `创建失败: code=${result.code}, msg=${result.msg || "无"}`);
      return { ok: false, code: result.code, msg: result.msg || "" };
    }
  } catch (e) {
    logWarn("下单", `请求异常: ${e}`);
    return { ok: false, code: -1, msg: String(e) };
  }
}

function Env(name) {
  const isLoon = typeof $loon !== "undefined";
  const isSurge = typeof $httpClient !== "undefined" && !isLoon;
  const isQX = typeof $task !== "undefined";
  const http = { get: (o) => send(o, "GET"), post: (o) => send(o, "POST") };

  const send = (o, m) =>
    new Promise((r, j) => {
      const opt = isQX ? o : { url: o.url, headers: o.headers, body: o.body };
      if (isQX) {
        opt.method = m;
        $task.fetch(opt).then((res) => {
          res.body = res.body;
          r(res);
        }).catch(j);
      } else {
        const c = m === "POST" ? $httpClient.post : $httpClient.get;
        c(opt, (e, res, b) => {
          if (e) j(e);
          else {
            res.body = b;
            r(res);
          }
        });
      }
    });

  const setdata = (v, k) => (isQX ? $prefs.setValueForKey(v, k) : $persistentStore.write(v, k));
  const getdata = (k) => (isQX ? $prefs.valueForKey(k) : $persistentStore.read(k));
  const notify = (t, s, m) => {
    if (isSurge || isLoon) $notification.post(t, s, m);
    if (isQX) $notify(t, s, m);
  };
  const msg = (t, s, m) => {
    if (isSurge || isLoon) $notification.post(t, s, m);
    if (isQX) $notify(t, s, m);
    console.log(`${t}\n${s}\n${m}`);
  };
  const log = console.log;
  const done = (v) => {
    isQX ? $done(v) : $done(v);
  };
  return { name, isLoon, isSurge, isQX, http, setdata, getdata, notify, msg, log, done };
}
