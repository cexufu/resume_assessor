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

function isUsefulText(value) {
  return Boolean(String(value ?? "").trim());
}

function uniqueNonEmpty(values, limit = 6) {
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
  const evidence = Array.isArray(profile.evidence) ? profile.evidence : [];
  const missingInformation = Array.isArray(profile.missingInformation) ? profile.missingInformation : [];
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
    educationEntries: [{
      id: "edu_1",
      school: "",
      degree: basic.educationStage || "",
      major: basic.major || "",
      period: "",
      highlights: evidence.find((item) => /(专业|学历|毕业|学位|学校)/.test(String(item || ""))) || "",
    }].filter((item) => item.degree || item.major || item.school || item.highlights),
    publicationEntries: [],
    achievementEntries: uniqueNonEmpty(
      evidence.filter((item) => /(奖|证书|竞赛|荣誉|发表|论文|专利|作品|报告)/.test(String(item || ""))),
      4
    ).map((item, index) => ({
      id: `ach_${index + 1}`,
      title: item,
      type: /(论文|发表|专利|作品|报告)/.test(String(item || "")) ? "成果" : "荣誉",
      year: "",
      note: item,
    })),
    experienceEntries: experiences.map((item, index) => ({
      id: `exp_${index + 1}`,
      title: item?.title || `经历 ${index + 1}`,
      evidence: item?.evidence || "",
      polished: item?.evidence || "",
      tags: uniqueNonEmpty([skills[index]?.name, strengths[index]?.name], 4),
    })),
    storyBank: strengths.slice(0, 6).map((item, index) => ({
      id: `story_${index + 1}`,
      title: item?.name || `故事 ${index + 1}`,
      situation: item?.evidence || "",
      task: item?.evidence || "",
      action: item?.evidence || "",
      result: item?.evidence || "",
      skills: uniqueNonEmpty([item?.name, skills[index]?.name], 5),
    })),
    applicationHints: {
      summary: "这是一版根据职业画像压缩出的申请底稿，先把它改成更像你自己的表达。",
      priorityModules: uniqueNonEmpty([
        "先整理 1-2 段最能代表你的经历。",
        "把目标方向写得更具体，后面的表达会更稳。",
        "补一个能说明个人贡献和结果变化的项目故事。",
        "先把故事库里的场景、动作、结果写完整。",
      ], 4),
      missingProof: uniqueNonEmpty(missingInformation, 4),
    },
  };
}

function mergeDraftWithProfile(rawDraft, saved) {
  const fallback = buildDraftFromProfile(saved);
  const draft = rawDraft && typeof rawDraft === "object" ? rawDraft : {};
  const basicSource = draft.basicProfile && typeof draft.basicProfile === "object" ? draft.basicProfile : {};
  const educationSource = Array.isArray(draft.educationEntries) ? draft.educationEntries : [];
  const publicationSource = Array.isArray(draft.publicationEntries) ? draft.publicationEntries : [];
  const achievementSource = Array.isArray(draft.achievementEntries) ? draft.achievementEntries : [];
  const aiExperiences = Array.isArray(draft.experienceEntries) ? draft.experienceEntries : [];
  const aiStories = Array.isArray(draft.storyBank) ? draft.storyBank : [];
  const aiHints = draft.applicationHints && typeof draft.applicationHints === "object" ? draft.applicationHints : {};
  const educationCount = Math.max(educationSource.length, fallback.educationEntries.length);
  const experienceCount = Math.max(aiExperiences.length, fallback.experienceEntries.length);
  const storyCount = Math.max(aiStories.length, fallback.storyBank.length);

  return {
    ...draft,
    basicProfile: {
      age: isUsefulText(basicSource.age) ? String(basicSource.age).trim() : fallback.basicProfile.age,
      region: isUsefulText(basicSource.region) ? String(basicSource.region).trim() : fallback.basicProfile.region,
      educationStage: isUsefulText(basicSource.educationStage) ? String(basicSource.educationStage).trim() : fallback.basicProfile.educationStage,
      major: isUsefulText(basicSource.major) ? String(basicSource.major).trim() : fallback.basicProfile.major,
      targetGoal: isUsefulText(basicSource.targetGoal) ? String(basicSource.targetGoal).trim() : fallback.basicProfile.targetGoal,
      targetDirection: isUsefulText(basicSource.targetDirection) ? String(basicSource.targetDirection).trim() : fallback.basicProfile.targetDirection,
      currentThought: isUsefulText(basicSource.currentThought) ? String(basicSource.currentThought).trim() : fallback.basicProfile.currentThought,
      anxiety: isUsefulText(basicSource.anxiety) ? String(basicSource.anxiety).trim() : fallback.basicProfile.anxiety,
    },
    educationEntries: Array.from({ length: educationCount }, (_item, index) => {
      const source = educationSource[index] || {};
      const fallbackItem = fallback.educationEntries[index] || {};
      return {
        id: fallbackText(source.id, fallbackItem.id || `edu_${index + 1}`),
        school: fallbackText(source.school, fallbackItem.school || ""),
        degree: fallbackText(source.degree, fallbackItem.degree || ""),
        major: fallbackText(source.major, fallbackItem.major || ""),
        period: fallbackText(source.period, fallbackItem.period || ""),
        highlights: fallbackText(source.highlights, fallbackItem.highlights || ""),
      };
    }),
    publicationEntries: Array.isArray(publicationSource)
      ? publicationSource.map((item, index) => ({
        id: fallbackText(item?.id, `pub_${index + 1}`),
        title: fallbackText(item?.title),
        type: fallbackText(item?.type),
        venue: fallbackText(item?.venue),
        year: fallbackText(item?.year),
        note: fallbackText(item?.note),
      }))
      : [],
    achievementEntries: Array.isArray(achievementSource) && achievementSource.length
      ? achievementSource.map((item, index) => ({
        id: fallbackText(item?.id, `ach_${index + 1}`),
        title: fallbackText(item?.title),
        type: fallbackText(item?.type),
        year: fallbackText(item?.year),
        note: fallbackText(item?.note),
      }))
      : (fallback.achievementEntries || []),
    experienceEntries: Array.from({ length: experienceCount }, (_item, index) => {
      const source = aiExperiences[index] || {};
      const fallbackItem = fallback.experienceEntries[index] || {};
      const evidence = fallbackText(source.evidence, fallbackItem.evidence || "");
      return {
        id: fallbackText(source.id, fallbackItem.id || `exp_${index + 1}`),
        title: fallbackText(source.title, fallbackItem.title || `经历 ${index + 1}`),
        evidence,
        polished: fallbackText(source.polished, evidence || fallbackItem.polished || ""),
        tags: uniqueNonEmpty([
          ...(Array.isArray(source.tags) ? source.tags : []),
          ...(Array.isArray(fallbackItem.tags) ? fallbackItem.tags : []),
        ], 4),
      };
    }),
    storyBank: Array.from({ length: storyCount }, (_item, index) => {
      const source = aiStories[index] || {};
      const fallbackItem = fallback.storyBank[index] || {};
      const situation = fallbackText(source.situation, fallbackItem.situation || "");
      return {
        id: fallbackText(source.id, fallbackItem.id || `story_${index + 1}`),
        title: fallbackText(source.title, fallbackItem.title || `故事 ${index + 1}`),
        situation,
        task: fallbackText(source.task, fallbackItem.task || situation),
        action: fallbackText(source.action, fallbackItem.action || situation),
        result: fallbackText(source.result, fallbackItem.result || situation),
        skills: uniqueNonEmpty([
          ...(Array.isArray(source.skills) ? source.skills : []),
          ...(Array.isArray(fallbackItem.skills) ? fallbackItem.skills : []),
        ], 5),
      };
    }),
    applicationHints: {
      summary: fallbackText(aiHints.summary, fallback.applicationHints.summary),
      priorityModules: uniqueNonEmpty([
        ...(Array.isArray(aiHints.priorityModules) ? aiHints.priorityModules : []),
        ...(Array.isArray(fallback.applicationHints.priorityModules) ? fallback.applicationHints.priorityModules : []),
      ], 4),
      missingProof: uniqueNonEmpty([
        ...(Array.isArray(aiHints.missingProof) ? aiHints.missingProof : []),
        ...(Array.isArray(fallback.applicationHints.missingProof) ? fallback.applicationHints.missingProof : []),
      ], 4),
    },
    meta: {
      ...(draft.meta || {}),
      generatedAt: draft?.meta?.generatedAt || new Date().toISOString(),
    },
  };
}

const state = {
  analysis: null,
  draft: null,
};

function ensureDraft() {
  const saved = readJsonStorage(applicationDraftStorageKey);
  const draft = mergeDraftWithProfile(saved, state.analysis);
  writeJsonStorage(applicationDraftStorageKey, draft);
  return draft;
}

async function hydrateDraftFromApi() {
  try {
    const report = await window.ResumeInsightAPI.createApplicationDraft({
      careerProfile: state.analysis.careerProfile,
      extractedResumeText: state.analysis.extractedResumeText || "",
    });
    const merged = mergeDraftWithProfile(report, state.analysis);
    writeJsonStorage(applicationDraftStorageKey, merged);
    return merged;
  } catch {
    return ensureDraft();
  }
}

function calculateProgress(draft) {
  const basic = draft.basicProfile || {};
  const basicFields = ["educationStage", "major", "targetGoal", "targetDirection"];
  const basicScore = basicFields.filter((key) => fallbackText(basic[key])).length;
  const educationScore = Array.isArray(draft.educationEntries) ? Math.min(2, draft.educationEntries.filter((item) => fallbackText(item?.degree) || fallbackText(item?.major) || fallbackText(item?.school)).length) : 0;
  const publicationScore = Array.isArray(draft.publicationEntries) ? Math.min(1, draft.publicationEntries.filter((item) => fallbackText(item?.title)).length) : 0;
  const achievementScore = Array.isArray(draft.achievementEntries) ? Math.min(1, draft.achievementEntries.filter((item) => fallbackText(item?.title)).length) : 0;
  const experienceScore = Array.isArray(draft.experienceEntries) ? Math.min(2, draft.experienceEntries.filter((item) => fallbackText(item?.evidence)).length) : 0;
  const storyScore = Array.isArray(draft.storyBank) ? Math.min(2, draft.storyBank.filter((item) => fallbackText(item?.situation) || fallbackText(item?.action)).length) : 0;
  const total = basicScore + educationScore + publicationScore + achievementScore + experienceScore + storyScore;
  return Math.round((total / 12) * 100);
}

function renderHints() {
  const hints = state.draft.applicationHints || {};
  qs("#applicationHintSummary").textContent = fallbackText(
    hints.summary,
    "这一版会先帮你把经历压成可编辑底稿，后面再慢慢补到更像你自己的申请表达。"
  );
  const priorityItems = Array.isArray(hints.priorityModules) && hints.priorityModules.length
    ? hints.priorityModules
    : ["先把 1-2 条最能代表你的经历写完整。"];
  const missingItems = Array.isArray(hints.missingProof) && hints.missingProof.length
    ? hints.missingProof
    : ["这版已经能作为起点，后面再补更具体的结果证据。"];

  qs("#applicationPriorityList").innerHTML = priorityItems
    .map((item) => `<li>${escapeHtml(fallbackText(item))}</li>`)
    .join("");
  qs("#applicationMissingList").innerHTML = missingItems
    .map((item) => `<li>${escapeHtml(fallbackText(item))}</li>`)
    .join("");
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

function renderEducationEntries() {
  const items = Array.isArray(state.draft.educationEntries) ? state.draft.educationEntries : [];
  if (!items.length) {
    qs("#educationEntryList").innerHTML = '<div class="draft-empty">这里还没有教育背景条目。你可以补学校、学历、专业和时间线。</div>';
    return;
  }
  qs("#educationEntryList").innerHTML = items.map((item, index) => `
    <article class="draft-entry-card">
      <div class="draft-entry-card-head">
        <strong>${escapeHtml(fallbackText(item.school, `教育经历 ${index + 1}`))}</strong>
      </div>
      <div class="draft-entry-grid">
        <label class="field"><span>学校</span><input data-education-key="school" data-id="${escapeHtml(item.id)}" type="text" maxlength="160" value="${escapeHtml(fallbackText(item.school))}" /></label>
        <label class="field"><span>学历</span><input data-education-key="degree" data-id="${escapeHtml(item.id)}" type="text" maxlength="120" value="${escapeHtml(fallbackText(item.degree))}" /></label>
        <label class="field"><span>专业</span><input data-education-key="major" data-id="${escapeHtml(item.id)}" type="text" maxlength="120" value="${escapeHtml(fallbackText(item.major))}" /></label>
        <label class="field"><span>时间</span><input data-education-key="period" data-id="${escapeHtml(item.id)}" type="text" maxlength="120" value="${escapeHtml(fallbackText(item.period))}" /></label>
        <label class="field wide"><span>亮点</span><textarea data-education-key="highlights" data-id="${escapeHtml(item.id)}" class="compact-textarea">${escapeHtml(fallbackText(item.highlights))}</textarea></label>
      </div>
    </article>
  `).join("");
}

function renderPublicationEntries() {
  const items = Array.isArray(state.draft.publicationEntries) ? state.draft.publicationEntries : [];
  if (!items.length) {
    qs("#publicationEntryList").innerHTML = '<div class="draft-empty">这里还没有发表或作品条目。没有可以先留空，有的话建议单独列出来。</div>';
    return;
  }
  qs("#publicationEntryList").innerHTML = items.map((item, index) => `
    <article class="draft-entry-card">
      <div class="draft-entry-card-head">
        <strong>${escapeHtml(fallbackText(item.title, `发表 / 作品 ${index + 1}`))}</strong>
      </div>
      <div class="draft-entry-grid">
        <label class="field"><span>标题</span><input data-publication-key="title" data-id="${escapeHtml(item.id)}" type="text" maxlength="160" value="${escapeHtml(fallbackText(item.title))}" /></label>
        <label class="field"><span>类型</span><input data-publication-key="type" data-id="${escapeHtml(item.id)}" type="text" maxlength="120" value="${escapeHtml(fallbackText(item.type))}" /></label>
        <label class="field"><span>载体 / 平台</span><input data-publication-key="venue" data-id="${escapeHtml(item.id)}" type="text" maxlength="120" value="${escapeHtml(fallbackText(item.venue))}" /></label>
        <label class="field"><span>年份</span><input data-publication-key="year" data-id="${escapeHtml(item.id)}" type="text" maxlength="60" value="${escapeHtml(fallbackText(item.year))}" /></label>
        <label class="field wide"><span>说明</span><textarea data-publication-key="note" data-id="${escapeHtml(item.id)}" class="compact-textarea">${escapeHtml(fallbackText(item.note))}</textarea></label>
      </div>
    </article>
  `).join("");
}

function renderAchievementEntries() {
  const items = Array.isArray(state.draft.achievementEntries) ? state.draft.achievementEntries : [];
  if (!items.length) {
    qs("#achievementEntryList").innerHTML = '<div class="draft-empty">这里还没有奖项或成果条目。证书、竞赛、荣誉和代表性成果都可以放进来。</div>';
    return;
  }
  qs("#achievementEntryList").innerHTML = items.map((item, index) => `
    <article class="draft-entry-card">
      <div class="draft-entry-card-head">
        <strong>${escapeHtml(fallbackText(item.title, `奖项 / 成果 ${index + 1}`))}</strong>
      </div>
      <div class="draft-entry-grid">
        <label class="field"><span>标题</span><input data-achievement-key="title" data-id="${escapeHtml(item.id)}" type="text" maxlength="160" value="${escapeHtml(fallbackText(item.title))}" /></label>
        <label class="field"><span>类型</span><input data-achievement-key="type" data-id="${escapeHtml(item.id)}" type="text" maxlength="120" value="${escapeHtml(fallbackText(item.type))}" /></label>
        <label class="field"><span>年份</span><input data-achievement-key="year" data-id="${escapeHtml(item.id)}" type="text" maxlength="60" value="${escapeHtml(fallbackText(item.year))}" /></label>
        <label class="field wide"><span>说明</span><textarea data-achievement-key="note" data-id="${escapeHtml(item.id)}" class="compact-textarea">${escapeHtml(fallbackText(item.note))}</textarea></label>
      </div>
    </article>
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
        <label class="field">
          <span>能力标签</span>
          <input data-entry-key="tags" data-id="${escapeHtml(item.id)}" type="text" maxlength="260" value="${escapeHtml((Array.isArray(item.tags) ? item.tags : []).join(" / "))}" />
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
          <span>任务</span>
          <textarea data-story-key="task" data-id="${escapeHtml(item.id)}" class="compact-textarea">${escapeHtml(fallbackText(item.task))}</textarea>
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
  renderHints();
  renderBasicGrid();
  renderEducationEntries();
  renderPublicationEntries();
  renderAchievementEntries();
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

  qs("#educationEntryList").addEventListener("input", (event) => {
    const target = event.target.closest("[data-education-key]");
    if (!target) return;
    const item = state.draft.educationEntries.find((entry) => entry.id === target.dataset.id);
    if (!item) return;
    item[target.dataset.educationKey] = target.value;
    persistDraft();
  });

  qs("#publicationEntryList").addEventListener("input", (event) => {
    const target = event.target.closest("[data-publication-key]");
    if (!target) return;
    const item = state.draft.publicationEntries.find((entry) => entry.id === target.dataset.id);
    if (!item) return;
    item[target.dataset.publicationKey] = target.value;
    persistDraft();
  });

  qs("#achievementEntryList").addEventListener("input", (event) => {
    const target = event.target.closest("[data-achievement-key]");
    if (!target) return;
    const item = state.draft.achievementEntries.find((entry) => entry.id === target.dataset.id);
    if (!item) return;
    item[target.dataset.achievementKey] = target.value;
    persistDraft();
  });

  qs("#experienceDraftList").addEventListener("input", (event) => {
    const target = event.target.closest("[data-entry-key]");
    if (!target) return;
    const item = state.draft.experienceEntries.find((entry) => entry.id === target.dataset.id);
    if (!item) return;
    if (target.dataset.entryKey === "tags") {
      item.tags = target.value.split("/").map((part) => part.trim()).filter(Boolean);
    } else {
      item[target.dataset.entryKey] = target.value;
    }
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
  qs("#applicationHintSummary").textContent = "正在把你的职业画像整理成一版可编辑底稿。";
  qs("#applicationSummaryCopy").textContent = "先把你的经历压成申请语言，进入后就能直接开始改。";
  state.draft = await hydrateDraftFromApi();
  renderDraft();
  bindEvents();
  showToast(state.draft?.meta?.fallback ? "当前是本地底稿模式" : "申请底稿已生成");
}

init();
