// Runs the Eitaa bridge and backend together against a fake Telegram WebK
// `rootScope.managers`, wired through a fake window.postMessage.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const win = new EventTarget();
win.postMessage = (data) =>
  setTimeout(() => {
    const event = new Event('message');
    Object.defineProperties(event, { data: { value: data }, source: { value: win } });
    win.dispatchEvent(event);
  }, 0);
globalThis.window = win;
globalThis.location = { origin: 'https://web.eitaa.com' };

const calls = [];
let floodOnce = true;
let createChatStyle = 'new';
win.rootScope = {
  managers: {
    appUsersManager: {
      getSelf: async () => ({ first_name: 'Ali', last_name: 'R' }),
      importContact: async (first, last, phone) => {
        calls.push(['importContact', first, last, phone]);
        if (phone === '+989120000009') throw { type: 'NO_USER' };
        if (phone === '+989120000007' && floodOnce) {
          floodOnce = false;
          throw { type: 'FLOOD_WAIT_0', code: 420 };
        }
        return Number(phone.slice(-4));
      },
    },
    appChatsManager: {
      createChat: async (title, userIds) => {
        calls.push(['createChat', title, userIds]);
        return createChatStyle === 'new' ? { chatId: 77, missingInvitees: [{ user_id: userIds[0] }] } : 88;
      },
      addChatUser: async (chatId, userId) => {
        calls.push(['addChatUser', chatId, userId]);
        if (userId === 51) throw { type: 'USER_PRIVACY_RESTRICTED' };
        return [];
      },
    },
  },
};

await import('../src/eitaa-bridge.js');
await import('../src/backends.js');
const backend = globalThis.RXG.backendFor('web.eitaa.com');
const log = () => {};

test('connects through the logged-in session, no credentials', async () => {
  assert.equal(backend.needsLogin, false);
  assert.deepEqual(await backend.connect(), { first_name: 'Ali', last_name: 'R', username: undefined });
});

test('imports a contact with a + prefixed number and returns its user id', async () => {
  assert.equal(await backend.addContact({ phone: '989120000001', firstName: 'A', lastName: 'B' }, log), 1);
  assert.deepEqual(calls.at(-1), ['importContact', 'A', 'B', '+989120000001']);
});

test('a number with no Eitaa account resolves to null', async () => {
  assert.equal(await backend.addContact({ phone: '989120000009', firstName: 'X' }, log), null);
});

test('waits out FLOOD_WAIT and retries', async () => {
  assert.equal(await backend.addContact({ phone: '989120000007', firstName: 'F' }, log), 7);
});

test('creates the group with the first batch, adds the rest, reports misses', async () => {
  calls.length = 0;
  const ids = Array.from({ length: 52 }, (_, i) => i);
  const { groupId, failed } = await backend.createGroup('کلاس', ids, log);
  assert.equal(groupId, 77);
  assert.deepEqual(calls[0], ['createChat', 'کلاس', ids.slice(0, 50)]);
  assert.deepEqual(calls.slice(1), [['addChatUser', 77, 50], ['addChatUser', 77, 51]]);
  assert.deepEqual(failed, [0, 51]);
});

test('understands older WebK builds that return a bare chat id', async () => {
  createChatStyle = 'old';
  const { groupId, failed } = await backend.createGroup('t', [1, 2], log);
  assert.equal(groupId, 88);
  assert.deepEqual(failed, []);
});
