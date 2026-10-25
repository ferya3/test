// One backend per messenger, all with the same shape so the panel does not
// care which site it is on:
//   connect(creds?) -> account info   addContact(c) -> member id | null
//   createGroup(title, ids, log) -> {groupId, failed: ids not added}
(() => {
  const RXG = (globalThis.RXG = globalThis.RXG || {});
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function rubika() {
    let client = null;
    return {
      name: 'روبیکا',
      needsLogin: true,
      contactDelay: 400,
      prefill: () => RXG.session.readFromLocalStorage(),

      async connect(creds) {
        const result = await RXG.session.build(creds);
        client = result.client;
        return result.me;
      },

      async addContact(c) {
        const res = await client.call('addAddressBook', {
          phone: c.phone,
          first_name: c.firstName,
          last_name: c.lastName || '',
        });
        return (res.user && res.user.user_guid) || res.user_guid || null;
      },

      async createGroup(title, ids) {
        const res = await client.call('addGroup', { title, member_guids: ids });
        return { groupId: (res.group || res).group_guid, failed: [] };
      },
    };
  }

  function eitaa() {
    const CHANNEL = 'rxg-eitaa';
    const BASIC_GROUP_LIMIT = 200;
    const CREATE_BATCH = 50;
    const pending = new Map();
    let seq = 0;

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (event.source !== window || !msg || msg.channel !== CHANNEL || msg.dir !== 'res') return;
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(Object.assign(new Error(msg.error.type), msg.error));
    });

    function call(op, args) {
      return new Promise((resolve, reject) => {
        const id = ++seq;
        const timer = setTimeout(() => {
          if (pending.delete(id)) reject(Object.assign(new Error('TIMEOUT'), { type: 'TIMEOUT' }));
        }, 120000);
        pending.set(id, { resolve, reject, timer });
        window.postMessage({ channel: CHANNEL, dir: 'req', id, op, args }, location.origin);
      });
    }

    // Telegram-style servers answer FLOOD_WAIT_<seconds> when we go too fast.
    async function patiently(fn, log) {
      for (let attempt = 0; ; attempt++) {
        try {
          return await fn();
        } catch (err) {
          const wait = /^FLOOD_WAIT_(\d+)/.exec(err.type || '');
          if (!wait || attempt >= 2 || Number(wait[1]) > 600) throw err;
          if (log) log(`محدودیت سرعت ایتا: ${wait[1]} ثانیه صبر…`);
          await sleep((Number(wait[1]) + 1) * 1000);
        }
      }
    }

    return {
      name: 'ایتا',
      needsLogin: false,
      contactDelay: 1000,

      connect: () => call('probe'),

      addContact: (c, log) =>
        patiently(
          () => call('importContact', { phone: `+${c.phone}`, firstName: c.firstName, lastName: c.lastName || '' }),
          log,
        ),

      async createGroup(title, ids, log) {
        if (ids.length > BASIC_GROUP_LIMIT) {
          log(`گروه ایتا حداکثر ${BASIC_GROUP_LIMIT} عضو می‌گیرد؛ ${ids.length - BASIC_GROUP_LIMIT} نفر آخر اضافه نمی‌شوند.`);
        }
        const members = ids.slice(0, BASIC_GROUP_LIMIT);
        const { chatId, missing } = await patiently(
          () => call('createChat', { title, userIds: members.slice(0, CREATE_BATCH) }),
          log,
        );
        const failed = [...missing, ...ids.slice(BASIC_GROUP_LIMIT)];

        for (const userId of members.slice(CREATE_BATCH)) {
          try {
            failed.push(...(await patiently(() => call('addChatUser', { chatId, userId }), log)));
          } catch {
            failed.push(userId);
          }
          await sleep(1000);
        }
        return { groupId: chatId, failed };
      },
    };
  }

  RXG.backendFor = (hostname) => {
    if (hostname === 'web.rubika.ir') return rubika();
    if (hostname === 'web.eitaa.com') return eitaa();
    return null;
  };
})();
