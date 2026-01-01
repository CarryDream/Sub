/******************************************
 * @name 慧幸福签到
 * @author CarryDream
 * @update 2025-12-31
 * @version 1.0.0
 ******************************************
 */

/*
[task_local]
# 每天上午9点自动签到
0 9 * * * https://raw.githubusercontent.com/CarryDream/Sub/refs/heads/main/Tasks/xiangerxue.js, tag=慧幸福, img-url=https://yidian.xiangerxue.cn/assets/img/favicon.ico, enabled=true

[rewrite_local]
# 匹配API路径获取Token (请确认您提供的API路径是否完整匹配实际请求)
# 注意：抓包看到的完整URL可能是 https://yidian.xiangerxue.cn/api/user/sign 或类似
# 下面的正则假设关键路径包含 xiangerxue.cn/api
^https:\/\/yidian\.xiangerxue\.cn\/api url script-request-header https://raw.githubusercontent.com/CarryDream/Sub/refs/heads/main/Tasks/xiangerxue.js

[mitm]
hostname = yidian.xiangerxue.cn

*/
 

const $ = new Env("慧幸福");
const tokenKey = "xiangerxue_token";
 
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
  const dateStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate()}`;
  const signUrl = `https://yidian.xiangerxue.cn/api/user/sign?type=2&sign_type=1&date=${dateStr}`;
 
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
      // 逻辑优化：区分“成功签到”和“重复签到”
      if (result.code === 200 || result.code === 0) {
        if (result.msg && result.msg.indexOf("已签到") !== -1) {
          $.msg($.name, "ℹ️ 重复签到", "今日已经签到过了");
          $.log(`[${$.name}] 重复签到跳过`);
        } else {
          $.msg($.name, "✅ 签到成功", result.msg || "完成");
        }
      } else {
        $.msg($.name, "⚠️ 签到失败", result.msg || "未知原因");
      }
    } catch (e) {
      $.msg($.name, "❌ 解析失败", "返回内容非 JSON 格式");
    }
  }).catch(error => {
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
