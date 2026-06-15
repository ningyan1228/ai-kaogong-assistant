# Deno Deploy 后端

这个目录提供 AI 请求代理服务，前端不要直接保存或暴露 AI API Key。

## 接口

- `POST /api/plan`：生成 AI 备考规划
- `POST /api/wrong`：生成 AI 错题复盘

## 环境变量

在 Deno Deploy 项目设置里配置：

- `AI_API_KEY`：你的 DeepSeek API Key
- `AI_BASE_URL`：AI 接口地址，默认可用 `https://api.deepseek.com`
- `AI_MODEL`：模型名，默认可用 `deepseek-chat`

## 本地运行

安装 Deno 后，在项目根目录执行：

```bash
deno run --allow-net --allow-env backend/server.ts
```

本地服务默认运行在 `http://localhost:8000`。

## 部署到 Deno Deploy

1. 打开 Deno Deploy，创建新项目。
2. 关联你的 GitHub 仓库。
3. 入口文件选择 `backend/server.ts`。
4. 在项目环境变量里配置 `AI_API_KEY`、`AI_BASE_URL`、`AI_MODEL`。
5. 部署完成后，把 Deno Deploy 地址填到 `frontend/main.js` 里的 `API_BASE_URL`。
