/*
 * The application: screens, the test flow, and wiring between modules.
 */
(function (root) {
    'use strict';

    const IVA = root.IVA;
    IVA.VERSION = '1.0.0';

    const i18n = IVA.i18n;
    const protocol = IVA.protocol;
    const scoring = IVA.scoring;
    const storage = IVA.storage;
    const report = IVA.report;

    const PRACTICE_PASS = 70; // % correct needed to move on from practice
    const PRACTICE_ATTEMPTS = 3;
    const RECORD_MS = 1600;

    const state = {
        lang: storage.settings().uiLang,
        draft: null, // participant and options for the next test
        running: false,
        current: null, // { session, result, saved } shown on the results screen
        voices: {}, // decoded voices by language
    };

    // ---- helpers ------------------------------------------------------------

    function $(selector, scope) {
        return (scope || document).querySelector(selector);
    }

    function $$(selector, scope) {
        return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
    }

    function t(key, params) {
        return i18n.t(state.lang, key, params);
    }

    function num(value, digits) {
        return i18n.formatNumber(state.lang, value, digits);
    }

    const esc = report.escapeHtml;

    let toastTimer = 0;
    function toast(message) {
        const node = $('#toast');
        node.textContent = message;
        node.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
            node.hidden = true;
        }, 3500);
    }

    function stamp() {
        return new Date().toISOString().slice(0, 10);
    }

    function newId() {
        const now = new Date();
        const pad = function (n) {
            return String(n).padStart(2, '0');
        };
        return (
            now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '-' +
            pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds()) + '-' +
            Math.random().toString(36).slice(2, 6)
        );
    }

    function safeName(text) {
        return String(text || 'session').replace(/[^\w؀-ۿ-]+/g, '_').slice(0, 40);
    }

    // Accepts Persian and Arabic-Indic digits and decimal separators, as typed on a Persian keyboard.
    function parseNumber(text) {
        const ascii = String(text)
            .trim()
            .replace(/[۰-۹]/g, function (d) {
                return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
            })
            .replace(/[٠-٩]/g, function (d) {
                return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d));
            })
            .replace(/[٫,،]/g, '.');
        return ascii === '' ? NaN : Number(ascii);
    }

    function readJsonFile(input) {
        return new Promise(function (resolve, reject) {
            const file = input.files && input.files[0];
            input.value = '';
            if (!file) {
                reject(new Error('no file'));
                return;
            }
            const reader = new FileReader();
            reader.onload = function () {
                try {
                    resolve(JSON.parse(reader.result));
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    function activeNorms() {
        const id = storage.settings().activeNorms;
        return id ? storage.findNorms(id) : null;
    }

    function voiceFor(lang) {
        if (!state.voices[lang]) {
            state.voices[lang] = IVA.audio.loadVoice(lang, storage.voices(lang)).catch(function (error) {
                delete state.voices[lang];
                throw error;
            });
        }
        return state.voices[lang];
    }

    function play(lang, digit) {
        return IVA.audio
            .unlock()
            .then(function () {
                return voiceFor(lang);
            })
            .then(function (voice) {
                IVA.audio.playNow(voice[digit]);
            });
    }

    // ---- language -----------------------------------------------------------

    function applyLanguage() {
        const html = document.documentElement;
        html.lang = state.lang;
        html.dir = state.lang === 'fa' ? 'rtl' : 'ltr';
        $$('[data-i18n]').forEach(function (node) {
            node.textContent = t(node.getAttribute('data-i18n'));
        });
        $$('[data-i18n-placeholder]').forEach(function (node) {
            node.placeholder = t(node.getAttribute('data-i18n-placeholder'));
        });
        $$('[data-lang-block]').forEach(function (node) {
            node.hidden = node.getAttribute('data-lang-block') !== state.lang;
        });
        $$('[data-protocol-label]').forEach(function (node) {
            const id = node.getAttribute('data-protocol-label');
            node.textContent = t('protocol.' + id, { minutes: num(protocol.estimatedMinutes(id)) });
        });
        document.title = t('app.short');
    }

    // ---- routing ------------------------------------------------------------

    const screens = {
        home: renderHome,
        setup: renderSetup,
        checks: renderChecks,
        instructions: renderInstructions,
        results: renderResults,
        sessions: renderSessions,
        norms: renderNorms,
        settings: renderSettings,
        about: function () {},
    };

    function go(route) {
        if (location.hash === '#' + route) {
            onRoute();
        } else {
            location.hash = '#' + route;
        }
    }

    function onRoute() {
        if (state.running) {
            return;
        }
        const parts = location.hash.replace(/^#/, '').split('/');
        let name = screens[parts[0]] ? parts[0] : 'home';
        if ((name === 'checks' || name === 'instructions') && !state.draft) {
            name = 'setup';
        }
        $$('[data-screen]').forEach(function (section) {
            section.hidden = section.getAttribute('data-screen') !== name;
        });
        const navFor = { results: 'sessions', checks: 'setup', instructions: 'setup' };
        $$('[data-nav]').forEach(function (link) {
            link.classList.toggle('active', link.getAttribute('data-nav') === (navFor[name] || name));
        });
        screens[name](parts[1] ? decodeURIComponent(parts[1]) : undefined);
        root.scrollTo(0, 0);
    }

    // ---- home ---------------------------------------------------------------

    function renderHome() {
        $('#home-storage').classList.toggle('danger', !storage.persistent);
    }

    // ---- setup --------------------------------------------------------------

    function renderSetup() {
        const form = $('#setup-form');
        const defaults = storage.settings();
        const draft = state.draft || {};
        form.code.value = draft.code || '';
        form.name.value = draft.name || '';
        form.age.value = draft.age === undefined || draft.age === null ? '' : draft.age;
        form.sex.value = draft.sex || '';
        form.handedness.value = draft.handedness || '';
        form.examiner.value = draft.examiner !== undefined ? draft.examiner : defaults.examiner;
        form.notes.value = draft.notes || '';
        form.normative.checked = !!draft.normative;
        form.testLang.value = draft.testLang || defaults.testLang;
        form.digits.value = draft.digits || defaults.digits;
        form.response.value = draft.response || defaults.response;
        form.protocol.value = draft.protocol || defaults.protocol;
        $('#setup-error').hidden = true;
    }

    function submitSetup(event) {
        event.preventDefault();
        const form = event.target;
        const error = $('#setup-error');
        const code = form.code.value.trim();
        const age = parseNumber(form.age.value);
        if (!code) {
            error.textContent = t('setup.errorCode');
            error.hidden = false;
            form.code.focus();
            return;
        }
        if (!isFinite(age) || age < 4 || age > 120) {
            error.textContent = t('setup.errorAge');
            error.hidden = false;
            form.age.focus();
            return;
        }
        state.draft = {
            code: code,
            name: form.name.value.trim(),
            age: Math.round(age * 10) / 10,
            sex: form.sex.value,
            handedness: form.handedness.value,
            examiner: form.examiner.value.trim(),
            notes: form.notes.value.trim(),
            normative: form.normative.checked,
            testLang: form.testLang.value,
            digits: form.digits.value,
            response: form.response.value,
            protocol: form.protocol.value || 'standard',
        };
        storage.saveSettings({
            testLang: state.draft.testLang,
            digits: state.draft.digits,
            response: state.draft.response,
            protocol: state.draft.protocol,
            examiner: state.draft.examiner,
        });
        go('checks');
    }

    // ---- checks -------------------------------------------------------------

    function renderChecks() {
        const lang = state.draft.testLang;
        const words = i18n.testText[lang];
        $('#check-play-1').textContent = t('settings.play') + ' «' + words.word1 + '»';
        $('#check-play-2').textContent = t('settings.play') + ' «' + words.word2 + '»';
        $('#checks-error').hidden = true;
        voiceFor(lang).then(
            function (voice) {
                $('#checks-voice').textContent = t(voice.custom ? 'checks.voiceCustom' : 'checks.voiceBuiltin');
            },
            function () {
                $('#checks-error').textContent = t('checks.audioError');
                $('#checks-error').hidden = false;
            }
        );
    }

    function checkPlay(digit) {
        play(state.draft.testLang, digit).catch(function () {
            $('#checks-error').textContent = t('checks.audioError');
            $('#checks-error').hidden = false;
        });
    }

    // ---- participant instructions ---------------------------------------------

    function testParams(draft) {
        const words = i18n.testText[draft.testLang];
        const digits = i18n.digitsFor(draft.digits);
        const settings = protocol.PROTOCOLS[draft.protocol];
        return {
            one: digits[1],
            two: digits[2],
            act: words.act[draft.response],
            actNot: words.actNot[draft.response],
            minutes: i18n.formatNumber(draft.testLang, Math.round((settings.sets * settings.blockSize * 2 * settings.soaMs) / 60000)),
        };
    }

    function lines(list, params) {
        return list
            .map(function (line) {
                return '<p>' + esc(i18n.interpolate(line, params)) + '</p>';
            })
            .join('');
    }

    function renderInstructions() {
        const draft = state.draft;
        const words = i18n.testText[draft.testLang];
        const params = testParams(draft);
        const section = $('[data-screen="instructions"]');
        section.dir = draft.testLang === 'fa' ? 'rtl' : 'ltr';
        section.lang = draft.testLang;
        $('#instr-title').textContent = words.title;
        $('#instr-body').innerHTML = lines(words.intro, params);
        $('#instr-digit-1').textContent = params.one;
        $('#instr-digit-2').textContent = params.two;
        $('#instr-play-1').textContent = words.listen + ': «' + words.word1 + '»';
        $('#instr-play-2').textContent = words.listen + ': «' + words.word2 + '»';
        $('#instr-yes').textContent = i18n.interpolate(words.yes, params);
        $('#instr-no').textContent = i18n.interpolate(words.no, params);
        $('#instr-begin').textContent = words.begin;
        voiceFor(draft.testLang).catch(function () {});
    }

    // ---- the stage ----------------------------------------------------------

    const stage = (function () {
        const element = $('#stage');
        const spans = { 1: $('.digit[data-digit="1"]', element), 2: $('.digit[data-digit="2"]', element) };
        const message = $('#stage-message');
        const panel = $('#pause-panel');

        function setRunning(running) {
            element.classList.toggle('running', running);
            message.hidden = running;
        }

        function enterFullscreen() {
            const request = element.requestFullscreen || element.webkitRequestFullscreen;
            if (request && !document.fullscreenElement) {
                try {
                    const result = request.call(element);
                    if (result && result.catch) {
                        result.catch(function () {});
                    }
                } catch (error) {
                    // Full screen is a nicety; the stage already covers the window.
                }
            }
        }

        function exitFullscreen() {
            if (document.fullscreenElement && document.exitFullscreen) {
                document.exitFullscreen().catch(function () {});
            }
        }

        /*
         * The examiner's pause dialog, in the interface language. Resolves to
         * 'resume' or 'abort'. Resuming re-enters full screen, which needs the
         * click it happens in.
         */
        function pausePanel(info) {
            return new Promise(function (resolve) {
                element.classList.remove('running');
                const phaseName = info.phase ? t('phase.' + info.phase) : '';
                $('#pause-where').textContent = info.total
                    ? t('pause.where', { phase: phaseName, index: num(Math.min(info.index + 1, info.total)), total: num(info.total) })
                    : phaseName;
                $('#pause-reason').textContent =
                    info.reason === 'hidden' ? t('pause.reasonHidden') : info.reason === 'fullscreen' ? t('pause.reasonFullscreen') : '';
                panel.hidden = false;
                const resumeButton = $('#pause-resume');
                const abortButton = $('#pause-abort');
                function done(choice) {
                    resumeButton.onclick = null;
                    abortButton.onclick = null;
                    panel.hidden = true;
                    if (choice === 'resume') {
                        enterFullscreen();
                        element.classList.toggle('running', info.running !== false);
                    }
                    resolve(choice);
                }
                resumeButton.onclick = function () {
                    done('resume');
                };
                abortButton.onclick = function () {
                    done('abort');
                };
                resumeButton.focus();
            });
        }

        /*
         * Show participant text and wait for the start action (the same click
         * or key used to respond). Esc, the corner button, or leaving full
         * screen opens the examiner's dialog instead.
         */
        function showMessage(html, prompt, response, phaseId) {
            setRunning(false);
            $('#stage-lines').innerHTML = html;
            $('#stage-prompt').textContent = prompt;
            $('#stage-finish').hidden = true;
            return new Promise(function (resolve) {
                function accepts(kind) {
                    return response === 'any' || response === kind || (kind === 'touch' && response === 'mouse');
                }
                function cleanup() {
                    element.removeEventListener('pointerdown', onPointer);
                    element.removeEventListener('iva:pause', onPauseRequest);
                    document.removeEventListener('keydown', onKey);
                    document.removeEventListener('fullscreenchange', onFullscreen);
                }
                function examiner(reason) {
                    cleanup();
                    pausePanel({ reason: reason, phase: phaseId, running: false }).then(function (choice) {
                        if (choice === 'abort') {
                            resolve('abort');
                        } else {
                            showMessage(html, prompt, response, phaseId).then(resolve);
                        }
                    });
                }
                function onPointer(event) {
                    if (event.target.closest('.stage-pause, .pause-panel')) {
                        return;
                    }
                    const kind = event.pointerType === 'mouse' ? 'mouse' : 'touch';
                    if ((kind === 'mouse' && event.button !== 0) || !accepts(kind)) {
                        return;
                    }
                    event.preventDefault();
                    cleanup();
                    resolve('start');
                }
                function onKey(event) {
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        examiner('examiner');
                    } else if ((event.code === 'Space' || event.key === ' ') && !event.repeat) {
                        event.preventDefault();
                        if (accepts('key')) {
                            cleanup();
                            resolve('start');
                        }
                    }
                }
                function onPauseRequest() {
                    examiner('examiner');
                }
                function onFullscreen() {
                    if (!document.fullscreenElement) {
                        examiner('fullscreen');
                    }
                }
                element.addEventListener('pointerdown', onPointer);
                element.addEventListener('iva:pause', onPauseRequest);
                document.addEventListener('keydown', onKey);
                document.addEventListener('fullscreenchange', onFullscreen);
            });
        }

        // The closing message, dismissed only by the examiner's button.
        function showDone(html, label) {
            setRunning(false);
            $('#stage-lines').innerHTML = html;
            $('#stage-prompt').textContent = '';
            const button = $('#stage-finish');
            button.textContent = label;
            button.hidden = false;
            return new Promise(function (resolve) {
                button.onclick = function () {
                    button.onclick = null;
                    resolve();
                };
            });
        }

        /*
         * Centre each digit's ink, not its line box, in the frame. Persian
         * digits sit high in the em box (room is kept for descenders), so a
         * plain centred line puts them visibly above the middle. Offsets are in
         * em, so they hold at any screen size.
         */
        function centreInk(span) {
            const context = document.createElement('canvas').getContext('2d');
            const style = getComputedStyle(span);
            context.font = style.fontWeight + ' 100px ' + style.fontFamily;
            context.direction = 'ltr';
            context.textAlign = 'left';
            context.textBaseline = 'alphabetic';
            const m = context.measureText(span.textContent);
            if (!m.fontBoundingBoxAscent || !m.actualBoundingBoxAscent) {
                span.style.transform = '';
                return;
            }
            // With line-height 1 the baseline sits this far below the line box top.
            const baseline = (100 - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
            const inkMiddle = baseline + (m.actualBoundingBoxDescent - m.actualBoundingBoxAscent) / 2;
            const dy = (50 - inkMiddle) / 100;
            const dx = (m.width / 2 - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2) / 100;
            span.style.transform = 'translate(' + dx.toFixed(3) + 'em, ' + dy.toFixed(3) + 'em)';
        }

        function setDigits(digits, lang) {
            spans[1].textContent = digits[1];
            spans[2].textContent = digits[2];
            element.lang = lang;
            element.dir = lang === 'fa' ? 'rtl' : 'ltr';
            const ready = document.fonts && document.fonts.load ? document.fonts.load('700 100px Vazirmatn', digits[1] + digits[2]) : Promise.resolve();
            return ready.then(
                function () {
                    centreInk(spans[1]);
                    centreInk(spans[2]);
                },
                function () {}
            );
        }

        $('#stage-pause').addEventListener('pointerdown', function (event) {
            event.stopPropagation();
            event.preventDefault();
            element.dispatchEvent(new CustomEvent('iva:pause'));
        });

        return {
            element: element,
            api: {
                element: element,
                show: function (stimulus) {
                    spans[stimulus].style.visibility = 'visible';
                },
                hide: function () {
                    spans[1].style.visibility = 'hidden';
                    spans[2].style.visibility = 'hidden';
                },
            },
            open: function () {
                element.hidden = false;
                // Keyboard focus must not stay on the start button behind the stage.
                if (document.activeElement && document.activeElement.blur) {
                    document.activeElement.blur();
                }
                element.focus({ preventScroll: true });
                enterFullscreen();
            },
            close: function () {
                exitFullscreen();
                element.hidden = true;
                element.classList.remove('running');
            },
            setRunning: setRunning,
            setDigits: setDigits,
            showMessage: showMessage,
            showDone: showDone,
            pausePanel: pausePanel,
        };
    })();

    // ---- the test flow ------------------------------------------------------

    function newSession(draft, voice) {
        return {
            format: storage.SESSION_FORMAT,
            version: 1,
            id: newId(),
            createdAt: new Date().toISOString(),
            completedAt: null,
            app: { name: 'iva2-cpt', version: IVA.VERSION },
            participant: {
                code: draft.code,
                name: draft.name,
                age: draft.age,
                sex: draft.sex,
                handedness: draft.handedness,
                notes: draft.notes,
                normative: draft.normative,
            },
            examiner: draft.examiner,
            settings: {
                testLang: draft.testLang,
                digits: draft.digits,
                response: draft.response,
                protocol: draft.protocol,
                seed: protocol.DEFAULT_SEED,
                voice: voice.custom ? 'custom' : 'builtin',
            },
            protocol: Object.assign({}, protocol.PROTOCOLS[draft.protocol]),
            device: {
                userAgent: navigator.userAgent,
                screen: screen.width + '×' + screen.height + ' @' + (root.devicePixelRatio || 1),
                audio: IVA.audio.describe(),
                timing: [],
            },
            status: 'running',
            pauses: [],
            practiceAttempts: 0,
            runs: [],
        };
    }

    function keepRun(run) {
        return {
            id: run.id,
            kind: run.kind,
            trials: run.trials.map(function (trial) {
                const kept = {
                    phase: trial.phase,
                    index: trial.index,
                    modality: trial.modality,
                    stimulus: trial.stimulus,
                    target: trial.target,
                    onset: trial.onset,
                    end: trial.end,
                };
                if (trial.set) {
                    kept.set = trial.set;
                    kept.block = trial.block;
                    kept.condition = trial.condition;
                }
                if (trial.interrupted) {
                    kept.interrupted = true;
                }
                return kept;
            }),
            responses: run.responses,
        };
    }

    function save(session) {
        try {
            storage.saveSession(session);
            return true;
        } catch (error) {
            return false;
        }
    }

    function beginTest() {
        if (state.running) {
            return;
        }
        // Both need the click this runs in: audio first (full screen consumes the activation).
        let unlocking;
        try {
            unlocking = IVA.audio.unlock();
        } catch (error) {
            toast(t('checks.audioError'));
            return;
        }
        stage.open();
        state.running = true;
        unlocking
            .then(function () {
                return runSession(state.draft);
            })
            .catch(function (error) {
                console.error(error);
                toast(t('checks.audioError'));
            })
            .then(function () {
                state.running = false;
                stage.close();
                onRoute();
            });
    }

    async function runSession(draft) {
        const settings = protocol.PROTOCOLS[draft.protocol];
        const plan = protocol.buildPlan(draft.protocol, protocol.DEFAULT_SEED);
        const voice = await voiceFor(draft.testLang);
        const words = i18n.testText[draft.testLang];
        const params = testParams(draft);
        const prompt = i18n.interpolate(draft.response === 'any' ? words.goAny : words.go, params);
        const session = newSession(draft, voice);
        let aborted = false;

        await stage.setDigits(i18n.digitsFor(draft.digits), draft.testLang);

        for (const phase of plan) {
            for (let attempt = 1; ; attempt++) {
                const text = words[phase.id === 'practice' && attempt > 1 ? 'practiceAgain' : phase.id];
                if ((await stage.showMessage(lines(text, params), prompt, draft.response, phase.id)) === 'abort') {
                    aborted = true;
                    break;
                }
                stage.setRunning(true);
                const run = await IVA.engine.runPhase({
                    phase: phase,
                    protocol: settings,
                    stage: stage.api,
                    voice: voice,
                    response: draft.response,
                    onPause: function (info) {
                        return stage.pausePanel(Object.assign({ phase: phase.id }, info));
                    },
                });
                stage.setRunning(false);
                session.pauses = session.pauses.concat(run.pauses);
                session.device.timing.push(Object.assign({ phase: phase.id }, run.timing));

                if (run.aborted) {
                    session.runs.push(keepRun(run));
                    aborted = true;
                    break;
                }
                if (phase.kind === 'practice') {
                    session.practiceAttempts = attempt;
                    const accuracy = scoring.summarize(scoring.classify(run.trials, run.responses, settings.anticipatoryMs)).accuracy;
                    if (accuracy < PRACTICE_PASS && attempt < PRACTICE_ATTEMPTS) {
                        continue;
                    }
                }
                session.runs.push(keepRun(run));
                break;
            }
            if (aborted) {
                break;
            }
            // Saved between phases so a crash or a closed tab loses at most one phase.
            save(session);
        }

        // Ended before anything ran: nothing worth keeping.
        if (aborted && !session.runs.length) {
            return;
        }
        session.status = aborted ? 'aborted' : 'complete';
        session.completedAt = new Date().toISOString();
        const saved = save(session);
        state.draft = null; // the next participant starts from a clean form
        state.current = { session: session, result: scoring.scoreSession(session), saved: saved };

        await stage.showDone(lines(words.done, params), t('done.examiner'));
        location.hash = '#results/' + encodeURIComponent(session.id);
    }

    // ---- results ------------------------------------------------------------

    function renderResults(id) {
        let current = state.current && state.current.session.id === id ? state.current : null;
        if (!current) {
            const session = id ? storage.loadSession(id) : null;
            if (!session) {
                go('sessions');
                return;
            }
            current = { session: session, result: scoring.scoreSession(session), saved: true };
            state.current = current;
        }
        $('#results-unsaved').hidden = current.saved;
        $('#report').innerHTML = report.render(state.lang, current.session, current.result, activeNorms());
    }

    function exportSessionJson(session) {
        report.download(
            'iva2-' + safeName(session.participant.code) + '-' + session.id + '.json',
            JSON.stringify(storage.unpack(session), null, 1),
            'application/json'
        );
    }

    // ---- sessions -----------------------------------------------------------

    function renderSessions() {
        const query = $('#sessions-search').value.trim().toLowerCase();
        const sessions = storage.allSessions().filter(function (s) {
            return !query || (s.participant.code + ' ' + (s.participant.name || '')).toLowerCase().indexOf(query) !== -1;
        });
        const body = $('#sessions-table tbody');
        body.innerHTML = sessions
            .map(function (s) {
                const status =
                    s.status === 'complete'
                        ? '<span class="badge ok">' + esc(t('report.statusComplete')) + '</span>'
                        : '<span class="badge warn">' + esc(t('report.statusAborted')) + '</span>';
                return (
                    '<tr data-id="' + esc(s.id) + '">' +
                    '<td>' + esc(i18n.formatDate(state.lang, s.createdAt)) + '</td>' +
                    '<td>' + esc(s.participant.code) + '</td>' +
                    '<td>' + esc(s.participant.name || '') + '</td>' +
                    '<td class="num">' + num(s.participant.age, Number.isInteger(s.participant.age) ? 0 : 1) + '</td>' +
                    '<td>' + esc(t('protocolName.' + s.settings.protocol)) + '</td>' +
                    '<td>' + status + '</td>' +
                    '<td class="num"><input type="checkbox" data-action="normative"' + (s.participant.normative ? ' checked' : '') + ' aria-label="' + esc(t('sessions.normative')) + '"></td>' +
                    '<td class="actions-cell">' +
                    '<a class="btn small" href="#results/' + encodeURIComponent(s.id) + '">' + esc(t('sessions.view')) + '</a> ' +
                    '<button type="button" class="btn small" data-action="json">JSON</button> ' +
                    '<button type="button" class="btn small danger" data-action="delete">' + esc(t('sessions.delete')) + '</button>' +
                    '</td></tr>'
                );
            })
            .join('');
        $('#sessions-empty').hidden = sessions.length > 0;
        $('#sessions-table').hidden = sessions.length === 0;
        $('#sessions-usage').textContent = t('sessions.storageUse', { kb: num(storage.usageKb()) });
    }

    function onSessionsTable(event) {
        const row = event.target.closest('tr[data-id]');
        const action = event.target.getAttribute('data-action');
        if (!row || !action) {
            return;
        }
        const session = storage.loadSession(row.getAttribute('data-id'));
        if (!session) {
            return;
        }
        if (action === 'delete') {
            if (root.confirm(t('sessions.confirmDelete', { code: session.participant.code }))) {
                storage.deleteSession(session.id);
                if (state.current && state.current.session.id === session.id) {
                    state.current = null;
                }
                renderSessions();
            }
        } else if (action === 'json') {
            exportSessionJson(session);
        } else if (action === 'normative') {
            session.participant.normative = event.target.checked;
            save(session);
            if (state.current && state.current.session.id === session.id) {
                state.current.session.participant.normative = event.target.checked;
            }
        }
    }

    function exportAllSessions() {
        const sessions = storage.allSessions();
        report.download('iva2-sessions-' + stamp() + '.json', JSON.stringify({ format: 'iva2-cpt-sessions', sessions: sessions }, null, 1), 'application/json');
    }

    function exportSummary() {
        const entries = storage.allSessions().map(function (session) {
            return { session: session, result: scoring.scoreSession(session) };
        });
        report.download('iva2-summary-' + stamp() + '.csv', report.summaryCsv(entries, activeNorms()), 'text/csv;charset=utf-8');
    }

    function importSessions(event) {
        readJsonFile(event.target).then(
            function (data) {
                try {
                    const count = storage.importSessions(data);
                    toast(count ? t('sessions.imported', { count: num(count) }) : t('sessions.importFailed'));
                } catch (error) {
                    toast(t('results.saveFailed'));
                }
                renderSessions();
            },
            function () {
                toast(t('sessions.importFailed'));
            }
        );
    }

    // ---- norms --------------------------------------------------------------

    function normativeSessions() {
        return storage.allSessions().filter(function (s) {
            return s.status === 'complete' && s.settings.protocol === 'standard' && s.participant.normative;
        });
    }

    function renderNorms() {
        $('#norms-lead').textContent = t('norms.lead', { min: num(IVA.norms.MIN_GROUP) });
        $('#norms-available').textContent = t('norms.available', { count: num(normativeSessions().length) });
        const form = $('#norms-form');
        if (!form.name.value) {
            form.name.value = t('norms.defaultName', {
                date: new Intl.DateTimeFormat(state.lang === 'fa' ? 'fa-IR' : 'en-GB', { dateStyle: 'short' }).format(new Date()),
            });
        }
        const active = storage.settings().activeNorms;
        const list = storage.normsList();
        if (!list.length) {
            $('#norms-list').innerHTML = '<p class="empty">' + esc(t('norms.empty')) + '</p>';
            return;
        }
        $('#norms-list').innerHTML =
            '<div class="table-wrap"><table class="grid list"><thead><tr><th>' + esc(t('norms.name')) + '</th><th>' +
            esc(t('norms.created')) + '</th><th>' + esc(t('norms.groups')) + '</th><th></th></tr></thead><tbody>' +
            list
                .map(function (table) {
                    const groups = Object.keys(table.groups)
                        .map(function (key) {
                            return esc(report.groupLabel(state.lang, key)) + ' (' + num(table.groups[key].n) + ')';
                        })
                        .join(state.lang === 'fa' ? '، ' : ', ');
                    const isActive = table.id === active;
                    return (
                        '<tr data-id="' + esc(table.id) + '"><td>' + esc(table.name) +
                        (isActive ? ' <span class="badge ok">' + esc(t('norms.active')) + '</span>' : '') + '</td>' +
                        '<td>' + esc(i18n.formatDate(state.lang, table.created)) + '</td><td>' + groups + '</td>' +
                        '<td class="actions-cell">' +
                        '<button type="button" class="btn small" data-action="' + (isActive ? 'deactivate' : 'activate') + '">' +
                        esc(t(isActive ? 'norms.deactivate' : 'norms.activate')) + '</button> ' +
                        '<button type="button" class="btn small" data-action="export">' + esc(t('norms.export')) + '</button> ' +
                        '<button type="button" class="btn small danger" data-action="delete">' + esc(t('norms.delete')) + '</button>' +
                        '</td></tr>'
                    );
                })
                .join('') +
            '</tbody></table></div>';
    }

    function buildNorms(event) {
        event.preventDefault();
        const name = event.target.name.value.trim() || stamp();
        const members = normativeSessions().map(function (session) {
            return { age: session.participant.age, sex: session.participant.sex, scales: scoring.scoreSession(session).scales };
        });
        const table = IVA.norms.build(members, { name: name, protocol: 'standard' });
        const groups = Object.keys(table.groups).length;
        if (!groups) {
            toast(t('norms.tooFew', { min: num(IVA.norms.MIN_GROUP) }));
            return;
        }
        table.id = 'N-' + newId();
        try {
            storage.saveNorms(table);
            if (!activeNorms()) {
                storage.saveSettings({ activeNorms: table.id });
            }
            toast(t('norms.built', { groups: num(groups) }));
        } catch (error) {
            toast(t('results.saveFailed'));
        }
        event.target.name.value = '';
        renderNorms();
    }

    function onNormsList(event) {
        const row = event.target.closest('tr[data-id]');
        const action = event.target.getAttribute('data-action');
        if (!row || !action) {
            return;
        }
        const table = storage.findNorms(row.getAttribute('data-id'));
        if (!table) {
            return;
        }
        if (action === 'activate') {
            storage.saveSettings({ activeNorms: table.id });
        } else if (action === 'deactivate') {
            storage.saveSettings({ activeNorms: null });
        } else if (action === 'export') {
            report.download('iva2-norms-' + safeName(table.name) + '.json', JSON.stringify(table, null, 1), 'application/json');
        } else if (action === 'delete') {
            if (!root.confirm(t('norms.confirmDelete', { name: table.name }))) {
                return;
            }
            storage.deleteNorms(table.id);
            if (storage.settings().activeNorms === table.id) {
                storage.saveSettings({ activeNorms: null });
            }
        }
        renderNorms();
    }

    function importNorms(event) {
        readJsonFile(event.target).then(
            function (table) {
                if (!IVA.norms.validate(table)) {
                    toast(t('norms.importFailed'));
                    return;
                }
                table.id = table.id || 'N-' + newId();
                try {
                    storage.saveNorms(table);
                } catch (error) {
                    toast(t('results.saveFailed'));
                }
                renderNorms();
            },
            function () {
                toast(t('norms.importFailed'));
            }
        );
    }

    // ---- settings -----------------------------------------------------------

    let recording = null;

    function renderSettings() {
        const defaults = storage.settings();
        const form = $('#defaults-form');
        form.testLang.value = defaults.testLang;
        form.digits.value = defaults.digits;
        form.response.value = defaults.response;
        form.examiner.value = defaults.examiner;
        $('#settings-usage').textContent = t('sessions.storageUse', { kb: num(storage.usageKb()) });
        renderVoices();
    }

    function renderVoices() {
        $('#voices').innerHTML = i18n.languages
            .map(function (lang) {
                const custom = storage.voices(lang);
                const words = i18n.testText[lang];
                return (
                    '<div class="voice-lang"><h3>' + esc(t('settings.voiceFor', { lang: t('lang.' + lang) })) + '</h3>' +
                    [1, 2]
                        .map(function (digit) {
                            const clip = custom[digit];
                            return (
                                '<div class="voice-row" data-lang="' + lang + '" data-digit="' + digit + '">' +
                                '<span class="voice-word">«' + esc(words['word' + digit]) + '»</span>' +
                                '<span class="voice-status">' + esc(clip ? t('settings.custom', { ms: num(clip.ms) }) : t('settings.builtin')) + '</span>' +
                                '<button type="button" class="btn small" data-action="play">' + esc(t('settings.play')) + '</button>' +
                                '<button type="button" class="btn small" data-action="record">' + esc(t('settings.record')) + '</button>' +
                                '<label class="btn small file-btn">' + esc(t('settings.upload')) +
                                '<input type="file" accept="audio/*" data-action="upload" hidden></label>' +
                                (clip ? '<button type="button" class="btn small" data-action="reset">' + esc(t('settings.reset')) + '</button>' : '') +
                                '</div>'
                            );
                        })
                        .join('') +
                    '</div>'
                );
            })
            .join('');
    }

    function storeClip(lang, digit, arrayBuffer) {
        return IVA.audio.processRecording(arrayBuffer).then(function (clip) {
            if (!clip) {
                toast(t('settings.clipFailed'));
                return;
            }
            try {
                storage.saveVoice(lang, digit, clip);
            } catch (error) {
                toast(t('results.saveFailed'));
                return;
            }
            delete state.voices[lang];
            renderVoices();
            play(lang, digit).catch(function () {});
        });
    }

    function onVoices(event) {
        const row = event.target.closest('.voice-row');
        const action = event.target.getAttribute('data-action');
        if (!row || !action || action === 'upload') {
            return;
        }
        const lang = row.getAttribute('data-lang');
        const digit = Number(row.getAttribute('data-digit'));
        if (action === 'play') {
            play(lang, digit).catch(function () {
                toast(t('checks.audioError'));
            });
        } else if (action === 'reset') {
            storage.saveVoice(lang, digit, null);
            delete state.voices[lang];
            renderVoices();
        } else if (action === 'record') {
            if (recording) {
                recording.stop();
                return;
            }
            const button = event.target;
            IVA.audio
                .unlock()
                .then(function () {
                    return IVA.audio.record(RECORD_MS);
                })
                .then(function (handle) {
                    recording = handle;
                    button.textContent = t('settings.stop');
                    button.classList.add('recording');
                    $('.voice-status', row).textContent = t('settings.recording');
                    return handle.done;
                })
                .then(function (buffer) {
                    recording = null;
                    return storeClip(lang, digit, buffer);
                })
                .catch(function () {
                    recording = null;
                    toast(t('settings.recordFailed'));
                    renderVoices();
                });
        }
    }

    function onVoiceUpload(event) {
        if (event.target.getAttribute('data-action') !== 'upload') {
            return;
        }
        const row = event.target.closest('.voice-row');
        const file = event.target.files && event.target.files[0];
        if (!row || !file) {
            return;
        }
        file.arrayBuffer()
            .then(function (buffer) {
                return storeClip(row.getAttribute('data-lang'), Number(row.getAttribute('data-digit')), buffer);
            })
            .catch(function () {
                toast(t('settings.clipFailed'));
            });
    }

    function saveDefaults(event) {
        event.preventDefault();
        const form = event.target;
        storage.saveSettings({
            testLang: form.testLang.value,
            digits: form.digits.value,
            response: form.response.value,
            examiner: form.examiner.value.trim(),
        });
        toast(t('settings.saved'));
    }

    function clearAll() {
        if (!root.confirm(t('settings.confirmClear'))) {
            return;
        }
        const uiLang = state.lang;
        storage.clearAll();
        storage.saveSettings({ uiLang: uiLang });
        state.voices = {};
        state.current = null;
        renderSettings();
    }

    // ---- wiring -------------------------------------------------------------

    function init() {
        applyLanguage();

        $('#lang-toggle').addEventListener('click', function () {
            state.lang = state.lang === 'fa' ? 'en' : 'fa';
            storage.saveSettings({ uiLang: state.lang });
            applyLanguage();
            onRoute();
        });

        $('#setup-form').addEventListener('submit', submitSetup);
        $('#setup-form').testLang.addEventListener('change', function (event) {
            // The digit style follows the language unless chosen otherwise afterwards.
            event.target.form.digits.value = event.target.value === 'fa' ? 'fa' : 'latin';
        });
        $('#check-play-1').addEventListener('click', function () {
            checkPlay(1);
        });
        $('#check-play-2').addEventListener('click', function () {
            checkPlay(2);
        });
        $('#instr-play-1').addEventListener('click', function () {
            play(state.draft.testLang, 1).catch(function () {});
        });
        $('#instr-play-2').addEventListener('click', function () {
            play(state.draft.testLang, 2).catch(function () {});
        });
        $('#instr-begin').addEventListener('click', beginTest);

        $('#results-print').addEventListener('click', function () {
            root.print();
        });
        $('#results-csv').addEventListener('click', function () {
            const current = state.current;
            report.download(
                'iva2-' + safeName(current.session.participant.code) + '-' + current.session.id + '-trials.csv',
                report.trialsCsv(current.session, current.result),
                'text/csv;charset=utf-8'
            );
        });
        $('#results-json').addEventListener('click', function () {
            exportSessionJson(state.current.session);
        });

        $('#sessions-search').addEventListener('input', renderSessions);
        $('#sessions-table').addEventListener('click', onSessionsTable);
        $('#sessions-table').addEventListener('change', onSessionsTable);
        $('#sessions-import').addEventListener('change', importSessions);
        $('#sessions-export').addEventListener('click', exportAllSessions);
        $('#sessions-summary').addEventListener('click', exportSummary);

        $('#norms-form').addEventListener('submit', buildNorms);
        $('#norms-list').addEventListener('click', onNormsList);
        $('#norms-import').addEventListener('change', importNorms);

        $('#voices').addEventListener('click', onVoices);
        $('#voices').addEventListener('change', onVoiceUpload);
        $('#defaults-form').addEventListener('submit', saveDefaults);
        $('#settings-clear').addEventListener('click', clearAll);

        root.addEventListener('hashchange', onRoute);
        onRoute();
    }

    init();
})(typeof self !== 'undefined' ? self : this);
