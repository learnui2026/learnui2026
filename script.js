// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
    owner: "learnui2026",
    repo: "learnui2026",
    branch: "main",
    file: "messages.txt"
};

// ============================================================
// VIEW PASSCODE
// ============================================================

const VIEW_PASSCODE = "MySecret123";

// ============================================================
// GLOBAL VARIABLES
// ============================================================

let githubToken = null;
let currentSha = null;
let autoRefreshInterval = null;
let isSending = false;

// ============================================================
// DOM ELEMENTS
// ============================================================

let senderInput;
let messageInput;
let sendButton;
let fetchButton;
let statusElement;
let messagesContainer;

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener("DOMContentLoaded", function () {

    senderInput = document.getElementById("sender");
    messageInput = document.getElementById("message");
    sendButton = document.getElementById("sendButton");
    fetchButton = document.getElementById("fetchButton");
    statusElement = document.getElementById("status");
    messagesContainer = document.getElementById("messages");

    if (sendButton) {
        sendButton.addEventListener("click", sendMessage);
    }

    if (fetchButton) {
        fetchButton.addEventListener("click", function () {
            fetchMessages(true);
        });
    }

    // Allow Ctrl + Enter to send
    if (messageInput) {
        messageInput.addEventListener("keydown", function (event) {

            if (event.key === "Enter" && event.ctrlKey) {
                event.preventDefault();
                sendMessage();
            }

        });
    }

    // Ask for passcode when page opens
    initializeViewAccess();

    // Start automatic refresh
    startAutoRefresh();
});

// ============================================================
// VIEW ACCESS
// ============================================================

function initializeViewAccess() {

    const enteredPasscode = prompt(
        "Enter passcode to view messages:"
    );

    if (enteredPasscode !== VIEW_PASSCODE) {

        alert("Incorrect passcode.");

        if (messagesContainer) {
            messagesContainer.innerHTML = `
                <div class="empty-message">
                    <div class="empty-icon">🔒</div>
                    <h3>Access Denied</h3>
                    <p>Incorrect passcode.</p>
                </div>
            `;
        }

        return;
    }

    fetchMessages(false);
}

// ============================================================
// GITHUB TOKEN
// ============================================================

function getGithubToken() {

    if (githubToken) {
        return githubToken;
    }

    const token = prompt(
        "Enter your GitHub Personal Access Token:"
    );

    if (!token || !token.trim()) {
        throw new Error("GitHub token is required.");
    }

    githubToken = token.trim();

    return githubToken;
}

// ============================================================
// GITHUB API URL
// ============================================================

function getGithubApiUrl() {

    return (
        "https://api.github.com/repos/" +
        encodeURIComponent(CONFIG.owner) +
        "/" +
        encodeURIComponent(CONFIG.repo) +
        "/contents/" +
        CONFIG.file
    );
}

// ============================================================
// GITHUB HEADERS
// ============================================================

function getGithubHeaders() {

    const token = getGithubToken();

    return {
        "Accept": "application/vnd.github+json",
        "Authorization": "Bearer " + token,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
    };
}

// ============================================================
// FETCH FILE FROM GITHUB
// ============================================================

async function getGithubFile() {

    const url =
        getGithubApiUrl() +
        "?ref=" +
        encodeURIComponent(CONFIG.branch) +
        "&_=" +
        Date.now();

    const response = await fetch(url, {
        method: "GET",
        headers: getGithubHeaders(),
        cache: "no-store"
    });

    if (!response.ok) {

        let errorText = "";

        try {
            const errorData = await response.json();
            errorText = errorData.message || "";
        } catch (e) {
            errorText = await response.text();
        }

        throw new Error(
            "GitHub GET failed (" +
            response.status +
            "): " +
            errorText
        );
    }

    const data = await response.json();

    return data;
}

// ============================================================
// DECODE GITHUB CONTENT
// ============================================================

function decodeGithubContent(content) {

    if (!content) {
        return "";
    }

    // GitHub returns Base64 content
    const binaryString = atob(
        content.replace(/\s/g, "")
    );

    const bytes = Uint8Array.from(
        binaryString,
        function (char) {
            return char.charCodeAt(0);
        }
    );

    return new TextDecoder("utf-8").decode(bytes);
}

// ============================================================
// ENCODE CONTENT FOR GITHUB
// ============================================================

function encodeGithubContent(content) {

    const bytes =
        new TextEncoder().encode(content);

    let binary = "";

    const chunkSize = 0x8000;

    for (
        let i = 0;
        i < bytes.length;
        i += chunkSize
    ) {

        const chunk =
            bytes.subarray(
                i,
                Math.min(i + chunkSize, bytes.length)
            );

        binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
}

// ============================================================
// FETCH ALL MESSAGES
// ============================================================

async function fetchMessages(showStatus = true) {

    try {

        if (showStatus) {
            setStatus("Fetching messages...", "loading");
        }

        const fileData = await getGithubFile();

        currentSha = fileData.sha;

        const content =
            decodeGithubContent(fileData.content);

        displayMessagesFromContent(content);

        if (showStatus) {
            setStatus(
                "Messages updated.",
                "success"
            );
        }

    } catch (error) {

        console.error("Fetch messages error:", error);

        setStatus(
            "Error: " + error.message,
            "error"
        );

    }
}

// ============================================================
// DISPLAY MESSAGES
// ============================================================

function displayMessagesFromContent(content) {

    if (!messagesContainer) {
        return;
    }

    if (!content || !content.trim()) {

        messagesContainer.innerHTML = `
            <div class="empty-message">
                <div class="empty-icon">💬</div>
                <h3>No messages yet</h3>
                <p>Send the first message.</p>
            </div>
        `;

        return;
    }

    const messages = [];

    /*
        Expected format:

        [18/09/2026 04:05:25.783]
        Sender: Bishnu
        Message: Aur batw

        [18/09/2026 04:05:17.551]
        Sender: Bishnu
        Message: tum kaise ho
    */

    const messagePattern =
        /\[([^\]]+)\]\s*\nSender:\s*(.*?)\s*\nMessage:\s*([\s\S]*?)(?=\n\[|$)/g;

    let match;

    while ((match = messagePattern.exec(content)) !== null) {

        messages.push({
            timestamp: match[1].trim(),
            sender: match[2].trim(),
            message: match[3].trim()
        });
    }

    // Fallback parser if required
    if (messages.length === 0) {

        const blocks =
            content.split(/\n(?=\[)/);

        blocks.forEach(function (block) {

            const timestampMatch =
                block.match(/^\[([^\]]+)\]/);

            const senderMatch =
                block.match(/Sender:\s*(.*)/);

            const messageMatch =
                block.match(
                    /Message:\s*([\s\S]*)/
                );

            if (
                timestampMatch &&
                senderMatch &&
                messageMatch
            ) {

                messages.push({
                    timestamp:
                        timestampMatch[1].trim(),

                    sender:
                        senderMatch[1].trim(),

                    message:
                        messageMatch[1].trim()
                });
            }
        });
    }

    // Newest message first
    messages.reverse();

    if (messages.length === 0) {

        messagesContainer.innerHTML = `
            <div class="empty-message">
                <div class="empty-icon">💬</div>
                <h3>No messages found</h3>
                <p>Messages could not be parsed.</p>
            </div>
        `;

        return;
    }

    let html = "";

    messages.forEach(function (item, index) {

        html += `
            <div class="message-box">
                <div class="message-block">

                    <div class="message-timestamp">
                        [${escapeHtml(item.timestamp)}]
                    </div>

                    <div class="message-line">
                        <span class="message-sender">
                            ${escapeHtml(item.sender)}:
                        </span>

                        <span class="message-content">
                            ${formatMessage(item.message)}
                        </span>
                    </div>

                </div>
            </div>
        `;

        if (index < messages.length - 1) {

            html += `
                <hr class="message-separator">
            `;
        }
    });

    messagesContainer.innerHTML = html;
}

// ============================================================
// FORMAT MESSAGE
// ============================================================

function formatMessage(message) {

    return escapeHtml(message)
        .replace(/\n/g, "<br>");
}

// ============================================================
// HTML ESCAPE
// ============================================================

function escapeHtml(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ============================================================
// SEND MESSAGE
// ============================================================

async function sendMessage() {

    if (isSending) {
        return;
    }

    const sender =
        senderInput
            ? senderInput.value.trim()
            : "";

    const message =
        messageInput
            ? messageInput.value.trim()
            : "";

    if (!sender) {

        setStatus(
            "Please enter your name.",
            "error"
        );

        if (senderInput) {
            senderInput.focus();
        }

        return;
    }

    if (!message) {

        setStatus(
            "Please enter a message.",
            "error"
        );

        if (messageInput) {
            messageInput.focus();
        }

        return;
    }

    isSending = true;

    if (sendButton) {
        sendButton.disabled = true;
    }

    setStatus(
        "Sending message...",
        "loading"
    );

    try {

        /*
            We fetch the latest file immediately before writing.
            This prevents SHA mismatch when another message was
            added since the previous fetch.
        */

        const latestFile =
            await getGithubFile();

        const latestContent =
            decodeGithubContent(
                latestFile.content
            );

        const latestSha =
            latestFile.sha;

        // Create timestamp
        const now = new Date();

        const timestamp =
            formatTimestamp(now);

        // Create new message
        const newEntry =
            `[${timestamp}]\n` +
            `Sender: ${sender}\n` +
            `Message: ${message}\n`;

        let updatedContent = latestContent;

        if (
            updatedContent &&
            !updatedContent.endsWith("\n")
        ) {
            updatedContent += "\n";
        }

        if (updatedContent.trim()) {
            updatedContent += "\n";
        }

        updatedContent += newEntry;

        // Save to GitHub
        const result =
            await updateGithubFile(
                updatedContent,
                latestSha,
                "Add new message"
            );

        currentSha = result.content.sha;

        // Clear message field
        if (messageInput) {
            messageInput.value = "";
            messageInput.style.height = "42px";
        }

        // Display immediately
        displayMessagesFromContent(
            updatedContent
        );

        setStatus(
            "Message sent successfully.",
            "success"
        );

    } catch (error) {

        console.error("Send message error:", error);

        /*
            If SHA conflict happens, fetch latest version and retry.
        */

        if (
            error.message &&
            (
                error.message.includes("does not match") ||
                error.message.includes("409") ||
                error.message.includes("sha")
            )
        ) {

            try {

                setStatus(
                    "Updating latest messages and retrying...",
                    "loading"
                );

                const latestFile =
                    await getGithubFile();

                const latestContent =
                    decodeGithubContent(
                        latestFile.content
                    );

                const timestamp =
                    formatTimestamp(
                        new Date()
                    );

                const newEntry =
                    `[${timestamp}]\n` +
                    `Sender: ${sender}\n` +
                    `Message: ${message}\n`;

                let retryContent =
                    latestContent;

                if (
                    retryContent &&
                    !retryContent.endsWith("\n")
                ) {
                    retryContent += "\n";
                }

                if (retryContent.trim()) {
                    retryContent += "\n";
                }

                retryContent += newEntry;

                const result =
                    await updateGithubFile(
                        retryContent,
                        latestFile.sha,
                        "Add new message"
                    );

                currentSha =
                    result.content.sha;

                if (messageInput) {
                    messageInput.value = "";
                    messageInput.style.height =
                        "42px";
                }

                displayMessagesFromContent(
                    retryContent
                );

                setStatus(
                    "Message sent successfully.",
                    "success"
                );

            } catch (retryError) {

                console.error(
                    "Retry failed:",
                    retryError
                );

                setStatus(
                    "Error: " +
                    retryError.message,
                    "error"
                );
            }

        } else {

            setStatus(
                "Error: " +
                error.message,
                "error"
            );
        }

    } finally {

        isSending = false;

        if (sendButton) {
            sendButton.disabled = false;
        }
    }
}

// ============================================================
// UPDATE GITHUB FILE
// ============================================================

async function updateGithubFile(
    content,
    sha,
    commitMessage
) {

    const url = getGithubApiUrl();

    const body = {
        message:
            commitMessage ||
            "Update messages",

        content:
            encodeGithubContent(content),

        sha: sha,

        branch:
            CONFIG.branch
    };

    const response =
        await fetch(url, {
            method: "PUT",
            headers: getGithubHeaders(),
            body: JSON.stringify(body),
            cache: "no-store"
        });

    if (!response.ok) {

        let errorMessage = "";

        try {

            const errorData =
                await response.json();

            errorMessage =
                errorData.message || "";

        } catch (e) {

            errorMessage =
                await response.text();
        }

        throw new Error(
            "GitHub PUT failed (" +
            response.status +
            "): " +
            errorMessage
        );
    }

    return await response.json();
}

// ============================================================
// FORMAT TIMESTAMP
// ============================================================

function formatTimestamp(date) {

    const day =
        String(date.getDate())
            .padStart(2, "0");

    const month =
        String(date.getMonth() + 1)
            .padStart(2, "0");

    const year =
        date.getFullYear();

    const hours =
        String(date.getHours())
            .padStart(2, "0");

    const minutes =
        String(date.getMinutes())
            .padStart(2, "0");

    const seconds =
        String(date.getSeconds())
            .padStart(2, "0");

    const milliseconds =
        String(date.getMilliseconds())
            .padStart(3, "0");

    return (
        day +
        "/" +
        month +
        "/" +
        year +
        " " +
        hours +
        ":" +
        minutes +
        ":" +
        seconds +
        "." +
        milliseconds
    );
}

// ============================================================
// STATUS MESSAGE
// ============================================================

function setStatus(message, type) {

    if (!statusElement) {
        return;
    }

    statusElement.textContent = message;

    statusElement.className =
        "status " +
        (type || "");

    // Automatically clear success message
    if (type === "success") {

        setTimeout(function () {

            if (
                statusElement.textContent ===
                message
            ) {

                statusElement.textContent = "";
                statusElement.className =
                    "status";
            }

        }, 3000);
    }
}

// ============================================================
// AUTO REFRESH
// ============================================================

function startAutoRefresh() {

    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }

    /*
        Refresh every 5 seconds.
    */

    autoRefreshInterval =
        setInterval(function () {

            fetchMessages(false);

        }, 5000);
}

// ============================================================
// MOBILE TYPING MODE
// ============================================================
//
// On mobile, when the user starts typing:
//
// - Hide logo
// - Hide "Send Message"
// - Hide description
// - Hide sender field
// - Hide "All Messages" header
// - Hide footer
// - Keep messages visible
// - Keep last messages visible above keyboard
// - Keep message box at bottom
// - Keep send button visible
//
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    function () {

        const mobileMessageInput =
            document.getElementById("message");

        if (!mobileMessageInput) {
            return;
        }

        function isMobile() {

            return window.matchMedia(
                "(max-width: 800px)"
            ).matches;
        }

        function showMobileTypingMode() {

            if (!isMobile()) {
                return;
            }

            document.body.classList.add(
                "mobile-typing"
            );

            setTimeout(function () {

                const messagesArea =
                    document.querySelector(
                        ".messages-area"
                    );

                if (messagesArea) {

                    messagesArea.scrollTop =
                        messagesArea.scrollHeight;
                }

            }, 100);
        }

        // Enter typing mode when user taps the box
        mobileMessageInput.addEventListener(
            "focus",
            showMobileTypingMode
        );

        // Also enter typing mode when user types
        mobileMessageInput.addEventListener(
            "input",
            function () {

                showMobileTypingMode();

                /*
                    Automatically increase textarea height
                    when multiple lines are typed.
                */

                if (isMobile()) {

                    mobileMessageInput.style.height =
                        "42px";

                    const newHeight =
                        Math.min(
                            mobileMessageInput
                                .scrollHeight,
                            100
                        );

                    mobileMessageInput.style.height =
                        newHeight + "px";
                }
            }
        );

        /*
            When keyboard/viewport changes, keep the
            latest messages visible.
        */

        if (window.visualViewport) {

            window.visualViewport.addEventListener(
                "resize",
                function () {

                    if (
                        document.body.classList
                            .contains("mobile-typing")
                    ) {

                        setTimeout(function () {

                            const messagesArea =
                                document.querySelector(
                                    ".messages-area"
                                );

                            if (messagesArea) {

                                messagesArea.scrollTop =
                                    messagesArea.scrollHeight;
                            }

                        }, 50);
                    }
                }
            );
        }

    }
);
