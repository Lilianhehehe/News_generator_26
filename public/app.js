const loginView = document.querySelector("#loginView");
const appView = document.querySelector("#appView");
const authError = document.querySelector("#authError");
const currentUser = document.querySelector("#currentUser");
const signOut = document.querySelector("#signOut");
const disconnectGoogle = document.querySelector("#disconnectGoogle");
const form = document.querySelector("#settingsForm");
const senderEmail = document.querySelector("#senderEmail");
const recipientEmail = document.querySelector("#recipientEmail");
const sendTime = document.querySelector("#sendTime");
const categories = document.querySelector("#categories");
const addCategory = document.querySelector("#addCategory");
const runNow = document.querySelector("#runNow");
const statusPill = document.querySelector("#status");
const preview = document.querySelector("#preview");
const template = document.querySelector("#categoryTemplate");

let state = null;
let userEmail = "";
const keywordTimers = new WeakMap();

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
  const focusValue = node.querySelector(".category-focus").value;
  const isStale = node.dataset.generatedKeywordsStale === "true";
  const addableSelectedCount = generatedKeywords.filter((keyword, index) =>
    selectedIndexes.has(String(index)) && !focusHasKeyword(focusValue, keyword)
  ).length;
  addButton.disabled = addableSelectedCount === 0;
  addButton.textContent = addableSelectedCount ? `Add ${addableSelectedCount} to focus` : "Add to focus";

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
  generatedList.innerHTML = `${chips}${isStale ? `<span class="keyword-chip stale">Will refresh before search</span>` : ""}`;
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
    setStatus("Added to focus");
  } else {
    setStatus("Already in focus");
  }

  setSelectedKeywordIndexes(node, []);
  renderKeywordControls(node);
  focusInput.focus();
}

function setStatus(text) {
  statusPill.textContent = text;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options
  });
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
      generateKeywordsForCategory(node, { force: true });
    });
    nameInput.addEventListener("input", () => {
      node.dataset.generatedKeywordsStale = "true";
      renderKeywordControls(node);
      scheduleKeywordGeneration(node);
    });
    focusInput.addEventListener("input", () => {
      node.dataset.generatedKeywordsStale = "true";
      renderKeywordControls(node);
      scheduleKeywordGeneration(node);
    });
    nameInput.addEventListener("blur", () => {
      generateKeywordsForCategory(node);
    });
    focusInput.addEventListener("blur", () => {
      generateKeywordsForCategory(node);
    });
    categories.appendChild(node);
  });
}

function scheduleKeywordGeneration(node) {
  if (getNodeGeneratedKeywords(node).length) return;

  clearTimeout(keywordTimers.get(node));
  keywordTimers.set(node, setTimeout(() => {
    generateKeywordsForCategory(node);
  }, 700));
}

async function generateKeywordsForCategory(node, { force = false } = {}) {
  const nameInput = node.querySelector(".category-name");
  const focusInput = node.querySelector(".category-focus");
  const button = node.querySelector(".generate-keywords");
  const categoryName = nameInput.value.trim();
  const focus = focusInput.value.trim();

  if ((!categoryName || categoryName === "New Category") && !focus) return;
  if (!force && getNodeGeneratedKeywords(node).length && node.dataset.generatedKeywordsStale !== "true") return;

  clearTimeout(keywordTimers.get(node));
  button.disabled = true;
  setSelectedKeywordIndexes(node, []);
  button.textContent = "Generating";
  setStatus("Generating keywords");

  try {
    const result = await api("/api/keywords", {
      method: "POST",
      body: JSON.stringify({ categoryName: categoryName || "Untitled", focus })
    });
    if (Array.isArray(result.keywords) && result.keywords.length) {
      setNodeGeneratedKeywords(node, result.keywords);
      node.dataset.generatedKeywordsStale = "false";
      renderKeywordControls(node);
      setStatus("Keywords ready");
    }
  } catch (error) {
    setStatus("Keyword failed");
    alert(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Regenerate keywords";
  }
}

function readFormState() {
  return {
    ...state,
    senderEmail: userEmail,
    recipientEmail: userEmail,
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

function renderDigest(result) {
  const digest = result.digest;
  const sections = digest.categories.map((category) => {
    const items = category.articles.map((article) => `
      <li>
        <a href="${escapeHtml(article.link)}" target="_blank" rel="noreferrer">${escapeHtml(article.title)}</a>
        <div class="article-summary">${escapeHtml(article.summary)}</div>
        <small>${escapeHtml(formatArticleTime(article))}</small>
      </li>
    `).join("");
    return `
      <h3>${escapeHtml(category.name)}</h3>
      <ol>${items || `<li>${escapeHtml(category.error || "No relevant articles were found today.")}</li>`}</ol>
    `;
  }).join("");

  preview.className = "digest";
  const briefingMessage = digest.briefingResult?.message ? `<p>${escapeHtml(digest.briefingResult.message)}</p>` : "";
  preview.innerHTML = `
    <p>${escapeHtml(result.emailResult.message)}</p>
    ${briefingMessage}
    <p>Generated at: ${new Date(digest.generatedAt).toLocaleString("en-US")}</p>
    ${sections}
  `;
}

function formatArticleTime(article) {
  if (!article.publishedAt) return "";
  const date = new Date(article.publishedAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US");
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
  categories.innerHTML = "";
  preview.className = "preview-empty";
  preview.textContent = "Save your settings, then click \"Generate Now\" to test once.";
  setStatus("Ready");
}

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
    setStatus("Saved");
  } catch (error) {
    setStatus("Save failed");
    alert(error.message);
  }
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
  const newNode = categories.lastElementChild;
  if (newNode) {
    newNode.querySelector(".category-name").select();
  }
});

runNow.addEventListener("click", async () => {
  setStatus("Generating");
  runNow.disabled = true;
  try {
    await saveConfig();
    const result = await api("/api/run", {
      method: "POST",
      body: JSON.stringify({ sendEmail: true })
    });
    renderDigest(result);
    setStatus(result.emailResult.sent ? "Sent" : "Preview");
  } catch (error) {
    setStatus("Failed");
    alert(error.message);
  } finally {
    runNow.disabled = false;
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
  sendTime.value = state.sendTime || "08:00";
  renderCategories();
  if (session.needsReconnect) {
    setStatus("Reconnect needed");
    preview.className = "preview-empty";
    preview.textContent = session.reconnectReason || "Please sign in with Google again to allow Gmail sending.";
  } else {
    setStatus("Ready");
  }
}

init().catch((error) => {
  resetAppView();
  showLogin(error.message);
});
