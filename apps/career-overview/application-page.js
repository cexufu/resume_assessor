const analysisStorageKey = "resume_insight_career_analysis";
const applicationDraftStorageKey = "resume_partner_application_draft";

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

function fallbackText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function showToast(message) {
  const toast = qs("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2400);
}

function readJsonStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

function writeJsonStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function buildDraftFromProfile(saved) {
  const profile = saved?.careerProfile || {};
  const basic = profile.basic || {};
  const experiences = Array.isArray(profile.experienceSummary) ? profile.experienceSummary : [];
  const strengths = Array.isArray(profile.strengths) ? profile.strengths : [];
  const skills = Array.isArray(profile.skills) ? profile.skills : [];
  return {
    generatedAt: new Date().toISOString(),
    basicProfile: {
      age: basic.age || "",
      region: basic.region || "",
      educationStage: basic.educationStage || "",
      major: basic.major || "",
      targetGoal: basic.targetGoal || "",
      targetDirection: basic.targetDirection || "",
      currentThought: basic.currentThought || "",
      anxiety: basic.anxiety || "",
    },
    experienceEntries: experiences.map((item, index) => ({
      id: `exp_${index + 1}`,
      title: item?.title || `经历 ${index + 1}`,
      evidence: item?.evidence || "",
      polished: item?.evidence || "",
    })),
    storyBank: strengths.slice(0, 6).map((item, index) => ({
      id: `story_${index + 1}`,
      title: item?.name || `故事 ${index + 1}`,
      situation: item?.evidence || "",
      action: item?.evidence || "",
      result: item?.evidence || "",
      skills: [item?.name, skills[index]?.name].filter(Boolean),
    })),
  };
}

const state = {
  analysis: null,
  draft: null,
};

function ensureDraft() {
  const saved = readJsonStorage(applicationDraftStorageKey);
  if (saved && typeof saved === "object") return saved;
  const draft = buildDraftFromProfile(state.analysis);
  writeJsonStorage(applicationDraftStorageKey, draft);
  return draft;
}

async function hydrateDraftFromApi() {
  try {
    const report = await window.ResumeInsightAPI.createApplicationDraft({
      careerProfile: state.analysis.careerProfile,
    });
    writeJsonStorage(applicationDraftStorageKey, report);
    return report;
  } catch {
    return ensureDraft();
  }
}

function calculateProgress(draft) {
  const basic = draft.basicProfile || {};
  const basicFields = ["educationStage", "major", "targetGoal", "targetDirection"];
  const basicScore = basicFields.filter((key) => fallbackText(basic[key])).length;
  const experienceScore = Array.isArray(draft.experienceEntries) ? Math.min(3, draft.experienceEntries.filter((item) => fallbackText(item?.evidence)).length) : 0;
  const storyScore = Array.isArray(draft.storyBank) ? Math.min(3, draft.storyBank.filter((item) => fallbackText(item?.situation) || fallbackText(item?.action)).length) : 0;
  const total = basicScore + experienceScore + storyScore;
  return Math.round((total / 10) * 100);
}

function renderBasicGrid() {
  const basic = state.draft.basicProfile || {};
  const fields = [
    ["educationStage", "当前阶段", "例如：本科 / 硕士 / 在职"],
    ["major", "专业 / 背景", "例如：新闻传播 / 生物 / 商科"],
    ["targetGoal", "当前目标", "例如：找工作 / 留学申请 / 转行"],
    ["targetDirection", "想去的方向", "例如：数据分析 / 品牌战略"],
    ["region", "所在地区", "例如：北京 / 上海 / 海外"],
    ["age", "年龄", "例如：22 / 31"],
    ["currentThought", "现在的想法", "你现在最在意的方向和顾虑", true],
    ["anxiety", "当前课题", "你最想解决的问题是什么", true],
  ];
  qs("#basicDraftGrid").innerHTML = fields.map(([key, label, placeholder, wide]) => `
    <label class="field ${wide ? "wide" : ""}">
      <span>${escapeHtml(label)}</span>
      ${wide
        ? `<textarea data-basic-key="${escapeHtml(key)}" class="compact-textarea" placeholder="${escapeHtml(placeholder)}">${escapeHtml(fallbackText(basic[key]))}</textarea>`
        : `<input data-basic-key="${escapeHtml(key)}" type="text" maxlength="260" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(fallbackText(basic[key]))}" />`}
    </label>
  `).join("");
}

function renderExperienceList() {
  const items = Array.isArray(state.draft.experienceEntries) ? state.draft.experienceEntries : [];
  if (!items.length) {
    qs("#experienceDraftList").innerHTML = '<div class="draft-empty">这里还没有经历底稿。你可以先新增一条，或者回到总结果页重新生成职业画像。</div>';
    return;
  }
  qs("#experienceDraftList").innerHTML = items.map((item, index) => `
    <article class="draft-entry-card">
      <div class="draft-entry-card-head">
        <strong>${escapeHtml(fallbackText(item.title, `经历 ${index + 1}`))}</strong>
        <div class="draft-inline-actions">
          <button type="button" data-action="polish-experience" data-id="${escapeHtml(item.id)}">润色成申请表达</button>
          <button type="button" data-action="remove-experience" data-id="${escapeHtml(item.id)}">删除</button>
        </div>
      </div>
      <div class="draft-entry-grid">
        <label class="field">
          <span>标题</span>
          <input data-entry-key="title" data-id="${escapeHtml(item.id)}" type="text" maxlength="160" value="${escapeHtml(fallbackText(item.title))}" />
        </label>
        <label class="field wide">
          <span>事实底稿</span>
          <textarea data-entry-key="evidence" data-id="${escapeHtml(item.id)}" class="compact-textarea">${escapeHtml(fallbackText(item.evidence))}</textarea>
        </label>
        <label class="field wide">
          <span>申请表达</span>
          <textarea data-entry-key="polished" data-id="${escapeHtml(item.id)}" class="compact-textarea">${escapeHtml(fallbackText(item.polished))}</textarea>
        </label>
      </div>
    </article>
  `).join("");
}

function renderStoryBank() {
  const items = Array.isArray(state.draft.storyBank) ? state.draft.storyBank : [];
  if (!items.length) {
    qs("#storyBankList").innerHTML = '<div class="draft-empty">这里还没有故事库。等你整理出更多经历之后，这里会越来越像你。</div>';
    return;
  }
  qs("#storyBankList").innerHTML = items.map((item, index) => `
    <article class="draft-entry-card">
      <div class="draft-entry-card-head">
        <strong>${escapeHtml(fallbackText(item.title, `故事 ${index + 1}`))}</strong>
        <div class="draft-inline-actions">
          <button type="button" data-action="polish-story" data-id="${escapeHtml(item.id)}">压缩成 STAR</button>
        </div>
      </div>
      <div class="draft-entry-grid">
        <label class="field">
          <span>故事标题</span>
          <input data-story-key="title" data-id="${escapeHtml(item.id)}" type="text" maxlength="160" value="${escapeHtml(fallbackText(item.title))}" />
        </label>
        <label class="field">
          <span>能力标签</span>
          <input data-story-key="skills" data-id="${escapeHtml(item.id)}" type="text" maxlength="260" value="${escapeHtml((Array.isArray(item.skills) ? item.skills : []).join(" / "))}" />
        </label>
        <label class="field wide">
          <span>场景</span>
          <textarea data-story-key="situation" data-id="${escapeHtml(item.id)}" class="compact-textarea">${escapeHtml(fallbackText(item.situation))}</textarea>
        </label>
        <label class="field wide">
          <span>动作</span>
          <textarea data-story-key="action" data-id="${escapeHtml(item.id)}" class="compact-textarea">${escapeHtml(fallbackText(item.action))}</textarea>
        </label>
        <label class="field wide">
          <span>结果</span>
          <textarea data-story-key="result" data-id="${escapeHtml(item.id)}" class="compact-textarea">${escapeHtml(fallbackText(item.result))}</textarea>
        </label>
      </div>
    </article>
  `).join("");
}

function renderDraft() {
  const progress = calculateProgress(state.draft);
  qs("#applicationProgressLabel").textContent = `${progress}%`;
  qs("#applicationProgressBar").style.width = `${progress}%`;
  qs("#applicationSummaryCopy").textContent = progress >= 70
    ? "你已经把很多重要线索放进底稿里了，后面的网申和问答会更有底气。"
    : "先把最重要的几块写清楚，后面的表达会顺很多。";
  const modeLine = qs("#applicationModeLine");
  if (state.draft?.meta?.fallback) {
    modeLine.hidden = false;
    modeLine.textContent = "当前是本地草稿模式：因为本地没有配置 DeepSeek key，所以先用职业画像生成一版可编辑底稿。";
  } else {
    modeLine.hidden = true;
    modeLine.textContent = "";
  }
  renderBasicGrid();
  renderExperienceList();
  renderStoryBank();
}

function persistDraft() {
  writeJsonStorage(applicationDraftStorageKey, state.draft);
  renderDraft();
}

function bindEvents() {
  qs("#basicDraftGrid").addEventListener("input", (event) => {
    const target = event.target.closest("[data-basic-key]");
    if (!target) return;
    state.draft.basicProfile[target.dataset.basicKey] = target.value;
    persistDraft();
  });

  qs("#experienceDraftList").addEventListener("input", (event) => {
    const target = event.target.closest("[data-entry-key]");
    if (!target) return;
    const item = state.draft.experienceEntries.find((entry) => entry.id === target.dataset.id);
    if (!item) return;
    item[target.dataset.entryKey] = target.value;
    persistDraft();
  });

  qs("#experienceDraftList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const id = button.dataset.id;
    if (button.dataset.action === "remove-experience") {
      state.draft.experienceEntries = state.draft.experienceEntries.filter((item) => item.id !== id);
      persistDraft();
      showToast("这条经历已移出底稿");
      return;
    }
    if (button.dataset.action === "polish-experience") {
      const item = state.draft.experienceEntries.find((entry) => entry.id === id);
      if (!item) return;
      item.polished = item.evidence ? `我在 ${item.title} 中，围绕“${item.evidence}”形成了更清楚的经历表达。` : item.polished;
      persistDraft();
      showToast("已生成一版更正式的申请表达");
    }
  });

  qs("#storyBankList").addEventListener("input", (event) => {
    const target = event.target.closest("[data-story-key]");
    if (!target) return;
    const item = state.draft.storyBank.find((entry) => entry.id === target.dataset.id);
    if (!item) return;
    if (target.dataset.storyKey === "skills") {
      item.skills = target.value.split("/").map((part) => part.trim()).filter(Boolean);
    } else {
      item[target.dataset.storyKey] = target.value;
    }
    persistDraft();
  });

  qs("#storyBankList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-action='polish-story']");
    if (!button) return;
    const item = state.draft.storyBank.find((entry) => entry.id === button.dataset.id);
    if (!item) return;
    item.action = item.action || item.situation;
    item.result = item.result || item.action;
    persistDraft();
    showToast("这条故事已经更接近可回答的 STAR 结构");
  });

  qs("#addExperienceBtn").addEventListener("click", () => {
    state.draft.experienceEntries.push({
      id: `exp_${Date.now()}`,
      title: "新的经历",
      evidence: "",
      polished: "",
    });
    persistDraft();
    showToast("已新增一条经历底稿");
  });

  qs("#saveApplicationBtn").addEventListener("click", () => {
    persistDraft();
    showToast("申请底稿已保存到本地");
  });
}

async function init() {
  state.analysis = readJsonStorage(analysisStorageKey);
  if (!state.analysis?.careerProfile) {
    qs("#applicationFallback").hidden = false;
    document.querySelectorAll(".journey-page > section:not(#applicationFallback):not(.journey-hero)").forEach((section) => {
      section.hidden = true;
    });
    return;
  }
  state.draft = await hydrateDraftFromApi();
  renderDraft();
  bindEvents();
  showToast(state.draft?.meta?.fallback ? "当前是本地底稿模式" : "申请底稿已生成");
}

init();
