/**
 * @fileoverview Updated script for xiangerxue.js
 * Now uses standardized HTTP request composition and error handling.
 */

const $ = new Env("慧幸福");
const tokenKey = "xiangerxue_token";

const API_HOST = "https://yidian.xiangerxue.cn";
const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.66(0x18004237) NetType/WIFI Language/zh_CN";

// Main start
!(async () => {
  if (typeof $request !== "undefined") {
    handleToken();
    $done();
  } else {
    await autoSignIn();
    $done();
  }
})().catch((e) => {
  $.msg($.name, "❌ 脚本异常！", String(e));
  $.done();
});

// Retrieve token from headers
function handleToken() {
  const token = $request.headers["token"];
  if (!token) {
    $.msg($.name, "❌ Token 获取失败", "未捕获到有效的 Token Headers");
    return;
  }
  const oldToken = $.getdata(tokenKey);
  if (token !== oldToken) {
    $.setdata(token, tokenKey);
    $.msg($.name, "✅ Token 已成功更新", "新 Token 已存储于本地");
  }
}

// Perform auto sign-in for user
async function autoSignIn() {
  const token = $.getdata(tokenKey);
  if (!token) {
    $.msg($.name, "❌ 缺少 token", "无法操作，请获取 token 后重试");
    return;
  }

  const currentDate = new Date().toISOString().split("T")[0];
  const requestUrl = `${API_HOST}/api/user/sign`;
  const requestBody = { type: "2", date: currentDate };

  const signInRequest = {
    url: requestUrl,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      token: token,
    },
    body: JSON.stringify(requestBody),
  };

  $task.fetch(signInRequest).then(
    (response) => {
      handleResponse(response, "签到成功", "签到遇到错误");
    },
    (error) => {
      $.msg($.name, "❌ 网络错误", String(error));
    }
  );
}

// Centralized handler for responses
function handleResponse(response, successMsg, errorMsg) {
  try {
    const data = JSON.parse(response.body);
    if (data?.code === 1) {
      // Success
      $.msg($.name, `✅ ${successMsg}`, data?.msg || "操作成功！");
    } else {
      // API Error
      const errorReason = data?.msg || "未知错误";
      $.msg($.name, `⚠️ ${errorMsg}`, errorReason);
    }
  } catch (e) {
    // JSON Error
    $.msg($.name, "❌ 返回解析失败", e.message || String(e));
  }
}

// Environment helpers
function Env(name) {
  const isQX = typeof $task !== "undefined";
  const isSurge = typeof $httpClient !== "undefined" && typeof $loon === "undefined";
  const isLoon = typeof $loon !== "undefined";
  
  const done = (value = {}) => {
    if (isQX) return $done(value);
    if (isLoon || isSurge) return $done(value);
  };

  const getdata = (key) => {
    if (isQX) return $prefs.valueForKey(key);
    if (isSurge) return $persistentStore.read(key);
  };

  const setdata = (value, key) => {
    if (isQX) return $prefs.setValueForKey(value, key);
    if (isSurge) return $persistentStore.write(value, key);
  };

  return { isQX, isSurge, setdata, getdata, done };
}