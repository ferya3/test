'use strict';

const protocol = require('../js/protocol.js');

/*
 * Run a simulated participant through the full plan. `respond(trial)` returns
 * the latencies (ms after onset) at which the participant clicks: a number, an
 * array of numbers, or null for no click.
 */
function simulate(respond, options) {
    const opts = options || {};
    const protocolId = opts.protocol || 'standard';
    const settings = protocol.PROTOCOLS[protocolId];
    let clock = 10000;

    const runs = protocol.buildPlan(protocolId, opts.seed).map(function (phase) {
        const responses = [];
        const trials = phase.trials.map(function (trial) {
            const onset = clock;
            clock += settings.soaMs;
            const latencies = [].concat(respond(trial) ?? []);
            latencies.forEach(function (latency) {
                responses.push({ t: onset + latency, source: 'key' });
            });
            return Object.assign({}, trial, { onset: onset, end: onset + settings.soaMs });
        });
        clock += 3000; // instructions between phases
        return { id: phase.id, kind: phase.kind, trials: trials, responses: responses };
    });

    return { protocol: settings, status: 'complete', pauses: [], runs: runs };
}

module.exports = { simulate };
