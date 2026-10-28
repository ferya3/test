/*
 * Local norms: standard scores (mean 100, SD 15) relative to a reference
 * group the examiner collected with this program.
 *
 * The IVA-2's own norms (about 1,700 people aged 6 to 96) belong to BrainTrain
 * and are not published, and they would not transfer anyway: this program's
 * stimuli, hardware and raw formulas differ. So no built-in norms are shipped.
 * Instead, sessions from a healthy reference sample can be marked as
 * normative, and this module turns them into a norm table that can be
 * exported, shared and imported.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./scoring.js'));
    } else {
        (root.IVA = root.IVA || {}).norms = factory(root.IVA.scoring);
    }
})(typeof self !== 'undefined' ? self : this, function (scoring) {
    'use strict';

    const FORMAT = 'iva2-cpt-norms';
    const MIN_GROUP = 10;

    // Smallest SD a z-score is divided by. Error rates are often 0 for nearly
    // everyone in a healthy group; without a floor one omission would be
    // infinitely abnormal, and a group where everyone scored the same would
    // have no z-scores (and so no composites) at all.
    const SD_FLOOR = { '%': 1, ms: 10, count: 1, composite: 0.1 };

    const AGE_BANDS = [
        [6, 7],
        [8, 9],
        [10, 11],
        [12, 13],
        [14, 15],
        [16, 17],
        [18, 29],
        [30, 44],
        [45, 59],
        [60, 120],
    ];

    function metricKeys() {
        const keys = [];
        Object.keys(scoring.SCALES).forEach(function (scale) {
            scoring.MODALITIES.forEach(function (modality) {
                keys.push(scale + '.' + modality);
            });
        });
        keys.push('balance.F');
        return keys;
    }

    function definitionOf(key) {
        const scale = key.split('.')[0];
        return scale === 'balance' ? scoring.BALANCE : scoring.SCALES[scale];
    }

    function directionOf(key) {
        return definitionOf(key).direction;
    }

    function rawValue(scales, key) {
        const parts = key.split('.');
        const value = scales[parts[1]] ? scales[parts[1]][parts[0]] : null;
        return value === undefined ? null : value;
    }

    function zScore(raw, stat, floor) {
        if (raw === null || !stat || stat.sd === null) {
            return null;
        }
        return (raw - stat.mean) / Math.max(stat.sd, floor);
    }

    // z oriented so that positive is always better (descriptive scales keep their sign).
    function orientedZ(key, raw, stat) {
        const z = zScore(raw, stat, SD_FLOOR[definitionOf(key).unit]);
        return z !== null && directionOf(key) === 'lower' ? -z : z;
    }

    // Bands are in completed years: 9.5 belongs to 8-9.
    function bandOf(age) {
        const years = Math.floor(age);
        for (const band of AGE_BANDS) {
            if (years >= band[0] && years <= band[1]) {
                return band[0] + '-' + band[1];
            }
        }
        return null;
    }

    function groupKeys(age, sex) {
        const band = bandOf(age);
        const keys = [];
        if (band && (sex === 'm' || sex === 'f')) {
            keys.push('age:' + band + '|sex:' + sex);
        }
        if (band) {
            keys.push('age:' + band);
        }
        if (sex === 'm' || sex === 'f') {
            keys.push('sex:' + sex);
        }
        keys.push('all');
        return keys;
    }

    function describe(values) {
        return {
            n: values.length,
            mean: scoring.mean(values),
            sd: scoring.sd(values),
        };
    }

    function compositeRaw(scales, stats, composite, modality) {
        const zs = scoring.COMPOSITES[composite]
            .map(function (scale) {
                const key = scale + '.' + modality;
                return orientedZ(key, rawValue(scales, key), stats[key]);
            })
            .filter(function (z) {
                return z !== null;
            });
        return zs.length === scoring.COMPOSITES[composite].length ? scoring.mean(zs) : null;
    }

    /*
     * members: [{ age, sex, scales }] — scales as returned by scoreSession().
     * Every member lands in up to four groups (age band and sex, age band,
     * sex, everyone); a group is kept only if it reaches minGroup members.
     */
    function build(members, options) {
        const opts = options || {};
        const minGroup = opts.minGroup || MIN_GROUP;
        const buckets = {};
        members.forEach(function (member) {
            groupKeys(member.age, member.sex).forEach(function (key) {
                (buckets[key] = buckets[key] || []).push(member);
            });
        });

        const groups = {};
        Object.keys(buckets).forEach(function (key) {
            const group = buckets[key];
            if (group.length < minGroup) {
                return;
            }
            const stats = {};
            metricKeys().forEach(function (metric) {
                const values = group
                    .map(function (member) {
                        return rawValue(member.scales, metric);
                    })
                    .filter(function (v) {
                        return v !== null;
                    });
                if (values.length >= 2) {
                    stats[metric] = describe(values);
                }
            });
            // Composites are means of oriented z-scores; their spread in the
            // reference group re-scales them back to SD 15.
            Object.keys(scoring.COMPOSITES).forEach(function (composite) {
                scoring.MODALITIES.forEach(function (modality) {
                    const values = group
                        .map(function (member) {
                            return compositeRaw(member.scales, stats, composite, modality);
                        })
                        .filter(function (v) {
                            return v !== null;
                        });
                    if (values.length >= 2) {
                        stats[composite + '.' + modality] = describe(values);
                    }
                });
            });
            groups[key] = { n: group.length, stats: stats };
        });

        return {
            format: FORMAT,
            version: 1,
            name: opts.name || '',
            protocol: opts.protocol || 'standard',
            created: opts.created || new Date().toISOString(),
            minGroup: minGroup,
            groups: groups,
        };
    }

    function validate(table) {
        return !!(table && table.format === FORMAT && table.groups && typeof table.groups === 'object');
    }

    function normalCdf(z) {
        // Abramowitz & Stegun 7.1.26; accurate to about 1e-7.
        const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
        const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
        const erf = 1 - poly * Math.exp(-(z * z) / 2);
        return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
    }

    function standard(z) {
        if (z === null) {
            return null;
        }
        const clamped = Math.max(-4, Math.min(4, z));
        return {
            z: clamped,
            score: Math.round(100 + 15 * clamped),
            percentile: Math.max(0.1, Math.min(99.9, scoring.round(normalCdf(clamped) * 100, 1))),
        };
    }

    // Conventional standard-score bands (not the IVA-2's own cut-offs).
    function band(score) {
        if (score === null || score === undefined) {
            return null;
        }
        if (score >= 120) return 'superior';
        if (score >= 110) return 'aboveAverage';
        if (score >= 90) return 'average';
        if (score >= 80) return 'belowAverage';
        if (score >= 70) return 'moderate';
        return 'severe';
    }

    /*
     * Standard scores for one participant. Picks the most specific group with
     * enough members: age band and sex, then age band, then sex, then all.
     */
    function score(table, participant, scales) {
        if (!validate(table)) {
            return null;
        }
        const key = groupKeys(participant.age, participant.sex).find(function (k) {
            return table.groups[k];
        });
        if (!key) {
            return null;
        }
        const stats = table.groups[key].stats;
        const metrics = {};
        metricKeys().forEach(function (metric) {
            const result = standard(orientedZ(metric, rawValue(scales, metric), stats[metric]));
            if (result) {
                result.band = directionOf(metric) ? band(result.score) : null;
                metrics[metric] = result;
            }
        });
        const composites = {};
        Object.keys(scoring.COMPOSITES).forEach(function (composite) {
            scoring.MODALITIES.forEach(function (modality) {
                const id = composite + '.' + modality;
                const raw = compositeRaw(scales, stats, composite, modality);
                const result = standard(zScore(raw, stats[id], SD_FLOOR.composite));
                if (result) {
                    result.band = band(result.score);
                    composites[id] = result;
                }
            });
        });
        return { group: key, n: table.groups[key].n, metrics: metrics, composites: composites };
    }

    return {
        FORMAT: FORMAT,
        MIN_GROUP: MIN_GROUP,
        AGE_BANDS: AGE_BANDS,
        build: build,
        score: score,
        validate: validate,
        band: band,
        normalCdf: normalCdf,
        groupKeys: groupKeys,
    };
});
