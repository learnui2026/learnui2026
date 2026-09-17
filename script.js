const CONFIG = {
    owner: "learnui2026",
    repo: "learnui2026",
    branch: "main",
    file: "messages.txt"
};


// ============================================================
// VIEW PASSCODE
// ============================================================

const VIEW_PASSCODE =
    "MySecret123";


// ============================================================
// GLOBAL VARIABLES
// ============================================================

let githubToken =
    null;

let localMessagesContent =
    null;

let localMessagesSha =
    null;

let isSending =
    false;

let autoRefreshTimer =
    null;


// ============================================================
// GITHUB API URL
// ============================================================

function getApiUrl() {

    return (
        `https://api.github.com/repos/` +
        `${CONFIG.owner}/` +
        `${CONFIG.repo}/` +
        `contents/${CONFIG.file}`
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

function decodeBase64Utf8(
    base64
) {

    const clean =
        base64.replace(
            /\n/g,
            ""
        );

    const binary =
        atob(clean);

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

function encodeBase64Utf8(
    text
) {

    const bytes =
        new TextEncoder().encode(
            text
        );

    let binary =
        "";

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
// GET messages.txt
// ============================================================

async function getMessagesFile() {

    if (!askForToken()) {
        throw new Error(
            "GitHub token is required."
        );
    }

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
                method:
                    "GET",

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

    let responseData =
        {};

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
// SHA CONFLICT CHECK
// ============================================================

function isShaConflict(
    error
) {

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
// REFRESH LOCAL CACHE
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

    // Prevent multiple sends at exactly the same time.

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

    isSending =
        true;

    if (button) {

        button.disabled =
            true;
    }

    setStatus(
        "Sending message..."
    );


    const MAX_RETRIES =
        8;


    try {

        for (
            let attempt = 1;
            attempt <= MAX_RETRIES;
            attempt++
        ) {

            try {

                // ------------------------------------------------
                // GET CURRENT VERSION IF NEEDED
                // ------------------------------------------------

                if (
                    localMessagesContent === null ||
                    localMessagesSha === null
                ) {

                    await refreshLocalCache();
                }


                // ------------------------------------------------
                // CREATE TIMESTAMP
                // ------------------------------------------------

                const timestamp =
                    new Date().toISOString();


                // ------------------------------------------------
                // CREATE MESSAGE
                // ------------------------------------------------

                /*
                 * Storage format in messages.txt:
                 *
                 * [2026-09-18T...]
                 * Sender: Bishnu Kumar
                 * Message: Hello
                 */

                const newEntry =
                    `[${timestamp}]\n` +
                    `Sender: ${sender}\n` +
                    `Message: ${message}\n`;


                // ------------------------------------------------
                // EXISTING CONTENT
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
                // NEW CONTENT
                // ------------------------------------------------

                const updatedContent =
                    existingContent +
                    newEntry +
                    "\n";


                // ------------------------------------------------
                // SAVE TO GITHUB
                // ------------------------------------------------

                const result =
                    await updateMessagesFile(
                        updatedContent,
                        localMessagesSha
                    );


                // ------------------------------------------------
                // SAVE NEW SHA
                // ------------------------------------------------

                if (
                    result &&
                    result.content &&
                    result.content.sha
                ) {

                    localMessagesSha =
                        result.content.sha;

                } else {

                    localMessagesSha =
                        null;
                }


                // ------------------------------------------------
                // SAVE NEW CONTENT LOCALLY
                // ------------------------------------------------

                localMessagesContent =
                    updatedContent;


                // ------------------------------------------------
                // UPDATE SCREEN
                // ------------------------------------------------

                displayMessagesFromContent(
                    localMessagesContent
                );


                // ------------------------------------------------
                // CLEAR MESSAGE FIELD
                // ------------------------------------------------

                messageElement.value =
                    "";


                // ------------------------------------------------
                // SUCCESS
                // ------------------------------------------------

                setStatus(
                    "Message sent successfully."
                );

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
                            " attempts. Please refresh and try again."
                        );
                    }

                    setStatus(
                        "Another message was added. " +
                        "Getting latest version..."
                    );


                    // Clear stale cache.

                    localMessagesContent =
                        null;

                    localMessagesSha =
                        null;


                    // Wait.

                    await sleep(
                        1000 * attempt
                    );


                    // Get latest version.

                    await refreshLocalCache();

                    continue;
                }


                throw error;
            }
        }


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
        "Loading messages..."
    );

    try {

        await displayMessagesFromGitHub();

        setStatus(
            "Messages loaded successfully."
        );

        startAutoRefresh();

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
// FORMAT DATE
// ============================================================

function formatTimestamp(
    timestamp
) {

    const date =
        new Date(
            timestamp
        );

    if (
        isNaN(
            date.getTime()
        )
    ) {

        return timestamp;
    }


    /*
     * Display format:
     *
     * DD/MM/YYYY HH:MM:SS.milliseconds
     *
     * Example:
     *
     * 18/09/2026 04:00:46.573
     *
     * The time is displayed in the user's
     * local timezone.
     */

    const day =
        String(
            date.getDate()
        ).padStart(
            2,
            "0"
        );

    const month =
        String(
            date.getMonth() + 1
        ).padStart(
            2,
            "0"
        );

    const year =
        date.getFullYear();

    const hours =
        String(
            date.getHours()
        ).padStart(
            2,
            "0"
        );

    const minutes =
        String(
            date.getMinutes()
        ).padStart(
            2,
            "0"
        );

    const seconds =
        String(
            date.getSeconds()
        ).padStart(
            2,
            "0"
        );

    const milliseconds =
        String(
            date.getMilliseconds()
        ).padStart(
            3,
            "0"
        );

    return (
        `${day}/${month}/${year} ` +
        `${hours}:${minutes}:${seconds}.` +
        `${milliseconds}`
    );
}


// ============================================================
// DISPLAY MESSAGES
// ============================================================

function displayMessagesFromContent(
    content
) {

    const messagesContainer =
        document.getElementById(
            "messages"
        );

    if (!messagesContainer) {

        return;
    }


    // --------------------------------------------------------
    // EMPTY
    // --------------------------------------------------------

    if (
        !content ||
        !content.trim()
    ) {

        messagesContainer.innerHTML = `

            <div class="empty-message">

                <div class="empty-icon">
                    💬
                </div>

                <h3>
                    No messages yet
                </h3>

                <p>
                    Be the first to send a message.
                </p>

            </div>

        `;

        return;
    }


    // --------------------------------------------------------
    // EXPECTED STORAGE FORMAT
    //
    // [2026-09-18T...]
    // Sender: Rahul
    // Message: Hello
    // --------------------------------------------------------

    const messagePattern =
        /\[([^\]]+)\]\s*\nSender:\s*(.*?)\s*\nMessage:\s*([\s\S]*?)(?=\n\[|$)/g;

    const messages =
        [];

    let match;

    while (
        (
            match =
                messagePattern.exec(
                    content
                )
        ) !== null
    ) {

        messages.push({

            timestamp:
                match[1].trim(),

            sender:
                match[2].trim(),

            message:
                match[3].trim()
        });
    }


    // --------------------------------------------------------
    // NO VALID MESSAGES
    // --------------------------------------------------------

    if (
        messages.length === 0
    ) {

        messagesContainer.innerHTML = `

            <div class="empty-message">

                <div class="empty-icon">
                    💬
                </div>

                <h3>
                    No messages found
                </h3>

            </div>

        `;

        return;
    }


    // --------------------------------------------------------
    // NEWEST FIRST
    // --------------------------------------------------------

    messages.reverse();


    // --------------------------------------------------------
    // MESSAGE BOX
    // --------------------------------------------------------

    const messageBox =
        document.createElement(
            "div"
        );

    messageBox.className =
        "message-box";


    // --------------------------------------------------------
    // CREATE EACH MESSAGE
    // --------------------------------------------------------

    messages.forEach(
        (messageData, index) => {

            const messageBlock =
                document.createElement(
                    "div"
                );

            messageBlock.className =
                "message-block";


            // ------------------------------------------------
            // TIMESTAMP
            // ------------------------------------------------

            const timestamp =
                document.createElement(
                    "div"
                );

            timestamp.className =
                "message-timestamp";

            timestamp.textContent =
                `date time -> [${formatTimestamp(
                    messageData.timestamp
                )}]`;


            // ------------------------------------------------
            // SENDER
            // ------------------------------------------------

            /*
             * IMPORTANT:
             *
             * Sender is now a SPAN instead of DIV.
             * This keeps sender and message on the
             * SAME LINE.
             *
             * No ** characters are printed.
             */

            const sender =
                document.createElement(
                    "span"
                );

            sender.className =
                "message-sender";

            sender.textContent =
                `${messageData.sender}: `;


            // ------------------------------------------------
            // MESSAGE
            // ------------------------------------------------

            /*
             * Message is also a SPAN.
             * Therefore it stays on the same line
             * as the sender.
             */

            const message =
                document.createElement(
                    "span"
                );

            message.className =
                "message-content";

            message.textContent =
                messageData.message;


            // ------------------------------------------------
            // ADD ELEMENTS
            // ------------------------------------------------

            messageBlock.appendChild(
                timestamp
            );

            messageBlock.appendChild(
                sender
            );

            messageBlock.appendChild(
                message
            );


            // ------------------------------------------------
            // SEPARATOR
            // ------------------------------------------------

            if (
                index <
                messages.length - 1
            ) {

                const separator =
                    document.createElement(
                        "hr"
                    );

                separator.className =
                    "message-separator";

                messageBlock.appendChild(
                    separator
                );
            }


            messageBox.appendChild(
                messageBlock
            );
        }
    );


    // --------------------------------------------------------
    // DISPLAY
    // --------------------------------------------------------

    messagesContainer.innerHTML =
        "";

    messagesContainer.appendChild(
        messageBox
    );
}


// ============================================================
// GET LATEST FROM GITHUB
// ============================================================

async function displayMessagesFromGitHub() {

    const latest =
        await refreshLocalCache();

    displayMessagesFromContent(
        latest.content
    );
}


// ============================================================
// AUTOMATIC REFRESH
// ============================================================

async function autoRefreshMessages() {

    // Don't refresh while sending.

    if (isSending) {

        return;
    }


    // Don't ask for token automatically.

    if (!githubToken) {

        return;
    }

    try {

        const latest =
            await getMessagesFile();

        /*
         * Only update the screen when GitHub's
         * file SHA has changed.
         */

        if (
            latest.sha !==
            localMessagesSha
        ) {

            localMessagesContent =
                latest.content;

            localMessagesSha =
                latest.sha;

            displayMessagesFromContent(
                latest.content
            );
        }

    } catch (error) {

        console.error(
            "Automatic refresh failed:",
            error
        );
    }
}


// ============================================================
// START AUTO REFRESH
// ============================================================

function startAutoRefresh() {

    if (autoRefreshTimer) {

        clearInterval(
            autoRefreshTimer
        );
    }

    /*
     * Check for new messages every 5 seconds.
     */

    autoRefreshTimer =
        setInterval(
            autoRefreshMessages,
            5000
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
// ENTER KEY
// ============================================================

function setupEnterKey() {

    const messageElement =
        document.getElementById(
            "message"
        );

    if (!messageElement) {

        return;
    }

    messageElement.addEventListener(
        "keydown",
        event => {

            /*
             * Enter = Send
             *
             * Shift + Enter = New line
             */

            if (
                event.key === "Enter" &&
                !event.shiftKey
            ) {

                event.preventDefault();

                sendMessage();
            }
        }
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
        }


        // ----------------------------------------------------
        // FETCH BUTTON
        // ----------------------------------------------------

        if (fetchButton) {

            fetchButton.addEventListener(
                "click",
                fetchMessages
            );
        }


        // ----------------------------------------------------
        // ENTER KEY
        // ----------------------------------------------------

        setupEnterKey();


        // ----------------------------------------------------
        // AUTO REFRESH
        // ----------------------------------------------------

        startAutoRefresh();
    }
);

/* ============================================================
   MOBILE TYPING MODE
============================================================ */

(function () {

    const messageInput =
        document.getElementById("message");

    if (!messageInput) {
        return;
    }

    const isMobile = () => {
        return window.matchMedia("(max-width: 800px)").matches;
    };

    function enableMobileTypingMode() {

        if (!isMobile()) {
            return;
        }

        document.body.classList.add("mobile-typing");

        setTimeout(() => {

            const messagesArea =
                document.querySelector(".messages-area");

            if (messagesArea) {

                messagesArea.scrollTop =
                    messagesArea.scrollHeight;
            }

        }, 150);
    }

    function disableMobileTypingMode() {

        document.body.classList.remove("mobile-typing");
    }

    messageInput.addEventListener(
        "focus",
        function () {

            enableMobileTypingMode();

        }
    );

    messageInput.addEventListener(
        "input",
        function () {

            if (isMobile()) {

                document.body.classList.add(
                    "mobile-typing"
                );
            }

        }
    );

    if (window.visualViewport) {

        let previousHeight =
            window.visualViewport.height;

        window.visualViewport.addEventListener(
            "resize",
            function () {

                const currentHeight =
                    window.visualViewport.height;

                if (
                    currentHeight <
                    previousHeight - 100
                ) {

                    if (
                        document.activeElement ===
                        messageInput
                    ) {

                        enableMobileTypingMode();
                    }
                }

                if (
                    currentHeight >
                    previousHeight + 100
                ) {

                    disableMobileTypingMode();
                }

                previousHeight =
                    currentHeight;

            }
        );
    }

})();
