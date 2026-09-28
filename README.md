# GroupMe for Meta Ray-Ban Display

Read and reply to your GroupMe chats on Meta Ray-Ban Display glasses, using the Meta Neural Band.

- All your groups and direct messages, newest first, with unread dots
- Pop-up banner when a new message arrives in another chat
- Photos, locations, replies and likes shown inline
- Pinch a message to ♥ like it
- Reply with one pinch using quick replies, or type or dictate with the glasses keyboard
- Scroll up to load older messages

No build step. Plain HTML/CSS/JS, plus two small Vercel functions for phone pairing (`api/`).

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

**On the glasses: connect with a code** (like X Glass)

1. On the glasses, pinch **Connect with a code**. A 6-character code appears.
2. On your phone, go to **groupme-psi.vercel.app/connect**, enter the code and sign in to GroupMe.
3. The glasses load your chats within a few seconds.

Your password is only ever typed on your phone. Codes expire after 10 minutes, and the sign-in is handed to the glasses once.

**On a phone or computer:** pinch **Sign in on this device**.

**For testing:** paste an access token from [dev.groupme.com](https://dev.groupme.com) (**Access Token**, top right), or add `?demo` to the URL for fake chats.

The access token is stored only on the device (in the browser's local storage).

### How pairing works

- `POST /api/pair` makes a code plus a secret claim token that only the glasses know.
- `/connect` (phone) sends the code to `/api/auth/start`, which checks it, remembers it in a 10-minute HttpOnly cookie and redirects to GroupMe's sign-in.
- GroupMe returns the phone to the app with `?access_token=…`; the app sends it to `PUT /api/pair`, which checks it with GroupMe and stores it (AES-256-GCM encrypted with `GM_SECRET`) against the code in Vercel's runtime cache.
- The glasses poll `GET /api/pair?code&claim` and receive the token once; the entry is then deleted.

Setup: the GroupMe application's **Callback URL** is `https://groupme-psi.vercel.app/`, its client ID is in `config.js`, and `GM_SECRET` (a long random string) is set in the Vercel project's environment variables.

## How it works

- Uses the [GroupMe v3 API](https://dev.groupme.com/docs/v3) directly from the browser (it allows CORS with the `X-Access-Token` header).
- New messages: GroupMe's real-time push server wasn't reachable from browsers when this was built, so the app polls instead: the open chat every 4 seconds and the chat list every 15 (change these in `config.js`). It checks right away when the app comes back into view.
- Unread dots are tracked on the device. GroupMe's API doesn't share read receipts.

## Run it locally

```bash
python3 -m http.server 8610
```

Open http://localhost:8610/?demo in Chrome. (Pairing needs the `api/` functions: use `vercel dev` for those.) The arrow keys stand in for band swipes, Enter for a pinch, and Escape for back. For a realistic preview, use Meta's **Ray-Ban Display Simulator** Chrome extension.

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
| `connect.html` | Phone page for entering the glasses' code |
| `api/pair.js`, `api/auth/start.js` | Pairing: codes, GroupMe sign-in hand-off |
