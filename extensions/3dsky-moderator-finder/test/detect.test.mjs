// Unit tests for the detector.  Run: node test/detect.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
// load exactly like a browser would: a plain script in a sandbox with `self`
const sandbox = { URLSearchParams, JSON };
sandbox.self = sandbox;
vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL('../detect.js', import.meta.url)), 'utf8'), sandbox);
const D = sandbox.ModFinderDetect;
const w = (arr) => arr.filter(f => f.strength === 3);

// 1. nested object with nickname + id
let r = D.scanText(JSON.stringify({ data: { model: { id: 55, status: 'pending', moderator: { id: 7, nickname: 'Ivan', role: 'mod' } } } }));
assert.equal(w(r)[0].text, 'Ivan (#7)'); assert.equal(JSON.stringify(w(r)[0].aliasKeys), '["7","Ivan"]'); assert.equal(w(r)[0].path, 'data.model.moderator');

// 2. bare id field
r = D.scanText('{"models":[{"id":1,"moderator_id":12},{"id":2,"moderator_id":null}]}');
assert.equal(w(r).length, 2); assert.equal(w(r)[0].text, '12'); assert.equal(w(r)[1].empty, true); assert.equal(w(r)[1].path, 'models[1].moderator_id');

// 3. socket.io frame
r = D.scanText('42["model:status",{"assignedModerator":{"name":"Olga"}}]');
assert.equal(w(r)[0].text, 'Olga');

// 4. JSON nested in a string field + camelCase
r = D.scanText(JSON.stringify({ payload: JSON.stringify({ moderatorName: 'Petr' }) }));
assert.equal(w(r)[0].text, 'Petr');

// 5. form-encoded request body
r = D.scanText('title=Sofa&moderator=3&category=12');
assert.equal(w(r)[0].text, '3');

// 6. Russian + plain text
r = D.scanText('<div>Ваша модель на проверке. Модератор: Алексей</div>');
assert.equal(w(r).length, 1); assert.match(w(r)[0].text, /Модератор: Алексей/);
r = D.scanText('{"msg":"Модератор: Иван проверяет вашу модель"}');
assert.equal(w(r).length, 1);

// 7. moderation status is strength 2, reviewer weak
r = D.scanText('{"moderation_status":"pending","reviewer":{"id":4}}');
assert.equal(r.find(f => f.key === 'moderation_status').strength, 2);
assert.equal(r.find(f => f.key === 'reviewer').strength, 1);

// 8. unrelated payload => nothing; circular-free big array doesn't blow up
assert.equal(D.scanText('{"a":1,"b":[1,2,3]}').length, 0);
assert.equal(D.scanText('hello world').length, 0);
const big = JSON.stringify({ list: Array.from({ length: 5000 }, (_, i) => ({ id: i, moderator: { id: i % 4 } })) });
assert.ok(D.scanText(big).length <= 200);

// 9. headers
r = D.scanHeaders({ 'x-moderator-id': '9', 'content-type': 'application/json' });
assert.equal(r.length, 1); assert.equal(r[0].strength, 3);
// 10. "preview" must not be mistaken for "review"
assert.equal(D.scanText('{"announce_video_preview":null,"preview_url":"x"}').length, 0);
assert.equal(D.scanText('{"reviewer":{"id":1}}').length, 1);
console.log('detect.js: all unit checks passed');
