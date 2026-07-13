const analysisStorageKey = "resume_insight_career_analysis";
const applicationDraftStorageKey = "resume_partner_application_draft";
const qaDraftStorageKey = "resume_partner_qa_draft";

const qaTemplates = [
  {
    id: "self_intro",
    label: "自我介绍",
    prompt: "请做一个 1 分钟自我介绍。",
    intent: "考察你能否把背景、能力和目标讲成一条清楚的线。",
    evidenceNeed: "1 条最能代表你的经历，加上当前目标。",
    missingHint: "如果故事不够，先补一个项目的背景、你的动作和结果。",
    keywords: ["经历", "能力", "目标", "项目", "优势"],
  },
  {
    id: "why_role",
    label: "为什么这个方向",
    prompt: "为什么你适合这个岗位或项目方向？",
    intent: "考察目标是否真实、能力是否对位、不是随便投。",
    evidenceNeed: "1 条相关经历 + 1 个能力证据 + 1 句下一步成长计划。",
    missingHint: "如果方向还泛，要补你为什么被这个问题吸引，以及你做过什么相邻事情。",
    keywords: ["方向", "岗位", "能力", "判断", "策略", "分析", "推进"],
  },
  {
    id: "why_company",
    label: "为什么我们",
    prompt: "为什么你想来这家公司、学校或项目？",
    intent: "考察你是否理解对方，也能说明自己和对方的连接。",
    evidenceNeed: "对方特点 + 自己经历里的对应能力，避免只说喜欢。",
    missingHint: "如果缺少对方信息，先补目标机构、项目、业务或导师的具体吸引点。",
    keywords: ["公司", "学校", "项目", "业务", "研究", "价值", "匹配"],
  },
  {
    id: "strength",
    label: "最大优势",
    prompt: "你最突出的优势是什么？",
    intent: "考察你能否把优势说成可验证的能力，而不是性格形容词。",
    evidenceNeed: "一个能力名 + 一个具体场景 + 一个结果变化。",
    missingHint: "如果只有评价词，要补你在什么任务里展现了这个能力。",
    keywords: ["优势", "能力", "结果", "协作", "结构化", "表达", "判断"],
  },
  {
    id: "weakness",
    label: "短板与改进",
    prompt: "你的短板是什么，你怎么面对它？",
    intent: "考察自我认知、补短板的方法，以及是否会影响目标岗位。",
    evidenceNeed: "一个真实短板 + 已经采取的改进行动 + 不影响胜任的边界。",
    missingHint: "不要说完美主义，优先补一个可改进、可管理、不致命的短板。",
    keywords: ["短板", "学习", "改进", "复盘", "补齐"],
  },
  {
    id: "challenge",
    label: "挑战经历",
    prompt: "请讲一个你遇到困难并解决问题的经历。",
    intent: "考察你面对不确定性时的判断、拆解和推进能力。",
    evidenceNeed: "困难是什么、你怎么判断、采取了什么动作、结果怎样。",
    missingHint: "如果故事太顺，要补阻力、取舍或你当时做出的判断。",
    keywords: ["困难", "挑战", "解决", "推进", "判断", "复盘", "结果"],
  },
  {
    id: "teamwork",
    label: "团队合作",
    prompt: "请讲一次团队合作或沟通冲突的经历。",
    intent: "考察你是否能在协作里识别问题、推动共识和承担责任。",
    evidenceNeed: "冲突或分歧 + 你的沟通动作 + 团队结果。",
    missingHint: "如果没有冲突，也可以补一次你协调资源或推动别人一起完成的经历。",
    keywords: ["团队", "协作", "沟通", "冲突", "协调", "推进"],
  },
  {
    id: "future_plan",
    label: "未来规划",
    prompt: "你未来 1-3 年的规划是什么？",
    intent: "考察你是否有成长方向，也是否理解目标路径。",
    evidenceNeed: "短期目标 + 能力补齐计划 + 长期方向。",
    missingHint: "如果规划太虚，要补一个近期可执行动作和一个要验证的问题。",
    keywords: ["目标", "规划", "成长", "路径", "方向", "学习"],
  },
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

function uniqueNonEmpty(values, limit = 5) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map((item) => String(item ?? "").trim()).filter(Boolean))).slice(0, limit);
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
    return JSON.parse(sessionStorage.getItem(key) || "null");
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
}

function writeJsonStorage(key, value) {
  sessionStorage.setItem(key, JSON.stringify(value));
}

function renderTemplateChips() {
  qs("#qaTemplateChips").innerHTML = qaTemplates.map((item) => `
    <button class="qa-template-chip ${item.id === state.selectedTemplate.id ? "active" : ""}" type="button" data-template-id="${escapeHtml(item.id)}" title="${escapeHtml(item.intent)}">${escapeHtml(item.label)}</button>
  `).join("");
}

function getStoryBank() {
  return Array.isArray(state.draft?.storyBank) ? state.draft.storyBank : [];
}

function getStoryHaystack(story) {
  return [story.title, story.situation, story.task, story.action, story.result, story.evidence, Array.isArray(story.skills) ? story.skills.join(" ") : ""]
    .map((item) => String(item || ""))
    .join(" ");
}

function pickEvidence(template = state.selectedTemplate) {
  const stories = getStoryBank();
  if (!stories.length) return [];
  const keywords = Array.isArray(template.keywords) ? template.keywords : [];
  const scored = stories.map((story, index) => {
    const haystack = getStoryHaystack(story);
    const score = keywords.reduce((sum, keyword) => sum + (haystack.includes(keyword) ? 2 : 0), 0)
      + (fallbackText(story.result) ? 1 : 0)
      + (fallbackText(story.action) ? 1 : 0)
      - index * 0.01;
    return { story, score };
  }).sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((item) => item.story);
}

function formatEvidenceLine(story, fallback = "还需要补一条真实经历。") {
  if (!story) return fallback;
  const title = fallbackText(story.title, "相关经历");
  const detail = fallbackText(story.result, fallbackText(story.action, fallbackText(story.situation, "这条经历还需要补动作和结果")));
  return `${title}：${detail}`;
}

function buildDiscussionPrompts(template, evidence, role, org) {
  return uniqueNonEmpty([
    `这题真正要证明的是：${template.intent}`,
    `当前最该补的证据：${template.evidenceNeed}`,
    evidence.length ? "可以继续追问：这条故事里，你本人做出的关键判断是什么？" : `可以先补材料：${template.missingHint}`,
    org !== "目标机构" ? `如果面向 ${org}，下一轮可以补它最看重的业务、项目或评价标准。` : "下一轮可以告诉我具体目标机构，我会把回答改得更贴合。",
    role !== "目标方向" ? `如果面向 ${role}，下一轮可以讨论哪条经历最能证明适配。` : "下一轮可以告诉我具体岗位或项目方向，我会帮你选证据。",
  ], 4);
}

function buildOutput() {
  const org = fallbackText(qs("#qaTargetOrgInput").value, "目标机构");
  const role = fallbackText(qs("#qaTargetRoleInput").value, "目标方向");
  const tone = fallbackText(qs("#qaToneInput").value, "真诚简洁");
  const length = fallbackText(qs("#qaLengthInput").value, "控制在简洁范围");
  const extra = fallbackText(qs("#qaExtraInput").value);
  const template = state.selectedTemplate;
  const evidence = pickEvidence(template);
  const profile = state.analysis?.careerProfile || {};
  const basic = profile.basic || {};
  const evidenceLines = evidence.length
    ? evidence.map((item) => formatEvidenceLine(item))
    : [template.missingHint];
  const discussionPrompts = buildDiscussionPrompts(template, evidence, role, org);
  const opening = `我会从 ${role} 需要的能力出发回答这题。我的判断是，这个选择不是临时兴趣，而是和我已有经历里反复出现的能力线索相连。`;
  const pointBlocks = [
    {
      heading: "我想要什么",
      point: `我想进入 ${role} 相关场景，核心不是换一个名称，而是处理更匹配自己能力的问题。`,
      evidence: formatEvidenceLine(evidence[0], template.missingHint),
    },
    {
      heading: "为什么想要",
      point: extra
        ? `这个选择也和我现在最在意的问题有关：${extra.replace(/[。；;]+$/g, "")}。`
        : "过去经历让我意识到，自己更愿意在需要判断、设计、沟通或推进的任务里成长。",
      evidence: formatEvidenceLine(evidence[1], "这里还可以补一条动机来源，让回答不只停留在兴趣。"),
    },
    {
      heading: "我凭什么能要",
      point: "我不是从零开始，而是已经有相邻能力。下一步要做的是把这些能力翻译成更直接的岗位或申请证据。",
      evidence: formatEvidenceLine(evidence[2], "这里还需要补一条能说明个人贡献和结果变化的案例。"),
    },
  ];
  const longAnswer = `如果让我回答“${template.prompt}”，我会先说明这题真正考察的是${template.intent} 对我来说，${role} 的吸引力不只是名称，而是它需要持续判断问题、组织资源并把想法落到结果里。我的经历里已经有一些相邻证据，例如${evidenceLines[0]}。这说明我不是凭空想象这个方向，而是在过去任务中已经接触过类似能力要求。面向 ${org}，我会用更${tone}的方式表达：我现在仍有需要补齐的地方，但我知道自己要补什么，也愿意用具体行动继续验证这个选择。`;
  return {
    mainAxis: `这题主要在考：${template.intent} 回答时先说判断，再给证据，最后承认下一步还要补什么。`,
    opening,
    pointBlocks,
    reinforcement: `面对 ${org}，我不会只讲热情，而会用真实经历说明自己为什么适合 ${role}，并说明接下来怎么补齐能力。`,
    evidenceLines,
    discussionPrompts,
    longAnswer: length.includes("短") ? longAnswer.slice(0, 220) : longAnswer,
    followUpPrompt: discussionPrompts[1] || "继续补一条真实证据，再回来改这一题。",
    targetLine: `${basic.targetGoal || "当前目标"} · ${basic.targetDirection || role} · ${org}`,
  };
}

function normalizeQaOutput(output) {
  const safeOutput = output && typeof output === "object" ? output : {};
  const fallback = buildOutput();
  return {
    ...safeOutput,
    mainAxis: fallbackText(safeOutput.mainAxis, fallback.mainAxis),
    opening: fallbackText(safeOutput.opening, fallback.opening),
    pointBlocks: Array.isArray(safeOutput.pointBlocks) && safeOutput.pointBlocks.length
      ? safeOutput.pointBlocks.slice(0, 3).map((item, index) => ({
        heading: fallbackText(item?.heading, fallback.pointBlocks[index]?.heading || `分点 ${index + 1}`),
        point: fallbackText(item?.point, fallback.pointBlocks[index]?.point || ""),
        evidence: fallbackText(item?.evidence, fallback.pointBlocks[index]?.evidence || ""),
      }))
      : fallback.pointBlocks,
    reinforcement: fallbackText(safeOutput.reinforcement, fallback.reinforcement),
    evidenceLines: Array.isArray(safeOutput.evidenceLines) && safeOutput.evidenceLines.length ? safeOutput.evidenceLines : fallback.evidenceLines,
    discussionPrompts: Array.isArray(safeOutput.discussionPrompts) && safeOutput.discussionPrompts.length ? safeOutput.discussionPrompts : fallback.discussionPrompts,
    longAnswer: fallbackText(safeOutput.longAnswer, fallback.longAnswer),
    followUpPrompt: fallbackText(safeOutput.followUpPrompt, fallback.followUpPrompt),
    meta: safeOutput.meta || {},
  };
}

function renderOutput(output) {
  const normalized = normalizeQaOutput(output);
  state.lastOutput = normalized;
  const modeLine = qs("#qaModeLine");
  if (normalized?.meta?.fallback) {
    modeLine.hidden = false;
    modeLine.textContent = "当前是本地证据草稿模式：如果 AI 服务暂时不可用，系统会先基于故事库生成一版可讨论的回答。";
  } else {
    modeLine.hidden = true;
    modeLine.textContent = "";
  }
  qs("#qaOutputGrid").innerHTML = `
    <article class="qa-output-card">
      <h3>这题在考什么</h3>
      <p>${escapeHtml(normalized.mainAxis)}</p>
    </article>
    <article class="qa-output-card">
      <h3>开头正言</h3>
      <p>${escapeHtml(normalized.opening)}</p>
    </article>
    <article class="qa-output-card">
      <h3>推荐证据</h3>
      <ul>${normalized.evidenceLines.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </article>
    <article class="qa-output-card">
      <h3>分点与佐证</h3>
      ${normalized.pointBlocks.map((item) => `
        <div class="qa-point-block">
          <strong>${escapeHtml(item.heading)}</strong>
          <p>${escapeHtml(item.point)}</p>
          <p>${escapeHtml(item.evidence)}</p>
        </div>
      `).join("")}
    </article>
    <article class="qa-output-card">
      <h3>展开版回答</h3>
      <p>${escapeHtml(normalized.longAnswer)}</p>
    </article>
    <article class="qa-output-card qa-discussion-card">
      <h3>讨论与追问</h3>
      <ul>${normalized.discussionPrompts.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </article>
    <article class="qa-output-card">
      <h3>收束强化</h3>
      <p>${escapeHtml(normalized.reinforcement)}</p>
    </article>
    <article class="qa-output-card">
      <h3>下一步</h3>
      <p>${escapeHtml(normalized.followUpPrompt)}</p>
    </article>
  `;
  qs("#qaRefineActions").hidden = false;
  qs("#qaStatus").textContent = normalized?.meta?.fallback ? "本地草稿已生成" : "回答已生成";
}

function regenerateWithRefine(refineLabel) {
  if (!state.lastOutput) return;
  const suffixMap = {
    "换一个故事": "我会先回到故事库，优先换用另一条更贴近目标的问题证据。",
    "补充更多细节": "这一轮最值得补的是具体场景、你的动作、结果变化和别人如何评价。",
    "改短一点": "我会保留判断和证据，但删掉铺垫，让它更适合网申框。",
    "更像面试口语": "我会把句子改得更像真实面试里的表达，少一点书面腔。",
  };
  const instruction = suffixMap[refineLabel] || "我会围绕这题继续优化回答。";
  state.lastOutput.longAnswer = `${state.lastOutput.longAnswer} ${instruction}`;
  state.lastOutput.followUpPrompt = instruction;
  state.lastOutput.discussionPrompts = uniqueNonEmpty([instruction, ...(state.lastOutput.discussionPrompts || [])], 4);
  renderOutput(state.lastOutput);
  writeJsonStorage(qaDraftStorageKey, state.lastOutput);
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
      writeJsonStorage(qaDraftStorageKey, state.lastOutput);
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
