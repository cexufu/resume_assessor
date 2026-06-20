const moduleConfig = {
  career: {
    title: "职业方向分析",
    empty: "从总览页生成职业画像后，这里会基于画像和补充信息分析岗位方向。",
  },
  study: {
    title: "留学与专业推荐",
    empty: "从总览页生成职业画像后，这里会基于画像和申请条件分析专业方向。",
  },
  ability: {
    title: "能力地图",
    empty: "从总览页生成职业画像后，这里会基于画像和自评生成能力地图。",
  },
};

const storageKey = "resume_insight_career_analysis";
const moduleType = document.body.dataset.moduleType;
const state = {
  analysis: null,
  report: null,
  isAnalyzing: false,
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
    runButton.textContent = isBusy ? "生成中..." : "生成深度分析";
  }
  setText("#moduleStatus", state.analysis?.careerProfile ? (isBusy ? "正在分析" : "可生成") : "缺少画像");
}

function renderProfileSummary() {
  const profile = state.analysis?.careerProfile;
  if (!profile) {
    qs("#profileSummary").innerHTML = `
      <strong>还没有职业画像</strong>
      <p>请先回到总览页上传简历并生成职业画像。</p>
      <a class="primary-link" href="./index.html">返回总览页</a>
    `;
    setBusy(false);
    qs("#runModuleBtn").disabled = true;
    qs("#moduleOutput").innerHTML = `<div class="chat-placeholder">${moduleConfig[moduleType]?.empty || "请先生成职业画像。"}</div>`;
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
    qs("#moduleOutput").innerHTML = '<div class="chat-placeholder">正在生成当前子页面分析，不会重复读取完整简历。</div>';
    const report = await window.ResumeInsightAPI.analyzeModule(moduleType, {
      careerProfile: state.analysis.careerProfile,
      moduleInput: readModuleInput(),
    });
    state.report = report;
    renderModuleReport(report);
    showToast("深度分析已生成");
  } catch (error) {
    qs("#moduleOutput").innerHTML = `<div class="chat-placeholder">深度分析失败：${escapeHtml(error.message)}</div>`;
    showToast(error.message);
  } finally {
    setBusy(false);
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

function renderCareerModule(report) {
  const summary = report.summary || {};
  const directions = Array.isArray(report.directions) ? report.directions.slice(0, 5) : [];
  const actionPlan = report.actionPlan || {};
  return `
    <div class="module-output-content">
      <section class="module-output-section">
        <h4>职业判断</h4>
        <p>${escapeHtml(fallbackText(summary.oneLine))}</p>
        <p>${escapeHtml(fallbackText(summary.bestFit))}</p>
      </section>
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
    </div>
  `;
}

function renderStudyModule(report) {
  const summary = report.summary || {};
  const majors = Array.isArray(report.recommendedMajors) ? report.recommendedMajors.slice(0, 5) : [];
  return `
    <div class="module-output-content">
      <section class="module-output-section">
        <h4>申请策略</h4>
        <p>${escapeHtml(fallbackText(summary.oneLine))}</p>
        <p>${escapeHtml(fallbackText(summary.strategy))}</p>
      </section>
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
    </div>
  `;
}

function renderAbilityModule(report) {
  const summary = report.summary || {};
  const radar = Array.isArray(report.abilityRadar) ? report.abilityRadar.slice(0, 6) : [];
  const milestone = report.nextMilestone || {};
  return `
    <div class="module-output-content">
      <section class="module-output-section">
        <h4>能力画像</h4>
        <p>${escapeHtml(fallbackText(summary.oneLine))}</p>
        <p>类型标签：${escapeHtml(fallbackText(summary.typeLabel))}</p>
      </section>
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
}

async function init() {
  const config = moduleConfig[moduleType] || moduleConfig.career;
  qs("#moduleTitle").textContent = config.title;
  qs("#moduleOutput").innerHTML = `<div class="chat-placeholder">${config.empty}</div>`;
  bindEvents();
  loadAnalysis();
  renderProfileSummary();
  setBusy(false);
  await refreshHealth();
}

init();
