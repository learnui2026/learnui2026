const CONFIG = {
  owner: "learnui2026",
  repo: "learnui2026",
  branch: "main",
  file: "messages.txt"
};

// Basic client-side viewing passcode
const VIEW_PASSCODE = "MySecret123";

let githubToken = null;

// ----------------------------------------------------
// GitHub API helpers
// ----------------------------------------------------

function getApiUrl() {
  return `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.file}`;
}

function getHeaders() {
  if (!githubToken) {
    throw new Error("GitHub token is required.");
  }

  return {
    "Accept": "application/vnd.github+json",
    "Authorization": `Bearer ${githubToken}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json"
  };
}

// Decode Base64 → UTF-8
function decodeBase64Utf8(base64) {
  const binary = atob(base64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));

  return new TextDecoder("utf-8").decode(bytes);
}

// Encode UTF-8 → Base64
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

// ----------------------------------------------------
// Ask for GitHub token
// ----------------------------------------------------

function askForToken() {
  if (githubToken) {
    return true;
  }

  const token = prompt(
    "Enter your GitHub Personal Access Token.\n\n" +
    "The token must have access to learnui2026/learnui2026 " +
    "with Contents/Code Read and Write permission."
  );

  if (!token || !token.trim()) {
    setStatus("GitHub token is required.", true);
    return false;
  }

  githubToken = token.trim();

  return true;
}

// ----------------------------------------------------
// Get latest messages.txt
// ----------------------------------------------------

async function getMessagesFile() {
  const url =
    `${getApiUrl()}?ref=${encodeURIComponent(CONFIG.branch)}` +
    `&_=${Date.now()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: getHeaders(),
    cache: "no-store"
  });

  if (!response.ok) {
    let errorMessage = `GitHub error: ${response.status}`;

    try {
      const errorData = await response.json();

      if (errorData.message) {
        errorMessage += ` - ${errorData.message}`;
      }
    } catch (_) {}

    throw new Error(errorMessage);
  }

  const data = await response.json();

  if (!data.content || !data.sha) {
    throw new Error("messages.txt content or SHA was not returned by GitHub.");
  }

  return {
    sha: data.sha,
    content: decodeBase64Utf8(data.content)
  };
}

// ----------------------------------------------------
// Update messages.txt
// ----------------------------------------------------

async function updateMessagesFile(content, sha) {
  const body = {
    message: "Add new message",
    content: encodeBase64Utf8(content),
    sha: sha,
    branch: CONFIG.branch
  };

  const response = await fetch(getApiUrl(), {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify(body)
  });

  let responseData = {};

  try {
    responseData = await response.json();
  } catch (_) {}

  if (!response.ok) {
    const error = new Error(
      responseData.message ||
      `GitHub update failed: ${response.status}`
    );

    error.status = response.status;
    error.githubMessage = responseData.message || "";

    throw error;
  }

  return responseData;
}

// ----------------------------------------------------
// Send message with automatic SHA retry
// ----------------------------------------------------

async function sendMessage() {
  const senderElement = document.getElementById("sender");
  const messageElement = document.getElementById("message");

  const sender = senderElement.value.trim();
  const message = messageElement.value.trim();

  if (!sender) {
    setStatus("Please enter your name.", true);
    return;
  }

  if (!message) {
    setStatus("Please enter a message.", true);
    return;
  }

  if (!askForToken()) {
    return;
  }

  const button = document.getElementById("sendButton");

  if (button) {
    button.disabled = true;
  }

  setStatus("Sending message...");

  /*
   * Try up to 5 times.
   *
   * Every attempt gets the CURRENT SHA from GitHub.
   * If another person updates messages.txt between
   * our GET and PUT, we fetch it again and retry.
   */
  const MAX_RETRIES = 5;

  try {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {

      try {
        // IMPORTANT:
        // Always get the latest version immediately before updating.
        const latest = await getMessagesFile();

        const timestamp = new Date().toISOString();

        const newEntry =
          `[${timestamp}]\n` +
          `Sender: ${sender}\n` +
          `Message: ${message}\n\n`;

        const updatedContent =
          latest.content +
          newEntry;

        await updateMessagesFile(
          updatedContent,
          latest.sha
        );

        setStatus("Message sent successfully.");

        messageElement.value = "";

        // Refresh displayed messages if available
        try {
          await displayMessagesFromGitHub();
        } catch (_) {}

        return;

      } catch (error) {

        const isShaConflict =
          error.status === 409 ||
          error.status === 422 ||
          (
            error.githubMessage &&
            error.githubMessage.toLowerCase().includes("does not match")
          );

        if (isShaConflict && attempt < MAX_RETRIES) {

          setStatus(
            `Another message was added. Updating and retrying... (${attempt}/${MAX_RETRIES})`
          );

          // Small delay before retry
          await sleep(500 * attempt);

          continue;
        }

        throw error;
      }
    }

    throw new Error(
      "Could not update messages.txt after several attempts."
    );

  } catch (error) {

    console.error(error);

    setStatus(
      `Error: ${error.message}`,
      true
    );

  } finally {

    if (button) {
      button.disabled = false;
    }
  }
}

// ----------------------------------------------------
// Fetch all messages
// ----------------------------------------------------

async function fetchMessages() {

  const password = prompt(
    "Enter Message View Passcode:"
  );

  if (password !== VIEW_PASSCODE) {
    setStatus("Incorrect view passcode.", true);
    return;
  }

  if (!askForToken()) {
    return;
  }

  setStatus("Loading messages...");

  try {

    await displayMessagesFromGitHub();

    setStatus("Messages loaded successfully.");

  } catch (error) {

    console.error(error);

    setStatus(
      `Error: ${error.message}`,
      true
    );
  }
}

// ----------------------------------------------------
// Display messages
// ----------------------------------------------------

async function displayMessagesFromGitHub() {

  const data = await getMessagesFile();

  const messagesContainer =
    document.getElementById("messages");

  if (!messagesContainer) {
    return;
  }

  messagesContainer.innerHTML = "";

  const content = data.content.trim();

  if (!content) {
    messagesContainer.innerHTML =
      "<p>No messages yet.</p>";

    return;
  }

  const blocks = content
    .split(/\n\s*\n/)
    .map(block => block.trim())
    .filter(Boolean);

  /*
   * Expected format:
   *
   * [2026-09-18T...]
   * Sender: Rahul
   * Message: Hello
   */

  blocks.forEach(block => {

    const lines = block.split("\n");

    let timestamp = "";
    let sender = "";
    let message = "";

    for (const line of lines) {

      if (line.startsWith("[") && line.endsWith("]")) {
        timestamp = line.substring(1, line.length - 1);
      }

      else if (line.startsWith("Sender:")) {
        sender = line.substring("Sender:".length).trim();
      }

      else if (line.startsWith("Message:")) {
        message = line.substring("Message:".length).trim();
      }
    }

    if (!sender && !message) {
      return;
    }

    const card = document.createElement("div");
    card.className = "message-card";

    const senderElement = document.createElement("div");
    senderElement.className = "message-sender";
    senderElement.textContent = sender || "Unknown";

    const messageElement = document.createElement("div");
    messageElement.className = "message-text";
    messageElement.textContent = message;

    const timeElement = document.createElement("div");
    timeElement.className = "message-time";

    if (timestamp) {
      const date = new Date(timestamp);

      if (!isNaN(date.getTime())) {
        timeElement.textContent =
          date.toLocaleString();
      } else {
        timeElement.textContent = timestamp;
      }
    }

    card.appendChild(senderElement);
    card.appendChild(messageElement);
    card.appendChild(timeElement);

    messagesContainer.appendChild(card);
  });
}

// ----------------------------------------------------
// Status message
// ----------------------------------------------------

function setStatus(message, isError = false) {

  const status = document.getElementById("status");

  if (!status) {
    return;
  }

  status.textContent = message;

  status.className =
    isError ? "status error" : "status";
}

// ----------------------------------------------------
// Utility
// ----------------------------------------------------

function sleep(milliseconds) {
  return new Promise(resolve =>
    setTimeout(resolve, milliseconds)
  );
}

// ----------------------------------------------------
// Button event handlers
// ----------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {

  const sendButton =
    document.getElementById("sendButton");

  const fetchButton =
    document.getElementById("fetchButton");

  if (sendButton) {
    sendButton.addEventListener(
      "click",
      sendMessage
    );
  }

  if (fetchButton) {
    fetchButton.addEventListener(
      "click",
      fetchMessages
    );
  }
});
