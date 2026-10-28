/*
 * The examiner's report: tables, inline SVG charts, CSV/JSON exports.
 *
 * Rendering is string-based and dependency-free so the report prints the same
 * way it displays and works from file://.
 */
(function (root) {
    'use strict';

    const IVA = (root.IVA = root.IVA || {});
    const scoring = IVA.scoring;
    const MODS = ['A', 'V', 'F'];
    const COLORS = { A: 'var(--chart-a)', V: 'var(--chart-v)', F: 'var(--chart-f)' };

    function escapeHtml(value) {
        return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function make(lang) {
        const t = function (key, params) {
            return IVA.i18n.t(lang, key, params);
        };
        const num = function (value, digits) {
            return IVA.i18n.formatNumber(lang, value, digits);
        };
        return { t: t, num: num };
    }

    function unitDigits(unit) {
        return unit === 'count' ? 0 : unit === 'ms' ? 0 : 1;
    }

    // The unit is in the row heading, so cells carry only the number.
    function rawCell(fx, value, unit) {
        if (value === null || value === undefined) {
            return '<td class="num muted">—</td>';
        }
        return '<td class="num">' + fx.num(value, unitDigits(unit)) + '</td>';
    }

    function standardCell(fx, result, descriptive) {
        if (!result) {
            return '<td class="num muted">—</td>';
        }
        const band = result.band ? ' band-' + result.band : '';
        const title = result.band ? fx.t('band.' + result.band) : fx.t('report.descriptive');
        return (
            '<td class="num ss' + (descriptive ? ' descriptive' : band) + '" title="' + escapeHtml(title) + '">' +
            fx.num(result.score) + '</td>'
        );
    }

    function participantBlock(fx, session) {
        const p = session.participant;
        const s = session.settings;
        const rows = [
            [fx.t('report.participant'), [p.code, p.name].filter(Boolean).join(' · ')],
            [fx.t('report.age'), p.age === null || p.age === undefined ? '—' : fx.num(p.age, Number.isInteger(p.age) ? 0 : 1)],
            [fx.t('report.sex'), p.sex ? fx.t('sex.' + p.sex) : '—'],
            [fx.t('report.handedness'), p.handedness ? fx.t('hand.' + p.handedness) : '—'],
            [fx.t('report.date'), IVA.i18n.formatDate(fx.lang, session.createdAt)],
            [fx.t('report.examiner'), session.examiner || '—'],
            [fx.t('report.protocol'), fx.t('protocol.' + s.protocol, { minutes: fx.num(IVA.protocol.estimatedMinutes(s.protocol)) })],
            [fx.t('report.testLang'), fx.t('lang.' + s.testLang)],
            [fx.t('report.response'), fx.t('response.' + s.response)],
            [fx.t('report.digits'), fx.t('digits.' + s.digits)],
            [fx.t('report.voice'), fx.t(s.voice === 'custom' ? 'report.voiceCustom' : 'report.voiceBuiltin')],
            [fx.t('report.status'), fx.t(session.status === 'complete' ? 'report.statusComplete' : 'report.statusAborted')],
        ];
        if (p.notes) {
            rows.push([fx.t('report.notes'), p.notes]);
        }
        return (
            '<dl class="facts">' +
            rows
                .map(function (row) {
                    return '<div><dt>' + escapeHtml(row[0]) + '</dt><dd>' + escapeHtml(row[1]) + '</dd></div>';
                })
                .join('') +
            '</dl>'
        );
    }

    function flagsBlock(fx, flags) {
        if (!flags.length) {
            return '<p class="flag flag-ok">' + escapeHtml(fx.t('report.validityOk')) + '</p>';
        }
        return (
            '<ul class="flags">' +
            flags
                .map(function (flag) {
                    const params = {
                        value: typeof flag.value === 'number' ? fx.num(flag.value) : flag.value,
                        modality: flag.modality ? fx.t('mod.' + flag.modality) : '',
                    };
                    return (
                        '<li class="flag flag-' + flag.level + '"><strong>' + escapeHtml(fx.t('flag.level.' + flag.level)) +
                        '</strong> ' + escapeHtml(fx.t('flag.' + flag.id, params)) + '</li>'
                    );
                })
                .join('') +
            '</ul>'
        );
    }

    function quotientsBlock(fx, standard) {
        const rows = Object.keys(scoring.COMPOSITES)
            .map(function (composite) {
                return (
                    '<tr><th scope="row">' + escapeHtml(fx.t('composite.' + composite)) + '</th>' +
                    MODS.map(function (m) {
                        const result = standard.composites[composite + '.' + m];
                        return standardCell(fx, result) + '<td class="band-label">' + (result ? escapeHtml(fx.t('band.' + result.band)) : '') + '</td>';
                    }).join('') +
                    '</tr>'
                );
            })
            .join('');
        return (
            '<table class="grid quotients"><thead><tr><th></th>' +
            MODS.map(function (m) {
                return '<th colspan="2">' + escapeHtml(fx.t('mod.' + m)) + '</th>';
            }).join('') +
            '</tr></thead><tbody>' + rows + '</tbody></table>' + scoreScale(fx, standard)
        );
    }

    // A horizontal 40–160 scale with each full-scale quotient marked.
    function scoreScale(fx, standard) {
        const width = 640;
        const left = 16;
        const right = width - 16;
        const x = function (score) {
            const ratio = (Math.max(40, Math.min(160, score)) - 40) / 120;
            return fx.lang === 'fa' ? right - ratio * (right - left) : left + ratio * (right - left);
        };
        const bands = [
            [40, 70, 'severe'],
            [70, 80, 'moderate'],
            [80, 90, 'belowAverage'],
            [90, 110, 'average'],
            [110, 120, 'aboveAverage'],
            [120, 160, 'superior'],
        ];
        let svg = '<svg class="chart scale" viewBox="0 0 ' + width + ' 96" direction="' + (fx.lang === 'fa' ? 'rtl' : 'ltr') + '" role="img" aria-label="' + escapeHtml(fx.t('report.quotients')) + '">';
        bands.forEach(function (band) {
            const a = x(band[0]);
            const b = x(band[1]);
            svg += '<rect x="' + Math.min(a, b) + '" y="34" width="' + Math.abs(b - a) + '" height="14" class="zone zone-' + band[2] + '"/>';
        });
        [40, 70, 85, 100, 115, 130, 160].forEach(function (tick) {
            svg += '<text x="' + x(tick) + '" y="66" class="tick" text-anchor="middle">' + fx.num(tick) + '</text>';
        });
        const marks = [];
        Object.keys(scoring.COMPOSITES).forEach(function (composite, i) {
            const result = standard.composites[composite + '.F'];
            if (result) {
                const cx = x(result.score);
                // Keep the label inside the chart when the score sits at either end.
                const labelX = Math.max(left + 90, Math.min(right - 90, cx));
                marks.push(
                    '<g class="mark mark-' + i + '"><line x1="' + cx + '" x2="' + cx + '" y1="' + (i ? 48 : 20) + '" y2="' + (i ? 82 : 34) + '"/>' +
                    '<text x="' + labelX + '" y="' + (i ? 94 : 14) + '" text-anchor="middle">' + escapeHtml(fx.t('composite.' + composite)) + ' ' + fx.num(result.score) + '</text></g>'
                );
            }
        });
        return svg + marks.join('') + '</svg>';
    }

    function scaleRows(fx, scales, standard, keys) {
        return keys
            .map(function (key) {
                const def = key === 'balance' ? scoring.BALANCE : scoring.SCALES[key];
                const mods = key === 'balance' ? ['F'] : MODS;
                const cells = MODS.map(function (m) {
                    if (mods.indexOf(m) === -1) {
                        return '<td class="num muted" colspan="' + (standard ? 2 : 1) + '"></td>';
                    }
                    const raw = rawCell(fx, scales[m][key], def.unit);
                    return standard ? raw + standardCell(fx, standard.metrics[key + '.' + m], !def.direction) : raw;
                }).join('');
                const unit = def.unit === 'ms' ? fx.t('unit.msShort') : def.unit === '%' ? '%' : '';
                return (
                    '<tr><th scope="row"><span class="scale-name">' + escapeHtml(fx.t('scale.' + key)) + '</span>' +
                    (unit ? ' <span class="unit">(' + escapeHtml(unit) + ')</span>' : '') +
                    '<span class="def">' + escapeHtml(fx.t('def.' + key)) + '</span></th>' + cells + '</tr>'
                );
            })
            .join('');
    }

    function scalesTable(fx, scales, standard, groups) {
        const head =
            '<thead><tr><th>' + escapeHtml(fx.t('report.scale')) + '</th>' +
            MODS.map(function (m) {
                return '<th' + (standard ? ' colspan="2"' : '') + '>' + escapeHtml(fx.t('mod.' + m)) + '</th>';
            }).join('') + '</tr>' +
            (standard
                ? '<tr class="sub"><th></th>' +
                  MODS.map(function () {
                      return '<th>' + escapeHtml(fx.t('report.raw')) + '</th><th>' + escapeHtml(fx.t('report.ss')) + '</th>';
                  }).join('') + '</tr>'
                : '') +
            '</thead>';
        const body = groups
            .map(function (group) {
                const span = 1 + MODS.length * (standard ? 2 : 1);
                return (
                    '<tbody><tr class="group"><th colspan="' + span + '">' + escapeHtml(fx.t('group.' + group.id)) + '</th></tr>' +
                    scaleRows(fx, scales, standard, group.keys) + '</tbody>'
                );
            })
            .join('');
        return '<table class="grid scales">' + head + body + '</table>';
    }

    function countsTable(fx, result) {
        const rows = [
            ['m.targets', 'targets', 0],
            ['m.hits', 'hits', 0],
            ['m.omissions', 'omissions', 0],
            ['m.foils', 'foils', 0],
            ['m.commissions', 'commissions', 0],
            ['m.correctRejections', 'correctRejections', 0],
            ['m.anticipations', 'anticipations', 0],
            ['m.extras', 'extras', 0],
            ['m.meanRt', function (s) { return s.rt.mean; }, 0],
            ['m.medianRt', function (s) { return s.rt.median; }, 0],
            ['m.sdRt', function (s) { return s.rt.sd; }, 0],
            ['m.commissionRt', 'commissionRt', 0],
        ];
        const columns = [];
        MODS.forEach(function (m) {
            columns.push({ label: fx.t('mod.' + m), summary: result.summaries[m] });
        });
        ['frequent', 'infrequent'].forEach(function (condition) {
            columns.push({ label: fx.t('cond.' + condition), summary: result.conditions.F[condition] });
        });
        return (
            '<table class="grid counts"><thead><tr><th>' + escapeHtml(fx.t('report.measure')) + '</th>' +
            columns.map(function (c) {
                return '<th>' + escapeHtml(c.label) + '</th>';
            }).join('') + '</tr></thead><tbody>' +
            rows
                .map(function (row) {
                    return (
                        '<tr><th scope="row">' + escapeHtml(fx.t(row[0])) + '</th>' +
                        columns.map(function (c) {
                            const value = typeof row[1] === 'function' ? row[1](c.summary) : c.summary[row[1]];
                            return '<td class="num">' + fx.num(value, row[2]) + '</td>';
                        }).join('') + '</tr>'
                    );
                })
                .join('') +
            '</tbody></table>'
        );
    }

    function simpleRtTable(fx, result) {
        const rows = [
            [fx.t('phase.warmup'), result.warmup],
            [fx.t('phase.cooldown'), result.cooldown],
        ];
        return (
            '<table class="grid simple"><thead><tr><th></th>' +
            ['A', 'V'].map(function (m) {
                return '<th colspan="2">' + escapeHtml(fx.t('mod.' + m)) + '</th>';
            }).join('') +
            '</tr><tr class="sub"><th></th>' +
            ['A', 'V'].map(function () {
                return '<th>' + escapeHtml(fx.t('m.meanRt')) + '</th><th>' + escapeHtml(fx.t('m.omissions')) + '</th>';
            }).join('') +
            '</tr></thead><tbody>' +
            rows
                .map(function (row) {
                    return (
                        '<tr><th scope="row">' + escapeHtml(row[0]) + '</th>' +
                        ['A', 'V'].map(function (m) {
                            const s = row[1][m];
                            return '<td class="num">' + fx.num(s.rt.mean) + '</td><td class="num">' + (s.targets ? fx.num(s.omissions) + ' / ' + fx.num(s.targets) : '—') + '</td>';
                        }).join('') + '</tr>'
                    );
                })
                .join('') +
            '</tbody></table>'
        );
    }

    // Timing quality as measured during the run, so a poor setup is visible.
    function technicalBlock(fx, session) {
        const device = session.device || {};
        const main = (device.timing || []).filter(function (entry) {
            return entry.phase === 'main';
        })[0];
        const items = [];
        if (main && main.frameMs) {
            items.push(fx.t('report.refresh', { hz: fx.num(1000 / main.frameMs) }));
        }
        if (main && main.visualShownMs) {
            items.push(fx.t('report.visualShown', {
                mean: fx.num(main.visualShownMs.mean, 1),
                min: fx.num(main.visualShownMs.min, 1),
                max: fx.num(main.visualShownMs.max, 1),
            }));
        }
        if (main && main.visualLagMs) {
            items.push(fx.t('report.visualLag', { mean: fx.num(main.visualLagMs.mean, 1), max: fx.num(main.visualLagMs.max, 1) }));
        }
        if (device.audio) {
            const latency = device.audio.outputLatencyMs !== null ? device.audio.outputLatencyMs : device.audio.baseLatencyMs;
            if (latency !== null && latency !== undefined) {
                items.push(fx.t('report.audioLatency', { ms: fx.num(latency) }));
            }
            items.push(fx.t('report.audioClock', { state: fx.t(device.audio.outputTimestamp ? 'report.audioClockYes' : 'report.audioClockNo') }));
        }
        if (session.practiceAttempts) {
            items.push(fx.t('report.practiceAttempts', { n: fx.num(session.practiceAttempts) }));
        }
        if (!items.length) {
            return '';
        }
        return (
            '<section class="technical"><h2>' + escapeHtml(fx.t('report.technical')) + '</h2><ul>' +
            items.map(function (item) {
                return '<li>' + escapeHtml(item) + '</li>';
            }).join('') +
            (device.userAgent ? '<li class="muted">' + escapeHtml(device.userAgent) + '</li>' : '') +
            '</ul></section>'
        );
    }

    // ---- charts -------------------------------------------------------------
    //
    // Persian charts run right to left, like the text around them. Each SVG
    // states its own direction, so text-anchor "start"/"end" mean the same
    // thing in both languages: "end" puts a label's end at x, on the side
    // facing the plot. Legends are HTML, which handles bidirectional text.

    function axisX(fx, width, padStart, padEnd) {
        return function (ratio) {
            const span = width - padStart - padEnd;
            return fx.lang === 'fa' ? width - padStart - ratio * span : padStart + ratio * span;
        };
    }

    function niceMax(value, step) {
        return Math.max(step, Math.ceil(value / step) * step);
    }

    function svgOpen(fx, width, height, label) {
        return (
            '<svg class="chart" viewBox="0 0 ' + width + ' ' + height + '" direction="' + (fx.lang === 'fa' ? 'rtl' : 'ltr') +
            '" role="img" aria-label="' + escapeHtml(label) + '">'
        );
    }

    // Horizontal grid lines with value labels outside the plot's start edge.
    function yGrid(fx, x, y, maxY, steps) {
        let out = '';
        for (let i = 0; i <= steps; i++) {
            const v = (maxY / steps) * i;
            out += '<line class="gridline" x1="' + x(0) + '" x2="' + x(1) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>';
            out += '<text class="tick" x="' + (fx.lang === 'fa' ? x(0) + 8 : x(0) - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + fx.num(v) + '</text>';
        }
        return out;
    }

    function legend(items) {
        return (
            '<div class="chart-legend">' +
            items
                .map(function (item) {
                    return '<span><i style="background:' + item.color + '"></i>' + escapeHtml(item.label) + '</span>';
                })
                .join('') +
            '</div>'
        );
    }

    function quintileRtChart(fx, result) {
        const width = 640;
        const height = 200;
        const top = 12;
        const bottom = 30;
        const x = axisX(fx, width, 52, 24);
        const sets = result.quintiles;
        const values = [];
        sets.forEach(function (q) {
            ['A', 'V'].forEach(function (m) {
                if (q[m].rt.mean !== null) {
                    values.push(q[m].rt.mean);
                }
            });
        });
        if (!values.length) {
            return '';
        }
        const maxY = niceMax(Math.max.apply(null, values) * 1.1, 100);
        const y = function (v) {
            return top + (1 - v / maxY) * (height - top - bottom);
        };
        const pos = function (i) {
            return x(sets.length === 1 ? 0.5 : i / (sets.length - 1));
        };
        let svg = svgOpen(fx, width, height, fx.t('report.quintilesRt')) + yGrid(fx, x, y, maxY, 4);
        sets.forEach(function (q, i) {
            svg += '<text class="tick" x="' + pos(i) + '" y="' + (height - 8) + '" text-anchor="middle">' + escapeHtml(fx.t('report.set')) + ' ' + fx.num(q.set) + '</text>';
        });
        ['A', 'V'].forEach(function (m) {
            const points = sets
                .map(function (q, i) {
                    return q[m].rt.mean === null ? null : [pos(i), y(q[m].rt.mean)];
                })
                .filter(Boolean);
            if (points.length > 1) {
                svg += '<polyline class="series" style="stroke:' + COLORS[m] + '" points="' + points.map(function (p) {
                    return p.join(',');
                }).join(' ') + '"/>';
            }
            points.forEach(function (p) {
                svg += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="4" style="fill:' + COLORS[m] + '"/>';
            });
        });
        return legend([
            { label: fx.t('mod.A') + ' (' + fx.t('unit.msShort') + ')', color: COLORS.A },
            { label: fx.t('mod.V') + ' (' + fx.t('unit.msShort') + ')', color: COLORS.V },
        ]) + svg + '</svg>';
    }

    function quintileErrorChart(fx, result) {
        const width = 640;
        const height = 200;
        const top = 12;
        const bottom = 30;
        const x = axisX(fx, width, 52, 24);
        const sets = result.quintiles;
        const series = [
            { key: 'omissions', mod: 'A', label: fx.t('m.omissions') + ' · ' + fx.t('mod.A'), color: 'var(--chart-a)' },
            { key: 'omissions', mod: 'V', label: fx.t('m.omissions') + ' · ' + fx.t('mod.V'), color: 'var(--chart-v)' },
            { key: 'commissions', mod: 'A', label: fx.t('m.commissions') + ' · ' + fx.t('mod.A'), color: 'var(--chart-a2)' },
            { key: 'commissions', mod: 'V', label: fx.t('m.commissions') + ' · ' + fx.t('mod.V'), color: 'var(--chart-v2)' },
        ];
        let max = 0;
        sets.forEach(function (q) {
            series.forEach(function (s) {
                max = Math.max(max, q[s.mod][s.key]);
            });
        });
        const maxY = niceMax(max, 5);
        const y = function (v) {
            return top + (1 - v / maxY) * (height - top - bottom);
        };
        const slot = 1 / sets.length;
        const step = Math.abs(x(slot) - x(0));
        const barWidth = Math.min(28, (step * 0.7) / series.length);
        let svg = svgOpen(fx, width, height, fx.t('report.quintilesErr')) + yGrid(fx, x, y, maxY, 5);
        sets.forEach(function (q, i) {
            const center = x((i + 0.5) * slot);
            svg += '<text class="tick" x="' + center + '" y="' + (height - 8) + '" text-anchor="middle">' + escapeHtml(fx.t('report.set')) + ' ' + fx.num(q.set) + '</text>';
            series.forEach(function (s, j) {
                // Series order follows the reading direction within each group.
                const slotIndex = fx.lang === 'fa' ? series.length - 1 - j : j;
                const bx = center + (slotIndex - series.length / 2) * barWidth;
                const value = q[s.mod][s.key];
                svg += '<rect x="' + bx + '" y="' + y(value) + '" width="' + (barWidth - 2) + '" height="' + (y(0) - y(value)) + '" style="fill:' + s.color + '"><title>' + escapeHtml(s.label) + ': ' + fx.num(value) + '</title></rect>';
            });
        });
        return legend(series) + svg + '</svg>';
    }

    function histogram(fx, result) {
        const width = 640;
        const height = 200;
        const top = 12;
        const bottom = 30;
        const x = axisX(fx, width, 44, 24);
        const binMs = 50;
        const maxMs = 1500;
        const bins = maxMs / binMs;
        const counts = { A: new Array(bins).fill(0), V: new Array(bins).fill(0) };
        ['A', 'V'].forEach(function (m) {
            result.summaries[m].hitRts.forEach(function (rt) {
                counts[m][Math.min(bins - 1, Math.floor(rt / binMs))]++;
            });
        });
        const max = Math.max.apply(null, counts.A.concat(counts.V));
        if (!max) {
            return '';
        }
        const maxY = niceMax(max, 5);
        const y = function (v) {
            return top + (1 - v / maxY) * (height - top - bottom);
        };
        const binWidth = Math.abs(x(1 / bins) - x(0));
        let svg = svgOpen(fx, width, height, fx.t('report.distribution')) + yGrid(fx, x, y, maxY, 5);
        for (let b = 0; b < bins; b++) {
            ['A', 'V'].forEach(function (m, j) {
                const value = counts[m][b];
                if (!value) {
                    return;
                }
                const left = Math.min(x(b / bins), x((b + 1) / bins));
                const half = fx.lang === 'fa' ? 1 - j : j;
                svg += '<rect x="' + (left + half * (binWidth / 2)) + '" y="' + y(value) + '" width="' + (binWidth / 2 - 1) + '" height="' + (y(0) - y(value)) + '" style="fill:' + COLORS[m] + '"><title>' + fx.num(b * binMs) + '–' + fx.num((b + 1) * binMs) + ' ' + fx.t('unit.msShort') + ': ' + fx.num(value) + '</title></rect>';
            });
        }
        for (let ms = 0; ms <= maxMs; ms += 250) {
            svg += '<text class="tick" x="' + x(ms / maxMs) + '" y="' + (height - 8) + '" text-anchor="middle">' + fx.num(ms) + '</text>';
        }
        return legend([
            { label: fx.t('mod.A'), color: COLORS.A },
            { label: fx.t('mod.V'), color: COLORS.V },
        ]) + svg + '</svg>';
    }

    // ---- assembly -----------------------------------------------------------

    /*
     * The whole report as HTML. `norms` is the active norm table or null; it
     * is applied only to complete standard-protocol sessions, the only kind
     * norms are built from.
     */
    function render(lang, session, result, norms) {
        const fx = make(lang);
        fx.lang = lang;
        const comparable = norms && session.status === 'complete' && session.settings.protocol === norms.protocol;
        const standard = comparable ? IVA.norms.score(norms, session.participant, result.scales) : null;

        let html = '<article class="report" dir="' + (lang === 'fa' ? 'rtl' : 'ltr') + '" lang="' + lang + '">';
        html += '<header class="report-head"><h1>' + escapeHtml(fx.t('report.title')) + '</h1></header>';
        html += participantBlock(fx, session);

        html += '<section><h2>' + escapeHtml(fx.t('report.validity')) + '</h2>' + flagsBlock(fx, result.flags) + '</section>';

        if (standard) {
            html += '<p class="norms-note">' + escapeHtml(fx.t('report.normsUsed', {
                // Isolated so a Persian name does not reorder English text around it, or vice versa.
                name: '\u2068' + norms.name + '\u2069',
                group: groupLabel(lang, standard.group),
                n: fx.num(standard.n),
            })) + '</p>';
            html += '<section><h2>' + escapeHtml(fx.t('report.quotients')) + '</h2>' + quotientsBlock(fx, standard) + '</section>';
        } else {
            html += '<p class="norms-note">' + escapeHtml(fx.t('report.noNorms')) + '</p>';
        }

        html += '<section><h2>' + escapeHtml(fx.t('report.primary')) + '</h2>' + scalesTable(fx, result.scales, standard, [
            { id: 'responseControl', keys: scoring.COMPOSITES.responseControl },
            { id: 'attention', keys: scoring.COMPOSITES.attention },
        ]) + '</section>';

        html += '<section><h2>' + escapeHtml(fx.t('report.secondary')) + '</h2>' + scalesTable(fx, result.scales, standard, [
            { id: 'attribute', keys: ['balance', 'readiness', 'fineMotor'] },
            { id: 'validity', keys: ['comprehension', 'persistence', 'sensoryMotor'] },
        ]) + '</section>';

        html += '<section><h2>' + escapeHtml(fx.t('report.errors')) + '</h2>' + countsTable(fx, result) + '</section>';

        if (result.quintiles.length) {
            html += '<section class="charts"><h2>' + escapeHtml(fx.t('report.quintiles')) + '</h2>';
            html += '<figure><figcaption>' + escapeHtml(fx.t('report.quintilesRt')) + '</figcaption>' + quintileRtChart(fx, result) + '</figure>';
            html += '<figure><figcaption>' + escapeHtml(fx.t('report.quintilesErr')) + '</figcaption>' + quintileErrorChart(fx, result) + '</figure>';
            html += '</section>';
            html += '<section class="charts"><h2>' + escapeHtml(fx.t('report.distribution')) + '</h2><figure>' + histogram(fx, result) + '</figure></section>';
        }

        html += '<section><h2>' + escapeHtml(fx.t('report.simpleRt')) + '</h2>' + simpleRtTable(fx, result) + '</section>';
        html += technicalBlock(fx, session);

        html += '<footer class="report-foot"><p>' + escapeHtml(fx.t('report.footer')) + '</p><p class="muted">' +
            escapeHtml(fx.t('report.generated', { app: fx.t('app.short'), version: IVA.VERSION })) + '</p></footer>';
        return html + '</article>';
    }

    function groupLabel(lang, key) {
        if (key === 'all') {
            return IVA.i18n.t(lang, 'norms.group.all');
        }
        return key
            .split('|')
            .map(function (part) {
                const pair = part.split(':');
                if (pair[0] === 'age') {
                    return IVA.i18n.t(lang, 'norms.group.age', { band: IVA.i18n.formatNumber(lang, Number(pair[1].split('-')[0])) + '–' + IVA.i18n.formatNumber(lang, Number(pair[1].split('-')[1])) });
                }
                return IVA.i18n.t(lang, 'sex.' + pair[1]);
            })
            .join(lang === 'fa' ? '، ' : ', ');
    }

    // ---- exports ------------------------------------------------------------

    function csvCell(value) {
        if (value === null || value === undefined) {
            return '';
        }
        const text = String(value);
        return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    }

    function csv(rows) {
        // The BOM makes Excel read UTF-8, which Persian names need.
        return '﻿' + rows.map(function (row) {
            return row.map(csvCell).join(',');
        }).join('\r\n') + '\r\n';
    }

    function trialsCsv(session, result) {
        const rows = [[
            'session', 'participant', 'phase', 'index', 'set', 'block', 'condition', 'modality', 'stimulus',
            'target', 'onset_ms', 'rt_ms', 'outcome', 'anticipations', 'extras',
        ]];
        ['warmup', 'practice', 'main', 'cooldown'].forEach(function (phase) {
            result.phases[phase].forEach(function (trial) {
                rows.push([
                    session.id, session.participant.code, phase, trial.index, trial.set || '', trial.block || '',
                    trial.condition || '', trial.modality, trial.stimulus, trial.target ? 1 : 0,
                    trial.onset === null ? '' : Math.round(trial.onset * 10) / 10,
                    trial.rt === null ? '' : Math.round(trial.rt * 10) / 10,
                    trial.outcome, trial.anticipations, trial.extras,
                ]);
            });
        });
        return csv(rows);
    }

    // One row per session: participant, raw scales and (if norms apply) standard scores.
    function summaryCsv(entries, norms) {
        const scaleKeys = [];
        Object.keys(scoring.SCALES).forEach(function (key) {
            MODS.forEach(function (m) {
                scaleKeys.push(key + '.' + m);
            });
        });
        scaleKeys.push('balance.F');
        const compositeKeys = [];
        Object.keys(scoring.COMPOSITES).forEach(function (key) {
            MODS.forEach(function (m) {
                compositeKeys.push(key + '.' + m);
            });
        });
        const header = ['session', 'date', 'code', 'name', 'age', 'sex', 'handedness', 'examiner', 'protocol', 'test_language',
            'response', 'digits', 'voice', 'status', 'normative', 'pauses']
            .concat(scaleKeys)
            .concat(norms ? scaleKeys.map(function (k) { return 'ss.' + k; }).concat(compositeKeys.map(function (k) { return 'ss.' + k; })) : []);
        const rows = [header];
        entries.forEach(function (entry) {
            const s = entry.session;
            const scales = entry.result.scales;
            const row = [s.id, s.createdAt, s.participant.code, s.participant.name, s.participant.age, s.participant.sex,
                s.participant.handedness, s.examiner, s.settings.protocol, s.settings.testLang, s.settings.response,
                s.settings.digits, s.settings.voice, s.status, s.participant.normative ? 1 : 0, (s.pauses || []).length];
            scaleKeys.forEach(function (key) {
                const parts = key.split('.');
                const value = scales[parts[1]][parts[0]];
                row.push(value === null || value === undefined ? '' : Math.round(value * 100) / 100);
            });
            if (norms) {
                const comparable = s.status === 'complete' && s.settings.protocol === norms.protocol;
                const standard = comparable ? IVA.norms.score(norms, s.participant, scales) : null;
                scaleKeys.forEach(function (key) {
                    row.push(standard && standard.metrics[key] ? standard.metrics[key].score : '');
                });
                compositeKeys.forEach(function (key) {
                    row.push(standard && standard.composites[key] ? standard.composites[key].score : '');
                });
            }
            rows.push(row);
        });
        return csv(rows);
    }

    function download(filename, content, type) {
        const blob = new Blob([content], { type: type });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function () {
            URL.revokeObjectURL(url);
        }, 1000);
    }

    IVA.report = {
        render: render,
        trialsCsv: trialsCsv,
        summaryCsv: summaryCsv,
        download: download,
        escapeHtml: escapeHtml,
        groupLabel: groupLabel,
    };
})(typeof self !== 'undefined' ? self : this);
