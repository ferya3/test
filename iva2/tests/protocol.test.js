'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const protocol = require('../js/protocol.js');

const byId = (plan, id) => plan.find((phase) => phase.id === id).trials;

test('the standard plan has the IVA-2 shape', () => {
    const plan = protocol.buildPlan('standard');
    assert.deepEqual(
        plan.map((phase) => [phase.id, phase.trials.length]),
        [
            ['warmupVisual', 10],
            ['warmupAuditory', 10],
            ['practice', 20],
            ['main', 500],
            ['cooldownVisual', 10],
            ['cooldownAuditory', 10],
        ]
    );

    const main = byId(plan, 'main');
    for (let block = 1; block <= 10; block++) {
        const trials = main.filter((t) => t.block === block);
        const frequent = block % 2 === 1;
        assert.equal(trials.length, 50);
        assert.equal(trials[0].condition, frequent ? 'frequent' : 'infrequent');
        assert.equal(trials.filter((t) => t.target).length, frequent ? 42 : 8, `targets in block ${block}`);
        for (const modality of ['V', 'A']) {
            const own = trials.filter((t) => t.modality === modality);
            assert.equal(own.length, 25);
            assert.equal(own.filter((t) => t.target).length, frequent ? 21 : 4);
        }
        assert.ok(protocol.longestRun(trials, (t) => t.modality) <= 4);
        const rare = (t) => (frequent ? !t.target : t.target);
        assert.ok(protocol.smallestGap(trials, rare) >= 3);
        assert.ok(!rare(trials[0]), 'a block opens with its common stimulus');
    }
    assert.deepEqual(
        main.map((t) => t.index),
        main.map((_, i) => i)
    );
    assert.ok(main.every((t) => t.stimulus === (t.target ? 1 : 2)));
});

test('warm-up and cool-down are visual then auditory targets only', () => {
    const plan = protocol.buildPlan('standard');
    for (const id of ['warmupVisual', 'cooldownVisual']) {
        assert.ok(byId(plan, id).every((t) => t.modality === 'V' && t.target));
    }
    for (const id of ['warmupAuditory', 'cooldownAuditory']) {
        assert.ok(byId(plan, id).every((t) => t.modality === 'A' && t.target));
    }
});

test('practice is balanced across modality and digit', () => {
    const practice = byId(protocol.buildPlan('standard'), 'practice');
    assert.equal(practice.filter((t) => t.target).length, 10);
    assert.equal(practice.filter((t) => t.modality === 'V').length, 10);
    assert.equal(practice.filter((t) => t.modality === 'V' && t.target).length, 5);
    assert.ok(practice[0].target);
});

test('the default seed gives everyone the same sequence', () => {
    assert.deepEqual(protocol.buildPlan('standard'), protocol.buildPlan('standard', protocol.DEFAULT_SEED));
    assert.notDeepEqual(protocol.buildPlan('standard', 1), protocol.buildPlan('standard', 2));
});

test('the short protocol is one set of the same blocks', () => {
    const main = byId(protocol.buildPlan('short'), 'main');
    assert.equal(main.length, 100);
    assert.deepEqual([...new Set(main.map((t) => t.condition))], ['frequent', 'infrequent']);
    assert.equal(protocol.estimatedMinutes('standard'), 14);
});
