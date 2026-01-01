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
 
// 脚本入口
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
 
// 获取并保存Token
function getToken() {
  const targetHeader = "token"; 
  const val = $request.headers[targetHeader] || $request.headers[targetHeader.toLowerCase()];
  
  if (val) {
    const oldVal = $.getdata(tokenKey);
    if (val !== oldVal) {
      $.setdata(val, tokenKey);
      $.msg($.name, "✅ Token 已更新", "新 Token 已保存，请在任务列表测试签到");
      $.log(`[${$.name}] Token 已更新: ${val}`);
    } else {
      $.log(`[${$.name}] Token 未变化，无需更新`);
    }
  }
}
 
// 执行签到
async function checkIn() {
  const token = $.getdata(tokenKey);
  
  if (!token) {
    $.msg($.name, "❌ Token 缺失", "请先在小程序操作触发抓取 Token");
    return;
  }
 
  // 获取当前日期 (格式: 2026-01-1)
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  
  // 构造请求 URL
  const signUrl = `https://yidian.xiangerxue.cn/api/user/sign?type=2&sign_type=1&date=${dateStr}`;
 
  $.log(`[${$.name}] 开始签到，日期: ${dateStr}`);
 
  const myRequest = {
    url: signUrl,
    method: "GET",
    headers: {
      "Host": "yidian.xiangerxue.cn",
      "Accept-Encoding": "gzip,compress,br,deflate",
      "content-type": "application/json;charset=UTF-8",
      "Connection": "keep-alive",
      "Referer": "https://servicewechat.com/wx3824cf96aee7c0e0/6/page-frame.html",
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.66(0x18004237) NetType/WIFI Language/zh_CN",
      "token": token
    }
  };
 
  return new Promise((resolve) => {
    $.get(myRequest, (error, response, data) => {
      try {
        if (error) {
          $.msg($.name, "❌ 网络请求失败", String(error));
        } else {
          $.log(`[${$.name}] 原始响应内容: ${data}`);
          const result = JSON.parse(data);
          
          // 根据通常的接口逻辑判断，此处假设 code 200 或 msg 包含成功为成功
          if (result.code === 200 || result.msg?.includes("成功") || result.data === true) {
            $.msg($.name, "✅ 签到成功", `结果: ${result.msg || "完成"}`);
          } else {
            $.msg($.name, "⚠️ 签到结果", `消息: ${result.msg || "接口返回异常"}`);
          }
        }
      } catch (e) {
        $.log(`[${$.name}] 解析异常: ${e}`);
        $.msg($.name, "❌ 响应解析失败", "请查看详细日志");
      }
      resolve();
    });
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
