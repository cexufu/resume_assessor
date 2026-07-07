const analysisStorageKey = "resume_insight_career_analysis";
const applicationDraftStorageKey = "resume_partner_application_draft";
const qaDraftStorageKey = "resume_partner_qa_draft";

const qaTemplates = [
  { id: "why_role", label: "Why this role", prompt: "为什么你适合这个岗位？" },
  { id: "why_company", label: "Why this company", prompt: "为什么你想来这家公司？" },
  { id: "self_intro", label: "自我介绍", prompt: "请做一个 1 分钟自我介绍。" },
  { id: "strength", label: "你的优势", prompt: "你最突出的优势是什么？" },
  { id: "weakness", label: "你的短板", prompt: "你的短板是什么，你怎么面对它？" },
  { id: "why_major", label: "Why this major", prompt: "为什么你适合申请这个专业？" },
];

const state = {
  analysis: null,
  draft: null,
  selectedTemplate: qaTemplates[0],
  lastOutput: null,
};

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

function renderTemplateChips() {
  qs("#qaTemplateChips").innerHTML = qaTemplates.map((item) => `
    <button class="qa-template-chip ${item.id === state.selectedTemplate.id ? "active" : ""}" type="button" data-template-id="${escapeHtml(item.id)}">${escapeHtml(item.label)}</button>
  `).join("");
}

function getStoryBank() {
  return Array.isArray(state.draft?.storyBank) ? state.draft.storyBank : [];
}

function pickEvidence(templateId) {
  const stories = getStoryBank();
  if (!stories.length) return [];
  const keywordMap = {
    why_role: ["分析", "执行", "结构化", "推进"],
    why_company: ["成长", "协作", "判断", "目标"],
    self_intro: ["经历", "能力", "目标"],
    strength: ["能力", "结构化", "协作", "推进"],
    weakness: ["短板", "补齐", "学习"],
    why_major: ["研究", "背景", "能力", "方向"],
  };
  const keywords = keywordMap[templateId] || [];
  const scored = stories.map((story) => {
    const haystack = `${story.title || ""} ${story.situation || ""} ${(Array.isArray(story.skills) ? story.skills.join(" ") : "")}`;
    const score = keywords.reduce((sum, keyword) => sum + (haystack.includes(keyword) ? 1 : 0), 0);
    return { story, score };
  }).sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((item) => item.story);
}

function buildOutput() {
  const org = fallbackText(qs("#qaTargetOrgInput").value, "目标机构");
  const role = fallbackText(qs("#qaTargetRoleInput").value, "目标方向");
  const tone = fallbackText(qs("#qaToneInput").value, "真诚简洁");
  const length = fallbackText(qs("#qaLengthInput").value, "控制在简洁范围");
  const extra = fallbackText(qs("#qaExtraInput").value);
  const evidence = pickEvidence(state.selectedTemplate.id);
  const profile = state.analysis?.careerProfile || {};
  const basic = profile.basic || {};
  const lead = state.selectedTemplate.prompt;
  const mainAxis = `回答这题时，主轴不要从空泛热情开始，而要从“我过去积累了什么能力，以及它为什么自然指向 ${role}”开始。`;
  const evidenceLines = evidence.length
    ? evidence.map((item) => `${item.title || "相关经历"}：${item.situation || item.action || item.result || "还需要你补一点事实细节"}`)
    : ["还没有足够的故事底稿，建议先去申请资料中心补 1-2 条经历。"];
  const shortAnswer = `我之所以想走向 ${role}，不是因为一个临时决定，而是因为我在过去的经历里，已经反复积累了和这个方向相关的能力。${evidence[0]?.title ? `像 ${evidence[0].title} 这段经历，就让我更清楚自己适合在复杂信息里做判断、推进和表达。` : "我已经能看到一些方向，但还需要把证据整理得更完整。"} 现在再往前走，我希望把这些能力放进更明确的场景里，继续长成更稳定的专业能力。`;
  const longAnswer = `如果让我回答“${lead}”，我会这样展开：第一，我过去的经历并不是分散的，它们其实一直在积累某种一致的能力。第二，这些能力和 ${role} 需要解决的问题是相关的。第三，我并不是只想“试试看”，而是已经在过去的项目或经历里看到自己在这个方向上的适配感。${extra ? ` 另外，我也会特别注意：${extra}` : ""} 如果是面对 ${org} 这样的目标，我会把表达调整成更 ${tone} 的方式，并把篇幅控制在 ${length}。`;
  return {
    mainAxis,
    evidenceLines,
    shortAnswer,
    longAnswer,
    targetLine: `${basic.targetGoal || "当前目标"} · ${basic.targetDirection || role} · ${org}`,
  };
}

function renderOutput(output) {
  const modeLine = qs("#qaModeLine");
  if (output?.meta?.fallback) {
    modeLine.hidden = false;
    modeLine.textContent = "当前是本地证据草稿模式：因为本地没有配置 DeepSeek key，所以先基于故事库生成一版结构化回答。";
  } else {
    modeLine.hidden = true;
    modeLine.textContent = "";
  }
  qs("#qaOutputGrid").innerHTML = `
    <article class="qa-output-card">
      <h3>回答主轴</h3>
      <p>${escapeHtml(output.mainAxis)}</p>
    </article>
    <article class="qa-output-card">
      <h3>可用证据</h3>
      <ul>${output.evidenceLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
    </article>
    <article class="qa-output-card">
      <h3>精简版回答</h3>
      <p>${escapeHtml(output.shortAnswer)}</p>
    </article>
    <article class="qa-output-card">
      <h3>展开版回答</h3>
      <p>${escapeHtml(output.longAnswer)}</p>
    </article>
    <article class="qa-output-card">
      <h3>下一步</h3>
      <p>${escapeHtml(fallbackText(output.followUpPrompt, "继续补证据，再回来改这一题。"))}</p>
    </article>
  `;
  qs("#qaRefineActions").hidden = false;
  qs("#qaStatus").textContent = output?.meta?.fallback ? "本地草稿已生成" : "回答已生成";
}

function regenerateWithRefine(refineLabel) {
  if (!state.lastOutput) return;
  const suffixMap = {
    "更口语一点": " 我会把句子再说得更自然一点，更像真实面试里的表达。",
    "更正式一点": " 我会把表达收得更稳，更像正式书面申请。",
    "更简短一点": " 我会保留主轴，但去掉多余铺垫。",
    "换一个角度": " 我会从成长动机和长期方向的角度再说一次。",
  };
  state.lastOutput.shortAnswer += suffixMap[refineLabel] || "";
  state.lastOutput.longAnswer += suffixMap[refineLabel] || "";
  renderOutput(state.lastOutput);
  showToast(`已按“${refineLabel}”调整`);
}

function bindEvents() {
  qs("#qaTemplateChips").addEventListener("click", (event) => {
    const button = event.target.closest("[data-template-id]");
    if (!button) return;
    const found = qaTemplates.find((item) => item.id === button.dataset.templateId);
    if (!found) return;
    state.selectedTemplate = found;
    renderTemplateChips();
  });

  qs("#generateQaBtn").addEventListener("click", async () => {
    const payload = {
      careerProfile: state.analysis.careerProfile,
      applicationDraft: state.draft,
      question: state.selectedTemplate.prompt,
      targetContext: {
        targetOrganization: qs("#qaTargetOrgInput").value.trim(),
        targetRole: qs("#qaTargetRoleInput").value.trim(),
        tone: qs("#qaToneInput").value.trim(),
        answerLength: qs("#qaLengthInput").value.trim(),
        extraContext: qs("#qaExtraInput").value.trim(),
      },
    };

    qs("#qaStatus").textContent = "正在生成";
    qs("#generateQaBtn").disabled = true;
    try {
      state.lastOutput = await window.ResumeInsightAPI.createQaDraft(payload);
      writeJsonStorage(qaDraftStorageKey, state.lastOutput);
      renderOutput(state.lastOutput);
      showToast(state.lastOutput?.meta?.fallback ? "已生成本地证据草稿" : "回答草稿已生成");
    } catch (error) {
      state.lastOutput = buildOutput();
      renderOutput(state.lastOutput);
      showToast(error.message || "问答生成失败，已退回本地草稿");
    } finally {
      qs("#generateQaBtn").disabled = false;
    }
  });

  qs("#qaRefineActions").addEventListener("click", (event) => {
    const button = event.target.closest("[data-refine]");
    if (!button) return;
    regenerateWithRefine(button.dataset.refine);
  });
}

function init() {
  state.analysis = readJsonStorage(analysisStorageKey);
  state.draft = readJsonStorage(applicationDraftStorageKey);
  if (!state.analysis?.careerProfile || !state.draft) {
    qs("#qaFallback").hidden = false;
    document.querySelectorAll(".journey-page > section:not(#qaFallback):not(.journey-hero)").forEach((section) => {
      section.hidden = true;
    });
    return;
  }
  renderTemplateChips();
  bindEvents();
  const savedQa = readJsonStorage(qaDraftStorageKey);
  if (savedQa) {
    state.lastOutput = savedQa;
    renderOutput(savedQa);
  }
}

init();
