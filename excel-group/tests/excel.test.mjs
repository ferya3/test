import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('../src/excel.js');
const { excel } = globalThis.RXG;

test('normalises Iranian phone shapes to 98XXXXXXXXXX', () => {
  for (const input of ['09123456789', '+989123456789', '00989123456789', '989123456789', '9123456789']) {
    assert.equal(excel.normalisePhone(input), '989123456789');
  }
  assert.equal(excel.normalisePhone('۰۹۱۲۳۴۵۶۷۸۹'), '989123456789');
  assert.equal(excel.normalisePhone('0912 345 67 89'), '989123456789');
});

test('rejects non-mobile junk', () => {
  for (const bad of ['', 'hello', '12345', '02112345678']) {
    assert.equal(excel.normalisePhone(bad), null);
  }
});

test('reads phone and name columns by header, Persian or English', () => {
  const { contacts, skipped } = excel.parseRows([
    ['نام', 'نام خانوادگی', 'شماره'],
    ['علی', 'رضایی', '09120000001'],
    ['Sara', 'K', '+989120000002'],
    ['', '', 'notaphone'],
  ]);
  assert.equal(skipped, 1);
  assert.deepEqual(contacts, [
    { phone: '989120000001', firstName: 'علی', lastName: 'رضایی' },
    { phone: '989120000002', firstName: 'Sara', lastName: 'K' },
  ]);
});

test('falls back to the phone-shaped column when there is no header', () => {
  const { contacts } = excel.parseRows([
    ['09120000001', 'اول'],
    ['09120000002', 'دوم'],
  ]);
  assert.equal(contacts.length, 2);
  assert.equal(contacts[0].phone, '989120000001');
  assert.equal(contacts[0].firstName, 'اول');
});

test('drops duplicate numbers and auto-names the nameless', () => {
  const { contacts } = excel.parseRows([
    ['phone'],
    ['09120000001'],
    ['09120000001'],
    ['09120000003'],
  ]);
  assert.equal(contacts.length, 2);
  assert.equal(contacts[0].firstName, 'مخاطب 1');
  assert.equal(contacts[1].firstName, 'مخاطب 2');
});
