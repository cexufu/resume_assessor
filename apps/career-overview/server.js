const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mammoth = require("mammoth");
const pdfParseModule = require("pdf-parse");

const PUBLIC_DIR = __dirname;
const ENV_FILE = path.join(PUBLIC_DIR, ".env");
const DATA_DIR = path.resolve(process.env.AUTH_STORE_DIR || path.resolve(PUBLIC_DIR, "..", ".resume-partner-data"));
const AUTH_STORE_FILE = path.join(DATA_DIR, "auth-store.json");
const CAREER_LIBRARY_FILE = path.join(PUBLIC_DIR, "data", "career_library.json");

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
const OVERVIEW_DIAGNOSIS_TIMEOUT_MS = Number(process.env.OVERVIEW_DIAGNOSIS_TIMEOUT_MS || 14000);
const OVERVIEW_PATH_TIMEOUT_MS = Number(process.env.OVERVIEW_PATH_TIMEOUT_MS || 14000);
const DIRECTION_HYPOTHESIS_TIMEOUT_MS = Number(process.env.DIRECTION_HYPOTHESIS_TIMEOUT_MS || 28000);
const OVERVIEW_DIAGNOSIS_REPAIR_TIMEOUT_MS = Number(process.env.OVERVIEW_DIAGNOSIS_REPAIR_TIMEOUT_MS || 5000);
const OVERVIEW_PATH_REPAIR_TIMEOUT_MS = Number(process.env.OVERVIEW_PATH_REPAIR_TIMEOUT_MS || 5000);
const DIRECTION_HYPOTHESIS_REPAIR_TIMEOUT_MS = Number(process.env.DIRECTION_HYPOTHESIS_REPAIR_TIMEOUT_MS || 7000);
const OVERVIEW_DIAGNOSIS_MAX_TOKENS = Number(process.env.OVERVIEW_DIAGNOSIS_MAX_TOKENS || 760);
const OVERVIEW_PATH_MAX_TOKENS = Number(process.env.OVERVIEW_PATH_MAX_TOKENS || 860);
const DIRECTION_HYPOTHESIS_MAX_TOKENS = Number(process.env.DIRECTION_HYPOTHESIS_MAX_TOKENS || 1600);
const PROFILE_MAX_TOKENS = Number(process.env.PROFILE_MAX_TOKENS || 1100);
const OVERVIEW_MAX_TOKENS = Number(process.env.OVERVIEW_MAX_TOKENS || 1300);
const MODULE_MAX_TOKENS = Number(process.env.MODULE_MAX_TOKENS || 1900);
const CHAT_MAX_TOKENS = Number(process.env.CHAT_MAX_TOKENS || 420);
const APPLICATION_MAX_TOKENS = Number(process.env.APPLICATION_MAX_TOKENS || 1100);
const QA_MAX_TOKENS = Number(process.env.QA_MAX_TOKENS || 720);
const JSON_REPAIR_MAX_TOKENS = Number(process.env.JSON_REPAIR_MAX_TOKENS || 1200);
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 12_000_000);
const MAX_RESUME_TEXT_CHARS = Number(process.env.MAX_RESUME_TEXT_CHARS || 12_000);
const MAX_PROFILE_RESUME_TEXT_CHARS = Number(process.env.MAX_PROFILE_RESUME_TEXT_CHARS || 8_000);
const MAX_HYPOTHESIS_RESUME_TEXT_CHARS = Number(process.env.MAX_HYPOTHESIS_RESUME_TEXT_CHARS || MAX_RESUME_TEXT_CHARS);
const MAX_PROFILE_JSON_CHARS = Number(process.env.MAX_PROFILE_JSON_CHARS || 3_500);
const MAX_MODULE_INPUT_CHARS = Number(process.env.MAX_MODULE_INPUT_CHARS || 1_000);
const MAX_FILE_BYTES = Number(process.env.MAX_FILE_BYTES || 6_000_000);
const SESSION_COOKIE_NAME = "resume_partner_session";
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 30 * 24 * 60 * 60 * 1000);
const HISTORY_LIMIT_PER_USER = Number(process.env.HISTORY_LIMIT_PER_USER || 20);
const PASSWORD_MIN_LENGTH = Number(process.env.PASSWORD_MIN_LENGTH || 8);
const COOKIE_SECURE = String(process.env.COOKIE_SECURE || "").trim() === "true";
const DEEPSEEK_THINKING_TYPE = String(process.env.DEEPSEEK_THINKING_TYPE || "enabled").trim() === "disabled"
  ? "disabled"
  : "enabled";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
};

let authStoreCache = null;
let careerLibraryCache = null;

function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function defaultAuthStore() {
  return {
    version: 1,
    users: [],
    sessions: [],
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildThinkingConfig(mode = DEEPSEEK_THINKING_TYPE) {
  return { type: mode === "disabled" ? "disabled" : "enabled" };
}

function loadAuthStore() {
  if (authStoreCache) return authStoreCache;
  ensureDirSync(DATA_DIR);
  if (!fs.existsSync(AUTH_STORE_FILE)) {
    authStoreCache = defaultAuthStore();
    return authStoreCache;
  }
  try {
    const raw = fs.readFileSync(AUTH_STORE_FILE, "utf8");
    const parsed = raw.trim() ? JSON.parse(raw) : defaultAuthStore();
    authStoreCache = {
      version: 1,
      users: Array.isArray(parsed.users) ? parsed.users : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    };
  } catch {
    authStoreCache = defaultAuthStore();
  }
  return authStoreCache;
}

function defaultCareerLibrary() {
  return {
    version: 2,
    rankingOrder: ["frontierScore", "salaryScore", "degreeScore", "scarcityScore"],
    meta: {},
    careerRoutes: [],
    studyDirections: [],
    possibilityPatterns: [],
    abilityAxes: [],
  };
}

function loadCareerLibrary() {
  if (careerLibraryCache) return careerLibraryCache;
  if (!fs.existsSync(CAREER_LIBRARY_FILE)) {
    careerLibraryCache = defaultCareerLibrary();
    return careerLibraryCache;
  }
  try {
    const raw = fs.readFileSync(CAREER_LIBRARY_FILE, "utf8");
    const parsed = raw.trim() ? JSON.parse(raw) : defaultCareerLibrary();
    careerLibraryCache = {
      version: Number(parsed.version) || 2,
      rankingOrder: Array.isArray(parsed.rankingOrder) ? parsed.rankingOrder : ["frontierScore", "salaryScore", "degreeScore", "scarcityScore"],
      meta: parsed.meta && typeof parsed.meta === "object" ? parsed.meta : {},
      careerRoutes: Array.isArray(parsed.careerRoutes) ? parsed.careerRoutes : [],
      studyDirections: Array.isArray(parsed.studyDirections) ? parsed.studyDirections : [],
      possibilityPatterns: Array.isArray(parsed.possibilityPatterns) ? parsed.possibilityPatterns : [],
      abilityAxes: Array.isArray(parsed.abilityAxes) ? parsed.abilityAxes : [],
    };
  } catch {
    careerLibraryCache = defaultCareerLibrary();
  }
  return careerLibraryCache;
}

function saveAuthStore(store) {
  ensureDirSync(DATA_DIR);
  const safeStore = {
    version: 1,
    users: Array.isArray(store?.users) ? store.users : [],
    sessions: Array.isArray(store?.sessions) ? store.sessions : [],
  };
  const tempFile = `${AUTH_STORE_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(safeStore, null, 2), "utf8");
  fs.renameSync(tempFile, AUTH_STORE_FILE);
  authStoreCache = safeStore;
  return safeStore;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function generateId(size = 18) {
  return crypto.randomBytes(size).toString("hex");
}

function hashPassword(password, salt = generateId(16)) {
  const derived = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
  return { salt, hash: derived };
}

function verifyPassword(password, salt, expectedHash) {
  const actualHash = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
  const actual = Buffer.from(actualHash, "hex");
  const expected = Buffer.from(String(expectedHash || ""), "hex");
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function validateEmailAndPassword(email, password) {
  const normalizedEmail = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error("请输入有效的邮箱地址。");
  }
  const plainPassword = String(password || "");
  if (plainPassword.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`密码至少需要 ${PASSWORD_MIN_LENGTH} 位。`);
  }
  return { normalizedEmail, plainPassword };
}

function normalizeProfileList(value, limit = 12) {
  const source = Array.isArray(value) ? value : String(value || "").split(new RegExp("[,，、\\n]"));
  const result = [];
  for (const item of source) {
    const text = normalizeText(item, 60);
    if (text && !result.includes(text)) result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function defaultLongTermProfile() {
  return {
    currentGoal: "",
    preferredDirections: [],
    rejectedDirections: [],
    notes: "",
    latestIdentity: "",
    latestDestination: "",
    latestStage: "",
    lastAnalysisId: "",
    updatedAt: "",
  };
}

function normalizeLongTermProfile(profile = {}) {
  const fallback = defaultLongTermProfile();
  return {
    ...fallback,
    currentGoal: normalizeText(profile.currentGoal, 160),
    preferredDirections: normalizeProfileList(profile.preferredDirections, 16),
    rejectedDirections: normalizeProfileList(profile.rejectedDirections, 16),
    notes: normalizeText(profile.notes, 1200),
    latestIdentity: normalizeText(profile.latestIdentity, 160),
    latestDestination: normalizeText(profile.latestDestination, 160),
    latestStage: normalizeText(profile.latestStage, 160),
    lastAnalysisId: normalizeText(profile.lastAnalysisId, 40),
    updatedAt: normalizeText(profile.updatedAt, 40),
  };
}

function publicLongTermProfile(user) {
  return normalizeLongTermProfile(user?.longTermProfile || {});
}

function updateLongTermProfileFromAnalysis(user, entry, report, careerProfile) {
  if (!user || !entry) return null;
  const current = normalizeLongTermProfile(user.longTermProfile || {});
  const basic = careerProfile?.basic || {};
  const directions = Array.isArray(report?.suitableDirections) ? report.suitableDirections : [];
  const possibilities = Array.isArray(report?.newPossibilities) ? report.newPossibilities : [];
  const preferredDirections = normalizeProfileList([
    ...current.preferredDirections,
    basic.targetDirection,
    ...directions.map((item) => item?.title),
    ...possibilities.map((item) => item?.title),
  ], 16);
  user.longTermProfile = normalizeLongTermProfile({
    ...current,
    currentGoal: current.currentGoal || basic.targetGoal || basic.targetDirection || "",
    preferredDirections,
    latestIdentity: report?.identitySnapshot?.who || current.latestIdentity,
    latestDestination: report?.identitySnapshot?.destination || current.latestDestination,
    latestStage: report?.identitySnapshot?.stage || current.latestStage,
    lastAnalysisId: entry.id,
    updatedAt: new Date().toISOString(),
  });
  return user.longTermProfile;
}

function safeUser(user) {
  const history = Array.isArray(user?.history) ? user.history : [];
  return {
    id: user?.id || "",
    email: user?.email || "",
    createdAt: user?.createdAt || "",
    lastLoginAt: user?.lastLoginAt || "",
    historyCount: history.length,
  };
}

function parseCookies(req) {
  const cookieHeader = String(req.headers.cookie || "");
  const pairs = cookieHeader.split(/;\s*/).filter(Boolean);
  const cookies = {};
  for (const pair of pairs) {
    const index = pair.indexOf("=");
    if (index < 0) continue;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  parts.push(`Path=${options.path || "/"}`);
  parts.push(`SameSite=${options.sameSite || "Lax"}`);
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

function sessionCookie(value, maxAgeMs = SESSION_TTL_MS) {
  return serializeCookie(SESSION_COOKIE_NAME, value, {
    maxAge: Math.floor(maxAgeMs / 1000),
    secure: COOKIE_SECURE,
  });
}

function clearSessionCookie() {
  return serializeCookie(SESSION_COOKIE_NAME, "", {
    maxAge: 0,
    secure: COOKIE_SECURE,
  });
}

function pruneExpiredSessions(store) {
  const now = Date.now();
  store.sessions = (Array.isArray(store.sessions) ? store.sessions : []).filter((session) => {
    const expiresAt = Date.parse(session?.expiresAt || "");
    return Number.isFinite(expiresAt) && expiresAt > now;
  });
}

function createSession(store, userId) {
  pruneExpiredSessions(store);
  const now = new Date();
  const session = {
    id: generateId(24),
    userId,
    createdAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
  };
  store.sessions.push(session);
  return session;
}

function getAuthContext(req) {
  const cookies = parseCookies(req);
  const sessionId = cookies[SESSION_COOKIE_NAME];
  if (!sessionId) return { store: loadAuthStore(), session: null, user: null };
  const store = loadAuthStore();
  pruneExpiredSessions(store);
  const session = store.sessions.find((item) => item.id === sessionId) || null;
  if (!session) return { store, session: null, user: null };
  const user = store.users.find((item) => item.id === session.userId) || null;
  if (!user) return { store, session: null, user: null };
  return { store, session, user };
}

function requireAuth(req, res) {
  const context = getAuthContext(req);
  if (!context.user) {
    sendJson(res, 401, { error: "请先登录账号。" });
    return null;
  }
  return context;
}

function buildAnalysisFingerprint(report, careerProfile, extractedResumeText = "") {
  return crypto.createHash("sha256")
    .update(JSON.stringify({
      report: report || {},
      careerProfile: careerProfile || {},
      extractedResumeText: normalizeText(extractedResumeText, 4000),
    }))
    .digest("hex");
}

function buildAnalysisTitle(report, careerProfile) {
  const snapshot = report?.identitySnapshot || {};
  const basic = careerProfile?.basic || {};
  return normalizeText(
    snapshot.destination
      || basic.targetDirection
      || basic.targetGoal
      || report?.suitableDirections?.[0]?.title
      || "职业发展分析",
    60
  );
}

function buildHistorySummary(entry) {
  return {
    id: entry.id,
    title: entry.title,
    createdAt: entry.createdAt,
    targetGoal: entry.targetGoal || "",
    targetDirection: entry.targetDirection || "",
    identityWho: entry.identityWho || "",
    identityDestination: entry.identityDestination || "",
    score: entry.score ?? null,
  };
}

function saveAnalysisToUserHistory(user, report, careerProfile, extractedResumeText = "") {
  if (!user || !report || !careerProfile) return null;
  const history = Array.isArray(user.history) ? user.history : [];
  const fingerprint = buildAnalysisFingerprint(report, careerProfile, extractedResumeText);
  const existing = history.find((item) => item.fingerprint === fingerprint);
  if (existing) return existing;

  const entry = {
    id: generateId(12),
    fingerprint,
    createdAt: new Date().toISOString(),
    title: buildAnalysisTitle(report, careerProfile),
    targetGoal: normalizeText(careerProfile?.basic?.targetGoal, 40),
    targetDirection: normalizeText(careerProfile?.basic?.targetDirection, 60),
    identityWho: normalizeText(report?.identitySnapshot?.who, 80),
    identityDestination: normalizeText(report?.identitySnapshot?.destination, 80),
    score: Number.isFinite(Number(report?.peerScore?.score)) ? Math.max(0, Math.min(10, Number(report.peerScore.score))) : null,
    report: cloneJson(report),
    careerProfile: cloneJson(careerProfile),
    extractedResumeText: normalizeText(extractedResumeText, MAX_RESUME_TEXT_CHARS),
  };

  user.history = [entry, ...history].slice(0, HISTORY_LIMIT_PER_USER);
  return entry;
}

function trySaveHistoryForRequest(req, report, careerProfile, extractedResumeText = "") {
  const context = getAuthContext(req);
  if (!context.user) return null;
  try {
    const entry = saveAnalysisToUserHistory(context.user, report, careerProfile, extractedResumeText);
    context.user.lastSeenAt = new Date().toISOString();
    if (entry) saveAuthStore(context.store);
    return { entry, error: null };
  } catch (error) {
    return {
      entry: null,
      error: error instanceof Error ? error.message : String(error || "保存历史记录失败。"),
    };
  }
}

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
  "要看视野。比如做一个项目不只是完成任务，而可能是在证明判断、服务整体目标、逐步建立方法论。",
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
  "JSON 顶层字段必须为：identitySnapshot, comfortIntro, capabilityDiagnosis, peerScore, abilityFields, perspectiveUpgrade, routeCards, suitableDirections, newPossibilities, shortcomings, improvementAdvice, closingEncouragement, moduleRecommendations。",
  "必须按分层结构输出。不要因为某个子字段证据不足就省略整块；能判断的字段先输出，不能判断的字段写清楚缺少哪类信息，不要只写“信息不足”。",
  "identitySnapshot：字段 who, destination, stage。分别回答“你是谁”“你想去哪”“你到哪一步了”，每项不超过 70 个中文字符。",
  "capabilityDiagnosis：字段 coreAbility, evidence, expressionGap, nextProof。必须像产品诊断，不要像简历摘要；coreAbility 要命名为独特能力标签，例如“结构化问题拆解能力”“跨场景证据转译能力”；evidence 必须引用 career_profile 的具体项目或事实；expressionGap 必须指出为什么招聘方看不懂；nextProof 必须是一个可执行补证动作。",
  "peerScore：字段 score, explanation。score 为 0-10；这是职业评分，不是同龄排名。必须给出谨慎估分；explanation 以肯定、看见优势和鼓励为主，最后轻轻补一句还需要哪类证据来校准。",
  "abilityFields：3 项，每项字段 name, currentEvidence, usableScenes。证据不足时 currentEvidence 写具体缺口，usableScenes 写可验证场景。",
  "perspectiveUpgrade：字段 currentLayer, nextLayer, example。说明用户目前更像执行/战术/战略哪一层，以及如何往上一层看问题；缺例子时写需要补充哪类经历才能判断。",
  "routeCards：4 项，每项字段 label, title, why, risk, nextStep。label 固定为：最高薪路线、最快上岸路线、最轻松路线、均衡路线。title 必须是具体岗位/路径，不允许写“高薪潜力方向”“最快可尝试方向”“低阻力过渡方向”“平衡成长方向”这类占位词。",
  "routeCards 每项都必须基于 career_profile 的证据，why/risk/nextStep 必须具体到岗位场景、证据缺口或 7 天动作。",
  "suitableDirections：3 项，每项字段 title, explanation。title 必须是具体岗位方向或职业场景；3 条 explanation 必须分别说明不同岗位的适配原因、使用能力和下一步验证动作，不允许套同一句模板只改序号。",
  "newPossibilities：1-2 项，每项字段 title, reason, firstTry。用于让用户看到原路径之外的可能性；必须基于证据或明确写出验证前提。",
  "shortcomings：字段 summary, items。items 最多 3 条；每条必须是具体短板或具体缺失信息。",
  "improvementAdvice：字段 mostNeededAbility, missingExperience, shortAdvice；必须给出下一步补齐建议，不能空泛。",
  "comfortIntro：开篇安慰总起，1-2 句，必须具体、不空泛。",
  "closingEncouragement：结尾安慰，1 句，强调可以从最小行动开始。",
  "moduleRecommendations：3 项，每项字段 module, reason, suggestedQuestion。module 只能是 career, study, ability。",
  "所有文本字段尽量不超过 80 个中文字符。",
].join("\n");

const compactOverviewJsonContract = [
  "JSON 顶层字段必须为：identitySnapshot, comfortIntro, capabilityDiagnosis, peerScore, abilityFields, perspectiveUpgrade, routeCards, suitableDirections, newPossibilities, shortcomings, improvementAdvice, closingEncouragement, moduleRecommendations。",
  "这是短版总览，但结构必须完整。每个文本字段不超过 45 个中文字符。",
  "identitySnapshot 字段：who, destination, stage。",
  "capabilityDiagnosis 字段：coreAbility, evidence, expressionGap, nextProof。必须具体引用 career_profile 证据。",
  "peerScore 字段：score, explanation。score 必须为 1-10 的数字；这是职业评分，不是同龄排名。explanation 以夸奖和肯定为主，最后轻轻说明还缺哪类证据。",
  "abilityFields 必须 3 项，每项字段：name, currentEvidence, usableScenes。",
  "perspectiveUpgrade 字段：currentLayer, nextLayer, example。",
  "routeCards 必须 4 项，每项字段：label, title, why, risk, nextStep。label 固定为：最高薪路线、最快上岸路线、最轻松路线、均衡路线。title 必须是具体岗位/路径，不允许写泛泛占位词；不能判断时在 why/risk/nextStep 写清具体缺口。",
  "suitableDirections 必须 3 项，每项字段：title, explanation。3 条 explanation 必须彼此不同，不能只改序号。",
  "newPossibilities 必须 1-2 项，每项字段：title, reason, firstTry。",
  "shortcomings 字段：summary, items。items 2-3 条。",
  "improvementAdvice 字段：mostNeededAbility, missingExperience, shortAdvice。",
  "comfortIntro 和 closingEncouragement 各 1 句。",
  "moduleRecommendations 必须 3 项，每项字段：module, reason, suggestedQuestion。module 只能是 career, study, ability。",
  "只返回合法 JSON。",
].join("\n");

const overviewDiagnosisSystemPrompt = [
  "你是职业总览的诊断层分析器。",
  "你只负责把 career_profile 压缩成简洁、个性化的诊断，不输出职业路线。",
  "语气要专业、克制、具体，不做空泛鼓励。",
  careerJudgmentPrinciples,
  jsonOnlyContract,
].join("\n");

const overviewDiagnosisJsonContract = [
  "JSON 顶层字段必须为：identitySnapshot, comfortIntro, capabilityDiagnosis, peerScore, abilityFields, perspectiveUpgrade, shortcomings, improvementAdvice, closingEncouragement, followUpQuestions。",
  "不要输出 routeCards、suitableDirections、newPossibilities、moduleRecommendations。",
  "identitySnapshot：字段 who, destination, stage。每项不超过 60 个中文字符。",
  "capabilityDiagnosis：字段 coreAbility, evidence, expressionGap, nextProof。必须引用 career_profile 的具体项目或事实。",
  "peerScore：字段 score, explanation。score 为 0-10；说明为什么是这个分数。",
  "abilityFields：3 项，每项字段 name, currentEvidence, usableScenes。每项要和简历证据对应。",
  "perspectiveUpgrade：字段 currentLayer, nextLayer, example。要说明当前更偏执行/战术/战略哪一层。",
  "shortcomings：字段 summary, items。items 最多 3 条。",
  "improvementAdvice：字段 mostNeededAbility, missingExperience, shortAdvice。",
  "comfortIntro：1-2 句。",
  "closingEncouragement：1 句。",
  "followUpQuestions：2-3 条，短句。",
  "所有文本尽量简短，不要重复。",
].join("\n");

const compactOverviewDiagnosisJsonContract = [
  "JSON 顶层字段必须为：identitySnapshot, comfortIntro, capabilityDiagnosis, peerScore, abilityFields, perspectiveUpgrade, shortcomings, improvementAdvice, closingEncouragement, followUpQuestions。",
  "短版诊断层，但结构必须完整。",
  "每个文本字段不超过 45 个中文字符。",
  "不要输出路线或可能性类字段。",
].join("\n");

const CAREER_ROUTE_LABELS = ["最高薪路线", "最快上岸路线", "最轻松路线", "均衡路线"];
const STUDY_ROUTE_LABELS = ["最匹配背景线", "最稳妥申请线", "跨学科转向线", "长期潜力线"];
const studyGoalPattern = /(留学|升学|申请|硕士|master|phd|博士|专业|学校|项目|选校|读研|研究生|保研)/i;
const careerGoalPattern = /(找工作|找实习|转行|求职|岗位|就业|工作|入职|校招|社招|面试|投递)/i;

function inferGoalMode(careerProfile = {}) {
  const basic = careerProfile?.basic || {};
  const explicitGoal = String(basic.targetGoal || "");
  if (studyGoalPattern.test(explicitGoal)) return "study";
  if (careerGoalPattern.test(explicitGoal)) return "career";

  const combinedText = [
    basic.targetGoal,
    basic.targetDirection,
    basic.currentThought,
    ...(Array.isArray(careerProfile?.studySignals) ? careerProfile.studySignals : []),
    ...(Array.isArray(careerProfile?.careerSignals) ? careerProfile.careerSignals : []),
  ].filter(Boolean).join(" ");
  const hasStudy = studyGoalPattern.test(combinedText);
  const hasCareer = careerGoalPattern.test(combinedText);
  if (hasStudy && !hasCareer) return "study";
  return "career";
}

function getGoalModeCopy(goalMode = "career") {
  if (goalMode === "study") {
    return {
      modeLabel: "留学/升学申请",
      directionHeading: "适合申请方向",
      routeHeading: "四条申请路径比较",
      possibilityHeading: "你可能没想到的专业可能性",
      possibilityStepLabel: "可先了解",
      directionObject: "专业方向",
      directionPromptNoun: "专业方向或申请场景",
      routeObject: "专业/申请路径",
      supportNoun: "申请相关证据",
      supportGap: "课程、项目、动机或成绩证据",
      routeLabels: STUDY_ROUTE_LABELS,
      suitableQuestion: "请生成最适合用户申请的三个专业方向",
      routeQuestion: "请生成最值得比较的四条专业/申请路径",
      possibilityQuestion: "请生成两个用户可能没想到、但也适合申请的专业或交叉学科方向",
      routeTargetVerb: "申请",
      validationAction: "申请叙事与项目匹配",
      nextStepHint: "先补一条最能支撑申请动机的课程、项目或结果证据。",
    };
  }

  return {
    modeLabel: "职业/求职",
    directionHeading: "适合工作方向",
    routeHeading: "四条职业路径比较",
    possibilityHeading: "你可能没想到的岗位可能性",
    possibilityStepLabel: "可先验证",
    directionObject: "岗位方向",
    directionPromptNoun: "岗位方向或职业场景",
    routeObject: "职业路径",
    supportNoun: "岗位证据",
    supportGap: "代表项目、结果或岗位对位证据",
    routeLabels: CAREER_ROUTE_LABELS,
    suitableQuestion: "请生成最适合用户从事的三个岗位方向",
    routeQuestion: "请生成最值得比较的四条职业路径",
    possibilityQuestion: "请生成两个用户可能没想到、但也适合尝试的岗位方向或职业场景",
    routeTargetVerb: "对位",
    validationAction: "岗位匹配与进入路径",
    nextStepHint: "先补一条最能直接对位目标岗位的代表项目证据。",
  };
}

function buildDirectionSpaceReference(goalMode = "career") {
  if (goalMode === "study") {
    return [
      "下面是方向空间参考，用来帮助你扩大搜索范围、避免推荐过窄。它不是必须逐条覆盖的清单，也不是固定答案库。",
      "你的第一原则仍然是：先基于用户的原始简历、目标和经历证据，自由判断最贴合的具体专业方向；然后再参考这个方向空间，对答案做细化命名、补充比较和去重。",
      "如果用户适合更细的具体方向，请优先输出细分方向，而不是停留在泛泛大类。例如不要只写“传媒”，要尽量细到“社交媒体传播 / 整合营销传播 / 企业传播 / 舆论传播 / 公共关系”；不要只写“商科”，要尽量细到“市场营销 / 商业分析 / 应用经济学 / 品牌管理 / 组织行为”。",
      "学科方向空间包括但不限于：商科、计算机科学、数学、物理、化学、生物、医学、药学、工程学、传媒、国际关系、法学、信息学、历史学、文学、哲学、语言学、材料学、环境学、人工智能学、金融学、经济学、管理学、运动科学、政治学、公共管理学、人力资源管理学、社会学、农村农业发展、土木、建筑、航天航空、网络安全等，并可继续细分到机械工程、社交媒体、民商法、应用经济学等具体方向。",
      "当多个方向都成立时，再用以下顺序比较优先级：职业先进性 > 薪资均值 > 学历均值 > 能力稀缺性。但无论如何，排序不能压过与用户简历证据的真实贴合度。",
    ].join("\n");
  }

  return [
    "下面是方向空间参考，用来帮助你扩大搜索范围、避免推荐过窄。它不是必须逐条覆盖的清单，也不是固定答案库。",
    "你的第一原则仍然是：先基于用户的原始简历、目标和经历证据，自由判断最贴合的具体岗位方向；然后再参考这个方向空间，对答案做细化命名、补充比较和去重。",
    "如果用户适合更细的具体方向，请优先输出细分岗位，而不是停留在泛泛大类。例如不要只写“互联网”，要尽量细到“算法工程师 / 架构师 / 前端工程师 / 后端工程师 / AI 产品经理”；不要只写“传播”，要尽量细到“社交媒体传播 / 整合营销传播 / 企业传播 / 公共关系 / 品牌传播”。",
    "职业方向空间包括但不限于：互联网、人工智能、金融、投资、咨询、品牌管理、公共关系、食品、快消、汽车、政府单位、国际组织、环保、公益、猎头、产业分析、律所、会计师事务所、机器人、通信、建筑设计、房地产、低空经济、航天航空、网络安全等，并可继续细分到算法工程师、架构师、前端工程师、后端工程师、活动策划、产品运营、品牌宣传、战略咨询、科技咨询、数字化转型咨询等具体岗位。",
    "当多个方向都成立时，再用以下顺序比较优先级：职业先进性 > 薪资均值 > 学历均值 > 能力稀缺性。但无论如何，排序不能压过与用户简历证据的真实贴合度。",
  ].join("\n");
}

function buildOverviewPathSystemPrompt(goalMode = "career") {
  const copy = getGoalModeCopy(goalMode);
  return [
    "你是首页总览里的路径层分析器。",
    "你只负责适合方向、路径比较和新可能性，不输出诊断层。",
    `当前用户目标是：${copy.modeLabel}。你必须围绕这个目标回答，不能把${copy.directionObject}写成别的类型。`,
    "先基于 career_profile 的证据做判断，再把库候选项当作命名、去重和边界参考。",
    "不要直接照抄库候选项的说明句，必须改写成针对这个人的判断。",
    buildDirectionSpaceReference(goalMode),
    careerJudgmentPrinciples,
    jsonOnlyContract,
  ].join("\n");
}

function buildOverviewPathJsonContract(goalMode = "career") {
  const copy = getGoalModeCopy(goalMode);
  return [
    "JSON 顶层字段必须为：routeCards, suitableDirections, newPossibilities。",
    "不要输出 identitySnapshot、capabilityDiagnosis、peerScore、abilityFields、perspectiveUpgrade、shortcomings、improvementAdvice、closingEncouragement、moduleRecommendations。",
    `suitableDirections：至少 2 项，最多 3 项。每项字段：title, verdict, whatItIs, whyYou, futureValue。title 必须是具体${copy.directionPromptNoun}，不能只写泛大类。`,
    `routeCards：至少 2 项，最多 4 项。每项字段：label, title, verdict, whatItIs, whyYou, futureValue。label 优先使用：${copy.routeLabels.join("、")}。title 必须是具体${copy.routeObject}。`,
    `newPossibilities：至少 2 项，最多 3 项。每项字段：title, verdict, whatItIs, whyYou, futureValue。title 必须是另一个具体${copy.directionPromptNoun}，而不是“补证据”“改简历”这种动作项。`,
    "verdict 只能是 1-3 个字的判断词，例如：对口、可转、潜力、高薪、稳妥、跨界。",
    "whatItIs 用一句话解释这个方向主要做什么或研究什么。",
    "whyYou 用一句话解释为什么用户现有能力和经历能支撑它。",
    "futureValue 用一句话解释它为什么值得考虑，例如 AI 契合度、行业机会、薪资上限、出口清晰度或长期成长性。",
    "全都要短，不要写风险、下一步、套话，不要重复同义句。",
  ].join("\n");
}

function buildCompactOverviewPathJsonContract(goalMode = "career") {
  const copy = getGoalModeCopy(goalMode);
  return [
    "JSON 顶层字段必须为：routeCards, suitableDirections, newPossibilities。",
    "短版路径层，但结构必须完整。",
    `suitableDirections 至少 2 项，最多 3 项，字段必须是 title, verdict, whatItIs, whyYou, futureValue，title 不能是泛大类。`,
    `routeCards 至少 2 项，最多 4 项，字段必须是 label, title, verdict, whatItIs, whyYou, futureValue。`,
    `newPossibilities 至少 2 项，最多 3 项，字段必须是 title, verdict, whatItIs, whyYou, futureValue，必须是方向，不是动作建议。`,
  ].join("\n");
}

function getGoalLibraryItems(goalMode = "career", library = loadCareerLibrary()) {
  return goalMode === "study" ? library.studyDirections : library.careerRoutes;
}

function rankGoalLibraryItems(careerProfile, goalMode = "career", limit = 6) {
  return rankLibraryItems(getGoalLibraryItems(goalMode), profileTexts(careerProfile), Math.max(limit * 4, limit))
    .filter((item) => passesRoleGate(item?.title || item?.name, careerProfile))
    .slice(0, limit);
}

function hypothesisTexts(hypotheses = {}) {
  const blocks = [
    ...(Array.isArray(hypotheses?.suitableDirections) ? hypotheses.suitableDirections : []),
    ...(Array.isArray(hypotheses?.routeCards) ? hypotheses.routeCards : []),
    ...(Array.isArray(hypotheses?.newPossibilities) ? hypotheses.newPossibilities : []),
  ];
  return blocks.map((item) => [
    item?.label,
    item?.title,
    item?.whatItIs,
    item?.whyYou,
    item?.futureValue,
    item?.evidence,
  ].filter(Boolean).join(" ")).join(" ");
}

function metadataPriorityScore(item) {
  const frontier = Number(item?.frontierScore) || 0;
  const salary = Number(item?.salaryScore) || 0;
  const degree = Number(item?.degreeScore) || 0;
  const scarcity = Number(item?.scarcityScore) || 0;
  const future = Number(item?.futurePotentialScore) || 0;
  const ai = Number(item?.aiRelevanceScore) || 0;
  return (frontier * 100000) + (salary * 10000) + (degree * 1000) + (scarcity * 100) + (future * 10) + ai;
}

function rankLibraryItemsWithCalibration(items, primaryHaystack, secondaryHaystack = "", limit = 6) {
  const primary = String(primaryHaystack || "");
  const secondary = String(secondaryHaystack || "");
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      item,
      score: (scoreLibraryItem(item, primary) * 1000000)
        + (scoreLibraryItem(item, secondary) * 1000)
        + metadataPriorityScore(item),
    }))
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item)
    .slice(0, limit);
}

function buildOverviewLayerLibraryContext(careerProfile, goalMode = "career", hypotheses = null) {
  const primaryText = hypothesisTexts(hypotheses);
  const secondaryText = profileTexts(careerProfile);
  const rankedRoutes = (primaryText
    ? rankLibraryItemsWithCalibration(getGoalLibraryItems(goalMode), primaryText, secondaryText, 24)
    : rankGoalLibraryItems(careerProfile, goalMode, 24))
    .filter((item) => passesRoleGate(item?.title || item?.name, careerProfile))
    .slice(0, 8);
  return {
    careerRoutes: rankedRoutes.map((item) => ({
      title: item?.title || "",
      label: item?.label || "",
      tags: Array.isArray(item?.tags) ? item.tags.slice(0, 4) : [],
      aliases: Array.isArray(item?.aliases) ? item.aliases.slice(0, 3) : [],
      category: item?.category || item?.parentDiscipline || "",
      industry: item?.industry || "",
      frontierScore: Number(item?.frontierScore) || 0,
      salaryScore: Number(item?.salaryScore) || 0,
      degreeScore: Number(item?.degreeScore) || 0,
      scarcityScore: Number(item?.scarcityScore) || 0,
      aiRelevanceScore: Number(item?.aiRelevanceScore) || 0,
      futurePotentialScore: Number(item?.futurePotentialScore) || 0,
      futureValueHint: item?.futureValueHint || "",
    })),
    possibilityPatterns: rankLibraryItemsWithCalibration(loadCareerLibrary().possibilityPatterns, primaryText || secondaryText, secondaryText, 5).map((item) => ({
      title: item?.title || "",
      tags: Array.isArray(item?.tags) ? item.tags.slice(0, 4) : [],
      reason: item?.reason || "",
    })),
  };
}

function buildOverviewDiagnosisPrompt(careerProfile, _goalMode = "career", previousError = "") {
  return [
    "请只生成首页总览的【诊断层】JSON，不要输出路线层内容。",
    "这一层只负责身份、能力、评分、短板和建议。",
    previousError ? `上一轮错误摘要：${normalizeText(previousError, 220)}` : "",
    "",
    "career_profile：",
    stringifyCompact(careerProfile),
  ].filter(Boolean).join("\n");
}

function buildCompactOverviewDiagnosisPrompt(careerProfile, _goalMode = "career", previousError = "") {
  return [
    "诊断层短版重试。",
    "只输出诊断层 JSON，不要输出路线层。",
    previousError ? `上一轮错误摘要：${normalizeText(previousError, 220)}` : "",
    "",
    "career_profile：",
    stringifyCompact(careerProfile),
  ].filter(Boolean).join("\n");
}

function buildOverviewPathPrompt(careerProfile, goalMode = "career", previousError = "", extras = {}) {
  const copy = getGoalModeCopy(goalMode);
  const hypotheses = extras?.hypotheses || null;
  return [
    "请只生成首页总览的【路径层】JSON，不要输出诊断层内容。",
    `当前用户目标：${copy.modeLabel}。这一层只回答和这个目标直接相关的问题。`,
    "请严格围绕下面三个框格问题输出：",
    `1. suitableDirections：${copy.suitableQuestion}。`,
    `2. routeCards：${copy.routeQuestion}。`,
    `3. newPossibilities：${copy.possibilityQuestion}。`,
    "先基于模型对原始简历的自由判断做结论，再参考库候选项做命名、去重和未来潜力排序。",
    previousError ? `上一轮错误摘要：${normalizeText(previousError, 220)}` : "",
    "",
    hypotheses ? "模型自由判断（优先参考，不要被库反向绑死）：" : "",
    hypotheses ? JSON.stringify(hypotheses, null, 2) : "",
    hypotheses ? "" : "",
    "career_profile：",
    stringifyCompact(careerProfile),
    "",
    "库候选项：",
    JSON.stringify(buildOverviewLayerLibraryContext(careerProfile, goalMode, hypotheses), null, 2),
  ].filter(Boolean).join("\n");
}

function buildCompactOverviewPathPrompt(careerProfile, goalMode = "career", previousError = "", extras = {}) {
  const copy = getGoalModeCopy(goalMode);
  const hypotheses = extras?.hypotheses || null;
  return [
    "路径层短版重试。",
    "只输出路径层 JSON，不要输出诊断层。",
    `当前用户目标：${copy.modeLabel}。`,
    `只回答：最适合的${copy.directionObject}、最值得比较的${copy.routeObject}、以及另外两个可能方向。`,
    "不要照抄库候选项说明，要回到原始简历证据和模型初判。",
    previousError ? `上一轮错误摘要：${normalizeText(previousError, 220)}` : "",
    "",
    hypotheses ? "模型自由判断：" : "",
    hypotheses ? JSON.stringify(hypotheses, null, 2) : "",
    hypotheses ? "" : "",
    "career_profile：",
    stringifyCompact(careerProfile),
    "",
    "库候选项：",
    JSON.stringify(buildOverviewLayerLibraryContext(careerProfile, goalMode, hypotheses), null, 2),
  ].filter(Boolean).join("\n");
}

function buildDirectionHypothesisSystemPrompt(goalMode = "career") {
  const copy = getGoalModeCopy(goalMode);
  return [
    "你是首页路径层前面的方向判别器。",
    `当前用户目标是：${copy.modeLabel}。你必须先基于原始简历全文和用户目标做自由判断，再输出具体方向。`,
    `不要先参考方向库，不要被泛化大类绑住。优先输出足够细的具体${copy.directionPromptNoun}，例如“社交媒体传播”“整合营销传播”“消费者洞察”“民商法”“机械工程”，而不是空泛大类。`,
    "必须先判断这个人的经历最像什么，再判断什么方向更有未来上限、AI 结合度和行业机会。",
    "如果两个相近方向都成立，要把差别说清楚：它们分别更看重什么、这个人为什么更偏其中一个。",
    buildDirectionSpaceReference(goalMode),
    careerJudgmentPrinciples,
    jsonOnlyContract,
  ].join("\n");
}

function buildDirectionHypothesisJsonContract(goalMode = "career") {
  const copy = getGoalModeCopy(goalMode);
  return [
    "JSON 顶层字段必须为：suitableDirections, routeCards, newPossibilities。",
    `suitableDirections：3 项，每项字段：title, whyYou, whatItIs, futureValue, evidence。title 必须是具体${copy.directionPromptNoun}。`,
    `routeCards：4 项，每项字段：label, title, whyYou, whatItIs, futureValue, evidence。label 优先使用：${copy.routeLabels.join("、")}。title 必须是具体${copy.routeObject}。`,
    `newPossibilities：2 项，每项字段：title, whyYou, whatItIs, futureValue, evidence。这里要写用户没优先想到、但未来可期的具体${copy.directionPromptNoun}。`,
    "whyYou 必须具体引用原始简历里的经历、项目、结果或能力线索。",
    "whatItIs 用一句话解释这个方向主要做什么或研究什么。",
    "futureValue 用一句话解释为什么值得考虑，可以写 AI 契合度、行业机会、收入上限或职业延展性。",
    "evidence 用一句话摘出最关键的简历证据，不要泛泛而谈。",
    "只返回合法 JSON。",
  ].join("\n");
}

function buildDirectionHypothesisPrompt(careerProfile, resumeText, goalMode = "career") {
  const copy = getGoalModeCopy(goalMode);
  return [
    "请先做不受方向库限制的自由判断。",
    `你要回答三个问题：1. ${copy.suitableQuestion}；2. ${copy.routeQuestion}；3. ${copy.possibilityQuestion}。`,
    "先读原始简历全文，再参考 career_profile 压缩信息。若两者有细节差异，以原始简历证据优先。",
    "",
    "用户目标与基础信息：",
    JSON.stringify(careerProfile?.basic || {}, null, 2),
    "",
    "原始简历全文：",
    normalizeText(resumeText, MAX_HYPOTHESIS_RESUME_TEXT_CHARS),
    "",
    "career_profile：",
    stringifyCompact(careerProfile, Math.max(MAX_PROFILE_JSON_CHARS, 5200)),
  ].join("\n");
}

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

const applicationSystemPrompt = [
  "你是申请资料整理器。",
  "你只基于 career_profile 生成一份可编辑、可复用的申请底稿。",
  "不要重复输出职业分析报告，不要空泛鼓励。",
  "重点是把经历压缩成结构化资料与 story_bank，供网申、留学申请和问答工作台复用。",
  "所有字段使用中文，短句，避免冗长段落。",
  careerJudgmentPrinciples,
  jsonOnlyContract,
].join("\n");

const applicationJsonContract = [
  "JSON 顶层字段必须为：basicProfile, educationEntries, publicationEntries, achievementEntries, experienceEntries, storyBank, applicationHints。",
  "basicProfile 字段：fullName, email, phone, age, region, educationStage, major, oneLineIntro, targetGoal, targetDirection, currentThought, anxiety。",
  "educationEntries 最多 4 项，每项字段：id, school, degree, major, period, highlights。",
  "publicationEntries 最多 4 项，每项字段：id, title, type, venue, year, note。",
  "achievementEntries 最多 6 项，每项字段：id, title, type, year, note。",
  "experienceEntries 最多 6 项，每项字段：id, title, evidence, polished, tags。",
  "storyBank 最多 8 项，每项字段：id, title, situation, task, action, result, skills。",
  "applicationHints 字段：summary, priorityModules, missingProof。",
  "priorityModules 最多 4 条，说明用户接下来最该先整理哪几块资料。",
  "missingProof 最多 4 条，说明这份底稿还缺什么关键证据。",
  "school、degree、major、period、title、type、venue、year、note、evidence、polished、situation、task、action、result 都必须短，不超过 90 个中文字符。",
  "storyBank 要尽量和真实经历强关联，不要虚构故事。",
].join("\n");

const qaStudioSystemPrompt = [
  "你是问答工作台生成器。",
  "你只基于 career_profile、application_draft、当前问题和目标上下文，生成一份简洁、专业、像用户自己的回答草稿。",
  "不要写成长报告，不要泛泛夸奖，不要虚构经历。",
  "回答必须能看出用户想要什么、为什么想要、以及自己现在凭什么能要。",
  "默认使用“正言 - 分点 - 佐证 - 强化”框架：先给确定性回答，再分点展开，每个点都要落到真实证据，最后再收束强化。",
  "没有足够证据时，要如实说明，而不是编造。",
  "回答长度要克制，适合求职或留学申请中的单题场景。",
  careerJudgmentPrinciples,
  jsonOnlyContract,
].join("\n");

const qaStudioJsonContract = [
  "JSON 顶层字段必须为：mainAxis, opening, pointBlocks, reinforcement, longAnswer, followUpPrompt.",
  "mainAxis：1-2 句，说明这题应该怎么答。",
  "opening：1 段，用正言先给出确定性回答，控制在 30-90 个中文字符。",
  "pointBlocks：2-3 项，每项字段：heading, point, evidence。heading 优先围绕“我想要什么 / 为什么想要 / 我怎么能要 / 我接下来怎么补”组织。",
  "pointBlocks.evidence 必须引用 application_draft 或 career_profile 中真实经历；证据不足时要如实说明缺什么。",
  "reinforcement：1 段，用来收束和强化匹配度、成长动机或下一步决心，控制在 30-90 个中文字符。",
  "longAnswer：1 段，适合网申或书面表达，控制在 180-320 个中文字符。",
  "followUpPrompt：1 句，提醒用户下一步最值得补哪类信息或追问什么。",
  "不要输出 markdown，不要输出表格。",
].join("\n");

const resumeChatSystemPrompt = [
  "你是一个专业、克制的简历追问助手。",
  "你只能基于用户提供的 career_profile、前置分析和最近对话回答。",
  "如果简历证据不足，要直接说明信息不足，不要编造经历、成绩、公司、学校或论文。",
  "回答要有判断、有解释，但保持简洁。默认使用中文。",
  careerJudgmentPrinciples,
  "追问回答不是完整报告，而是短反馈。",
  "默认控制在 3 段以内、4 句以内、约 90-180 个中文字符。",
  "优先使用这个结构：1 句直接判断，1 句解释原因，最后给 1-2 个下一步动作或可继续追问点。",
  "不要重复用户问题，不要铺陈背景，不要写长清单，不要把首页内容完整重讲一遍。",
  "除非用户明确要求展开，否则不要输出超过 3 个并列点。",
  "追问回答要更像导师互动：先判断用户真正卡点，再给 1-2 个可继续追问的问题或补充材料建议。",
  "不要输出 JSON，不要输出表格，不要做与职业发展无关的闲聊。",
].join("\n");

function sendJson(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders,
  });
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
  const libraryContext = {
    careerRoutes: buildCatalogContext(careerProfile, "career", 6).map((item) => ({
      title: item?.title || "",
      tags: Array.isArray(item?.tags) ? item.tags.slice(0, 4) : [],
    })),
    possibilityPatterns: rankLibraryItems(loadCareerLibrary().possibilityPatterns, profileTexts(careerProfile), 4).map((item) => ({
      title: item?.title || item?.name || "",
      tags: Array.isArray(item?.tags) ? item.tags.slice(0, 4) : [],
    })),
  };
  return [
    "请基于 career_profile 生成首页总览 JSON。",
    "不要要求原始简历，不要生成深度报告。",
    "总览需要引导用户进入 career/study/ability 三个深度模块。",
    "",
    "career_profile：",
    stringifyCompact(careerProfile),
    "",
    "库候选项：",
    JSON.stringify(libraryContext, null, 2),
  ].join("\n");
}

function buildCompactOverviewPrompt(careerProfile, previousError = "") {
  const libraryContext = {
    careerRoutes: buildCatalogContext(careerProfile, "career", 4).map((item) => ({
      title: item?.title || "",
      tags: Array.isArray(item?.tags) ? item.tags.slice(0, 4) : [],
    })),
    possibilityPatterns: rankLibraryItems(loadCareerLibrary().possibilityPatterns, profileTexts(careerProfile), 3).map((item) => ({
      title: item?.title || item?.name || "",
      tags: Array.isArray(item?.tags) ? item.tags.slice(0, 4) : [],
    })),
  };
  return [
    "上一轮首页总览 JSON 不稳定，请改用更短 JSON 重新生成。",
    "只生成合同要求的核心字段，避免长句和复杂嵌套。",
    "必须基于 career_profile 的证据，不要输出模板占位词。",
    "四条路线必须具体到岗位或路径。",
    previousError ? `上一轮错误摘要：${normalizeText(previousError, 220)}` : "",
    "",
    "career_profile：",
    stringifyCompact(careerProfile),
    "",
    "库候选项：",
    JSON.stringify(libraryContext, null, 2),
  ].filter(Boolean).join("\n");
}

function buildJsonCompletionBody({ systemPrompt, contract, userPrompt, maxTokens, temperature = 0.2, thinkingType = DEEPSEEK_THINKING_TYPE }) {
  return {
    model: DEEPSEEK_MODEL,
    temperature,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
    thinking: buildThinkingConfig(thinkingType),
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
  const libraryContext = buildCatalogContext(careerProfile, moduleType, 6).map((item) => ({
    title: item?.title || item?.name || "",
    tags: Array.isArray(item?.tags) ? item.tags.slice(0, 4) : [],
    summary: item?.summary || item?.reason || item?.why || "",
  }));
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
    "",
    "库候选项：",
    JSON.stringify(libraryContext, null, 2),
  ].join("\n");
}

function normalizeApplicationDraft(rawDraft = {}) {
  const draft = rawDraft && typeof rawDraft === "object" ? rawDraft : {};
  const basicProfile = draft.basicProfile && typeof draft.basicProfile === "object" ? draft.basicProfile : {};
  const educationEntries = Array.isArray(draft.educationEntries) ? draft.educationEntries : [];
  const publicationEntries = Array.isArray(draft.publicationEntries) ? draft.publicationEntries : [];
  const achievementEntries = Array.isArray(draft.achievementEntries) ? draft.achievementEntries : [];
  const experienceEntries = Array.isArray(draft.experienceEntries) ? draft.experienceEntries : [];
  const storyBank = Array.isArray(draft.storyBank) ? draft.storyBank : [];
  const applicationHints = draft.applicationHints && typeof draft.applicationHints === "object" ? draft.applicationHints : {};
  return {
    basicProfile: {
      fullName: normalizeText(basicProfile.fullName, 80),
      email: normalizeText(basicProfile.email, 120),
      phone: normalizeText(basicProfile.phone, 80),
      oneLineIntro: normalizeText(basicProfile.oneLineIntro, 180),
      educationStage: normalizeText(basicProfile.educationStage, 80),
      major: normalizeText(basicProfile.major, 80),
      targetGoal: normalizeText(basicProfile.targetGoal, 80),
      targetDirection: normalizeText(basicProfile.targetDirection, 120),
      currentThought: normalizeText(basicProfile.currentThought, 280),
      anxiety: normalizeText(basicProfile.anxiety, 240),
      region: normalizeText(basicProfile.region, 80),
      age: normalizeText(basicProfile.age, 12),
    },
    educationEntries: educationEntries.slice(0, 4).map((item, index) => ({
      id: normalizeText(item?.id, 40) || `edu_${index + 1}`,
      school: normalizeText(item?.school, 120),
      degree: normalizeText(item?.degree, 80),
      major: normalizeText(item?.major, 80),
      period: normalizeText(item?.period, 80),
      highlights: normalizeText(item?.highlights, 200),
    })),
    publicationEntries: publicationEntries.slice(0, 4).map((item, index) => ({
      id: normalizeText(item?.id, 40) || `pub_${index + 1}`,
      title: normalizeText(item?.title, 120),
      type: normalizeText(item?.type, 80),
      venue: normalizeText(item?.venue, 80),
      year: normalizeText(item?.year, 40),
      note: normalizeText(item?.note, 200),
    })),
    achievementEntries: achievementEntries.slice(0, 6).map((item, index) => ({
      id: normalizeText(item?.id, 40) || `ach_${index + 1}`,
      title: normalizeText(item?.title, 120),
      type: normalizeText(item?.type, 80),
      year: normalizeText(item?.year, 40),
      note: normalizeText(item?.note, 200),
    })),
    experienceEntries: experienceEntries.slice(0, 8).map((item, index) => ({
      id: normalizeText(item?.id, 40) || `exp_${index + 1}`,
      title: normalizeText(item?.title, 120),
      evidence: normalizeText(item?.evidence, 240),
      polished: normalizeText(item?.polished, 240),
      tags: Array.isArray(item?.tags) ? item.tags.map((tag) => normalizeText(tag, 40)).filter(Boolean).slice(0, 4) : [],
    })),
    storyBank: storyBank.slice(0, 10).map((item, index) => ({
      id: normalizeText(item?.id, 40) || `story_${index + 1}`,
      title: normalizeText(item?.title, 120),
      situation: normalizeText(item?.situation, 240),
      task: normalizeText(item?.task, 180),
      action: normalizeText(item?.action, 240),
      result: normalizeText(item?.result, 240),
      skills: Array.isArray(item?.skills) ? item.skills.map((tag) => normalizeText(tag, 40)).filter(Boolean).slice(0, 5) : [],
    })),
    applicationHints: {
      summary: normalizeText(applicationHints.summary, 220),
      priorityModules: Array.isArray(applicationHints.priorityModules)
        ? applicationHints.priorityModules.map((item) => normalizeText(item, 120)).filter(Boolean).slice(0, 4)
        : [],
      missingProof: Array.isArray(applicationHints.missingProof)
        ? applicationHints.missingProof.map((item) => normalizeText(item, 120)).filter(Boolean).slice(0, 4)
        : [],
    },
  };
}

function buildApplicationPrompt(careerProfile, resumeText = "") {
  const safeResumeText = normalizeText(resumeText, 5000);
  return [
    "请把 career_profile 整理成申请资料底稿 JSON。",
    "不要重复输出职业分析，只做资料整理。",
    "用户一进入页面就会直接看到这版底稿，所以请尽量输出可直接编辑的具体内容，而不是留下大片空白。",
    "如果 basicProfile 某些字段在 career_profile 里不完整，请优先从原始简历正文中补齐能明确识别的事实，例如教育阶段、专业背景、地区或工作身份；只有真的看不出来时才留空。",
    "educationEntries 要尽量提取学校、学历、专业、时间和最值得写进申请表的亮点。",
    "publicationEntries 要尽量提取论文、发表、作品、报告、专利、项目产出等可归档成果；如果没有就留空数组，不要编造。",
    "achievementEntries 要尽量提取奖项、竞赛、证书、重要荣誉或代表性成果；如果没有就留空数组，不要编造。",
    "experienceEntries 要尽量把简历事实转成更像申请表可复用的表达。",
    "storyBank 要写成能继续扩成 STAR 的半成品，不要只复制同一句。",
    "applicationHints 要明确告诉用户：这一版先整理什么、还缺什么证明。",
    "",
    "career_profile：",
    stringifyCompact(careerProfile),
    safeResumeText ? "" : "",
    safeResumeText ? "原始简历正文（只用于补齐资料，不得编造）：" : "",
    safeResumeText || "",
  ].join("\n");
}

function buildQaStudioPrompt(payload) {
  const target = payload.targetContext && typeof payload.targetContext === "object" ? payload.targetContext : {};
  return [
    "请基于下面材料，生成单题回答草稿 JSON。",
    "只回答这一题，不要写成长报告。",
    "回答框架必须体现“正言 - 分点 - 佐证 - 强化”。",
    "要让人一眼看出：用户想要什么、为什么想要、现在凭什么能要、接下来还要补什么。",
    "",
    "career_profile：",
    stringifyCompact(payload.careerProfile),
    "",
    "application_draft：",
    stringifyCompact(normalizeApplicationDraft(payload.applicationDraft), 5200),
    "",
    "当前问题：",
    normalizeText(payload.question, 240),
    "",
    "目标上下文：",
    JSON.stringify({
      targetOrganization: normalizeText(target.targetOrganization, 120),
      targetRole: normalizeText(target.targetRole, 120),
      tone: normalizeText(target.tone, 40),
      answerLength: normalizeText(target.answerLength, 60),
      extraContext: normalizeText(target.extraContext, 280),
    }, null, 2),
  ].join("\n");
}

function buildResumeChatMessages(payload) {
  const question = normalizeText(payload.question, 1200);
  const history = Array.isArray(payload.history)
    ? payload.history.slice(-4).map(normalizeChatMessage).filter(Boolean)
    : [];
  const profileText = stringifyCompact(payload.careerProfile, MAX_PROFILE_JSON_CHARS);
  const reportText = normalizeText(JSON.stringify(payload.report || {}, null, 2), 1600);

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

function splitResumeLines(resumeText = "") {
  return normalizeText(resumeText, MAX_RESUME_TEXT_CHARS)
    .split(/\r?\n/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function extractResumeFacts(resumeText = "") {
  const text = normalizeText(resumeText, MAX_RESUME_TEXT_CHARS);
  const lines = splitResumeLines(text);
  const email = normalizeText(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0], 120);
  const phoneMatch = text.match(/(?:\+?86[-\s]?)?(1[3-9]\d{9})|(?:\+?\d[\d\s-]{7,}\d)/);
  const phone = normalizeText(phoneMatch?.[0]?.replace(/\s+/g, " "), 80);
  const name = normalizeText(lines.find((line) => {
    if (line.length < 2 || line.length > 30) return false;
    if (/@|电话|手机|Tel|Email|邮箱|微信|LinkedIn|年龄|Age|简历|Resume|CV|教育背景|教育经历|教育信息|学习经历|项目经历|实践经历|工作经历|实习经历|技能特长|自我评价/i.test(line)) return false;
    return /^[\p{Script=Han}A-Za-z][\p{Script=Han}A-Za-z\s.'-]{1,28}$/u.test(line);
  }), 80);
  return { text, lines, email, phone, name };
}

function isLikelyResumeSectionTitle(line = "") {
  const text = normalizeText(line, 80);
  if (!text || text.length > 24) return false;
  return /^(教育背景|教育经历|教育信息|学习经历|项目经历|实践经历|在校经历|校园经历|社团经历|实习经历|工作经历|科研经历|发表成果|荣誉奖项|获奖经历|技能证书|技能特长|自我评价|个人总结|联系方式|基本信息|个人信息|Education|Experience|Projects?|Activities?|Research|Awards?|Honors?|Skills?|Summary|Profile)$/i.test(text);
}

function getLikelyEducationSectionLines(lines = []) {
  const start = lines.findIndex((line) => /^(教育背景|教育经历|教育信息|学习经历|Education)$/i.test(normalizeText(line, 80)));
  if (start < 0) return lines;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (isLikelyResumeSectionTitle(lines[index]) && !/^(教育背景|教育经历|教育信息|学习经历|Education)$/i.test(normalizeText(lines[index], 80))) {
      end = index;
      break;
    }
  }
  return lines.slice(start + 1, end);
}

function isLikelyEducationNarrativeLine(line = "") {
  const text = normalizeText(line, 200);
  if (!text) return false;
  if (text.length > 60) return true;
  if (/负责|运营|策划|审核|增长|主持|社团|项目|活动|微博|社群|对接|拉赞助|执行|内容|粉丝|矩阵|公众号|宣传|编辑|投稿|直播|拍摄|采访|排版|策展|组织|统筹|商务|拓展|超话|话题|账号|社媒/i.test(text)) {
    return true;
  }
  if (/[：:；;，,。]/.test(text) && !/(博士|硕士|本科|大专|MBA|EMBA|PhD|Master(?:'s)?|Bachelor(?:'s)?|研究生|专业|major|degree|GPA|绩点|学位|毕业)/i.test(text)) {
    return true;
  }
  return false;
}

function extractEducationSchoolName(text = "") {
  const normalized = normalizeText(text, 240);
  const chineseMatch = normalized.match(/(?:^|[\s(（【\[]|[•·\-—"“'])((?:[\u4e00-\u9fa5A-Za-z&().（）·]{2,30})(?:大学|学院|学校))/u);
  if (chineseMatch?.[1]) return normalizeText(chineseMatch[1], 120);
  const englishMatch = normalized.match(/(?:^|[\s(（【\[]|[•·\-—"“'])([A-Za-z][A-Za-z&().,\s]{1,40}?(?:University|College|Institute|School))/i);
  return normalizeText(englishMatch?.[1], 120);
}

function extractEducationMajor(text = "", school = "") {
  let source = normalizeText(text, 240);
  if (school) source = source.replace(school, " ");
  source = source
    .replace(/(博士|硕士|本科|大专|MBA|EMBA|PhD|Master(?:'s)?|Bachelor(?:'s)?|研究生|学士学位|硕士学位|博士学位)/ig, " ")
    .replace(/((?:19|20)\d{2}(?:[./-](?:0?[1-9]|1[0-2]))?\s*(?:-|~|—|至|to)\s*(?:Present|至今|现在|(?:19|20)\d{2}(?:[./-](?:0?[1-9]|1[0-2]))?))/ig, " ");
  const explicit = source.match(/(?:专业|major)[:：]?\s*([A-Za-z\u4e00-\u9fa5&/、\s]{2,40})/i)?.[1];
  const inferredCandidates = source.match(/[A-Za-z\u4e00-\u9fa5&/、]{2,24}(?:新闻传播学|传播学|新闻学|心理学|教育学|语言学|经济学|金融学|法学|统计学|数学|物理学|化学|生物学|会计学|管理学|文学|体育学|艺术学|数据科学|计算机科学|软件工程|计算机|软件|传媒|设计|技术|工程|管理|传播|经济|金融|法学|统计|语言|文学|数学|物理|化学|生物|心理|教育|会计|专业|学)/ig) || [];
  const inferred = inferredCandidates
    .map((item) => normalizeText(item, 80))
    .filter((item) => item && !/(大学|学院|学校|University|College|Institute|School)/i.test(item))
    .sort((left, right) => right.length - left.length)[0];
  const major = normalizeText(explicit || inferred, 80);
  if (/(大学|学院|学校|University|College|Institute|School)/i.test(major)) return "";
  return major;
}

function isLikelyEducationSchoolLine(line = "", nearby = []) {
  const text = normalizeText(line, 200);
  if (!/(大学|学院|学校|University|College|Institute|School)/i.test(text)) return false;
  if (isLikelyEducationNarrativeLine(text)) return false;
  const school = extractEducationSchoolName(text);
  if (!school) return false;
  const context = normalizeText([text, ...nearby.slice(1, 4)].join(" "), 320);
  const hasEducationContext = /(博士|硕士|本科|大专|MBA|EMBA|PhD|Master(?:'s)?|Bachelor(?:'s)?|研究生|专业|major|degree|GPA|绩点|学位|毕业|在读|交换|课程|均分|成绩)/i.test(context)
    || /((?:19|20)\d{2}(?:[./-](?:0?[1-9]|1[0-2]))?)/.test(context);
  if (!hasEducationContext && text.length > 26) return false;
  return true;
}

function extractResumeEducationEntries(resumeText = "", basic = {}) {
  const lines = splitResumeLines(resumeText);
  const entries = [];
  const lineGroups = [getLikelyEducationSectionLines(lines)];
  if (lineGroups[0] !== lines) lineGroups.push(lines);
  const seenKeys = new Set();
  for (const scopedLines of lineGroups) {
    for (let index = 0; index < scopedLines.length; index += 1) {
      const line = scopedLines[index];
      const nearby = scopedLines.slice(index, index + 4);
      if (!isLikelyEducationSchoolLine(line, nearby)) continue;
      const merged = nearby.join(" ");
      const school = extractEducationSchoolName(line) || extractEducationSchoolName(merged);
      if (!school) continue;
      const degree = normalizeText(merged.match(/(博士|硕士|本科|大专|MBA|EMBA|PhD|Master(?:'s)?|Bachelor(?:'s)?|研究生)/i)?.[0], 80);
      const major = extractEducationMajor(merged, school);
      const period = normalizeText(merged.match(/((?:19|20)\d{2}(?:[./-](?:0?[1-9]|1[0-2]))?\s*(?:-|~|—|至|to)\s*(?:Present|至今|现在|(?:19|20)\d{2}(?:[./-](?:0?[1-9]|1[0-2]))?))/i)?.[1], 80);
      const key = `${school}|${period}|${major}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      entries.push({
        id: `edu_${entries.length + 1}`,
        school,
        degree,
        major,
        period,
        highlights: normalizeText(
          nearby.find((item) => item !== line
            && !isLikelyEducationNarrativeLine(item)
            && /(GPA|绩点|排名|奖学金|荣誉|研究|论文|课程|交换|实验室|学术|成绩|均分|获奖)/i.test(item)),
          200
        ),
      });
      if (entries.length >= 4) break;
    }
    if (entries.length) break;
  }
  if (entries.length) return entries;
  return [{
    id: "edu_1",
    school: "",
    degree: normalizeText(basic.educationStage, 80),
    major: normalizeText(basic.major, 80),
    period: "",
    highlights: "",
  }].filter((item) => isUsefulTextValue(item.degree) || isUsefulTextValue(item.major) || isUsefulTextValue(item.school) || isUsefulTextValue(item.highlights));
}

function extractResumePublicationEntries(resumeText = "") {
  return uniqueNonEmpty(
    splitResumeLines(resumeText).filter((line) => /(论文|paper|publication|发表|专利|patent|作品集|portfolio|报告|report|文章)/i.test(line)),
    4
  ).map((line, index) => ({
    id: `pub_${index + 1}`,
    title: normalizeText(line, 120),
    type: /(论文|paper|publication|发表)/i.test(line)
      ? "发表"
      : /(专利|patent)/i.test(line)
        ? "专利"
        : /(报告|report)/i.test(line)
          ? "报告"
          : "作品",
    venue: "",
    year: normalizeText(line.match(/((?:19|20)\d{2})/)?.[1], 40),
    note: normalizeText(line, 200),
  }));
}

function extractResumeAchievementEntries(resumeText = "") {
  return uniqueNonEmpty(
    splitResumeLines(resumeText).filter((line) => /(奖|证书|竞赛|荣誉|获奖|scholarship|award|certificate)/i.test(line)),
    6
  ).map((line, index) => ({
    id: `ach_${index + 1}`,
    title: normalizeText(line, 120),
    type: /(证书|certificate)/i.test(line) ? "证书" : "荣誉",
    year: normalizeText(line.match(/((?:19|20)\d{2})/)?.[1], 40),
    note: normalizeText(line, 200),
  }));
}

function buildApplicationOneLineIntro(careerProfile, resumeFacts = {}) {
  const basic = careerProfile?.basic || {};
  const experiences = Array.isArray(careerProfile?.experienceSummary) ? careerProfile.experienceSummary : [];
  const strengths = Array.isArray(careerProfile?.strengths) ? careerProfile.strengths : [];
  const major = normalizeText(basic.major, 80);
  const direction = normalizeText(basic.targetDirection || basic.targetGoal, 120);
  const topStrength = normalizeText(strengths[0]?.name, 80);
  const topExperience = normalizeText(experiences[0]?.title, 80);
  return pickUsefulText([
    major && direction && topStrength ? `我是${major}背景，积累了${topStrength}相关经验，正在申请${direction}机会。` : "",
    major && direction ? `我是${major}背景，正在把过往经历整理成更清楚的${direction}申请表达。` : "",
    topExperience && direction ? `我过去在${topExperience}中积累了可迁移经验，正在申请${direction}机会。` : "",
    resumeFacts?.name && direction ? `${resumeFacts.name}正在围绕${direction}整理自己的申请故事。` : "",
  ], "我正在把已有经历整理成一版更清楚、可复用的申请表达。");
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
  const profile = await callDeepSeekJson(buildJsonCompletionBody({
    systemPrompt: profileSystemPrompt,
    contract: profileJsonContract,
    userPrompt: buildProfilePrompt(payload, resumeText, file),
    maxTokens: PROFILE_MAX_TOKENS,
    temperature: 0.1,
  }));
  return ensureCareerProfileFields(profile, payload, resumeText);
}

async function createDirectionHypotheses(careerProfile, resumeText = "", goalMode = inferGoalMode(careerProfile)) {
  const body = buildJsonCompletionBody({
    systemPrompt: buildDirectionHypothesisSystemPrompt(goalMode),
    contract: buildDirectionHypothesisJsonContract(goalMode),
    userPrompt: buildDirectionHypothesisPrompt(careerProfile, resumeText, goalMode),
    maxTokens: DIRECTION_HYPOTHESIS_MAX_TOKENS,
    temperature: 0.25,
    thinkingType: "enabled",
  });

  try {
    const report = await callDeepSeekJsonWithTimeout(body, DIRECTION_HYPOTHESIS_TIMEOUT_MS, DIRECTION_HYPOTHESIS_REPAIR_TIMEOUT_MS);
    return { report, meta: { ok: true, retryMode: "primary" } };
  } catch (primaryError) {
    try {
      const compactBody = buildJsonCompletionBody({
        systemPrompt: buildDirectionHypothesisSystemPrompt(goalMode),
        contract: buildDirectionHypothesisJsonContract(goalMode),
        userPrompt: buildDirectionHypothesisPrompt(careerProfile, normalizeText(resumeText, Math.min(MAX_HYPOTHESIS_RESUME_TEXT_CHARS, 7000)), goalMode),
        maxTokens: Math.min(DIRECTION_HYPOTHESIS_MAX_TOKENS, 1200),
        temperature: 0.18,
        thinkingType: "enabled",
      });
      const report = await callDeepSeekJsonWithTimeout(
        compactBody,
        Math.min(DIRECTION_HYPOTHESIS_TIMEOUT_MS, 22000),
        Math.min(DIRECTION_HYPOTHESIS_REPAIR_TIMEOUT_MS, 6000)
      );
      return { report, meta: { ok: true, retryMode: "compact", primaryError: primaryError.message } };
    } catch (compactError) {
      return {
        report: {},
        meta: {
          ok: false,
          retryMode: "fallback",
          primaryError: primaryError.message,
          compactError: compactError.message,
        },
      };
    }
  }
}

function firstText(values, fallback = "信息不足") {
  for (const value of values) {
    if (!value) continue;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return fallback;
}

function isUsefulTextValue(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "--") return false;
  return !/^(信息不足|信息不足，?需补充|需补充简历证据|当前简历证据不足|没有返回有效内容)$/i.test(text);
}

function pickUsefulText(values, fallback) {
  for (const value of values) {
    if (isUsefulTextValue(value)) return String(value).trim();
  }
  return fallback;
}

function firstItem(items) {
  return Array.isArray(items) && items.length ? items[0] || {} : {};
}

function ensureCareerProfileFields(profile, payload = {}, resumeText = "") {
  const safeProfile = profile && typeof profile === "object" ? profile : {};
  const context = normalizeContext(payload.context);
  const strengths = Array.isArray(safeProfile.strengths) ? safeProfile.strengths : [];
  const weaknesses = Array.isArray(safeProfile.weaknesses) ? safeProfile.weaknesses : [];
  const skills = Array.isArray(safeProfile.skills) ? safeProfile.skills : [];
  const experiences = Array.isArray(safeProfile.experienceSummary) ? safeProfile.experienceSummary : [];
  const evidence = [
    ...experiences.map((item) => firstText([item?.evidence, item?.title], "")),
    ...strengths.map((item) => firstText([item?.evidence, item?.name], "")),
    ...skills.map((item) => firstText([item?.evidence, item?.name], "")),
  ].filter(Boolean).slice(0, 8);

  safeProfile.basic = safeProfile.basic && typeof safeProfile.basic === "object" ? safeProfile.basic : {};
  safeProfile.basic.age ||= context.age;
  safeProfile.basic.region ||= context.region;
  safeProfile.basic.targetGoal ||= context.targetGoal;
  safeProfile.basic.currentThought ||= context.currentThought;
  safeProfile.basic.targetDirection ||= context.targetDirection;
  safeProfile.basic.anxiety ||= context.anxiety;
  safeProfile.experienceSummary = experiences;
  safeProfile.skills = skills;
  safeProfile.strengths = strengths;
  safeProfile.weaknesses = weaknesses;
  safeProfile.evidence = Array.isArray(safeProfile.evidence) && safeProfile.evidence.length ? safeProfile.evidence : evidence;
  safeProfile.careerSignals = Array.isArray(safeProfile.careerSignals) && safeProfile.careerSignals.length
    ? safeProfile.careerSignals
    : [
      safeProfile.basic.targetDirection,
      ...strengths.map((item) => item?.name),
      ...experiences.map((item) => item?.title),
    ].filter(Boolean).slice(0, 6);
  safeProfile.studySignals = Array.isArray(safeProfile.studySignals) && safeProfile.studySignals.length
    ? safeProfile.studySignals
    : [
      safeProfile.basic.educationStage,
      safeProfile.basic.major,
      safeProfile.basic.currentThought,
    ].filter(Boolean).slice(0, 6);
  safeProfile.abilitySignals = Array.isArray(safeProfile.abilitySignals) && safeProfile.abilitySignals.length
    ? safeProfile.abilitySignals
    : [
      ...skills.map((item) => item?.name),
      ...strengths.map((item) => item?.name),
    ].filter(Boolean).slice(0, 8);
  safeProfile.expressionProblems = Array.isArray(safeProfile.expressionProblems) && safeProfile.expressionProblems.length
    ? safeProfile.expressionProblems
    : weaknesses.map((item) => firstText([item?.evidence, item?.name], "")).filter(Boolean).slice(0, 5);
  safeProfile.missingInformation = Array.isArray(safeProfile.missingInformation) && safeProfile.missingInformation.length
    ? safeProfile.missingInformation
    : [
      !/(\d+|%|增长|下降|提升|降低|覆盖|转化|准确|召回)/.test(resumeText) ? "关键项目的量化结果" : "",
      !safeProfile.basic.targetDirection ? "明确目标方向" : "",
      !safeProfile.basic.region ? "目标地区或市场" : "",
    ].filter(Boolean).slice(0, 6);

  return safeProfile;
}

function isGenericRouteTitle(title) {
  return /^(高薪潜力方向|最快可尝试方向|低阻力过渡方向|平衡成长方向|信息不足|方向|岗位方向|职业方向)$/i.test(String(title || "").trim());
}

const possibilityCuePattern = /(证据|作品|作品集|表达|简历|重构|补强|验证|转译|迁移|组合|试投|复盘|材料|叙事|桥接|证据化)/;
const studyModeCareerLeakPattern = /(运营|增长|公关|供应链|交付|项目管理|策划|用户研究|产品研究|用户体验|数据治理|HR|实习|岗位|工作|JD)/i;

function isRouteLikeTitle(title) {
  const text = String(title || "").trim();
  if (!text) return false;
  if (/(岗位|方向|路线|路径|职业|工作|运营|分析|策略|合规|公关|舆情|产品|增长|数据|留学)/.test(text)) return true;
  if (/场景/.test(text) && !possibilityCuePattern.test(text)) return true;
  if (/能力/.test(text) && !/(迁移|转译|组合|补强|表达)/.test(text)) return true;
  return false;
}

function isDistinctPossibilityTitle(title, routeTitles = []) {
  const text = normalizeDirectionTitle(title);
  if (!text || isGenericRouteTitle(text) || possibilityCuePattern.test(text)) return false;
  const routeItems = routeTitles.map(normalizeDirectionTitle).filter(Boolean);
  if (routeItems.some((item) => item === text || item.includes(text) || text.includes(item))) return false;
  const titleAnchors = extractDirectionAnchors(text);
  if (!titleAnchors.length) return true;
  return !routeItems.some((item) => {
    const routeAnchors = extractDirectionAnchors(item);
    return routeAnchors.some((anchor) => titleAnchors.includes(anchor));
  });
}

function isGoalModeCompatibleTitle(title, goalMode = "career") {
  const text = normalizeDirectionTitle(title);
  if (!text) return false;
  if (goalMode === "study") return !studyModeCareerLeakPattern.test(text);
  return true;
}

function getOverviewQualityIssues(report) {
  const diagnosis = report?.capabilityDiagnosis || {};
  const routes = Array.isArray(report?.routeCards) ? report.routeCards : [];
  const possibilities = Array.isArray(report?.newPossibilities) ? report.newPossibilities : [];
  const concreteRoutes = routes.filter((item) => item?.title && !isGenericRouteTitle(item.title));
  const concretePossibilities = possibilities.filter((item) => isUsefulTextValue(item?.title) && isUsefulTextValue(item?.reason || item?.firstTry));
  const hasSpecificDiagnosis = String(diagnosis.coreAbility || "").trim().length >= 6
    && String(diagnosis.evidence || "").trim().length >= 12
    && !/信息不足|可迁移能力仍需/.test(`${diagnosis.coreAbility || ""}${diagnosis.evidence || ""}`);
  const issues = [];
  if (concreteRoutes.length < 2) issues.push("route_cards_too_generic");
  if (concretePossibilities.length < 2) issues.push("new_possibilities_too_generic");
  if (!hasSpecificDiagnosis) issues.push("capability_diagnosis_too_generic");
  return issues;
}

function attachOverviewQualityMeta(report) {
  const issues = getOverviewQualityIssues(report);
  const filledFields = Array.isArray(report?.meta?.filledFields) ? report.meta.filledFields : [];
  report.meta = {
    ...(report.meta || {}),
    qualityIssues: issues,
    lowConfidence: issues.length > 0 || filledFields.length > 0 || Boolean(report?.meta?.deterministicOverviewFallback),
  };
  return report;
}

function markFilled(report, pathName) {
  report.meta = report.meta && typeof report.meta === "object" ? report.meta : {};
  report.meta.filledFields = Array.isArray(report.meta.filledFields) ? report.meta.filledFields : [];
  if (!report.meta.filledFields.includes(pathName)) report.meta.filledFields.push(pathName);
}

function ensureObjectField(report, key) {
  if (!report[key] || typeof report[key] !== "object" || Array.isArray(report[key])) {
    report[key] = {};
    markFilled(report, key);
  }
  return report[key];
}

function setTextIfMissing(report, object, key, value, pathName) {
  if (!isUsefulTextValue(object[key])) {
    object[key] = value;
    markFilled(report, pathName);
  }
}

function profileTexts(careerProfile) {
  return [
    JSON.stringify(careerProfile?.basic || {}),
    ...(Array.isArray(careerProfile?.experienceSummary) ? careerProfile.experienceSummary : []).map((item) => `${item?.title || ""} ${item?.evidence || ""}`),
    ...(Array.isArray(careerProfile?.skills) ? careerProfile.skills : []).map((item) => `${item?.name || ""} ${item?.evidence || ""}`),
    ...(Array.isArray(careerProfile?.strengths) ? careerProfile.strengths : []).map((item) => `${item?.name || ""} ${item?.evidence || ""}`),
    ...(Array.isArray(careerProfile?.careerSignals) ? careerProfile.careerSignals : []),
    ...(Array.isArray(careerProfile?.studySignals) ? careerProfile.studySignals : []),
  ].join(" ");
}

function collectLibraryTerms(item) {
  if (!item || typeof item !== "object") return [];
  const values = [
    item.title,
    item.name,
    item.category,
    item.parentDiscipline,
    item.industry,
    item.summary,
    item.whatItIs,
    item.reason,
    item.why,
    item.risk,
    item.nextStep,
    item.firstTry,
    item.focus,
    item.futureValueHint,
    item.typicalWork,
  ];
  if (Array.isArray(item.tags)) values.push(...item.tags);
  if (Array.isArray(item.aliases)) values.push(...item.aliases);
  if (Array.isArray(item.keywords)) values.push(...item.keywords);
  if (Array.isArray(item.fitSignals)) values.push(...item.fitSignals);
  if (Array.isArray(item.relatedDirections)) values.push(...item.relatedDirections);
  return values.map((value) => String(value || "").trim()).filter(Boolean);
}

function scoreLibraryItem(item, haystack) {
  const text = String(haystack || "").toLowerCase();
  if (!text) return 0;
  const terms = collectLibraryTerms(item);
  let score = 0;
  for (const term of terms) {
    const token = term.toLowerCase();
    if (!token) continue;
    if (text.includes(token)) score += token.length >= 4 ? 4 : 2;
  }
  return score;
}

function rankLibraryItems(items, haystack, limit = 6) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      item,
      score: scoreLibraryItem(item, haystack),
      priority: metadataPriorityScore(item),
    }))
    .sort((a, b) => (b.score - a.score) || (b.priority - a.priority))
    .map(({ item }) => item)
    .slice(0, limit);
}

function containsOverviewBoilerplate(text = "") {
  const value = String(text || "").trim();
  if (!value) return false;
  return /(库里|高相关候选|候选方向|当前简历还需要补一条直接证据|更偏证据化和验证化|不强行|先不强推|只展示证据最强|把经历做成可以展示的材料，比空谈方向更有效|很多问题不是没有能力，而是表达没有把能力翻译出来|先补一条能被验证的证据，判断会更稳定|你可能不只适合一个方向，而是适合能力组合后的新场景|先用小样本验证方向，而不是一次性押注|选 1 个项目，补成问题、动作、结果三段|把最重要的 1 个经历改写成岗位语言|找截图、数据、复盘或作品链接补进去|写出一个能力如何在两个场景都能用|先投 3 个最像的岗位，观察反馈)/.test(value);
}

function normalizeRouteLabel(label = "", goalMode = "career") {
  const value = String(label || "").trim();
  const labels = getGoalModeCopy(goalMode).routeLabels;
  return labels.includes(value) ? value : "";
}

function buildRouteLabelByIndex(index = 0, usedLabels = [], goalMode = "career") {
  const used = Array.isArray(usedLabels) ? usedLabels.filter(Boolean) : [];
  const labels = getGoalModeCopy(goalMode).routeLabels;
  const preferred = labels[index];
  if (preferred && !used.includes(preferred)) return preferred;
  return labels.find((item) => !used.includes(item)) || `路线 ${Math.max(used.length + 1, index + 1)}`;
}

function collectItemEvidenceTerms(item) {
  return uniqueNonEmpty([
    ...extractDirectionAnchors(item?.title || ""),
    ...(Array.isArray(item?.tags) ? item.tags : [])
      .map((tag) => String(tag || "").trim())
      .filter((tag) => tag.length >= 2 && !genericDirectionTokens.has(tag)),
    ...(Array.isArray(item?.aliases) ? item.aliases : []).flatMap((alias) => extractDirectionAnchors(alias)),
    ...(Array.isArray(item?.keywords) ? item.keywords : []).flatMap((keyword) => extractDirectionAnchors(keyword)),
    ...(Array.isArray(item?.fitSignals) ? item.fitSignals : []).flatMap((signal) => extractDirectionAnchors(signal)),
  ], 8);
}

function findEvidenceByTerms(terms, careerProfile, limit = 2, goalMode = inferGoalMode(careerProfile)) {
  const pool = buildDirectionSupportPool(careerProfile, goalMode);
  const normalizedTerms = uniqueNonEmpty((Array.isArray(terms) ? terms : [])
    .map((term) => String(term || "").trim())
    .filter((term) => term.length >= 2), 12);
  if (!normalizedTerms.length) return [];

  const matches = [];
  for (const item of pool) {
    const text = String(item || "").trim();
    if (!text) continue;
    if (normalizedTerms.some((term) => text.includes(term))) {
      matches.push(text.length > 56 ? `${text.slice(0, 56)}...` : text);
    }
    if (matches.length >= limit) break;
  }
  return uniqueNonEmpty(matches, limit);
}

function findItemEvidence(item, careerProfile, limit = 2, goalMode = inferGoalMode(careerProfile)) {
  return findEvidenceByTerms(collectItemEvidenceTerms(item), careerProfile, limit, goalMode);
}

function buildRouteWhy(title, item, parts, evidence = []) {
  const copy = parts.modeCopy || getGoalModeCopy(parts.goalMode);
  const fitTerms = collectItemEvidenceTerms(item).slice(0, 3).join("、");
  if (parts.goalMode === "study") {
    if (evidence.length >= 2) {
      return `你简历里已经有“${evidence[0]}”和“${evidence[1]}”这类证据，它们更接近 ${title} 看重的 ${fitTerms || "课程基础、项目表达和研究兴趣"}。`;
    }
    if (evidence.length === 1) {
      return `你现在最能拿来支撑申请 ${title} 的是“${evidence[0]}”，说明不是完全没基础，但还缺第二条更直接的申请证据。`;
    }
    return `${title} 更看重 ${fitTerms || "课程基础、项目经历和申请动机"}，你目前更像有相邻基础，但还缺能直接对位申请要求的 ${copy.supportGap}。`;
  }
  if (evidence.length >= 2) {
    return `你简历里已经有“${evidence[0]}”和“${evidence[1]}”这类证据，它们更接近 ${title} 看重的 ${fitTerms || "分析、判断和推进"}。`;
  }
  if (evidence.length === 1) {
    return `你现在最能拿来支撑 ${title} 的是“${evidence[0]}”，说明不是完全没基础，但还缺第二条更直接的岗位证据。`;
  }
  return `${title} 更看重 ${fitTerms || "问题拆解、结果导向和岗位表达"}，你目前更像有相邻基础，但还缺能直接对位岗位要求的代表项目。`;
}

function buildRouteRisk(title, item, parts, evidence = []) {
  const gap = pickUsefulText([
    parts.expressionGap,
    parts.missing[0] ? `现在还缺“${parts.missing[0]}”这类信息。` : "",
    parts.topWeakness?.evidence,
    item?.risk,
  ], "");
  if (gap) return gap;
  if (parts.goalMode === "study") {
    if (evidence.length) return `如果申请叙事继续只写做过什么，不解释为什么走到 ${title}，这条路会被看成经历分散。`;
    return `${title} 这条路的风险是：你现在还没有把相关课程、项目和申请动机串成一条完整叙事。`;
  }
  if (evidence.length) return `如果继续只写参与而不写判断、动作和结果，${title} 这条路会被看成泛经验。`;
  return `${title} 这条路的风险是：你现在的能力还没有被写成招聘方一眼能看懂的岗位证据。`;
}

function buildRouteNextStep(title, item, parts, evidence = []) {
  if (parts.goalMode === "study") {
    if (evidence[0]) {
      return `先把“${evidence[0]}”改写成申请叙事：问题背景、你的判断、方法、结果，以及它为什么把你带到 ${title}。`;
    }
    return pickUsefulText([
      item?.nextStep,
      parts.topExperience?.title ? `先把“${parts.topExperience.title}”补成申请案例，再回头验证 ${title}。` : "",
    ], `先找一个最接近 ${title} 的课程、项目或研究兴趣证据，补出它和申请方向的连接。`);
  }
  if (evidence[0]) {
    return `先把“${evidence[0]}”改写成目标、判断、动作、结果四句，用来直接对位 ${title} 的 JD。`;
  }
  return pickUsefulText([
    item?.nextStep,
    parts.topExperience?.title ? `先把“${parts.topExperience.title}”补成可验证案例，再回头验证 ${title}。` : "",
  ], `先找一个最接近 ${title} 的经历，补出个人贡献、判断过程和结果变化。`);
}

function buildDirectionExplanationFromRouteItem(item, parts, titleOverride = "") {
  const title = String(titleOverride || item?.title || "").trim();
  const evidence = findItemEvidence(item, parts.careerProfile, 2, parts.goalMode);
  const why = buildRouteWhy(title, item, parts, evidence);
  const nextStep = buildRouteNextStep(title, item, parts, evidence);
  return `${why}${nextStep}`;
}

function buildPossibilityReason(item, parts, routeTitles = []) {
  const title = String(item?.title || item?.name || "").trim();
  const sourceEvidence = pickUsefulText([
    findItemEvidence(item, parts.careerProfile, 1, parts.goalMode)[0],
    parts.evidenceText,
    parts.topExperience?.evidence,
  ], "你已经有一些可转译经历");
  const routeLead = routeTitles[0] || parts.directions[0] || (parts.goalMode === "study" ? "当前主申请方向" : "当前主方向");

  if (parts.goalMode === "study") {
    if (sourceEvidence) {
      return `除了 ${routeLead} 之外，你已有的“${sourceEvidence}”也能支撑 ${title}，只是这个专业通常不会第一眼想到。`;
    }
    return `${title} 和你当前的经历并不是断裂的，它可能是比首选方向更稳、也更容易讲清申请动机的选择。`;
  }

  if (sourceEvidence) {
    return `除了 ${routeLead} 之外，你已有的“${sourceEvidence}”也能支撑 ${title}，只是这个岗位通常不会第一眼想到。`;
  }
  return `${title} 和你当前的能力组合有潜在连接，它可能比首选方向更容易形成差异化机会。`;
}

function buildPossibilityFirstTry(item, parts, routeTitles = []) {
  const title = String(item?.title || item?.name || "").trim();
  if (parts.goalMode === "study") {
    return `先判断 ${title} 更看重哪类课程、项目或研究兴趣，再补 1 条最能支撑它的申请动机。`;
  }
  return `先找 2 个 ${title} 的岗位说明，看你哪段经历最能直接对位。`;
}

function formatCatalogRoute(item, careerProfile, index, parts = buildOverviewFallbackParts(careerProfile)) {
  const title = String(item?.title || "").trim();
  const evidence = findItemEvidence(item, careerProfile, 2, parts.goalMode);
  return {
    label: item?.label || buildRouteLabelByIndex(index, [], parts.goalMode),
    title,
    why: buildRouteWhy(title, item, parts, evidence),
    risk: buildRouteRisk(title, item, parts, evidence),
    nextStep: buildRouteNextStep(title, item, parts, evidence),
  };
}

function buildCatalogRouteCards(careerProfile, limit = 4, parts = buildOverviewFallbackParts(careerProfile)) {
  const ranked = rankGoalLibraryItems(careerProfile, parts.goalMode, Math.max(limit, 4));
  const routeTitles = [];
  const items = [];
  for (const item of ranked) {
    const title = normalizeDirectionTitle(item?.title);
    if (!isUsefulTextValue(title) || routeTitles.includes(title)) continue;
    routeTitles.push(title);
    items.push(formatCatalogRoute(item, careerProfile, items.length, parts));
    if (items.length >= limit) break;
  }
  return items;
}

function buildCatalogPossibilities(careerProfile, limit = 2, parts = buildOverviewFallbackParts(careerProfile), routeTitles = buildCatalogRouteCards(careerProfile, 4, parts).map((item) => item.title)) {
  const ranked = rankGoalLibraryItems(careerProfile, parts.goalMode, Math.max(limit + 4, 6));
  const items = [];
  for (const item of ranked) {
    const title = normalizeDirectionTitle(item?.title || item?.name);
    if (!isDistinctPossibilityTitle(title, routeTitles)) continue;
    items.push({
      title,
      reason: buildPossibilityReason(item, parts, routeTitles),
      firstTry: buildPossibilityFirstTry(item, parts, routeTitles),
    });
    if (items.length >= limit) break;
  }
  return items;
}

function findGoalLibraryItemByTitle(title, goalMode = "career") {
  const normalized = normalizeDirectionTitle(title);
  if (!normalized) return null;
  return getGoalLibraryItems(goalMode).find((item) => {
    const candidates = [
      item?.title,
      item?.name,
      ...(Array.isArray(item?.aliases) ? item.aliases : []),
    ];
    return candidates.some((candidate) => normalizeDirectionTitle(candidate) === normalized);
  }) || null;
}

function buildCompactVerdict(item, parts, kind = "direction", index = 0) {
  if (kind === "route") {
    const label = String(item?.label || "").trim();
    if (parts.goalMode === "study") {
      if (label === "最匹配背景线") return "对口";
      if (label === "最稳妥申请线") return "稳妥";
      if (label === "跨学科转向线") return "跨界";
      if (label === "长期潜力线") return "潜力";
    } else {
      if (label === "最高薪路线") return "高薪";
      if (label === "最快上岸路线") return "务实";
      if (label === "最轻松路线") return "低阻";
      if (label === "均衡路线") return "均衡";
    }
  }

  if (kind === "possibility") {
    return parts.goalMode === "study"
      ? (index === 0 ? "补充" : "拓展")
      : (index === 0 ? "补充" : "隐藏");
  }

  return index === 0 ? "对口" : index === 1 ? "可转" : "潜力";
}

function buildCompactWhatItIs(title, parts) {
  const libraryItem = findGoalLibraryItemByTitle(title, parts.goalMode);
  if (isUsefulTextValue(libraryItem?.whatItIs)) return String(libraryItem.whatItIs).trim();
  if (isUsefulTextValue(libraryItem?.summary)) return String(libraryItem.summary).trim();

  if (parts.goalMode === "study") {
    if (/商业分析/.test(title)) return "这个方向主要学商业决策、数据分析和业务问题拆解。";
    if (/(教育|学习设计|教育技术)/.test(title)) return "这个方向主要研究学习过程、课程设计和教育技术应用。";
    if (/心理/.test(title)) return "这个方向主要研究行为、认知与用户或学习动机。";
    if (/管理/.test(title)) return "这个方向主要研究组织管理、运营决策和商业协同。";
    if (/公共政策/.test(title)) return "这个方向主要研究公共问题、政策分析和治理设计。";
    if (/数据科学/.test(title)) return "这个方向主要研究数据建模、统计方法和技术应用。";
    return "这个方向主要看课程基础、项目表达和长期研究兴趣。";
  }

  if (/(产品运营|用户增长)/.test(title)) return "这个方向主要做用户增长、转化优化和产品运营策略。";
  if (/(用户研究|产品研究)/.test(title)) return "这个方向主要做用户洞察、研究设计和产品决策支持。";
  if (/(数据分析|数据治理)/.test(title)) return "这个方向主要做数据分析、指标体系和数据质量治理。";
  if (/(商业分析|策略分析)/.test(title)) return "这个方向主要做业务判断、策略拆解和决策支持。";
  if (/(教育产品|学习设计)/.test(title)) return "这个方向主要做学习体验、课程产品和教学内容设计。";
  if (/(供应链|运营分析)/.test(title)) return "这个方向主要做流程优化、运营协同和效率分析。";
  if (/(行业研究|咨询分析)/.test(title)) return "这个方向主要做行业研究、结论提炼和策略建议。";
  return "这个方向主要看问题判断、信息处理和落地推进能力。";
}

function buildCompactWhyYou(title, item, parts, evidence = []) {
  const fitTerms = collectItemEvidenceTerms(item).slice(0, 2).join("、");
  const weakEvidencePool = uniqueNonEmpty([
    parts.basic.targetDirection,
    parts.basic.currentThought,
    parts.basic.targetGoal,
  ], 6);
  const filteredEvidence = evidence.filter((text) => {
    const value = String(text || "").trim();
    if (!value) return false;
    if (value === title) return false;
    if (weakEvidencePool.includes(value)) return false;
    return !weakEvidencePool.some((itemText) => String(itemText || "").includes(value));
  });
  const lead = filteredEvidence[0] || parts.topExperience?.evidence || parts.topSkill?.evidence || parts.topStrength?.evidence || parts.evidenceText;
  const extra = filteredEvidence[1] || "";
  const leadSnippet = compactEvidenceSnippet(lead);
  const extraSnippet = compactEvidenceSnippet(extra);
  if (parts.goalMode === "study") {
    if (leadSnippet && extraSnippet) return `你已有“${leadSnippet}”和“${extraSnippet}”，说明你和这个专业看重的 ${fitTerms || "课程基础与项目表达"} 不是从零开始。`;
    if (leadSnippet) return `你已有“${leadSnippet}”，它能支撑这个专业最看重的基础匹配和申请叙事。`;
    return `你现在和这个专业有相邻基础，但还需要更直接的课程、项目或动机证据。`;
  }
  if (leadSnippet && extraSnippet) return `你已有“${leadSnippet}”和“${extraSnippet}”，说明你和这个方向看重的 ${fitTerms || "分析与推进"} 不是从零开始。`;
  if (leadSnippet) return `你已有“${leadSnippet}”，它能支撑这个岗位最看重的基础能力与经验。`;
  return `你现在和这个方向有相邻基础，但还需要更直接的代表项目证据。`;
}

function buildCompactFutureValue(title, item, parts, kind = "direction") {
  const libraryItem = findGoalLibraryItemByTitle(title, parts.goalMode) || item;
  const label = String(item?.label || "").trim();
  if (isUsefulTextValue(libraryItem?.futureValueHint)) return String(libraryItem.futureValueHint).trim();
  if (kind === "route") {
    if (parts.goalMode === "study") {
      if (label === "最匹配背景线") return "这条线和你现有背景更对口，申请叙事通常更容易成立。";
      if (label === "最稳妥申请线") return "这条线申请阻力相对更低，更容易先拿到结果。";
      if (label === "跨学科转向线") return "这条线能打开跨学科机会，但也更需要解释转向逻辑。";
      if (label === "长期潜力线") return "这条线更看长期成长，后续行业延展空间通常更大。";
    } else {
      if (label === "最高薪路线") return "这条线薪资上限更高，后续也更容易走向更核心的业务岗位。";
      if (label === "最快上岸路线") return "这条线进入门槛相对更稳，更容易先拿到真实岗位反馈。";
      if (label === "最轻松路线") return "这条线转向阻力更小，适合先用已有经历完成过渡。";
      if (label === "均衡路线") return "这条线兼顾进入机会和后续成长，适合边做边收敛方向。";
    }
  }

  if (parts.goalMode === "study") {
    if (/商业分析/.test(title)) return "它的就业出口较清晰，能连接数据、策略和商业相关机会。";
    if (/(教育|学习设计|教育技术)/.test(title)) return "它既有教育行业机会，也能延展到学习产品和用户研究。";
    if (/心理/.test(title)) return "它后续可延展到用户研究、教育、健康和行为相关赛道。";
    if (/公共政策/.test(title)) return "它更适合想把社会议题、治理理解和职业出口连接起来的人。";
    if (/数据科学/.test(title)) return "它技术门槛更高，但长期行业需求和迁移空间也更大。";
    return "它通常比单一路径更有弹性，后续还能继续细分职业出口。";
  }

  if (/(产品运营|用户增长)/.test(title)) return "这个方向的岗位需求更广，后续也容易延展到增长和产品核心岗位。";
  if (/(用户研究|产品研究)/.test(title)) return "这个方向更能积累判断力，后续也能延展到策略和产品决策。";
  if (/(数据分析|数据治理)/.test(title)) return "这个方向的可迁移性很强，后续能连接策略、产品和 AI 相关机会。";
  if (/(商业分析|策略分析)/.test(title)) return "这个方向更看长期判断力积累，薪资上限和行业迁移空间都不错。";
  if (/(教育产品|学习设计)/.test(title)) return "这个方向兼顾行业场景和产品能力，后续也容易形成差异化。";
  return "这个方向通常能带来更稳定的行业机会，也方便后续再细分。";
}

function compactEvidenceSnippet(text, softLimit = 20) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  const sentence = value.split(/[。！？!?\n]/).find(Boolean) || value;
  const clauses = sentence.split(/[；;，,:：]/).map((item) => item.trim()).filter(Boolean);
  const preferred = clauses.find((item) => item.length <= softLimit) || clauses[0] || sentence;
  return preferred;
}

function polishCardSentence(text) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  return value
    .replace(/，{2,}/g, "，")
    .replace(/。{2,}/g, "。")
    .replace(/\s*。\s*$/g, "。");
}

function buildCompactCard(item, parts, kind = "direction", index = 0) {
  const title = String(item?.title || "").trim();
  const evidence = findItemEvidence(item, parts.careerProfile, 2, parts.goalMode);
  return {
    ...item,
    verdict: buildCompactVerdict(item, parts, kind, index),
    whatItIs: polishCardSentence(buildCompactWhatItIs(title, parts)),
    whyYou: polishCardSentence(buildCompactWhyYou(title, item, parts, evidence)),
    futureValue: polishCardSentence(buildCompactFutureValue(title, item, parts, kind)),
  };
}

function mergeCompactCardFromSource(sourceItem, parts, kind = "direction", index = 0) {
  const source = sourceItem && typeof sourceItem === "object" ? sourceItem : {};
  const fallback = buildCompactCard(source, parts, kind, index);
  return {
    ...fallback,
    ...(kind === "route" && isUsefulTextValue(source.label) ? { label: String(source.label).trim() } : {}),
    title: String(source.title || fallback.title || "").trim(),
    verdict: isUsefulTextValue(source.verdict) ? String(source.verdict).trim() : fallback.verdict,
    whatItIs: polishCardSentence(pickUsefulText([
      source.whatItIs,
      source.summary,
      fallback.whatItIs,
    ], fallback.whatItIs)),
    whyYou: polishCardSentence(pickUsefulText([
      source.whyYou,
      source.explanation,
      source.reason,
      fallback.whyYou,
    ], fallback.whyYou)),
    futureValue: polishCardSentence(pickUsefulText([
      source.futureValue,
      source.firstTry,
      fallback.futureValue,
    ], fallback.futureValue)),
  };
}

function buildCatalogContext(careerProfile, moduleType = "career", limit = 6) {
  const library = loadCareerLibrary();
  const text = profileTexts(careerProfile);
  if (moduleType === "study") return rankLibraryItems(library.studyDirections, text, limit);
  if (moduleType === "ability") return rankLibraryItems(library.abilityAxes, text, limit);
  return rankLibraryItems(library.careerRoutes, text, Math.max(limit * 4, limit))
    .filter((item) => passesRoleGate(item?.title || item?.name, careerProfile))
    .slice(0, limit);
}

function uniqueNonEmpty(items, limit = 6) {
  const result = [];
  for (const item of items) {
    const text = String(item || "").trim();
    if (text && !result.includes(text)) result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function normalizeDirectionTitle(text) {
  const value = String(text || "").trim();
  if (!value) return "";
  return value.length > 40 ? value.slice(0, 40) : value;
}

function buildDirectionCandidates(careerProfile, goalMode = inferGoalMode(careerProfile)) {
  const basic = careerProfile?.basic || {};
  const targetParts = String(basic.targetDirection || "")
    .split(/[、，,\/；;\n]/)
    .map(normalizeDirectionTitle)
    .filter(Boolean);
  const thoughtParts = extractDirectionAnchors(basic.currentThought || "").map(normalizeDirectionTitle).filter(Boolean);
  const rawSignals = goalMode === "study"
    ? (Array.isArray(careerProfile?.studySignals) ? careerProfile.studySignals : [])
    : (Array.isArray(careerProfile?.careerSignals) ? careerProfile.careerSignals : []);
  const signalParts = rawSignals.length
    ? rawSignals.flatMap((item) => extractDirectionAnchors(item).map(normalizeDirectionTitle)).filter(Boolean)
    : [];

  return uniqueNonEmpty([
    ...targetParts,
    ...thoughtParts,
    ...signalParts,
  ], 5);
}

const genericDirectionTokens = new Set([
  "方向",
  "岗位",
  "职业",
  "路径",
  "路线",
  "场景",
  "工作",
  "助理",
  "专员",
  "执行",
]);

function extractDirectionAnchors(text) {
  return uniqueNonEmpty(String(text || "")
    .split(/[、，,\/；;\n|]+/)
    .map((item) => item.trim())
    .map((item) => item.replace(/(岗位|方向|路线|路径|场景|职业|工作|岗|类岗位)$/g, "").trim())
    .filter((item) => item.length >= 2 && !genericDirectionTokens.has(item)), 6);
}

function buildDirectionSupportPool(careerProfile, goalMode = inferGoalMode(careerProfile)) {
  const basic = careerProfile?.basic || {};
  const experiences = Array.isArray(careerProfile?.experienceSummary) ? careerProfile.experienceSummary : [];
  const skills = Array.isArray(careerProfile?.skills) ? careerProfile.skills : [];
  const strengths = Array.isArray(careerProfile?.strengths) ? careerProfile.strengths : [];
  const careerSignals = Array.isArray(careerProfile?.careerSignals) ? careerProfile.careerSignals : [];
  const studySignals = Array.isArray(careerProfile?.studySignals) ? careerProfile.studySignals : [];
  const evidence = Array.isArray(careerProfile?.evidence) ? careerProfile.evidence : [];

  return uniqueNonEmpty([
    ...experiences.flatMap((item) => [item?.title, item?.evidence]),
    ...skills.flatMap((item) => [item?.name, item?.evidence]),
    ...strengths.flatMap((item) => [item?.name, item?.evidence]),
    ...evidence,
    ...(goalMode === "study" ? studySignals : careerSignals),
    basic.targetDirection,
    basic.currentThought,
    basic.targetGoal,
    basic.major,
  ], 80);
}

function findDirectionEvidence(title, careerProfile, limit = 2, goalMode = inferGoalMode(careerProfile)) {
  const anchors = extractDirectionAnchors(title);
  if (!anchors.length) return [];
  const pool = buildDirectionSupportPool(careerProfile, goalMode);
  const matches = [];

  for (const item of pool) {
    const text = String(item || "").trim();
    if (!text) continue;
    if (anchors.some((anchor) => text.includes(anchor))) {
      matches.push(text.length > 56 ? `${text.slice(0, 56)}...` : text);
    }
    if (matches.length >= limit) break;
  }

  return uniqueNonEmpty(matches, limit);
}


function buildRoleGateText(careerProfile) {
  return [
    profileTexts(careerProfile),
    ...buildDirectionSupportPool(careerProfile),
  ].join(" ").toLowerCase();
}

function textHasAny(text, terms = []) {
  const value = String(text || "").toLowerCase();
  return terms.some((term) => value.includes(String(term || "").toLowerCase()));
}

const roleGateRules = [
  {
    pattern: /(算法工程师|机器学习工程师|NLP 工程师|计算机视觉工程师|大模型工程师|AI 研究员|机器人算法工程师|飞控工程师)/,
    evidence: ["算法", "模型", "机器学习", "深度学习", "NLP", "自然语言", "计算机视觉", "Python", "代码", "编程", "数据建模", "论文", "科研", "竞赛", "数学", "统计", "计算机"],
  },
  {
    pattern: /(内容安全|内容审核|审核手册|热点风险|安全策略|平台治理)/,
    evidence: ["内容安全", "审核", "规则", "标准", "平台治理", "治理", "合规", "风控", "舆情", "热点", "公共事件", "社区", "政策", "质检", "申诉"],
  },
  {
    pattern: /(安全研发工程师|安全工程师|渗透测试工程师|安全运营分析师|数据安全顾问)/,
    evidence: ["安全", "网络", "攻防", "渗透", "系统", "代码", "编程", "计算机", "隐私", "数据安全", "合规", "风控", "应急"],
  },
  {
    pattern: /(产品经理|商业化产品经理|安全产品经理|技术产品经理|AI 产品经理|机器人产品经理|汽车产品经理|无人机产品经理)/,
    evidence: ["产品", "需求", "用户", "体验", "原型", "项目", "平台", "商业化", "计算机", "开发", "技术", "创业", "增长", "运营"],
  },
  {
    pattern: /(技术创业者|创业)/,
    evidence: ["创业", "商业模式", "用户", "产品", "项目", "融资", "市场", "客户", "计算机", "开发", "技术", "竞赛"],
  },
  {
    pattern: /(精算师)/,
    evidence: ["精算", "保险", "数学", "统计", "概率", "风险模型", "金融工程", "建模"],
  },
  {
    pattern: /(高校讲师|副教授|教授|助理研究员|副研究员|研究员|企业研究院研究员)/,
    evidence: ["论文", "科研", "课题", "实验", "研究", "发表", "基金", "博士", "硕士", "专利", "报告"],
  },
  {
    pattern: /(法官|检察官|诉讼律师|非诉律师|并购律师|国际法律师|商法律师|律师)/,
    evidence: ["法律", "法学", "律师", "法院", "检察", "司法", "合同", "诉讼", "非诉", "并购", "合规", "法考", "案例"],
  },
];

function passesRoleGate(title, careerProfile) {
  const value = String(title || "").trim();
  if (!value) return false;
  const rule = roleGateRules.find((item) => item.pattern.test(value));
  if (!rule) return true;
  return textHasAny(buildRoleGateText(careerProfile), rule.evidence);
}

function hasDirectionSupport(title, careerProfile, goalMode = inferGoalMode(careerProfile)) {
  return passesRoleGate(title, careerProfile) && findDirectionEvidence(title, careerProfile, 1, goalMode).length > 0;
}

function ensureSectionNotice(report, key, message) {
  if (!isUsefulTextValue(message)) return;
  report.meta = report.meta && typeof report.meta === "object" ? report.meta : {};
  report.meta.sectionNotices = report.meta.sectionNotices && typeof report.meta.sectionNotices === "object"
    ? report.meta.sectionNotices
    : {};
  report.meta.sectionNotices[key] = message;
}

function buildDirectionExplanation(title, parts, index = 0) {
  const {
    careerProfile,
    coreAbility,
    missing,
  } = parts;
  const text = String(title || "").trim();
  if (!text) return "";
  const evidenceSnippets = findDirectionEvidence(text, careerProfile, 2, parts.goalMode);
  if (!evidenceSnippets.length) return "";
  if (parts.goalMode === "study") {
    const missingTip = missing[index] ? `后续补充“${missing[index]}”，申请判断会更稳。` : "后续用一条课程、项目或动机证据验证申请匹配度。";
    return `和“${text}”最相关的简历证据是：${evidenceSnippets.join("；")}。它更像在证明你与这个专业相关的申请基础，但还需要一条更直接的课程、项目或动机证据。${missingTip}`;
  }
  const missingTip = missing[index] ? `后续补充“${missing[index]}”，判断会更稳。` : "后续用一个代表项目验证匹配强度。";
  return `和“${text}”最相关的简历证据是：${evidenceSnippets.join("；")}。它更像在证明你的${coreAbility}，但还需要一个直接对应岗位要求的案例。${missingTip}`;
}

function isRepeatedDirectionExplanation(items, index) {
  const current = String(items[index]?.explanation || "").replace(/\d+/g, "").trim();
  if (!current) return false;
  if (/适合作为第\s*\d+\s*个验证方向|建议先用\s*1\s*个项目证据验证匹配强度/.test(String(items[index]?.explanation || ""))) return true;
  return items.some((item, otherIndex) => {
    if (otherIndex === index) return false;
    const other = String(item?.explanation || "").replace(/\d+/g, "").trim();
    return other && other === current;
  });
}

function buildOverviewFallbackParts(careerProfile) {
  const basic = careerProfile?.basic || {};
  const goalMode = inferGoalMode(careerProfile);
  const modeCopy = getGoalModeCopy(goalMode);
  const strengths = Array.isArray(careerProfile?.strengths) ? careerProfile.strengths : [];
  const weaknesses = Array.isArray(careerProfile?.weaknesses) ? careerProfile.weaknesses : [];
  const skills = Array.isArray(careerProfile?.skills) ? careerProfile.skills : [];
  const experiences = Array.isArray(careerProfile?.experienceSummary) ? careerProfile.experienceSummary : [];
  const evidence = Array.isArray(careerProfile?.evidence) ? careerProfile.evidence : [];
  const expressionProblems = Array.isArray(careerProfile?.expressionProblems) ? careerProfile.expressionProblems : [];
  const missing = Array.isArray(careerProfile?.missingInformation) ? careerProfile.missingInformation : [];
  const abilitySignals = Array.isArray(careerProfile?.abilitySignals) ? careerProfile.abilitySignals : [];
  const directions = buildDirectionCandidates(careerProfile, goalMode);
  const topStrength = firstItem(strengths);
  const topWeakness = firstItem(weaknesses);
  const topSkill = firstItem(skills);
  const topExperience = firstItem(experiences);
  const evidenceText = pickUsefulText([
    topStrength.evidence,
    topExperience.evidence,
    evidence[0],
    topSkill.evidence,
  ], "目前需要补充一个最能代表你的项目，说明任务、动作和结果。");
  const expressionGap = pickUsefulText([
    expressionProblems[0],
    topWeakness.evidence,
    missing[0] ? `缺少“${missing[0]}”，招聘方难以判断能力强度。` : "",
  ], "简历需要把经历改写成目标、判断、动作、结果，减少只罗列经历。");
  const coreAbility = pickUsefulText([
    topStrength.name,
    abilitySignals[0],
    topSkill.name ? `${topSkill.name}应用能力` : "",
  ], "经历结构化表达与方向验证能力");
  const score = Math.max(1, Math.min(10,
    4
    + Math.min(2, skills.length ? 1 : 0)
    + Math.min(2, strengths.length ? 1 : 0)
    + (evidence.length >= 3 ? 1 : 0)
    - (missing.length >= 4 ? 1 : 0)
  ));

  return {
    careerProfile,
    goalMode,
    modeCopy,
    basic,
    strengths,
    weaknesses,
    skills,
    evidence,
    expressionProblems,
    missing,
    abilitySignals,
    directions,
    topStrength,
    topWeakness,
    topSkill,
    topExperience,
    evidenceText,
    expressionGap,
    coreAbility,
    score,
  };
}

function buildNewPossibilityFallbacks(parts) {
  const routeTitles = [];
  const catalogAlternatives = buildCatalogPossibilities(parts.careerProfile, 3, parts, routeTitles);
  if (catalogAlternatives.length) return catalogAlternatives;
  if (parts.goalMode === "study") {
    return [
      {
        title: "教育技术",
        reason: "如果你既关心内容表达，也在意结构化设计，教育技术可能比泛商科更容易讲清你的申请逻辑。",
        firstTry: "先判断自己更靠近课程设计、学习产品还是教育数据，再补 1 条相关动机。",
      },
      {
        title: "公共政策",
        reason: "如果你的经历里有治理、规则、协调或社会议题线索，公共政策可能是一个被忽略但合理的申请方向。",
        firstTry: "先写清你最关心的公共问题，以及哪段经历让你走到这里。",
      },
    ];
  }
  return [
    {
      title: "用户研究 / 产品研究",
      reason: "如果你的优势不只是执行，而是观察、判断和抽象总结，研究型岗位可能比纯运营更适合你。",
      firstTry: "先找 2 个用户研究相关岗位说明，看你的哪段经历最能直接对位。",
    },
    {
      title: "行业研究 / 咨询分析",
      reason: "如果你擅长把信息压缩成判断和建议，这类路径可能比直奔通用运营更能放大你的优势。",
      firstTry: "先挑 1 段最能体现判断过程的经历，改写成研究结论 + 证据链。",
    },
  ];
}

function ensureOverviewFields(report, careerProfile) {
  const safeReport = report && typeof report === "object" ? report : {};
  const parts = buildOverviewFallbackParts(careerProfile);
  const {
    goalMode,
    modeCopy,
    basic,
    strengths,
    weaknesses,
    skills,
    evidence,
    expressionProblems,
    missing,
    abilitySignals,
    directions,
    topStrength,
    topWeakness,
    topSkill,
    topExperience,
    evidenceText,
    expressionGap,
    coreAbility,
    score,
  } = parts;

  const identitySnapshot = ensureObjectField(safeReport, "identitySnapshot");
  setTextIfMissing(safeReport, identitySnapshot, "who", pickUsefulText([
    topStrength.name ? `一个正在把“${topStrength.name}”转成职业资产的人` : "",
    basic.major ? `一个有${basic.major}背景、正在重新确认方向的人` : "",
  ], "一个需要把经历重新翻译成职业资产的人"), "identitySnapshot.who");
  setTextIfMissing(safeReport, identitySnapshot, "destination", pickUsefulText([
    basic.targetDirection,
    basic.targetGoal,
    directions[0],
  ], "先找到一个可验证的小方向，再逐步扩大选择面"), "identitySnapshot.destination");
  setTextIfMissing(safeReport, identitySnapshot, "stage", pickUsefulText([
    topWeakness.name ? `已有一些经历证据，但“${topWeakness.name}”仍需要补齐` : "",
    expressionProblems[0],
  ], "处在从经历整理走向方向验证的阶段"), "identitySnapshot.stage");

  if (!isUsefulTextValue(safeReport.comfortIntro)) {
    safeReport.comfortIntro = "你不是没有方向，只是需要把已有经历翻译成更清楚的职业资产。";
    markFilled(safeReport, "comfortIntro");
  }

  const diagnosis = ensureObjectField(safeReport, "capabilityDiagnosis");
  setTextIfMissing(safeReport, diagnosis, "coreAbility", coreAbility, "capabilityDiagnosis.coreAbility");
  setTextIfMissing(safeReport, diagnosis, "evidence", evidenceText, "capabilityDiagnosis.evidence");
  setTextIfMissing(safeReport, diagnosis, "expressionGap", expressionGap, "capabilityDiagnosis.expressionGap");
  setTextIfMissing(safeReport, diagnosis, "nextProof", "补一个代表项目：目标是什么、你怎么判断、采取了什么动作、最后有什么结果。", "capabilityDiagnosis.nextProof");

  const peerScore = ensureObjectField(safeReport, "peerScore");
  const rawScore = Number(peerScore.score);
  if (!Number.isFinite(rawScore) || rawScore <= 0) {
    peerScore.score = score;
    markFilled(safeReport, "peerScore.score");
  } else {
    peerScore.score = Math.max(1, Math.min(10, rawScore));
  }
  setTextIfMissing(safeReport, peerScore, "explanation", [
    `你已经积累了可以被转化的职业资产：优势证据 ${strengths.length} 项，技能证据 ${skills.length} 项。`,
    missing.length ? `如果再补充${missing.slice(0, 2).join("、")}，这份评分会更准确。` : "后续只要把代表项目讲清楚，职业画像会更立体。",
  ].join(""), "peerScore.explanation");

  const sceneTargets = directions.length ? directions : [goalMode === "study" ? "待进一步验证的申请方向" : "待进一步验证的岗位场景"];
  const abilityDefaults = [
    {
      name: `${pickUsefulText([topSkill.name, abilitySignals[0], "结构化分析"], "结构化分析")}能力`,
      currentEvidence: pickUsefulText([topSkill.evidence, evidence[0], evidenceText], evidenceText),
      usableScenes: goalMode === "study"
        ? `可用于申请 ${sceneTargets[0]} 时的信息整理、问题拆解和项目表达。`
        : `可用于${sceneTargets[0]}中的信息整理、问题拆解和结果复盘。`,
    },
    {
      name: `${pickUsefulText([topStrength.name, abilitySignals[1], "问题判断"], "问题判断")}能力`,
      currentEvidence: pickUsefulText([topStrength.evidence, evidence[1], expressionGap], expressionGap),
      usableScenes: goalMode === "study"
        ? `可用于申请 ${sceneTargets[1] || sceneTargets[0]} 时的方向判断、申请叙事和项目取舍。`
        : `可用于${sceneTargets[1] || sceneTargets[0]}中的需求判断、风险识别和方案选择。`,
    },
    {
      name: "经历转译与跨场景迁移能力",
      currentEvidence: pickUsefulText([topExperience.title, evidence[2], goalMode === "study" ? "已有经历需要进一步转译成申请语言。" : "已有经历需要进一步转译成岗位语言。"], goalMode === "study" ? "已有经历需要进一步转译成申请语言。" : "已有经历需要进一步转译成岗位语言。"),
      usableScenes: goalMode === "study"
        ? `可用于${sceneTargets[2] || sceneTargets[0]}的申请文书、面试叙事和方向匹配。`
        : `可用于${sceneTargets[2] || sceneTargets[0]}的简历表达、面试叙事和岗位匹配。`,
    },
  ];
  safeReport.abilityFields = Array.isArray(safeReport.abilityFields) ? safeReport.abilityFields.slice(0, 3) : [];
  while (safeReport.abilityFields.length < 3) safeReport.abilityFields.push({});
  safeReport.abilityFields = safeReport.abilityFields.map((item, index) => {
    const safeItem = item && typeof item === "object" ? item : {};
    const preset = abilityDefaults[index];
    setTextIfMissing(safeReport, safeItem, "name", preset.name.replace(/能力能力$/, "能力"), `abilityFields.${index}.name`);
    setTextIfMissing(safeReport, safeItem, "currentEvidence", preset.currentEvidence, `abilityFields.${index}.currentEvidence`);
    setTextIfMissing(safeReport, safeItem, "usableScenes", preset.usableScenes, `abilityFields.${index}.usableScenes`);
    return safeItem;
  });

  const perspective = ensureObjectField(safeReport, "perspectiveUpgrade");
  setTextIfMissing(safeReport, perspective, "currentLayer", "当前更像执行到战术之间：有经历和动作，但还需要说清目标、判断和取舍。", "perspectiveUpgrade.currentLayer");
  setTextIfMissing(safeReport, perspective, "nextLayer", "下一层是从完成任务升级为设计打法：解释为什么做、如何布局、如何验证结果。", "perspectiveUpgrade.nextLayer");
  setTextIfMissing(safeReport, perspective, "example", pickUsefulText([
    evidence[0] ? `把“${evidence[0]}”拆成目标、对象、动作和结果。` : "",
    topExperience.title ? `把“${topExperience.title}”改写成目标、动作、结果三段。` : "",
  ], "不要只写做过什么，要说明这件事想解决什么问题、怎么判断、结果如何。"), "perspectiveUpgrade.example");

  const catalogRoutes = buildCatalogRouteCards(careerProfile, 4, parts);
  const sourceDirections = Array.isArray(safeReport.suitableDirections) ? safeReport.suitableDirections.slice(0, 6) : [];
  const supportedDirections = [];
  for (const item of sourceDirections) {
    const safeItem = item && typeof item === "object" ? item : {};
    const title = normalizeDirectionTitle(safeItem.title);
    if (!isUsefulTextValue(title) || !isGoalModeCompatibleTitle(title, goalMode) || !hasDirectionSupport(title, careerProfile, goalMode)) continue;
    if (supportedDirections.some((entry) => entry.title === title)) continue;
    supportedDirections.push({
      ...safeItem,
      title,
      explanation: isUsefulTextValue(safeItem.explanation) && !containsOverviewBoilerplate(safeItem.explanation)
        ? String(safeItem.explanation).trim()
        : buildDirectionExplanation(title, parts, supportedDirections.length),
    });
    if (supportedDirections.length >= 3) break;
  }
  if (supportedDirections.length < 3) {
    const routeTitles = supportedDirections.map((item) => item.title);
    for (const item of catalogRoutes) {
      if (supportedDirections.length >= 3) break;
      if (!item?.title || routeTitles.includes(item.title)) continue;
      supportedDirections.push({
        ...item,
        title: item.title,
        explanation: buildDirectionExplanationFromRouteItem(item, parts, item.title),
      });
      routeTitles.push(item.title);
    }
  }
  safeReport.suitableDirections = supportedDirections.map((item, index) => mergeCompactCardFromSource(item, parts, "direction", index));

  const sourceRoutes = Array.isArray(safeReport.routeCards) ? safeReport.routeCards.slice(0, 6) : [];
  const supportedRoutes = [];
  for (const item of sourceRoutes) {
    const safeItem = item && typeof item === "object" ? item : {};
    const title = normalizeDirectionTitle(safeItem.title);
    if (!isUsefulTextValue(title) || isGenericRouteTitle(title) || !isGoalModeCompatibleTitle(title, goalMode) || !hasDirectionSupport(title, careerProfile, goalMode)) continue;
    const usedLabels = supportedRoutes.map((entry) => entry.label).filter(Boolean);
    const preferredLabel = normalizeRouteLabel(safeItem.label, goalMode);
    supportedRoutes.push({
      ...safeItem,
      label: preferredLabel && !usedLabels.includes(preferredLabel)
        ? preferredLabel
        : buildRouteLabelByIndex(supportedRoutes.length, usedLabels, goalMode),
      title,
    });
    if (supportedRoutes.length >= 4) break;
  }
  if (supportedRoutes.length < 4) {
    const routeTitles = supportedRoutes.map((item) => item.title);
    for (const item of catalogRoutes) {
      if (supportedRoutes.length >= 4) break;
      if (!item?.title || routeTitles.includes(item.title)) continue;
      const usedLabels = supportedRoutes.map((entry) => entry.label).filter(Boolean);
      supportedRoutes.push({
        ...item,
        label: buildRouteLabelByIndex(supportedRoutes.length, usedLabels, goalMode),
      });
      routeTitles.push(item.title);
    }
  }
  safeReport.routeCards = supportedRoutes.map((item, index) => mergeCompactCardFromSource(item, parts, "route", index));

  const sourcePossibilities = Array.isArray(safeReport.newPossibilities) ? safeReport.newPossibilities.slice(0, 4) : [];
  const routeTitles = (safeReport.routeCards || []).map((item) => item?.title).filter(Boolean);
  const normalizedPossibilities = sourcePossibilities
    .map((item) => (item && typeof item === "object" ? item : {}))
    .filter((item) => {
      if (!isUsefulTextValue(item.title)) return false;
      if (!isGoalModeCompatibleTitle(item.title, goalMode)) return false;
      if (!hasDirectionSupport(item.title, careerProfile, goalMode)) return false;
      return isDistinctPossibilityTitle(item.title, routeTitles);
    })
    .map((item) => ({
      ...item,
      title: normalizeDirectionTitle(item.title),
      reason: containsOverviewBoilerplate(item.reason) ? buildPossibilityReason(item, parts, routeTitles) : String(item.reason || "").trim(),
      firstTry: containsOverviewBoilerplate(item.firstTry) ? buildPossibilityFirstTry(item, parts, routeTitles) : String(item.firstTry || "").trim(),
    }))
    .slice(0, 2);
  safeReport.newPossibilities = normalizedPossibilities;
  if (safeReport.newPossibilities.length < 2) {
    const catalogPossibilities = buildCatalogPossibilities(careerProfile, 2, parts, routeTitles);
    for (const item of catalogPossibilities) {
      if (safeReport.newPossibilities.length >= 2) break;
      if (!isDistinctPossibilityTitle(item.title, routeTitles)) continue;
      if (safeReport.newPossibilities.some((entry) => entry.title === item.title)) continue;
      safeReport.newPossibilities.push(item);
    }
  }
  if (safeReport.newPossibilities.length < 2) {
    safeReport.newPossibilities = buildNewPossibilityFallbacks(parts)
      .filter((item) => isDistinctPossibilityTitle(item.title, routeTitles))
      .slice(0, 2);
  }
  safeReport.newPossibilities = safeReport.newPossibilities.map((item, index) => mergeCompactCardFromSource(item, parts, "possibility", index));

  const shortcomings = ensureObjectField(safeReport, "shortcomings");
  setTextIfMissing(safeReport, shortcomings, "summary", "当前最大短板不是经历少，而是经历和能力之间的证据链还不够清楚。", "shortcomings.summary");
  const shortcomingItems = uniqueNonEmpty([
    ...expressionProblems,
    ...weaknesses.map((item) => pickUsefulText([item?.evidence, item?.name], "")),
    ...missing.map((item) => goalMode === "study"
      ? `缺少${item}，会影响申请匹配和方向判断。`
      : `缺少${item}，会影响岗位匹配和评分判断。`),
    "需要补充量化结果、个人贡献和复盘结论。",
  ], 3);
  shortcomings.items = Array.isArray(shortcomings.items) ? shortcomings.items.filter(isUsefulTextValue).slice(0, 3) : [];
  while (shortcomings.items.length < Math.min(3, shortcomingItems.length)) {
    const next = shortcomingItems[shortcomings.items.length];
    if (next) {
      shortcomings.items.push(next);
      markFilled(safeReport, `shortcomings.items.${shortcomings.items.length - 1}`);
    } else {
      break;
    }
  }

  const advice = ensureObjectField(safeReport, "improvementAdvice");
  setTextIfMissing(safeReport, advice, "mostNeededAbility", `最需要补的是把${coreAbility}写成可验证证据的能力。`, "improvementAdvice.mostNeededAbility");
  setTextIfMissing(safeReport, advice, "missingExperience", pickUsefulText([
    missing[0] ? `最缺“${missing[0]}”相关证据。` : "",
    "最缺一个能说明个人贡献、判断过程和结果变化的代表项目。",
  ], "最缺一个能说明个人贡献、判断过程和结果变化的代表项目。"), "improvementAdvice.missingExperience");
  setTextIfMissing(safeReport, advice, "shortAdvice", goalMode === "study"
    ? "先重写一个申请案例，再用目标专业的课程/项目要求检查叙事是否对齐。"
    : "先重写一个项目案例，再用目标岗位 JD 检查能力词是否对齐。", "improvementAdvice.shortAdvice");

  if (!isUsefulTextValue(safeReport.closingEncouragement)) {
    safeReport.closingEncouragement = "先不用一次选对，把一个方向验证清楚，焦虑会随着证据增加而下降。";
    markFilled(safeReport, "closingEncouragement");
  }

  const leadingDirection = directions[0] || modeCopy.directionObject;
  const moduleDefaults = goalMode === "study"
    ? [
      { module: "study", reason: isUsefulTextValue(directions[0]) ? `继续拆 ${leadingDirection} 等专业的匹配度和申请路径。` : "继续拆专业匹配度和申请路径。", suggestedQuestion: "我适合申请哪些专业方向，为什么？" },
      { module: "career", reason: "如果你也关心毕业后的职业出口，需要把专业选择和职业路径连接起来。", suggestedQuestion: "这些专业分别会通向哪些工作方向？" },
      { module: "ability", reason: `把${coreAbility}、短板和训练任务拆成可执行能力地图。`, suggestedQuestion: "我最该补哪几项能力？" },
    ]
    : [
      { module: "career", reason: isUsefulTextValue(directions[0]) ? `继续拆${leadingDirection}等岗位的匹配度和进入路径。` : "继续拆岗位匹配度和进入路径。", suggestedQuestion: "我应该优先投哪些岗位，为什么？" },
      { module: "study", reason: "如果考虑留学或转专业，需要把职业目标和专业选择连接起来。", suggestedQuestion: "我适合申请哪些专业方向？" },
      { module: "ability", reason: `把${coreAbility}、短板和训练任务拆成可执行能力地图。`, suggestedQuestion: "我最该补哪几项能力？" },
    ];
  safeReport.moduleRecommendations = Array.isArray(safeReport.moduleRecommendations) ? safeReport.moduleRecommendations.slice(0, 3) : [];
  while (safeReport.moduleRecommendations.length < 3) safeReport.moduleRecommendations.push({});
  safeReport.moduleRecommendations = safeReport.moduleRecommendations.map((item, index) => {
    const safeItem = item && typeof item === "object" ? item : {};
    const preset = moduleDefaults[index];
    safeItem.module = ["career", "study", "ability"].includes(safeItem.module) ? safeItem.module : preset.module;
    setTextIfMissing(safeReport, safeItem, "reason", preset.reason, `moduleRecommendations.${index}.reason`);
    setTextIfMissing(safeReport, safeItem, "suggestedQuestion", preset.suggestedQuestion, `moduleRecommendations.${index}.suggestedQuestion`);
    return safeItem;
  });

  safeReport.meta = safeReport.meta && typeof safeReport.meta === "object" ? safeReport.meta : {};
  safeReport.meta.goalMode = goalMode;
  safeReport.meta.sectionCopy = {
    directionHeading: modeCopy.directionHeading,
    routeHeading: modeCopy.routeHeading,
    possibilityHeading: modeCopy.possibilityHeading,
    possibilityStepLabel: modeCopy.possibilityStepLabel,
  };

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

function getOverviewLayerConfig(layerType) {
  if (layerType === "paths") {
    return {
      getSystemPrompt: buildOverviewPathSystemPrompt,
      getContract: buildOverviewPathJsonContract,
      getCompactContract: buildCompactOverviewPathJsonContract,
      buildPrompt: buildOverviewPathPrompt,
      buildCompactPrompt: buildCompactOverviewPathPrompt,
      maxTokens: OVERVIEW_PATH_MAX_TOKENS,
      compactMaxTokens: Math.min(OVERVIEW_PATH_MAX_TOKENS, 700),
      timeoutMs: OVERVIEW_PATH_TIMEOUT_MS,
      repairTimeoutMs: OVERVIEW_PATH_REPAIR_TIMEOUT_MS,
      temperature: 0.2,
      compactTemperature: 0.1,
    };
  }

  return {
    getSystemPrompt: () => overviewDiagnosisSystemPrompt,
    getContract: () => overviewDiagnosisJsonContract,
    getCompactContract: () => compactOverviewDiagnosisJsonContract,
    buildPrompt: buildOverviewDiagnosisPrompt,
    buildCompactPrompt: buildCompactOverviewDiagnosisPrompt,
    maxTokens: OVERVIEW_DIAGNOSIS_MAX_TOKENS,
    compactMaxTokens: Math.min(OVERVIEW_DIAGNOSIS_MAX_TOKENS, 640),
    timeoutMs: OVERVIEW_DIAGNOSIS_TIMEOUT_MS,
    repairTimeoutMs: OVERVIEW_DIAGNOSIS_REPAIR_TIMEOUT_MS,
    temperature: 0.15,
    compactTemperature: 0.08,
  };
}

async function runOverviewLayer(layerType, careerProfile, goalMode = inferGoalMode(careerProfile), extras = {}) {
  const config = getOverviewLayerConfig(layerType);
  const primaryBody = buildJsonCompletionBody({
    systemPrompt: config.getSystemPrompt(goalMode),
    contract: config.getContract(goalMode),
    userPrompt: config.buildPrompt(careerProfile, goalMode, "", extras),
    maxTokens: config.maxTokens,
    temperature: config.temperature,
  });

  try {
    const report = await callDeepSeekJsonWithTimeout(primaryBody, config.timeoutMs, config.repairTimeoutMs);
    return { report, meta: { layer: layerType, retryMode: "primary", ok: true } };
  } catch (primaryError) {
    try {
      const compactBody = buildJsonCompletionBody({
        systemPrompt: config.getSystemPrompt(goalMode),
        contract: config.getCompactContract(goalMode),
        userPrompt: config.buildCompactPrompt(careerProfile, goalMode, primaryError.message, extras),
        maxTokens: config.compactMaxTokens,
        temperature: config.compactTemperature,
      });
      const report = await callDeepSeekJsonWithTimeout(
        compactBody,
        Math.min(config.timeoutMs, 12000),
        Math.min(config.repairTimeoutMs, 4000)
      );
      return {
        report,
        meta: {
          layer: layerType,
          retryMode: "compact",
          ok: true,
          primaryError: primaryError.message,
        },
      };
    } catch (compactError) {
      return {
        report: {},
        meta: {
          layer: layerType,
          retryMode: "fallback",
          ok: false,
          primaryError: primaryError.message,
          compactError: compactError.message,
        },
      };
    }
  }
}

async function createOverviewReport(careerProfile, resumeText = "") {
  const goalMode = inferGoalMode(careerProfile);
  const hypothesisLayer = await createDirectionHypotheses(careerProfile, resumeText, goalMode);
  const [diagnosisLayer, pathLayer] = await Promise.all([
    runOverviewLayer("diagnosis", careerProfile, goalMode),
    runOverviewLayer("paths", careerProfile, goalMode, { hypotheses: hypothesisLayer.report, resumeText }),
  ]);

  const mergedReport = {
    ...(diagnosisLayer.report || {}),
    ...((pathLayer.meta?.ok ? pathLayer.report : hypothesisLayer.report) || {}),
    meta: {
      ...(diagnosisLayer.report?.meta || {}),
      ...(pathLayer.report?.meta || {}),
      layeredOverview: true,
      goalMode,
      directionHypotheses: hypothesisLayer.report || {},
      overviewLayers: {
        hypotheses: hypothesisLayer.meta,
        diagnosis: diagnosisLayer.meta,
        paths: pathLayer.meta,
      },
    },
  };

  const safeReport = ensureOverviewFields(mergedReport, careerProfile);
  safeReport.meta = {
    ...(safeReport.meta || {}),
    layeredOverview: true,
    goalMode,
    directionHypotheses: hypothesisLayer.report || {},
    overviewLayers: {
      hypotheses: hypothesisLayer.meta,
      diagnosis: diagnosisLayer.meta,
      paths: pathLayer.meta,
    },
    overviewRetryModes: {
      hypotheses: hypothesisLayer.meta?.retryMode || "primary",
      diagnosis: diagnosisLayer.meta?.retryMode || "primary",
      paths: pathLayer.meta?.retryMode || "primary",
    },
    layeredOverviewFailed: Boolean((diagnosisLayer.meta && !diagnosisLayer.meta.ok) && (pathLayer.meta && !pathLayer.meta.ok)),
  };
  return attachOverviewQualityMeta(safeReport);
}

function pickOverviewSectionReport(report, sectionType = "full") {
  const safe = report && typeof report === "object" ? cloneJson(report) : {};
  const meta = safe.meta && typeof safe.meta === "object" ? safe.meta : {};
  const common = {
    meta,
  };

  if (sectionType === "diagnosis") {
    return {
      ...common,
      identitySnapshot: safe.identitySnapshot || {},
      comfortIntro: safe.comfortIntro || "",
      capabilityDiagnosis: safe.capabilityDiagnosis || {},
      peerScore: safe.peerScore || {},
      abilityFields: Array.isArray(safe.abilityFields) ? safe.abilityFields : [],
      perspectiveUpgrade: safe.perspectiveUpgrade || {},
      shortcomings: safe.shortcomings || {},
      improvementAdvice: safe.improvementAdvice || {},
      closingEncouragement: safe.closingEncouragement || "",
    };
  }

  if (sectionType === "directions") {
    return {
      ...common,
      routeCards: Array.isArray(safe.routeCards) ? safe.routeCards : [],
      suitableDirections: Array.isArray(safe.suitableDirections) ? safe.suitableDirections : [],
      newPossibilities: Array.isArray(safe.newPossibilities) ? safe.newPossibilities : [],
      moduleRecommendations: Array.isArray(safe.moduleRecommendations) ? safe.moduleRecommendations : [],
    };
  }

  return safe;
}

async function createOverviewDiagnosisReport(careerProfile) {
  const goalMode = inferGoalMode(careerProfile);
  const diagnosisLayer = await runOverviewLayer("diagnosis", careerProfile, goalMode);
  const mergedReport = {
    ...(diagnosisLayer.report || {}),
    meta: {
      ...(diagnosisLayer.report?.meta || {}),
      layeredOverview: true,
      goalMode,
      overviewLayers: {
        diagnosis: diagnosisLayer.meta,
      },
    },
  };
  const safeReport = ensureOverviewFields(mergedReport, careerProfile);
  safeReport.meta = {
    ...(safeReport.meta || {}),
    layeredOverview: true,
    goalMode,
    overviewLayers: {
      diagnosis: diagnosisLayer.meta,
    },
    overviewRetryModes: {
      diagnosis: diagnosisLayer.meta?.retryMode || "primary",
    },
  };
  return pickOverviewSectionReport(attachOverviewQualityMeta(safeReport), "diagnosis");
}

async function createOverviewDirectionsReport(careerProfile, resumeText = "") {
  const goalMode = inferGoalMode(careerProfile);
  const hypothesisLayer = await createDirectionHypotheses(careerProfile, resumeText, goalMode);
  const pathLayer = await runOverviewLayer("paths", careerProfile, goalMode, { hypotheses: hypothesisLayer.report, resumeText });
  const mergedReport = {
    ...((pathLayer.meta?.ok ? pathLayer.report : hypothesisLayer.report) || {}),
    meta: {
      ...((pathLayer.meta?.ok ? pathLayer.report?.meta : hypothesisLayer.report?.meta) || {}),
      layeredOverview: true,
      goalMode,
      directionHypotheses: hypothesisLayer.report || {},
      overviewLayers: {
        hypotheses: hypothesisLayer.meta,
        paths: pathLayer.meta,
      },
    },
  };
  const safeReport = ensureOverviewFields(mergedReport, careerProfile);
  safeReport.meta = {
    ...(safeReport.meta || {}),
    layeredOverview: true,
    goalMode,
    directionHypotheses: hypothesisLayer.report || {},
    overviewLayers: {
      hypotheses: hypothesisLayer.meta,
      paths: pathLayer.meta,
    },
    overviewRetryModes: {
      hypotheses: hypothesisLayer.meta?.retryMode || "primary",
      paths: pathLayer.meta?.retryMode || "primary",
    },
    layeredOverviewFailed: Boolean((hypothesisLayer.meta && !hypothesisLayer.meta.ok) && (pathLayer.meta && !pathLayer.meta.ok)),
  };
  return pickOverviewSectionReport(attachOverviewQualityMeta(safeReport), "directions");
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

function buildDeterministicApplicationDraft(careerProfile, resumeText = "") {
  const safeProfile = careerProfile && typeof careerProfile === "object" ? careerProfile : {};
  const basic = safeProfile.basic || {};
  const experiences = Array.isArray(safeProfile.experienceSummary) ? safeProfile.experienceSummary : [];
  const strengths = Array.isArray(safeProfile.strengths) ? safeProfile.strengths : [];
  const skills = Array.isArray(safeProfile.skills) ? safeProfile.skills : [];
  const evidence = Array.isArray(safeProfile.evidence) ? safeProfile.evidence : [];
  const missingInformation = Array.isArray(safeProfile.missingInformation) ? safeProfile.missingInformation : [];
  const resumeFacts = extractResumeFacts(resumeText);
  const draft = {
    basicProfile: {
      fullName: normalizeText(resumeFacts.name, 80),
      email: normalizeText(resumeFacts.email, 120),
      phone: normalizeText(resumeFacts.phone, 80),
      oneLineIntro: buildApplicationOneLineIntro(safeProfile, resumeFacts),
      educationStage: normalizeText(basic.educationStage, 80),
      major: normalizeText(basic.major, 80),
      targetGoal: normalizeText(basic.targetGoal, 80),
      targetDirection: normalizeText(basic.targetDirection, 120),
      currentThought: normalizeText(basic.currentThought, 280),
      anxiety: normalizeText(basic.anxiety, 240),
      region: normalizeText(basic.region, 80),
      age: normalizeText(basic.age, 12),
    },
    educationEntries: extractResumeEducationEntries(resumeText, basic).map((item) => ({
      ...item,
      highlights: pickUsefulText([item.highlights, evidence.find((entry) => /(专业|学历|毕业|学位|学校)/.test(String(entry || "")))], ""),
    })),
    publicationEntries: extractResumePublicationEntries(resumeText),
    achievementEntries: uniqueNonEmpty([
      ...extractResumeAchievementEntries(resumeText).map((item) => JSON.stringify(item)),
      ...evidence.filter((item) => /(奖|证书|竞赛|荣誉|发表|论文|专利|作品|报告)/.test(String(item || ""))).map((item) => JSON.stringify({
        id: "",
        title: normalizeText(item, 120),
        type: /(论文|发表|专利|作品|报告)/.test(String(item || "")) ? "成果" : "荣誉",
        year: "",
        note: normalizeText(item, 200),
      })),
    ], 6).map((item, index) => {
      const parsed = JSON.parse(item);
      return {
        id: normalizeText(parsed.id, 40) || `ach_${index + 1}`,
        title: normalizeText(parsed.title, 120),
        type: normalizeText(parsed.type, 80),
        year: normalizeText(parsed.year, 40),
        note: normalizeText(parsed.note, 200),
      };
    }),
    experienceEntries: experiences.slice(0, 6).map((item, index) => ({
      id: `exp_${index + 1}`,
      title: normalizeText(item?.title, 120) || `经历 ${index + 1}`,
      evidence: normalizeText(item?.evidence, 200),
      polished: normalizeText(item?.evidence, 200),
      tags: uniqueNonEmpty([
        normalizeText(skills[index]?.name, 40),
        normalizeText(strengths[index]?.name, 40),
      ], 3),
    })),
    storyBank: strengths.slice(0, 6).map((item, index) => ({
      id: `story_${index + 1}`,
      title: normalizeText(item?.name, 120) || `故事 ${index + 1}`,
      situation: normalizeText(item?.evidence, 200),
      task: normalizeText(item?.evidence, 180),
      action: normalizeText(item?.evidence, 200),
      result: normalizeText(item?.evidence, 200),
      skills: uniqueNonEmpty([
        normalizeText(item?.name, 40),
        normalizeText(skills[index]?.name, 40),
      ], 4),
    })),
    applicationHints: {
      summary: "这是一版按你现有简历和职业画像直接整理出的可复制底稿，先填表，再慢慢打磨表达。",
      priorityModules: uniqueNonEmpty([
        !resumeFacts.name ? "先补姓名、邮箱、联系方式这类基础信息。" : "",
        "先确认学历、专业、时间线是否完整。",
        "把发表、作品、奖项这类成果单独列出来。",
        "先整理 1-2 段最能代表你的经历。",
        "把目标方向写得更具体，后面的表达会更稳。",
        "补一个能说明个人贡献和结果变化的项目故事。",
        "先把故事库里的场景、动作、结果写完整。",
      ], 4),
      missingProof: uniqueNonEmpty(missingInformation, 4),
    },
    meta: {
      mode: "structured_local",
      generatedAt: new Date().toISOString(),
    },
  };
  return draft;
}

function ensureApplicationDraftFields(draft, careerProfile, resumeText = "") {
  const fallback = buildDeterministicApplicationDraft(careerProfile, resumeText);
  const safeDraft = draft && typeof draft === "object" ? draft : {};
  const basicProfile = safeDraft.basicProfile && typeof safeDraft.basicProfile === "object" ? safeDraft.basicProfile : {};
  safeDraft.basicProfile = {
    fullName: isUsefulTextValue(basicProfile.fullName) ? normalizeText(basicProfile.fullName, 80) : fallback.basicProfile.fullName,
    email: isUsefulTextValue(basicProfile.email) ? normalizeText(basicProfile.email, 120) : fallback.basicProfile.email,
    phone: isUsefulTextValue(basicProfile.phone) ? normalizeText(basicProfile.phone, 80) : fallback.basicProfile.phone,
    oneLineIntro: isUsefulTextValue(basicProfile.oneLineIntro) ? normalizeText(basicProfile.oneLineIntro, 180) : fallback.basicProfile.oneLineIntro,
    educationStage: isUsefulTextValue(basicProfile.educationStage) ? normalizeText(basicProfile.educationStage, 80) : fallback.basicProfile.educationStage,
    major: isUsefulTextValue(basicProfile.major) ? normalizeText(basicProfile.major, 80) : fallback.basicProfile.major,
    targetGoal: isUsefulTextValue(basicProfile.targetGoal) ? normalizeText(basicProfile.targetGoal, 80) : fallback.basicProfile.targetGoal,
    targetDirection: isUsefulTextValue(basicProfile.targetDirection) ? normalizeText(basicProfile.targetDirection, 120) : fallback.basicProfile.targetDirection,
    currentThought: isUsefulTextValue(basicProfile.currentThought) ? normalizeText(basicProfile.currentThought, 280) : fallback.basicProfile.currentThought,
    anxiety: isUsefulTextValue(basicProfile.anxiety) ? normalizeText(basicProfile.anxiety, 240) : fallback.basicProfile.anxiety,
    region: isUsefulTextValue(basicProfile.region) ? normalizeText(basicProfile.region, 80) : fallback.basicProfile.region,
    age: isUsefulTextValue(basicProfile.age) ? normalizeText(basicProfile.age, 12) : fallback.basicProfile.age,
  };
  safeDraft.educationEntries = Array.isArray(safeDraft.educationEntries) && safeDraft.educationEntries.length
    ? safeDraft.educationEntries.slice(0, 4).map((item, index) => {
      const fallbackItem = fallback.educationEntries?.[index] || {};
      return {
        id: normalizeText(item?.id, 40) || fallbackItem.id || `edu_${index + 1}`,
        school: isUsefulTextValue(item?.school) ? normalizeText(item.school, 120) : (fallbackItem.school || ""),
        degree: isUsefulTextValue(item?.degree) ? normalizeText(item.degree, 80) : (fallbackItem.degree || ""),
        major: isUsefulTextValue(item?.major) ? normalizeText(item.major, 80) : (fallbackItem.major || ""),
        period: isUsefulTextValue(item?.period) ? normalizeText(item.period, 80) : (fallbackItem.period || ""),
        highlights: isUsefulTextValue(item?.highlights) ? normalizeText(item.highlights, 200) : (fallbackItem.highlights || ""),
      };
    })
    : (fallback.educationEntries || []);
  safeDraft.publicationEntries = Array.isArray(safeDraft.publicationEntries) && safeDraft.publicationEntries.length
    ? safeDraft.publicationEntries.slice(0, 4).map((item, index) => ({
      id: normalizeText(item?.id, 40) || `pub_${index + 1}`,
      title: normalizeText(item?.title, 120),
      type: normalizeText(item?.type, 80),
      venue: normalizeText(item?.venue, 80),
      year: normalizeText(item?.year, 40),
      note: normalizeText(item?.note, 200),
    }))
    : [];
  safeDraft.achievementEntries = Array.isArray(safeDraft.achievementEntries) && safeDraft.achievementEntries.length
    ? safeDraft.achievementEntries.slice(0, 6).map((item, index) => ({
      id: normalizeText(item?.id, 40) || `ach_${index + 1}`,
      title: normalizeText(item?.title, 120),
      type: normalizeText(item?.type, 80),
      year: normalizeText(item?.year, 40),
      note: normalizeText(item?.note, 200),
    }))
    : (fallback.achievementEntries || []);
  safeDraft.experienceEntries = Array.isArray(safeDraft.experienceEntries) && safeDraft.experienceEntries.length
    ? safeDraft.experienceEntries.slice(0, 6).map((item, index) => {
      const fallbackItem = fallback.experienceEntries[index] || {};
      return {
        id: normalizeText(item?.id, 40) || fallbackItem.id || `exp_${index + 1}`,
        title: isUsefulTextValue(item?.title) ? normalizeText(item.title, 120) : (fallbackItem.title || `经历 ${index + 1}`),
        evidence: isUsefulTextValue(item?.evidence) ? normalizeText(item.evidence, 240) : (fallbackItem.evidence || ""),
        polished: isUsefulTextValue(item?.polished)
          ? normalizeText(item.polished, 240)
          : (isUsefulTextValue(item?.evidence) ? normalizeText(item.evidence, 240) : (fallbackItem.polished || fallbackItem.evidence || "")),
        tags: uniqueNonEmpty([
          ...(Array.isArray(item?.tags) ? item.tags.map((tag) => normalizeText(tag, 40)) : []),
          ...(Array.isArray(fallbackItem.tags) ? fallbackItem.tags : []),
        ], 4),
      };
    })
    : fallback.experienceEntries;
  safeDraft.storyBank = Array.isArray(safeDraft.storyBank) && safeDraft.storyBank.length
    ? safeDraft.storyBank.slice(0, 8).map((item, index) => {
      const fallbackItem = fallback.storyBank[index] || {};
      const situation = isUsefulTextValue(item?.situation) ? normalizeText(item.situation, 240) : (fallbackItem.situation || "");
      return {
        id: normalizeText(item?.id, 40) || fallbackItem.id || `story_${index + 1}`,
        title: isUsefulTextValue(item?.title) ? normalizeText(item.title, 120) : (fallbackItem.title || `故事 ${index + 1}`),
        situation,
        task: isUsefulTextValue(item?.task) ? normalizeText(item.task, 180) : (fallbackItem.task || situation),
        action: isUsefulTextValue(item?.action) ? normalizeText(item.action, 240) : (fallbackItem.action || situation),
        result: isUsefulTextValue(item?.result) ? normalizeText(item.result, 240) : (fallbackItem.result || situation),
        skills: uniqueNonEmpty([
          ...(Array.isArray(item?.skills) ? item.skills.map((tag) => normalizeText(tag, 40)) : []),
          ...(Array.isArray(fallbackItem.skills) ? fallbackItem.skills : []),
        ], 5),
      };
    })
    : fallback.storyBank;
  safeDraft.applicationHints = safeDraft.applicationHints && typeof safeDraft.applicationHints === "object"
    ? safeDraft.applicationHints
    : fallback.applicationHints;
  if (!isUsefulTextValue(safeDraft.applicationHints.summary)) {
    safeDraft.applicationHints.summary = fallback.applicationHints.summary;
  }
  safeDraft.applicationHints.priorityModules = Array.isArray(safeDraft.applicationHints.priorityModules) && safeDraft.applicationHints.priorityModules.length
    ? safeDraft.applicationHints.priorityModules.filter(isUsefulTextValue).slice(0, 4)
    : fallback.applicationHints.priorityModules;
  safeDraft.applicationHints.missingProof = Array.isArray(safeDraft.applicationHints.missingProof) && safeDraft.applicationHints.missingProof.length
    ? safeDraft.applicationHints.missingProof.filter(isUsefulTextValue).slice(0, 4)
    : fallback.applicationHints.missingProof;
  safeDraft.meta = {
    ...(safeDraft.meta || {}),
    generatedAt: new Date().toISOString(),
  };
  return safeDraft;
}

async function createApplicationDraftReport(careerProfile, resumeText = "") {
  const report = await callDeepSeekJson(buildJsonCompletionBody({
    systemPrompt: applicationSystemPrompt,
    contract: applicationJsonContract,
    userPrompt: buildApplicationPrompt(careerProfile, resumeText),
    maxTokens: APPLICATION_MAX_TOKENS,
    temperature: 0.15,
  }));
  return ensureApplicationDraftFields(report, careerProfile, resumeText);
}

function pickQaEvidenceStories(applicationDraft, question, targetContext = {}) {
  const stories = Array.isArray(applicationDraft?.storyBank) ? applicationDraft.storyBank : [];
  const haystack = [
    question,
    targetContext?.targetRole,
    targetContext?.targetOrganization,
    targetContext?.extraContext,
  ].map((item) => normalizeText(item, 240).toLowerCase()).join(" ");
  const ranked = stories.map((story) => {
    const storyText = [
      story?.title,
      story?.situation,
      story?.task,
      story?.action,
      story?.result,
      ...(Array.isArray(story?.skills) ? story.skills : []),
    ].join(" ").toLowerCase();
    let score = 0;
    for (const token of haystack.split(/\s+/).filter(Boolean)) {
      if (token && storyText.includes(token)) score += token.length >= 3 ? 3 : 1;
    }
    return { story, score };
  }).sort((a, b) => b.score - a.score);
  return ranked.slice(0, 3).map((item) => item.story);
}

function buildDeterministicQaReport(payload) {
  const target = payload.targetContext && typeof payload.targetContext === "object" ? payload.targetContext : {};
  const applicationDraft = normalizeApplicationDraft(payload.applicationDraft);
  const stories = pickQaEvidenceStories(applicationDraft, payload.question, target);
  const role = normalizeText(target.targetRole, 120) || normalizeText(payload.careerProfile?.basic?.targetDirection, 120) || "这个方向";
  const org = normalizeText(target.targetOrganization, 120) || "目标机构";
  const tone = normalizeText(target.tone, 40) || "真诚简洁";
  const targetReason = normalizeText(target.extraContext, 280) || normalizeText(payload.careerProfile?.basic?.currentThought, 280);
  const evidenceLines = stories.length
    ? stories.map((story) => `${story.title || "相关经历"}：${pickUsefulText([story.result, story.action, story.situation], "这条证据还需要你补一点事实细节。")}`)
    : ["当前故事库还不够，建议先补 1-2 条能说明个人贡献和结果的经历。"];
  const pointBlocks = [
    {
      heading: "我想要什么",
      point: `我想走向${role}，并不是泛泛地想试一试，而是希望把自己已经积累的能力放进更明确的场景里。`,
      evidence: stories[0]
        ? `${stories[0].title || "这段经历"}让我确认自己更适合在复杂任务里做判断、推进和表达。`
        : "目前还缺一条足够直接的岗位证据，需要先补故事库。",
    },
    {
      heading: "为什么想要",
      point: targetReason
        ? `我想要这个方向，是因为${targetReason.replace(/[。；;]+$/g, "")}，而不是只被岗位名字吸引。`
        : `我想要这个方向，是因为过去的经历让我越来越清楚，自己更适合解决${role}相关的问题。`,
      evidence: stories[1]
        ? `${stories[1].title || "另一段经历"}说明这种倾向不是一次性的，而是反复出现过。`
        : "如果能补一条更具体的动机来源，这一层会更有说服力。",
    },
    {
      heading: "我怎么能要",
      point: `我不是从零开始，我已经有一部分相邻能力；接下来要做的，是把这些能力翻译成更直接的岗位证据。`,
      evidence: stories[2]
        ? `${stories[2].title || "当前故事"}可以继续拆成 STAR，证明我不仅想做，而且做过、能做好。`
        : "下一步先补一个能说明个人贡献和结果变化的案例，回答会更稳。",
    },
  ];
  return {
    mainAxis: `这题不要从空泛热情开始，而要从“我过去积累了什么能力，以及它为什么自然指向${role}”开始。`,
    opening: `是的，我适合也愿意走向${role}，因为这不是一个突然的念头，而是被我过往经历一步步推出来的选择。`,
    pointBlocks,
    reinforcement: `如果面对${org}这样的目标，我不会只讲兴趣，而会用真实经历证明自己为什么值得这个机会，并继续把证据补得更完整。`,
    evidenceLines,
    longAnswer: `如果让我完整回答这个问题，我会这样展开：第一，我过去的经历并不是分散的，它们一直在积累与${role}相关的能力。第二，这些能力和这个方向要解决的问题是相关的。第三，我不是只想“试试看”，而是已经从过往的项目或经历里，看到了自己在这个方向上的适配感。现在如果面对${org}这样的目标，我会把表达收成更${tone}的方式，并且尽量用真实经历去支撑，而不是只讲抽象兴趣。`,
    followUpPrompt: stories.length
      ? "下一步最值得补的是把其中一条经历拆成更完整的 STAR 结构。"
      : "下一步先去申请资料中心补 1-2 条故事，再回来生成会更像你自己的答案。",
    meta: {
      mode: "deterministic_local",
      generatedAt: new Date().toISOString(),
    },
  };
}

function ensureQaStudioFields(report, payload) {
  const fallback = buildDeterministicQaReport(payload);
  const safeReport = report && typeof report === "object" ? report : {};
  if (!isUsefulTextValue(safeReport.mainAxis)) safeReport.mainAxis = fallback.mainAxis;
  if (!isUsefulTextValue(safeReport.opening)) safeReport.opening = fallback.opening;
  safeReport.pointBlocks = Array.isArray(safeReport.pointBlocks) && safeReport.pointBlocks.length
    ? safeReport.pointBlocks.slice(0, 3).map((item, index) => ({
      heading: isUsefulTextValue(item?.heading) ? normalizeText(item.heading, 40) : fallback.pointBlocks[index]?.heading,
      point: isUsefulTextValue(item?.point) ? normalizeText(item.point, 180) : fallback.pointBlocks[index]?.point,
      evidence: isUsefulTextValue(item?.evidence) ? normalizeText(item.evidence, 180) : fallback.pointBlocks[index]?.evidence,
    }))
    : fallback.pointBlocks;
  if (!isUsefulTextValue(safeReport.reinforcement)) safeReport.reinforcement = fallback.reinforcement;
  safeReport.evidenceLines = Array.isArray(safeReport.evidenceLines) && safeReport.evidenceLines.length
    ? safeReport.evidenceLines.filter(isUsefulTextValue).slice(0, 3)
    : fallback.evidenceLines;
  if (!isUsefulTextValue(safeReport.longAnswer)) safeReport.longAnswer = fallback.longAnswer;
  if (!isUsefulTextValue(safeReport.followUpPrompt)) safeReport.followUpPrompt = fallback.followUpPrompt;
  safeReport.meta = {
    ...(safeReport.meta || {}),
    generatedAt: new Date().toISOString(),
  };
  return safeReport;
}

async function createQaStudioReport(payload) {
  const report = await callDeepSeekJson(buildJsonCompletionBody({
    systemPrompt: qaStudioSystemPrompt,
    contract: qaStudioJsonContract,
    userPrompt: buildQaStudioPrompt(payload),
    maxTokens: QA_MAX_TOKENS,
    temperature: 0.2,
  }));
  return ensureQaStudioFields(report, payload);
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
      thinking: buildThinkingConfig(),
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
	      thinking: buildThinkingConfig("disabled"),
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
      const report = await createOverviewReport(careerProfile, resumeText);
      report.meta = {
        ...(report.meta || {}),
        mode: "ai",
        provider: "deepseek",
        model: DEEPSEEK_MODEL,
        baseUrl: DEEPSEEK_BASE_URL,
        analyzedAt: new Date().toISOString(),
        source: file ? "file" : "text",
        fileName: file?.name || null,
        extractedTextChars: resumeText.length,
        profileInputChars: Math.min(resumeText.length, MAX_PROFILE_RESUME_TEXT_CHARS),
        hypothesisInputChars: Math.min(resumeText.length, MAX_HYPOTHESIS_RESUME_TEXT_CHARS),
        tokenBudget: {
          profileMaxTokens: PROFILE_MAX_TOKENS,
          overviewMaxTokens: OVERVIEW_MAX_TOKENS,
          directionHypothesisMaxTokens: DIRECTION_HYPOTHESIS_MAX_TOKENS,
          moduleMaxTokens: MODULE_MAX_TOKENS,
          chatMaxTokens: CHAT_MAX_TOKENS,
        },
      };
      report.careerProfile = careerProfile;
      report.extractedResumeText = resumeText;
      const historyResult = trySaveHistoryForRequest(req, report, careerProfile, resumeText);
      if (historyResult?.entry) {
        report.meta.historySaved = true;
        report.meta.historyId = historyResult.entry.id;
      }
      if (historyResult?.error) {
        report.meta.historySaved = false;
        report.meta.historySaveError = historyResult.error;
      }
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
          hypothesisInputChars: Math.min(resumeText.length, MAX_HYPOTHESIS_RESUME_TEXT_CHARS),
          tokenBudget: {
            profileMaxTokens: PROFILE_MAX_TOKENS,
            overviewMaxTokens: OVERVIEW_MAX_TOKENS,
            directionHypothesisMaxTokens: DIRECTION_HYPOTHESIS_MAX_TOKENS,
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
      const report = await createOverviewReport(payload.careerProfile, normalizeText(payload.extractedResumeText, MAX_RESUME_TEXT_CHARS));
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
      const historyResult = trySaveHistoryForRequest(req, report, payload.careerProfile, payload.extractedResumeText);
      if (historyResult?.entry) {
        report.meta.historySaved = true;
        report.meta.historyId = historyResult.entry.id;
      }
      if (historyResult?.error) {
        report.meta.historySaved = false;
        report.meta.historySaveError = historyResult.error;
      }
      sendJson(res, 200, report);
    } catch (error) {
      sendJson(res, 502, {
        error: error.message || "首页总览生成失败，请稍后重试。",
        code: "overview_analysis_failed",
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

async function handleCreateOverviewDiagnosis(req, res) {
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
      const report = await createOverviewDiagnosisReport(payload.careerProfile);
      report.meta = {
        ...(report.meta || {}),
        mode: "ai",
        provider: "deepseek",
        model: DEEPSEEK_MODEL,
        baseUrl: DEEPSEEK_BASE_URL,
        analyzedAt: new Date().toISOString(),
      };
      report.careerProfile = payload.careerProfile;
      report.extractedResumeText = normalizeText(payload.extractedResumeText);
      sendJson(res, 200, report);
    } catch (error) {
      sendJson(res, 502, {
        error: error.message || "首页诊断层生成失败，请稍后重试。",
        code: "overview_diagnosis_failed",
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

async function handleCreateOverviewDirections(req, res) {
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
      const report = await createOverviewDirectionsReport(
        payload.careerProfile,
        normalizeText(payload.extractedResumeText, MAX_RESUME_TEXT_CHARS)
      );
      report.meta = {
        ...(report.meta || {}),
        mode: "ai",
        provider: "deepseek",
        model: DEEPSEEK_MODEL,
        baseUrl: DEEPSEEK_BASE_URL,
        analyzedAt: new Date().toISOString(),
      };
      report.careerProfile = payload.careerProfile;
      report.extractedResumeText = normalizeText(payload.extractedResumeText);
      sendJson(res, 200, report);
    } catch (error) {
      sendJson(res, 502, {
        error: error.message || "首页方向层生成失败，请稍后重试。",
        code: "overview_directions_failed",
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
        ...(report.meta || {}),
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

async function handleCreateApplicationDraft(req, res) {
  try {
    const payload = await readJson(req);
    if (!payload.careerProfile || typeof payload.careerProfile !== "object") {
      sendJson(res, 400, { error: "请先完成职业画像生成。" });
      return;
    }
    const localDraft = buildDeterministicApplicationDraft(
      payload.careerProfile,
      normalizeText(payload.extractedResumeText, MAX_RESUME_TEXT_CHARS)
    );
    sendJson(res, 200, {
      ...localDraft,
      meta: {
        ...(localDraft.meta || {}),
        provider: "local",
        fastTrack: true,
      },
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function handleCreateQaDraft(req, res) {
  try {
    const payload = await readJson(req);
    if (!payload.careerProfile || typeof payload.careerProfile !== "object") {
      sendJson(res, 400, { error: "请先完成职业画像生成。" });
      return;
    }
    if (!payload.applicationDraft || typeof payload.applicationDraft !== "object") {
      sendJson(res, 400, { error: "请先生成申请资料底稿。" });
      return;
    }
    if (!normalizeText(payload.question, 240)) {
      sendJson(res, 400, { error: "请先选择或填写当前问题。" });
      return;
    }

    if (!DEEPSEEK_API_KEY) {
      const localDraft = buildDeterministicQaReport(payload);
      sendJson(res, 200, {
        ...localDraft,
        meta: {
          ...(localDraft.meta || {}),
          provider: "local",
          fallback: true,
          reason: "missing_api_key",
        },
      });
      return;
    }

    try {
      const report = await createQaStudioReport(payload);
      report.meta = {
        ...(report.meta || {}),
        mode: "ai",
        provider: "deepseek",
        model: DEEPSEEK_MODEL,
        baseUrl: DEEPSEEK_BASE_URL,
        tokenBudget: {
          qaMaxTokens: QA_MAX_TOKENS,
          profileMaxChars: MAX_PROFILE_JSON_CHARS,
        },
      };
      sendJson(res, 200, report);
    } catch (error) {
      const localDraft = buildDeterministicQaReport(payload);
      sendJson(res, 200, {
        ...localDraft,
        meta: {
          ...(localDraft.meta || {}),
          provider: "local",
          fallback: true,
          reason: error.message,
        },
      });
    }
  } catch (error) {
    sendJson(res, 500, { error: error.message });
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
        thinking: buildThinkingConfig("disabled"),
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

async function handleAuthRegister(req, res) {
  try {
    const payload = await readJson(req);
    const { normalizedEmail, plainPassword } = validateEmailAndPassword(payload.email, payload.password);
    const store = loadAuthStore();
    pruneExpiredSessions(store);
    const existing = store.users.find((item) => item.email === normalizedEmail);
    if (existing) {
      sendJson(res, 409, { error: "这个邮箱已经注册过了，请直接登录。" });
      return;
    }

    const passwordData = hashPassword(plainPassword);
    const now = new Date().toISOString();
    const user = {
      id: generateId(12),
      email: normalizedEmail,
      passwordSalt: passwordData.salt,
      passwordHash: passwordData.hash,
      createdAt: now,
      lastLoginAt: now,
      history: [],
    };
    store.users.push(user);
    const session = createSession(store, user.id);
    saveAuthStore(store);
    sendJson(res, 200, {
      ok: true,
      user: safeUser(user),
      message: "账号已创建。",
    }, {
      "Set-Cookie": sessionCookie(session.id),
    });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

async function handleAuthLogin(req, res) {
  try {
    const payload = await readJson(req);
    const normalizedEmail = normalizeEmail(payload.email);
    const plainPassword = String(payload.password || "");
    if (!normalizedEmail || !plainPassword) {
      sendJson(res, 400, { error: "请输入邮箱和密码。" });
      return;
    }

    const store = loadAuthStore();
    pruneExpiredSessions(store);
    const user = store.users.find((item) => item.email === normalizedEmail);
    if (!user || !verifyPassword(plainPassword, user.passwordSalt, user.passwordHash)) {
      sendJson(res, 401, { error: "邮箱或密码不正确。" });
      return;
    }

    user.lastLoginAt = new Date().toISOString();
    const session = createSession(store, user.id);
    saveAuthStore(store);
    sendJson(res, 200, {
      ok: true,
      user: safeUser(user),
      message: "登录成功。",
    }, {
      "Set-Cookie": sessionCookie(session.id),
    });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

async function handleAuthLogout(req, res) {
  const context = getAuthContext(req);
  if (context.session) {
    context.store.sessions = context.store.sessions.filter((item) => item.id !== context.session.id);
    saveAuthStore(context.store);
  }
  sendJson(res, 200, { ok: true }, {
    "Set-Cookie": clearSessionCookie(),
  });
}

async function handleAuthMe(req, res) {
  const context = getAuthContext(req);
  if (!context.user) {
    sendJson(res, 200, { ok: true, user: null });
    return;
  }
  sendJson(res, 200, {
    ok: true,
    user: safeUser(context.user),
  });
}

async function handleProfileGet(req, res) {
  const context = requireAuth(req, res);
  if (!context) return;
  sendJson(res, 200, {
    ok: true,
    profile: publicLongTermProfile(context.user),
  });
}

async function handleProfileSave(req, res) {
  try {
    const context = requireAuth(req, res);
    if (!context) return;
    const payload = await readJson(req);
    const current = normalizeLongTermProfile(context.user.longTermProfile || {});
    context.user.longTermProfile = normalizeLongTermProfile({
      ...current,
      currentGoal: payload.currentGoal ?? current.currentGoal,
      preferredDirections: payload.preferredDirections ?? current.preferredDirections,
      rejectedDirections: payload.rejectedDirections ?? current.rejectedDirections,
      notes: payload.notes ?? current.notes,
      updatedAt: new Date().toISOString(),
    });
    context.user.lastSeenAt = new Date().toISOString();
    saveAuthStore(context.store);
    sendJson(res, 200, {
      ok: true,
      profile: publicLongTermProfile(context.user),
      user: safeUser(context.user),
      message: "档案已保存。",
    });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

async function handleHistoryList(req, res) {
  const context = requireAuth(req, res);
  if (!context) return;
  const history = Array.isArray(context.user.history) ? context.user.history : [];
  sendJson(res, 200, {
    ok: true,
    items: history.map(buildHistorySummary),
  });
}

async function handleHistoryDetail(req, res) {
  const context = requireAuth(req, res);
  if (!context) return;
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const historyId = normalizeText(url.searchParams.get("id"), 40);
  if (!historyId) {
    sendJson(res, 400, { error: "缺少历史记录 id。" });
    return;
  }
  const history = Array.isArray(context.user.history) ? context.user.history : [];
  const item = history.find((entry) => entry.id === historyId);
  if (!item) {
    sendJson(res, 404, { error: "没有找到这条历史记录。" });
    return;
  }
  sendJson(res, 200, {
    ok: true,
    item: {
      ...buildHistorySummary(item),
      report: item.report,
      careerProfile: item.careerProfile,
      extractedResumeText: item.extractedResumeText,
    },
  });
}

async function handleHistorySave(req, res) {
  try {
    const context = requireAuth(req, res);
    if (!context) return;
    const payload = await readJson(req);
    if (!payload.report || typeof payload.report !== "object") {
      sendJson(res, 400, { error: "缺少报告内容。" });
      return;
    }
    if (!payload.careerProfile || typeof payload.careerProfile !== "object") {
      sendJson(res, 400, { error: "缺少职业画像。" });
      return;
    }

    const entry = saveAnalysisToUserHistory(
      context.user,
      payload.report,
      payload.careerProfile,
      payload.extractedResumeText || ""
    );
    saveAuthStore(context.store);
    sendJson(res, 200, {
      ok: true,
      item: buildHistorySummary(entry),
      message: "报告已保存到你的历史记录。",
    });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
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
    const store = loadAuthStore();
    sendJson(res, 200, {
      ok: true,
      app: "Resume Partner",
      provider: "deepseek",
      hasDeepSeekKey: Boolean(DEEPSEEK_API_KEY),
      envFileLoaded,
      authEnabled: true,
      usersCount: Array.isArray(store.users) ? store.users.length : 0,
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
  if (req.method === "GET" && req.url === "/api/library") {
    sendJson(res, 200, loadCareerLibrary());
    return;
  }

  if (req.method === "GET" && req.url === "/api/auth/me") {
    handleAuthMe(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/auth/register") {
    handleAuthRegister(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/auth/login") {
    handleAuthLogin(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/auth/logout") {
    handleAuthLogout(req, res);
    return;
  }

  if (req.method === "GET" && req.url === "/api/test-ai") {
    handleTestAi(req, res);
    return;
  }

  if (req.method === "GET" && req.url === "/api/profile") {
    handleProfileGet(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/profile") {
    handleProfileSave(req, res);
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/history")) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.searchParams.get("id")) {
      handleHistoryDetail(req, res);
      return;
    }
    handleHistoryList(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/history") {
    handleHistorySave(req, res);
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

  if (req.method === "POST" && req.url === "/api/create-overview-diagnosis") {
    handleCreateOverviewDiagnosis(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/create-overview-directions") {
    handleCreateOverviewDirections(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/create-application-draft") {
    handleCreateApplicationDraft(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/create-qa-draft") {
    handleCreateQaDraft(req, res);
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

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Resume Partner running at http://localhost:${PORT}`);
    console.log(DEEPSEEK_API_KEY ? "DEEPSEEK_API_KEY loaded on the server." : "DEEPSEEK_API_KEY is not set; AI endpoints will fail.");
    console.log(`Model: ${DEEPSEEK_MODEL}`);
    console.log(`API: ${DEEPSEEK_BASE_URL}/chat/completions`);
    console.log(`Auth store: ${AUTH_STORE_FILE}`);
  });
}

module.exports = {
  buildOverviewFallbackParts,
  ensureOverviewFields,
  getOverviewQualityIssues,
};
