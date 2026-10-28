/*
 * Test protocol and trial sequence.
 *
 * The paradigm follows the published description of the IVA-2 CPT: the digits
 * 1 (target) and 2 (foil) are shown or spoken one at a time, one every 1.5 s,
 * visual stimuli flash for 167 ms and auditory stimuli last up to 500 ms. The
 * main test is 500 trials in 5 sets of 100; each set is a 50-trial high-demand
 * block (84% targets, provokes impulsive errors) followed by a 50-trial
 * low-demand block (16% targets, provokes inattentive errors). Simple
 * reaction-time warm-up and cool-down blocks bracket the test.
 *
 * The sequence is pseudo-random but seeded, so every participant tested with
 * the default seed gets the identical sequence. That is what makes scores from
 * different people comparable, and it is a precondition for local norms.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        (root.IVA = root.IVA || {}).protocol = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const DEFAULT_SEED = 2026;

    const STANDARD = Object.freeze({
        id: 'standard',
        soaMs: 1500, // one stimulus every 1.5 s
        visualMs: 167, // visual flash
        auditoryMs: 500, // auditory stimulus window (clips are trimmed to < 500 ms)
        anticipatoryMs: 125, // a response faster than this cannot be a reaction to the stimulus
        warmup: 10, // simple-RT trials per modality, before and after the main test
        practice: 20,
        sets: 5,
        blockSize: 50,
        rarePerBlock: 8, // 8 of 50 = 16%; the common stimulus fills the other 84%
        cooldown: 10,
    });

    // Same structure, one set instead of five: for demonstrations and for
    // checking a computer's setup, not for interpretation.
    const SHORT = Object.freeze(Object.assign({}, STANDARD, { id: 'short', sets: 1 }));

    const PROTOCOLS = { standard: STANDARD, short: SHORT };

    // mulberry32: small, fast, good enough for shuffling, identical everywhere.
    function prng(seed) {
        let state = seed >>> 0;
        return function () {
            state = (state + 0x6d2b79f5) >>> 0;
            let t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function shuffle(items, random) {
        for (let i = items.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            const swap = items[i];
            items[i] = items[j];
            items[j] = swap;
        }
        return items;
    }

    function longestRun(items, key) {
        let longest = 0;
        let run = 0;
        let previous;
        for (const item of items) {
            const value = key(item);
            run = value === previous ? run + 1 : 1;
            previous = value;
            longest = Math.max(longest, run);
        }
        return longest;
    }

    // Smallest distance between two consecutive items matching `match`.
    function smallestGap(items, match) {
        let last = -Infinity;
        let gap = Infinity;
        items.forEach(function (item, index) {
            if (match(item)) {
                gap = Math.min(gap, index - last);
                last = index;
            }
        });
        return gap;
    }

    function stimulus(modality, target) {
        return { modality: modality, stimulus: target ? 1 : 2, target: target };
    }

    // Shuffle until the constraints hold. Deterministic for a given generator
    // state, so a fixed seed always yields the same sequence.
    function constrainedShuffle(items, random, accept) {
        for (let attempt = 0; attempt < 50000; attempt++) {
            shuffle(items, random);
            if (accept(items)) {
                return items.map(function (item) {
                    return Object.assign({}, item);
                });
            }
        }
        throw new Error('Sequence constraints could not be satisfied');
    }

    /*
     * One 50-trial block. Modalities are balanced (25 visual, 25 auditory) and
     * so is the rare stimulus within them. Constraints keep the block from
     * degenerating: modality runs of at most 4 (the participant must keep
     * switching between seeing and hearing), at least two common stimuli
     * between rare ones, and the block opens with the common stimulus so the
     * condition is established from its first trial.
     */
    function buildBlock(condition, size, rare, random) {
        const perModality = size / 2;
        const rarePerModality = rare / 2;
        const items = [];
        ['V', 'A'].forEach(function (modality) {
            for (let i = 0; i < perModality; i++) {
                const isRare = i < rarePerModality;
                items.push(stimulus(modality, condition === 'frequent' ? !isRare : isRare));
            }
        });
        const isRare = function (item) {
            return condition === 'frequent' ? !item.target : item.target;
        };

        return constrainedShuffle(items, random, function (list) {
            return (
                !isRare(list[0]) &&
                longestRun(list, function (item) {
                    return item.modality;
                }) <= 4 &&
                smallestGap(list, isRare) >= 3
            );
        });
    }

    function buildPractice(count, random) {
        const items = [];
        for (let i = 0; i < count; i++) {
            // Alternate so both modalities and both digits are split evenly.
            items.push(stimulus(i % 2 === 0 ? 'V' : 'A', i % 4 < 2));
        }
        return constrainedShuffle(items, random, function (list) {
            return (
                list[0].target &&
                longestRun(list, function (item) {
                    return item.modality;
                }) <= 3 &&
                longestRun(list, function (item) {
                    return item.stimulus;
                }) <= 3
            );
        });
    }

    function simpleBlock(count, modality) {
        const items = [];
        for (let i = 0; i < count; i++) {
            items.push(stimulus(modality, true));
        }
        return items;
    }

    function tag(items, extra) {
        return items.map(function (item, index) {
            return Object.assign({ index: index }, item, extra);
        });
    }

    /*
     * The full test plan, as a list of phases run in order. The warm-up and
     * cool-down are each two sub-phases (visual, then auditory) because the
     * participant is told before each which kind of stimulus to expect.
     */
    function buildPlan(protocolId, seed) {
        const protocol = PROTOCOLS[protocolId] || STANDARD;
        const random = prng(seed === undefined || seed === null ? DEFAULT_SEED : seed);

        const main = [];
        for (let set = 1; set <= protocol.sets; set++) {
            ['frequent', 'infrequent'].forEach(function (condition, half) {
                buildBlock(condition, protocol.blockSize, protocol.rarePerBlock, random).forEach(function (item) {
                    main.push(
                        Object.assign(item, {
                            set: set,
                            block: (set - 1) * 2 + half + 1,
                            condition: condition,
                        })
                    );
                });
            });
        }

        return [
            { id: 'warmupVisual', kind: 'warmup', trials: tag(simpleBlock(protocol.warmup, 'V'), { phase: 'warmup' }) },
            { id: 'warmupAuditory', kind: 'warmup', trials: tag(simpleBlock(protocol.warmup, 'A'), { phase: 'warmup' }) },
            { id: 'practice', kind: 'practice', trials: tag(buildPractice(protocol.practice, random), { phase: 'practice' }) },
            { id: 'main', kind: 'main', trials: tag(main, { phase: 'main' }) },
            { id: 'cooldownVisual', kind: 'cooldown', trials: tag(simpleBlock(protocol.cooldown, 'V'), { phase: 'cooldown' }) },
            { id: 'cooldownAuditory', kind: 'cooldown', trials: tag(simpleBlock(protocol.cooldown, 'A'), { phase: 'cooldown' }) },
        ];
    }

    function estimatedMinutes(protocolId) {
        const protocol = PROTOCOLS[protocolId] || STANDARD;
        const trials = protocol.warmup * 2 + protocol.practice + protocol.sets * protocol.blockSize * 2 + protocol.cooldown * 2;
        return Math.round((trials * protocol.soaMs) / 60000);
    }

    return {
        DEFAULT_SEED: DEFAULT_SEED,
        PROTOCOLS: PROTOCOLS,
        buildPlan: buildPlan,
        estimatedMinutes: estimatedMinutes,
        // Exposed for tests.
        prng: prng,
        longestRun: longestRun,
        smallestGap: smallestGap,
    };
});
