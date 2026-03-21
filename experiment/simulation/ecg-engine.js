/* =========================================
   ECG Signal Engine — Realistic Signal Generation
   Research-Grade Physiological ECG Simulation
   ========================================= */

class ECGSignalEngine {
    constructor() {
        // ========== PHYSIOLOGICAL CONSTANTS ==========
        // Resting membrane potential range for skeletal muscle: -70 to -90 mV
        this.restingPotential = { min: -90, max: -70 }; // mV (skeletal muscle range)
        
        // Action potential characteristics
        this.actionPotential = {
            peakOvershoot: { min: 20, max: 40 },  // mV (+20 to +40 mV)
            duration: { min: 2, max: 5 }          // ms (muscle fiber AP duration)
        };
        
        // Muscle fiber conduction velocity
        this.conductionVelocity = {
            normal: { min: 3, max: 6 },           // m/s (normal muscle)
            neuropathy: { min: 2, max: 4 },       // m/s (reduced in neuropathy)
            myopathy: { min: 2.5, max: 5 }        // m/s (slightly reduced)
        };
        
        // ========== SAMPLING PARAMETERS ==========
        // Surface ECG: 1000 Hz minimum, 2000 Hz preferred
        // Needle ECG: 10 kHz recommended
        this.sampleRate = 2000;         // Hz - preferred for surface ECG
        this.sampleRateMinimum = 1000;  // Hz - minimum standard
        this.sampleRateNeedle = 10000;  // Hz - for needle ECG
        this.ecgType = 'surface';       // 'surface' or 'needle'
        this.time = 0;
        
        // ========== BANDWIDTH SETTINGS ==========
        this.bandwidth = {
            surface: { low: 20, high: 450 },     // Hz (surface ECG)
            needle: { low: 10, high: 5000 }      // Hz (needle ECG)
        };
        
        // ========== NOISE PARAMETERS ==========
        // Noise RMS: 5-20 µV realistic for surface ECG
        this.noiseRMS = { min: 5, max: 20 };     // µV
        this.motionArtifactFreq = 20;             // Hz (< 20 Hz motion artifact)
        
        // ========== ADVANCED MODELING PARAMETERS ==========
        // Interspike interval variability (ISI)
        this.isiVariability = { min: 0.10, max: 0.30 }; // CV 10-30%
        
        // Fatigue modeling
        this.fatigueEnabled = true;
        this.fatigueRate = 0.02;        // Frequency shift rate per second
        
        // Crosstalk simulation (adjacent muscle interference)
        this.crosstalkEnabled = true;
        this.crosstalkLevel = { min: 0.05, max: 0.15 }; // 5-15%
        
        // Subcutaneous fat attenuation
        this.fatAttenuation = {
            thin: 1.0,
            normal: 0.85,
            high: 0.6
        };
        this.subjectType = 'normal';    // 'thin', 'normal', or 'high'
        
        // Baseline drift (< 10 Hz low frequency drift)
        this.baselineDriftEnabled = true;
        this.baselineDriftFreq = 0.5;   // Hz
        this.baselineDriftAmp = 0.02;   // mV
        
        // Impedance effects
        this.electrodeImpedance = 5;    // kΩ (target < 10 kΩ)
        
        // ========== CONDITION PARAMETERS ==========
        // Signal parameters per condition - based on clinical ECG characteristics
        // Note: Amplitudes are for SURFACE ECG unless otherwise noted
        this.conditions = {
            normal: {
                name: 'Healthy',
                muapDuration: 10,      // ms (typical 5-15ms)
                muapAmplitude: 0.5,    // mV base - surface ECG (50 µV - 3 mV typical)
                muapPhases: 3,         // triphasic
                firingRate: { min: 6, max: 25 },  // Hz - realistic firing rates
                recruitmentGain: 1.0,
                recruitmentCurve: 'linear',       // Normal: linear recruitment vs force
                jitter: 0.03,          // ms - slight timing variability
                noiseLevel: 0.010,     // baseline noise (~10 µV RMS)
                conductionVelocity: 4.5, // m/s
                asymmetry: 0.1,        // MUAP shape asymmetry factor
                description: 'Normal motor unit recruitment. Amplitude increases with force. Clean interference pattern at MVC.',
                characteristics: [
                    'MUAP Duration: 5-15 ms',
                    'Amplitude: 50 µV - 3 mV (surface ECG)',
                    'Phases: 2-4 (mostly triphasic)',
                    'Firing Rate: 6-25 Hz',
                    'Full interference pattern at MVC',
                    'Conduction Velocity: 3-6 m/s'
                ]
            },
            myopathy: {
                name: 'Myopathy',
                muapDuration: 5,       // ms (3-8 ms typical - refined)
                muapAmplitude: 0.15,   // mV - smaller due to fiber loss (surface ECG)
                muapPhases: 5,         // polyphasic
                firingRate: { min: 10, max: 35 },  // early recruitment
                recruitmentGain: 2.5,  // more units recruited early
                recruitmentCurve: 'steep',         // Myopathy: steeper early recruitment
                jitter: 0.05,
                noiseLevel: 0.015,     // ~15 µV RMS
                conductionVelocity: 3.5, // m/s (slightly reduced)
                asymmetry: 0.2,        // More asymmetric MUAPs
                description: 'Myopathic pattern: Small, short, polyphasic MUAPs. Early recruitment — many motor units fire even at low force levels.',
                characteristics: [
                    'MUAP Duration: 3-8 ms (SHORT)',
                    'Amplitude: 50-500 µV (LOW, surface ECG)',
                    'Phases: 4-6+ (polyphasic)',
                    'Early recruitment pattern',
                    'Full interference at LOW force',
                    'Steeper recruitment curve'
                ]
            },
            neuropathy: {
                name: 'Neuropathy',
                muapDuration: 17,      // ms (10-25 ms depending on reinnervation stage)
                muapAmplitude: 2.0,    // mV - larger due to reinnervation (1-6 mV surface typical)
                muapPhases: 5,         // polyphasic
                firingRate: { min: 4, max: 18 },  // slower firing
                recruitmentGain: 0.35, // reduced recruitment
                recruitmentCurve: 'flat',          // Neuropathy: flattened recruitment curve
                jitter: 0.1,           // increased jitter
                noiseLevel: 0.015,     // ~15 µV RMS
                conductionVelocity: 3.0, // m/s (reduced)
                conductionBlock: false, // Partial motor unit dropout
                asymmetry: 0.25,       // Variable rise/fall time
                fasciculations: false,
                description: 'Neuropathic pattern: Large, long, polyphasic MUAPs due to reinnervation. Reduced recruitment — fewer motor units available.',
                characteristics: [
                    'MUAP Duration: 10-25 ms (LONG)',
                    'Amplitude: 1-6 mV (HIGH, surface ECG)',
                    'Phases: 4-6+ (polyphasic)',
                    'Reduced recruitment',
                    'Discrete pattern even at moderate force',
                    'Reduced conduction velocity: 2-4 m/s'
                ]
            },
            als: {
                name: 'ALS (Amyotrophic Lateral Sclerosis)',
                muapDuration: 22,      // very long
                muapAmplitude: 3.5,    // mV - very large (3-8 mV surface, 10-15 mV needle)
                muapPhases: 7,         // complex
                firingRate: { min: 5, max: 15 },  // Variable and unstable (5-15 Hz)
                recruitmentGain: 0.15, // severely reduced
                recruitmentCurve: 'severely_reduced', // ALS: severely reduced maximum
                jitter: 0.20,          // Increased jitter, unstable
                isiVariability: 0.35,  // Variable interspike interval
                noiseLevel: 0.020,     // ~20 µV RMS
                conductionVelocity: 2.5, // m/s (reduced)
                asymmetry: 0.35,       // Complex, non-symmetric MUAPs
                fasciculations: true,
                fasciculationAmplitude: { min: 0.5, max: 3.0 }, // Variable amplitude
                fasciculationInterval: { min: 0.3, max: 3.0 },  // Irregular intervals (seconds)
                fibrillations: true,
                fibrillationAmplitude: { min: 0.020, max: 0.200 }, // 20-200 µV
                fibrillationRate: { min: 1, max: 30 },  // 1-30 Hz
                description: 'ALS pattern: Very large, long, unstable MUAPs. Fasciculations and fibrillations present at rest. Severely reduced recruitment.',
                characteristics: [
                    'MUAP Duration: 15-25+ ms (VERY LONG)',
                    'Amplitude: 3-8 mV surface, 10-15 mV needle',
                    'Unstable, complex MUAPs',
                    'Fasciculations: variable amplitude, irregular',
                    'Fibrillations: 20-200 µV, 1-30 Hz',
                    'Severely reduced recruitment',
                    'Increased jitter and ISI variability'
                ]
            }
        };
    }

    // Generate a single MUAP waveform - realistic asymmetric shape
    generateMUAP(condition, variationSeed = 0) {
        const params = this.conditions[condition];
        const duration = params.muapDuration * (1 + (Math.random() - 0.5) * 0.25);
        
        // Apply subcutaneous fat attenuation
        const fatFactor = this.fatAttenuation[this.subjectType] || 1.0;
        const amplitude = params.muapAmplitude * fatFactor * (1 + (Math.random() - 0.5) * 0.35);
        
        const phases = params.muapPhases + Math.floor(Math.random() * 2);
        const numSamples = Math.round(duration * this.sampleRate / 1000);
        const waveform = new Float32Array(numSamples);
        
        // Asymmetry factor - real MUAPs are not perfectly symmetric
        const asymmetry = params.asymmetry || 0.1;
        const riseTimeFactor = 1 - asymmetry * (0.5 + Math.random() * 0.5);
        const fallTimeFactor = 1 + asymmetry * (0.5 + Math.random() * 0.5);

        for (let i = 0; i < numSamples; i++) {
            const t = i / numSamples;
            let value = 0;

            // Generate multi-phase waveform with realistic asymmetric shape
            for (let p = 0; p < phases; p++) {
                // Slightly offset phase centers for asymmetry
                const phaseOffset = (p % 2 === 0) ? -0.02 * asymmetry : 0.02 * asymmetry;
                const phaseCenter = (p + 0.5) / phases + phaseOffset;
                
                // Variable width for rise/fall asymmetry
                const isRising = t < phaseCenter;
                const phaseWidth = (1 / (phases * 2.2)) * (isRising ? riseTimeFactor : fallTimeFactor);
                
                const phaseSign = (p % 2 === 0) ? 1 : -1;
                const phaseAmp = amplitude * (1 - Math.abs(p - phases / 2) / phases * 0.4);
                
                // Add slight random variation to each phase
                const phaseVariation = 1 + (Math.random() - 0.5) * 0.15;

                value += phaseSign * phaseAmp * phaseVariation *
                    Math.exp(-Math.pow((t - phaseCenter) / phaseWidth, 2) / 2);
            }

            // Enhanced envelope for realistic onset/offset (asymmetric)
            const onsetSharpness = 0.6 + asymmetry * 0.3;
            const offsetSharpness = 0.8 - asymmetry * 0.2;
            const envelope = Math.pow(Math.sin(Math.PI * t), t < 0.5 ? onsetSharpness : offsetSharpness);
            value *= envelope;

            // Add realistic jitter with proper units
            value += (Math.random() - 0.5) * params.jitter * amplitude * 0.5;

            waveform[i] = value;
        }

        return { waveform, duration, amplitude };
    }

    // Generate continuous ECG signal - research-grade modeling
    generateSignal(condition, forceLevel, durationMs, startTime = 0, elapsedTime = 0) {
        const params = this.conditions[condition];
        const numSamples = Math.round(durationMs * this.sampleRate / 1000);
        const signal = new Float32Array(numSamples);

        // ========== RECRUITMENT CURVE MODEL (Item 13) ==========
        const maxMUs = Math.round(15 * params.recruitmentGain);
        let activeMUs;
        
        switch (params.recruitmentCurve) {
            case 'steep':
                // Myopathy: steeper early recruitment
                activeMUs = Math.max(0, Math.round(maxMUs * Math.pow(forceLevel / 100, 0.4)));
                break;
            case 'flat':
                // Neuropathy: flattened recruitment curve
                activeMUs = Math.max(0, Math.round(maxMUs * Math.pow(forceLevel / 100, 0.9)));
                break;
            case 'severely_reduced':
                // ALS: severely reduced maximum recruitment
                activeMUs = Math.max(0, Math.round(maxMUs * 0.3 * Math.pow(forceLevel / 100, 0.7)));
                break;
            default:
                // Normal: linear recruitment vs force
                activeMUs = Math.max(0, Math.round(maxMUs * Math.pow(forceLevel / 100, 0.6)));
        }

        // ========== CONDUCTION BLOCK (Item 20) ==========
        // For neuropathy: partial motor unit dropout
        if (params.conductionBlock && Math.random() < 0.3) {
            activeMUs = Math.floor(activeMUs * (0.5 + Math.random() * 0.3));
        }

        // ========== ISI VARIABILITY (Item 14) ==========
        // Real motor units have CV (coefficient of variation) of 10-30%
        const isiCV = params.isiVariability || (this.isiVariability.min + Math.random() * (this.isiVariability.max - this.isiVariability.min));

        // Generate MUAPs for each active motor unit
        for (let mu = 0; mu < activeMUs; mu++) {
            const muap = this.generateMUAP(condition, mu);
            const firingRateRange = params.firingRate.max - params.firingRate.min;
            let baseFiringRate = params.firingRate.min +
                (firingRateRange * Math.min(1, (forceLevel / 100) * (mu + 1) / activeMUs));

            // ========== FATIGUE MODELING (Item 15) ==========
            // During sustained contraction: firing rate slightly decreases
            if (this.fatigueEnabled && elapsedTime > 0) {
                const fatigueFactor = Math.max(0.7, 1 - this.fatigueRate * elapsedTime);
                baseFiringRate *= fatigueFactor;
            }

            // Size principle: later recruited units are larger
            const sizeFactor = 1 + mu * 0.12;

            // Calculate base interval with ISI variability
            const baseInterval = Math.round(this.sampleRate / baseFiringRate);
            let pos = Math.round(Math.random() * baseInterval);

            while (pos < numSamples) {
                for (let j = 0; j < muap.waveform.length && (pos + j) < numSamples; j++) {
                    signal[pos + j] += muap.waveform[j] * sizeFactor;
                }
                
                // Apply ISI variability using gaussian-like distribution
                const isiVariation = this.gaussianRandom() * isiCV * baseInterval;
                const nextInterval = Math.max(
                    Math.round(baseInterval * 0.5), // Minimum interval
                    Math.round(baseInterval + isiVariation)
                );
                pos += nextInterval;
            }
        }

        // ========== FASCICULATIONS (Item 21) - Enhanced variability ==========
        // Random burst events with variable amplitude and irregular intervals
        if (params.fasciculations && forceLevel < 15) {
            const fascAmpRange = params.fasciculationAmplitude || { min: 0.5, max: 2.5 };
            const fascIntervalRange = params.fasciculationInterval || { min: 0.5, max: 2.5 };
            
            let pos = Math.round(Math.random() * this.sampleRate * fascIntervalRange.max);
            
            while (pos < numSamples) {
                // Variable amplitude for each fasciculation
                const fascMuap = this.generateMUAP(condition);
                const fascAmp = fascAmpRange.min + Math.random() * (fascAmpRange.max - fascAmpRange.min);
                
                for (let j = 0; j < fascMuap.waveform.length && (pos + j) < numSamples; j++) {
                    signal[pos + j] += fascMuap.waveform[j] * fascAmp;
                }
                
                // Irregular intervals between fasciculations
                const nextInterval = (fascIntervalRange.min + Math.random() * (fascIntervalRange.max - fascIntervalRange.min)) * this.sampleRate;
                pos += Math.round(nextInterval);
            }
        }

        // ========== FIBRILLATIONS (Item 22) - Proper amplitude range ==========
        // 20-200 µV, frequency 1-30 Hz
        if (params.fibrillations && forceLevel < 15) {
            const fibAmpRange = params.fibrillationAmplitude || { min: 0.020, max: 0.200 }; // mV
            const fibRateRange = params.fibrillationRate || { min: 1, max: 30 }; // Hz
            const fibRate = fibRateRange.min + Math.random() * (fibRateRange.max - fibRateRange.min);
            const fibInterval = Math.round(this.sampleRate / fibRate);
            
            for (let pos = Math.round(Math.random() * fibInterval); pos < numSamples; pos += fibInterval + Math.round(Math.random() * fibInterval * 0.5)) {
                // Variable amplitude within physiological range
                const fibAmp = fibAmpRange.min + Math.random() * (fibAmpRange.max - fibAmpRange.min);
                const fibDur = Math.round((1.5 + Math.random()) * this.sampleRate / 1000);
                const polarity = Math.random() > 0.5 ? 1 : -1;
                
                for (let j = 0; j < fibDur && (pos + j) < numSamples; j++) {
                    const t = j / fibDur;
                    signal[pos + j] += fibAmp * Math.sin(Math.PI * t) * polarity;
                }
            }
        }

        // ========== CROSSTALK SIMULATION (Item 16) ==========
        // 5-15% neighboring muscle interference
        if (this.crosstalkEnabled) {
            const crosstalkLevel = this.crosstalkLevel.min + Math.random() * (this.crosstalkLevel.max - this.crosstalkLevel.min);
            const crosstalkSignal = new Float32Array(numSamples);
            
            // Generate "adjacent muscle" signal at different frequency
            for (let i = 0; i < numSamples; i++) {
                const t = i / this.sampleRate;
                // Lower amplitude, slightly different frequency characteristics
                crosstalkSignal[i] = (Math.random() - 0.5) * params.muapAmplitude * 0.3 * 
                    (1 + 0.5 * Math.sin(2 * Math.PI * 15 * t)); // ~15 Hz modulation
            }
            
            for (let i = 0; i < numSamples; i++) {
                signal[i] += crosstalkSignal[i] * crosstalkLevel;
            }
        }

        // ========== BASELINE DRIFT (Item 18) ==========
        // Low frequency (<10 Hz) drift due to movement
        if (this.baselineDriftEnabled) {
            for (let i = 0; i < numSamples; i++) {
                const t = (startTime + i) / this.sampleRate;
                const drift = this.baselineDriftAmp * Math.sin(2 * Math.PI * this.baselineDriftFreq * t);
                // Add very low frequency component
                const drift2 = this.baselineDriftAmp * 0.5 * Math.sin(2 * Math.PI * 0.1 * t);
                signal[i] += drift + drift2;
            }
        }

        // ========== NOISE MODEL (Item 9) ==========
        // Realistic baseline noise with proper units (5-20 µV RMS)
        const noiseRMS = (this.noiseRMS.min + Math.random() * (this.noiseRMS.max - this.noiseRMS.min)) / 1000; // Convert µV to mV
        
        // Add motion artifact component (<20 Hz)
        for (let i = 0; i < numSamples; i++) {
            // Gaussian white noise
            const noise = this.gaussianRandom() * noiseRMS * 2;
            signal[i] += noise;
            
            // Motion artifact (low frequency)
            const t = i / this.sampleRate;
            const motionArtifact = noiseRMS * 0.5 * Math.sin(2 * Math.PI * (5 + Math.random() * 10) * t);
            signal[i] += motionArtifact * 0.3; // 30% of noise level
        }
        
        // ========== IMPEDANCE EFFECTS (Item 25) ==========
        // Increase noise if impedance > 10 kΩ
        if (this.electrodeImpedance > 10) {
            const impedanceFactor = Math.sqrt(this.electrodeImpedance / 5);
            for (let i = 0; i < numSamples; i++) {
                signal[i] += this.gaussianRandom() * noiseRMS * impedanceFactor;
                // Add phase distortion at high impedance
                if (i > 0) {
                    signal[i] = signal[i] * 0.95 + signal[i-1] * 0.05 * (this.electrodeImpedance / 10);
                }
            }
        }

        return signal;
    }
    
    // Gaussian random number generator (Box-Muller transform)
    gaussianRandom() {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }

    // Generate frequency spectrum (simulated FFT) - Item 24: Realistic power spectrum shape
    // Uses band-limited Gaussian distribution with peak around 80-120 Hz, skewed spectrum
    generateSpectrum(condition, forceLevel, elapsedTime = 0) {
        const params = this.conditions[condition];
        const freqs = [];
        const powers = [];
        const numBins = 256;
        const maxFreq = this.sampleRate / 2;

        // Bandwidth based on ECG type
        const bandwidth = this.ecgType === 'needle' ? this.bandwidth.needle : this.bandwidth.surface;

        for (let i = 0; i < numBins; i++) {
            const freq = (i / numBins) * maxFreq;
            freqs.push(freq);

            let power = 0;

            // ECG power spectrum shape - band-limited Gaussian with skew
            // Peak typically around 80-120 Hz for surface ECG
            if (condition === 'normal') {
                // Normal: peak around 80-100 Hz
                const centerFreq = 90 + forceLevel * 0.3;
                const bandwidthLeft = 45;   // Narrower on left (skewed)
                const bandwidthRight = 70;  // Wider on right
                const skewedWidth = freq < centerFreq ? bandwidthLeft : bandwidthRight;
                power = Math.exp(-Math.pow((freq - centerFreq) / skewedWidth, 2)) * forceLevel / 100;
                
                // Add secondary peak around 150 Hz (harmonics)
                const secondaryPeak = Math.exp(-Math.pow((freq - 150) / 50, 2)) * 0.3 * forceLevel / 100;
                power += secondaryPeak;
                
            } else if (condition === 'myopathy') {
                // Myopathy: shifted to higher frequencies (shorter MUAPs)
                // Peak around 120-140 Hz
                const centerFreq = 130 + forceLevel * 0.2;
                const bandwidthLeft = 50;
                const bandwidthRight = 80;
                const skewedWidth = freq < centerFreq ? bandwidthLeft : bandwidthRight;
                power = Math.exp(-Math.pow((freq - centerFreq) / skewedWidth, 2)) * forceLevel / 100 * 0.5;
                
            } else if (condition === 'neuropathy') {
                // Neuropathy: shifted to lower frequencies (longer MUAPs)
                // Peak around 50-70 Hz
                const centerFreq = 60 + forceLevel * 0.2;
                const bandwidthLeft = 30;
                const bandwidthRight = 50;
                const skewedWidth = freq < centerFreq ? bandwidthLeft : bandwidthRight;
                power = Math.exp(-Math.pow((freq - centerFreq) / skewedWidth, 2)) * forceLevel / 100 * 1.5;
                
            } else if (condition === 'als') {
                // ALS: very low frequency, high power peaks
                // Peak around 40-50 Hz with complex shape
                const centerFreq = 45 + forceLevel * 0.15;
                const bandwidthLeft = 25;
                const bandwidthRight = 40;
                const skewedWidth = freq < centerFreq ? bandwidthLeft : bandwidthRight;
                power = Math.exp(-Math.pow((freq - centerFreq) / skewedWidth, 2)) * forceLevel / 100 * 2;
                
                // Add fibrillation component (higher frequency)
                if (forceLevel < 10 && freq > 80 && freq < 200) {
                    power += 0.08 * Math.exp(-Math.pow((freq - 140) / 40, 2)) * Math.random();
                }
            }

            // ========== FATIGUE MODELING (Item 15) - Frequency shift ==========
            // Median frequency shifts downward during sustained contraction
            if (this.fatigueEnabled && elapsedTime > 0) {
                const freqShift = Math.min(0.3, elapsedTime * this.fatigueRate);
                // Compress spectrum towards lower frequencies
                const shiftedPower = power * (1 - freqShift * freq / maxFreq);
                power = shiftedPower;
            }

            // Apply bandwidth filtering
            if (freq < bandwidth.low || freq > bandwidth.high) {
                power *= 0.1; // Attenuate out-of-band
            }

            // Add realistic noise floor with slight variation
            power += 0.002 * (1 + Math.random() * 0.5);
            
            // Ensure non-negative
            powers.push(Math.max(0, power));
        }

        return { freqs, powers };
    }

    // Calculate RMS of signal
    calculateRMS(signal) {
        let sumSquares = 0;
        for (let i = 0; i < signal.length; i++) {
            sumSquares += signal[i] * signal[i];
        }
        return Math.sqrt(sumSquares / signal.length);
    }

    // Calculate mean frequency from spectrum
    calculateMeanFreq(freqs, powers) {
        let sumFP = 0, sumP = 0;
        for (let i = 0; i < freqs.length; i++) {
            sumFP += freqs[i] * powers[i];
            sumP += powers[i];
        }
        return sumP > 0 ? sumFP / sumP : 0;
    }

    // Calculate median frequency
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

    // Get peak amplitude
    getPeakAmplitude(signal) {
        let peak = 0;
        for (let i = 0; i < signal.length; i++) {
            peak = Math.max(peak, Math.abs(signal[i]));
        }
        return peak;
    }

    // RMS envelope
    calculateRMSEnvelope(signal, windowSize) {
        const windowSamples = Math.round(windowSize * this.sampleRate / 1000);
        const envelope = [];
        for (let i = 0; i < signal.length - windowSamples; i += Math.round(windowSamples / 2)) {
            let sumSq = 0;
            for (let j = 0; j < windowSamples; j++) {
                sumSq += signal[i + j] * signal[i + j];
            }
            envelope.push(Math.sqrt(sumSq / windowSamples));
        }
        return envelope;
    }

    // ========== CONFIGURATION METHODS ==========
    
    // Set ECG type (surface or needle)
    setECGType(type) {
        this.ecgType = type;
        this.sampleRate = type === 'needle' ? this.sampleRateNeedle : 2000;
    }
    
    // Set subject body type for fat attenuation
    setSubjectType(type) {
        this.subjectType = type; // 'thin', 'normal', or 'high'
    }
    
    // Set electrode impedance
    setImpedance(impedanceKOhm) {
        this.electrodeImpedance = impedanceKOhm;
    }
    
    // Enable/disable fatigue modeling
    setFatigueEnabled(enabled) {
        this.fatigueEnabled = enabled;
    }
    
    // Enable/disable crosstalk
    setCrosstalkEnabled(enabled) {
        this.crosstalkEnabled = enabled;
    }
    
    // Enable/disable baseline drift
    setBaselineDriftEnabled(enabled) {
        this.baselineDriftEnabled = enabled;
    }
    
    // Enable conduction block for neuropathy
    enableConductionBlock(condition) {
        if (this.conditions[condition]) {
            this.conditions[condition].conductionBlock = true;
        }
    }
    
    // Get physiological info
    getPhysiologicalInfo() {
        return {
            restingPotential: this.restingPotential,
            actionPotential: this.actionPotential,
            conductionVelocity: this.conductionVelocity,
            sampleRate: this.sampleRate,
            bandwidth: this.bandwidth[this.ecgType],
            noiseRMS: this.noiseRMS,
            isiVariability: this.isiVariability
        };
    }
}

// Make it globally available
window.ECGEngine = new ECGSignalEngine();