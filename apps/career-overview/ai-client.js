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
    data = { error: text };
  }

  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }

  return data;
}

async function getHealth() {
  return requestJson("/api/health");
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
  testAiConnection,
  analyzeResume,
  analyzeModule,
  streamResumeChat,
};
