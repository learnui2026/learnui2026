console.log("NEW SCRIPT VERSION 999 LOADED");
alert("NEW SCRIPT VERSION 999 LOADED");

const CONFIG = {
    owner: "learnui2026",
    repo: "learnui2026",
    branch: "main",
    file: "messages.txt"
};


// ============================================================
// MESSAGE VIEW PASSCODE
// ============================================================

const VIEW_PASSCODE = "MySecret123";


// ============================================================
// GLOBAL VARIABLES
// ============================================================

let githubToken = null;


// Latest known messages.txt content
let localMessagesContent = null;


// Latest known GitHub SHA
let localMessagesSha = null;


// Prevent two Send operations from running simultaneously
let isSending = false;


// ============================================================
// GITHUB API URL
// ============================================================

function getApiUrl() {

    return (
        `https://api.github.com/repos/` +
        `${CONFIG.owner}/` +
        `${CONFIG.repo}/` +
        `contents/` +
        `${CONFIG.file}`
    );
}


// ============================================================
// GITHUB HEADERS
// ============================================================

function getHeaders() {

    if (!githubToken) {

        throw new Error(
            "GitHub token is required."
        );
    }


    return {

        "Accept":
            "application/vnd.github+json",

        "Authorization":
            `Bearer ${githubToken}`,

        "X-GitHub-Api-Version":
            "2022-11-28",

        "Content-Type":
            "application/json"
    };
}


// ============================================================
// BASE64 DECODE
// ============================================================

function decodeBase64Utf8(base64) {

    const cleanBase64 =
        base64.replace(/\n/g, "");


    const binary =
        atob(cleanBase64);


    const bytes =
        Uint8Array.from(
            binary,
            char =>
                char.charCodeAt(0)
        );


    return new TextDecoder(
        "utf-8"
    ).decode(bytes);
}


// ============================================================
// BASE64 ENCODE
// ============================================================

function encodeBase64Utf8(text) {

    const bytes =
        new TextEncoder().encode(text);


    let binary = "";


    const chunkSize =
        0x8000;


    for (
        let i = 0;
        i < bytes.length;
        i += chunkSize
    ) {

        binary +=
            String.fromCharCode(
                ...bytes.subarray(
                    i,
                    i + chunkSize
                )
            );
    }


    return btoa(binary);
}


// ============================================================
// ASK FOR GITHUB TOKEN
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


    if (
        !token ||
        !token.trim()
    ) {

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
// GET messages.txt FROM GITHUB
// ============================================================

async function getMessagesFile() {

    const url =
        getApiUrl() +
        `?ref=${encodeURIComponent(
            CONFIG.branch
        )}` +
        `&_=${Date.now()}`;


    const response =
        await fetch(
            url,
            {
                method: "GET",

                headers:
                    getHeaders(),

                cache:
                    "no-store"
            }
        );


    if (!response.ok) {

        let errorMessage =
            `GitHub error: ${response.status}`;


        try {

            const errorData =
                await response.json();


            if (
                errorData.message
            ) {

                errorMessage +=
                    ` - ${errorData.message}`;
            }

        } catch (_) {}


        throw new Error(
            errorMessage
        );
    }


    const data =
        await response.json();


    if (
        !data.content ||
        !data.sha
    ) {

        throw new Error(
            "GitHub did not return messages.txt content or SHA."
        );
    }


    return {

        sha:
            data.sha,

        content:
            decodeBase64Utf8(
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

        message:
            "Add message",

        content:
            encodeBase64Utf8(
                content
            ),

        sha:
            sha,

        branch:
            CONFIG.branch
    };


    const response =
        await fetch(
            getApiUrl(),
            {

                method:
                    "PUT",

                headers:
                    getHeaders(),

                body:
                    JSON.stringify(
                        body
                    )
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
            responseData.message ||
            "";


        throw error;
    }


    return responseData;
}


// ============================================================
// CHECK SHA CONFLICT
// ============================================================

function isShaConflict(error) {

    if (!error) {

        return false;
    }


    if (
        error.status === 409 ||
        error.status === 422
    ) {

        return true;
    }


    if (
        error.githubMessage &&
        error.githubMessage
            .toLowerCase()
            .includes(
                "does not match"
            )
    ) {

        return true;
    }


    return false;
}


// ============================================================
// GET FRESH VERSION
// ============================================================

async function refreshLocalCache() {

    const latest =
        await getMessagesFile();


    localMessagesContent =
        latest.content;


    localMessagesSha =
        latest.sha;


    return latest;
}


// ============================================================
// SEND MESSAGE
// ============================================================

async function sendMessage() {

    // --------------------------------------------------------
    // Prevent double-click / simultaneous sends
    // --------------------------------------------------------

    if (isSending) {

        setStatus(
            "Please wait. Message is being sent..."
        );

        return;
    }


    const senderElement =
        document.getElementById(
            "sender"
        );


    const messageElement =
        document.getElementById(
            "message"
        );


    if (
        !senderElement ||
        !messageElement
    ) {

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


    // --------------------------------------------------------
    // VALIDATION
    // --------------------------------------------------------

    if (!sender) {

        setStatus(
            "Please enter your name.",
            true
        );

        senderElement.focus();

        return;
    }


    if (!message) {

        setStatus(
            "Please enter a message.",
            true
        );

        messageElement.focus();

        return;
    }


    // --------------------------------------------------------
    // TOKEN
    // --------------------------------------------------------

    if (!askForToken()) {

        return;
    }


    const button =
        document.getElementById(
            "sendButton"
        );


    isSending = true;


    if (button) {

        button.disabled =
            true;
    }


    setStatus(
        "Sending message..."
    );


    const MAX_RETRIES = 8;


    try {

        for (
            let attempt = 1;
            attempt <= MAX_RETRIES;
            attempt++
        ) {

            try {

                // ------------------------------------------------
                // STEP 1
                // Make sure we have a current SHA
                // ------------------------------------------------

                if (
                    localMessagesContent === null ||
                    localMessagesSha === null
                ) {

                    await refreshLocalCache();
                }


                // ------------------------------------------------
                // STEP 2
                // Create timestamp
                // ------------------------------------------------

                const timestamp =
                    new Date().toISOString();


                // ------------------------------------------------
                // STEP 3
                // Create message
                // ------------------------------------------------

                const newEntry =
                    `[${timestamp}]\n` +
                    `Sender: ${sender}\n` +
                    `Message: ${message}\n`;


                // ------------------------------------------------
                // STEP 4
                // Prepare existing content
                // ------------------------------------------------

                let existingContent =
                    localMessagesContent ||
                    "";


                if (
                    existingContent.trim()
                        .length > 0
                ) {

                    existingContent =
                        existingContent
                            .trimEnd() +
                        "\n\n";
                }


                // ------------------------------------------------
                // STEP 5
                // Add message
                // ------------------------------------------------

                const updatedContent =
                    existingContent +
                    newEntry +
                    "\n";


                // ------------------------------------------------
                // STEP 6
                // Save using CURRENT SHA
                // ------------------------------------------------

                const result =
                    await updateMessagesFile(
                        updatedContent,
                        localMessagesSha
                    );


                // ------------------------------------------------
                // STEP 7
                //
                // IMPORTANT:
                // Get the SHA returned by GitHub.
                // ------------------------------------------------

                let newSha = null;


                if (
                    result &&
                    result.content &&
                    result.content.sha
                ) {

                    newSha =
                        result.content.sha;
                }


                // ------------------------------------------------
                // STEP 8
                //
                // If GitHub returned a new SHA,
                // use it immediately.
                // ------------------------------------------------

                if (newSha) {

                    localMessagesSha =
                        newSha;

                } else {

                    /*
                     * GitHub normally returns content.sha.
                     *
                     * If it doesn't, get the latest version
                     * before another send.
                     */

                    localMessagesSha =
                        null;
                }


                // ------------------------------------------------
                // STEP 9
                // Save current content locally
                // ------------------------------------------------

                localMessagesContent =
                    updatedContent;


                // ------------------------------------------------
                // STEP 10
                // Display message immediately
                // ------------------------------------------------

                displayMessagesFromContent(
                    localMessagesContent
                );


                // ------------------------------------------------
                // SUCCESS
                // ------------------------------------------------

                setStatus(
                    "Message sent successfully."
                );


                messageElement.value =
                    "";


                return;


            } catch (error) {

                console.error(
                    `Send attempt ${attempt} failed:`,
                    error
                );


                // ------------------------------------------------
                // SHA CONFLICT
                // ------------------------------------------------

                if (
                    isShaConflict(error)
                ) {

                    if (
                        attempt >=
                        MAX_RETRIES
                    ) {

                        throw new Error(
                            "GitHub SHA conflict continued after " +
                            MAX_RETRIES +
                            " attempts. Please refresh once and try again."
                        );
                    }


                    setStatus(
                        "GitHub file changed. " +
                        "Getting latest version... " +
                        `(${attempt}/${MAX_RETRIES})`
                    );


                    // ------------------------------------------------
                    // Clear stale cache
                    // ------------------------------------------------

                    localMessagesContent =
                        null;


                    localMessagesSha =
                        null;


                    // ------------------------------------------------
                    // Wait before reading GitHub again
                    // ------------------------------------------------

                    await sleep(
                        1000 * attempt
                    );


                    // ------------------------------------------------
                    // IMPORTANT:
                    //
                    // Read the latest version again.
                    // ------------------------------------------------

                    await refreshLocalCache();


                    continue;
                }


                throw error;
            }
        }


        throw new Error(
            "Could not save message."
        );


    } catch (error) {

        console.error(
            "Final send error:",
            error
        );


        localMessagesContent =
            null;


        localMessagesSha =
            null;


        setStatus(
            `Error: ${error.message}`,
            true
        );


    } finally {

        isSending =
            false;


        if (button) {

            button.disabled =
                false;
        }
    }
}


// ============================================================
// FETCH ALL MESSAGES
// ============================================================

async function fetchMessages() {

    const password =
        prompt(
            "Enter Message View Passcode:"
        );


    if (
        password !==
        VIEW_PASSCODE
    ) {

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

        console.error(
            error
        );


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


    // --------------------------------------------------------
    // Show Messages section
    // --------------------------------------------------------

    if (messagesSection) {

        messagesSection.hidden =
            false;
    }


    messagesContainer.innerHTML =
        "";


    // --------------------------------------------------------
    // No messages
    // --------------------------------------------------------

    if (
        !content ||
        !content.trim()
    ) {

        messagesContainer.innerHTML =
            "<p>No messages yet.</p>";

        return;
    }


    // --------------------------------------------------------
    // MESSAGE PARSER
    //
    // Each timestamp starts a new message.
    //
    // Blank lines are NOT required.
    // --------------------------------------------------------

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
                sender ||
                "Unknown",

            message:
                message
        });
    }


    // --------------------------------------------------------
    // No valid messages
    // --------------------------------------------------------

    if (
        messages.length === 0
    ) {

        messagesContainer.innerHTML =
            "<p>No messages found.</p>";

        return;
    }


    // --------------------------------------------------------
    // Newest message first
    // --------------------------------------------------------

    messages.reverse();


    // --------------------------------------------------------
    // DISPLAY
    // --------------------------------------------------------

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


            // Add elements

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
// GET LATEST MESSAGES FROM GITHUB
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

        messagesSection.hidden =
            false;
    }


    // --------------------------------------------------------
    // Get latest GitHub version
    // --------------------------------------------------------

    const data =
        await getMessagesFile();


    // --------------------------------------------------------
    // Update local cache
    // --------------------------------------------------------

    localMessagesContent =
        data.content;


    localMessagesSha =
        data.sha;


    // --------------------------------------------------------
    // Display
    // --------------------------------------------------------

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
// INITIALIZE
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


        // ----------------------------------------------------
        // SEND BUTTON
        // ----------------------------------------------------

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


        // ----------------------------------------------------
        // FETCH BUTTON
        // ----------------------------------------------------

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
