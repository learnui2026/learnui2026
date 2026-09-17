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
// LOCAL CACHE
// ============================================================
//
// These store the latest known version of messages.txt.
//
// This is important because when you send multiple messages
// without refreshing, we can use the SHA returned by GitHub
// from the previous successful update instead of requesting
// a potentially stale SHA again.
//

let localMessagesContent = null;
let localMessagesSha = null;


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
// BASE64 UTF-8
// ============================================================

function decodeBase64Utf8(base64) {

    const cleanBase64 =
        base64.replace(/\n/g, "");

    const binary =
        atob(cleanBase64);

    const bytes =
        Uint8Array.from(
            binary,
            char => char.charCodeAt(0)
        );

    return new TextDecoder("utf-8").decode(bytes);
}


function encodeBase64Utf8(text) {

    const bytes =
        new TextEncoder().encode(text);

    let binary = "";

    const chunkSize = 0x8000;

    for (
        let i = 0;
        i < bytes.length;
        i += chunkSize
    ) {

        binary += String.fromCharCode(
            ...bytes.subarray(
                i,
                i + chunkSize
            )
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

    const token =
        prompt(
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

    githubToken =
        token.trim();

    return true;
}


// ============================================================
// GET messages.txt
// ============================================================

async function getMessagesFile() {

    const url =
        `${getApiUrl()}?ref=${encodeURIComponent(CONFIG.branch)}` +
        `&_=${Date.now()}`;

    const response =
        await fetch(
            url,
            {
                method: "GET",
                headers: getHeaders(),
                cache: "no-store"
            }
        );

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

    const data =
        await response.json();

    if (!data.content || !data.sha) {

        throw new Error(
            "GitHub did not return messages.txt content or SHA."
        );
    }

    return {
        sha: data.sha,
        content: decodeBase64Utf8(
            data.content
        )
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

        message: "Add message",

        content:
            encodeBase64Utf8(content),

        sha:
            sha,

        branch:
            CONFIG.branch
    };


    const response =
        await fetch(
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
        document.getElementById(
            "sendButton"
        );


    if (button) {
        button.disabled = true;
    }


    setStatus(
        "Sending message..."
    );


    const MAX_RETRIES = 5;


    try {

        for (
            let attempt = 1;
            attempt <= MAX_RETRIES;
            attempt++
        ) {

            try {

                // ------------------------------------------------
                // GET CURRENT VERSION ONLY IF WE DON'T HAVE ONE
                // ------------------------------------------------

                if (
                    localMessagesContent === null ||
                    localMessagesSha === null
                ) {

                    const latest =
                        await getMessagesFile();


                    localMessagesContent =
                        latest.content;


                    localMessagesSha =
                        latest.sha;
                }


                // ------------------------------------------------
                // CREATE NEW MESSAGE
                // ------------------------------------------------

                const timestamp =
                    new Date().toISOString();


                const newEntry =
                    `[${timestamp}]\n` +
                    `Sender: ${sender}\n` +
                    `Message: ${message}\n`;


                // ------------------------------------------------
                // PREPARE EXISTING CONTENT
                // ------------------------------------------------

                let existingContent =
                    localMessagesContent;


                if (
                    existingContent.trim().length > 0 &&
                    !existingContent.endsWith("\n\n")
                ) {

                    existingContent =
                        existingContent.trimEnd() +
                        "\n\n";
                }


                // ------------------------------------------------
                // ADD NEW MESSAGE
                // ------------------------------------------------

                const updatedContent =
                    existingContent +
                    newEntry +
                    "\n";


                // ------------------------------------------------
                // UPDATE GITHUB
                // ------------------------------------------------

                const result =
                    await updateMessagesFile(
                        updatedContent,
                        localMessagesSha
                    );


                // ------------------------------------------------
                // VERY IMPORTANT
                //
                // GitHub returns the SHA of the NEW version.
                // Save it for the next message.
                // ------------------------------------------------

                if (
                    result &&
                    result.content &&
                    result.content.sha
                ) {

                    localMessagesSha =
                        result.content.sha;

                } else {

                    // Force a fresh GET before next message.
                    localMessagesSha =
                        null;
                }


                // ------------------------------------------------
                // SAVE NEW CONTENT LOCALLY
                // ------------------------------------------------

                localMessagesContent =
                    updatedContent;


                // ------------------------------------------------
                // SUCCESS
                // ------------------------------------------------

                setStatus(
                    "Message sent successfully."
                );


                messageElement.value =
                    "";


                // ------------------------------------------------
                // DISPLAY WITHOUT GETTING GITHUB AGAIN
                // ------------------------------------------------

                displayMessagesFromContent(
                    localMessagesContent
                );


                return;


            } catch (error) {

                console.error(
                    "Send attempt failed:",
                    error
                );


                // ------------------------------------------------
                // CHECK SHA CONFLICT
                // ------------------------------------------------

                const isShaConflict =

                    error.status === 409 ||

                    error.status === 422 ||

                    (
                        error.githubMessage &&

                        error.githubMessage
                            .toLowerCase()
                            .includes(
                                "does not match"
                            )
                    );


                // ------------------------------------------------
                // RETRY SHA CONFLICT
                // ------------------------------------------------

                if (
                    isShaConflict &&
                    attempt < MAX_RETRIES
                ) {

                    setStatus(
                        `Another message was added. ` +
                        `Getting latest version... ` +
                        `(${attempt}/${MAX_RETRIES})`
                    );


                    // IMPORTANT:
                    // Clear old SHA/content.
                    // Next attempt will GET GitHub again.

                    localMessagesContent =
                        null;

                    localMessagesSha =
                        null;


                    await sleep(
                        700 * attempt
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


        // Clear cache after failure.

        localMessagesContent =
            null;

        localMessagesSha =
            null;


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
// DISPLAY MESSAGES FROM CONTENT
// ============================================================

function displayMessagesFromContent(
    content
) {

    const messagesContainer =
        document.getElementById(
            "messages"
        );


    const messagesSection =
        document.getElementById(
            "messagesSection"
        );


    if (!messagesContainer) {

        throw new Error(
            "Element with id='messages' was not found."
        );
    }


    // Make Messages section visible.

    if (messagesSection) {
        messagesSection.hidden = false;
    }


    messagesContainer.innerHTML =
        "";


    if (
        !content ||
        !content.trim()
    ) {

        messagesContainer.innerHTML =
            "<p>No messages yet.</p>";

        return;
    }


    // ----------------------------------------------------------
    // MESSAGE PARSER
    //
    // Each timestamp starts a new message.
    //
    // This does NOT depend on blank lines.
    // ----------------------------------------------------------

    const messagePattern =
        /\[([^\]]+)\]\s*\nSender:\s*(.*?)\s*\nMessage:\s*([\s\S]*?)(?=\n\[|$)/g;


    const messages = [];


    let match;


    while (
        (
            match =
                messagePattern.exec(
                    content
                )
        ) !== null
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


    // Newest first.

    messages.reverse();


    // ----------------------------------------------------------
    // DISPLAY EACH MESSAGE
    // ----------------------------------------------------------

    messages.forEach(
        messageData => {

            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "message-card";


            // Sender

            const senderElement =
                document.createElement(
                    "div"
                );


            senderElement.className =
                "message-sender";


            senderElement.textContent =
                messageData.sender;


            // Message

            const messageElement =
                document.createElement(
                    "div"
                );


            messageElement.className =
                "message-text";


            messageElement.textContent =
                messageData.message;


            // Time

            const timeElement =
                document.createElement(
                    "div"
                );


            timeElement.className =
                "message-time";


            const date =
                new Date(
                    messageData.timestamp
                );


            if (
                !isNaN(
                    date.getTime()
                )
            ) {

                timeElement.textContent =
                    date.toLocaleString();

            } else {

                timeElement.textContent =
                    messageData.timestamp;
            }


            // Add elements to card.

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
// GET AND DISPLAY LATEST GITHUB MESSAGES
// ============================================================

async function displayMessagesFromGitHub() {

    const messagesContainer =
        document.getElementById(
            "messages"
        );


    const messagesSection =
        document.getElementById(
            "messagesSection"
        );


    if (!messagesContainer) {

        throw new Error(
            "Element with id='messages' was not found."
        );
    }


    if (messagesSection) {
        messagesSection.hidden = false;
    }


    // ----------------------------------------------------------
    // IMPORTANT
    //
    // Fetch the latest version from GitHub when user explicitly
    // clicks "Fetch All Messages".
    // ----------------------------------------------------------

    const data =
        await getMessagesFile();


    // ----------------------------------------------------------
    // UPDATE LOCAL CACHE
    // ----------------------------------------------------------

    localMessagesContent =
        data.content;


    localMessagesSha =
        data.sha;


    // ----------------------------------------------------------
    // DISPLAY
    // ----------------------------------------------------------

    displayMessagesFromContent(
        localMessagesContent
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
        document.getElementById(
            "status"
        );


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

function sleep(
    milliseconds
) {

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

        const sendButton =
            document.getElementById(
                "sendButton"
            );


        const fetchButton =
            document.getElementById(
                "fetchButton"
            );


        // ------------------------------------------------------
        // SEND BUTTON
        // ------------------------------------------------------

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


        // ------------------------------------------------------
        // FETCH BUTTON
        // ------------------------------------------------------

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
