function sanitizeErrorMessage(text, status) {
  const raw = String(text || "").trim();
  if (!raw) return `请求失败${status ? `（${status}）` : ""}`;
  if (/<!doctype html|<html[\s>]/i.test(raw)) {
    if (status === 502) return "服务暂时不稳定，网关返回了 502。通常是上游 AI 服务超时或 Render 临时失败，请稍后重试。";
    if (status === 504) return "服务响应超时，请稍后重试。";
    if (status >= 500) return `服务暂时不可用（${status}），请稍后重试。`;
    return "服务返回了非预期页面，请稍后重试。";
  }
  return raw.length > 300 ? `${raw.slice(0, 300)}...` : raw;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: sanitizeErrorMessage(text, response.status), rawError: text };
  }

  if (!response.ok) {
    const error = new Error(sanitizeErrorMessage(data.error || text, response.status) || `Request failed: ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

async function getHealth() {
  return requestJson("/api/health");
}

async function getCurrentUser() {
  return requestJson("/api/auth/me");
}

async function register(payload) {
  return requestJson("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });
}

async function login(payload) {
  return requestJson("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });
}

async function logout() {
  return requestJson("/api/auth/logout", {
    method: "POST",
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(15_000),
  });
}

async function listHistory() {
  return requestJson("/api/history", {
    signal: AbortSignal.timeout(20_000),
  });
}

async function getHistoryItem(id) {
  return requestJson(`/api/history?id=${encodeURIComponent(id)}`, {
    signal: AbortSignal.timeout(20_000),
  });
}

async function saveHistory(payload) {
  return requestJson("/api/history", {
    method: "POST",
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });
}

async function testAiConnection() {
  return requestJson("/api/test-ai");
}

async function analyzeResume(payload) {
  return requestJson("/api/analyze-resume", {
    method: "POST",
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(130_000),
  });
}

async function createCareerProfile(payload) {
  return requestJson("/api/create-career-profile", {
    method: "POST",
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(75_000),
  });
}

async function createOverview(payload) {
  return requestJson("/api/create-overview", {
    method: "POST",
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(50_000),
  });
}

async function extractResumeText(file) {
  return requestJson("/api/extract-resume-text", {
    method: "POST",
    body: JSON.stringify({ file }),
    signal: AbortSignal.timeout(45_000),
  });
}

async function analyzeModule(moduleType, payload) {
  const endpoints = {
    career: "/api/analyze-career",
    study: "/api/analyze-study",
    ability: "/api/analyze-ability",
  };
  const endpoint = endpoints[moduleType];
  if (!endpoint) throw new Error("Unsupported analysis module.");

  return requestJson(endpoint, {
    method: "POST",
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(90_000),
  });
}

async function streamResumeChat(payload, onChunk) {
  const response = await fetch("/api/chat-resume", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(130_000),
  });

  if (!response.ok) {
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: text };
    }
    throw new Error(data.error || `Request failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    fullText += chunk;
    onChunk(chunk, fullText);
  }

  return fullText;
}

window.ResumeInsightAPI = {
  getHealth,
  getCurrentUser,
  register,
  login,
  logout,
  listHistory,
  getHistoryItem,
  saveHistory,
  testAiConnection,
  extractResumeText,
  analyzeResume,
  createCareerProfile,
  createOverview,
  analyzeModule,
  streamResumeChat,
};
