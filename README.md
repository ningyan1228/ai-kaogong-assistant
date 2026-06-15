# AI考公备考助手

第一版采用静态前端 + Deno Deploy 后端代理架构。

## 项目结构

```text
/frontend
  index.html
  planner.html
  shenlun.html
  wrong.html
  about.html
  style.css
  main.js

/backend
  server.ts
  README.md
```

## 本地预览前端

方式一：直接双击打开 `frontend/index.html`。

方式二：启动一个静态服务，在项目根目录执行：

```bash
python -m http.server 5500 -d frontend
```

然后访问 `http://localhost:5500`。

如果你要本地测试 AI 接口，再开一个终端运行：

```bash
deno run --allow-net --allow-env backend/server.ts
```

前端在本地预览时，如果 `frontend/main.js` 里的 `API_BASE_URL` 仍是占位文本，会自动请求 `http://localhost:8000`。

## 部署 GitHub Pages

项目已内置 `.github/workflows/pages.yml`，会把 `frontend` 目录发布到 GitHub Pages。

1. 把项目推送到 GitHub 仓库的 `main` 分支。
2. 进入仓库 `Settings` -> `Pages`。
3. `Source` 选择 `GitHub Actions`。
4. 回到 `Actions` 页面，等待 `Deploy frontend to GitHub Pages` 工作流完成。

部署完成后，你会得到一个类似下面的前端地址：

```text
https://你的用户名.github.io/你的仓库名/
```

## 部署 Deno Deploy

1. 打开 Deno Deploy 并创建新项目。
2. 关联 GitHub 仓库。
3. 入口文件选择 `backend/server.ts`。
4. 配置环境变量。
5. 部署完成后复制 Deno Deploy 项目地址。
6. 修改 `frontend/main.js`：

```js
const API_BASE_URL = "https://你的-deno-project.deno.dev";
```

## Deno Deploy 环境变量

在 Deno Deploy 项目设置中配置：

```text
AI_API_KEY=你的 DeepSeek API Key
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-chat
```

说明：

- 前端不会暴露 `AI_API_KEY`。
- 所有 AI 请求都从前端发到 Deno 后端代理。
- 后端再携带环境变量中的 API Key 请求 DeepSeek OpenAI-compatible API。

## 接口说明

### POST /api/plan

请求示例：

```json
{
  "exam": "国考",
  "cycle": "90天",
  "dailyHours": "每天3小时",
  "foundation": "小白",
  "weakModules": ["资料分析", "申论"],
  "employed": true
}
```

### POST /api/wrong

请求示例：

```json
{
  "question": "题目内容",
  "myAnswer": "我的答案",
  "correctAnswer": "正确答案",
  "wrongReason": "审题不仔细"
}
```
