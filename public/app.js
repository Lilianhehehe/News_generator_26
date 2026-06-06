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

function renderCategories() {
  categories.innerHTML = "";
  state.categories.forEach((category) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.id = category.id;
    node.querySelector(".category-enabled").checked = category.enabled;
    node.querySelector(".category-name").value = category.name;
    node.querySelector(".category-count").value = category.itemCount || 1;
    node.querySelector(".category-keywords").value = (category.keywords || []).join("，");
    node.querySelector(".remove-category").addEventListener("click", () => {
      state.categories = state.categories.filter((item) => item.id !== category.id);
      renderCategories();
    });
    categories.appendChild(node);
  });
}

function readFormState() {
  return {
    ...state,
    senderEmail: senderEmail.value.trim(),
    recipientEmail: recipientEmail.value.trim(),
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
  state = await api("/api/config");
  senderEmail.value = state.senderEmail || "";
  recipientEmail.value = state.recipientEmail || "";
  sendTime.value = state.sendTime || "08:00";
  renderCategories();
}

init().catch((error) => {
  setStatus("Startup failed");
  preview.textContent = error.message;
});
