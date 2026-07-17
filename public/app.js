const loginView = document.querySelector("#loginView");
const appView = document.querySelector("#appView");
const authError = document.querySelector("#authError");
const currentUser = document.querySelector("#currentUser");
const signOut = document.querySelector("#signOut");
const disconnectGoogle = document.querySelector("#disconnectGoogle");
const appShell = document.querySelector("#appView");
const sidebar = document.querySelector("#sidebar");
const collapseSidebar = document.querySelector("#collapseSidebar");
const expandSidebar = document.querySelector("#expandSidebar");
const navSettings = document.querySelector("#navSettings");
const navPreview = document.querySelector("#navPreview");
const settingsPage = document.querySelector("#settingsPage");
const previewPage = document.querySelector("#previewPage");
const form = document.querySelector("#settingsForm");
const senderEmail = document.querySelector("#senderEmail");
const recipientEmail = document.querySelector("#recipientEmail");
const dailySendingEnabled = document.querySelector("#dailySendingEnabled");
const sendTime = document.querySelector("#sendTime");
const categories = document.querySelector("#categories");
const addCategory = document.querySelector("#addCategory");
const runNow = document.querySelector("#runNow");
const statusPill = document.querySelector("#status");
const statusDot = document.querySelector("#statusDot");
const saveState = document.querySelector("#saveState");
const preview = document.querySelector("#preview");
const template = document.querySelector("#categoryTemplate");
const formatToggle = document.querySelector("#formatToggle");
const formatParagraph = document.querySelector("#formatParagraph");
const formatBullets = document.querySelector("#formatBullets");
const langEnglish = document.querySelector("#langEnglish");
const langChinese = document.querySelector("#langChinese");

let state = null;
let userEmail = "";
let lastDigestResult = null;
let summaryFormat = localStorage.getItem("summaryFormat") === "bullets" ? "bullets" : "paragraph";
let language = localStorage.getItem("resultLanguage") === "zh" ? "zh" : "en";
const bulletCache = new Map();
const translationCache = new Map();
let deferredSummaries = new Map();
let summaryIdCounter = 0;
let translateSources = new Map();
let translateIdCounter = 0;
let currentPage = "settings";

function emptyPreviewHtml(message = "Save your settings, then click “Generate&nbsp;Now” to test once. If Gmail sending is not available, this area will show a preview.") {
  return `
    <div class="empty-newspaper" aria-hidden="true">
      <span class="skeleton-title"></span>
      <span class="skeleton-body"></span>
      <span class="skeleton-lines"><i></i><i></i><i></i></span>
    </div>
    <p>${message}</p>
  `;
}

function setPage(page) {
  currentPage = page === "preview" ? "preview" : "settings";
  const onSettings = currentPage === "settings";
  settingsPage.hidden = !onSettings;
  previewPage.hidden = onSettings;
  runNow.hidden = !onSettings;
  navSettings.classList.toggle("active", onSettings);
  navPreview.classList.toggle("active", !onSettings);
  if (onSettings) {
    navSettings.setAttribute("aria-current", "step");
    navPreview.removeAttribute("aria-current");
  } else {
    navSettings.removeAttribute("aria-current");
    navPreview.setAttribute("aria-current", "step");
  }
}

function setSavedState(saved) {
  saveState.classList.toggle("unsaved", !saved);
  saveState.innerHTML = saved
    ? '<span aria-hidden="true">✓</span><span>All changes saved</span>'
    : '<span aria-hidden="true">○</span><span>Unsaved changes</span>';
}

function markDirty() {
  setSavedState(false);
}

function parseKeywords(value = "") {
  return String(value)
    .split(/[,，;\n]/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

function normalizeKeyword(value = "") {
  return String(value).replace(/\s+/g, " ").trim().toLowerCase();
}

function focusHasKeyword(focus = "", keyword = "") {
  const normalizedKeyword = normalizeKeyword(keyword);
  if (!normalizedKeyword) return false;
  return parseKeywords(focus).some((item) => normalizeKeyword(item) === normalizedKeyword);
}

function formatKeywords(keywords = []) {
  return keywords.filter(Boolean).join(", ");
}

function getGeneratedKeywords(category = {}) {
  if (Array.isArray(category.generatedKeywords)) return category.generatedKeywords;
  return Array.isArray(category.keywords) ? category.keywords : [];
}

function getCustomKeywords(category = {}) {
  if (Array.isArray(category.customKeywords)) return category.customKeywords;
  return Array.isArray(category.keywords) ? category.keywords : [];
}

function getInitialFocus(category = {}) {
  if (typeof category.focus === "string" && category.focus.trim()) return category.focus;
  const legacyKeywords = getCustomKeywords(category);
  if (legacyKeywords.length) return formatKeywords(legacyKeywords);
  return formatKeywords(getGeneratedKeywords(category));
}

function getNodeGeneratedKeywords(node) {
  try {
    const parsed = JSON.parse(node.dataset.generatedKeywords || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setNodeGeneratedKeywords(node, keywords = []) {
  node.dataset.generatedKeywords = JSON.stringify(keywords.filter(Boolean));
}

function getSelectedKeywordIndexes(node) {
  try {
    const parsed = JSON.parse(node.dataset.selectedKeywordIndexes || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setSelectedKeywordIndexes(node, indexes = []) {
  node.dataset.selectedKeywordIndexes = JSON.stringify(indexes);
}

function renderKeywordControls(node) {
  const generatedKeywords = getNodeGeneratedKeywords(node);
  const selectedIndexes = new Set(getSelectedKeywordIndexes(node).map(String));
  const generatedList = node.querySelector(".generated-keyword-list");
  const addButton = node.querySelector(".add-keywords-to-focus");
  const generateButton = node.querySelector(".generate-keywords");
  const focusValue = node.querySelector(".category-focus").value;
  const addableSelectedCount = generatedKeywords.filter((keyword, index) =>
    selectedIndexes.has(String(index)) && !focusHasKeyword(focusValue, keyword)
  ).length;
  addButton.disabled = addableSelectedCount === 0;
  addButton.textContent = addableSelectedCount ? `Add to focus (${addableSelectedCount})` : "Add to focus";
  if (!generateButton.disabled) {
    generateButton.textContent = generatedKeywords.length ? "Regenerate keywords" : "Generate keywords";
  }

  if (!generatedKeywords.length) {
    generatedList.innerHTML = `<span class="keyword-empty">No generated keywords yet.</span>`;
    return;
  }

  const chips = generatedKeywords
    .map((keyword, index) => {
      const inFocus = focusHasKeyword(focusValue, keyword);
      const selected = selectedIndexes.has(String(index));
      return [
        `<button class="keyword-chip${selected ? " selected" : ""}${inFocus ? " in-focus" : ""}"`,
        `type="button" data-keyword-index="${index}" aria-pressed="${selected}"`,
        inFocus ? `disabled title="Already in Focus"` : "",
        `>${escapeHtml(keyword)}</button>`
      ].filter(Boolean).join(" ");
    })
    .join("");
  generatedList.innerHTML = chips;
}

function toggleKeywordSelection(node, index) {
  const generatedKeywords = getNodeGeneratedKeywords(node);
  const keyword = generatedKeywords[Number(index)];
  if (focusHasKeyword(node.querySelector(".category-focus").value, keyword)) return;

  const selected = new Set(getSelectedKeywordIndexes(node).map(String));
  const key = String(index);
  if (selected.has(key)) {
    selected.delete(key);
  } else {
    selected.add(key);
  }
  setSelectedKeywordIndexes(node, [...selected]);
  renderKeywordControls(node);
}

function addSelectedKeywordsToFocus(node) {
  const focusInput = node.querySelector(".category-focus");
  const generatedKeywords = getNodeGeneratedKeywords(node);
  const selectedKeywords = getSelectedKeywordIndexes(node)
    .map((index) => generatedKeywords[Number(index)])
    .filter(Boolean);
  const existing = focusInput.value.trim();
  const keywordsToAdd = selectedKeywords.filter((keyword) => !focusHasKeyword(existing, keyword));

  if (keywordsToAdd.length) {
    focusInput.value = existing ? `${existing}, ${keywordsToAdd.join(", ")}` : keywordsToAdd.join(", ");
    node.dataset.generatedKeywordsStale = "true";
    markDirty();
    setStatus("Added to focus");
  } else {
    setStatus("Already in focus");
  }

  setSelectedKeywordIndexes(node, []);
  renderKeywordControls(node);
  focusInput.focus();
}

function setStatus(text) {
  const normalized = String(text).toLowerCase();
  const isWorking = normalized.includes("generat") || normalized === "saving" || normalized === "loading";
  const isFailed = normalized.includes("fail") || normalized.includes("error") || normalized.includes("reconnect");
  const label = text === "Sent" ? "Delivered" : isWorking ? "Working" : isFailed ? "Failed" : "Ready";
  statusPill.textContent = label;
  statusDot.classList.toggle("working", isWorking);
  statusDot.classList.toggle("failed", isFailed);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options
  });
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Server returned ${response.status} for ${path}`);
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function showLogin(message = "") {
  appView.hidden = true;
  loginView.hidden = false;
  if (message) {
    authError.hidden = false;
    authError.textContent = message;
  } else {
    authError.hidden = true;
    authError.textContent = "";
  }
}

function showApp(session) {
  loginView.hidden = true;
  appView.hidden = false;
  userEmail = session.email;
  currentUser.textContent = userEmail;
}

function renderCategories() {
  categories.innerHTML = "";
  state.categories.forEach((category) => {
    const node = template.content.firstElementChild.cloneNode(true);
    const nameInput = node.querySelector(".category-name");
    const focusInput = node.querySelector(".category-focus");
    const generateKeywordsButton = node.querySelector(".generate-keywords");
    const addKeywordsButton = node.querySelector(".add-keywords-to-focus");
    const advancedToggle = node.querySelector(".advanced-toggle");
    node.dataset.id = category.id;
    node.dataset.keywordMode = "auto";
    node.dataset.generatedKeywordsStale = category.generatedKeywordsStale ? "true" : "false";
    setSelectedKeywordIndexes(node, []);
    setNodeGeneratedKeywords(node, getGeneratedKeywords(category));
    node.querySelector(".category-enabled").checked = category.enabled;
    nameInput.value = category.name;
    node.querySelector(".category-count").value = category.itemCount || 1;
    focusInput.value = getInitialFocus(category);
    renderKeywordControls(node);
    node.querySelector(".remove-category").addEventListener("click", () => {
      state.categories = state.categories.filter((item) => item.id !== category.id);
      renderCategories();
      markDirty();
    });
    advancedToggle.addEventListener("click", () => {
      const advancedPanel = node.querySelector(".advanced-panel");
      const isOpening = advancedPanel.hidden;
      advancedPanel.hidden = !isOpening;
      advancedToggle.setAttribute("aria-expanded", String(isOpening));
    });
    node.querySelector(".generated-keyword-list").addEventListener("click", (event) => {
      const chip = event.target.closest(".keyword-chip[data-keyword-index]");
      if (!chip) return;
      toggleKeywordSelection(node, chip.dataset.keywordIndex);
    });
    addKeywordsButton.addEventListener("click", () => {
      addSelectedKeywordsToFocus(node);
    });
    generateKeywordsButton.addEventListener("click", () => {
      generateKeywordsForCategory(node);
    });
    nameInput.addEventListener("input", () => {
      node.dataset.generatedKeywordsStale = "true";
      renderKeywordControls(node);
    });
    focusInput.addEventListener("input", () => {
      node.dataset.generatedKeywordsStale = "true";
      renderKeywordControls(node);
    });
    categories.appendChild(node);
  });
}

async function generateKeywordsForCategory(node) {
  const nameInput = node.querySelector(".category-name");
  const focusInput = node.querySelector(".category-focus");
  const button = node.querySelector(".generate-keywords");
  const categoryName = nameInput.value.trim();
  const focus = focusInput.value.trim();
  const excludedKeywords = [
    ...parseKeywords(focus),
    ...getNodeGeneratedKeywords(node)
  ];

  if ((!categoryName || categoryName === "New Category") && !focus) return;

  button.disabled = true;
  setSelectedKeywordIndexes(node, []);
  button.textContent = "Generating";
  setStatus("Generating keywords");

  try {
    const result = await api("/api/keywords", {
      method: "POST",
      body: JSON.stringify({
        categoryName: categoryName || "Untitled",
        focus,
        excludedKeywords
      })
    });
    if (Array.isArray(result.keywords)) {
      setNodeGeneratedKeywords(node, result.keywords);
      node.dataset.generatedKeywordsStale = "false";
      renderKeywordControls(node);
      markDirty();
      setStatus(result.keywords.length ? "Keywords ready" : "No new keywords");
    }
  } catch (error) {
    setStatus("Keyword failed");
    alert(error.message);
  } finally {
    button.disabled = false;
    button.textContent = getNodeGeneratedKeywords(node).length ? "Regenerate keywords" : "Generate keywords";
  }
}

function readFormState() {
  return {
    ...state,
    senderEmail: userEmail,
    recipientEmail: userEmail,
    dailySendingEnabled: dailySendingEnabled.checked,
    sendTime: sendTime.value || "08:00",
    categories: [...categories.querySelectorAll(".category-card")].map((node) => {
      const previous = state.categories.find((item) => item.id === node.dataset.id) || {};
      const generatedKeywords = getNodeGeneratedKeywords(node);
      const focus = node.querySelector(".category-focus").value.trim();
      const keywords = parseKeywords(focus);
      return {
        id: node.dataset.id,
        enabled: node.querySelector(".category-enabled").checked,
        name: node.querySelector(".category-name").value.trim() || "Untitled",
        focus,
        itemCount: Number(node.querySelector(".category-count").value || 1),
        researchFocused: previous.researchFocused || false,
        companyFocused: previous.companyFocused || false,
        politicalFocused: previous.politicalFocused || false,
        keywordMode: "auto",
        generatedKeywords,
        customKeywords: keywords,
        generatedKeywordsStale: node.dataset.generatedKeywordsStale === "true",
        keywords
      };
    })
  };
}

function getBulletCacheKey(article) {
  return `${article.title}|${article.summary}`;
}

function formatInlineBold(value = "") {
  return escapeHtml(value).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function renderBulletHtml(text = "") {
  const lines = String(text).replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let listItems = [];
  const flushList = () => {
    if (listItems.length) {
      html.push(`<ul class="bullet-list">${listItems.join("")}</ul>`);
      listItems = [];
    }
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/);
    if (bulletMatch) {
      listItems.push(`<li>${formatInlineBold(bulletMatch[1])}</li>`);
    } else {
      flushList();
      html.push(`<p>${formatInlineBold(trimmed)}</p>`);
    }
  }
  flushList();
  return html.join("");
}

async function getBullets(article) {
  const key = getBulletCacheKey(article);
  if (bulletCache.has(key)) return bulletCache.get(key);
  const result = await api("/api/bullets", {
    method: "POST",
    body: JSON.stringify({
      title: article.title,
      timestamp: enArticleTime(article),
      paragraph: article.summary
    })
  });
  bulletCache.set(key, result.bullets);
  return result.bullets;
}

async function getTranslation(text) {
  if (translationCache.has(text)) return translationCache.get(text);
  const result = await api("/api/translate", {
    method: "POST",
    body: JSON.stringify({ text })
  });
  translationCache.set(text, result.translation);
  return result.translation;
}

function renderSummaryInner(text, isBullets) {
  return isBullets ? renderBulletHtml(text) : escapeHtml(text);
}

function articleSummaryHtml(article) {
  const isBullets = summaryFormat === "bullets";
  const classes = isBullets ? "article-summary bullet-summary" : "article-summary";
  const english = isBullets
    ? (bulletCache.has(getBulletCacheKey(article)) ? bulletCache.get(getBulletCacheKey(article)) : null)
    : article.summary;

  if (english !== null) {
    if (language !== "zh") {
      return `<div class="${classes}">${renderSummaryInner(english, isBullets)}</div>`;
    }
    if (translationCache.has(english)) {
      return `<div class="${classes}">${renderSummaryInner(translationCache.get(english), isBullets)}</div>`;
    }
  }

  const id = String(summaryIdCounter += 1);
  deferredSummaries.set(id, { article, isBullets });
  const inner = english !== null
    ? renderSummaryInner(english, isBullets)
    : escapeHtml(language === "zh" ? "正在生成…" : "Converting to bullet points…");
  return `<div class="${classes} summary-pending" data-summary-id="${id}">${inner}</div>`;
}

async function fillSummaries() {
  const nodes = [...preview.querySelectorAll(".summary-pending[data-summary-id]")];
  await Promise.all(nodes.map(async (element) => {
    const source = deferredSummaries.get(element.dataset.summaryId);
    if (!source) return;
    const { article, isBullets } = source;
    try {
      const english = isBullets ? await getBullets(article) : article.summary;
      const display = language === "zh" ? await getTranslation(english) : english;
      if (!element.isConnected) return;
      element.classList.remove("summary-pending");
      element.removeAttribute("data-summary-id");
      element.innerHTML = renderSummaryInner(display, isBullets);
    } catch (error) {
      if (!element.isConnected) return;
      element.classList.remove("summary-pending");
      element.classList.add("bullet-error");
      element.textContent = error.message || "Failed to process this summary.";
    }
  }));
}

function tText(value) {
  const text = String(value ?? "");
  if (language !== "zh" || !text.trim()) return escapeHtml(text);
  if (translationCache.has(text)) return escapeHtml(translationCache.get(text));
  const id = String(translateIdCounter += 1);
  translateSources.set(id, text);
  return `<span class="text-pending" data-translate-id="${id}">${escapeHtml(text)}</span>`;
}

async function fillTranslations() {
  const nodes = [...preview.querySelectorAll(".text-pending[data-translate-id]")];
  await Promise.all(nodes.map(async (element) => {
    const text = translateSources.get(element.dataset.translateId);
    if (text == null) return;
    try {
      const zh = await getTranslation(text);
      if (!element.isConnected || language !== "zh") return;
      element.classList.remove("text-pending");
      element.removeAttribute("data-translate-id");
      element.textContent = zh;
    } catch {
      // Leave the English fallback in place on failure.
    }
  }));
}

function renderDigest(result) {
  lastDigestResult = result;
  deferredSummaries = new Map();
  translateSources = new Map();
  const digest = result.digest;
  const sections = digest.categories.map((category) => {
    const items = category.articles.map((article) => `
      <article class="digest-article">
        <a class="digest-headline" href="${escapeHtml(article.link)}" target="_blank" rel="noreferrer">${tText(article.title)}</a>
        ${articleSummaryHtml(article)}
        <small class="article-stamp">${escapeHtml(formatArticleTime(article))}</small>
      </article>
    `).join("");
    const emptyHtml = category.error
      ? tText(category.error)
      : escapeHtml(language === "zh" ? "今天没有找到相关文章。" : "No relevant articles were found today.");
    return `
      <section class="digest-section">
        <h4>${tText(category.name)}</h4>
        ${items || `<p class="empty-topic">${emptyHtml}</p>`}
      </section>
    `;
  }).join("");

  preview.className = `digest ${summaryFormat}`;
  const emailMessage = result.emailResult?.message ? `<p>${tText(result.emailResult.message)}</p>` : "";
  const briefingMessage = digest.briefingResult?.message ? `<p>${tText(digest.briefingResult.message)}</p>` : "";
  const mastheadTitle = language === "zh" ? "每日新闻" : "Daily News";
  const generatedLabel = language === "zh" ? "生成于 " : "Generated ";
  const footerLead = language === "zh" ? "发送至" : "Sent to";
  const footerTail = language === "zh" ? "，每日发送时间" : "daily at";
  preview.innerHTML = `
    ${(emailMessage || briefingMessage) ? `<div class="delivery-notices">${emailMessage}${briefingMessage}</div>` : ""}
    <div class="digest-masthead">
      <div class="digest-kicker">Daily Brief</div>
      <h3>${mastheadTitle}</h3>
      <div class="digest-generated">${generatedLabel}${escapeHtml(new Date(digest.generatedAt).toLocaleString(currentLocale()))}</div>
    </div>
    ${sections}
    <p class="digest-footer">${footerLead} <span>${escapeHtml(userEmail)}</span> ${footerTail} ${escapeHtml(sendTime.value || "08:00")}.</p>
  `;
  fillSummaries();
  if (language === "zh") fillTranslations();
}

function applySummaryFormat(format) {
  summaryFormat = format === "bullets" ? "bullets" : "paragraph";
  localStorage.setItem("summaryFormat", summaryFormat);
  formatParagraph.setAttribute("aria-pressed", String(summaryFormat === "paragraph"));
  formatBullets.setAttribute("aria-pressed", String(summaryFormat === "bullets"));
  formatParagraph.classList.toggle("active", summaryFormat === "paragraph");
  formatBullets.classList.toggle("active", summaryFormat === "bullets");
  if (lastDigestResult) {
    renderDigest(lastDigestResult);
  }
}

function applyLanguage(lang) {
  language = lang === "zh" ? "zh" : "en";
  localStorage.setItem("resultLanguage", language);
  langEnglish.setAttribute("aria-pressed", String(language === "en"));
  langChinese.setAttribute("aria-pressed", String(language === "zh"));
  langEnglish.classList.toggle("active", language === "en");
  langChinese.classList.toggle("active", language === "zh");
  if (lastDigestResult) {
    renderDigest(lastDigestResult);
  }
}

function currentLocale() {
  return language === "zh" ? "zh-CN" : "en-US";
}

function enArticleTime(article) {
  if (!article.publishedAt) return "";
  const date = new Date(article.publishedAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US");
}

function formatArticleTime(article) {
  if (!article.publishedAt) return "";
  const date = new Date(article.publishedAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(currentLocale());
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

async function saveConfig() {
  state = readFormState();
  await api("/api/config", {
    method: "PUT",
    body: JSON.stringify(state)
  });
}

function resetAppView() {
  userEmail = "";
  state = null;
  lastDigestResult = null;
  deferredSummaries = new Map();
  translateSources = new Map();
  categories.innerHTML = "";
  preview.className = "preview-empty";
  preview.innerHTML = emptyPreviewHtml();
  setPage("settings");
  setSavedState(true);
  setStatus("Ready");
}

navSettings.addEventListener("click", () => {
  setPage("settings");
});

navPreview.addEventListener("click", () => {
  setPage("preview");
});

collapseSidebar.addEventListener("click", () => {
  sidebar.hidden = true;
  expandSidebar.hidden = false;
  appShell.classList.add("sidebar-collapsed");
});

expandSidebar.addEventListener("click", () => {
  sidebar.hidden = false;
  expandSidebar.hidden = true;
  appShell.classList.remove("sidebar-collapsed");
});

const mobileSidebarQuery = window.matchMedia("(max-width: 700px)");
mobileSidebarQuery.addEventListener("change", (event) => {
  if (!event.matches) return;
  sidebar.hidden = false;
  expandSidebar.hidden = true;
  appShell.classList.remove("sidebar-collapsed");
});

formatParagraph.addEventListener("click", () => {
  applySummaryFormat("paragraph");
});

formatBullets.addEventListener("click", () => {
  applySummaryFormat("bullets");
});

langEnglish.addEventListener("click", () => {
  applyLanguage("en");
});

langChinese.addEventListener("click", () => {
  applyLanguage("zh");
});

applySummaryFormat(summaryFormat);
applyLanguage(language);

signOut.addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" });
  resetAppView();
  showLogin();
});

disconnectGoogle.addEventListener("click", async () => {
  if (!confirm("Disconnect Google for this account? Scheduled sending will stop until you sign in again.")) return;
  await api("/api/auth/disconnect", { method: "POST" });
  resetAppView();
  showLogin("Google was disconnected. Sign in again to resume sending.");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Saving");
  try {
    await saveConfig();
    setSavedState(true);
    setStatus("Saved");
  } catch (error) {
    setStatus("Save failed");
    alert(error.message);
  }
});

form.addEventListener("input", (event) => {
  if (!event.target.readOnly) markDirty();
});

form.addEventListener("change", (event) => {
  if (!event.target.readOnly) markDirty();
});

addCategory.addEventListener("click", () => {
  state.categories.push({
    id: `category-${Date.now()}`,
    name: "New Category",
    enabled: true,
    itemCount: 1,
    focus: "",
    keywordMode: "auto",
    generatedKeywords: [],
    customKeywords: [],
    generatedKeywordsStale: true,
    keywords: []
  });
  renderCategories();
  markDirty();
  const newNode = categories.lastElementChild;
  if (newNode) {
    newNode.querySelector(".category-name").select();
  }
});

runNow.addEventListener("click", async () => {
  setPage("preview");
  setStatus("Generating");
  preview.className = "preview-generating";
  preview.innerHTML = "<p>Composing your brief…</p>";
  runNow.disabled = true;
  runNow.querySelector("span").textContent = "Generating…";
  try {
    await saveConfig();
    setSavedState(true);
    const result = await api("/api/run", {
      method: "POST",
      body: JSON.stringify({ sendEmail: true })
    });
    renderDigest(result);
    setStatus(result.emailResult.sent ? "Sent" : "Preview");
  } catch (error) {
    setStatus("Failed");
    preview.className = "preview-empty";
    preview.innerHTML = emptyPreviewHtml(escapeHtml(error.message || "The brief could not be generated."));
    alert(error.message);
  } finally {
    runNow.disabled = false;
    runNow.querySelector("span").textContent = "Generate Now";
  }
});

async function init() {
  const session = await api("/api/auth/session");
  const url = new URL(window.location.href);
  const authMessage = url.searchParams.get("authError") || "";

  if (!session.authConfigured) {
    showLogin(`Google OAuth is not configured. Missing: ${(session.missing || []).join(", ")}`);
    return;
  }

  if (!session.authenticated) {
    showLogin(authMessage);
    return;
  }

  showApp(session);
  setStatus("Loading");
  state = await api("/api/config");
  senderEmail.value = userEmail;
  recipientEmail.value = userEmail;
  dailySendingEnabled.checked = state.dailySendingEnabled === true;
  sendTime.value = state.sendTime || "08:00";
  renderCategories();
  setPage("settings");
  setSavedState(true);
  if (session.needsReconnect) {
    setStatus("Reconnect needed");
    preview.className = "preview-empty";
    preview.innerHTML = emptyPreviewHtml(escapeHtml(session.reconnectReason || "Please sign in with Google again to allow Gmail sending."));
  } else {
    setStatus("Ready");
  }
}

init().catch((error) => {
  resetAppView();
  showLogin(error.message);
});
