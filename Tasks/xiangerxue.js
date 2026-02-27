/******************************************
 * @name 慧幸福签到
 * @author CarryDream
 * @update 2025-01-04
 * @version 1.2.0
 * @description 支持签到类型配置 + 自动浏览资讯
 ******************************************
 */

/*
[task_local]
# 每天上午9点自动签到 + 浏览资讯
# 参数说明：type=1 固定签到, type=2 随机签到（默认）
# 功能说明：
#   1. 自动签到（支持固定/随机模式）
#   2. 自动浏览10篇资讯（ID: 100-285，间隔2秒）
#
# 示例1: 默认随机签到
0 9 * * * https://raw.githubusercontent.com/CarryDream/Sub/refs/heads/main/Tasks/xiangerxue.js, tag=慧幸福, img-url=https://icon.uiboy.com/icons/1607434573_preview.png, enabled=true
# 示例2: 使用固定签到（URL参数方式）
# 0 9 * * * https://raw.githubusercontent.com/CarryDream/Sub/refs/heads/main/Tasks/xiangerxue.js?type=1, tag=慧幸福(固定), img-url=https://icon.uiboy.com/icons/1607434573_preview.png, enabled=true

[rewrite_local]
^https:\/\/yidian\.xiangerxue\.cn\/api url script-request-header https://raw.githubusercontent.com/CarryDream/Sub/refs/heads/main/Tasks/xiangerxue.js

[mitm]
hostname = yidian.xiangerxue.cn

*/

const $ = new Env("慧幸福");
const tokenKey = "xiangerxue_token";

function clipText(text, len) {
  const str = String(text || "");
  return str.length > len ? `${str.slice(0, len)}...` : str;
}

function maskToken(token) {
  const str = String(token || "");
  if (!str) return "空";
  if (str.length <= 8) return `${str.slice(0, 2)}***${str.slice(-2)}`;
  return `${str.slice(0, 4)}***${str.slice(-4)}`;
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

// 参数解析（参考 kuwotask.js）
const ARGS = (() => {
  let args = { type: "2" }; // 默认随机签到
  let input = null;

  // 1. 尝试从 $argument 获取（QX argument 参数）
  if (typeof $argument !== "undefined") {
    input = $argument;
  }
  // 2. 尝试从 URL 参数获取（?type=1）
  else if (typeof $environment !== "undefined" && $environment.sourcePath) {
    input = $environment.sourcePath.split(/[?#]/)[1];
  }

  if (!input) return args;

  // 处理对象格式
  if (typeof input === "object") {
    args.type = String(input.type || "2");
    return args;
  }

  // 处理字符串格式
  let str = String(input).trim().replace(/^\[|\]$/g, "").replace(/^"|"$/g, "");

  if (str.includes("=")) {
    // 支持 type=1 或 type=1&other=value 格式
    str.split(/&|,/).forEach(item => {
      let [k, v] = item.split("=");
      if (k && k.trim() === "type" && v) {
        args.type = decodeURIComponent(v.trim());
      }
    });
  } else if (str === "1" || str === "2") {
    // 兼容直接传入 1 或 2
    args.type = str;
  }

  // 校验并归一化 type 值
  args.type = (args.type === "1" || args.type === "固定") ? "1" : "2";
  return args;
})();

$.log(`[${$.name}] 启动完成，签到模式: type=${ARGS.type} (${ARGS.type === "1" ? "固定签到" : "随机签到"})`);

!(async () => {
  if (typeof $request !== "undefined") {
    getToken();
    $.done({});
  } else {
    await checkIn();
    await browseArticles();
    $.done();
  }
})().catch((e) => {
  logWarn("主流程", `脚本执行异常: ${e}`);
  $.done();
});

function getToken() {
  const targetHeader = "token";
  const val = $request.headers[targetHeader] || $request.headers[targetHeader.toLowerCase()];
  if (val) {
    const oldVal = $.getdata(tokenKey);
    if (val !== oldVal) {
      $.setdata(val, tokenKey);
      logOk("Token", `已更新并保存: ${maskToken(val)}`);
      $.msg($.name, "✅ Token 已获取", "隐私信息已过滤保存");
    } else {
      logStep("Token", `检测到相同 token，保持不变: ${maskToken(val)}`);
    }
  }
}

async function checkIn() {
  const token = $.getdata(tokenKey);
  if (!token) {
    $.msg($.name, "❌ Token 缺失", "请打开小程序触发");
    logWarn("签到", "未找到 token，任务已跳过");
    return;
  }

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
  const signType = ARGS.type;
  const signUrl = `https://yidian.xiangerxue.cn/api/user/sign?type=${signType}&sign_type=1&date=${dateStr}`;

  const modeText = signType === "1" ? "固定签到" : "随机签到";
  logStep("签到", `开始${modeText}，日期=${dateStr}`);

  const myRequest = {
    url: signUrl,
    headers: {
      "Host": "yidian.xiangerxue.cn",
      "token": token,
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.66(0x18004237) NetType/WIFI Language/zh_CN",
      "content-type": "application/json"
    }
  };

  return $.http.get(myRequest).then(response => {
    try {
      const result = JSON.parse(response.body);
      logStep("签到", `接口返回: code=${result.code}, msg=${result.msg || "无"}`);

      if (result.code === 1) {
        // 签到成功
        const score = result.data && result.data.score ? result.data.score : "未知";
        $.msg($.name, `✅ ${modeText}成功`, `当前积分: ${score}`);
        logOk("签到", `${modeText}成功，当前积分=${score}`);
      } else if (result.code === 0 && result.msg && result.msg.indexOf("已签到") !== -1) {
        // 今日已签到
        $.msg($.name, "ℹ️ 今日已签到", result.msg);
        logStep("签到", `重复签到提示: ${result.msg}`);
      } else {
        // 其他错误
        $.msg($.name, `⚠️ ${modeText}失败`, result.msg || `未知错误 (code: ${result.code})`);
        logWarn("签到", `失败: code=${result.code}, msg=${result.msg || "未知错误"}`);
      }
    } catch (e) {
      $.msg($.name, "❌ 解析失败", "返回内容非 JSON 格式");
      logWarn("签到", `响应解析异常: ${e}`);
    }
  }).catch(error => {
    $.msg($.name, "❌ 网络请求失败", String(error));
    logWarn("签到", `网络请求失败: ${error}`);
  });
}

// 浏览资讯文章（增加活跃度）
async function browseArticles() {
  const token = $.getdata(tokenKey);
  if (!token) {
    logWarn("浏览", "未找到 token，跳过浏览任务");
    return;
  }

  const BROWSE_COUNT = 10;  // 浏览次数
  const BROWSE_DELAY = 2000; // 间隔2秒
  const ID_MIN = 100;
  const ID_MAX = 285;

  let successCount = 0;
  let failCount = 0;
  let sharedTitle = null; // 记录一个成功的标题用于分享

  logStep("浏览", `开始浏览资讯: ${BROWSE_COUNT} 篇，间隔 ${BROWSE_DELAY / 1000}s`);

  for (let i = 0; i < BROWSE_COUNT; i++) {
    const randomId = Math.floor(Math.random() * (ID_MAX - ID_MIN + 1)) + ID_MIN;
    const articleUrl = `https://yidian.xiangerxue.cn/api/information/getInfo?id=${randomId}`;

    const myRequest = {
      url: articleUrl,
      headers: {
        "Host": "yidian.xiangerxue.cn",
        "token": token,
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.66(0x18004237) NetType/WIFI Language/zh_CN",
        "content-type": "application/json"
      }
    };

    try {
      const response = await $.http.get(myRequest);
      const result = JSON.parse(response.body);

      if (result.code === 1) {
        successCount++;
        const fullTitle = result.data && result.data.name ? result.data.name : "";
        const title = clipText(fullTitle, 15);
        logStep("浏览", `${i + 1}/${BROWSE_COUNT} 成功 | ID=${randomId} | 标题=${title || "无标题"}`);

        // 记录第一个成功的完整标题用于分享
        if (!sharedTitle && fullTitle) {
          sharedTitle = fullTitle;
        }
      } else {
        failCount++;
        logWarn("浏览", `${i + 1}/${BROWSE_COUNT} 失败 | ID=${randomId} | code=${result.code}`);
      }
    } catch (e) {
      failCount++;
      logWarn("浏览", `${i + 1}/${BROWSE_COUNT} 异常 | ID=${randomId} | ${e}`);
    }

    // 最后一次不需要延迟
    if (i < BROWSE_COUNT - 1) {
      await sleep(BROWSE_DELAY);
    }
  }

  logOk("浏览", `任务完成: 成功 ${successCount} 篇，失败 ${failCount} 篇`);
  $.msg($.name, "📖 浏览资讯完成", `成功: ${successCount}/${BROWSE_COUNT} 篇 | 失败: ${failCount} 篇`);

  // 分享一篇文章获取积分
  if (sharedTitle) {
    await shareArticle(token, sharedTitle);
  }
}

// 分享文章（每日首次分享可获得5积分）
async function shareArticle(token, title) {
  const encodedTitle = encodeURIComponent(title);
  const shareUrl = `https://yidian.xiangerxue.cn/api/user/recordShareTime?memo=${encodedTitle}`;

  logStep("分享", `开始分享: ${clipText(title, 20)}`);

  const myRequest = {
    url: shareUrl,
    headers: {
      "Host": "yidian.xiangerxue.cn",
      "token": token,
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.66(0x18004237) NetType/WIFI Language/zh_CN",
      "content-type": "application/json"
    }
  };

  try {
    const response = await $.http.get(myRequest);
    const result = JSON.parse(response.body);

    if (result.code === 1) {
      logOk("分享", "分享成功");
      $.msg($.name, "🔗 分享成功", "每日首次分享可获得5积分");
    } else {
      logWarn("分享", `分享返回: code=${result.code}, msg=${result.msg || "无"}`);
    }
  } catch (e) {
    logWarn("分享", `分享异常: ${e}`);
  }
}

// 延迟函数
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function Env(name) {
  const isLoon = typeof $loon !== "undefined", isSurge = typeof $httpClient !== "undefined" && !isLoon, isQX = typeof $task !== "undefined";
  const http = { get: o => send(o, 'GET'), post: o => send(o, 'POST') };
  const send = (o, m) => new Promise((r, j) => { const opt = isQX ? o : { url: o.url, headers: o.headers, body: o.body }; if (isQX) { opt.method = m; $task.fetch(opt).then(res => { res.body = res.body; r(res) }).catch(j) } else { const c = m === 'POST' ? $httpClient.post : $httpClient.get; c(opt, (e, res, b) => { if (e) j(e); else { res.body = b; r(res) } }) } });
  const setdata = (v, k) => { if (isQX) return $prefs.setValueForKey(v, k); return $persistentStore.write(v, k) };
  const getdata = k => { if (isQX) return $prefs.valueForKey(k); return $persistentStore.read(k) };
  const setval = setdata;
  const getval = getdata;
  const notify = (t, s, m) => { if (isSurge || isLoon) $notification.post(t, s, m); if (isQX) $notify(t, s, m) };
  const msg = (t, s, m) => { if (isSurge || isLoon) $notification.post(t, s, m); if (isQX) $notify(t, s, m); console.log(`${t}\n${s}\n${m}`) };
  const log = console.log;
  const logErr = (e, resp) => { log(`❌ ${name} - Error: ${e}`); if (resp) log(`Response: ${JSON.stringify(resp)}`) };
  const done = v => { isQX ? $done(v) : $done(v) };
  return { name, isLoon, isSurge, isQX, http, setdata, getdata, setval, getval, notify, msg, log, logErr, done };
}
