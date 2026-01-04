/******************************************
 * @name 慧幸福签到
 * @author CarryDream
 * @update 2025-01-04
 * @version 1.1.0
 * @description 支持通过 URL 参数配置签到类型
 ******************************************
 */

/*
[task_local]
# 每天上午9点自动签到
# 参数说明：type=1 固定签到, type=2 随机签到（默认）
# 
# 示例1: 默认随机签到
0 9 * * * https://raw.githubusercontent.com/CarryDream/Sub/refs/heads/main/Tasks/xiangerxue.js, tag=慧幸福, img-url=https://yidian.xiangerxue.cn/assets/img/favicon.ico, enabled=true
# 示例2: 使用固定签到（URL参数方式）
# 0 9 * * * https://raw.githubusercontent.com/CarryDream/Sub/refs/heads/main/Tasks/xiangerxue.js?type=1, tag=慧幸福(固定), img-url=https://yidian.xiangerxue.cn/assets/img/favicon.ico, enabled=true

[rewrite_local]
^https:\/\/yidian\.xiangerxue\.cn\/api url script-request-header https://raw.githubusercontent.com/CarryDream/Sub/refs/heads/main/Tasks/xiangerxue.js

[mitm]
hostname = yidian.xiangerxue.cn

*/

const $ = new Env("慧幸福");
const tokenKey = "xiangerxue_token";

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

$.log(`[慧幸福] 签到模式: type=${ARGS.type} (${ARGS.type === "1" ? "固定签到" : "随机签到"})`);
 
!(async () => {
  if (typeof $request !== "undefined") {
    getToken();
    $.done({});
  } else {
    await checkIn();
    $.done();
  }
})().catch((e) => {
  $.log(`[${$.name}] 脚本执行异常: ${e}`);
  $.done();
});
 
function getToken() {
  const targetHeader = "token"; 
  const val = $request.headers[targetHeader] || $request.headers[targetHeader.toLowerCase()];
  if (val) {
    const oldVal = $.getdata(tokenKey);
    if (val !== oldVal) {
      $.setdata(val, tokenKey);
      $.msg($.name, "✅ Token 已获取", "隐私信息已过滤保存");
    }
  }
}
 
async function checkIn() {
  const token = $.getdata(tokenKey);
  if (!token) {
    $.msg($.name, "❌ Token 缺失", "请打开小程序触发");
    return;
  }
 
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
  const signType = ARGS.type;
  const signUrl = `https://yidian.xiangerxue.cn/api/user/sign?type=${signType}&sign_type=1&date=${dateStr}`;
  
  const modeText = signType === "1" ? "固定签到" : "随机签到";
  $.log(`[${$.name}] 开始${modeText}，URL: ${signUrl}`);
 
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
    $.log(`[${$.name}] 响应: ${response.body}`);
    try {
      const result = JSON.parse(response.body);
      
      if (result.code === 1) {
        // 签到成功
        const score = result.data && result.data.score ? result.data.score : "未知";
        $.msg($.name, `✅ ${modeText}成功`, `当前积分: ${score}`);
        $.log(`[${$.name}] ${modeText}成功，积分: ${score}`);
      } else if (result.code === 0 && result.msg && result.msg.indexOf("已签到") !== -1) {
        // 今日已签到
        $.msg($.name, "ℹ️ 今日已签到", result.msg);
        $.log(`[${$.name}] ${result.msg}`);
      } else {
        // 其他错误
        $.msg($.name, `⚠️ ${modeText}失败`, result.msg || `未知错误 (code: ${result.code})`);
        $.log(`[${$.name}] 签到失败: ${JSON.stringify(result)}`);
      }
    } catch (e) {
      $.msg($.name, "❌ 解析失败", "返回内容非 JSON 格式");
      $.log(`[${$.name}] 解析异常: ${e}`);
    }
  }).catch(error => {
    $.msg($.name, "❌ 网络请求失败", String(error));
    $.log(`[${$.name}] 请求错误: ${error}`);
  });
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
