/*
 * GitHub Pages + GitHub Contents API
 *
 * BEFORE USING:
 * 1. Set owner to your GitHub username.
 * 2. Set repo to your repository name.
 * 3. Make sure messages.txt exists in the repository.
 *
 * SECURITY:
 * This application intentionally does NOT contain a GitHub token.
 * The user must enter their own token when performing a GitHub API action.
 *
 * The token is kept only in this page's memory and is not written to
 * localStorage, sessionStorage, cookies, or the repository.
 */

const CONFIG = {
  owner: "learnui2026",
  repo: "learnui2026",
  branch: "main",
  file: "messages.txt"
};

let githubToken = null;

const senderInput = document.getElementById("sender");
const messageInput = document.getElementById("message");
const sendBtn = document.getElementById("sendBtn");
const fetchBtn = document.getElementById("fetchBtn");
const statusEl = document.getElementById("status");
const messagesSection = document.getElementById("messagesSection");
const messagesEl = document.getElementById("messages");

sendBtn.addEventListener("click", sendMessage);
fetchBtn.addEventListener("click", fetchMessages);

function setStatus(text, color = "") {
  statusEl.textContent = text;
  statusEl.style.color = color;
}

function isConfigured() {
  return CONFIG.owner !== "YOUR_GITHUB_USERNAME" &&
         CONFIG.repo !== "YOUR_REPOSITORY";
}

function requestToken() {
  if (githubToken) {
    return githubToken;
  }

  const token = prompt(
    "Enter your GitHub token.\n\n" +
    "Your token is used only for this browser session and is not stored."
  );

  if (!token) {
    return null;
  }

  githubToken = token.trim();
  return githubToken;
}

function apiHeaders() {
  return {
    "Accept": "application/vnd.github+json",
    "Authorization": `Bearer ${githubToken}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json"
  };
}

function fileApiUrl() {
  return (
    `https://api.github.com/repos/` +
    `${encodeURIComponent(CONFIG.owner)}/` +
    `${encodeURIComponent(CONFIG.repo)}/contents/` +
    `${encodeURIComponent(CONFIG.file)}`
  );
}

function encodeBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";

  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, i + chunkSize)
    );
  }

  return btoa(binary);
}

function decodeBase64Utf8(base64) {
  const binary = atob(base64.replace(/\s/g, ""));

  const bytes = Uint8Array.from(
    binary,
    character => character.charCodeAt(0)
  );

  return new TextDecoder().decode(bytes);
}

async function readMessagesFile() {

  const response = await fetch(
    `${fileApiUrl()}?ref=${encodeURIComponent(CONFIG.branch)}`,
    {
      headers: apiHeaders()
    }
  );

  if (response.status === 404) {
    return {
      exists: false,
      sha: null,
      content: ""
    };
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message || `GitHub API error: ${response.status}`
    );
  }

  return {
    exists: true,
    sha: data.sha,
    content: decodeBase64Utf8(data.content)
  };
}

async function sendMessage() {

  if (!isConfigured()) {
    setStatus(
      "Edit owner and repo in script.js first.",
      "red"
    );
    return;
  }

  const sender = senderInput.value.trim();
  const message = messageInput.value.trim();

  if (!sender) {
    setStatus("Please enter the sender name.", "red");
    return;
  }

  if (!message) {
    setStatus("Please enter a message.", "red");
    return;
  }

  const token = requestToken();

  if (!token) {
    setStatus("GitHub token is required.", "red");
    return;
  }

  sendBtn.disabled = true;

  try {

    setStatus("Reading messages.txt...", "black");

    const file = await readMessagesFile();

    const now = new Date();

    const line =
      `[${now.toISOString()}]\n` +
      `Sender: ${sender.replace(/\r?\n/g, " ")}\n` +
      `Message: ${message}\n\n`;

    const newContent = file.content + line;

    const body = {
      message: `Add message from ${sender}`,
      content: encodeBase64Utf8(newContent),
      branch: CONFIG.branch
    };

    if (file.exists) {
      body.sha = file.sha;
    }

    setStatus("Saving message to GitHub...", "black");

    const response = await fetch(
      fileApiUrl(),
      {
        method: "PUT",
        headers: apiHeaders(),
        body: JSON.stringify(body)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message || `GitHub API error: ${response.status}`
      );
    }

    messageInput.value = "";

    setStatus(
      "Message saved successfully.",
      "green"
    );

  } catch (error) {

    console.error(error);

    // A 401 normally means the token is invalid/expired.
    if (error.message.toLowerCase().includes("bad credentials")) {
      githubToken = null;
    }

    setStatus(
      `Error: ${error.message}`,
      "red"
    );

  } finally {

    sendBtn.disabled = false;

  }
}

async function fetchMessages() {

  if (!isConfigured()) {
    setStatus(
      "Edit owner and repo in script.js first.",
      "red"
    );
    return;
  }

  const password = prompt(
    "Enter the message-view password:"
  );

  if (password === null) {
    return;
  }

  /*
   * IMPORTANT:
   * This password check is client-side and therefore NOT a secure
   * authentication mechanism. Anyone who can inspect this JavaScript
   * can discover the password.
   *
   * The GitHub token is the actual repository access credential.
   */
  const VIEW_PASSWORD = "MySecret123";

  if (password !== VIEW_PASSWORD) {
    setStatus("Incorrect password.", "red");
    return;
  }

  const token = requestToken();

  if (!token) {
    setStatus("GitHub token is required.", "red");
    return;
  }

  fetchBtn.disabled = true;

  try {

    setStatus("Fetching messages.txt...", "black");

    const file = await readMessagesFile();

    messagesSection.hidden = false;

    renderMessages(file.content);

    setStatus("Messages loaded.", "green");

  } catch (error) {

    console.error(error);

    if (error.message.toLowerCase().includes("bad credentials")) {
      githubToken = null;
    }

    setStatus(
      `Error: ${error.message}`,
      "red"
    );

  } finally {

    fetchBtn.disabled = false;

  }
}

function renderMessages(content) {

  messagesEl.innerHTML = "";

  if (!content.trim()) {
    messagesEl.textContent = "No messages yet.";
    return;
  }

  const blocks = content
    .trim()
    .split(/\n\s*\n/);

  blocks.forEach(block => {

    const lines = block.split("\n");

    let time = "";
    let sender = "";
    let message = "";

    lines.forEach(line => {

      if (line.startsWith("[")) {
        time = line.replace(/^\[|\]$/g, "");
      } else if (line.startsWith("Sender:")) {
        sender = line.substring("Sender:".length).trim();
      } else if (line.startsWith("Message:")) {
        message = line.substring("Message:".length).trim();
      }

    });

    const box = document.createElement("div");
    box.className = "message";

    const senderElement = document.createElement("div");
    senderElement.className = "sender";
    senderElement.textContent =
      `Sender: ${sender || "Unknown"}`;

    const messageElement = document.createElement("div");
    messageElement.className = "messageText";
    messageElement.textContent = message;

    const timeElement = document.createElement("div");
    timeElement.className = "time";
    timeElement.textContent = time
      ? new Date(time).toLocaleString()
      : "";

    box.append(
      senderElement,
      messageElement,
      timeElement
    );

    messagesEl.appendChild(box);
  });
}
