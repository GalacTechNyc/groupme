// GroupMe sign-in: create an application at https://dev.groupme.com/applications
// with the callback URL set to where this app is hosted (for example
// https://groupme-psi.vercel.app/), then paste its client ID here.
// Client IDs are meant to be used in browser apps, so it's fine for this to be public.
export const GROUPME_CLIENT_ID = '3ePEjQHqpXS7ikQzl8ESpSc0BNrjs3meNHzR35ydDJXvNbF0';

// Replies you can send with one pinch.
export const QUICK_REPLIES = ['👍', 'On my way', "Can't talk now", 'LOL', 'Call you later'];

// How often to check for new messages (GroupMe's push server isn't reliably
// reachable from browsers, so the app polls).
export const POLL_CHAT_MS = 4000;
export const POLL_LIST_MS = 15000;
