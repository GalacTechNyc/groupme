// GroupMe API (https://dev.groupme.com/docs/v3). The API allows CORS from any
// origin with the X-Access-Token header, so the app talks to it directly.

const BASE = 'https://api.groupme.com/v3';

export class AuthError extends Error {}

export function createApi(token) {
  async function call(method, path, body) {
    const res = await fetch(BASE + path, {
      method,
      headers: { 'X-Access-Token': token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) throw new AuthError('GroupMe sign-in expired');
    if (res.status === 304) return null; // group with no messages
    if (!res.ok) throw new Error(`GroupMe error ${res.status}`);
    const text = await res.text();
    return text ? JSON.parse(text).response : null;
  }

  return {
    async me() {
      const u = await call('GET', '/users/me');
      return { id: String(u.id), name: u.name };
    },

    // Groups and direct-message chats, newest activity first.
    async conversations() {
      const [groups, chats] = await Promise.all([
        call('GET', '/groups?per_page=50&omit=memberships'),
        call('GET', '/chats?per_page=50'),
      ]);
      const out = [];
      for (const g of groups || []) {
        const p = g.messages?.preview || {};
        out.push({
          key: 'g:' + g.id,
          kind: 'group',
          id: String(g.id),
          name: g.name,
          image: g.image_url,
          previewName: p.nickname || '',
          preview: p.text || (p.image_url || p.attachments?.length ? '📷 Photo' : ''),
          time: g.messages?.last_message_created_at || g.updated_at || 0,
        });
      }
      for (const c of chats || []) {
        const m = c.last_message || {};
        out.push({
          key: 'd:' + c.other_user.id,
          kind: 'dm',
          id: String(c.other_user.id),
          name: c.other_user.name,
          image: c.other_user.avatar_url,
          previewName: m.name || '',
          preview: m.text || (m.attachments?.length ? '📷 Photo' : ''),
          time: m.created_at || c.updated_at || 0,
        });
      }
      return out.sort((a, b) => b.time - a.time);
    },

    // The 20 messages before `beforeId` (or the latest 20), oldest first.
    async messages(conv, beforeId) {
      const q = beforeId ? `&before_id=${beforeId}` : '';
      const r =
        conv.kind === 'group'
          ? await call('GET', `/groups/${conv.id}/messages?limit=20${q}`)
          : await call('GET', `/direct_messages?other_user_id=${conv.id}${q}`);
      const list = (conv.kind === 'group' ? r?.messages : r?.direct_messages) || [];
      return list.map((m) => normalize(m, conv)).reverse();
    },

    async send(conv, text, guid) {
      const r =
        conv.kind === 'group'
          ? await call('POST', `/groups/${conv.id}/messages`, { message: { source_guid: guid, text } })
          : await call('POST', '/direct_messages', {
              direct_message: { source_guid: guid, recipient_id: conv.id, text },
            });
      const m = r?.message || r?.direct_message;
      return m ? normalize(m, conv) : null;
    },

    like(msg, on) {
      return call('POST', `/messages/${msg.convId}/${msg.id}/${on ? 'like' : 'unlike'}`);
    },
  };
}

function normalize(m, conv) {
  return {
    id: String(m.id),
    name: m.name,
    avatar: m.avatar_url,
    text: m.text || '',
    time: m.created_at,
    userId: String(m.sender_id || m.user_id),
    likes: (m.favorited_by || []).map(String),
    atts: m.attachments || [],
    system: !!m.system,
    guid: m.source_guid,
    // Likes go to /messages/<conversation>/<id>: the group id, or the DM's conversation id.
    convId: m.conversation_id || m.group_id || conv.id,
  };
}
