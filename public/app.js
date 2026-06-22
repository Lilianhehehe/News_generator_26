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
    const keywordsInput = node.querySelector(".category-keywords");
    const generateKeywordsButton = node.querySelector(".generate-keywords");
    node.dataset.id = category.id;
    node.querySelector(".category-enabled").checked = category.enabled;
    nameInput.value = category.name;
    node.querySelector(".category-count").value = category.itemCount || 1;
    keywordsInput.value = (category.keywords || []).join(", ");
    node.querySelector(".remove-category").addEventListener("click", () => {
      state.categories = state.categories.filter((item) => item.id !== category.id);
      renderCategories();
    });
    generateKeywordsButton.addEventListener("click", () => {
      generateKeywordsForCategory(node, { force: true });
    });
    nameInput.addEventListener("input", () => {
      scheduleKeywordGeneration(node);
    });
    nameInput.addEventListener("blur", () => {
      if (node.dataset.needsKeywords === "true") {
        generateKeywordsForCategory(node);
      }
    });
    categories.appendChild(node);
  });
}

function scheduleKeywordGeneration(node) {
  if (node.dataset.needsKeywords !== "true") return;
  const keywordsInput = node.querySelector(".category-keywords");
  if (keywordsInput.value.trim()) return;

  clearTimeout(keywordTimers.get(node));
  keywordTimers.set(node, setTimeout(() => {
    generateKeywordsForCategory(node);
  }, 700));
}

async function generateKeywordsForCategory(node, { force = false } = {}) {
  const nameInput = node.querySelector(".category-name");
  const keywordsInput = node.querySelector(".category-keywords");
  const button = node.querySelector(".generate-keywords");
  const categoryName = nameInput.value.trim();

  if (!categoryName || categoryName === "New Category") return;
  if (!force && keywordsInput.value.trim()) return;

  clearTimeout(keywordTimers.get(node));
  button.disabled = true;
  button.textContent = "Generating";
  setStatus("Generating keywords");

  try {
    const result = await api("/api/keywords", {
      method: "POST",
      body: JSON.stringify({ categoryName })
    });
    if (Array.isArray(result.keywords) && result.keywords.length) {
      keywordsInput.value = result.keywords.join(", ");
      node.dataset.needsKeywords = "false";
      setStatus("Keywords ready");
    }
  } catch (error) {
    setStatus("Keyword failed");
    alert(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Generate Keywords";
  }
}

function readFormState() {
  return {
    ...state,
    senderEmail: userEmail,
    recipientEmail: userEmail,
    sendTime: sendTime.value || "08:00",
    categories: [...categories.querySelectorAll(".category-card")].map((node) => ({
      id: node.dataset.id,
      enabled: node.querySelector(".category-enabled").checked,
      name: node.querySelector(".category-name").value.trim() || "Untitled",
      itemCount: Number(node.querySelector(".category-count").value || 1),
      researchFocused: state.categories.find((item) => item.id === node.dataset.id)?.researchFocused || false,
      companyFocused: state.categories.find((item) => item.id === node.dataset.id)?.companyFocused || false,
      keywords: node.querySelector(".category-keywords").value
        .split(/[,，\n]/)
        .map((keyword) => keyword.trim())
        .filter(Boolean)
    }))
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
    keywords: []
  });
  renderCategories();
  const newNode = categories.lastElementChild;
  if (newNode) {
    newNode.dataset.needsKeywords = "true";
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
