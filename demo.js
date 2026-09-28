// Fake GroupMe data for trying the app without an account: open with ?demo

const now = () => Math.floor(Date.now() / 1000);
const ME = { id: 'me', name: 'You' };
const t0 = now();

const convs = [
  { key: 'g:1', kind: 'group', id: '1', name: 'Squad 🏀', time: t0 - 60 },
  { key: 'g:2', kind: 'group', id: '2', name: 'Studio Session', time: t0 - 3600 },
  { key: 'd:3', kind: 'dm', id: '3', name: 'Mom', time: t0 - 7200 },
  { key: 'g:4', kind: 'group', id: '4', name: 'HBCU Open House Volunteers', time: t0 - 86400 },
];

const people = { a: 'Jay', b: 'Tasha', c: 'Marcus', d: 'Mom' };
let nextId = 1000;
const msg = (conv, who, text, ago, extra = {}) => ({
  id: String(nextId++),
  name: who === 'me' ? ME.name : people[who],
  avatar: null,
  text,
  time: t0 - ago,
  userId: who,
  likes: [],
  atts: [],
  system: false,
  convId: conv,
  ...extra,
});

const store = {
  'g:1': [
    msg('1', 'a', 'Who’s pulling up to the court tonight?', 900),
    msg('1', 'b', 'I’m in. 7?', 840, { likes: ['a'] }),
    msg('1', 'c', 'Can’t, got work till 8', 700),
    msg('1', 'me', 'I’ll be there at 7', 600),
    msg('1', 'a', 'Bet. Bring the good ball', 420, { likes: ['me', 'b'] }),
    msg('1', 'c', '', 300, { atts: [{ type: 'location', name: 'Rucker Park' }] }),
    msg('1', 'b', 'Loser buys wings 🍗', 60),
  ],
  'g:2': [
    msg('2', 'c', 'Beat is bouncing, sending the stems now', 4000),
    msg('2', 'a', 'The 808 on the hook is crazy', 3700),
    msg('2', 'c', 'Studio Thursday 6pm?', 3600),
  ],
  'd:3': [msg('3', 'd', 'Call me when you get a chance ❤️', 7200)],
  'g:4': [msg('4', 'b', 'Schedule for 9/28 is posted. Check your time slot!', 86400)],
};

for (const c of convs) {
  const last = store[c.key].at(-1);
  c.previewName = last.name;
  c.preview = last.text || '📍 Location';
}

// Someone new messages the Squad every 25 seconds so polling and toasts can be seen.
setInterval(() => {
  const lines = ['Y’all see that?', 'On my way 🚗', 'Say less', '😂😂😂', 'Who got next?'];
  const m = msg('1', ['a', 'b', 'c'][nextId % 3], lines[nextId % lines.length], 0);
  m.time = now();
  store['g:1'].push(m);
  Object.assign(convs[0], { time: m.time, previewName: m.name, preview: m.text });
}, 25000);

const wait = (v) => new Promise((r) => setTimeout(() => r(structuredClone(v)), 150));

export const demoApi = {
  me: () => wait(ME),
  conversations: () => wait([...convs].sort((a, b) => b.time - a.time)),
  messages(conv, beforeId) {
    const all = store[conv.key];
    const end = beforeId ? all.findIndex((m) => m.id === beforeId) : all.length;
    return wait(all.slice(Math.max(0, end - 20), end));
  },
  send(conv, text, guid) {
    const m = { ...msg(conv.id, 'me', text, 0), time: now(), guid };
    store[conv.key].push(m);
    Object.assign(convs.find((c) => c.key === conv.key), { time: m.time, previewName: m.name, preview: text });
    return wait(m);
  },
  like(m, on) {
    for (const list of Object.values(store)) {
      const x = list.find((y) => y.id === m.id);
      if (x) x.likes = on ? [...new Set([...x.likes, 'me'])] : x.likes.filter((u) => u !== 'me');
    }
    return wait(null);
  },
};
