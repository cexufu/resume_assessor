const moduleConfig = {
  career: {
    title: "职业方向分析",
    empty: "从总结果页生成职业画像后，这里会基于画像和你的职业目标，继续探索职业路线。",
    chatPlaceholder: "完成本页分析后，可以继续追问方向风险、岗位选择和下一步动作。",
    chatReadyPlaceholder: "可以继续追问方向风险、岗位选择和下一步动作。",
    chatInputPlaceholder: "例如：如果我先投这个方向，最大的风险是什么？",
    chatPrompts: [
      "我该优先投哪些岗位？",
      "这条路线最大的风险是什么？",
      "下一步最值得补的证据是什么？",
    ],
  },
  study: {
    title: "留学与专业推荐",
    empty: "从总结果页生成职业画像后，这里会基于画像和你的申请目标，继续探索专业方向。",
    chatPlaceholder: "完成本页分析后，可以继续追问专业匹配、申请短板和职业连接。",
    chatReadyPlaceholder: "可以继续追问专业匹配、申请短板和职业连接。",
    chatInputPlaceholder: "例如：我现在最该补哪个申请短板？",
    chatPrompts: [
      "我更适合申请哪类专业？",
      "我现在最该补哪个申请短板？",
      "这个方向和未来职业怎么连接？",
    ],
  },
  ability: {
    title: "能力地图",
    empty: "从总结果页生成职业画像后，这里会基于画像和你的能力偏好，继续展开能力地图。",
    chatPlaceholder: "完成本页分析后，可以继续追问能力短板、迁移场景和训练任务。",
    chatReadyPlaceholder: "可以继续追问能力短板、迁移场景和训练任务。",
    chatInputPlaceholder: "例如：我最该先补哪项能力？",
    chatPrompts: [
      "我最该先补哪项能力？",
      "哪项能力最容易迁移到新岗位？",
      "我应该先做什么训练任务？",
    ],
  },
};

const storageKey = "resume_insight_career_analysis";
const moduleType = document.body.dataset.moduleType;
const state = {
  analysis: null,
  report: null,
  isAnalyzing: false,
  isChatting: false,
  chatHistory: [],
  loadingTimer: null,
};

function qs(selector) {
  return document.querySelector(selector);
}

function setText(selector, value) {
  const element = qs(selector);
  if (element) element.textContent = value;
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
  return text || "信息不足";
}

function normalizeArray(items, length) {
  const source = Array.isArray(items) ? items.slice(0, length) : [];
  while (source.length < length) source.push({});
  return source;
}

function showToast(message) {
  const toast = qs("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2400);
}

function setPromptChipsDisabled(isDisabled) {
  document.querySelectorAll("#modulePromptChips button").forEach((button) => {
    button.disabled = isDisabled;
  });
}

function loadAnalysis() {
  try {
    state.analysis = JSON.parse(localStorage.getItem(storageKey) || "null");
  } catch {
    localStorage.removeItem(storageKey);
    state.analysis = null;
  }
}

function setBusy(isBusy) {
  state.isAnalyzing = isBusy;
  const runButton = qs("#runModuleBtn");
  if (runButton) {
    runButton.disabled = isBusy || !state.analysis?.careerProfile;
    runButton.textContent = isBusy ? "正在生成..." : "生成深度分析";
  }
  setText("#moduleStatus", state.analysis?.careerProfile ? (isBusy ? "正在分析" : "可生成") : "缺少画像");
}

function setChatAvailable(isAvailable) {
  const config = moduleConfig[moduleType] || moduleConfig.career;
  const input = qs("#moduleChatInput");
  const sendButton = qs("#moduleChatSendBtn");
  if (input) {
    input.disabled = !isAvailable;
    input.placeholder = config.chatInputPlaceholder;
  }
  if (sendButton) sendButton.disabled = !isAvailable;
  setPromptChipsDisabled(!isAvailable);
}

function setChatBusy(isBusy) {
  state.isChatting = isBusy;
  const input = qs("#moduleChatInput");
  const sendButton = qs("#moduleChatSendBtn");
  if (input) input.disabled = isBusy || !state.report;
  if (sendButton) {
    sendButton.disabled = isBusy || !state.report;
    sendButton.textContent = isBusy ? "回答中..." : "发送";
  }
  setPromptChipsDisabled(isBusy || !state.report);
}

function renderProfileSummary() {
  const profile = state.analysis?.careerProfile;
  if (!profile) {
    qs("#profileSummary").innerHTML = `
      <strong>还没有职业画像</strong>
      <p>请先回到总结果页上传简历并生成职业画像。</p>
      <a class="primary-link" href="./index.html#overviewReport">返回总结果页</a>
    `;
    setBusy(false);
    setChatAvailable(false);
    qs("#runModuleBtn").disabled = true;
    qs("#moduleOutput").innerHTML = `<div class="chat-placeholder">${moduleConfig[moduleType]?.empty || "请先生成职业画像。"}</div>`;
    resetChatPanel();
    return;
  }

  const basic = profile.basic || {};
  const strengths = Array.isArray(profile.strengths) ? profile.strengths.slice(0, 3) : [];
  qs("#profileSummary").innerHTML = `
    <strong>${escapeHtml(fallbackText(basic.targetGoal || basic.targetDirection || "已生成职业画像"))}</strong>
    <p>${escapeHtml(fallbackText(basic.educationStage))} · ${escapeHtml(fallbackText(basic.major))} · ${escapeHtml(fallbackText(basic.anxiety))}</p>
    <div class="tag-row">
      ${strengths.map((item) => `<span>${escapeHtml(fallbackText(item.name))}</span>`).join("") || "<span>信息不足</span>"}
    </div>
  `;
}

function readModuleInput() {
  return {
    targetIndustry: qs("#targetIndustryInput")?.value.trim(),
    targetRole: qs("#targetRoleInput")?.value.trim(),
    targetCity: qs("#targetCityInput")?.value.trim(),
    salaryExpectation: qs("#salaryExpectationInput")?.value.trim(),
    acceptTransition: qs("#acceptTransitionInput")?.value.trim(),
    studyCountry: qs("#studyCountryInput")?.value.trim(),
    studyBudget: qs("#studyBudgetInput")?.value.trim(),
    gpa: qs("#gpaInput")?.value.trim(),
    languageScore: qs("#languageScoreInput")?.value.trim(),
    selfAssessment: qs("#selfAssessmentInput")?.value.trim(),
    extraQuestion: qs("#moduleQuestionInput")?.value.trim(),
  };
}

async function runModule() {
  if (!state.analysis?.careerProfile) {
    showToast("请先回到总览页生成职业画像");
    return;
  }

  try {
    setBusy(true);
    state.chatHistory = [];
    state.report = null;
    resetChatPanel();
    showModuleLoadingState();
    const report = await window.ResumeInsightAPI.analyzeModule(moduleType, {
      careerProfile: state.analysis.careerProfile,
      moduleInput: readModuleInput(),
    });
    state.report = report;
    renderModuleReport(report);
    resetChatPanel();
    showToast("深度分析已生成");
  } catch (error) {
    qs("#moduleOutput").innerHTML = `<div class="chat-placeholder">深度分析失败：${escapeHtml(error.message)}</div>`;
    resetChatPanel();
    showToast(error.message);
  } finally {
    stopModuleLoadingState();
    setBusy(false);
  }
}

function showModuleLoadingState() {
  stopModuleLoadingState();
  const labels = {
    career: ["正在探索职业路线", "正在探索可能"],
    study: ["正在探索专业方向", "正在探索可能"],
    ability: ["正在展开能力地图", "正在探索可能"],
  };
  const [title, message] = labels[moduleType] || labels.career;
  qs("#moduleOutput").innerHTML = `
    <div class="module-loading">
      <strong id="moduleLoadingTitle">${escapeHtml(title)}</strong>
      <p id="moduleLoadingMessage">${escapeHtml(message)}</p>
      <div class="loading-track" aria-hidden="true"><span id="moduleLoadingBar"></span></div>
      <ol class="loading-steps">
        <li class="active">读取画像</li>
        <li id="moduleStepReasoning">生成判断</li>
        <li id="moduleStepWrap">收束行动建议</li>
      </ol>
    </div>
  `;
  const startedAt = Date.now();
  const update = () => {
    const elapsed = Date.now() - startedAt;
    const bar = qs("#moduleLoadingBar");
    if (!bar) return;
    bar.style.width = `${Math.min(90, 22 + Math.floor(elapsed / 800))}%`;
    if (elapsed > 10_000) qs("#moduleStepReasoning")?.classList.add("active");
    if (elapsed > 24_000) {
      qs("#moduleStepReasoning")?.classList.add("done");
      qs("#moduleStepWrap")?.classList.add("active");
      qs("#moduleLoadingMessage").textContent = "模型仍在工作，请保持页面打开；本次请求有独立 token 限制。";
    }
  };
  update();
  state.loadingTimer = window.setInterval(update, 800);
}

function stopModuleLoadingState() {
  if (state.loadingTimer) {
    window.clearInterval(state.loadingTimer);
    state.loadingTimer = null;
  }
}

function listHtml(items, mapper = (item) => item) {
  const source = Array.isArray(items) && items.length ? items : ["信息不足"];
  return `<ul class="module-list">${source.map((item) => `<li>${escapeHtml(fallbackText(mapper(item)))}</li>`).join("")}</ul>`;
}

function tagRow(items) {
  const source = Array.isArray(items) && items.length ? items : ["信息不足"];
  return `<div class="tag-row">${source.map((item) => `<span>${escapeHtml(fallbackText(item))}</span>`).join("")}</div>`;
}

function moduleHero(title, subtitle, items = []) {
  const chips = items.filter(Boolean).slice(0, 4);
  return `
    <section class="module-first-screen">
      <span class="eyebrow">First screen</span>
      <h3>${escapeHtml(fallbackText(title))}</h3>
      <p>${escapeHtml(fallbackText(subtitle))}</p>
      ${chips.length ? tagRow(chips) : ""}
    </section>
  `;
}

function renderModuleReport(report) {
  const renderers = {
    career: renderCareerModule,
    study: renderStudyModule,
    ability: renderAbilityModule,
  };
  const renderer = renderers[moduleType];
  qs("#moduleOutput").innerHTML = renderer
    ? renderer(report)
    : `<pre>${escapeHtml(JSON.stringify(report, null, 2))}</pre>`;
}

function renderChatPrompts() {
  const container = qs("#modulePromptChips");
  if (!container) return;
  const prompts = (moduleConfig[moduleType] || moduleConfig.career).chatPrompts || [];
  container.innerHTML = prompts.map((prompt) => `<button type="button" data-question="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`).join("");
}

function resetChatPanel() {
  const config = moduleConfig[moduleType] || moduleConfig.career;
  const messages = qs("#moduleChatMessages");
  if (messages) {
    messages.innerHTML = `<div class="chat-placeholder">${escapeHtml(state.report ? config.chatReadyPlaceholder : config.chatPlaceholder)}</div>`;
  }
  const input = qs("#moduleChatInput");
  if (input) input.value = "";
  setChatAvailable(Boolean(state.report));
}

function appendChatMessage(role, content = "") {
  const messages = qs("#moduleChatMessages");
  const placeholder = messages?.querySelector(".chat-placeholder");
  if (placeholder) placeholder.remove();

  const item = document.createElement("article");
  item.className = `chat-message ${role}`;
  item.innerHTML = `
    <span>${role === "user" ? "你" : "DeepSeek"}</span>
    <p>${escapeHtml(content)}</p>
  `;
  messages?.appendChild(item);
  if (messages) messages.scrollTop = messages.scrollHeight;
  return item.querySelector("p");
}

async function sendChat(questionOverride = "") {
  if (!state.analysis?.careerProfile) {
    showToast("请先回到总结果页生成职业画像");
    return;
  }

  if (!state.report) {
    showToast("请先完成本页分析");
    return;
  }

  const question = String(questionOverride || qs("#moduleChatInput")?.value || "").trim();
  if (!question) {
    showToast("请输入追问问题");
    return;
  }

  appendChatMessage("user", question);
  const assistantNode = appendChatMessage("assistant", "");
  if (qs("#moduleChatInput")) qs("#moduleChatInput").value = "";
  setChatBusy(true);

  try {
    const answer = await window.ResumeInsightAPI.streamResumeChat({
      careerProfile: state.analysis.careerProfile,
      report: {
        moduleType,
        moduleReport: state.report,
      },
      question,
      history: state.chatHistory,
    }, (_chunk, fullText) => {
      assistantNode.textContent = fullText || "正在生成...";
      qs("#moduleChatMessages").scrollTop = qs("#moduleChatMessages").scrollHeight;
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

function renderExplorationBlocks(report) {
  const possibilities = Array.isArray(report.possibilityNotes) ? report.possibilityNotes.slice(0, 2) : [];
  const paths = Array.isArray(report.pathCombinations) ? report.pathCombinations.slice(0, 2) : [];
  if (!possibilities.length && !paths.length) return "";

  return `
    <section class="module-output-section">
      <h4>可能性发现</h4>
      ${listHtml(possibilities, (item) => `${item.title || "新可能性"}：${item.reason || item.firstTry || "信息不足"}`)}
    </section>
    <section class="module-output-section">
      <h4>轻量路径组合</h4>
      ${listHtml(paths, (item) => `${item.name || "路径"}：${item.focus || ""} ${item.nextStep || ""}`)}
    </section>
  `;
}

function renderStrategicLayer(report) {
  const layer = report.strategicLayer || {};
  if (!layer.currentLevel && !layer.why && !layer.upgradeMove) return "";

  const levelLabels = {
    execution: "执行型",
    tactical: "战术型",
    strategic: "战略型",
  };

  return `
    <section class="module-output-section">
      <h4>层级判断</h4>
      <p>${escapeHtml(levelLabels[layer.currentLevel] || fallbackText(layer.currentLevel))}</p>
      <p>${escapeHtml(fallbackText(layer.why))}</p>
      <p>${escapeHtml(fallbackText(layer.upgradeMove))}</p>
    </section>
  `;
}

function renderFollowUpQuestions(report) {
  const questions = Array.isArray(report.followUpQuestions) ? report.followUpQuestions.slice(0, 3) : [];
  if (!questions.length) return "";

  return `
    <section class="module-output-section">
      <h4>可以继续追问</h4>
      ${listHtml(questions)}
    </section>
  `;
}

function renderCareerModule(report) {
  const summary = report.summary || {};
  const directions = Array.isArray(report.directions) ? report.directions.slice(0, 5) : [];
  const actionPlan = report.actionPlan || {};
  return `
    <div class="module-output-content">
      ${moduleHero(
        summary.bestFit || "先判断最适合进入哪类岗位",
        summary.oneLine || "职业页会比较适配、风险和第一步动作。",
        ["最高薪", "最快上岸", "低阻力过渡", "均衡路线"],
      )}
      <section class="module-output-section">
        <h4>职业判断</h4>
        <p>${escapeHtml(fallbackText(summary.oneLine))}</p>
        <p>${escapeHtml(fallbackText(summary.bestFit))}</p>
      </section>
      ${renderStrategicLayer(report)}
      <section class="module-output-section">
        <h4>推荐方向</h4>
        <div class="card-grid three">
          ${normalizeArray(directions, Math.max(3, directions.length || 3)).map((item, index) => `
            <article class="result-card direction-card">
              <span class="card-index">${index + 1}</span>
              <h4>${escapeHtml(fallbackText(item.title))}</h4>
              <p>匹配度：${escapeHtml(fallbackText(item.matchScore))}</p>
              <dl>
                <dt>证据</dt>
                <dd>${escapeHtml(fallbackText(item.evidence))}</dd>
                <dt>风险</dt>
                <dd>${escapeHtml(fallbackText(item.risk))}</dd>
                <dt>第一步</dt>
                <dd>${escapeHtml(fallbackText(item.firstStep))}</dd>
              </dl>
            </article>
          `).join("")}
        </div>
      </section>
      <section class="module-output-section">
        <h4>岗位关键词</h4>
        ${tagRow(report.keywords)}
      </section>
      ${renderExplorationBlocks(report)}
      <section class="module-output-section">
        <h4>行动计划</h4>
        ${listHtml([...(actionPlan.days30 || []), ...(actionPlan.days60 || []), ...(actionPlan.days90 || [])])}
      </section>
      <section class="module-output-section">
        <h4>仍缺信息</h4>
        ${listHtml(report.missingInformation)}
      </section>
      ${renderFollowUpQuestions(report)}
    </div>
  `;
}

function renderStudyModule(report) {
  const summary = report.summary || {};
  const majors = Array.isArray(report.recommendedMajors) ? report.recommendedMajors.slice(0, 5) : [];
  return `
    <div class="module-output-content">
      ${moduleHero(
        summary.oneLine || "先判断专业方向和申请约束",
        summary.strategy || "留学页不会虚构学校或录取概率，会先说专业连接、申请短板和仍缺信息。",
        ["专业匹配", "申请短板", "职业连接", "预算/GPA/语言"],
      )}
      <section class="module-output-section">
        <h4>申请策略</h4>
        <p>${escapeHtml(fallbackText(summary.oneLine))}</p>
        <p>${escapeHtml(fallbackText(summary.strategy))}</p>
      </section>
      ${renderStrategicLayer(report)}
      <section class="module-output-section">
        <h4>推荐专业方向</h4>
        <div class="card-grid three">
          ${normalizeArray(majors, Math.max(3, majors.length || 3)).map((item, index) => `
            <article class="result-card direction-card">
              <span class="card-index">${index + 1}</span>
              <h4>${escapeHtml(fallbackText(item.name))}</h4>
              <p>匹配度：${escapeHtml(fallbackText(item.matchScore))}</p>
              <dl>
                <dt>证据</dt>
                <dd>${escapeHtml(fallbackText(item.evidence))}</dd>
                <dt>职业路径</dt>
                <dd>${escapeHtml(fallbackText(item.careerPath))}</dd>
                <dt>风险</dt>
                <dd>${escapeHtml(fallbackText(item.risk))}</dd>
              </dl>
            </article>
          `).join("")}
        </div>
      </section>
      <section class="module-output-section">
        <h4>不建议优先选择</h4>
        ${listHtml(report.notRecommended, (item) => `${item.name || "方向"}：${item.reason || "信息不足"}`)}
      </section>
      ${renderExplorationBlocks(report)}
      <section class="module-output-section">
        <h4>申请短板和下一步</h4>
        ${listHtml([...(report.applicationGaps || []), ...(report.nextSteps || [])])}
      </section>
      <section class="module-output-section">
        <h4>仍缺信息</h4>
        ${listHtml(report.missingInformation)}
      </section>
      ${renderFollowUpQuestions(report)}
    </div>
  `;
}

function renderAbilityModule(report) {
  const summary = report.summary || {};
  const radar = Array.isArray(report.abilityRadar) ? report.abilityRadar.slice(0, 6) : [];
  const milestone = report.nextMilestone || {};
  return `
    <div class="module-output-content">
      ${moduleHero(
        summary.typeLabel || "先判断你的能力类型",
        summary.oneLine || "能力页会把经历转译成可迁移能力、瓶颈和训练任务。",
        ["可迁移能力", "能力雷达", "瓶颈", "训练任务"],
      )}
      <section class="module-output-section">
        <h4>能力画像</h4>
        <p>${escapeHtml(fallbackText(summary.oneLine))}</p>
        <p>类型标签：${escapeHtml(fallbackText(summary.typeLabel))}</p>
      </section>
      ${renderStrategicLayer(report)}
      <section class="module-output-section">
        <h4>能力雷达</h4>
        <div class="card-grid three">
          ${normalizeArray(radar, Math.max(3, radar.length || 3)).map((item, index) => `
            <article class="result-card direction-card">
              <span class="card-index">${index + 1}</span>
              <h4>${escapeHtml(fallbackText(item.name))}</h4>
              <p>评分：${escapeHtml(fallbackText(item.score))} / 10</p>
              <p>${escapeHtml(fallbackText(item.evidence))}</p>
            </article>
          `).join("")}
        </div>
      </section>
      <section class="module-output-section">
        <h4>可迁移能力</h4>
        ${listHtml(report.transferableAbilities, (item) => `${item.name || "能力"}：${item.usableScenes || "信息不足"}`)}
      </section>
      ${renderExplorationBlocks(report)}
      <section class="module-output-section">
        <h4>瓶颈和训练任务</h4>
        ${listHtml([...(report.bottlenecks || []), ...(report.trainingTasks || []).map((item) => `${item.task || "训练任务"}：${item.purpose || ""} ${item.timeCost || ""}`)])}
      </section>
      <section class="module-output-section">
        <h4>下一阶段里程碑</h4>
        <p>${escapeHtml(fallbackText(milestone.title))}</p>
        <p>${escapeHtml(fallbackText(milestone.criteria))}</p>
      </section>
      ${renderFollowUpQuestions(report)}
    </div>
  `;
}

function exportJson() {
  if (!state.report) return;
  const blob = new Blob([JSON.stringify(state.report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${moduleType}-analysis-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function refreshHealth() {
  try {
    const health = await window.ResumeInsightAPI.getHealth();
    qs("#apiStatus").textContent = health.hasDeepSeekKey ? "DeepSeek 已配置" : "DeepSeek 未配置";
    qs("#apiStatus").classList.toggle("ok", Boolean(health.hasDeepSeekKey));
  } catch {
    qs("#apiStatus").textContent = "后端未启动";
    qs("#apiStatus").classList.remove("ok");
  }
}

function bindEvents() {
  qs("#runModuleBtn").addEventListener("click", runModule);
  qs("#exportBtn").addEventListener("click", exportJson);
  qs("#moduleChatForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    sendChat();
  });
  document.querySelectorAll("#modulePromptChips button").forEach((button) => {
    button.addEventListener("click", () => sendChat(button.dataset.question || ""));
  });
}

async function init() {
  const config = moduleConfig[moduleType] || moduleConfig.career;
  qs("#moduleTitle").textContent = config.title;
  qs("#moduleOutput").innerHTML = `<div class="chat-placeholder">${config.empty}</div>`;
  renderChatPrompts();
  bindEvents();
  loadAnalysis();
  renderProfileSummary();
  resetChatPanel();
  setBusy(false);
  await refreshHealth();
}

init();
