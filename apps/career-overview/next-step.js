const analysisStorageKey = "resume_insight_career_analysis";
const applicationDraftStorageKey = "resume_partner_application_draft";
const qaDraftStorageKey = "resume_partner_qa_draft";

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

function fallbackText(value, fallback = "还在等待更多线索") {
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

function readSavedAnalysis() {
  try {
    return JSON.parse(localStorage.getItem(analysisStorageKey) || "null");
  } catch {
    localStorage.removeItem(analysisStorageKey);
    return null;
  }
}

function createApplicationDraft(saved) {
  const profile = saved?.careerProfile || {};
  const basic = profile.basic || {};
  const experiences = Array.isArray(profile.experienceSummary) ? profile.experienceSummary : [];
  const strengths = Array.isArray(profile.strengths) ? profile.strengths : [];
  const skills = Array.isArray(profile.skills) ? profile.skills : [];
  const draft = {
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
    storyBank: strengths.slice(0, 5).map((item, index) => ({
      id: `story_${index + 1}`,
      title: item?.name || `故事 ${index + 1}`,
      situation: item?.evidence || "",
      action: item?.evidence || "",
      result: item?.evidence || "",
      skills: [item?.name, skills[index]?.name].filter(Boolean),
    })),
  };
  localStorage.setItem(applicationDraftStorageKey, JSON.stringify(draft));
  return draft;
}

function ensureApplicationDraft(saved) {
  try {
    const existing = JSON.parse(localStorage.getItem(applicationDraftStorageKey) || "null");
    if (existing && typeof existing === "object") return existing;
  } catch {
    localStorage.removeItem(applicationDraftStorageKey);
  }
  return createApplicationDraft(saved);
}

async function prepareApplicationDraft(saved) {
  try {
    const report = await window.ResumeInsightAPI.createApplicationDraft({
      careerProfile: saved.careerProfile,
      extractedResumeText: saved.extractedResumeText || "",
    });
    localStorage.setItem(applicationDraftStorageKey, JSON.stringify(report));
    localStorage.removeItem(qaDraftStorageKey);
    return report;
  } catch {
    return ensureApplicationDraft(saved);
  }
}

function renderSummary(saved) {
  const container = qs("#journeySummary");
  const basic = saved?.careerProfile?.basic || {};
  const report = saved?.overviewReport || {};
  const snapshot = report.identitySnapshot || {};
  container.innerHTML = `
    <article>
      <span>你是谁</span>
      <p>${escapeHtml(fallbackText(snapshot.who, basic.major || "一个正在走向下一程的人"))}</p>
    </article>
    <article>
      <span>你想去哪</span>
      <p>${escapeHtml(fallbackText(snapshot.destination, basic.targetDirection || basic.targetGoal || "还在寻找更适合自己的方向"))}</p>
    </article>
    <article>
      <span>你到哪一步了</span>
      <p>${escapeHtml(fallbackText(snapshot.stage, report.peerScore?.explanation || "已经积累了一些可被看见的职业资产"))}</p>
    </article>
  `;
}

async function init() {
  try {
    const health = await window.ResumeInsightAPI.getHealth();
    qs("#apiStatus").textContent = health.hasDeepSeekKey ? "DeepSeek 已配置" : "DeepSeek 未配置";
    qs("#apiStatus").classList.toggle("ok", Boolean(health.hasDeepSeekKey));
  } catch {
    qs("#apiStatus").textContent = "后端未启动";
  }

  const saved = readSavedAnalysis();
  if (!saved?.careerProfile) {
    qs("#journeyFallback").hidden = false;
    document.querySelectorAll(".journey-page > section:not(#journeyFallback):not(.journey-hero)").forEach((section) => {
      section.hidden = true;
    });
    return;
  }

  renderSummary(saved);
  const draft = await prepareApplicationDraft(saved);
  showToast(draft?.meta?.fallback ? "已准备本地申请底稿" : "下一程已准备好");
}

init();
