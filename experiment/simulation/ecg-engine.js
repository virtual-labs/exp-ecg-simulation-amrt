/* =========================================
   ECG Signal Engine — Cardiac Rhythm Simulation
   ========================================= */

class ECGSignalEngine {
    constructor() {
        this.sampleRate = 1000;
        this.sampleRateMinimum = 500;
        this.sampleRateNeedle = 2000;
        this.ecgType = 'surface';

        this.bandwidth = {
            surface: { low: 0.05, high: 150 },
            needle: { low: 0.05, high: 250 }
        };

        this.noiseRMS = { min: 5, max: 20 }; // uV
        this.baselineDriftEnabled = true;
        this.baselineDriftFreq = 0.33;
        this.baselineDriftAmp = 0.03; // mV

        this.electrodeImpedance = 5; // kOhm
        this.subjectType = 'normal';
        this.fatAttenuation = {
            thin: 1.0,
            normal: 0.9,
            high: 0.75
        };

        this.conditions = {
            normal: {
                name: 'Normal Sinus Rhythm',
                description: 'Regular rhythm with normal RR intervals and stable P-QRS-T morphology.',
                characteristics: [
                    'Heart rate: 60-100 bpm',
                    'Regular RR interval',
                    'Visible P wave before each QRS',
                    'Narrow QRS and smooth T wave'
                ],
                bpm: { min: 65, max: 85 },
                rrVariability: 0.03,
                qrsAmplitude: 1.0,
                pAmplitude: 0.12,
                tAmplitude: 0.35,
                stShift: 0,
                qrsDurationMs: 90,
                firingRate: { min: 65, max: 85 },
                recruitmentGain: 1.0
            },
            tachycardia: {
                name: 'Sinus Tachycardia',
                description: 'Fast rhythm with shortened RR intervals and preserved waveform sequence.',
                characteristics: [
                    'Heart rate: > 100 bpm',
                    'Short RR interval',
                    'P wave may merge into preceding T wave at high rate',
                    'QRS generally narrow'
                ],
                bpm: { min: 105, max: 145 },
                rrVariability: 0.05,
                qrsAmplitude: 0.95,
                pAmplitude: 0.10,
                tAmplitude: 0.30,
                stShift: 0,
                qrsDurationMs: 80,
                firingRate: { min: 105, max: 145 },
                recruitmentGain: 1.1
            },
            bradycardia: {
                name: 'Sinus Bradycardia',
                description: 'Slow rhythm with prolonged RR intervals and clear waveform separation.',
                characteristics: [
                    'Heart rate: < 60 bpm',
                    'Long RR interval',
                    'Clear separation between T and next P wave',
                    'Narrow QRS in sinus bradycardia'
                ],
                bpm: { min: 40, max: 58 },
                rrVariability: 0.04,
                qrsAmplitude: 1.05,
                pAmplitude: 0.12,
                tAmplitude: 0.36,
                stShift: 0,
                qrsDurationMs: 95,
                firingRate: { min: 40, max: 58 },
                recruitmentGain: 0.9
            },
            irregular: {
                name: 'Irregular Rhythm',
                description: 'Variable RR intervals with occasional premature beats and rhythm instability.',
                characteristics: [
                    'Variable RR interval',
                    'Occasional premature beats',
                    'Beat-to-beat amplitude variability',
                    'Rhythm not strictly periodic'
                ],
                bpm: { min: 55, max: 120 },
                rrVariability: 0.22,
                qrsAmplitude: 1.1,
                pAmplitude: 0.08,
                tAmplitude: 0.30,
                stShift: -0.03,
                qrsDurationMs: 110,
                firingRate: { min: 55, max: 120 },
                recruitmentGain: 1.0
            }
        };
    }

    gaussianRandom() {
        let u = 0;
        let v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    getConditionBPM(condition, forceLevel) {
        const params = this.conditions[condition] || this.conditions.normal;
        const base = params.bpm.min + Math.random() * (params.bpm.max - params.bpm.min);
        const normalized = Math.max(0, Math.min(1, forceLevel / 100));

        if (condition === 'tachycardia') return base + normalized * 10;
        if (condition === 'bradycardia') return Math.max(35, base - normalized * 5);
        if (condition === 'irregular') return base + (normalized - 0.5) * 8;
        return base + (normalized - 0.5) * 6;
    }

    beatValue(t, params, amplitudeScale) {
        const p = params.pAmplitude * Math.exp(-Math.pow((t + 0.2) / 0.03, 2));
        const q = -0.15 * Math.exp(-Math.pow((t + 0.04) / 0.012, 2));
        const r = 1.0 * Math.exp(-Math.pow(t / 0.01, 2));
        const s = -0.25 * Math.exp(-Math.pow((t - 0.04) / 0.014, 2));
        const tw = params.tAmplitude * Math.exp(-Math.pow((t - 0.28) / 0.06, 2));
        const st = params.stShift || 0;
        return amplitudeScale * params.qrsAmplitude * (p + q + r + s + tw + st);
    }

    addBeat(signal, beatCenter, params, rrSec, amplitudeScale) {
        const pre = Math.round(0.32 * this.sampleRate);
        const post = Math.round(Math.max(0.45, rrSec * 0.7) * this.sampleRate);

        for (let i = -pre; i <= post; i++) {
            const idx = beatCenter + i;
            if (idx < 0 || idx >= signal.length) continue;
            const t = i / this.sampleRate;
            signal[idx] += this.beatValue(t, params, amplitudeScale);
        }
    }

    generateSignal(condition, forceLevel, durationMs, startTime = 0, elapsedTime = 0) {
        const params = this.conditions[condition] || this.conditions.normal;
        const numSamples = Math.round(durationMs * this.sampleRate / 1000);
        const signal = new Float32Array(numSamples);

        const fatFactor = this.fatAttenuation[this.subjectType] || 1.0;
        const bpm = this.getConditionBPM(condition, forceLevel);
        const rrMean = 60 / Math.max(30, bpm);
        const amplitudeScale = (0.75 + (forceLevel / 100) * 0.5) * fatFactor;

        let nextBeatSec = Math.random() * rrMean * 0.6;
        while (nextBeatSec < durationMs / 1000 + rrMean) {
            let rr = rrMean * (1 + this.gaussianRandom() * params.rrVariability);
            rr = Math.max(0.35, Math.min(1.8, rr));

            if (condition === 'irregular' && Math.random() < 0.12) {
                rr *= 0.6;
            }

            const beatCenter = Math.round(nextBeatSec * this.sampleRate);
            const beatAmp = amplitudeScale * (0.9 + Math.random() * 0.2);
            this.addBeat(signal, beatCenter, params, rr, beatAmp);

            nextBeatSec += rr;
        }

        if (this.baselineDriftEnabled) {
            for (let i = 0; i < numSamples; i++) {
                const t = (startTime + i) / this.sampleRate;
                signal[i] += this.baselineDriftAmp * Math.sin(2 * Math.PI * this.baselineDriftFreq * t);
                signal[i] += this.baselineDriftAmp * 0.4 * Math.sin(2 * Math.PI * 0.08 * t + elapsedTime * 0.2);
            }
        }

        const noiseRMSmV = (this.noiseRMS.min + Math.random() * (this.noiseRMS.max - this.noiseRMS.min)) / 1000;
        for (let i = 0; i < numSamples; i++) {
            signal[i] += this.gaussianRandom() * noiseRMSmV * 1.8;
        }

        if (this.electrodeImpedance > 10) {
            const factor = Math.sqrt(this.electrodeImpedance / 5);
            for (let i = 0; i < numSamples; i++) {
                signal[i] += this.gaussianRandom() * noiseRMSmV * factor;
                if (i > 0) {
                    signal[i] = signal[i] * 0.96 + signal[i - 1] * 0.04;
                }
            }
        }

        return signal;
    }

    generateSpectrum(condition, forceLevel, elapsedTime = 0) {
        const params = this.conditions[condition] || this.conditions.normal;
        const freqs = [];
        const powers = [];
        const numBins = 256;
        const maxFreq = this.sampleRate / 2;
        const bandwidth = this.ecgType === 'needle' ? this.bandwidth.needle : this.bandwidth.surface;

        let center = 18;
        let spread = 12;
        let scale = 1;

        if (condition === 'tachycardia') {
            center = 24;
            spread = 14;
            scale = 0.9;
        } else if (condition === 'bradycardia') {
            center = 12;
            spread = 10;
            scale = 1.05;
        } else if (condition === 'irregular') {
            center = 20;
            spread = 20;
            scale = 1.1;
        }

        center += (forceLevel / 100) * 4;

        for (let i = 0; i < numBins; i++) {
            const freq = (i / numBins) * maxFreq;
            freqs.push(freq);

            let power = Math.exp(-Math.pow((freq - center) / spread, 2)) * scale;
            power += 0.35 * Math.exp(-Math.pow((freq - 2 * center) / (spread * 1.3), 2));

            if (condition === 'irregular') {
                power += 0.15 * Math.exp(-Math.pow((freq - 35) / 18, 2)) * Math.random();
            }

            if (freq < bandwidth.low || freq > bandwidth.high) {
                power *= 0.1;
            }

            power += 0.002 * (1 + Math.random() * 0.5);
            powers.push(Math.max(0, power));
        }

        return { freqs, powers };
    }

    calculateRMS(signal) {
        let sumSquares = 0;
        for (let i = 0; i < signal.length; i++) {
            sumSquares += signal[i] * signal[i];
        }
        return Math.sqrt(sumSquares / signal.length);
    }

    calculateMeanFreq(freqs, powers) {
        let sumFP = 0;
        let sumP = 0;
        for (let i = 0; i < freqs.length; i++) {
            sumFP += freqs[i] * powers[i];
            sumP += powers[i];
        }
        return sumP > 0 ? sumFP / sumP : 0;
    }

    calculateMedianFreq(freqs, powers) {
        let totalPower = 0;
        for (let i = 0; i < powers.length; i++) totalPower += powers[i];
        let cumPower = 0;
        for (let i = 0; i < freqs.length; i++) {
            cumPower += powers[i];
            if (cumPower >= totalPower / 2) return freqs[i];
        }
        return 0;
    }

    getPeakAmplitude(signal) {
        let peak = 0;
        for (let i = 0; i < signal.length; i++) {
            peak = Math.max(peak, Math.abs(signal[i]));
        }
        return peak;
    }

    calculateRMSEnvelope(signal, windowSize) {
        const windowSamples = Math.max(1, Math.round(windowSize * this.sampleRate / 1000));
        const envelope = [];
        for (let i = 0; i < signal.length - windowSamples; i += Math.max(1, Math.round(windowSamples / 2))) {
            let sumSq = 0;
            for (let j = 0; j < windowSamples; j++) {
                sumSq += signal[i + j] * signal[i + j];
            }
            envelope.push(Math.sqrt(sumSq / windowSamples));
        }
        return envelope;
    }

    setECGType(type) {
        this.ecgType = type;
        this.sampleRate = type === 'needle' ? this.sampleRateNeedle : 1000;
    }

    setSubjectType(type) {
        this.subjectType = type;
    }

    setImpedance(impedanceKOhm) {
        this.electrodeImpedance = impedanceKOhm;
    }

    setFatigueEnabled() {
        // Kept for backward compatibility with existing UI controls.
    }

    setCrosstalkEnabled() {
        // Kept for backward compatibility with existing UI controls.
    }

    setBaselineDriftEnabled(enabled) {
        this.baselineDriftEnabled = enabled;
    }

    enableConductionBlock() {
        // Not used in ECG rhythm simulation; retained as no-op for compatibility.
    }

    getPhysiologicalInfo() {
        return {
            sampleRate: this.sampleRate,
            bandwidth: this.bandwidth[this.ecgType],
            noiseRMS: this.noiseRMS,
            electrodeImpedance: this.electrodeImpedance,
            conditions: Object.keys(this.conditions)
        };
    }
}

window.ECGEngine = new ECGSignalEngine();
