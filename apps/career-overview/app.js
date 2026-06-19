const state = {
  health: null,
  report: null,
  careerProfile: null,
  uploadedFile: null,
  extractedResumeText: "",
  chatHistory: [],
  isAnalyzing: false,
  isChatting: false,
};

const storageKey = "resume_insight_reader_draft";
const analysisStorageKey = "resume_insight_career_analysis";

const sampleResume = `符策旭
年龄：31
Email: fucx9501@outlook.com / Tel: +86 13311529950

具有多年一线大厂数据治理、危机策略经验的初级数据分析师，熟悉 SQL、Python 和 R 语言，良好适应互联网、生物科技等新科技企业的快节奏和结果导向工作方式，具有隐私合规、Quant 策略、传播支持、算法合规、自动化标准评估和生成等项目经验。

项目经历
- 数据治理项目：参与数据口径梳理、数据质量监控和自动化评估标准建设，协助产出标准说明和复盘材料。
- 危机策略支持：参与舆情与风险材料整理，协助形成传播口径、风险研判和响应建议。
- 隐私与算法合规：参与算法合规、隐私合规相关材料准备，梳理业务流程中的风险点。
- 自动化评估：使用 SQL、Python 和 R 支持数据提取、清洗、统计分析和报告生成。`;

function qs(selector) {
  return document.querySelector(selector);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fallbackText(value) {
  const text = String(value ?? "").trim();
  return text || "信息不足，需补充简历证据";
}

function showToast(message) {
  const toast = qs("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2400);
}

function setBusy(isBusy) {
  state.isAnalyzing = isBusy;
  qs("#analyzeBtn").disabled = isBusy;
  qs("#analyzeBtn").textContent = isBusy ? "生成画像中..." : "开始分析";
}

function setChatBusy(isBusy) {
  state.isChatting = isBusy;
  qs("#chatInput").disabled = isBusy || !state.report;
  qs("#chatSendBtn").disabled = isBusy || !state.report;
  setPromptChipsDisabled(isBusy || !state.report);
  qs("#chatSendBtn").textContent = isBusy ? "回答中..." : "发送";
  qs("#chatStatus").textContent = state.report ? (isBusy ? "正在回答" : "可追问") : "先完成分析";
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function getFileExtension(file) {
  const name = file.name.toLowerCase();
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index) : "";
}

function isTextResume(file) {
  const extension = getFileExtension(file);
  return file.type.startsWith("text/") || extension === ".txt" || extension === ".md";
}

function isSupportedResume(file) {
  const extension = getFileExtension(file);
  return isTextResume(file) || file.type === "application/pdf" || extension === ".pdf"
    || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || extension === ".docx";
}

async function handleFileSelect(event) {
  const file = event.target.files?.[0];
  if (!file) {
    state.uploadedFile = null;
    qs("#fileStatus").textContent = "支持 TXT、MD、PDF、DOCX。";
    return;
  }

  if (!isSupportedResume(file)) {
    qs("#resumeFile").value = "";
    state.uploadedFile = null;
    qs("#fileStatus").textContent = "请上传 TXT、MD、PDF 或 DOCX 简历。";
    showToast("文件格式不支持");
    return;
  }

  if (isTextResume(file)) {
    const text = await readFileAsText(file);
    state.uploadedFile = null;
    qs("#resumeText").value = text.trim();
    qs("#fileStatus").textContent = `已读取文本：${file.name}`;
    persistDraft();
    return;
  }

  const dataUrl = await readFileAsDataUrl(file);
  state.uploadedFile = {
    name: file.name,
    type: file.type || "application/octet-stream",
    dataUrl,
  };
  qs("#fileStatus").textContent = `已选择文件：${file.name}，点击分析后解析正文。`;
  showToast("文件已选择");
}

function readPayload() {
  return {
    resumeText: qs("#resumeText").value.trim() || state.extractedResumeText,
    file: state.uploadedFile,
    context: {
      age: qs("#ageInput").value.trim(),
      targetGoal: qs("#targetGoalInput").value.trim(),
      targetDirection: qs("#targetDirectionInput").value.trim(),
      anxiety: qs("#anxietyInput").value.trim(),
    },
  };
}

function persistDraft() {
  const draft = {
    age: qs("#ageInput").value,
    targetGoal: qs("#targetGoalInput").value,
    targetDirection: qs("#targetDirectionInput").value,
    anxiety: qs("#anxietyInput").value,
    resumeText: qs("#resumeText").value,
  };
  localStorage.setItem(storageKey, JSON.stringify(draft));
}

function restoreDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (!draft) return;
    qs("#ageInput").value = draft.age || "";
    qs("#targetGoalInput").value = draft.targetGoal || "";
    qs("#targetDirectionInput").value = draft.targetDirection || "";
    qs("#anxietyInput").value = draft.anxiety || "";
    qs("#resumeText").value = draft.resumeText || "";
  } catch {
    localStorage.removeItem(storageKey);
  }
}

async function refreshHealth() {
  try {
    state.health = await window.ResumeInsightAPI.getHealth();
    const hasKey = state.health.hasDeepSeekKey;
    qs("#apiStatus").textContent = hasKey ? "DeepSeek 已配置" : "DeepSeek 未配置";
    qs("#apiStatus").classList.toggle("ok", hasKey);
  } catch {
    qs("#apiStatus").textContent = "后端未启动";
    qs("#apiStatus").classList.remove("ok");
  }
}

async function analyze() {
  const payload = readPayload();
  if (!payload.resumeText && !payload.file) {
    showToast("请先粘贴简历文本或上传简历文件");
    return;
  }

  try {
    setBusy(true);
    state.report = null;
    state.careerProfile = null;
    state.chatHistory = [];
    setChatAvailable(false);
    persistDraft();
    localStorage.removeItem(analysisStorageKey);
    showLoadingState();
    const report = await window.ResumeInsightAPI.analyzeResume(payload);
    state.report = report;
    state.careerProfile = report.careerProfile || null;
    state.extractedResumeText = report.extractedResumeText || payload.resumeText;
    if (!qs("#resumeText").value.trim() && state.extractedResumeText) {
      qs("#resumeText").value = state.extractedResumeText;
      persistDraft();
    }
    state.chatHistory = [];
    renderReport(report);
    persistAnalysis();
    resetChatPanel();
    showToast("分析已生成");
  } catch (error) {
    showErrorState(error.message);
  } finally {
    setBusy(false);
  }
}

function showLoadingState() {
  qs("#reportContent").hidden = true;
  qs("#emptyState").hidden = false;
  qs("#emptyState").innerHTML = `
    <strong>正在分析</strong>
    <p>DeepSeek 正在先压缩 career_profile，再生成短总览。深度模块会单独调用。</p>
  `;
}

function showErrorState(message) {
  qs("#reportContent").hidden = true;
  qs("#emptyState").hidden = false;
  qs("#emptyState").innerHTML = `
    <strong>分析失败</strong>
    <p>${escapeHtml(message)}</p>
  `;
  qs("#exportBtn").disabled = true;
  state.report = null;
  state.careerProfile = null;
  state.chatHistory = [];
  setChatAvailable(false);
  showToast(message);
}

function renderReport(report) {
  qs("#emptyState").hidden = true;
  qs("#reportContent").hidden = false;
  qs("#exportBtn").disabled = false;

  renderPeerScore(report.peerScore || {});
  renderAbilityFields(report.abilityFields);
  renderDirections(report.suitableDirections);
  renderShortcomings(report.shortcomings || {});
  renderImprovementAdvice(report.improvementAdvice || {});
  renderModuleRecommendations(report.moduleRecommendations);
}

function renderPeerScore(peerScore) {
  const rawScore = Number(peerScore.score);
  const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(10, rawScore)) : 0;
  qs("#scoreValue").textContent = Number.isInteger(score) ? String(score) : score.toFixed(1);
  qs("#scoreBar").style.width = `${score * 10}%`;
  qs("#peerExplanation").textContent = fallbackText(peerScore.explanation);
}

function renderAbilityFields(items) {
  const safeItems = normalizeArray(items, 3);
  qs("#abilityFields").innerHTML = safeItems.map((item, index) => `
    <article class="result-card">
      <span class="card-index">${index + 1}</span>
      <h4>${escapeHtml(fallbackText(item.name))}</h4>
      <dl>
        <dt>简历证据</dt>
        <dd>${escapeHtml(fallbackText(item.currentEvidence))}</dd>
        <dt>可用场景</dt>
        <dd>${escapeHtml(fallbackText(item.usableScenes))}</dd>
      </dl>
    </article>
  `).join("");
}

function renderDirections(items) {
  const safeItems = normalizeArray(items, 3);
  qs("#directionList").innerHTML = safeItems.map((item, index) => `
    <article class="result-card direction-card">
      <span class="card-index">${index + 1}</span>
      <h4>${escapeHtml(fallbackText(item.title))}</h4>
      <p>${escapeHtml(fallbackText(item.explanation))}</p>
    </article>
  `).join("");
}

function renderShortcomings(shortcomings) {
  qs("#shortcomingsSummary").textContent = fallbackText(shortcomings.summary);
  const items = Array.isArray(shortcomings.items) && shortcomings.items.length
    ? shortcomings.items.slice(0, 3)
    : ["信息不足，需补充简历证据"];
  qs("#shortcomingsList").innerHTML = items.map((item) => `<li>${escapeHtml(fallbackText(item))}</li>`).join("");
}

function renderImprovementAdvice(advice) {
  qs("#neededAbility").textContent = fallbackText(advice.mostNeededAbility);
  qs("#missingExperience").textContent = fallbackText(advice.missingExperience);
  qs("#shortAdvice").textContent = fallbackText(advice.shortAdvice);
}

function renderModuleRecommendations(items) {
  const labels = {
    career: "职业方向",
    study: "留学专业",
    ability: "能力地图",
  };
  const hrefs = {
    career: "./career.html",
    study: "./study.html",
    ability: "./ability.html",
  };
  const safeItems = Array.isArray(items) && items.length
    ? items.slice(0, 3)
    : [
      { module: "career", reason: "先判断适合岗位和求职路径", suggestedQuestion: "我应该优先投哪些岗位？" },
      { module: "study", reason: "补充留学和专业选择依据", suggestedQuestion: "我适合申请哪些专业方向？" },
      { module: "ability", reason: "把优势和短板拆成可训练能力", suggestedQuestion: "我最该补哪几项能力？" },
    ];

  qs("#moduleRecommendations").innerHTML = safeItems.map((item, index) => `
    <article class="result-card direction-card">
      <span class="card-index">${index + 1}</span>
      <h4>${escapeHtml(labels[item.module] || fallbackText(item.module))}</h4>
      <p>${escapeHtml(fallbackText(item.reason))}</p>
      <dl>
        <dt>建议问题</dt>
        <dd>${escapeHtml(fallbackText(item.suggestedQuestion))}</dd>
      </dl>
      <a class="inline-link" href="${hrefs[item.module] || "./career.html"}">进入分析</a>
    </article>
  `).join("");
}

function normalizeArray(items, length) {
  const source = Array.isArray(items) ? items.slice(0, length) : [];
  while (source.length < length) source.push({});
  return source;
}

function setChatAvailable(isAvailable) {
  qs("#chatInput").disabled = !isAvailable;
  qs("#chatSendBtn").disabled = !isAvailable;
  setPromptChipsDisabled(!isAvailable);
  qs("#chatStatus").textContent = isAvailable ? "可追问" : "先完成分析";
}

function setPromptChipsDisabled(isDisabled) {
  document.querySelectorAll("#promptChips button").forEach((button) => {
    button.disabled = isDisabled;
  });
}

function resetChatPanel() {
  setChatAvailable(true);
  qs("#chatMessages").innerHTML = '<div class="chat-placeholder">可以继续追问方向、短板、面试问题或证据不足之处。追问只使用压缩后的 career_profile 和总览，避免反复读取长简历。</div>';
  qs("#chatInput").value = "";
}

function appendChatMessage(role, content = "") {
  const messages = qs("#chatMessages");
  const placeholder = messages.querySelector(".chat-placeholder");
  if (placeholder) placeholder.remove();

  const item = document.createElement("article");
  item.className = `chat-message ${role}`;
  item.innerHTML = `
    <span>${role === "user" ? "你" : "DeepSeek"}</span>
    <p>${escapeHtml(content)}</p>
  `;
  messages.appendChild(item);
  messages.scrollTop = messages.scrollHeight;
  return item.querySelector("p");
}

async function sendChat(questionOverride = "") {
  const question = String(questionOverride || qs("#chatInput").value).trim();
  if (!state.report) {
    showToast("请先完成简历分析");
    return;
  }

  if (!state.careerProfile) {
    showToast("请先生成职业画像");
    return;
  }

  if (!question) {
    showToast("请输入追问问题");
    return;
  }

  const payload = readPayload();
  appendChatMessage("user", question);
  const assistantNode = appendChatMessage("assistant", "");
  qs("#chatInput").value = "";
  setChatBusy(true);

  try {
    const answer = await window.ResumeInsightAPI.streamResumeChat({
      ...payload,
      careerProfile: state.careerProfile,
      report: state.report,
      question,
      history: state.chatHistory,
    }, (_chunk, fullText) => {
      assistantNode.textContent = fullText || "正在生成...";
      qs("#chatMessages").scrollTop = qs("#chatMessages").scrollHeight;
    });

    const finalAnswer = answer.trim();
    assistantNode.textContent = finalAnswer || "没有返回有效内容。";
    state.chatHistory.push({ role: "user", content: question });
    state.chatHistory.push({ role: "assistant", content: finalAnswer });
    state.chatHistory = state.chatHistory.slice(-8);
  } catch (error) {
    assistantNode.textContent = `追问失败：${error.message}`;
    showToast(error.message);
  } finally {
    setChatBusy(false);
  }
}

function exportJson() {
  if (!state.report) return;
  const blob = new Blob([JSON.stringify(state.report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `resume-insight-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function persistAnalysis() {
  if (!state.report || !state.careerProfile) return;
  localStorage.setItem(analysisStorageKey, JSON.stringify({
    careerProfile: state.careerProfile,
    overviewReport: state.report,
    savedAt: new Date().toISOString(),
  }));
}

function fillSample() {
  qs("#ageInput").value = "31";
  qs("#resumeText").value = sampleResume;
  qs("#resumeFile").value = "";
  state.uploadedFile = null;
  state.extractedResumeText = "";
  qs("#fileStatus").textContent = "已填入样例文本。";
  persistDraft();
  showToast("样例已填入");
}

function clearAll() {
  qs("#ageInput").value = "";
  qs("#targetGoalInput").value = "";
  qs("#targetDirectionInput").value = "";
  qs("#anxietyInput").value = "";
  qs("#resumeText").value = "";
  qs("#resumeFile").value = "";
  qs("#fileStatus").textContent = "支持 TXT、MD、PDF、DOCX。";
  qs("#reportContent").hidden = true;
  qs("#emptyState").hidden = false;
  qs("#emptyState").innerHTML = `
    <strong>等待分析</strong>
    <p>系统会先把简历压缩成 career_profile，再生成一份短总览，减少重复 token 消耗。</p>
  `;
  qs("#exportBtn").disabled = true;
  state.report = null;
  state.careerProfile = null;
  state.uploadedFile = null;
  state.extractedResumeText = "";
  state.chatHistory = [];
  qs("#chatMessages").innerHTML = '<div class="chat-placeholder">完成上方分析后，可以在这里追问细节。</div>';
  setChatAvailable(false);
  localStorage.removeItem(storageKey);
  localStorage.removeItem(analysisStorageKey);
  showToast("已清空");
}

function bindEvents() {
  qs("#resumeFile").addEventListener("change", handleFileSelect);
  qs("#analyzeBtn").addEventListener("click", analyze);
  qs("#sampleBtn").addEventListener("click", fillSample);
  qs("#clearBtn").addEventListener("click", clearAll);
  qs("#exportBtn").addEventListener("click", exportJson);
  qs("#chatForm").addEventListener("submit", (event) => {
    event.preventDefault();
    sendChat();
  });
  document.querySelectorAll("#promptChips button").forEach((button) => {
    button.addEventListener("click", () => sendChat(button.dataset.question || ""));
  });
  qs("#ageInput").addEventListener("input", persistDraft);
  qs("#targetGoalInput").addEventListener("change", persistDraft);
  qs("#targetDirectionInput").addEventListener("input", persistDraft);
  qs("#anxietyInput").addEventListener("input", persistDraft);
  qs("#resumeText").addEventListener("input", persistDraft);
}

async function init() {
  bindEvents();
  restoreDraft();
  setChatAvailable(false);
  await refreshHealth();
}

init();
