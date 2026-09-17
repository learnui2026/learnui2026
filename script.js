const CONFIG = {
    owner: "learnui2026",
    repo: "learnui2026",
    branch: "main",
    file: "messages.txt"
};

// Message view passcode
const VIEW_PASSCODE = "MySecret123";

let githubToken = null;


// ============================================================
// GITHUB API
// ============================================================

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


// ============================================================
// BASE64 UTF-8 ENCODE / DECODE
// ============================================================

function decodeBase64Utf8(base64) {

    const cleanBase64 = base64.replace(/\n/g, "");

    const binary = atob(cleanBase64);

    const bytes = Uint8Array.from(
        binary,
        char => char.charCodeAt(0)
    );

    return new TextDecoder("utf-8").decode(bytes);
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


// ============================================================
// TOKEN
// ============================================================

function askForToken() {

    if (githubToken) {
        return true;
    }

    const token = prompt(
        "Enter your GitHub Personal Access Token.\n\n" +
        "Repository: learnui2026/learnui2026\n" +
        "Permission required: Contents / Code Read and Write"
    );

    if (!token || !token.trim()) {

        setStatus(
            "GitHub token is required.",
            true
        );

        return false;
    }

    githubToken = token.trim();

    return true;
}


// ============================================================
// GET LATEST messages.txt
// ============================================================

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

        let errorMessage =
            `GitHub error: ${response.status}`;

        try {

            const errorData =
                await response.json();

            if (errorData.message) {
                errorMessage +=
                    ` - ${errorData.message}`;
            }

        } catch (_) {}

        throw new Error(errorMessage);
    }


    const data = await response.json();


    if (!data.content || !data.sha) {

        throw new Error(
            "GitHub did not return messages.txt content or SHA."
        );
    }


    return {

        sha: data.sha,

        content:
            decodeBase64Utf8(data.content)
    };
}


// ============================================================
// UPDATE messages.txt
// ============================================================

async function updateMessagesFile(
    content,
    sha
) {

    const body = {

        message:
            "Add message",

        content:
            encodeBase64Utf8(content),

        sha:
            sha,

        branch:
            CONFIG.branch
    };


    const response = await fetch(
        getApiUrl(),
        {
            method: "PUT",

            headers:
                getHeaders(),

            body:
                JSON.stringify(body)
        }
    );


    let responseData = {};

    try {

        responseData =
            await response.json();

    } catch (_) {}


    if (!response.ok) {

        const error =
            new Error(
                responseData.message ||
                `GitHub update failed: ${response.status}`
            );

        error.status =
            response.status;

        error.githubMessage =
            responseData.message || "";

        throw error;
    }


    return responseData;
}


// ============================================================
// SEND MESSAGE
// ============================================================

async function sendMessage() {

    const senderElement =
        document.getElementById("sender");

    const messageElement =
        document.getElementById("message");


    if (!senderElement || !messageElement) {

        setStatus(
            "Sender or message field not found.",
            true
        );

        return;
    }


    const sender =
        senderElement.value.trim();

    const message =
        messageElement.value.trim();


    if (!sender) {

        setStatus(
            "Please enter your name.",
            true
        );

        return;
    }


    if (!message) {

        setStatus(
            "Please enter a message.",
            true
        );

        return;
    }


    if (!askForToken()) {
        return;
    }


    const button =
        document.getElementById("sendButton");


    if (button) {
        button.disabled = true;
    }


    setStatus("Sending message...");


    const MAX_RETRIES = 5;


    try {

        for (
            let attempt = 1;
            attempt <= MAX_RETRIES;
            attempt++
        ) {

            try {

                // IMPORTANT:
                // Get the CURRENT SHA every time.
                const latest =
                    await getMessagesFile();


                const timestamp =
                    new Date().toISOString();


                const newEntry =
                    `[${timestamp}]\n` +
                    `Sender: ${sender}\n` +
                    `Message: ${message}\n`;


                let existingContent =
                    latest.content;


                /*
                 * Make sure there is a blank line
                 * between the previous message and
                 * the new message.
                 */
                if (
                    existingContent.trim().length > 0 &&
                    !existingContent.endsWith("\n\n")
                ) {

                    existingContent =
                        existingContent.trimEnd() +
                        "\n\n";
                }


                const updatedContent =
                    existingContent +
                    newEntry +
                    "\n";


                await updateMessagesFile(
                    updatedContent,
                    latest.sha
                );


                setStatus(
                    "Message sent successfully."
                );


                messageElement.value = "";


                // Show latest messages immediately
                try {

                    await displayMessagesFromGitHub();

                } catch (displayError) {

                    console.error(
                        "Display error:",
                        displayError
                    );
                }


                return;

            } catch (error) {

                /*
                 * GitHub can reject an update if somebody
                 * changed messages.txt after we read its SHA.
                 */
                const isShaConflict =
                    error.status === 409 ||
                    error.status === 422 ||
                    (
                        error.githubMessage &&
                        error.githubMessage
                            .toLowerCase()
                            .includes("does not match")
                    );


                if (
                    isShaConflict &&
                    attempt < MAX_RETRIES
                ) {

                    setStatus(
                        `Another message was added. ` +
                        `Getting latest version... ` +
                        `(${attempt}/${MAX_RETRIES})`
                    );


                    await sleep(
                        500 * attempt
                    );


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


// ============================================================
// FETCH MESSAGES
// ============================================================

async function fetchMessages() {

    const password =
        prompt(
            "Enter Message View Passcode:"
        );


    if (password !== VIEW_PASSCODE) {

        setStatus(
            "Incorrect view passcode.",
            true
        );

        return;
    }


    if (!askForToken()) {
        return;
    }


    setStatus(
        "Loading latest messages..."
    );


    try {

        await displayMessagesFromGitHub();


        setStatus(
            "Messages loaded successfully."
        );


    } catch (error) {

        console.error(error);


        setStatus(
            `Error: ${error.message}`,
            true
        );
    }
}


// ============================================================
// DISPLAY MESSAGES
// ============================================================

async function displayMessagesFromGitHub() {

    const messagesContainer =
        document.getElementById("messages");


    const messagesSection =
        document.getElementById(
            "messagesSection"
        );


    if (!messagesContainer) {

        throw new Error(
            "Element with id='messages' was not found."
        );
    }


    /*
     * Your HTML has the Messages section hidden
     * initially. Make it visible after fetching.
     */
    if (messagesSection) {
        messagesSection.hidden = false;
    }


    /*
     * Always retrieve the latest version from GitHub.
     */
    const data =
        await getMessagesFile();


    const content =
        data.content;


    messagesContainer.innerHTML = "";


    if (!content || !content.trim()) {

        messagesContainer.innerHTML =
            "<p>No messages yet.</p>";

        return;
    }


    /*
     * IMPORTANT:
     *
     * Do NOT depend on blank lines between messages.
     *
     * We find every timestamp:
     *
     * [2026-09-18T...]
     *
     * and use it as the start of a new message.
     *
     * This also handles your EXISTING messages.txt
     * where some messages don't have blank lines.
     */

    const messagePattern =
        /\[([^\]]+)\]\s*\nSender:\s*(.*?)\s*\nMessage:\s*([\s\S]*?)(?=\n\[|$)/g;


    const messages = [];


    let match;


    while (
        (match = messagePattern.exec(content)) !== null
    ) {

        const timestamp =
            match[1].trim();


        const sender =
            match[2].trim();


        const message =
            match[3].trim();


        messages.push({

            timestamp:
                timestamp,

            sender:
                sender || "Unknown",

            message:
                message
        });
    }


    if (messages.length === 0) {

        messagesContainer.innerHTML =
            "<p>No messages found.</p>";

        return;
    }


    /*
     * Display newest message first.
     */
    messages.reverse();


    messages.forEach(
        messageData => {

            const card =
                document.createElement("div");


            card.className =
                "message-card";


            const senderElement =
                document.createElement("div");


            senderElement.className =
                "message-sender";


            senderElement.textContent =
                messageData.sender;


            const messageElement =
                document.createElement("div");


            messageElement.className =
                "message-text";


            messageElement.textContent =
                messageData.message;


            const timeElement =
                document.createElement("div");


            timeElement.className =
                "message-time";


            const date =
                new Date(
                    messageData.timestamp
                );


            if (!isNaN(date.getTime())) {

                timeElement.textContent =
                    date.toLocaleString();

            } else {

                timeElement.textContent =
                    messageData.timestamp;
            }


            card.appendChild(
                senderElement
            );


            card.appendChild(
                messageElement
            );


            card.appendChild(
                timeElement
            );


            messagesContainer.appendChild(
                card
            );
        }
    );
}


// ============================================================
// STATUS
// ============================================================

function setStatus(
    message,
    isError = false
) {

    const status =
        document.getElementById("status");


    if (!status) {
        return;
    }


    status.textContent =
        message;


    status.className =
        isError
            ? "status error"
            : "status";
}


// ============================================================
// SLEEP
// ============================================================

function sleep(milliseconds) {

    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                milliseconds
            )
    );
}


// ============================================================
// INITIALIZE BUTTONS
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        /*
         * IMPORTANT:
         *
         * These IDs match your current index.html:
         *
         * sendButton
         * fetchButton
         */

        const sendButton =
            document.getElementById(
                "sendButton"
            );


        const fetchButton =
            document.getElementById(
                "fetchButton"
            );


        if (sendButton) {

            sendButton.addEventListener(
                "click",
                sendMessage
            );

        } else {

            console.error(
                "sendButton not found in index.html"
            );
        }


        if (fetchButton) {

            fetchButton.addEventListener(
                "click",
                fetchMessages
            );

        } else {

            console.error(
                "fetchButton not found in index.html"
            );
        }
    }
);
