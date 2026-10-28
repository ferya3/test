/*
 * Response classification and scale computation.
 *
 * Everything here is a pure function of the recorded trials and responses, so
 * a stored session can always be re-scored, and the scoring is unit-tested in
 * Node (tests/scoring.test.js).
 *
 * The scale names follow the IVA-2 (Response Control: Prudence, Consistency,
 * Stamina; Attention: Vigilance, Focus, Speed; plus attribute and validity
 * scales). BrainTrain's exact formulas and norms are proprietary; the raw
 * definitions below are this program's own, chosen to measure what each IVA-2
 * scale is published to measure, and are documented in README.md.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        (root.IVA = root.IVA || {}).scoring = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MODALITIES = ['A', 'V', 'F']; // auditory, visual, full scale (both)

    // Direction says which way is better, for orienting standard scores so
    // that higher is always better. null: descriptive, neither way is better.
    const SCALES = {
        prudence: { group: 'responseControl', unit: '%', direction: 'lower' },
        consistency: { group: 'responseControl', unit: '%', direction: 'lower' },
        stamina: { group: 'responseControl', unit: '%', direction: 'higher' },
        vigilance: { group: 'attention', unit: '%', direction: 'lower' },
        focus: { group: 'attention', unit: 'ms', direction: 'lower' },
        speed: { group: 'attention', unit: 'ms', direction: 'lower' },
        readiness: { group: 'attribute', unit: '%', direction: null },
        fineMotor: { group: 'attribute', unit: 'count', direction: 'lower' },
        comprehension: { group: 'validity', unit: '%', direction: 'lower' },
        persistence: { group: 'validity', unit: '%', direction: 'higher' },
        sensoryMotor: { group: 'validity', unit: 'ms', direction: 'lower' },
    };

    // Balance compares the two modalities, so it exists only at full scale.
    const BALANCE = { group: 'attribute', unit: '%', direction: null };

    const COMPOSITES = {
        responseControl: ['prudence', 'consistency', 'stamina'],
        attention: ['vigilance', 'focus', 'speed'],
    };

    function round(value, digits) {
        if (value === null || value === undefined || !isFinite(value)) {
            return null;
        }
        const factor = Math.pow(10, digits === undefined ? 1 : digits);
        return Math.round(value * factor) / factor;
    }

    function mean(values) {
        if (!values.length) {
            return null;
        }
        return values.reduce(function (sum, v) {
            return sum + v;
        }, 0) / values.length;
    }

    // Sample standard deviation (n - 1).
    function sd(values) {
        if (values.length < 2) {
            return null;
        }
        const m = mean(values);
        const squares = values.reduce(function (sum, v) {
            return sum + (v - m) * (v - m);
        }, 0);
        return Math.sqrt(squares / (values.length - 1));
    }

    // Linear-interpolation quantile (the common "type 7" definition).
    function quantile(sorted, q) {
        if (!sorted.length) {
            return null;
        }
        const position = (sorted.length - 1) * q;
        const lower = Math.floor(position);
        const upper = Math.ceil(position);
        return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
    }

    function ratio(numerator, denominator, scale) {
        if (numerator === null || denominator === null || !denominator) {
            return null;
        }
        return (numerator / denominator) * (scale === undefined ? 100 : scale);
    }

    function percent(count, total) {
        return total ? (count / total) * 100 : null;
    }

    /*
     * Assign every response to the trial whose window it falls in. A trial's
     * window runs from its onset to its `end` (the next onset, or onset + SOA
     * for the last trial, or the moment the test was paused). Within a window:
     *
     *   latency < anticipatoryMs   anticipatory: too fast to be a reaction to
     *                              this stimulus; does not count as a response
     *   first later response       the response; its latency is the RT
     *   any further response       extra (multiple clicking)
     *
     * Responses outside every window (before the first trial, during a pause)
     * are not attributed to any trial.
     */
    function classify(trials, responses, anticipatoryMs) {
        const times = responses
            .map(function (response) {
                return typeof response === 'number' ? response : response.t;
            })
            .sort(function (a, b) {
                return a - b;
            });
        let cursor = 0;

        return trials.map(function (trial) {
            const result = Object.assign({}, trial, { rt: null, anticipations: 0, extras: 0, outcome: 'notPresented' });
            if (trial.onset === null || trial.onset === undefined) {
                return result;
            }
            while (cursor < times.length && times[cursor] < trial.onset) {
                cursor++;
            }
            while (cursor < times.length && times[cursor] < trial.end) {
                const latency = times[cursor] - trial.onset;
                if (latency < anticipatoryMs) {
                    result.anticipations++;
                } else if (result.rt === null) {
                    result.rt = latency;
                } else {
                    result.extras++;
                }
                cursor++;
            }
            if (trial.interrupted) {
                result.outcome = 'interrupted';
            } else if (trial.target) {
                result.outcome = result.rt === null ? 'omission' : 'hit';
            } else {
                result.outcome = result.rt === null ? 'correctRejection' : 'commission';
            }
            return result;
        });
    }

    function scored(trial) {
        return trial.outcome !== 'notPresented' && trial.outcome !== 'interrupted';
    }

    function inModality(modality) {
        return function (trial) {
            return modality === 'F' || trial.modality === modality;
        };
    }

    function rtStats(rts) {
        const sorted = rts.slice().sort(function (a, b) {
            return a - b;
        });
        const m = mean(sorted);
        const median = quantile(sorted, 0.5);
        const q1 = quantile(sorted, 0.25);
        const q3 = quantile(sorted, 0.75);
        const deviation = sd(sorted);
        return {
            n: sorted.length,
            mean: m,
            median: median,
            sd: deviation,
            q1: q1,
            q3: q3,
            min: sorted.length ? sorted[0] : null,
            max: sorted.length ? sorted[sorted.length - 1] : null,
            // Robust spread: unaffected by a handful of very slow responses.
            iqrPercent: sorted.length >= 4 && median ? ((q3 - q1) / median) * 100 : null,
            cv: m && deviation !== null ? (deviation / m) * 100 : null,
        };
    }

    // Counts, error rates and RT statistics for a set of classified trials.
    function summarize(trials) {
        const counts = { hit: 0, omission: 0, commission: 0, correctRejection: 0 };
        let anticipations = 0;
        let extras = 0;
        const hitRts = [];
        const commissionRts = [];

        trials.filter(scored).forEach(function (trial) {
            counts[trial.outcome]++;
            anticipations += trial.anticipations;
            extras += trial.extras;
            if (trial.outcome === 'hit') {
                hitRts.push(trial.rt);
            } else if (trial.outcome === 'commission') {
                commissionRts.push(trial.rt);
            }
        });

        const targets = counts.hit + counts.omission;
        const foils = counts.commission + counts.correctRejection;
        return {
            trials: targets + foils,
            targets: targets,
            foils: foils,
            hits: counts.hit,
            omissions: counts.omission,
            commissions: counts.commission,
            correctRejections: counts.correctRejection,
            omissionPercent: percent(counts.omission, targets),
            commissionPercent: percent(counts.commission, foils),
            accuracy: percent(counts.hit + counts.correctRejection, targets + foils),
            anticipations: anticipations,
            extras: extras,
            rt: rtStats(hitRts),
            commissionRt: mean(commissionRts),
            hitRts: hitRts,
        };
    }

    function fastestMean(rts, count) {
        if (rts.length < count) {
            return null;
        }
        return mean(
            rts
                .slice()
                .sort(function (a, b) {
                    return a - b;
                })
                .slice(0, count)
        );
    }

    /*
     * Raw scale values for one modality (A, V) or both (F).
     *
     *   prudence       commission errors, % of foils
     *   consistency    interquartile range of hit RTs, % of the median RT
     *   stamina        mean hit RT over the first 40% of the main test as % of
     *                  the mean over the last 40% (the first and last 200 of
     *                  500 trials); below 100 means slowing down
     *   vigilance      omission errors, % of targets
     *   focus          standard deviation of hit RTs (ms); sensitive to the
     *                  isolated very slow responses of attention lapses
     *   speed          mean hit RT (ms)
     *   readiness      mean hit RT in low-demand blocks as % of the mean in
     *                  high-demand blocks
     *   fineMotor      anticipatory plus extra responses (count)
     *   comprehension  the errors that neither impulsivity nor inattention
     *                  explains (commissions where foils are the norm,
     *                  omissions where targets are the norm), % of the
     *                  stimuli they could occur on
     *   persistence    mean of the 3 fastest warm-up RTs as % of the mean of
     *                  the 3 fastest cool-down RTs; below 100 means slower at
     *                  the end than at the start
     *   sensoryMotor   mean simple RT across warm-up and cool-down (ms)
     */
    function scalesFor(modality, phases) {
        const pick = inModality(modality);
        const main = phases.main.filter(pick);
        const all = summarize(main);
        const frequent = summarize(
            main.filter(function (t) {
                return t.condition === 'frequent';
            })
        );
        const infrequent = summarize(
            main.filter(function (t) {
                return t.condition === 'infrequent';
            })
        );

        const total = phases.main.length;
        const firstCut = Math.round(total * 0.4);
        const lastCut = total - firstCut;
        const early = summarize(
            main.filter(function (t) {
                return t.index < firstCut;
            })
        );
        const late = summarize(
            main.filter(function (t) {
                return t.index >= lastCut;
            })
        );

        const warmup = summarize(phases.warmup.filter(pick));
        const cooldown = summarize(phases.cooldown.filter(pick));
        const simpleRts = warmup.hitRts.concat(cooldown.hitRts);

        return {
            prudence: all.commissionPercent,
            consistency: all.rt.iqrPercent,
            stamina: ratio(early.rt.mean, late.rt.mean),
            vigilance: all.omissionPercent,
            focus: all.rt.sd,
            speed: all.rt.mean,
            readiness: ratio(infrequent.rt.mean, frequent.rt.mean),
            fineMotor: main.length ? all.anticipations + all.extras : null,
            comprehension: percent(
                infrequent.commissions + frequent.omissions,
                infrequent.foils + frequent.targets
            ),
            persistence: ratio(fastestMean(warmup.hitRts, 3), fastestMean(cooldown.hitRts, 3)),
            sensoryMotor: mean(simpleRts),
        };
    }

    /*
     * Score a whole session. `session.phases` maps phase kind to
     * { trials, responses }, where trials carry onset/end as recorded by the
     * engine. Sub-phases of the same kind (warm-up visual and auditory) are
     * classified separately and then concatenated.
     */
    function scoreSession(session) {
        const anticipatoryMs = session.protocol.anticipatoryMs;
        const phases = { warmup: [], practice: [], main: [], cooldown: [] };
        (session.runs || []).forEach(function (run) {
            const classified = classify(run.trials, run.responses, anticipatoryMs);
            phases[run.kind] = phases[run.kind].concat(classified);
        });

        const scales = {};
        MODALITIES.forEach(function (modality) {
            scales[modality] = scalesFor(modality, phases);
        });
        scales.F.balance = ratio(scales.A.speed, scales.V.speed);

        const summaries = {};
        const conditions = {};
        MODALITIES.forEach(function (modality) {
            const main = phases.main.filter(inModality(modality));
            summaries[modality] = summarize(main);
            conditions[modality] = {
                frequent: summarize(
                    main.filter(function (t) {
                        return t.condition === 'frequent';
                    })
                ),
                infrequent: summarize(
                    main.filter(function (t) {
                        return t.condition === 'infrequent';
                    })
                ),
            };
        });

        const sets = [];
        phases.main.forEach(function (trial) {
            sets[trial.set - 1] = sets[trial.set - 1] || [];
            sets[trial.set - 1].push(trial);
        });
        const quintiles = sets.map(function (trials, i) {
            const out = { set: i + 1 };
            MODALITIES.forEach(function (modality) {
                out[modality] = summarize(trials.filter(inModality(modality)));
            });
            return out;
        });

        const result = {
            phases: phases,
            scales: scales,
            summaries: summaries,
            conditions: conditions,
            quintiles: quintiles,
            warmup: {
                A: summarize(phases.warmup.filter(inModality('A'))),
                V: summarize(phases.warmup.filter(inModality('V'))),
            },
            cooldown: {
                A: summarize(phases.cooldown.filter(inModality('A'))),
                V: summarize(phases.cooldown.filter(inModality('V'))),
            },
            practice: summarize(phases.practice),
        };
        result.flags = validityFlags(session, result);
        return result;
    }

    /*
     * Heuristic checks on whether the result can be interpreted. These are
     * this program's own rules of thumb, not IVA-2 criteria; they say where
     * to look, not what to conclude.
     */
    function validityFlags(session, result) {
        const flags = [];
        const main = result.summaries.F;

        if (session.status !== 'complete') {
            flags.push({ id: 'incomplete', level: 'error' });
        }
        if (session.protocol.id !== 'standard') {
            flags.push({ id: 'shortProtocol', level: 'info' });
        }
        if (session.pauses && session.pauses.length) {
            flags.push({ id: 'paused', level: 'warn', value: session.pauses.length });
        }
        if (result.practice.trials && result.practice.accuracy < 70) {
            flags.push({ id: 'practice', level: 'warn', value: round(result.practice.accuracy, 0) });
        }
        ['A', 'V'].forEach(function (modality) {
            const comprehension = result.scales[modality].comprehension;
            if (comprehension !== null && comprehension >= 20) {
                flags.push({ id: 'comprehension', level: 'warn', modality: modality, value: round(comprehension, 0) });
            }
            const simple = summarize(
                result.phases.warmup.concat(result.phases.cooldown).filter(inModality(modality))
            );
            if (simple.targets && simple.omissionPercent > 30) {
                flags.push({ id: 'sensoryMotor', level: 'warn', modality: modality, value: round(simple.omissionPercent, 0) });
            }
            const persistence = result.scales[modality].persistence;
            if (persistence !== null && persistence < 80) {
                flags.push({ id: 'persistence', level: 'info', modality: modality, value: round(persistence, 0) });
            }
        });
        if (main.trials && main.omissionPercent > 50) {
            flags.push({ id: 'disengaged', level: 'warn', value: round(main.omissionPercent, 0) });
        }
        if (main.trials && (main.anticipations / main.trials) * 100 > 10) {
            flags.push({ id: 'anticipations', level: 'warn', value: main.anticipations });
        }
        return flags;
    }

    return {
        MODALITIES: MODALITIES,
        SCALES: SCALES,
        BALANCE: BALANCE,
        COMPOSITES: COMPOSITES,
        classify: classify,
        summarize: summarize,
        scoreSession: scoreSession,
        round: round,
        mean: mean,
        sd: sd,
        quantile: quantile,
    };
});
