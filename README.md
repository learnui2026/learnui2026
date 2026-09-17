# GitHub Pages Shared Message App

This version runs entirely as a static website on GitHub Pages.

Storage:
    messages.txt

API:
    GitHub REST API

No Node.js, database, Cloudflare Worker, or other server is required.

## Repository structure

Upload these files to your GitHub repository:

    index.html
    style.css
    script.js
    messages.txt

## 1. Configure script.js

Open script.js and change:

    owner: "YOUR_GITHUB_USERNAME",
    repo: "YOUR_REPOSITORY",

Example:

    owner: "john123",
    repo: "shared-message-app",

Leave:

    branch: "main"
    file: "messages.txt"

unless your repository uses different values.

## 2. GitHub token

Because GitHub Pages is static, there is no private backend to hide a
GitHub write credential.

Therefore this version asks each user for their OWN GitHub token.

The token is:
- not included in script.js
- not stored in localStorage
- not stored in sessionStorage
- not stored in cookies
- kept only in JavaScript memory while the page is open

For a fine-grained token, grant access only to this repository and give
the minimum Contents permission needed to read/write the file.

NEVER paste your token into a public JavaScript file.

## 3. Enable GitHub Pages

GitHub repository:
Settings -> Pages

Select:
- Deploy from a branch
- main
- /(root)

Your website will then be available at the GitHub Pages URL.

## 4. How sending works

User enters:

    Sender: Rahul
    Message: Hello everyone

The website reads the current messages.txt, appends:

    [2026-09-18T...Z]
    Sender: Rahul
    Message: Hello everyone

and sends the updated file to GitHub using the Contents API.

GitHub creates a commit for the file update.

## 5. How fetching works

Fetch All Messages:
1. User enters the view password.
2. The browser asks for a GitHub token.
3. The GitHub API reads messages.txt.
4. Every message is displayed with its sender and timestamp.

Example:

    Sender: Rahul
    Hello everyone
    18/09/2026, 12:30 AM

## SECURITY WARNING

The GitHub token is a real repository credential.

Only use this design with people you trust to provide their own
appropriately scoped GitHub tokens.

The view password in script.js is NOT a secure secret. It is a
client-side convenience gate and can be discovered by inspecting the
website source.

If you need ordinary anonymous visitors to send messages without
GitHub accounts/tokens, GitHub Pages alone cannot securely provide
that functionality. A server-side/serverless component is required.

## Concurrency warning

This app uses read-then-write updates to messages.txt.

If two people send messages at exactly the same time, one update can
conflict because both may have read the same previous file SHA.

For a small/personal app this may be acceptable. A high-traffic app
should use a proper backend/database.
