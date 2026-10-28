'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const scoring = require('../js/scoring.js');
const norms = require('../js/norms.js');
const { simulate } = require('./helpers.js');

// A reference sample whose members differ only in speed and in how many foils
// they click, so expected standard scores are easy to reason about.
function member(index, age, sex) {
    const speed = 380 + (index % 10) * 10;
    const session = simulate((t) => {
        if (t.target) return speed + (t.modality === 'A' ? 80 : 0) + (t.index % 7) * 5;
        return t.phase === 'main' && t.condition === 'frequent' && t.index % 50 < (index % 4) * 10 ? speed : null;
    });
    return { age, sex, scales: scoring.scoreSession(session).scales };
}

test('build keeps only groups with enough members', () => {
    const members = [];
    for (let i = 0; i < 20; i++) members.push(member(i, 8, i % 2 ? 'm' : 'f'));
    for (let i = 0; i < 5; i++) members.push(member(i, 25, 'f'));

    const table = norms.build(members, { name: 'test', created: '2026-01-01T00:00:00Z' });
    assert.ok(norms.validate(table));
    assert.deepEqual(Object.keys(table.groups).sort(), ['age:8-9', 'age:8-9|sex:f', 'age:8-9|sex:m', 'all', 'sex:f', 'sex:m']);
    assert.equal(table.groups.all.n, 25);
    assert.equal(table.groups['age:8-9'].n, 20);
    assert.ok(table.groups.all.stats['speed.F'].sd > 0);
    assert.ok(table.groups.all.stats['responseControl.F'].sd > 0);
    assert.ok(table.groups.all.stats['balance.F']);
});

test('score picks the most specific group and orients scores so higher is better', () => {
    const members = [];
    for (let i = 0; i < 40; i++) members.push(member(i, 9, i % 2 ? 'm' : 'f'));
    const table = norms.build(members);

    const slow = simulate((t) => (t.target ? 700 : null));
    const fast = simulate((t) => (t.target ? 300 : null));
    const slowScore = norms.score(table, { age: 9, sex: 'f' }, scoring.scoreSession(slow).scales);
    const fastScore = norms.score(table, { age: 9, sex: 'f' }, scoring.scoreSession(fast).scales);

    assert.equal(slowScore.group, 'age:8-9|sex:f');
    assert.ok(slowScore.metrics['speed.F'].score < 70, 'slow responses score low');
    assert.ok(fastScore.metrics['speed.F'].score > 100, 'fast responses score high');
    assert.equal(slowScore.metrics['speed.F'].band, 'severe');
    assert.ok(fastScore.composites['attention.F'].score > slowScore.composites['attention.F'].score);

    // No group for this age and sex in a table of 9-year-olds: falls back to everyone.
    assert.equal(norms.score(table, { age: 40, sex: '' }, scoring.scoreSession(fast).scales).group, 'all');
});

test('the mean of the reference group scores about 100', () => {
    const members = [];
    for (let i = 0; i < 40; i++) members.push(member(i, 12, 'm'));
    const table = norms.build(members);
    const scores = members.map((m) => norms.score(table, { age: 12, sex: 'm' }, m.scales).composites['attention.F'].score);
    const average = scores.reduce((a, b) => a + b, 0) / scores.length;
    assert.ok(Math.abs(average - 100) < 1, `average ${average}`);
});

test('age bands use completed years', () => {
    assert.deepEqual(norms.groupKeys(9.5, 'f'), ['age:8-9|sex:f', 'age:8-9', 'sex:f', 'all']);
    assert.deepEqual(norms.groupKeys(17.9, ''), ['age:16-17', 'all']);
    assert.deepEqual(norms.groupKeys(5, 'm'), ['sex:m', 'all']);
    assert.deepEqual(norms.groupKeys(null, ''), ['all']);
});

test('normal CDF and bands', () => {
    assert.ok(Math.abs(norms.normalCdf(0) - 0.5) < 1e-7);
    assert.ok(Math.abs(norms.normalCdf(1.96) - 0.975) < 1e-4);
    assert.ok(Math.abs(norms.normalCdf(-1) - 0.158655) < 1e-4);
    assert.equal(norms.band(125), 'superior');
    assert.equal(norms.band(100), 'average');
    assert.equal(norms.band(85), 'belowAverage');
    assert.equal(norms.band(65), 'severe');
    assert.equal(norms.validate({}), false);
});
