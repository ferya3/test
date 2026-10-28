'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
// storage.js is a browser script; in Node it attaches to module.exports and,
// with no localStorage, keeps everything in memory.
const { storage } = require('../js/storage.js').IVA;
const scoring = require('../js/scoring.js');
const { simulate } = require('./helpers.js');

function session(id) {
    const simulated = simulate((t) => (t.target ? 420 : null));
    simulated.runs[3].trials[7].interrupted = true;
    return Object.assign(simulated, {
        format: storage.SESSION_FORMAT,
        version: 1,
        id: id,
        createdAt: '2026-10-28T10:00:00.000Z',
        participant: { code: 'P1', name: 'آزمودنی', age: 9, sex: 'f', normative: true },
        settings: { protocol: 'standard', testLang: 'fa', digits: 'fa', response: 'mouse', voice: 'builtin' },
    });
}

test('packing a session for storage loses nothing that scoring uses', () => {
    const original = session('S1');
    const restored = storage.unpack(JSON.parse(JSON.stringify(storage.pack(original))));
    assert.deepEqual(scoring.scoreSession(restored).scales, scoring.scoreSession(original).scales);
    assert.equal(restored.runs[3].trials[7].interrupted, true);
    assert.equal(restored.runs[3].trials[0].condition, 'frequent');
    assert.equal(restored.runs[0].trials[0].condition, undefined);
    assert.equal(restored.packed, undefined);
});

test('packing keeps pauses, interruptions, unpresented trials and 0.1 ms precision', () => {
    const original = session('S3');
    const main = original.runs[3];
    // A pause during trial 7: its window is cut short, and the test resumes 20 s later.
    main.trials[7].end = main.trials[7].onset + 300.04;
    main.trials.slice(8).forEach((trial) => {
        trial.onset += 20000.123;
        trial.end += 20000.123;
    });
    // Aborted 10 trials before the end.
    main.trials.slice(490).forEach((trial) => {
        trial.onset = null;
        trial.end = null;
    });
    main.trials[489].end = main.trials[489].onset + 1500;
    main.responses.forEach((response, i) => {
        response.t += i % 2 ? 0.04 : 0.06;
        response.source = i % 3 ? 'mouse' : 'touch';
    });

    const packed = storage.pack(original);
    const restored = storage.unpack(JSON.parse(JSON.stringify(packed)));
    const tenth = (v) => (v === null ? null : Math.round(v * 10) / 10);
    restored.runs.forEach((run, r) => {
        const source = original.runs[r];
        assert.deepEqual(
            run.trials.map((t) => [t.index, t.modality, t.stimulus, t.target, t.set, t.block, t.condition, t.onset, t.end, !!t.interrupted]),
            source.trials.map((t) => [t.index, t.modality, t.stimulus, t.target, t.set, t.block, t.condition, tenth(t.onset), tenth(t.end), !!t.interrupted]),
            run.id
        );
        assert.deepEqual(
            run.responses.map((x) => [x.t, x.source]),
            source.responses.map((x) => [tenth(x.t), x.source])
        );
    });
    assert.deepEqual(packed.runs[3].ends, { 7: 3000 });
    assert.ok(JSON.stringify(packed).length < JSON.stringify(original).length / 4, 'packing should save space');
});

test('sessions round-trip through save, list, import and delete', () => {
    storage.clearAll();
    storage.saveSession(session('S1'));
    assert.equal(storage.allSessions().length, 1);
    assert.equal(storage.loadSession('S1').participant.name, 'آزمودنی');

    const exported = JSON.parse(JSON.stringify({ sessions: [session('S2'), { junk: true }] }));
    assert.equal(storage.importSessions(exported), 1);
    assert.deepEqual(storage.allSessions().map((s) => s.id).sort(), ['S1', 'S2']);

    storage.deleteSession('S1');
    assert.deepEqual(storage.allSessions().map((s) => s.id), ['S2']);
});

test('settings, voices and norms', () => {
    storage.clearAll();
    assert.equal(storage.settings().uiLang, 'fa');
    storage.saveSettings({ uiLang: 'en' });
    assert.equal(storage.settings().uiLang, 'en');
    assert.equal(storage.settings().protocol, 'standard');

    storage.saveVoice('fa', 1, { wav: 'AAAA', ms: 300 });
    assert.deepEqual(storage.voices('fa'), { 1: { wav: 'AAAA', ms: 300 } });
    storage.saveVoice('fa', 1, null);
    assert.deepEqual(storage.voices('fa'), {});

    storage.saveNorms({ id: 'N1', name: 'a' });
    storage.saveNorms({ id: 'N1', name: 'b' });
    assert.deepEqual(storage.normsList(), [{ id: 'N1', name: 'b' }]);
    assert.equal(storage.findNorms('N1').name, 'b');
    storage.deleteNorms('N1');
    assert.equal(storage.findNorms('N1'), null);
});
