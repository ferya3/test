'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const i18n = require('../js/i18n.js');

test('Persian and English define the same interface keys', () => {
    const fa = Object.keys(i18n.dictionaries.fa).sort();
    const en = Object.keys(i18n.dictionaries.en).sort();
    assert.deepEqual(fa, en);
});

test('test text has the same shape in both languages', () => {
    const shape = (value) =>
        Array.isArray(value)
            ? `array(${value.length})`
            : typeof value === 'object'
              ? Object.fromEntries(Object.keys(value).sort().map((k) => [k, shape(value[k])]))
              : typeof value;
    assert.deepEqual(shape(i18n.testText.fa), shape(i18n.testText.en));
});

test('placeholders are filled and unknown ones left visible', () => {
    assert.equal(i18n.t('fa', 'flag.paused', { value: '۲' }), 'آزمون ۲ بار متوقف شده است.');
    assert.equal(i18n.interpolate('{a} and {b}', { a: 1 }), '1 and {b}');
    assert.equal(i18n.t('en', 'no.such.key'), 'no.such.key');
});

test('numbers use Persian digits in Persian', () => {
    assert.equal(i18n.formatNumber('fa', 12.5, 1), '۱۲٫۵');
    assert.equal(i18n.formatNumber('en', 12.5, 1), '12.5');
    assert.equal(i18n.formatNumber('fa', null), '—');
    assert.deepEqual(i18n.digitsFor('fa'), { 1: '۱', 2: '۲' });
    assert.deepEqual(i18n.digitsFor('latin'), { 1: '1', 2: '2' });
});
