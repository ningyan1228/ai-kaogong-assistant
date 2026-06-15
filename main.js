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
      }, 1800);
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
      showError(resultEl, error.message || "生成失败，请检查 Deno 后端地址和环境变量。");
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
    } catch (error) {
      showError(resultEl, error.message || "复盘失败，请检查 Deno 后端地址和环境变量。");
    } finally {
      clearLoading(button);
    }
  });
}

setActiveNav();
initCopyButtons();
initPlannerForm();
initWrongForm();
