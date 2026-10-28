/*
 * Persistence in localStorage: settings, sessions, recorded voices, norms.
 *
 * Everything stays in this browser profile on this computer; nothing is sent
 * anywhere. Sessions are stored packed (see packRun) so several hundred fit
 * in the usual 5 MB quota; exports use the readable unpacked form. If localStorage is unavailable (some private modes) the
 * store falls back to memory and the app tells the examiner to export.
 */
(function (root) {
    'use strict';

    const IVA = (root.IVA = root.IVA || {});
    const PREFIX = 'iva2.';
    const SESSION_FORMAT = 'iva2-cpt-session';

    let memory = {};
    const backend = (function () {
        try {
            const store = root.localStorage;
            store.setItem(PREFIX + 'probe', '1');
            store.removeItem(PREFIX + 'probe');
            return store;
        } catch (error) {
            return null;
        }
    })();

    function read(key, fallback) {
        try {
            const raw = backend ? backend.getItem(PREFIX + key) : memory[key];
            return raw === null || raw === undefined ? fallback : JSON.parse(raw);
        } catch (error) {
            return fallback;
        }
    }

    // Throws when the quota is exhausted; callers decide how to tell the examiner.
    function write(key, value) {
        const raw = JSON.stringify(value);
        if (backend) {
            backend.setItem(PREFIX + key, raw);
        } else {
            memory[key] = raw;
        }
    }

    function remove(key) {
        try {
            if (backend) {
                backend.removeItem(PREFIX + key);
            } else {
                delete memory[key];
            }
        } catch (error) {
            // Nothing to do: the key is gone either way.
        }
    }

    const DEFAULT_SETTINGS = {
        uiLang: 'fa',
        testLang: 'fa',
        digits: 'fa',
        response: 'mouse',
        protocol: 'standard',
        examiner: '',
        activeNorms: null,
    };

    function settings() {
        return Object.assign({}, DEFAULT_SETTINGS, read('settings', {}));
    }

    function saveSettings(patch) {
        const next = Object.assign(settings(), patch);
        try {
            write('settings', next);
        } catch (error) {
            // Settings are a convenience; losing them is not worth an error.
        }
        return next;
    }

    // ---- sessions ---------------------------------------------------------

    /*
     * Packed runs keep only what the plan does not already say:
     *
     *   stim   one letter per trial: a = visual 1, b = visual 2, c = auditory 1,
     *          d = auditory 2 (set, block and condition follow from the index)
     *   on     onsets in tenths of a millisecond, each as the difference from
     *          the previous one (the first from t0); null if never presented
     *   ends   window ends that are not simply the next onset (or onset + SOA
     *          for the last trial): { index: end - onset }, again in tenths
     *   cut    indices of trials interrupted by a pause
     *   resp   response times in tenths, as differences, the first from t0
     *   src    one letter per response: m(ouse), k(ey), t(ouch)
     *
     * Integers avoid accumulating floating-point error over 500 differences.
     * A session shrinks to about a quarter of its plain JSON size.
     */
    const CODES = { V1: 'a', V2: 'b', A1: 'c', A2: 'd' };
    const DECODE = { a: ['V', 1], b: ['V', 2], c: ['A', 1], d: ['A', 2] };
    const SOURCES = { mouse: 'm', key: 'k', touch: 't' };
    const SOURCE_NAMES = { m: 'mouse', k: 'key', t: 'touch' };

    function tenths(value) {
        return Math.round(value * 10);
    }

    function expectedEnd(trials, index, soa) {
        const next = trials[index + 1];
        return next && next.onset !== null && next.onset !== undefined ? next.onset : trials[index].onset + soa;
    }

    function packRun(run, soa) {
        const presented = run.trials.filter(function (t) {
            return t.onset !== null && t.onset !== undefined;
        });
        const t0 = presented.length ? tenths(presented[0].onset) : 0;
        let previous = t0;
        const ends = {};
        const cut = [];
        const on = run.trials.map(function (t, index) {
            if (t.onset === null || t.onset === undefined) {
                return null;
            }
            const onset = tenths(t.onset);
            const delta = onset - previous;
            previous = onset;
            if (t.end !== null && t.end !== undefined && tenths(t.end) !== tenths(expectedEnd(run.trials, index, soa))) {
                ends[index] = tenths(t.end) - onset;
            }
            if (t.interrupted) {
                cut.push(index);
            }
            return delta;
        });
        let last = t0;
        return {
            id: run.id,
            kind: run.kind,
            stim: run.trials
                .map(function (t) {
                    return CODES[t.modality + t.stimulus];
                })
                .join(''),
            t0: t0,
            on: on,
            ends: ends,
            cut: cut,
            resp: run.responses.map(function (r) {
                const time = tenths(r.t);
                const delta = time - last;
                last = time;
                return delta;
            }),
            src: run.responses
                .map(function (r) {
                    return SOURCES[r.source] || 'k';
                })
                .join(''),
        };
    }

    function unpackRun(run, protocol) {
        let clock = run.t0;
        const trials = run.stim.split('').map(function (code, index) {
            const decoded = DECODE[code];
            const trial = {
                phase: run.kind,
                index: index,
                modality: decoded[0],
                stimulus: decoded[1],
                target: decoded[1] === 1,
                onset: null,
                end: null,
            };
            if (run.kind === 'main') {
                trial.set = Math.floor(index / (protocol.blockSize * 2)) + 1;
                trial.block = Math.floor(index / protocol.blockSize) + 1;
                trial.condition = trial.block % 2 === 1 ? 'frequent' : 'infrequent';
            }
            if (run.on[index] !== null) {
                clock += run.on[index];
                trial.onset = clock / 10;
            }
            return trial;
        });
        trials.forEach(function (trial, index) {
            if (trial.onset === null) {
                return;
            }
            trial.end =
                run.ends[index] !== undefined
                    ? (tenths(trial.onset) + run.ends[index]) / 10
                    : expectedEnd(trials, index, protocol.soaMs);
        });
        run.cut.forEach(function (index) {
            trials[index].interrupted = true;
        });
        let time = run.t0;
        return {
            id: run.id,
            kind: run.kind,
            trials: trials,
            responses: run.resp.map(function (delta, i) {
                time += delta;
                return { t: time / 10, source: SOURCE_NAMES[run.src[i]] || 'key' };
            }),
        };
    }

    function pack(session) {
        return Object.assign({}, session, {
            packed: 2,
            runs: session.runs.map(function (run) {
                return packRun(run, session.protocol.soaMs);
            }),
        });
    }

    function unpack(stored) {
        if (!stored || !stored.packed) {
            return stored;
        }
        const session = Object.assign({}, stored, {
            runs: stored.runs.map(function (run) {
                return unpackRun(run, stored.protocol);
            }),
        });
        delete session.packed;
        return session;
    }

    function sessionIds() {
        return read('sessions', []);
    }

    function saveSession(session) {
        write('session.' + session.id, pack(session));
        const ids = sessionIds();
        if (ids.indexOf(session.id) === -1) {
            ids.push(session.id);
            write('sessions', ids);
        }
    }

    function loadSession(id) {
        return unpack(read('session.' + id, null));
    }

    function deleteSession(id) {
        remove('session.' + id);
        write(
            'sessions',
            sessionIds().filter(function (other) {
                return other !== id;
            })
        );
    }

    function allSessions() {
        return sessionIds()
            .map(loadSession)
            .filter(Boolean)
            .sort(function (a, b) {
                return (b.createdAt || '').localeCompare(a.createdAt || '');
            });
    }

    function isSession(value) {
        return !!(value && value.format === SESSION_FORMAT && value.id && Array.isArray(value.runs));
    }

    // Accepts one exported session, an array of them, or { sessions: [...] }.
    function importSessions(data) {
        const list = Array.isArray(data) ? data : data && Array.isArray(data.sessions) ? data.sessions : [data];
        const sessions = list.map(unpack).filter(isSession);
        sessions.forEach(saveSession);
        return sessions.length;
    }

    // ---- voices -----------------------------------------------------------

    function voices(lang) {
        return read('voice.' + lang, {});
    }

    function saveVoice(lang, digit, clip) {
        const current = voices(lang);
        if (clip) {
            current[digit] = clip;
        } else {
            delete current[digit];
        }
        write('voice.' + lang, current);
    }

    // ---- norms ------------------------------------------------------------

    function normsList() {
        return read('norms', []);
    }

    function saveNorms(table) {
        const list = normsList().filter(function (other) {
            return other.id !== table.id;
        });
        list.push(table);
        write('norms', list);
    }

    function deleteNorms(id) {
        write(
            'norms',
            normsList().filter(function (table) {
                return table.id !== id;
            })
        );
    }

    function findNorms(id) {
        return (
            normsList().find(function (table) {
                return table.id === id;
            }) || null
        );
    }

    // ---- housekeeping -----------------------------------------------------

    function usageKb() {
        if (!backend) {
            return 0;
        }
        let chars = 0;
        for (let i = 0; i < backend.length; i++) {
            const key = backend.key(i);
            if (key && key.indexOf(PREFIX) === 0) {
                chars += key.length + (backend.getItem(key) || '').length;
            }
        }
        return Math.round((chars * 2) / 1024); // UTF-16
    }

    function clearAll() {
        if (backend) {
            const keys = [];
            for (let i = 0; i < backend.length; i++) {
                const key = backend.key(i);
                if (key && key.indexOf(PREFIX) === 0) {
                    keys.push(key);
                }
            }
            keys.forEach(function (key) {
                backend.removeItem(key);
            });
        }
        memory = {};
    }

    IVA.storage = {
        SESSION_FORMAT: SESSION_FORMAT,
        persistent: !!backend,
        settings: settings,
        saveSettings: saveSettings,
        saveSession: saveSession,
        loadSession: loadSession,
        deleteSession: deleteSession,
        allSessions: allSessions,
        importSessions: importSessions,
        voices: voices,
        saveVoice: saveVoice,
        normsList: normsList,
        saveNorms: saveNorms,
        deleteNorms: deleteNorms,
        findNorms: findNorms,
        usageKb: usageKb,
        clearAll: clearAll,
        // Exposed for tests.
        pack: pack,
        unpack: unpack,
    };
})(typeof self !== 'undefined' ? self : this);
