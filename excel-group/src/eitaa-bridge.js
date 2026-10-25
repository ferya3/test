// Runs in Eitaa Web's own JavaScript world (injected with world: 'MAIN').
//
// Eitaa Web is built on Telegram WebK, which mounts `rootScope` on window;
// `rootScope.managers` reaches the app's managers over the already logged-in
// session, so no credentials are involved. The panel (isolated world) talks
// to this bridge with window.postMessage.
(() => {
  if (window.__rxgBridge) return;

  const CHANNEL = 'rxg-eitaa';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function managers() {
    for (let i = 0; i < 50; i++) {
      if (window.rootScope && window.rootScope.managers) return window.rootScope.managers;
      // Older WebK builds mounted the managers directly on window.
      if (window.appUsersManager && window.appChatsManager) {
        return { appUsersManager: window.appUsersManager, appChatsManager: window.appChatsManager };
      }
      await sleep(200);
    }
    throw { type: 'EITAA_INTERNALS_NOT_FOUND' };
  }

  const missingIds = (invitees) => (Array.isArray(invitees) ? invitees.map((m) => m.user_id) : []);

  const handlers = {
    async probe() {
      const m = await managers();
      const me = (await m.appUsersManager.getSelf()) || {};
      return { first_name: me.first_name, last_name: me.last_name, username: me.username };
    },

    async importContact({ phone, firstName, lastName }) {
      const m = await managers();
      try {
        return await m.appUsersManager.importContact(firstName, lastName, phone);
      } catch (err) {
        if (err && err.type === 'NO_USER') return null;
        throw err;
      }
    },

    // Newer WebK returns {chatId, missingInvitees}; older returns the id.
    async createChat({ title, userIds }) {
      const m = await managers();
      const r = await m.appChatsManager.createChat(title, userIds);
      return r && typeof r === 'object'
        ? { chatId: r.chatId, missing: missingIds(r.missingInvitees) }
        : { chatId: r, missing: [] };
    },

    async addChatUser({ chatId, userId }) {
      const m = await managers();
      return missingIds(await m.appChatsManager.addChatUser(chatId, userId));
    },
  };

  function serialiseError(err) {
    if (err && typeof err === 'object') return { type: err.type || err.message || 'UNKNOWN', code: err.code };
    return { type: String(err) };
  }

  window.addEventListener('message', async (event) => {
    const msg = event.data;
    if (event.source !== window || !msg || msg.channel !== CHANNEL || msg.dir !== 'req') return;
    const handler = handlers[msg.op];
    const reply = (body) => window.postMessage({ channel: CHANNEL, dir: 'res', id: msg.id, ...body }, location.origin);
    if (!handler) return reply({ ok: false, error: { type: 'UNKNOWN_OP' } });
    try {
      reply({ ok: true, result: await handler(msg.args || {}) });
    } catch (err) {
      reply({ ok: false, error: serialiseError(err) });
    }
  });

  window.__rxgBridge = handlers;
})();
