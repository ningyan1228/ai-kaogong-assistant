const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

type PlanRequest = {
  exam?: string;
  cycle?: string;
  dailyHours?: string;
  foundation?: string;
  weakModules?: string[];
  employed?: boolean;
};

type WrongRequest = {
  question?: string;
  myAnswer?: string;
  correctAnswer?: string;
  wrongReason?: string;
};

type LearningRequest = {
  module?: string;
  topic?: string;
  action?: "explain" | "generate_questions" | "summarize_mistakes" | "template";
  keyword?: string;
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function getChatCompletionsUrl() {
  const baseUrl = Deno.env.get("AI_BASE_URL") || "https://api.deepseek.com";
  const normalized = baseUrl.replace(/\/$/, "");
  if (normalized.endsWith("/chat/completions")) {
    return normalized;
  }
  return `${normalized}/chat/completions`;
}

async function callAi(systemPrompt: string, userPrompt: string) {
  const apiKey = Deno.env.get("AI_API_KEY");
  const model = Deno.env.get("AI_MODEL") || "deepseek-chat";

  if (!apiKey) {
    throw new Error("服务端未配置 AI_API_KEY。");
  }

  const response = await fetch(getChatCompletionsUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `AI 服务请求失败，状态码：${response.status}`;
    throw new Error(message);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("AI 未返回有效内容。");
  }

  return content;
}

async function parseJson<T>(request: Request): Promise<T> {
  try {
    return await request.json();
  } catch (_) {
    throw new Error("请求体必须是 JSON。");
  }
}

async function handlePlan(request: Request) {
  const body = await parseJson<PlanRequest>(request);
  if (!body.exam || !body.cycle || !body.dailyHours || !body.foundation) {
    return jsonResponse({ error: "请完整填写目标考试、备考周期、学习时长和当前基础。" }, 400);
  }

  const weakModules = body.weakModules?.length ? body.weakModules.join("、") : "暂无特别薄弱模块";
  const systemPrompt = [
    "你是一名熟悉中国公务员考试与事业单位考试的备考规划老师。",
    "请给出务实、可执行、适合新手理解的学习计划。",
    "输出使用 Markdown，必须包含：阶段目标、每周安排、每日任务、行测训练建议、申论训练建议、复盘建议。",
    "不要承诺考试结果，不要编造官方政策信息。",
  ].join("\n");
  const userPrompt = [
    `目标考试：${body.exam}`,
    `备考周期：${body.cycle}`,
    `每天学习时长：${body.dailyHours}`,
    `当前基础：${body.foundation}`,
    `薄弱模块：${weakModules}`,
    `是否在职备考：${body.employed ? "是" : "否"}`,
    "请按上述信息生成一份分阶段备考计划。",
  ].join("\n");

  const result = await callAi(systemPrompt, userPrompt);
  return jsonResponse({ result });
}

async function handleWrong(request: Request) {
  const body = await parseJson<WrongRequest>(request);
  if (!body.question || !body.myAnswer || !body.correctAnswer) {
    return jsonResponse({ error: "请至少填写题目内容、我的答案和正确答案。" }, 400);
  }

  const systemPrompt = [
    "你是一名擅长公务员考试错题复盘的老师。",
    "请从考点、错因、正确思路和下次判断方法出发，帮助考生形成可复用经验。",
    "输出使用 Markdown，必须包含：题目考点、错误原因、正确思路、同类题避坑方法、下次遇到怎么判断、错题标签。",
    "如果题目信息不足，请基于已有信息谨慎分析，并说明需要补充的信息。",
  ].join("\n");
  const userPrompt = [
    `题目内容：${body.question}`,
    `我的答案：${body.myAnswer}`,
    `正确答案：${body.correctAnswer}`,
    `我觉得错的原因：${body.wrongReason || "未填写"}`,
    "请生成一份错题复盘。",
  ].join("\n");

  const result = await callAi(systemPrompt, userPrompt);
  return jsonResponse({ result });
}

function getActionText(action?: string) {
  if (action === "generate_questions") return "生成5道同类练习题，包含答案和简短解析";
  if (action === "summarize_mistakes") return "总结易错点、常见误区和避坑方法";
  if (action === "template") return "生成答题模板、使用场景和示例";
  return "讲解这个知识点，说明是什么、高频考法、解题步骤和提分建议";
}

async function handleLearning(request: Request, area: "xingce" | "shenlun" | "knowledge" | "idiom") {
  const body = await parseJson<LearningRequest>(request);
  const topic = body.topic || body.keyword;

  if (!topic) {
    return jsonResponse({ error: "请提供 topic 或 keyword。" }, 400);
  }

  const areaName = {
    xingce: "公务员考试行测",
    shenlun: "公务员考试申论",
    knowledge: "公务员考试常识判断",
    idiom: "公务员考试言语理解成语辨析",
  }[area];

  const systemPrompt = [
    `你是一名${areaName}老师。`,
    "请围绕用户选择的模块和知识点输出内容。",
    "内容要适合零基础考公学生，结构清晰，具体可执行，不要空泛。",
    "输出使用 Markdown，不要编造官方考试政策。",
  ].join("\n");

  const userPrompt = [
    `学习领域：${areaName}`,
    `模块：${body.module || "未指定"}`,
    `知识点：${topic}`,
    `任务：${getActionText(body.action)}`,
  ].join("\n");

  const result = await callAi(systemPrompt, userPrompt);
  return jsonResponse({ result });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(request.url);

  try {
    if (request.method === "POST" && url.pathname === "/api/plan") {
      return await handlePlan(request);
    }

    if (request.method === "POST" && url.pathname === "/api/wrong") {
      return await handleWrong(request);
    }

    if (request.method === "POST" && url.pathname === "/api/xingce") {
      return await handleLearning(request, "xingce");
    }

    if (request.method === "POST" && url.pathname === "/api/shenlun") {
      return await handleLearning(request, "shenlun");
    }

    if (request.method === "POST" && url.pathname === "/api/knowledge") {
      return await handleLearning(request, "knowledge");
    }

    if (request.method === "POST" && url.pathname === "/api/idiom") {
      return await handleLearning(request, "idiom");
    }

    return jsonResponse({ error: "接口不存在。" }, 404);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "服务器内部错误。";
    return jsonResponse({ error: message }, 500);
  }
});
