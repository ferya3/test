/*
 * The trial runner: presents one phase of the plan and records what happened.
 *
 * Timing. Trial k is due at base + k × SOA on the performance.now() clock, so
 * small delays never accumulate. Visual stimuli are drawn in the
 * requestAnimationFrame callback whose frame lands nearest the due time, and
 * the onset is taken as the timestamp of the next callback (when that frame is
 * on screen). They are hidden on the frame that makes them visible for about
 * 167 ms. Auditory stimuli are handed to the audio clock 200 ms early and
 * start sample-exactly at the due time (see audio.js). Responses carry the
 * event's own timeStamp, on the same clock, so input-loop delays do not count
 * as reaction time.
 *
 * The runner only records onsets, window ends and response times; deciding
 * what each response means is scoring.js's job, after the fact.
 */
(function (root) {
    'use strict';

    const IVA = (root.IVA = root.IVA || {});

    const LEAD_IN_MS = 1500;
    const AUDIO_LOOKAHEAD_MS = 200;

    function median(values) {
        const sorted = values.slice().sort(function (a, b) {
            return a - b;
        });
        return sorted[Math.floor(sorted.length / 2)];
    }

    function eventTime(event) {
        const now = performance.now();
        // event.timeStamp is on the performance clock in current browsers;
        // fall back to now() if a browser reports something else.
        return event.timeStamp > 0 && Math.abs(event.timeStamp - now) < 5000 ? event.timeStamp : now;
    }

    function summary(values) {
        if (!values.length) {
            return null;
        }
        const mean = values.reduce(function (a, b) {
            return a + b;
        }, 0) / values.length;
        return {
            mean: Math.round(mean * 10) / 10,
            min: Math.round(Math.min.apply(null, values) * 10) / 10,
            max: Math.round(Math.max.apply(null, values) * 10) / 10,
        };
    }

    /*
     * options:
     *   phase      { id, kind, trials } from protocol.buildPlan()
     *   protocol   protocol constants
     *   stage      { element, show(stimulus), hide() }; show(1) shows the 1
     *   voice      { 1: AudioBuffer, 2: AudioBuffer }
     *   response   'mouse' | 'key' | 'touch' | 'any'
     *   onPause    function ({ reason, index, total }) -> Promise<'resume'|'abort'>
     *
     * Resolves to { id, kind, trials, responses, pauses, aborted, timing }.
     */
    function runPhase(options) {
        return new Promise(function (resolve) {
            const protocol = options.protocol;
            const soa = protocol.soaMs;
            const stage = options.stage;
            const trials = options.phase.trials.map(function (trial) {
                return Object.assign({}, trial, { onset: null, end: null });
            });
            const responses = [];
            const pauses = [];
            const lags = [];
            const shown = [];
            const deltas = [];

            let base = performance.now() + LEAD_IN_MS;
            let next = 0;
            let frame = 1000 / 60;
            let lastFrame = null;
            let visual = null; // { index, due, onset, hidden }
            let sounds = []; // { index, source, onset }
            let paused = false;
            let finished = false;
            let rafId = 0;

            function closePrevious(index, onset) {
                const previous = trials[index - 1];
                if (previous && previous.onset !== null && previous.end === null) {
                    previous.end = onset;
                }
            }

            function respond(event, source) {
                if (paused || finished) {
                    return;
                }
                responses.push({ t: eventTime(event), source: source });
            }

            function accepts(kind) {
                return options.response === 'any' || options.response === kind;
            }

            function onPointerDown(event) {
                if (event.pointerType === 'mouse') {
                    if (event.button === 0 && accepts('mouse')) {
                        respond(event, 'mouse');
                    }
                } else if (accepts('touch') || accepts('mouse')) {
                    // Pen and touch both count where touch is allowed; a touch
                    // screen used in mouse mode still deserves its taps.
                    respond(event, 'touch');
                }
                event.preventDefault();
            }

            function onKeyDown(event) {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    pause('examiner');
                    return;
                }
                if ((event.code === 'Space' || event.key === ' ') && !event.repeat) {
                    event.preventDefault();
                    if (accepts('key')) {
                        respond(event, 'key');
                    }
                }
            }

            function onVisibility() {
                if (document.hidden) {
                    pause('hidden');
                }
            }

            function onFullscreen() {
                if (!document.fullscreenElement) {
                    pause('fullscreen');
                }
            }

            function onContextMenu(event) {
                event.preventDefault();
            }

            // The on-screen pause button (for touch screens, which have no Esc).
            function onPauseRequest() {
                pause('examiner');
            }

            function listen(on) {
                const method = on ? 'addEventListener' : 'removeEventListener';
                stage.element[method]('pointerdown', onPointerDown);
                stage.element[method]('contextmenu', onContextMenu);
                stage.element[method]('iva:pause', onPauseRequest);
                document[method]('keydown', onKeyDown);
                document[method]('visibilitychange', onVisibility);
                document[method]('fullscreenchange', onFullscreen);
            }

            function tick(timestamp) {
                rafId = requestAnimationFrame(tick);

                if (lastFrame !== null) {
                    const delta = timestamp - lastFrame;
                    if (delta > 4 && delta < 50) {
                        deltas.push(delta);
                        if (deltas.length > 120) {
                            deltas.shift();
                        }
                        frame = median(deltas);
                    }
                }
                lastFrame = timestamp;
                if (paused || finished) {
                    return;
                }

                // The frame drawn last callback is on screen now.
                if (visual && visual.onset === null) {
                    visual.onset = timestamp;
                    trials[visual.index].onset = timestamp;
                    closePrevious(visual.index, timestamp);
                    lags.push(timestamp - visual.due);
                } else if (visual && visual.hidden === true) {
                    shown.push(timestamp - visual.onset);
                    visual.hidden = 'measured';
                }

                // Hide on the frame that ends the flash nearest the intended duration.
                if (visual && visual.onset !== null && visual.hidden === false &&
                    timestamp + frame >= visual.onset + protocol.visualMs - frame / 2) {
                    stage.hide();
                    visual.hidden = true;
                }

                const now = performance.now();
                if (next < trials.length) {
                    const trial = trials[next];
                    const due = base + next * soa;
                    if (trial.modality === 'A') {
                        if (now >= due - AUDIO_LOOKAHEAD_MS) {
                            const played = IVA.audio.playAt(options.voice[trial.stimulus], due);
                            trial.onset = played.onset;
                            closePrevious(next, played.onset);
                            sounds.push({ index: next, source: played.source, onset: played.onset });
                            next++;
                        }
                    } else if (timestamp + frame >= due - frame / 2) {
                        if (visual && visual.hidden === false) {
                            stage.hide();
                        }
                        stage.show(trial.stimulus);
                        visual = { index: next, due: due, onset: null, hidden: false };
                        next++;
                    }
                } else {
                    const last = trials[trials.length - 1];
                    if (last.onset !== null && now >= last.onset + soa && (!visual || visual.hidden !== false)) {
                        finish(false);
                    }
                }
            }

            function pause(reason) {
                if (paused || finished) {
                    return;
                }
                paused = true;
                const at = performance.now();
                stage.hide();

                // Withdraw anything scheduled but not yet heard or seen.
                sounds.forEach(function (sound) {
                    if (sound.onset > at) {
                        IVA.audio.stop(sound.source);
                        trials[sound.index].onset = null;
                        next = Math.min(next, sound.index);
                    }
                });
                sounds = [];
                if (visual && visual.onset === null) {
                    next = Math.min(next, visual.index);
                }
                visual = null;
                trials.forEach(function (trial, index) {
                    if (index >= next) {
                        trial.onset = null;
                        trial.end = null;
                    }
                });

                // The trial in progress loses the rest of its response window.
                const current = trials[next - 1];
                if (current && current.onset !== null) {
                    const natural = current.onset + soa;
                    current.end = Math.min(natural, at);
                    current.interrupted = at < natural;
                }

                const record = { phase: options.phase.id, index: next, start: Math.round(at), end: null, reason: reason };
                pauses.push(record);

                options.onPause({ reason: reason, index: next, total: trials.length }).then(function (choice) {
                    record.end = Math.round(performance.now());
                    if (choice === 'abort') {
                        finish(true);
                        return;
                    }
                    base = performance.now() + LEAD_IN_MS - next * soa;
                    lastFrame = null;
                    paused = false;
                });
            }

            function finish(aborted) {
                if (finished) {
                    return;
                }
                finished = true;
                cancelAnimationFrame(rafId);
                listen(false);
                stage.hide();
                trials.forEach(function (trial) {
                    if (trial.onset !== null && trial.end === null) {
                        trial.end = trial.onset + soa;
                    }
                });
                resolve({
                    id: options.phase.id,
                    kind: options.phase.kind,
                    trials: trials,
                    responses: responses,
                    pauses: pauses,
                    aborted: aborted,
                    timing: {
                        frameMs: Math.round(frame * 100) / 100,
                        visualLagMs: summary(lags),
                        visualShownMs: summary(shown),
                    },
                });
            }

            listen(true);
            rafId = requestAnimationFrame(tick);
        });
    }

    IVA.engine = { runPhase: runPhase, LEAD_IN_MS: LEAD_IN_MS };
})(typeof self !== 'undefined' ? self : this);
