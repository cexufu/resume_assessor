# 简历画像分析器上线操作指南

适用目标：把当前项目部署成一个可分享给他人试用的公网版本。

推荐方式：GitHub + Render Web Service。

## 0. 你需要准备什么

- 一个 GitHub 账号
- 一个 Render 账号：https://render.com/
- 一个可用的 DeepSeek API Key
- 本项目压缩包：`resume-insight-mvp-upload.zip`

## 1. 不要上传密钥

项目里的 `.env` 文件用于本地保存 DeepSeek Key，但它不能上传到 GitHub。

当前项目已经在 `.gitignore` 中排除了：

```text
.env
node_modules/
```

所以你上传代码时，不会把真实 key 和依赖目录一起传上去。

## 2. 创建 GitHub 仓库

1. 打开 https://github.com/
2. 点击 New repository
3. Repository name 建议填：

```text
resume-insight-mvp
```

4. 先不要勾选添加 README、.gitignore、license
5. 点击 Create repository

## 3. 上传项目代码

方式 A：用 GitHub 网页上传

1. 解压 `resume-insight-mvp-upload.zip`
2. 打开 GitHub 新仓库页面
3. 点击 uploading an existing file
4. 把解压后的全部项目文件拖进去
5. 提交 commit

方式 B：用终端上传

进入项目目录：

```bash
cd /Users/dxm/Desktop/codex和原力claw培训/ai_study_career_planner
```

初始化并提交：

```bash
git init
git add .
git commit -m "init resume insight mvp"
```

连接你的 GitHub 仓库，注意把下面地址换成你自己的：

```bash
git remote add origin https://github.com/你的用户名/resume-insight-mvp.git
git branch -M main
git push -u origin main
```

## 4. 在 Render 创建服务

1. 打开 https://render.com/
2. 登录后点击 New
3. 选择 Web Service
4. 连接 GitHub
5. 选择刚才的 `resume-insight-mvp` 仓库

Render 配置：

```text
Runtime: Node
Build Command: npm install
Start Command: npm start
```

`PORT` 不需要配置，Render 会自动提供。

## 5. 配置 Render 环境变量

在 Render 的 Environment / Environment Variables 中添加：

```text
DEEPSEEK_API_KEY=你的真实 DeepSeek Key
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
AI_TIMEOUT_MS=120000
PROFILE_MAX_TOKENS=1100
OVERVIEW_MAX_TOKENS=1300
MODULE_MAX_TOKENS=1900
CHAT_MAX_TOKENS=1100
JSON_REPAIR_MAX_TOKENS=1200
MAX_RESUME_TEXT_CHARS=12000
MAX_PROFILE_RESUME_TEXT_CHARS=8000
MAX_PROFILE_JSON_CHARS=3500
MAX_MODULE_INPUT_CHARS=1000
MAX_FILE_BYTES=6000000
MAX_BODY_BYTES=12000000
```

重点：`DEEPSEEK_API_KEY` 只放在 Render 环境变量里，不要写进前端文件。

## 6. 部署

1. 点击 Create Web Service
2. 等待 Render 执行安装和启动
3. 看到 Live 或 Deploy succeeded 后，打开 Render 给你的链接

链接一般类似：

```text
https://resume-insight-mvp.onrender.com
```

## 7. 部署后检查

打开页面后检查：

- 顶部是否显示 DeepSeek 已配置
- 是否能上传 TXT、MD、PDF、DOCX
- 是否能生成 5 段简历洞察
- 生成报告后，流式追问是否能正常回答

## 8. 常见问题

### 页面显示 DeepSeek 未配置

Render 环境变量没有配置 `DEEPSEEK_API_KEY`，或者配置后没有重新部署。

处理方式：

1. Render 后台进入服务
2. 打开 Environment
3. 确认 `DEEPSEEK_API_KEY` 已填写
4. 点击 Manual Deploy / Redeploy

### PDF 或 DOCX 无法解析

可能原因：

- 文件是扫描版 PDF，没有文字层
- 文件太大，超过 `MAX_FILE_BYTES`
- DOCX 文件损坏或格式异常

处理方式：

- 换一个有文字层的 PDF
- 使用 DOCX 或 TXT
- 把简历正文复制进文本框

### 分析超时

可能原因：

- 简历太长
- DeepSeek 响应慢
- 网络波动

处理方式：

- 缩短简历文本
- 增大 `AI_TIMEOUT_MS`
- 稍后重试

## 9. 试用版建议

建议先不要完全公开传播。先给 5-10 个可信用户试用，观察：

- 输出是否足够专业
- 是否覆盖公关、舆情、策略、安全、商业分析等多方向
- PDF/DOCX 上传是否稳定
- DeepSeek 调用成本是否可控

下一步再考虑增加访问密码、限流、隐私声明和用户登录。
