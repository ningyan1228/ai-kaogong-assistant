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

function initNavToggle() {
  const button = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  if (!button || !links) return;

  button.addEventListener("click", () => {
    const isOpen = links.classList.toggle("open");
    button.setAttribute("aria-expanded", String(isOpen));
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

    const card = button.closest(".result-card");
    const resultEl = card?.matches("[data-raw-result]") ? card : card?.querySelector("[data-raw-result]");
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

const IDIOM_DATA = [
  { word: "按部就班", meaning: "按照一定的步骤、顺序进行。", tone: "中性或略带褒义", misuse: "强调条理性和规范性，不能误作消极拖沓。", example: "复习初期应按部就班完成模块基础训练。", synonyms: "循序渐进", antonyms: "杂乱无章" },
  { word: "爱莫能助", meaning: "虽然有心帮助，但无力做到。", tone: "中性偏消极", misuse: "重点是有心无力，不是完全不愿帮助。", example: "材料不足时，老师也爱莫能助。", synonyms: "无能为力", antonyms: "鼎力相助" },
  { word: "黯然失色", meaning: "相形之下暗淡无光或失去光彩。", tone: "贬义", misuse: "用于比较后的失色，不等于心情低落。", example: "新技术让旧方案黯然失色。", synonyms: "相形见绌", antonyms: "光彩夺目" },
  { word: "按图索骥", meaning: "按照线索寻找，也比喻办事机械死板。", tone: "中性或贬义", misuse: "看语境判断是按线索寻找还是机械照搬。", example: "做题不能只按图索骥，要理解规律。", synonyms: "照本宣科", antonyms: "随机应变" },
  { word: "比比皆是", meaning: "到处都是，形容很多。", tone: "中性", misuse: "只强调数量多，不强调珍贵。", example: "类似案例在基层治理中比比皆是。", synonyms: "俯拾皆是", antonyms: "凤毛麟角" },
  { word: "标本兼治", meaning: "既解决表面问题，也解决根本问题。", tone: "褒义", misuse: "不能只写治标措施。", example: "治理污染要标本兼治。", synonyms: "综合治理", antonyms: "头痛医头" },
  { word: "步步为营", meaning: "每一步都谨慎部署，稳扎稳打。", tone: "褒义", misuse: "不等于行动缓慢，而是谨慎有计划。", example: "备考强化期应步步为营。", synonyms: "稳扎稳打", antonyms: "急于求成" },
  { word: "别出心裁", meaning: "构思新颖，与众不同。", tone: "褒义", misuse: "用于有创意的设计或想法。", example: "这份宣传方案别出心裁。", synonyms: "独具匠心", antonyms: "千篇一律" },
  { word: "博采众长", meaning: "广泛采纳各方面长处。", tone: "褒义", misuse: "强调吸收优点，不是简单拼凑。", example: "基层治理需要博采众长。", synonyms: "集思广益", antonyms: "闭门造车" },
  { word: "背道而驰", meaning: "方向或目标完全相反。", tone: "贬义", misuse: "强调方向相反，不只是差别大。", example: "形式主义与为民服务背道而驰。", synonyms: "南辕北辙", antonyms: "殊途同归" },
  { word: "不动声色", meaning: "态度镇静，不流露感情。", tone: "中性偏褒义", misuse: "强调外表平静。", example: "他不动声色地处理突发情况。", synonyms: "从容不迫", antonyms: "大惊失色" },
  { word: "不负众望", meaning: "没有辜负大家期望。", tone: "褒义", misuse: "与“不孚众望”相反。", example: "项目团队不负众望完成任务。", synonyms: "众望所归", antonyms: "不孚众望" },
  { word: "不孚众望", meaning: "不能使大家信服，不符合众人期望。", tone: "贬义", misuse: "极易误作“不负众望”。", example: "草率决策最终不孚众望。", synonyms: "大失所望", antonyms: "不负众望" },
  { word: "不刊之论", meaning: "不可改动的正确言论。", tone: "褒义", misuse: "“刊”是削改，不是刊登。", example: "前人的判断堪称不刊之论。", synonyms: "至理名言", antonyms: "无稽之谈" },
  { word: "不以为然", meaning: "不认为是对的。", tone: "中性偏贬义", misuse: "与“不以为意”区分，前者是不认同。", example: "他对这种说法不以为然。", synonyms: "嗤之以鼻", antonyms: "深以为然" },
  { word: "不以为意", meaning: "不把事情放在心上。", tone: "中性偏贬义", misuse: "不是不同意，而是不重视。", example: "他对提醒不以为意。", synonyms: "满不在乎", antonyms: "郑重其事" },
  { word: "差强人意", meaning: "大体上还能令人满意。", tone: "中性", misuse: "不是很差，而是勉强满意。", example: "这次模拟结果差强人意。", synonyms: "尚可", antonyms: "大失所望" },
  { word: "惨淡经营", meaning: "费尽心力经营谋划。", tone: "中性", misuse: "不一定表示经营惨淡。", example: "团队多年惨淡经营，终于形成品牌。", synonyms: "苦心经营", antonyms: "坐享其成" },
  { word: "层出不穷", meaning: "接连不断地出现。", tone: "中性", misuse: "强调连续出现。", example: "新业态层出不穷。", synonyms: "接连不断", antonyms: "寥寥无几" },
  { word: "沧海一粟", meaning: "大海中的一粒谷子，比喻非常渺小。", tone: "中性", misuse: "强调渺小，不是稀少珍贵。", example: "个人力量虽如沧海一粟，也能汇聚成势。", synonyms: "九牛一毛", antonyms: "举足轻重" },
  { word: "大相径庭", meaning: "差别很大。", tone: "中性", misuse: "不一定完全相反。", example: "两种方案效果大相径庭。", synonyms: "迥然不同", antonyms: "如出一辙" },
  { word: "独树一帜", meaning: "自成一家，风格独特。", tone: "褒义", misuse: "强调独特性和体系性。", example: "该地治理模式独树一帜。", synonyms: "自成一家", antonyms: "亦步亦趋" },
  { word: "耳濡目染", meaning: "经常听到看到而自然受到影响。", tone: "中性", misuse: "强调长期环境影响。", example: "孩子在书香环境中耳濡目染。", synonyms: "潜移默化", antonyms: "置若罔闻" },
  { word: "纷至沓来", meaning: "接连不断地到来。", tone: "中性", misuse: "多用于人、消息、订单等不断到来。", example: "政策出台后咨询纷至沓来。", synonyms: "络绎不绝", antonyms: "门可罗雀" },
  { word: "浮光掠影", meaning: "观察不细致，印象不深。", tone: "贬义", misuse: "不是速度快，而是浅尝辄止。", example: "调研不能浮光掠影。", synonyms: "走马观花", antonyms: "入木三分" },
  { word: "凤毛麟角", meaning: "珍贵而稀少的人或物。", tone: "褒义", misuse: "强调又少又珍贵。", example: "复合型人才凤毛麟角。", synonyms: "寥若晨星", antonyms: "比比皆是" },
  { word: "刚愎自用", meaning: "固执己见，不听别人意见。", tone: "贬义", misuse: "用于批评独断固执。", example: "管理者不能刚愎自用。", synonyms: "独断专行", antonyms: "从善如流" },
  { word: "汗牛充栋", meaning: "书籍极多。", tone: "中性", misuse: "通常只形容书多，不形容商品多。", example: "相关研究汗牛充栋。", synonyms: "浩如烟海", antonyms: "寥寥无几" },
  { word: "好高骛远", meaning: "不切实际地追求过高目标。", tone: "贬义", misuse: "强调脱离实际。", example: "备考不能好高骛远。", synonyms: "眼高手低", antonyms: "脚踏实地" },
  { word: "讳莫如深", meaning: "把事情隐瞒得很深。", tone: "贬义", misuse: "不是内容深奥，而是有意隐瞒。", example: "对问题讳莫如深不利于改进。", synonyms: "秘而不宣", antonyms: "直言不讳" },
  { word: "集腋成裘", meaning: "积少成多。", tone: "褒义", misuse: "强调长期积累。", example: "每日积累素材，集腋成裘。", synonyms: "积少成多", antonyms: "杯水车薪" },
  { word: "见微知著", meaning: "由小细节看出发展趋势或本质。", tone: "褒义", misuse: "强调洞察力。", example: "基层干部要见微知著。", synonyms: "以小见大", antonyms: "管中窥豹" },
  { word: "举重若轻", meaning: "处理困难问题显得轻松。", tone: "褒义", misuse: "强调能力强，不是事情本身轻。", example: "他处理复杂矛盾举重若轻。", synonyms: "游刃有余", antonyms: "力不从心" },
  { word: "空穴来风", meaning: "消息并非完全没有根据。", tone: "中性", misuse: "原义不是毫无根据，现代也常被误用。", example: "这些传闻未必空穴来风。", synonyms: "事出有因", antonyms: "无中生有" },
  { word: "琳琅满目", meaning: "美好的东西很多。", tone: "褒义", misuse: "多形容物品美好繁多。", example: "展厅里文创产品琳琅满目。", synonyms: "美不胜收", antonyms: "寥寥无几" },
  { word: "屡见不鲜", meaning: "经常见到，不觉得新鲜。", tone: "中性", misuse: "不能写成“屡见不显”。", example: "类似现象屡见不鲜。", synonyms: "司空见惯", antonyms: "前所未有" },
  { word: "洛阳纸贵", meaning: "作品广为流传，风行一时。", tone: "褒义", misuse: "不是纸价真的上涨。", example: "新书出版后一时洛阳纸贵。", synonyms: "风靡一时", antonyms: "无人问津" },
  { word: "美轮美奂", meaning: "形容建筑高大华美，后也形容装饰布置精美。", tone: "褒义", misuse: "不宜泛指一切美好事物。", example: "新建场馆美轮美奂。", synonyms: "富丽堂皇", antonyms: "破旧不堪" },
  { word: "南辕北辙", meaning: "行动和目的相反。", tone: "贬义", misuse: "强调方向与目标相反。", example: "方法错误会与目标南辕北辙。", synonyms: "背道而驰", antonyms: "殊途同归" },
  { word: "抛砖引玉", meaning: "用粗浅意见引出高明见解。", tone: "谦辞", misuse: "只能用于自己，不能用于别人。", example: "我先抛砖引玉，谈一点看法。", synonyms: "引玉之砖", antonyms: "一锤定音" },
  { word: "萍水相逢", meaning: "素不相识的人偶然相遇。", tone: "中性", misuse: "强调偶遇，不是关系亲密。", example: "两人萍水相逢却相谈甚欢。", synonyms: "不期而遇", antonyms: "朝夕相处" },
  { word: "扑朔迷离", meaning: "事情错综复杂，难以辨清。", tone: "中性", misuse: "多形容案情、局势。", example: "事件真相扑朔迷离。", synonyms: "错综复杂", antonyms: "一清二楚" },
  { word: "期期艾艾", meaning: "形容口吃，说话不流利。", tone: "中性", misuse: "不是期待的意思。", example: "他紧张得期期艾艾。", synonyms: "吞吞吐吐", antonyms: "口若悬河" },
  { word: "罄竹难书", meaning: "罪行多得写不完。", tone: "贬义", misuse: "只能形容罪恶多，不能形容成绩多。", example: "其恶行罄竹难书。", synonyms: "罪恶累累", antonyms: "功德无量" },
  { word: "趋之若鹜", meaning: "像鸭子一样成群跑去，形容追逐不好的事物。", tone: "贬义", misuse: "不能用于正面追捧。", example: "投机机会让一些人趋之若鹜。", synonyms: "蜂拥而至", antonyms: "敬而远之" },
  { word: "如履薄冰", meaning: "像走在薄冰上，形容谨慎戒惧。", tone: "中性", misuse: "强调谨慎，不是危险已经发生。", example: "处理群众诉求要如履薄冰。", synonyms: "小心翼翼", antonyms: "掉以轻心" },
  { word: "首当其冲", meaning: "最先受到攻击或遭遇灾难。", tone: "中性", misuse: "不是首先做某事。", example: "自然灾害中低洼地区首当其冲。", synonyms: "首先遭殃", antonyms: "安然无恙" },
  { word: "首屈一指", meaning: "居第一位。", tone: "褒义", misuse: "强调排名第一。", example: "该产业规模在当地首屈一指。", synonyms: "名列前茅", antonyms: "榜上无名" },
  { word: "望其项背", meaning: "能够赶得上，多用于否定。", tone: "中性", misuse: "“难以望其项背”才是赶不上。", example: "后来者难以望其项背。", synonyms: "望尘莫及", antonyms: "并驾齐驱" },
  { word: "文不加点", meaning: "文章一气呵成，无须修改。", tone: "褒义", misuse: "“点”是涂改，不是标点。", example: "他才思敏捷，文不加点。", synonyms: "一挥而就", antonyms: "反复推敲" },
  { word: "相形见绌", meaning: "相比之下显出不足。", tone: "贬义", misuse: "必须有比较对象。", example: "旧办法与新机制相比相形见绌。", synonyms: "黯然失色", antonyms: "相得益彰" },
  { word: "休戚相关", meaning: "利害关系密切。", tone: "中性", misuse: "强调利益祸福相关。", example: "区域发展与民生改善休戚相关。", synonyms: "息息相关", antonyms: "漠不相关" },
  { word: "一蹴而就", meaning: "一下子就成功。", tone: "中性", misuse: "常用于否定句。", example: "能力提升不可能一蹴而就。", synonyms: "一举成功", antonyms: "循序渐进" },
  { word: "炙手可热", meaning: "权势大、气焰盛，也可形容很热门。", tone: "中性或贬义", misuse: "传统多含贬义，考试要看语境。", example: "热门专业一度炙手可热。", synonyms: "风头正劲", antonyms: "无人问津" },
];

function getAiButtons(section) {
  const module = section.dataset.module || "";
  const topic = section.dataset.topic || "";
  if (section.querySelector(".shenlun-actions")) {
    return [
      ["explain", "AI讲解该题型"],
      ["template", "AI生成答题模板"],
      ["generate_questions", "AI生成练习题"],
    ];
  }
  if (section.querySelector(".knowledge-actions")) {
    return [["generate_questions", "AI生成考点题"]];
  }
  return [
    ["explain", "AI讲解这个知识点"],
    ["generate_questions", "AI生成5道同类题"],
    ["summarize_mistakes", "AI帮我总结易错点"],
  ];
}

function initDocAiActions() {
  const resultEl = document.querySelector("#docAiResult");
  const sections = document.querySelectorAll(".doc-section[data-module][data-topic]");
  if (!resultEl || !sections.length) return;

  sections.forEach((section) => {
    const row = section.querySelector(".ai-action-row");
    if (!row || row.children.length) return;
    const module = section.dataset.module;
    const topic = section.dataset.topic;
    row.innerHTML = getAiButtons(section).map(([action, label]) => `
      <button class="btn mini" type="button" data-ai-endpoint data-module="${escapeHtml(module)}" data-topic="${escapeHtml(topic)}" data-action="${action}">
        ${label}
      </button>
    `).join("");
  });

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-ai-endpoint]");
    if (!button) return;
    const module = button.dataset.module;
    const topic = button.dataset.topic;
    const action = button.dataset.action;
    const path = location.pathname.includes("shenlun") ? "/api/shenlun" : location.pathname.includes("knowledge") ? "/api/knowledge" : "/api/xingce";
    setLoading(resultEl, button, `AI 正在处理：${topic}...`);
    try {
      const data = await postJson(path, { module, topic, action });
      renderResult(resultEl, data.result || "暂未生成内容，请稍后重试。");
      resultEl.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (error) {
      showError(resultEl, error.message || "AI接口暂时不可用，请检查 Deno 服务或 API 配置。");
    } finally {
      clearLoading(button);
    }
  });
}

function renderIdiomCards(resultEl, items) {
  if (!items.length) {
    resultEl.innerHTML = `<div class="empty-state">本地成语库未匹配到结果，将尝试调用 AI 解释。</div>`;
    return;
  }

  resultEl.innerHTML = items.map((item) => `
    <article class="idiom-card">
      <h2>${escapeHtml(item.word)}</h2>
      <p><strong>释义：</strong>${escapeHtml(item.meaning)}</p>
      <p><strong>感情色彩：</strong><span class="tag">${escapeHtml(item.tone)}</span></p>
      <p><strong>常见误用：</strong>${escapeHtml(item.misuse)}</p>
      <p><strong>示例句：</strong>${escapeHtml(item.example)}</p>
      <p><strong>近义词：</strong>${escapeHtml(item.synonyms)}</p>
      <p><strong>反义词：</strong>${escapeHtml(item.antonyms)}</p>
    </article>
  `).join("");
}

function initIdiomSearch() {
  const form = document.querySelector("#idiomForm");
  const resultEl = document.querySelector("#idiomResult");
  const aiResultEl = document.querySelector("#idiomAiResult");
  if (!form || !resultEl || !aiResultEl) return;

  renderIdiomCards(resultEl, IDIOM_DATA.slice(0, 8));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type='submit']");
    const keyword = String(new FormData(form).get("keyword") || "").trim();
    if (!keyword) {
      renderIdiomCards(resultEl, IDIOM_DATA.slice(0, 8));
      showError(aiResultEl, "请输入成语或关键词。");
      return;
    }

    const matched = IDIOM_DATA.filter((item) =>
      [item.word, item.meaning, item.misuse, item.example].some((value) => value.includes(keyword)),
    );
    renderIdiomCards(resultEl, matched);

    if (matched.length) {
      aiResultEl.classList.add("empty-state");
      aiResultEl.dataset.rawResult = "";
      aiResultEl.innerHTML = "已在本地成语库中找到结果，未调用 AI。";
      return;
    }

    setLoading(aiResultEl, button, `本地未找到，AI 正在解释：${keyword}...`);
    try {
      const data = await postJson("/api/idiom", { keyword, action: "explain" });
      renderResult(aiResultEl, data.result || "暂未生成内容，请稍后重试。");
    } catch (error) {
      showError(aiResultEl, error.message || "AI接口暂时不可用，请检查 Deno 服务或 API 配置。");
    } finally {
      clearLoading(button);
    }
  });
}

initNavToggle();
setActiveNav();
initCopyButtons();
initPlannerForm();
initWrongForm();
initDailyForm();
initJobForm();
initXingceAbility();
initScoreEstimator();
initWeakDiagnosis();
initDocAiActions();
initIdiomSearch();
