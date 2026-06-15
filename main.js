const API_BASE_URL = "https://ai-kaogong-assistant.gqzning.deno.net";
const LOCAL_API_BASE_URL = "http://localhost:8000";

function getApiBaseUrl() {
  const isLocalPage = ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
  if (API_BASE_URL.includes("你的 Deno Deploy 地址") && isLocalPage) {
    return LOCAL_API_BASE_URL;
  }
  return API_BASE_URL.replace(/\/$/, "");
}

function setActiveNav() {
  const current = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a").forEach((link) => {
    if (link.getAttribute("href") === current) {
      link.classList.add("active");
    }
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

function renderMarkdown(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const html = [];
  let listType = null;

  function closeList() {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  }

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      return;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeList();
      html.push(`<h${heading[1].length}>${inlineMarkdown(heading[2])}</h${heading[1].length}>`);
      return;
    }

    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      if (listType !== "ul") {
        closeList();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li>${inlineMarkdown(unordered[1])}</li>`);
      return;
    }

    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      if (listType !== "ol") {
        closeList();
        html.push("<ol>");
        listType = "ol";
      }
      html.push(`<li>${inlineMarkdown(ordered[1])}</li>`);
      return;
    }

    closeList();
    html.push(`<p>${inlineMarkdown(line)}</p>`);
  });

  closeList();
  return `<div class="markdown-result">${html.join("")}</div>`;
}

function renderResult(resultEl, markdown) {
  resultEl.dataset.rawResult = markdown || "";
  resultEl.classList.remove("empty-state");
  resultEl.innerHTML = `
    <div class="result-toolbar">
      <span class="copy-status" aria-live="polite">已生成结果</span>
      <button class="copy-btn" type="button" data-copy-result>复制结果</button>
    </div>
    ${renderMarkdown(markdown)}
  `;
}

function getCheckedValues(form, name) {
  return Array.from(form.querySelectorAll(`input[name="${name}"]:checked`)).map((item) => item.value);
}

function setLoading(resultEl, button, text) {
  button.disabled = true;
  button.dataset.originalText = button.textContent;
  button.textContent = "生成中...";
  resultEl.dataset.rawResult = "";
  resultEl.innerHTML = `<div class="loading"><span class="spinner"></span><span>${text}</span></div>`;
}

function clearLoading(button) {
  button.disabled = false;
  button.textContent = button.dataset.originalText || "提交";
}

function showError(resultEl, message) {
  resultEl.dataset.rawResult = "";
  resultEl.innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function initCopyButtons() {
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-copy-result]");
    if (!button) return;

    const resultEl = button.closest(".result-card")?.querySelector("[data-raw-result]");
    const text = resultEl?.dataset.rawResult || "";
    const status = button.closest(".result-toolbar")?.querySelector(".copy-status");
    if (!text) return;

    button.disabled = true;
    try {
      await copyText(text);
      if (status) status.textContent = "已复制到剪贴板";
      button.textContent = "已复制";
      window.setTimeout(() => {
        button.textContent = "复制结果";
        if (status) status.textContent = "已生成结果";
        button.disabled = false;
      }, 1600);
    } catch (_) {
      if (status) status.textContent = "复制失败，请手动选中复制";
      button.disabled = false;
    }
  });
}

async function postJson(path, payload) {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  let data = {};
  try {
    data = await response.json();
  } catch (_) {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.error || "请求失败，请稍后再试。");
  }

  return data;
}

function initPlannerForm() {
  const form = document.querySelector("#plannerForm");
  const resultEl = document.querySelector("#plannerResult");
  if (!form || !resultEl) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type='submit']");
    const formData = new FormData(form);
    const payload = {
      exam: formData.get("exam"),
      cycle: formData.get("cycle"),
      dailyHours: formData.get("dailyHours"),
      foundation: formData.get("foundation"),
      weakModules: getCheckedValues(form, "weakModules"),
      employed: formData.get("employed") === "yes",
    };

    if (!payload.dailyHours) {
      showError(resultEl, "请填写每天学习时长。");
      return;
    }

    setLoading(resultEl, button, "AI 正在为你拆解备考节奏...");
    try {
      const data = await postJson("/api/plan", payload);
      renderResult(resultEl, data.result || "暂未生成内容，请稍后重试。");
    } catch (error) {
      showError(resultEl, error.message || "AI接口暂时不可用，请检查 Deno 服务或 API 配置。");
    } finally {
      clearLoading(button);
    }
  });
}

function initWrongForm() {
  const form = document.querySelector("#wrongForm");
  const resultEl = document.querySelector("#wrongResult");
  if (!form || !resultEl) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type='submit']");
    const formData = new FormData(form);
    const payload = {
      question: formData.get("question"),
      myAnswer: formData.get("myAnswer"),
      correctAnswer: formData.get("correctAnswer"),
      wrongReason: formData.get("wrongReason"),
    };

    if (!payload.question || !payload.myAnswer || !payload.correctAnswer) {
      showError(resultEl, "请至少填写题目内容、我的答案和正确答案。");
      return;
    }

    setLoading(resultEl, button, "AI 正在分析错因和避坑方法...");
    try {
      const data = await postJson("/api/wrong", payload);
      renderResult(resultEl, data.result || "暂未生成内容，请稍后重试。");
    } catch (_) {
      showError(resultEl, "AI接口暂时不可用，请检查 Deno 服务或 API 配置。");
    } finally {
      clearLoading(button);
    }
  });
}

function initDailyForm() {
  const form = document.querySelector("#dailyForm");
  const resultEl = document.querySelector("#dailyResult");
  if (!form || !resultEl) return;

  const taskMap = {
    入门期: {
      xingce: "看 1 个薄弱模块基础课，整理 5 条易错规则。",
      shenlun: "阅读 1 篇申论范文，摘抄 3 句可复用表达。",
      review: "复盘昨天错题，标注错因：审题、公式、概念或速度。",
      reminder: "今天不要追求题量，先把方法听懂、步骤写全。",
    },
    强化期: {
      xingce: "完成薄弱模块专项训练，错题按题型归类。",
      shenlun: "练 1 道小题，重点训练审题和材料概括。",
      review: "把错题改成“下次判断条件”，形成自己的避坑句。",
      reminder: "用限时训练逼近考场节奏，但不要忽略复盘质量。",
    },
    冲刺期: {
      xingce: "做套题或半套题，重点控制时间和取舍顺序。",
      shenlun: "完成 1 个作文提纲或 1 道综合分析题。",
      review: "只复盘高频错题和会影响分数的薄弱点。",
      reminder: "冲刺期少开新坑，多做套卷、回看错题、稳定心态。",
    },
  };

  const volumeMap = {
    "1小时": "行测 20-30 题，申论素材 10 分钟",
    "2小时": "行测 40-60 题，申论小题 1 道",
    "3小时": "行测 70-90 题，申论小题 1 道 + 素材整理",
    "4小时+": "行测半套或套题，申论 1-2 道题，晚间完整复盘",
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const stage = formData.get("stage");
    const time = formData.get("studyTime");
    const weakModules = getCheckedValues(form, "weakModules");
    const weakText = weakModules.length ? weakModules.join("、") : "任选一个薄弱模块";
    const base = taskMap[stage];
    const result = [
      `# 今日任务（${stage} / ${time}）`,
      `## 今日行测任务`,
      `${base.xingce} 优先处理：${weakText}。`,
      `## 今日申论任务`,
      base.shenlun,
      `## 今日刷题量`,
      volumeMap[time],
      `## 今日复盘任务`,
      base.review,
      `## 今日提醒`,
      base.reminder,
    ].join("\n\n");
    renderResult(resultEl, result);
  });
}

function initJobForm() {
  const form = document.querySelector("#jobForm");
  const resultEl = document.querySelector("#jobResult");
  if (!form || !resultEl) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const degree = formData.get("degree");
    const major = String(formData.get("major") || "").trim() || "未填写专业";
    const graduate = formData.get("graduate");
    const politics = formData.get("politics");
    const region = String(formData.get("region") || "").trim() || "目标地区";
    const township = formData.get("township");
    const remote = formData.get("remote");

    const directions = [];
    if (degree === "本科" || degree === "硕士及以上") directions.push("优先筛选限制学历、专业、应届身份的岗位");
    if (politics === "中共党员") directions.push("关注党群机关、组织系统、基层党建相关岗位");
    if (township === "yes") directions.push("可把乡镇岗作为保底梯队，但要看服务年限和地点");
    if (remote === "no") directions.push("优先锁定本地和周边通勤可接受地区");

    const risk = township === "yes"
      ? "乡镇岗上岸机会可能更高，但工作强度、服务期限和交通成本要提前确认。"
      : "不接受乡镇岗时，可选岗位会变少，要尽量利用专业、学历、应届等限制降低竞争。";

    const result = [
      `# 岗位选择建议`,
      `## 适合报考方向`,
      directions.join("\n") || "先按学历、专业、地区三个条件筛选，再看身份限制和备注要求。",
      `## 岗位筛选建议`,
      `目标地区：${region}。专业：${major}。建议建立“冲刺、稳妥、保底”三档岗位表，每档保留 3-5 个备选。`,
      `## 三不限风险提醒`,
      "三不限岗位报名门槛低，竞争通常更激烈。除非岗位地点和招录人数很合适，否则不要把三不限作为唯一选择。",
      `## 竞争避坑建议`,
      `${risk} 避开只看岗位名称的冲动，重点看招录人数、限制条件、历年进面分和备注。`,
      `## 备考侧重点`,
      `${graduate === "应届" ? "应届身份是优势，报名时重点保留应届限制岗位。" : "往届考生要更重视专业限制、基层经历和证书条件。"} 行测先稳住资料分析、判断推理，申论每周至少练 1 次小题。`,
    ].join("\n\n");

    renderResult(resultEl, result);
  });
}

function getNumberValue(form, name, fallback = 0) {
  const value = Number(new FormData(form).get(name));
  if (Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(100, value));
}

function classifyAbility(score) {
  if (score >= 75) return { label: "已掌握", className: "stable", advice: "保持手感，套题中稳定拿分。" };
  if (score >= 50) return { label: "正在强化", className: "warning", advice: "继续专项训练，重点压缩做题时间。" };
  return { label: "危险区域", className: "danger", advice: "优先补基础方法，再进入限时刷题。" };
}

function buildAbilityRows(scores) {
  return scores.map((item) => {
    const status = classifyAbility(item.score);
    return `
      <div class="ability-row">
        <div class="ability-meta"><strong>${item.name}</strong><span>${item.score}</span></div>
        <div class="ability-track"><span class="${status.className}" style="width:${item.score}%"></span></div>
        <small>${status.label}：${status.advice}</small>
      </div>
    `;
  }).join("");
}

function buildSevenDayPlan(priority) {
  const first = priority[0]?.name || "资料分析";
  const second = priority[1]?.name || "数量关系";
  return [
    `Day1：${first} 基础方法复盘 + 20 题`,
    `Day2：${first} 限时训练 + 错题归类`,
    `Day3：${second} 基础模型梳理 + 10 题`,
    `Day4：${second} 易错题型专项 + 复盘`,
    `Day5：${first} 和 ${second} 混合训练`,
    "Day6：半套行测限时训练，记录时间分配",
    "Day7：回看错题，整理下周危险模块",
  ];
}

function updateXingceMap(scores) {
  const mapEl = document.querySelector("#xingceMap");
  if (!mapEl) return;

  const practiceMap = {
    言语理解: "20题 / 15分钟",
    判断推理: "25题 / 20分钟",
    资料分析: "2篇 / 20分钟",
    数量关系: "10题 / 15分钟",
    常识判断: "10分钟积累",
  };

  mapEl.innerHTML = scores.map((item) => {
    const status = classifyAbility(item.score);
    return `
      <div class="map-card ${status.className}">
        <strong>${item.name}</strong>
        <span>${status.label}</span>
        <small>${practiceMap[item.name]}</small>
      </div>
    `;
  }).join("");
}

function initXingceAbility() {
  const form = document.querySelector("#xingceAbilityForm");
  const resultEl = document.querySelector("#xingceAbilityResult");
  const refreshBtn = document.querySelector("#refreshXingceMap");
  if (!form || !resultEl) return;

  function readScores() {
    const formData = new FormData(form);
    return ["言语理解", "判断推理", "资料分析", "数量关系", "常识判断"].map((name) => ({
      name,
      score: Math.max(0, Math.min(100, Number(formData.get(name)) || 0)),
    }));
  }

  function analyze() {
    const scores = readScores();
    const priority = [...scores].sort((a, b) => a.score - b.score);
    const average = Math.round(scores.reduce((sum, item) => sum + item.score, 0) / scores.length);
    const first = priority[0];
    const second = priority[1];
    const hours = (item) => Math.max(8, Math.round((80 - item.score) * 0.6));
    const expected = average >= 70 ? "+4~6分" : average >= 50 ? "+6~10分" : "+8~12分";
    const plan = buildSevenDayPlan(priority).map((item) => `<li>${item}</li>`).join("");

    resultEl.dataset.rawResult = [
      `当前平均能力：${average}`,
      `优先提升：${first.name}、${second.name}`,
      `${first.name}预计投入：${hours(first)}小时`,
      `${second.name}预计投入：${hours(second)}小时`,
      `预计提升：${expected}`,
    ].join("\n");

    resultEl.classList.remove("empty-state");
    resultEl.innerHTML = `
      <div class="result-toolbar">
        <span class="copy-status">能力分析已生成</span>
        <button class="copy-btn" type="button" data-copy-result>复制结果</button>
      </div>
      <div class="ability-summary">
        <strong>当前平均能力：${average}</strong>
        <span>距离稳定高分，优先补齐 ${first.name} 和 ${second.name}。</span>
      </div>
      <div class="ability-chart">${buildAbilityRows(scores)}</div>
      <div class="advice-box">
        <h3>AI建议</h3>
        <p>距离 80 分优先提升：${first.name}、${second.name}。</p>
        <p>${first.name}预计投入 ${hours(first)} 小时，${second.name}预计投入 ${hours(second)} 小时。</p>
        <p>预计提升：${expected}。</p>
      </div>
      <div class="advice-box">
        <h3>未来7天</h3>
        <ol>${plan}</ol>
      </div>
    `;
    updateXingceMap(scores);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    analyze();
  });

  refreshBtn?.addEventListener("click", analyze);
  analyze();
}

function initScoreEstimator() {
  const form = document.querySelector("#scoreEstimatorForm");
  const resultEl = document.querySelector("#scoreEstimatorResult");
  if (!form || !resultEl) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const items = ["言语", "判断", "资料", "数量", "常识"].map((name) => ({
      name,
      score: Math.max(0, Number(formData.get(name)) || 0),
    }));
    const total = items.reduce((sum, item) => sum + item.score, 0);
    const lowest = [...items].sort((a, b) => a.score - b.score)[0];
    const second = [...items].sort((a, b) => a.score - b.score)[1];
    const level = total >= 115 ? "很有竞争力" : total >= 100 ? "有竞争力，但仍需补短板" : "基础还不稳，优先补高性价比模块";
    const boostedA = total + (lowest.name === "数量" ? 8 : 6);
    const boostedB = total + (second.name === "数量" ? 8 : 6);
    const result = [
      `# 当前总分：${total}`,
      `## 预计竞争力`,
      level,
      `## 优先提升`,
      `${lowest.name}、${second.name}`,
      `## 提升模拟`,
      `如果提升${lowest.name}：总分约 ${boostedA}`,
      `如果提升${second.name}：总分约 ${boostedB}`,
    ].join("\n\n");
    renderResult(resultEl, result);
  });
}

function initWeakDiagnosis() {
  const form = document.querySelector("#weakDiagnosisForm");
  const resultEl = document.querySelector("#weakDiagnosisResult");
  if (!form || !resultEl) return;

  const reasonMap = {
    增长率: "公式入口不熟，看到同比、环比、增长量时切换慢。",
    比重: "现期比重和基期比重混淆，容易漏看时间。",
    平均数: "总量和份数对应关系不清，容易套错分母。",
    倍数: "倍数、增长率和多几倍概念混在一起。",
    混合增长率: "没有先判断整体增长率在两个部分之间。",
    审题速度: "题干关键词抓取慢，导致时间被单题吞掉。",
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const module = formData.get("module");
    const topic = formData.get("topic");
    const result = [
      `# ${module}诊断：${topic}`,
      `## 你最容易死在哪`,
      reasonMap[topic] || "基础概念和题型入口不稳定。",
      `## 80%的同学死在这里的原因`,
      "不是题目完全不会，而是公式、关键词、时间条件和选项估算没有形成固定动作。",
      `## 三天修复安排`,
      `第一天：重学${topic}基础公式和题型入口，做 10 道慢速题。`,
      `第二天：刷 20 道同类题，限时但不追求速度极限。`,
      `第三天：整理错题，把每道题改写成“下次看到什么就怎么做”。`,
      `## 下次避坑`,
      "先圈时间、对象、单位，再选公式；不会就先跳，回头再做。",
    ].join("\n\n");
    renderResult(resultEl, result);
  });
}

setActiveNav();
initCopyButtons();
initPlannerForm();
initWrongForm();
initDailyForm();
initJobForm();
initXingceAbility();
initScoreEstimator();
initWeakDiagnosis();
