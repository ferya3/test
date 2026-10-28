/*
 * Auditory stimuli: decoding, sample-accurate scheduling, and processing of
 * custom voice recordings.
 *
 * Stimuli are played through the Web Audio API rather than <audio> elements:
 * a buffer source can be started at an exact AudioContext time, and
 * getOutputTimestamp() maps that clock onto performance.now(), the clock the
 * response events are stamped with. Output latency is part of that mapping, so
 * the recorded onset is when the sound leaves the device, not when it was
 * requested.
 */
(function (root) {
    'use strict';

    const IVA = (root.IVA = root.IVA || {});

    // Keep in step with tools/build_audio.py, which processes the built-in clips.
    const MAX_MS = 480;
    const FADE_IN_MS = 2;
    const FADE_OUT_MS = 20;
    const TARGET_RMS = 0.12;
    const PEAK_LIMIT = 0.89;
    const STORE_RATE = 22050;

    let context = null;

    function getContext() {
        if (!context) {
            const Context = root.AudioContext || root.webkitAudioContext;
            if (!Context) {
                throw new Error('Web Audio is not supported');
            }
            context = new Context({ latencyHint: 'interactive' });
        }
        return context;
    }

    // Must run inside a user gesture: browsers keep audio suspended until one.
    function unlock() {
        const ctx = getContext();
        const silent = ctx.createBufferSource();
        silent.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        silent.connect(ctx.destination);
        silent.start();
        return ctx.state === 'running' ? Promise.resolve(ctx) : ctx.resume().then(() => ctx);
    }

    function base64ToBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    function bufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        }
        return btoa(binary);
    }

    function decode(arrayBuffer) {
        const ctx = getContext();
        return new Promise(function (resolve, reject) {
            // Older Safari only supports the callback form.
            const promise = ctx.decodeAudioData(arrayBuffer, resolve, reject);
            if (promise && promise.then) {
                promise.then(resolve, reject);
            }
        });
    }

    /*
     * The two stimulus buffers for a language. `custom` holds recorded clips
     * from storage ({ wav: base64 }), keyed by digit; anything missing falls
     * back to the built-in clip.
     */
    function loadVoice(lang, custom) {
        const recorded = custom || {};
        return Promise.all(
            [1, 2].map(function (digit) {
                const clip = recorded[digit] ? recorded[digit].wav : root.IVA_AUDIO_DATA[lang + '-' + digit];
                return decode(base64ToBuffer(clip));
            })
        ).then(function (buffers) {
            return { 1: buffers[0], 2: buffers[1], custom: !!(recorded[1] || recorded[2]) };
        });
    }

    // The AudioContext time at which a sample will be heard at performance time `perfMs`.
    function contextTimeAt(perfMs) {
        const ctx = getContext();
        if (typeof ctx.getOutputTimestamp === 'function') {
            const stamp = ctx.getOutputTimestamp();
            // Some browsers report zeros until audio has actually started flowing.
            if (stamp.performanceTime > 0 && stamp.contextTime > 0) {
                return stamp.contextTime + (perfMs - stamp.performanceTime) / 1000;
            }
        }
        const latency = ctx.outputLatency || ctx.baseLatency || 0;
        return ctx.currentTime + (perfMs - performance.now()) / 1000 - latency;
    }

    /*
     * Schedule a buffer to be heard at performance time `perfMs`. Returns the
     * source (so a pause can cancel it) and the onset actually achieved, which
     * is later than asked only if the request came too late to honour.
     */
    function playAt(buffer, perfMs) {
        const ctx = getContext();
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        const wanted = contextTimeAt(perfMs);
        const when = Math.max(wanted, ctx.currentTime + 0.005);
        source.start(when);
        return { source: source, onset: perfMs + (when - wanted) * 1000 };
    }

    function playNow(buffer) {
        return playAt(buffer, performance.now() + 30);
    }

    function stop(source) {
        try {
            source.stop();
        } catch (error) {
            // Already stopped or never started.
        }
    }

    function describe() {
        const ctx = getContext();
        return {
            sampleRate: ctx.sampleRate,
            baseLatencyMs: ctx.baseLatency ? Math.round(ctx.baseLatency * 1000) : null,
            outputLatencyMs: ctx.outputLatency ? Math.round(ctx.outputLatency * 1000) : null,
            outputTimestamp: typeof ctx.getOutputTimestamp === 'function',
        };
    }

    /*
     * Envelope-based trim: 5 ms RMS windows; the clip starts 5 ms before the
     * first window reaching 10% of the loudest one and ends 20 ms after the
     * last window above 5%. A recording's room noise or breath before the
     * word stays below those thresholds, so the onset lands on the word.
     */
    function trim(samples, rate) {
        const size = Math.max(1, Math.round(rate * 0.005));
        const envelope = [];
        for (let start = 0; start < samples.length; start += size) {
            let sum = 0;
            const end = Math.min(samples.length, start + size);
            for (let i = start; i < end; i++) {
                sum += samples[i] * samples[i];
            }
            envelope.push(Math.sqrt(sum / (end - start)));
        }
        const loudest = Math.max.apply(null, envelope);
        if (!(loudest > 0.005)) {
            return null;
        }
        const first = envelope.findIndex(function (v) {
            return v >= loudest * 0.1;
        });
        let last = envelope.length - 1;
        while (last > first && envelope[last] < loudest * 0.05) {
            last--;
        }
        const start = Math.max(0, first * size - Math.round(rate * 0.005));
        const end = Math.min(samples.length, (last + 1) * size + Math.round(rate * 0.02), start + Math.round((rate * MAX_MS) / 1000));
        const clip = samples.slice(start, end);

        const fadeIn = Math.round((rate * FADE_IN_MS) / 1000);
        const fadeOut = Math.round((rate * FADE_OUT_MS) / 1000);
        for (let i = 0; i < Math.min(fadeIn, clip.length); i++) {
            clip[i] *= i / fadeIn;
        }
        for (let i = 0; i < Math.min(fadeOut, clip.length); i++) {
            clip[clip.length - 1 - i] *= i / fadeOut;
        }
        return clip;
    }

    function normalize(samples) {
        let sum = 0;
        let peak = 0;
        for (let i = 0; i < samples.length; i++) {
            sum += samples[i] * samples[i];
            peak = Math.max(peak, Math.abs(samples[i]));
        }
        const rms = Math.sqrt(sum / samples.length);
        const gain = Math.min(TARGET_RMS / rms, PEAK_LIMIT / peak);
        for (let i = 0; i < samples.length; i++) {
            samples[i] *= gain;
        }
        return samples;
    }

    function resample(samples, fromRate, toRate) {
        if (fromRate === toRate || typeof OfflineAudioContext === 'undefined') {
            return Promise.resolve({ samples: samples, rate: fromRate });
        }
        const length = Math.ceil((samples.length * toRate) / fromRate);
        const offline = new OfflineAudioContext(1, length, toRate);
        const buffer = offline.createBuffer(1, samples.length, fromRate);
        buffer.copyToChannel(samples, 0);
        const source = offline.createBufferSource();
        source.buffer = buffer;
        source.connect(offline.destination);
        source.start();
        return offline.startRendering().then(function (rendered) {
            return { samples: rendered.getChannelData(0).slice(), rate: toRate };
        });
    }

    function encodeWav(samples, rate) {
        const buffer = new ArrayBuffer(44 + samples.length * 2);
        const view = new DataView(buffer);
        const text = function (offset, value) {
            for (let i = 0; i < value.length; i++) {
                view.setUint8(offset + i, value.charCodeAt(i));
            }
        };
        text(0, 'RIFF');
        view.setUint32(4, 36 + samples.length * 2, true);
        text(8, 'WAVE');
        text(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // PCM
        view.setUint16(22, 1, true); // mono
        view.setUint32(24, rate, true);
        view.setUint32(28, rate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        text(36, 'data');
        view.setUint32(40, samples.length * 2, true);
        for (let i = 0; i < samples.length; i++) {
            const s = Math.max(-1, Math.min(1, samples[i]));
            view.setInt16(44 + i * 2, Math.round(s * 32767), true);
        }
        return buffer;
    }

    /*
     * Turn any decodable recording (microphone or file) into a stored clip:
     * mixed to mono, trimmed, resampled to 22.05 kHz, loudness-normalized.
     * Resolves to { wav: base64, ms } or null when no sound was found.
     */
    function processRecording(arrayBuffer) {
        return decode(arrayBuffer).then(function (decoded) {
            const mono = new Float32Array(decoded.length);
            for (let c = 0; c < decoded.numberOfChannels; c++) {
                const data = decoded.getChannelData(c);
                for (let i = 0; i < decoded.length; i++) {
                    mono[i] += data[i] / decoded.numberOfChannels;
                }
            }
            const clip = trim(mono, decoded.sampleRate);
            if (!clip) {
                return null;
            }
            return resample(clip, decoded.sampleRate, STORE_RATE).then(function (result) {
                const samples = normalize(result.samples);
                return {
                    wav: bufferToBase64(encodeWav(samples, result.rate)),
                    ms: Math.round((samples.length / result.rate) * 1000),
                };
            });
        });
    }

    /*
     * Record from the microphone for up to `maxMs`. Returns { stop, done }:
     * stop() ends early, done resolves to the recording as an ArrayBuffer.
     */
    function record(maxMs) {
        return navigator.mediaDevices
            .getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true } })
            .then(function (stream) {
                const recorder = new MediaRecorder(stream);
                const chunks = [];
                recorder.ondataavailable = function (event) {
                    if (event.data && event.data.size) {
                        chunks.push(event.data);
                    }
                };
                const finished = new Promise(function (resolve) {
                    recorder.onstop = resolve;
                });
                const stopRecording = function () {
                    if (recorder.state !== 'inactive') {
                        recorder.stop();
                    }
                };
                recorder.start();
                const timer = setTimeout(stopRecording, maxMs);
                return {
                    stop: stopRecording,
                    done: finished.then(function () {
                        clearTimeout(timer);
                        stream.getTracks().forEach(function (track) {
                            track.stop();
                        });
                        return new Blob(chunks, { type: recorder.mimeType }).arrayBuffer();
                    }),
                };
            });
    }

    IVA.audio = {
        getContext: getContext,
        unlock: unlock,
        loadVoice: loadVoice,
        playAt: playAt,
        playNow: playNow,
        stop: stop,
        describe: describe,
        processRecording: processRecording,
        record: record,
    };
})(typeof self !== 'undefined' ? self : this);
