const http = require("http");
const fs = require("fs");
const path = require("path");
const mammoth = require("mammoth");
const pdfParseModule = require("pdf-parse");

const PUBLIC_DIR = __dirname;
const ENV_FILE = path.join(PUBLIC_DIR, ".env");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && !process.env[key]) process.env[key] = value;
  }
  return true;
}

const envFileLoaded = loadEnvFile(ENV_FILE);

const PORT = Number(process.env.PORT || 4173);
const DEEPSEEK_API_KEY = (process.env.DEEPSEEK_API_KEY || "").trim();
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 120000);
const OVERVIEW_TIMEOUT_MS = Number(process.env.OVERVIEW_TIMEOUT_MS || 22000);
const OVERVIEW_REPAIR_TIMEOUT_MS = Number(process.env.OVERVIEW_REPAIR_TIMEOUT_MS || 6000);
const PROFILE_MAX_TOKENS = Number(process.env.PROFILE_MAX_TOKENS || 1100);
const OVERVIEW_MAX_TOKENS = Number(process.env.OVERVIEW_MAX_TOKENS || 1300);
const MODULE_MAX_TOKENS = Number(process.env.MODULE_MAX_TOKENS || 1900);
const CHAT_MAX_TOKENS = Number(process.env.CHAT_MAX_TOKENS || 1100);
const JSON_REPAIR_MAX_TOKENS = Number(process.env.JSON_REPAIR_MAX_TOKENS || 1200);
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 12_000_000);
const MAX_RESUME_TEXT_CHARS = Number(process.env.MAX_RESUME_TEXT_CHARS || 12_000);
const MAX_PROFILE_RESUME_TEXT_CHARS = Number(process.env.MAX_PROFILE_RESUME_TEXT_CHARS || 8_000);
const MAX_PROFILE_JSON_CHARS = Number(process.env.MAX_PROFILE_JSON_CHARS || 3_500);
const MAX_MODULE_INPUT_CHARS = Number(process.env.MAX_MODULE_INPUT_CHARS || 1_000);
const MAX_FILE_BYTES = Number(process.env.MAX_FILE_BYTES || 6_000_000);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
};

const jsonOnlyContract = [
  "只返回一个合法 JSON 对象。",
  "不要 markdown，不要代码块，不要解释过程。",
  "不要编造用户没有提供的经历、成绩、学校、公司、论文、奖项或语言成绩。",
  "证据不足时不要强行推断；可省略的字段留空或返回空数组，必须说明缺口时写具体缺什么，不要只写“信息不足”。",
  "所有文本使用中文，句子保持短。",
].join("\n");

const careerJudgmentPrinciples = [
  "核心判断规则：能力比经历重要。经历只有能证明能力、判断、设计、协作或产出时才有职业价值。",
  "不要只复述经历，要判断经历背后形成了什么能力；如果简历写不清楚，要直接指出表达问题。",
  "量化结果重要，但不能替代能力判断。输出时先说能力，再说证据和结果。",
  "要区分执行、战术、战略三个层级：执行者完成任务，战术型人才设计打法，战略型人才理解目标、布局和取舍。",
  "要看视野。比如写一篇稿子不只是写稿，而可能是在证明观点、服务传播布局、逐步建立公司认知。",
  "要区分学术、科研、工业、商业、创作等方向的本质差异，关注用户的倾向、动机和适配环境。",
  "未来更重要的是优秀判断和设计能力。AI 会替代重复劳动，但难以替代发现不可能中的可能、创造交互价值和做复杂取舍。",
  "输出必须具体到简历证据、表达缺口、能力层级和下一步动作，避免泛泛鼓励。",
].join("\n");

const profileSystemPrompt = [
  "你是职业发展产品里的信息抽取器。",
  "你的任务是把用户简历和基础问题压缩成结构化 career_profile，供后续模块复用。",
  "只抽取和谨慎归纳，不做长篇建议。",
  "输出要紧凑，避免重复，尽量用短句。",
  careerJudgmentPrinciples,
  jsonOnlyContract,
].join("\n");

const profileJsonContract = [
  "JSON 顶层字段必须为：basic, experienceSummary, skills, strengths, weaknesses, careerSignals, studySignals, abilitySignals, evidence, expressionProblems, missingInformation。",
  "basic 字段：age, region, educationStage, major, yearsOfExperience, targetGoal, currentThought, targetDirection, anxiety。",
  "experienceSummary 最多 5 条，每条字段：title, evidence。",
  "skills 最多 8 条，每条字段：name, evidence, level。",
  "strengths 最多 5 条，每条字段：name, evidence。",
  "weaknesses 最多 5 条，每条字段：name, evidence。",
  "careerSignals 最多 6 条，描述职业推荐可用信号。",
  "studySignals 最多 6 条，描述留学/专业推荐可用信号。",
  "abilitySignals 最多 8 条，描述能力地图可用信号。",
  "evidence 最多 8 条，保留关键原文证据或事实摘要。",
  "expressionProblems 最多 5 条，指出简历中写不清楚、能力证据不足、只有经历没有能力转译的地方。",
  "missingInformation 最多 6 条，列出影响判断的缺失信息。",
].join("\n");

const overviewSystemPrompt = [
  "你是克制、专业的职业发展总览分析器。",
  "你只基于 career_profile 生成总览，不读取原始简历。",
  "总览用于首页，必须短、清楚、可引导用户进入深度模块。",
  "语气要先接住用户，不做廉价夸奖；表达为：你不是没有可能，只是需要看清已有资产、缺口和下一步。",
  "不要把职业未来说成唯一答案，要帮助用户看到 1-2 个新的、但仍基于简历证据的可能性。",
  careerJudgmentPrinciples,
  jsonOnlyContract,
].join("\n");

const overviewJsonContract = [
  "JSON 顶层字段优先包含：identitySnapshot, comfortIntro, capabilityDiagnosis, peerScore, abilityFields, perspectiveUpgrade, routeCards, suitableDirections, newPossibilities, shortcomings, improvementAdvice, closingEncouragement, moduleRecommendations。",
  "如果某个可选模块没有足够 career_profile 证据，可以省略该字段或返回空数组/空对象；不要用占位句补齐页面。",
  "identitySnapshot：字段 who, destination, stage。分别回答“你是谁”“你想去哪”“你到哪一步了”，每项不超过 70 个中文字符。",
  "capabilityDiagnosis：字段 coreAbility, evidence, expressionGap, nextProof。必须像产品诊断，不要像简历摘要；coreAbility 要命名为独特能力标签，例如“内容安全体系化设计能力”“风险信号翻译能力”；evidence 必须引用 career_profile 的具体项目或事实；expressionGap 必须指出为什么招聘方看不懂；nextProof 必须是一个可执行补证动作。",
  "peerScore：字段 score, explanation。score 为 0-10；无法可靠比较时 score 用 null，explanation 写清缺少哪类对照信息。",
  "abilityFields：0-3 项，每项字段 name, currentEvidence, usableScenes。有具体证据才输出。",
  "perspectiveUpgrade：字段 currentLayer, nextLayer, example。说明用户目前更像执行/战术/战略哪一层，以及如何往上一层看问题；没有具体例子可省略。",
  "routeCards：4 项，每项字段 label, title, why, risk, nextStep。label 固定为：最高薪路线、最快上岸路线、最轻松路线、均衡路线。title 必须是具体岗位/路径，不允许写“高薪潜力方向”“最快可尝试方向”“低阻力过渡方向”“平衡成长方向”这类占位词。",
  "routeCards 每项都必须基于 career_profile 的证据，why/risk/nextStep 必须具体到岗位场景、证据缺口或 7 天动作。",
  "suitableDirections：3 项，每项字段 title, explanation。title 必须是具体岗位方向或职业场景。",
  "newPossibilities：0-2 项，每项字段 title, reason, firstTry。用于让用户看到原路径之外的可能性；必须基于证据。",
  "shortcomings：字段 summary, items。items 最多 3 条；只输出可被证据支持的短板。",
  "improvementAdvice：字段 mostNeededAbility, missingExperience, shortAdvice；只输出可被证据支持的建议。",
  "comfortIntro：开篇安慰总起，1-2 句，必须具体、不空泛。",
  "closingEncouragement：结尾安慰，1 句，强调可以从最小行动开始。",
  "moduleRecommendations：3 项，每项字段 module, reason, suggestedQuestion。module 只能是 career, study, ability。",
  "所有文本字段尽量不超过 80 个中文字符。",
].join("\n");

const compactOverviewJsonContract = [
  "JSON 顶层字段必须为：identitySnapshot, capabilityDiagnosis, peerScore, routeCards, suitableDirections, moduleRecommendations。",
  "identitySnapshot 字段：who, destination, stage。",
  "capabilityDiagnosis 字段：coreAbility, evidence, expressionGap, nextProof。必须具体引用 career_profile 证据。",
  "peerScore 字段：score, explanation。score 为 0-10；无法可靠比较时 score 用 null，explanation 写清缺少哪类对照信息。",
  "routeCards 必须 4 项，每项字段：label, title, why, risk, nextStep。label 固定为：最高薪路线、最快上岸路线、最轻松路线、均衡路线。title 必须是具体岗位/路径，不允许写泛泛占位词。",
  "suitableDirections 必须 3 项，每项字段：title, explanation。",
  "moduleRecommendations 必须 3 项，每项字段：module, reason, suggestedQuestion。module 只能是 career, study, ability。",
  "所有文本字段不超过 70 个中文字符。只返回合法 JSON。",
].join("\n");

const moduleSystemPrompts = {
  career: [
    "你是职业方向分析器。",
    "你只基于 career_profile 和用户补充问题分析职业方向。",
    "重点回答适合什么岗位、为什么、风险是什么、下一步怎么做。",
    "补充 1-2 个轻量路径组合和可能性发现，帮助用户看到不止一种走法，但不要做成重报告。",
    careerJudgmentPrinciples,
    jsonOnlyContract,
  ].join("\n"),
  study: [
    "你是留学与专业方向分析器。",
    "你只基于 career_profile 和用户补充问题分析专业/留学方向。",
    "如缺少 GPA、语言成绩、预算、国家地区等信息，要明确提示信息不足。",
    "不要虚构具体学校、项目排名或录取概率。",
    "补充 1-2 个轻量路径组合和可能性发现，帮助用户看到专业/留学选择背后的更多连接方式。",
    careerJudgmentPrinciples,
    jsonOnlyContract,
  ].join("\n"),
  ability: [
    "你是能力地图分析器。",
    "你只基于 career_profile 和用户补充问题生成能力结构、短板和训练任务。",
    "重点是可迁移能力、当前等级、下一阶段任务。",
    "补充 1-2 个轻量路径组合和可能性发现，帮助用户看到能力还能迁移到哪些新场景。",
    careerJudgmentPrinciples,
    jsonOnlyContract,
  ].join("\n"),
};

const moduleJsonContracts = {
  career: [
    "JSON 顶层字段必须为：summary, directions, risks, keywords, strategicLayer, possibilityNotes, pathCombinations, followUpQuestions, actionPlan, missingInformation。",
    "summary 字段：oneLine, bestFit。",
    "directions 3-5 项，每项字段：title, matchScore, evidence, risk, firstStep。",
    "risks 最多 5 条。",
    "keywords 最多 12 个岗位或搜索关键词。",
    "possibilityNotes 最多 2 项，每项字段：title, reason, firstTry。",
    "pathCombinations 最多 2 项，每项字段：name, focus, nextStep。",
    "strategicLayer 字段：currentLevel, why, upgradeMove。currentLevel 只能是 execution, tactical, strategic 之一。",
    "followUpQuestions 最多 3 条，用于引导用户继续追问和补充信息。",
    "actionPlan 字段：days30, days60, days90，每个字段最多 3 条。",
    "missingInformation 最多 5 条。",
  ].join("\n"),
  study: [
    "JSON 顶层字段必须为：summary, recommendedMajors, notRecommended, strategicLayer, possibilityNotes, pathCombinations, followUpQuestions, applicationGaps, careerLink, nextSteps, missingInformation。",
    "summary 字段：oneLine, strategy。",
    "recommendedMajors 3-5 项，每项字段：name, matchScore, evidence, careerPath, risk。",
    "notRecommended 最多 3 项，每项字段：name, reason。",
    "possibilityNotes 最多 2 项，每项字段：title, reason, firstTry。",
    "pathCombinations 最多 2 项，每项字段：name, focus, nextStep。",
    "strategicLayer 字段：currentLevel, why, upgradeMove。说明更偏学术、科研、工业还是商业应用，以及视野如何升级。",
    "followUpQuestions 最多 3 条，用于引导用户继续追问和补充信息。",
    "applicationGaps 最多 5 条。",
    "careerLink 最多 5 条，说明专业和职业路径如何连接。",
    "nextSteps 最多 6 条。",
    "missingInformation 最多 6 条。",
  ].join("\n"),
  ability: [
    "JSON 顶层字段必须为：summary, abilityRadar, transferableAbilities, strategicLayer, possibilityNotes, pathCombinations, followUpQuestions, bottlenecks, trainingTasks, nextMilestone, missingInformation。",
    "summary 字段：oneLine, typeLabel。",
    "abilityRadar 6 项，每项字段：name, score, evidence。score 为 0-10。",
    "transferableAbilities 最多 5 项，每项字段：name, usableScenes。",
    "possibilityNotes 最多 2 项，每项字段：title, reason, firstTry。",
    "pathCombinations 最多 2 项，每项字段：name, focus, nextStep。",
    "strategicLayer 字段：currentLevel, why, upgradeMove。说明用户更像执行、战术还是战略型能力，并给升级动作。",
    "followUpQuestions 最多 3 条，用于引导用户继续追问和补充信息。",
    "bottlenecks 最多 5 条。",
    "trainingTasks 最多 6 项，每项字段：task, purpose, timeCost。",
    "nextMilestone 字段：title, criteria。",
    "missingInformation 最多 5 条。",
  ].join("\n"),
};

const resumeChatSystemPrompt = [
  "你是一个专业、克制的简历追问助手。",
  "你只能基于用户提供的 career_profile、前置分析和最近对话回答。",
  "如果简历证据不足，要直接说明信息不足，不要编造经历、成绩、公司、学校或论文。",
  "回答要有判断、有解释，但保持简洁。默认使用中文。",
  careerJudgmentPrinciples,
  "追问回答要更像导师互动：先判断用户真正卡点，再给 2-3 个可继续追问的问题或补充材料建议。",
  "不要输出 JSON，不要输出表格，不要做与职业发展无关的闲聊。",
].join("\n");

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error(`Request body is too large. Max ${Math.round(MAX_BODY_BYTES / 1_000_000)}MB.`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readJson(req) {
  const rawBody = await readBody(req);
  if (!rawBody.trim()) return {};
  return JSON.parse(rawBody);
}

function extractJsonText(text) {
  const trimmed = String(text || "").trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function normalizeText(value, limit = MAX_RESUME_TEXT_CHARS) {
  return String(value || "").replace(/\u0000/g, "").slice(0, limit).trim();
}

function normalizeContext(rawContext = {}) {
  const context = rawContext && typeof rawContext === "object" ? rawContext : {};
  return {
    age: normalizeText(context.age, 12),
    region: normalizeText(context.region, 80),
    targetGoal: normalizeText(context.targetGoal, 60),
    currentThought: normalizeText(context.currentThought, 280),
    targetDirection: normalizeText(context.targetDirection, 160),
    anxiety: normalizeText(context.anxiety, 240),
  };
}

function stringifyCompact(value, limit = MAX_PROFILE_JSON_CHARS) {
  return normalizeText(JSON.stringify(value || {}, null, 2), limit);
}

function normalizeChatMessage(message) {
  if (!message || typeof message !== "object") return null;
  const role = message.role === "assistant" ? "assistant" : "user";
  const content = normalizeText(message.content, 1200);
  return content ? { role, content } : null;
}

function dataUrlBytes(dataUrl) {
  const base64 = String(dataUrl || "").split(",")[1] || "";
  return Math.floor((base64.length * 3) / 4);
}

function dataUrlToBuffer(dataUrl) {
  const base64 = String(dataUrl || "").split(",")[1] || "";
  return Buffer.from(base64, "base64");
}

function normalizeFile(file) {
  if (!file || typeof file !== "object") return null;
  const name = normalizeText(file.name, 160) || "resume";
  const mimeType = normalizeText(file.type, 120) || "application/octet-stream";
  const dataUrl = String(file.dataUrl || "");
  if (!dataUrl.startsWith("data:")) return null;
  const sizeBytes = dataUrlBytes(dataUrl);
  if (sizeBytes > MAX_FILE_BYTES) {
    const maxMb = Math.round(MAX_FILE_BYTES / 1_000_000);
    throw new Error(`Resume file is too large. Max ${maxMb}MB.`);
  }
  return { name, type: mimeType, dataUrl, sizeBytes };
}

function getFileExtension(fileName) {
  return path.extname(String(fileName || "")).toLowerCase();
}

function isPdfFile(file) {
  return file.type === "application/pdf" || getFileExtension(file.name) === ".pdf";
}

function isDocxFile(file) {
  return file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    || getFileExtension(file.name) === ".docx";
}

function isTextFile(file) {
  const extension = getFileExtension(file.name);
  return file.type.startsWith("text/") || extension === ".txt" || extension === ".md";
}

async function extractTextFromFile(file) {
  if (!file) return "";

  const buffer = dataUrlToBuffer(file.dataUrl);
  if (!buffer.length) return "";

  if (isTextFile(file)) {
    return normalizeText(buffer.toString("utf8"));
  }

  if (isPdfFile(file)) {
    return extractTextFromPdf(buffer);
  }

  if (isDocxFile(file)) {
    const result = await mammoth.extractRawText({ buffer });
    return normalizeText(result.value);
  }

  throw new Error("Unsupported resume file type. Please upload TXT, MD, PDF, or DOCX.");
}

async function extractTextFromPdf(buffer) {
  if (typeof pdfParseModule === "function") {
    const result = await pdfParseModule(buffer);
    return normalizeText(result.text);
  }

  if (typeof pdfParseModule.PDFParse === "function") {
    const parser = new pdfParseModule.PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return normalizeText(result.text);
    } finally {
      await parser.destroy();
    }
  }

  throw new Error("PDF parser is not available.");
}

function buildProfilePrompt(payload, resumeText, file) {
  const context = normalizeContext(payload.context);
  return [
    "请把以下信息压缩成 career_profile JSON。",
    "这一步只做结构化画像，不生成长报告。",
    "",
    "用户基础信息：",
    JSON.stringify({
      age: context.age || "未填写",
      region: context.region || "未填写",
      targetGoal: context.targetGoal || "未填写",
      currentThought: context.currentThought || "未填写",
      targetDirection: context.targetDirection || "未填写",
      anxiety: context.anxiety || "未填写",
      uploadedFile: file ? { name: file.name, type: file.type, sizeBytes: file.sizeBytes } : null,
    }, null, 2),
    "",
    "简历正文，可能已按长度截断：",
    normalizeText(resumeText, MAX_PROFILE_RESUME_TEXT_CHARS),
  ].join("\n");
}

function buildOverviewPrompt(careerProfile) {
  return [
    "请基于 career_profile 生成首页总览 JSON。",
    "不要要求原始简历，不要生成深度报告。",
    "总览需要引导用户进入 career/study/ability 三个深度模块。",
    "",
    "career_profile：",
    stringifyCompact(careerProfile),
  ].join("\n");
}

function buildCompactOverviewPrompt(careerProfile, previousError = "") {
  return [
    "上一轮首页总览 JSON 不稳定，请改用更短 JSON 重新生成。",
    "只生成合同要求的核心字段，避免长句和复杂嵌套。",
    "必须基于 career_profile 的证据，不要输出模板占位词。",
    "四条路线必须具体到岗位或路径。",
    previousError ? `上一轮错误摘要：${normalizeText(previousError, 220)}` : "",
    "",
    "career_profile：",
    stringifyCompact(careerProfile),
  ].filter(Boolean).join("\n");
}

function buildJsonCompletionBody({ systemPrompt, contract, userPrompt, maxTokens, temperature = 0.2 }) {
  return {
    model: DEEPSEEK_MODEL,
    temperature,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
    thinking: { type: "disabled" },
    messages: [
      {
        role: "system",
        content: `${systemPrompt}\n\n${contract}`,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
  };
}

function buildModulePrompt(moduleType, careerProfile, moduleInput) {
  const input = moduleInput && typeof moduleInput === "object" ? moduleInput : {};
  return [
    `请基于 career_profile 生成 ${moduleType} 模块 JSON。`,
    "只完成当前模块，不要输出其他模块内容。",
    "",
    "career_profile：",
    stringifyCompact(careerProfile),
    "",
    "用户补充信息：",
    JSON.stringify({
      targetIndustry: normalizeText(input.targetIndustry, 80),
      targetRole: normalizeText(input.targetRole, 80),
      targetCity: normalizeText(input.targetCity, 80),
      salaryExpectation: normalizeText(input.salaryExpectation, 80),
      acceptTransition: normalizeText(input.acceptTransition, 80),
      studyCountry: normalizeText(input.studyCountry, 80),
      studyBudget: normalizeText(input.studyBudget, 80),
      gpa: normalizeText(input.gpa, 80),
      languageScore: normalizeText(input.languageScore, 80),
      selfAssessment: normalizeText(input.selfAssessment, MAX_MODULE_INPUT_CHARS),
      extraQuestion: normalizeText(input.extraQuestion, MAX_MODULE_INPUT_CHARS),
    }, null, 2),
  ].join("\n");
}

function buildResumeChatMessages(payload) {
  const question = normalizeText(payload.question, 1200);
  const history = Array.isArray(payload.history)
    ? payload.history.slice(-6).map(normalizeChatMessage).filter(Boolean)
    : [];
  const profileText = stringifyCompact(payload.careerProfile, MAX_PROFILE_JSON_CHARS);
  const reportText = normalizeText(JSON.stringify(payload.report || {}, null, 2), 2500);

  return [
    {
      role: "system",
      content: resumeChatSystemPrompt,
    },
    {
      role: "user",
      content: [
        "以下是本次对话的固定上下文。后续回答必须基于这些材料。",
        "",
        "career_profile：",
        profileText || "暂无 career_profile。",
        "",
        "前置分析 JSON：",
        reportText || "暂无前置分析。",
      ].join("\n"),
    },
    ...history,
    {
      role: "user",
      content: question,
    },
  ];
}

async function callDeepSeekJson(requestBody) {
  return callDeepSeekJsonWithTimeout(requestBody, AI_TIMEOUT_MS);
}

async function callDeepSeekJsonWithTimeout(requestBody, timeoutMs, repairTimeoutMs = Math.min(timeoutMs, AI_TIMEOUT_MS)) {

  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek API ${response.status}: ${errorText.slice(0, 800)}`);
  }

  const data = await response.json();
  const outputText = data.choices?.[0]?.message?.content || "";
  return parseOrRepairJson(outputText, repairTimeoutMs);
}

async function createCareerProfile(payload, resumeText, file) {
  return callDeepSeekJson(buildJsonCompletionBody({
    systemPrompt: profileSystemPrompt,
    contract: profileJsonContract,
    userPrompt: buildProfilePrompt(payload, resumeText, file),
    maxTokens: PROFILE_MAX_TOKENS,
    temperature: 0.1,
  }));
}

function firstText(values, fallback = "信息不足") {
  for (const value of values) {
    if (!value) continue;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return fallback;
}

function firstItem(items) {
  return Array.isArray(items) && items.length ? items[0] || {} : {};
}

function isGenericRouteTitle(title) {
  return /^(高薪潜力方向|最快可尝试方向|低阻力过渡方向|平衡成长方向|信息不足|方向|岗位方向|职业方向)$/i.test(String(title || "").trim());
}

function assertOverviewQuality(report) {
  const diagnosis = report?.capabilityDiagnosis || {};
  const routes = Array.isArray(report?.routeCards) ? report.routeCards : [];
  const concreteRoutes = routes.filter((item) => item?.title && !isGenericRouteTitle(item.title));
  const hasSpecificDiagnosis = String(diagnosis.coreAbility || "").trim().length >= 6
    && String(diagnosis.evidence || "").trim().length >= 12
    && !/信息不足|可迁移能力仍需/.test(`${diagnosis.coreAbility || ""}${diagnosis.evidence || ""}`);

  if (concreteRoutes.length < 4 || !hasSpecificDiagnosis) {
    throw new Error("Overview quality check failed: route cards or capability diagnosis are too generic.");
  }
}

function ensureOverviewFields(report, careerProfile) {
  const safeReport = report && typeof report === "object" ? report : {};
  const strengths = Array.isArray(careerProfile?.strengths) ? careerProfile.strengths : [];
  const weaknesses = Array.isArray(careerProfile?.weaknesses) ? careerProfile.weaknesses : [];
  const expressionProblems = Array.isArray(careerProfile?.expressionProblems) ? careerProfile.expressionProblems : [];
  const basic = careerProfile?.basic || {};

  if (!safeReport.identitySnapshot || typeof safeReport.identitySnapshot !== "object") {
    const topStrength = firstItem(strengths);
    const topWeakness = firstItem(weaknesses);
    safeReport.identitySnapshot = {
      who: firstText([
        topStrength.name ? `一个正在把“${topStrength.name}”转成职业资产的人` : "",
        basic.major ? `一个有${basic.major}背景、正在重新确认方向的人` : "",
        "一个需要把经历重新翻译成职业资产的人",
      ]),
      destination: firstText([
        basic.targetDirection,
        basic.targetGoal,
        "先找到一个可验证的小方向，再逐步扩大选择面",
      ]),
      stage: firstText([
        topWeakness.name ? `已有一些经历证据，但“${topWeakness.name}”仍需要补齐` : "",
        expressionProblems[0],
        "处在从经历整理走向方向验证的阶段",
      ]),
    };
  }

  return safeReport;
}

function inferStrategicLevel(careerProfile) {
  const text = JSON.stringify(careerProfile || {});
  if (/(策略|战略|布局|管理|负责人|主导|设计|规划|增长|模型|研究)/.test(text)) return "tactical";
  if (/(执行|助理|协助|整理|录入|参与|志愿|实习)/.test(text)) return "execution";
  return "execution";
}

function ensureModuleFields(moduleType, report, careerProfile, moduleInput) {
  const safeReport = report && typeof report === "object" ? report : {};
  const level = inferStrategicLevel(careerProfile);
  const evidence = Array.isArray(careerProfile?.evidence) ? careerProfile.evidence : [];
  const missing = Array.isArray(careerProfile?.missingInformation) ? careerProfile.missingInformation : [];
  const target = firstText([
    moduleInput?.targetRole,
    moduleInput?.targetIndustry,
    moduleInput?.extraQuestion,
    careerProfile?.basic?.targetDirection,
    moduleType,
  ]);

  if (!safeReport.strategicLayer || typeof safeReport.strategicLayer !== "object") {
    safeReport.strategicLayer = {
      currentLevel: level,
      why: firstText([
        evidence[0] ? `当前证据主要来自：${evidence[0]}。这能说明已有行动和初步判断，但还需要提炼方法。` : "",
        "当前简历更能证明执行经历，尚未充分证明战术设计或战略取舍。",
      ]),
      upgradeMove: "下一步把一个经历拆成：目标、对象、判断、动作、结果、复盘。这样才从“做过”升级为“会设计”。",
    };
  }

  if (!Array.isArray(safeReport.followUpQuestions) || !safeReport.followUpQuestions.length) {
    safeReport.followUpQuestions = [
      `围绕${target}，你最想让我继续判断的是岗位匹配、能力缺口，还是下一步行动？`,
      "你能补充一个最有代表性的项目吗：你负责什么、遇到什么困难、最后结果如何？",
      missing[0] ? `目前最缺的信息是“${missing[0]}”，你愿意先补这一项吗？` : "你希望我下一步帮你把这段经历改写成简历表达吗？",
    ];
  }

  return safeReport;
}

async function createOverviewReport(careerProfile) {
  try {
    const report = await callDeepSeekJsonWithTimeout(buildJsonCompletionBody({
      systemPrompt: overviewSystemPrompt,
      contract: overviewJsonContract,
      userPrompt: buildOverviewPrompt(careerProfile),
      maxTokens: OVERVIEW_MAX_TOKENS,
      temperature: 0.2,
    }), OVERVIEW_TIMEOUT_MS, OVERVIEW_REPAIR_TIMEOUT_MS);
    const safeReport = ensureOverviewFields(report, careerProfile);
    assertOverviewQuality(safeReport);
    return safeReport;
  } catch (error) {
    const compactReport = await callDeepSeekJsonWithTimeout(buildJsonCompletionBody({
      systemPrompt: overviewSystemPrompt,
      contract: compactOverviewJsonContract,
      userPrompt: buildCompactOverviewPrompt(careerProfile, error.message),
      maxTokens: Math.min(OVERVIEW_MAX_TOKENS, 900),
      temperature: 0.1,
    }), Math.min(OVERVIEW_TIMEOUT_MS, 15000), Math.min(OVERVIEW_REPAIR_TIMEOUT_MS, 5000));
    const report = ensureOverviewFields(compactReport, careerProfile);
    assertOverviewQuality(report);
    report.meta = {
      ...(report.meta || {}),
      compactOverviewRetry: true,
    };
    return report;
  }
}

async function createModuleReport(moduleType, careerProfile, moduleInput) {
  if (!moduleSystemPrompts[moduleType] || !moduleJsonContracts[moduleType]) {
    throw new Error("Unsupported analysis module.");
  }

  const report = await callDeepSeekJson(buildJsonCompletionBody({
    systemPrompt: moduleSystemPrompts[moduleType],
    contract: moduleJsonContracts[moduleType],
    userPrompt: buildModulePrompt(moduleType, careerProfile, moduleInput),
    maxTokens: MODULE_MAX_TOKENS,
    temperature: 0.2,
  }));
  return ensureModuleFields(moduleType, report, careerProfile, moduleInput);
}

async function streamDeepSeekChat(payload, res) {
  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      temperature: 0.25,
      max_tokens: CHAT_MAX_TOKENS,
      stream: true,
      thinking: { type: "disabled" },
      messages: buildResumeChatMessages(payload),
    }),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek API ${response.status}: ${errorText.slice(0, 800)}`);
  }

  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const dataText = trimmed.slice(5).trim();
      if (!dataText || dataText === "[DONE]") {
        if (dataText === "[DONE]") {
          res.end();
          return;
        }
        continue;
      }

      try {
        const chunk = JSON.parse(dataText);
        const delta = chunk.choices?.[0]?.delta?.content || "";
        if (delta) res.write(delta);
      } catch {
        // Ignore malformed SSE lines from the provider and keep the stream open.
      }
    }
  }

  res.end();
}

async function parseOrRepairJson(outputText, repairTimeoutMs = AI_TIMEOUT_MS) {
  const jsonText = extractJsonText(outputText);
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    try {
      return await repairJsonWithDeepSeek(jsonText, error.message, repairTimeoutMs);
    } catch (repairError) {
      const preview = jsonText.slice(Math.max(0, Number(error.message.match(/position (\d+)/)?.[1] || 0) - 180), Number(error.message.match(/position (\d+)/)?.[1] || 360) + 180);
      throw new Error(`DeepSeek returned invalid JSON: ${error.message}. Repair failed: ${repairError.message}. Preview: ${preview}`);
    }
  }
}

async function repairJsonWithDeepSeek(badJson, parseError, timeoutMs = AI_TIMEOUT_MS) {
  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
	      model: DEEPSEEK_MODEL,
	      temperature: 0,
	      max_tokens: JSON_REPAIR_MAX_TOKENS,
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      messages: [
        {
          role: "system",
          content: [
            "你是 JSON 修复器。",
            "只修复语法错误，不改变字段含义，不新增分析。",
            "只返回一个合法 JSON 对象，不要 markdown。",
          ].join("\n"),
        },
        {
          role: "user",
          content: `解析错误：${parseError}\n\n待修复 JSON：\n${badJson}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek repair API ${response.status}: ${errorText.slice(0, 500)}`);
  }

  const data = await response.json();
  const repairedText = data.choices?.[0]?.message?.content || "";
  return JSON.parse(extractJsonText(repairedText));
}

async function handleAnalyzeResume(req, res) {
  try {
    const payload = await readJson(req);
    let resumeText = normalizeText(payload.resumeText);
    const file = normalizeFile(payload.file);

    if (!resumeText && file) {
      resumeText = await extractTextFromFile(file);
    }

    if (!resumeText && !file) {
      sendJson(res, 400, { error: "请上传简历文件，或粘贴简历文本。" });
      return;
    }

    if (!resumeText) {
      sendJson(res, 400, { error: "没有从简历文件中提取到可分析文本，请换一个文件或粘贴正文。" });
      return;
    }

    if (!DEEPSEEK_API_KEY) {
      sendJson(res, 500, {
        error: "DEEPSEEK_API_KEY is not configured on the local server. This product requires DeepSeek AI analysis.",
        code: "missing_api_key",
      });
      return;
    }

    let careerProfile = null;
    try {
      careerProfile = await createCareerProfile(payload, resumeText, file);
    } catch (error) {
      sendJson(res, 502, {
        error: error.message,
        code: "profile_analysis_failed",
        provider: "deepseek",
        model: DEEPSEEK_MODEL,
        baseUrl: DEEPSEEK_BASE_URL,
      });
      return;
    }

    try {
      const report = await createOverviewReport(careerProfile);
      report.meta = {
        mode: "ai",
        provider: "deepseek",
        model: DEEPSEEK_MODEL,
        baseUrl: DEEPSEEK_BASE_URL,
        analyzedAt: new Date().toISOString(),
        source: file ? "file" : "text",
        fileName: file?.name || null,
        extractedTextChars: resumeText.length,
        profileInputChars: Math.min(resumeText.length, MAX_PROFILE_RESUME_TEXT_CHARS),
        tokenBudget: {
          profileMaxTokens: PROFILE_MAX_TOKENS,
          overviewMaxTokens: OVERVIEW_MAX_TOKENS,
          moduleMaxTokens: MODULE_MAX_TOKENS,
          chatMaxTokens: CHAT_MAX_TOKENS,
        },
      };
      report.careerProfile = careerProfile;
      report.extractedResumeText = resumeText;
      sendJson(res, 200, report);
    } catch (error) {
      sendJson(res, 502, {
        error: error.message,
        code: "overview_analysis_failed",
        provider: "deepseek",
        model: DEEPSEEK_MODEL,
        baseUrl: DEEPSEEK_BASE_URL,
        partial: {
          careerProfile,
          extractedResumeText: resumeText,
          analyzedAt: new Date().toISOString(),
          tokenBudget: {
            profileMaxTokens: PROFILE_MAX_TOKENS,
            overviewMaxTokens: OVERVIEW_MAX_TOKENS,
            moduleMaxTokens: MODULE_MAX_TOKENS,
            chatMaxTokens: CHAT_MAX_TOKENS,
          },
        },
      });
    }
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function handleCreateCareerProfile(req, res) {
  try {
    const payload = await readJson(req);
    let resumeText = normalizeText(payload.resumeText);
    const file = normalizeFile(payload.file);

    if (!resumeText && file) {
      resumeText = await extractTextFromFile(file);
    }

    if (!resumeText && !file) {
      sendJson(res, 400, { error: "请上传简历文件，或粘贴简历文本。" });
      return;
    }

    if (!resumeText) {
      sendJson(res, 400, { error: "没有从简历文件中提取到可分析文本，请换一个文件或粘贴正文。" });
      return;
    }

    if (!DEEPSEEK_API_KEY) {
      sendJson(res, 500, {
        error: "DEEPSEEK_API_KEY is not configured on the local server. This product requires DeepSeek AI analysis.",
        code: "missing_api_key",
      });
      return;
    }

    try {
      const careerProfile = await createCareerProfile(payload, resumeText, file);
      sendJson(res, 200, {
        careerProfile,
        extractedResumeText: resumeText,
        meta: {
          mode: "ai",
          provider: "deepseek",
          model: DEEPSEEK_MODEL,
          baseUrl: DEEPSEEK_BASE_URL,
          analyzedAt: new Date().toISOString(),
          source: file ? "file" : "text",
          fileName: file?.name || null,
          extractedTextChars: resumeText.length,
          profileInputChars: Math.min(resumeText.length, MAX_PROFILE_RESUME_TEXT_CHARS),
          tokenBudget: {
            profileMaxTokens: PROFILE_MAX_TOKENS,
            overviewMaxTokens: OVERVIEW_MAX_TOKENS,
            moduleMaxTokens: MODULE_MAX_TOKENS,
            chatMaxTokens: CHAT_MAX_TOKENS,
          },
        },
      });
    } catch (error) {
      sendJson(res, 502, {
        error: error.message,
        code: "profile_analysis_failed",
        provider: "deepseek",
        model: DEEPSEEK_MODEL,
        baseUrl: DEEPSEEK_BASE_URL,
      });
    }
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function handleCreateOverview(req, res) {
  try {
    const payload = await readJson(req);

    if (!payload.careerProfile || typeof payload.careerProfile !== "object") {
      sendJson(res, 400, { error: "请先完成职业画像生成。" });
      return;
    }

    if (!DEEPSEEK_API_KEY) {
      sendJson(res, 500, {
        error: "DEEPSEEK_API_KEY is not configured on the local server. This product requires DeepSeek AI analysis.",
        code: "missing_api_key",
      });
      return;
    }

    try {
      const report = await createOverviewReport(payload.careerProfile);
      report.meta = {
        ...(report.meta || {}),
        mode: "ai",
        provider: "deepseek",
        model: DEEPSEEK_MODEL,
        baseUrl: DEEPSEEK_BASE_URL,
        analyzedAt: new Date().toISOString(),
        tokenBudget: {
          profileMaxTokens: PROFILE_MAX_TOKENS,
          overviewMaxTokens: OVERVIEW_MAX_TOKENS,
          moduleMaxTokens: MODULE_MAX_TOKENS,
          chatMaxTokens: CHAT_MAX_TOKENS,
        },
      };
      report.careerProfile = payload.careerProfile;
      report.extractedResumeText = normalizeText(payload.extractedResumeText);
      sendJson(res, 200, report);
    } catch (error) {
      sendJson(res, 422, {
        error: "首页总览没有达到稳定输出标准。你的职业画像已保留，可以直接进入深度页面继续分析。",
        code: "overview_quality_failed",
        provider: "deepseek",
        model: DEEPSEEK_MODEL,
        baseUrl: DEEPSEEK_BASE_URL,
        partial: {
          careerProfile: payload.careerProfile,
          extractedResumeText: normalizeText(payload.extractedResumeText),
          analyzedAt: new Date().toISOString(),
        },
      });
    }
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function handleExtractResumeText(req, res) {
  try {
    const payload = await readJson(req);
    const file = normalizeFile(payload.file);

    if (!file) {
      sendJson(res, 400, { error: "请上传 TXT、MD、PDF 或 DOCX 简历文件。" });
      return;
    }

    const text = await extractTextFromFile(file);
    if (!text) {
      sendJson(res, 400, { error: "没有从文件中提取到可分析文本，请换一个文件或粘贴正文。" });
      return;
    }

    sendJson(res, 200, {
      text,
      meta: {
        source: "file",
        fileName: file.name,
        fileType: file.type,
        fileSizeBytes: file.sizeBytes,
        extractedTextChars: text.length,
        maxResumeTextChars: MAX_RESUME_TEXT_CHARS,
      },
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function handleModuleAnalysis(req, res, moduleType) {
  try {
    const payload = await readJson(req);

    if (!payload.careerProfile || typeof payload.careerProfile !== "object") {
      sendJson(res, 400, { error: "请先完成总览分析，生成 career_profile。" });
      return;
    }

    if (!DEEPSEEK_API_KEY) {
      sendJson(res, 500, {
        error: "DEEPSEEK_API_KEY is not configured on the local server. This product requires DeepSeek AI analysis.",
        code: "missing_api_key",
      });
      return;
    }

    try {
      const report = await createModuleReport(moduleType, payload.careerProfile, payload.moduleInput || {});
      report.meta = {
        mode: "ai",
        module: moduleType,
        provider: "deepseek",
        model: DEEPSEEK_MODEL,
        baseUrl: DEEPSEEK_BASE_URL,
        analyzedAt: new Date().toISOString(),
        tokenBudget: {
          moduleMaxTokens: MODULE_MAX_TOKENS,
          profileMaxChars: MAX_PROFILE_JSON_CHARS,
          moduleInputMaxChars: MAX_MODULE_INPUT_CHARS,
        },
      };
      sendJson(res, 200, report);
    } catch (error) {
      sendJson(res, 502, {
        error: error.message,
        code: `${moduleType}_analysis_failed`,
        provider: "deepseek",
        model: DEEPSEEK_MODEL,
        baseUrl: DEEPSEEK_BASE_URL,
      });
    }
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function handleResumeChat(req, res) {
  try {
    const payload = await readJson(req);
    const question = normalizeText(payload.question, 1200);

    if (!payload.careerProfile || typeof payload.careerProfile !== "object") {
      sendJson(res, 400, { error: "请先完成总览分析，生成 career_profile。" });
      return;
    }

    if (!payload.report || typeof payload.report !== "object") {
      sendJson(res, 400, { error: "请先完成前置简历分析，再追问。" });
      return;
    }

    if (!question) {
      sendJson(res, 400, { error: "请输入追问问题。" });
      return;
    }

    if (!DEEPSEEK_API_KEY) {
      sendJson(res, 500, {
        error: "DEEPSEEK_API_KEY is not configured on the local server. This product requires DeepSeek AI analysis.",
        code: "missing_api_key",
      });
      return;
    }

    try {
      await streamDeepSeekChat(payload, res);
    } catch (error) {
      if (!res.headersSent) {
        sendJson(res, 502, {
          error: error.message,
          code: "ai_chat_failed",
          provider: "deepseek",
          model: DEEPSEEK_MODEL,
          baseUrl: DEEPSEEK_BASE_URL,
        });
        return;
      }
      res.write(`\n\n追问失败：${error.message}`);
      res.end();
    }
  } catch (error) {
    if (!res.headersSent) sendJson(res, 500, { error: error.message });
  }
}

async function handleTestAi(req, res) {
  if (!DEEPSEEK_API_KEY) {
    sendJson(res, 500, { error: "DEEPSEEK_API_KEY is not configured on the local server." });
    return;
  }

  try {
    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        temperature: 0,
        max_tokens: 80,
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
        messages: [
          { role: "system", content: "只返回严格 JSON。" },
          { role: "user", content: "返回 {\"ok\":true,\"message\":\"connected\"}" },
        ],
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorText = await response.text();
      sendJson(res, response.status, { error: errorText.slice(0, 800) });
      return;
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "{}";
    sendJson(res, 200, {
      ok: true,
      provider: "deepseek",
      model: DEEPSEEK_MODEL,
      baseUrl: DEEPSEEK_BASE_URL,
      response: JSON.parse(extractJsonText(text)),
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.resolve(PUBLIC_DIR, `.${requestedPath}`);

  if (filePath !== PUBLIC_DIR && !filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const ext = path.extname(filePath);
  const baseName = path.basename(filePath);
  const blockedFiles = new Set([".env", "server.js", "package.json", "package-lock.json"]);
  if (
    blockedFiles.has(baseName)
    || baseName.startsWith(".")
    || filePath.includes(`${path.sep}node_modules${path.sep}`)
    || !Object.prototype.hasOwnProperty.call(mimeTypes, ext)
  ) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      app: "Resume Partner",
      provider: "deepseek",
      hasDeepSeekKey: Boolean(DEEPSEEK_API_KEY),
      envFileLoaded,
      model: DEEPSEEK_MODEL,
	      baseUrl: DEEPSEEK_BASE_URL,
	      timeoutMs: AI_TIMEOUT_MS,
	      overviewTimeoutMs: OVERVIEW_TIMEOUT_MS,
	      overviewRepairTimeoutMs: OVERVIEW_REPAIR_TIMEOUT_MS,
	      profileMaxTokens: PROFILE_MAX_TOKENS,
	      overviewMaxTokens: OVERVIEW_MAX_TOKENS,
	      moduleMaxTokens: MODULE_MAX_TOKENS,
	      chatMaxTokens: CHAT_MAX_TOKENS,
	      profileInputMaxChars: MAX_PROFILE_RESUME_TEXT_CHARS,
	      maxFileMB: Math.round(MAX_FILE_BYTES / 1_000_000),
	    });
    return;
  }

  if (req.method === "GET" && req.url === "/api/test-ai") {
    handleTestAi(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/extract-resume-text") {
    handleExtractResumeText(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/create-career-profile") {
    handleCreateCareerProfile(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/create-overview") {
    handleCreateOverview(req, res);
    return;
  }

	  if (req.method === "POST" && req.url === "/api/analyze-resume") {
	    handleAnalyzeResume(req, res);
	    return;
	  }

	  if (req.method === "POST" && req.url === "/api/analyze-career") {
	    handleModuleAnalysis(req, res, "career");
	    return;
	  }

	  if (req.method === "POST" && req.url === "/api/analyze-study") {
	    handleModuleAnalysis(req, res, "study");
	    return;
	  }

	  if (req.method === "POST" && req.url === "/api/analyze-ability") {
	    handleModuleAnalysis(req, res, "ability");
	    return;
	  }

  if (req.method === "POST" && req.url === "/api/chat-resume") {
    handleResumeChat(req, res);
    return;
  }

  if (req.method === "GET") {
    serveStatic(req, res);
    return;
  }

  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(PORT, () => {
  console.log(`Resume Partner running at http://localhost:${PORT}`);
  console.log(DEEPSEEK_API_KEY ? "DEEPSEEK_API_KEY loaded on the server." : "DEEPSEEK_API_KEY is not set; AI endpoints will fail.");
  console.log(`Model: ${DEEPSEEK_MODEL}`);
  console.log(`API: ${DEEPSEEK_BASE_URL}/chat/completions`);
});
