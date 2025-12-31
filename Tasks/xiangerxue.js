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

// === 关键配置区 ===
// TODO: 待补充签到接口路径，例如 "/user/checkin" 或 "/daily/sign"
// 拿到签到URL后，请填入下方 signPath 变量
const signPath = ""; 
// 完整的签到URL（待完善）
const signUrl = signPath ? `https://yidian.xiangerxue.cn/api${signPath}` : ""; 

// 脚本入口
!(async () => {
  if (typeof $request !== "undefined") {
    // === 模块1：获取Token (Rewrite模式) ===
    getToken();
    $.done({});
  } else {
    // === 模块2：执行签到 (Task模式) ===
    // TODO: 待签到接口确认后启用下方调用
    // await checkIn();
    $.msg($.name, "⚠️ 签到功能未启用", "请先配置 signPath 并取消注释 checkIn() 调用");
    $.done();
  }
})().catch((e) => {
  $.log(`[${$.name}] 脚本执行异常: ${e}`);
  $.done();
});

// 获取并保存Token
function getToken() {
  const targetHeader = "token"; 
  
  // 兼容大小写
  const val = $request.headers[targetHeader] || $request.headers[targetHeader.toLowerCase()];
  
  if (val) {
    const oldVal = $.getdata(tokenKey);
    if (val !== oldVal) {
      // Token 变化时才更新存储
      $.setdata(val, tokenKey);
      $.msg($.name, "✅ Token 已更新", "新 Token 已保存，请在任务列表测试签到");
      $.log(`[${$.name}] Token 已更新: ${val.substring(0, 20)}...`);
    } else {
      $.log(`[${$.name}] Token 未变化，无需更新`);
    }
  } else {
    $.log(`[${$.name}] ⚠️ 未在请求头找到 '${targetHeader}' 字段`);
  }
}

// 执行签到（待完善）
async function checkIn() {
  const token = $.getdata(tokenKey);
  
  if (!token) {
    $.msg($.name, "❌ Token 缺失", "请先访问小程序触发 Token 获取");
    return;
  }

  if (!signUrl) {
    $.msg($.name, "❌ 配置错误", "签到接口 URL 未配置，请填写 signPath");
    return;
  }

  $.log(`[${$.name}] 开始签到，URL: ${signUrl}`);

  const myRequest = {
    url: signUrl,
    headers: {
      "Host": "yidian.xiangerxue.cn",
      "token": token,
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.18(0x1800123a) NetType/WIFI Language/zh_CN",
      "Content-Type": "application/json;charset=UTF-8"
    },
    // TODO: 确认签到请求方式（GET/POST）和是否需要 body
    // body: JSON.stringify({}), 
  };

  return new Promise((resolve) => {
    // TODO: 根据实际接口调整为 $.get 或 $.post
    $.post(myRequest, (error, response, data) => {
      try {
        if (error) {
          $.msg($.name, "❌ 网络请求失败", String(error));
          $.log(`[${$.name}] Error: ${error}`);
        } else {
          const result = JSON.parse(data);
          $.log(`[${$.name}] 响应数据: ${data}`);
          
          // TODO: 根据实际接口返回结构调整判断逻辑
          if (result.code === 200 || result.success === true) {
            $.msg($.name, "✅ 签到成功", result.message || result.msg || "签到完成");
          } else {
            $.msg($.name, "⚠️ 签到失败", result.message || result.msg || JSON.stringify(result));
          }
        }
      } catch (e) {
        $.log(`[${$.name}] 解析异常: ${e}`);
        $.msg($.name, "❌ 响应解析失败", "请查看日志或联系开发者");
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