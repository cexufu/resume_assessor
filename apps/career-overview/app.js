const state = {
  health: null,
  report: null,
  careerProfile: null,
  uploadedFile: null,
  extractedResumeText: "",
  chatHistory: [],
  isAnalyzing: false,
  isChatting: false,
  loadingTimer: null,
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
  return isUsefulText(text) ? text : "";
}

function firstText(...values) {
  for (const value of values) {
    const text = fallbackText(value);
    if (text) return text;
  }
  return "";
}

function isUsefulText(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "--") return false;
  return !/(^信息不足$|信息不足，?需补充|需补充简历证据|当前简历证据不足|没有返回有效内容)/.test(text);
}

function setResultText(selector, value) {
  const element = qs(selector);
  const text = fallbackText(value);
  if (element) element.textContent = text;
  return Boolean(text);
}

function setSectionVisibleByChild(selector, isVisible) {
  const child = qs(selector);
  const section = child?.closest(".result-section");
  if (section) section.hidden = !isVisible;
}

function setArticleVisibleByChild(selector, isVisible) {
  const child = qs(selector);
  const article = child?.closest("article");
  if (article) article.hidden = !isVisible;
}

function definitionHtml(label, value) {
  const text = fallbackText(value);
  return text ? `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(text)}</dd>` : "";
}

function showToast(message) {
  const toast = qs("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2400);
}

function openIntakeModal() {
  qs("#intakeModal").classList.add("open");
}

function closeIntakeModal() {
  qs("#intakeModal").classList.remove("open");
}

function setBusy(isBusy) {
  state.isAnalyzing = isBusy;
  qs("#analyzeBtn").disabled = isBusy;
  qs("#analyzeBtn").textContent = isBusy ? "正在载入..." : "Load My Life";
  qs("#openIntakeBtn").disabled = isBusy;
  qs("#closeIntakeBtn").disabled = isBusy;
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
  qs("#fileStatus").textContent = `正在解析文件：${file.name}`;

  try {
    const result = await window.ResumeInsightAPI.extractResumeText(state.uploadedFile);
    state.extractedResumeText = result.text || "";
    if (!state.extractedResumeText) {
      qs("#fileStatus").textContent = `没有从 ${file.name} 中解析到文本，可尝试粘贴正文。`;
      showToast("没有解析到文本");
      return;
    }
    qs("#resumeText").value = state.extractedResumeText;
    state.uploadedFile = null;
    qs("#fileStatus").textContent = `已解析：${file.name}，共 ${state.extractedResumeText.length} 个字符。`;
    persistDraft();
    showToast(getFileExtension(file) === ".pdf" ? "PDF 已解析" : "文件已解析");
  } catch (error) {
    qs("#fileStatus").textContent = `自动解析失败：${error.message}。点击分析时会再尝试服务端解析，或直接粘贴正文。`;
    showToast("文件解析失败");
  }
}

function readPayload() {
  return {
    resumeText: qs("#resumeText").value.trim() || state.extractedResumeText,
    file: state.uploadedFile,
    context: {
      age: qs("#ageInput").value.trim(),
      region: qs("#regionInput").value.trim(),
      targetGoal: qs("#targetGoalInput").value.trim(),
      currentThought: qs("#currentThoughtInput").value.trim(),
      targetDirection: qs("#targetDirectionInput").value.trim(),
      anxiety: qs("#anxietyInput").value.trim(),
    },
  };
}

function persistDraft() {
  const draft = {
    age: qs("#ageInput").value,
    region: qs("#regionInput").value,
    targetGoal: qs("#targetGoalInput").value,
    currentThought: qs("#currentThoughtInput").value,
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
    qs("#regionInput").value = draft.region || "";
    qs("#targetGoalInput").value = draft.targetGoal || "";
    qs("#currentThoughtInput").value = draft.currentThought || "";
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
    openIntakeModal();
    showToast("请先粘贴简历文本或上传简历文件");
    return;
  }

  try {
    setBusy(true);
    closeIntakeModal();
    state.report = null;
    state.careerProfile = null;
    state.chatHistory = [];
    setChatAvailable(false);
    persistDraft();
    localStorage.removeItem(analysisStorageKey);
    showLoadingState("profile");
    const profileResult = await window.ResumeInsightAPI.createCareerProfile(payload);
    state.careerProfile = profileResult.careerProfile || null;
    state.extractedResumeText = profileResult.extractedResumeText || payload.resumeText;
    if (!state.careerProfile) throw new Error("没有生成可用的职业画像，请补充简历正文后重试。");
    if (!qs("#resumeText").value.trim() && state.extractedResumeText) {
      qs("#resumeText").value = state.extractedResumeText;
      persistDraft();
    }
    persistAnalysis({
      isPartial: true,
      source: "profile_created",
    });

    showLoadingState("overview");
    const report = await window.ResumeInsightAPI.createOverview({
      careerProfile: state.careerProfile,
      extractedResumeText: state.extractedResumeText,
    });
    state.report = report;
    state.careerProfile = report.careerProfile || null;
    state.extractedResumeText = report.extractedResumeText || state.extractedResumeText;
    state.chatHistory = [];
    renderReport(report);
    persistAnalysis();
    resetChatPanel();
    showToast("分析已生成");
  } catch (error) {
    if (error.data?.partial?.careerProfile) {
      state.careerProfile = error.data.partial.careerProfile;
      state.extractedResumeText = error.data.partial.extractedResumeText || payload.resumeText;
      persistAnalysis({
        isPartial: true,
        error: error.message,
      });
      showPartialState(error.message);
    } else if (state.careerProfile) {
      persistAnalysis({
        isPartial: true,
        error: error.message,
      });
      showPartialState(error.message);
    } else {
      showErrorState(error.message);
    }
  } finally {
    stopLoadingState();
    setBusy(false);
  }
}

function showLoadingState(stage = "profile") {
  stopLoadingState();
  qs("#reportContent").hidden = true;
  qs("#emptyState").hidden = false;
  const isOverview = stage === "overview";
  qs("#emptyState").innerHTML = `
    <div class="loading-card">
      <strong id="loadingTitle">${isOverview ? "正在生成首页总览" : "正在读取你的经历"}</strong>
      <p id="loadingMessage">${isOverview ? "第 2 步：基于已保存的 career_profile 生成首页判断；如果不稳定，会直接保留画像进入深度页。" : "第 1 步：把简历和补充信息压缩成 career_profile，后续页面会复用这份画像。"}</p>
      <div class="loading-track" aria-hidden="true"><span id="loadingBar"></span></div>
      <ol class="loading-steps">
        <li id="loadingStepProfile" class="${isOverview ? "done" : "active"}">压缩职业画像</li>
        <li id="loadingStepOverview" class="${isOverview ? "active" : ""}">生成短总览</li>
        <li id="loadingStepModules">准备深度页面</li>
      </ol>
    </div>
  `;
  const startedAt = Date.now();
  const update = () => {
    const elapsed = Date.now() - startedAt;
    const bar = qs("#loadingBar");
    if (!bar) return;
    const baseProgress = isOverview ? 54 : 18;
    const progress = Math.min(isOverview ? 92 : 52, baseProgress + Math.floor(elapsed / 900));
    bar.style.width = `${progress}%`;
    if (!isOverview && elapsed > 12_000) {
      qs("#loadingTitle").textContent = "正在生成你的职业坐标";
      qs("#loadingMessage").textContent = "正在压缩职业画像。画像成功后会先保存，再生成首页总览。";
      qs("#loadingStepProfile").classList.add("done");
      qs("#loadingStepOverview").classList.add("active");
    }
    if (isOverview && elapsed > 25_000) {
      qs("#loadingTitle").textContent = "正在收束结果";
      qs("#loadingMessage").textContent = "首页总览仍在生成。若它没有达到稳定输出标准，系统会保留画像并开放深度页。";
      qs("#loadingStepOverview").classList.add("done");
      qs("#loadingStepModules").classList.add("active");
    }
  };
  update();
  state.loadingTimer = window.setInterval(update, 900);
}

function stopLoadingState() {
  if (state.loadingTimer) {
    window.clearInterval(state.loadingTimer);
    state.loadingTimer = null;
  }
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
  qs("#chatDock").classList.add("collapsed");
  qs("#chatToggleBtn").textContent = "展开";
  showToast(message);
}

function showPartialState(message) {
  qs("#reportContent").hidden = true;
  qs("#emptyState").hidden = false;
  qs("#emptyState").innerHTML = `
    <strong>已保留职业画像</strong>
    <p>首页总览这次没有达到稳定输出标准，所以不展示泛泛结论。你的简历画像已经保留，可以直接进入深度子页面继续分析。</p>
    <div class="recovery-actions">
      <a class="primary-link" href="./career.html">去职业方向</a>
      <a class="ghost-link" href="./study.html">去留学专业</a>
      <a class="ghost-link" href="./ability.html">去能力地图</a>
    </div>
  `;
  qs("#exportBtn").disabled = true;
  state.report = null;
  state.chatHistory = [];
  setChatAvailable(false);
  qs("#chatDock").classList.add("collapsed");
  qs("#chatToggleBtn").textContent = "展开";
  showToast("已保留职业画像");
}

function renderReport(report) {
  qs("#emptyState").hidden = true;
  qs("#reportContent").hidden = false;
  qs("#exportBtn").disabled = false;

  renderIdentitySnapshot(report);
  renderComfort(report);
  renderCapabilityDiagnosis(report.capabilityDiagnosis || {});
  renderPeerScore(report.peerScore || {});
  renderAbilityFields(report.abilityFields);
  renderPerspectiveUpgrade(report.perspectiveUpgrade || {});
  renderRouteCards(report.routeCards);
  renderDirections(report.suitableDirections);
  renderNewPossibilities(report.newPossibilities);
  renderShortcomings(report.shortcomings || {});
  renderImprovementAdvice(report.improvementAdvice || {});
  renderModuleRecommendations(report.moduleRecommendations);

  const visibleSections = document.querySelectorAll("#reportContent .result-section:not([hidden])").length;
  if (!visibleSections) {
    showPartialState("首页总览没有可展示的有效字段。");
  }
}

function renderIdentitySnapshot(report) {
  const profile = state.careerProfile || report.careerProfile || {};
  const basic = profile.basic || {};
  const snapshot = report.identitySnapshot || {};
  const topStrength = Array.isArray(profile.strengths) ? profile.strengths[0] || {} : {};
  const topWeakness = Array.isArray(profile.weaknesses) ? profile.weaknesses[0] || {} : {};
  const hasWho = setResultText("#identityWho", firstText(
    snapshot.who,
    report.capabilityDiagnosis?.coreAbility,
    topStrength.name ? `一个正在把“${topStrength.name}”转成职业资产的人` : "",
    basic.major,
  ));
  const hasDestination = setResultText("#identityDestination", firstText(
    snapshot.destination,
    basic.targetDirection,
    basic.targetGoal,
  ));
  const hasStage = setResultText("#identityStage", firstText(
    snapshot.stage,
    topWeakness.name ? `已有一些证据，但“${topWeakness.name}”仍需要补齐` : "",
    report.peerScore?.explanation,
  ));
  setSectionVisibleByChild("#identityWho", hasWho || hasDestination || hasStage);
}

function renderComfort(report) {
  const hasComfort = setResultText("#comfortIntro", report.comfortIntro);
  setSectionVisibleByChild("#comfortIntro", hasComfort);
}

function renderCapabilityDiagnosis(diagnosis) {
  const hasCoreAbility = setResultText("#coreAbility", diagnosis.coreAbility);
  const hasEvidence = setResultText("#abilityEvidence", diagnosis.evidence);
  const hasExpressionGap = setResultText("#expressionGap", diagnosis.expressionGap);
  const hasNextProof = setResultText("#nextProof", diagnosis.nextProof);
  setArticleVisibleByChild("#coreAbility", hasCoreAbility);
  setArticleVisibleByChild("#abilityEvidence", hasEvidence);
  setArticleVisibleByChild("#expressionGap", hasExpressionGap);
  setArticleVisibleByChild("#nextProof", hasNextProof);
  setSectionVisibleByChild("#coreAbility", hasCoreAbility || hasEvidence || hasExpressionGap || hasNextProof);
}

function renderPeerScore(peerScore) {
  const scoreInput = peerScore.score;
  const rawScore = Number(scoreInput);
  const explanation = String(peerScore.explanation || "");
  const hasExplanation = isUsefulText(explanation);
  const hasScore = scoreInput !== null && scoreInput !== "" && Number.isFinite(rawScore) && rawScore > 0;
  if (!hasScore && !hasExplanation) {
    setSectionVisibleByChild("#scoreValue", false);
    return;
  }
  setSectionVisibleByChild("#scoreValue", true);
  const shouldDeferScore = !hasScore || /信息不足|补充|无法|不足以/.test(explanation);
  qs(".score-number").classList.toggle("pending", shouldDeferScore);

  if (shouldDeferScore) {
    qs("#scoreValue").textContent = "待评估";
    qs("#scoreBar").style.width = "0";
    qs("#peerExplanation").textContent = fallbackText(peerScore.explanation);
    return;
  }

  const score = Math.max(0, Math.min(10, rawScore));
  qs(".score-number").classList.remove("pending");
  qs("#scoreValue").textContent = Number.isInteger(score) ? String(score) : score.toFixed(1);
  qs("#scoreBar").style.width = `${score * 10}%`;
  qs("#peerExplanation").textContent = fallbackText(peerScore.explanation);
}

function renderAbilityFields(items) {
  const safeItems = Array.isArray(items)
    ? items.filter((item) => isUsefulText(item?.name) && (isUsefulText(item?.currentEvidence) || isUsefulText(item?.usableScenes))).slice(0, 3)
    : [];
  setSectionVisibleByChild("#abilityFields", safeItems.length > 0);
  if (!safeItems.length) {
    qs("#abilityFields").innerHTML = "";
    return;
  }
  qs("#abilityFields").innerHTML = safeItems.map((item, index) => `
    <article class="result-card">
      <span class="card-index">${index + 1}</span>
      <h4>${escapeHtml(fallbackText(item.name))}</h4>
      <dl>
        ${definitionHtml("简历证据", item.currentEvidence)}
        ${definitionHtml("可用场景", item.usableScenes)}
      </dl>
    </article>
  `).join("");
}

function renderPerspectiveUpgrade(perspective) {
  const hasCurrentLayer = setResultText("#currentLayer", perspective.currentLayer);
  const hasNextLayer = setResultText("#nextLayer", perspective.nextLayer);
  const hasExample = setResultText("#perspectiveExample", perspective.example);
  setArticleVisibleByChild("#currentLayer", hasCurrentLayer);
  setArticleVisibleByChild("#nextLayer", hasNextLayer);
  setArticleVisibleByChild("#perspectiveExample", hasExample);
  setSectionVisibleByChild("#currentLayer", hasCurrentLayer || hasNextLayer || hasExample);
}

function renderDirections(items) {
  const safeItems = Array.isArray(items)
    ? items.filter((item) => isUsefulText(item?.title) && isUsefulText(item?.explanation)).slice(0, 3)
    : [];
  setSectionVisibleByChild("#directionList", safeItems.length > 0);
  if (!safeItems.length) {
    qs("#directionList").innerHTML = "";
    return;
  }
  qs("#directionList").innerHTML = safeItems.map((item, index) => `
    <article class="result-card direction-card">
      <span class="card-index">${index + 1}</span>
      <h4>${escapeHtml(fallbackText(item.title))}</h4>
      <p>${escapeHtml(fallbackText(item.explanation))}</p>
    </article>
  `).join("");
}

function renderRouteCards(items) {
  const safeItems = Array.isArray(items)
    ? items.filter((item) => isUsefulText(item?.title) && (isUsefulText(item?.why || item?.reason) || isUsefulText(item?.risk) || isUsefulText(item?.nextStep || item?.firstStep))).slice(0, 4)
    : [];
  setSectionVisibleByChild("#routeCards", safeItems.length >= 4);
  if (safeItems.length < 4) {
    qs("#routeCards").innerHTML = "";
    return;
  }

  qs("#routeCards").innerHTML = safeItems.map((item, index) => `
    <article class="result-card route-card">
      <span class="route-label">${escapeHtml(fallbackText(item.label) || `路线 ${index + 1}`)}</span>
      <h4>${escapeHtml(fallbackText(item.title))}</h4>
      <dl>
        ${definitionHtml("为什么", item.why || item.reason)}
        ${definitionHtml("风险", item.risk)}
        ${definitionHtml("下一步", item.nextStep || item.firstStep)}
      </dl>
    </article>
  `).join("");
}

function renderNewPossibilities(items) {
  const safeItems = Array.isArray(items)
    ? items.filter((item) => isUsefulText(item?.title) && (isUsefulText(item?.reason) || isUsefulText(item?.firstTry))).slice(0, 2)
    : [];
  setSectionVisibleByChild("#newPossibilities", safeItems.length > 0);
  if (!safeItems.length) {
    qs("#newPossibilities").innerHTML = "";
    return;
  }

  qs("#newPossibilities").innerHTML = safeItems.map((item, index) => `
    <article class="result-card direction-card possibility-card">
      <span class="card-index">${index + 1}</span>
      <h4>${escapeHtml(fallbackText(item.title))}</h4>
      <p>${escapeHtml(fallbackText(item.reason))}</p>
      <dl>
        <dt>可以先试</dt>
        <dd>${escapeHtml(fallbackText(item.firstTry))}</dd>
      </dl>
    </article>
  `).join("");
}

function renderShortcomings(shortcomings) {
  const hasSummary = setResultText("#shortcomingsSummary", shortcomings.summary);
  qs("#shortcomingsSummary").hidden = !hasSummary;
  const items = Array.isArray(shortcomings.items) && shortcomings.items.length
    ? shortcomings.items.filter(isUsefulText).slice(0, 3)
    : [];
  setSectionVisibleByChild("#shortcomingsSummary", hasSummary || items.length > 0);
  if (!items.length && !hasSummary) {
    qs("#shortcomingsList").innerHTML = "";
    return;
  }
  qs("#shortcomingsList").innerHTML = items.map((item) => `<li>${escapeHtml(fallbackText(item))}</li>`).join("");
}

function renderImprovementAdvice(advice) {
  const hasNeededAbility = setResultText("#neededAbility", advice.mostNeededAbility);
  const hasMissingExperience = setResultText("#missingExperience", advice.missingExperience);
  const hasShortAdvice = setResultText("#shortAdvice", advice.shortAdvice);
  const hasClosing = setResultText("#closingEncouragement", state.report?.closingEncouragement);
  const hasAdvice = hasNeededAbility || hasMissingExperience || hasShortAdvice;
  setArticleVisibleByChild("#neededAbility", hasNeededAbility);
  setArticleVisibleByChild("#missingExperience", hasMissingExperience);
  setArticleVisibleByChild("#shortAdvice", hasShortAdvice);
  qs("#closingEncouragement").hidden = !hasAdvice || !hasClosing;
  setSectionVisibleByChild("#neededAbility", hasAdvice);
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
  const safeItems = Array.isArray(items)
    ? items.filter((item) => hrefs[item?.module] && (isUsefulText(item?.reason) || isUsefulText(item?.suggestedQuestion))).slice(0, 3)
    : [];
  setSectionVisibleByChild("#moduleRecommendations", safeItems.length > 0);
  if (!safeItems.length) {
    qs("#moduleRecommendations").innerHTML = "";
    return;
  }

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
  qs("#chatDock").classList.remove("collapsed");
  qs("#chatToggleBtn").textContent = "收起";
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
  if (!state.careerProfile) return;
  localStorage.setItem(analysisStorageKey, JSON.stringify({
    careerProfile: state.careerProfile,
    overviewReport: state.report || null,
    extractedResumeText: state.extractedResumeText,
    savedAt: new Date().toISOString(),
    isPartial: !state.report,
  }));
}

function fillSample() {
  qs("#ageInput").value = "31";
  qs("#regionInput").value = "北京";
  qs("#targetGoalInput").value = "转行";
  qs("#currentThoughtInput").value = "想从公关传播和风险策略经验，转到数据分析或策略分析方向；也想确认自己是否适合继续读商科。";
  qs("#targetDirectionInput").value = "数据分析、策略分析、品牌公关";
  qs("#anxietyInput").value = "担心简历看起来分散，不知道哪些经历能转化成可被招聘方理解的能力。";
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
  qs("#regionInput").value = "";
  qs("#targetGoalInput").value = "";
  qs("#currentThoughtInput").value = "";
  qs("#targetDirectionInput").value = "";
  qs("#anxietyInput").value = "";
  qs("#resumeText").value = "";
  qs("#resumeFile").value = "";
  qs("#fileStatus").textContent = "支持 TXT、MD、PDF、DOCX。";
  qs("#reportContent").hidden = true;
  qs("#emptyState").hidden = false;
  qs("#emptyState").innerHTML = `
    <strong>等待载入经历</strong>
    <p>上传或粘贴简历后，系统会先生成 career_profile，再输出首页短总览。深度模块会复用画像，减少重复 token 消耗。</p>
  `;
  qs("#exportBtn").disabled = true;
  state.report = null;
  state.careerProfile = null;
  state.uploadedFile = null;
  state.extractedResumeText = "";
  state.chatHistory = [];
  qs("#chatMessages").innerHTML = '<div class="chat-placeholder">完成上方分析后，可以在这里追问细节。</div>';
  setChatAvailable(false);
  qs("#chatDock").classList.add("collapsed");
  qs("#chatToggleBtn").textContent = "展开";
  localStorage.removeItem(storageKey);
  localStorage.removeItem(analysisStorageKey);
  openIntakeModal();
  showToast("已清空");
}

function bindEvents() {
  qs("#resumeFile").addEventListener("change", handleFileSelect);
  qs("#analyzeBtn").addEventListener("click", analyze);
  qs("#sampleBtn").addEventListener("click", fillSample);
  qs("#clearBtn").addEventListener("click", clearAll);
  qs("#exportBtn").addEventListener("click", exportJson);
  qs("#openIntakeBtn").addEventListener("click", openIntakeModal);
  qs("#closeIntakeBtn").addEventListener("click", closeIntakeModal);
  qs("#modalScrim").addEventListener("click", closeIntakeModal);
  qs("#chatToggleBtn").addEventListener("click", () => {
    const dock = qs("#chatDock");
    dock.classList.toggle("collapsed");
    qs("#chatToggleBtn").textContent = dock.classList.contains("collapsed") ? "展开" : "收起";
  });
  qs("#chatForm").addEventListener("submit", (event) => {
    event.preventDefault();
    sendChat();
  });
  document.querySelectorAll("#promptChips button").forEach((button) => {
    button.addEventListener("click", () => sendChat(button.dataset.question || ""));
  });
  qs("#ageInput").addEventListener("input", persistDraft);
  qs("#regionInput").addEventListener("input", persistDraft);
  qs("#targetGoalInput").addEventListener("change", persistDraft);
  qs("#currentThoughtInput").addEventListener("input", persistDraft);
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
