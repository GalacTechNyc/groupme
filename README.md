# GroupMe for Meta Ray-Ban Display

Read and reply to your GroupMe chats on Meta Ray-Ban Display glasses, using the Meta Neural Band.

- All your groups and direct messages, newest first, with unread dots
- Pop-up banner when a new message arrives in another chat
- Photos, locations, replies and likes shown inline
- Pinch a message to ♥ like it
- Reply with one pinch using quick replies, or type or dictate with the glasses keyboard
- Scroll up to load older messages

No build step. Plain HTML/CSS/JS.

## Controls (Neural Band)

| Where | Gesture | Does |
|---|---|---|
| Chat list | Swipe ▲ ▼ | Pick a chat |
| Chat list | Pinch | Open it |
| Message | Swipe ▲ ▼ | Move between messages (▲ at the top loads older ones) |
| Message | Pinch | Like / unlike |
| Message | Swipe ▼ from the newest (or ▶) | Go to the reply bar |
| Reply bar | Swipe ◀ ▶ | Pick the Reply field or a quick reply |
| Reply field | Pinch | Opens the glasses keyboard / dictation |
| Quick reply | Pinch | Send it |
| Chat | Back | Back to the chat list |

Change the quick replies in `config.js`.

## Sign in

Either way, your access token is stored only on the device (in the browser's local storage).

**Option 1: GroupMe sign-in (recommended once hosted)**

1. Go to [dev.groupme.com/applications](https://dev.groupme.com/applications) and create an application.
2. Set the **Callback URL** to where the app is hosted, for example `https://groupme-psi.vercel.app/`.
3. Paste the application's **client ID** into `GROUPME_CLIENT_ID` in `config.js` and push.

A **Sign in with GroupMe** button then appears. GroupMe sends the browser back to the app with a token, and the app removes it from the address bar right away.

**Option 2: paste your token**

Sign in at [dev.groupme.com](https://dev.groupme.com), click **Access Token** at the top right, and paste it into the app. Useful for testing.

**Demo:** add `?demo` to the URL for fake chats, no account needed.

## How it works

- Uses the [GroupMe v3 API](https://dev.groupme.com/docs/v3) directly from the browser (it allows CORS with the `X-Access-Token` header).
- New messages: GroupMe's real-time push server wasn't reachable from browsers when this was built, so the app polls instead: the open chat every 4 seconds and the chat list every 15 (change these in `config.js`). It checks right away when the app comes back into view.
- Unread dots are tracked on the device. GroupMe's API doesn't share read receipts.

## Run it locally

```bash
python3 -m http.server 8610
```

Open http://localhost:8610/?demo in Chrome. The arrow keys stand in for band swipes, Enter for a pinch, and Escape for back. For a realistic preview, use Meta's **Ray-Ban Display Simulator** Chrome extension.

## Put it on the glasses

1. Host the folder on any HTTPS host. It's deployed on Vercel at https://groupme-psi.vercel.app (redeploy with `vercel deploy --prod`).
2. In the Meta AI app, turn on developer mode for your glasses and add the web app by URL. See [Meta's web app docs](https://wearables.developer.meta.com/docs/develop/webapps).

## Files

| File | What |
|---|---|
| `app.js` | Screens, navigation, polling, sending and liking |
| `groupme.js` | GroupMe API calls |
| `demo.js` | Fake chats for `?demo` |
| `config.js` | Client ID, quick replies, polling speed |
