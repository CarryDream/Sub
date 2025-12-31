/*
[task_local]
# 每天上午9点自动签到
0 9 * * * https://raw.githubusercontent.com/CarryDream/Sub/refs/heads/main/Tasks/xiangerxue.js, tag=慧幸福/香尔雪签到, enabled=true

[rewrite_local]
# 匹配API路径获取Token (请确认您提供的API路径是否完整匹配实际请求)
# 注意：抓包看到的完整URL可能是 https://yidian.xiangerxue.cn/api/user/sign 或类似
# 下面的正则假设关键路径包含 xiangerxue.cn/api
^https:\/\/yidian\.xiangerxue\.cn\/api url script-request-header https://raw.githubusercontent.com/CarryDream/Sub/refs/heads/main/Tasks/xiangerxue.js
*/

const $ = new Env("慧幸福");
const tokenKey = "xiangerxue_token";

// === 关键配置区 ===
// 请填入抓包看到的完整签到接口后缀，例如 "/user/signin" 或 "/daily/checkin"
// 如果您提供的 https://yidian.xiangerxue.cn/api 就是完整接口，则保留空字符串
const signPath = ""; 
// 完整的签到URL
const signUrl = "https://yidian.xiangerxue.cn/api" + signPath; 

// 脚本入口
!(async () => {
  if (typeof $request !== "undefined") {
    // === 模块1：获取Token (Rewrite模式) ===
    await getToken();
  } else {
    // === 模块2：执行签到 (Task模式) ===
    // await checkIn();
  }
})().catch((e) => $.logErr(e)).finally(() => $.done());

// 获取并保存Token
function getToken() {
  // 常见Token字段名：Authorization, token, x-auth-token 等
  // 请根据实际抓包结果修改下面的 key，这里默认尝试 Authorization
  const targetHeader = "token"; 
  
  // 兼容大小写
  const val = $request.headers[targetHeader] || $request.headers[targetHeader.toLowerCase()];
  
  if (val) {
    // 只有当Token变化时才写入，避免重复提示
    const oldVal = $.getdata(tokenKey);
    if (val !== oldVal) {
      $.setdata(val, tokenKey);
      $.msg($.name, "🎉 新Token获取成功", "请去任务列表测试运行");
      $.log(`[${$.name}] 获取Token: ${val}`);
    }
  } else {
    $.log(`[${$.name}] 未在请求头中找到 ${targetHeader}，请检查脚本配置的字段名`);
  }
}

// 执行签到
function checkIn() {
  const token = $.getdata(tokenKey);
  
  if (!token) {
    $.msg($.name, "❌ 签到失败", "未找到Token，请先打开小程序并进行一次手动签到以获取Token");
    return;
  }

  const myRequest = {
    url: signUrl,
    headers: {
      "host": "yidian.xiangerxue.cn",
      "token": token,
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.18",
      "Content-Type": "application/json/charset=UTF-8"
    },
    // 如果是 POST 请求且需要 body，请在此添加
    // body: JSON.stringify({}), 
  };

  return new Promise((resolve) => {
    // 如果是 POST 请求，请将 $.get 改为 $.post
    $.post(myRequest, (error, response, data) => {
      try {
        if (error) {
          $.msg($.name, "签到接口请求失败", error);
        } else {
          // 这里根据实际返回的JSON判断是否成功
          // 假设返回字段包含 "code": 200 或 "success": true
          const result = JSON.parse(data);
          if (result.code === 200 || result.success === true) {
             $.msg($.name, "✅ 签到成功", `服务端返回: ${result.message || "OK"}`);
          } else {
             $.msg($.name, "⚠️ 签到失败", `服务端返回: ${result.message || JSON.stringify(result)}`);
          }
          $.log(`[${$.name}] 响应数据: ${data}`);
        }
      } catch (e) {
        $.logErr(e, response);
        $.msg($.name, "🚫 脚本执行异常", "解析响应失败，请查看日志");
      }
      resolve();
    });
  });
}

// === 固定 Env 模版 (无需修改) ===
function Env(t,e){class s{constructor(t){this.env=t}write(t,e){this.env.isNode()?this.env.fs.writeFileSync(t,e):this.env.setdata(t,e)}read(t){return this.env.isNode()?this.env.fs.readFileSync(t):this.env.getdata(t)}getdata(t){let e=this.read(t);if(e)return e;if(this.env.isNode()){const s=this.read(t);if(s)return s}return this.env.isSurge()||this.env.isLoon()?$persistentStore.read(t):this.env.isQuanX()?$prefs.valueForKey(t):this.env.isNode()?this.env.data[t]:void 0}setdata(t,e){return this.env.isSurge()||this.env.isLoon()?$persistentStore.write(t,e):this.env.isQuanX()?$prefs.setValueForKey(t,e):this.env.isNode()?(this.env.data[e]=t,!0):void 0}msg(e,s,i,r){const o=i;if(!e&&(e=this.env.name),this.env.isSurge()||this.env.isLoon())$notification.post(e,s,o,r);else if(this.env.isQuanX())$notify(e,s,o,r);else if(this.env.isNode()){const t=require("./sendNotify");t.sendNotify(e+"\n"+s,o+"\n"+r)}}log(t){console.log(`[${this.env.name}] ${t}`)}isNode(){return"undefined"!=typeof module&&!!module.exports}isQuanX(){return"undefined"!=typeof $task}isSurge(){return"undefined"!=typeof $httpClient&&"undefined"==typeof $loon}isLoon(){return"undefined"!=typeof $loon}}return new s(t,e)}
