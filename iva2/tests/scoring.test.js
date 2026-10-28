'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const scoring = require('../js/scoring.js');
const { simulate } = require('./helpers.js');

const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} != ${expected}`);

test('classify assigns responses to windows', () => {
    const trials = [
        { target: true, onset: 1000, end: 2500 },
        { target: false, onset: 2500, end: 4000 },
        { target: true, onset: 4000, end: 5500 },
        { target: false, onset: 5500, end: 7000 },
        { target: true, onset: 7000, end: 8500, interrupted: true },
        { target: true, onset: null, end: null },
    ];
    const responses = [
        500, // before the first trial: ignored
        1400, // hit, RT 400
        1700, // extra
        2600, // 100 ms after the foil: anticipatory, not a commission
        4050, // anticipatory on a target...
        4300, // ...then the real response, RT 300
        5900, // commission, RT 400
        7200, // in an interrupted trial
    ].map((t) => ({ t }));

    const out = scoring.classify(trials, responses, 125);
    assert.deepEqual(
        out.map((t) => [t.outcome, t.rt, t.anticipations, t.extras]),
        [
            ['hit', 400, 0, 1],
            ['correctRejection', null, 1, 0],
            ['hit', 300, 1, 0],
            ['commission', 400, 0, 0],
            ['interrupted', 200, 0, 0],
            ['notPresented', null, 0, 0],
        ]
    );
});

test('a flawless participant scores no errors and full persistence', () => {
    const session = simulate((t) => (t.target ? (t.modality === 'V' ? 400 : 500) : null));
    const result = scoring.scoreSession(session);
    const { A, V, F } = result.scales;

    for (const s of [A, V, F]) {
        assert.equal(s.prudence, 0);
        assert.equal(s.vigilance, 0);
        assert.equal(s.comprehension, 0);
        assert.equal(s.fineMotor, 0);
        close(s.stamina, 100, 'stamina');
        close(s.persistence, 100, 'persistence');
        close(s.readiness, 100, 'readiness');
    }
    assert.equal(V.speed, 400);
    assert.equal(A.speed, 500);
    assert.equal(V.focus, 0);
    assert.equal(V.consistency, 0);
    close(F.speed, 450, 'full-scale speed');
    close(F.balance, 125, 'auditory RT as % of visual');
    assert.deepEqual(result.flags, []);
    assert.equal(result.quintiles.length, 5);
    assert.equal(result.quintiles[0].F.trials, 100);
    assert.equal(result.summaries.F.targets, 250);
    assert.equal(result.summaries.F.foils, 250);
});

test('impulsive clicks on foils in high-demand blocks lower prudence only', () => {
    const session = simulate((t) => (t.target || (t.phase === 'main' && t.condition === 'frequent') ? 400 : null));
    const { F, A, V } = scoring.scoreSession(session).scales;
    // 8 foils in each of 5 high-demand blocks = 40 of 250 foils.
    close(F.prudence, 16, 'prudence');
    close(A.prudence, 16, 'auditory prudence');
    close(V.prudence, 16, 'visual prudence');
    assert.equal(F.vigilance, 0);
    assert.equal(F.comprehension, 0);
});

test('clicking on everything is flagged as a comprehension problem', () => {
    const result = scoring.scoreSession(simulate(() => 400));
    // Commissions in low-demand blocks (210) over the foils there (210) plus
    // high-demand targets (210): 50%.
    close(result.scales.F.comprehension, 50, 'comprehension');
    close(result.scales.F.prudence, 100, 'prudence');
    assert.ok(result.flags.some((f) => f.id === 'comprehension' && f.modality === 'A'));
    assert.ok(result.flags.some((f) => f.id === 'practice'));
});

test('missing rare targets in low-demand blocks lowers vigilance', () => {
    const session = simulate((t) => (t.target && !(t.phase === 'main' && t.condition === 'infrequent') ? 400 : null));
    const { F } = scoring.scoreSession(session).scales;
    // 8 targets in each of 5 low-demand blocks = 40 of 250 targets.
    close(F.vigilance, 16, 'vigilance');
    assert.equal(F.prudence, 0);
    assert.equal(F.comprehension, 0);
    assert.equal(F.readiness, null, 'no low-demand hits, so no readiness ratio');
});

test('slowing down over the test lowers stamina and persistence', () => {
    const session = simulate((t) => {
        if (!t.target) return null;
        if (t.phase === 'main') return 300 + t.index; // 300 ms at the start, 799 ms at the end
        if (t.phase === 'warmup') return 300;
        if (t.phase === 'cooldown') return 400;
        return 400;
    });
    const result = scoring.scoreSession(session);
    assert.ok(result.scales.F.stamina < 70, `stamina ${result.scales.F.stamina}`);
    close(result.scales.F.persistence, 75, 'persistence');
    assert.ok(result.flags.some((f) => f.id === 'persistence'));
    assert.ok(result.scales.F.focus > 100, 'RT spread across the test');
});

test('anticipatory and repeated clicks count as fine-motor responses', () => {
    const session = simulate((t) => (t.phase !== 'main' ? (t.target ? 400 : null) : t.target ? [50, 400, 600] : null));
    const { F } = scoring.scoreSession(session).scales;
    assert.equal(F.vigilance, 0, 'the 400 ms click still counts as the response');
    assert.equal(F.fineMotor, 500, '250 anticipations + 250 extras');
    assert.ok(scoring.scoreSession(session).flags.some((f) => f.id === 'anticipations'));
});

test('an aborted session is flagged and still scores what was run', () => {
    const session = simulate((t) => (t.target ? 400 : null));
    session.status = 'aborted';
    const main = session.runs.find((run) => run.kind === 'main');
    main.trials.slice(250).forEach((trial) => {
        trial.onset = null;
        trial.end = null;
    });
    session.runs = session.runs.filter((run) => run.kind !== 'cooldown');
    const result = scoring.scoreSession(session);
    assert.equal(result.summaries.F.trials, 250);
    assert.equal(result.scales.F.persistence, null);
    assert.ok(result.flags.some((f) => f.id === 'incomplete' && f.level === 'error'));
});

test('summary statistics', () => {
    assert.equal(scoring.mean([1, 2, 3]), 2);
    assert.equal(scoring.sd([2, 4, 4, 4, 5, 5, 7, 9]), Math.sqrt(32 / 7));
    assert.equal(scoring.quantile([1, 2, 3, 4], 0.5), 2.5);
    assert.equal(scoring.round(12.345, 1), 12.3);
    assert.equal(scoring.round(null), null);
});
