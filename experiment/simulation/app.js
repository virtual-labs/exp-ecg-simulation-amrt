/* =========================================
   ECG Virtual Lab — Main Application
   ========================================= */

'use strict';

    // ======== STATE ========
    const state = {
        currentStep: 0,
        equipmentExplored: new Set(),
        selectedMuscle: null,
        prepState: {
            currentPhase: 'clean',
            cleaned: new Set(),
            abraded: new Set(),
            gelled: new Set(),
            placed: new Set()
        },
        calibrated: false,
        recording: false,
        recordingAnimation: null,
        currentCondition: 'normal',
        forceLevel: 0,
        trialsSaved: 0,
        trials: {},
        signalBuffer: [],
        signalOffset: 0,
        signalSpeed: 0.5,
        completedSteps: new Set([0])
    };

    const REQUIRED_ELECTRODES = ['ra', 'la', 'rl', 'll', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6'];

    // Lead/electrode region information database
    const muscleInfo = {
        ra: {
            name: 'RA Electrode',
            description: 'Right arm limb electrode. In standard 12-lead ECG this is placed on right distal limb/proximal arm as practical.',
            placement: 'Prepare skin on right arm site and attach RA firmly with good adhesive contact.',
            clinical: 'Used as a reference point in Einthoven triangle and augmented leads.',
            ecgNote: 'Poor RA contact can introduce baseline noise and motion artifact.',
            shape: 'arm-upper'
        },
        la: {
            name: 'LA Electrode',
            description: 'Left arm limb electrode used with RA/LL to derive standard limb leads.',
            placement: 'Prepare left arm site and place LA electrode symmetrically opposite RA when possible.',
            clinical: 'Essential for Leads I and III calculations and augmented lead vectors.',
            ecgNote: 'Asymmetrical placement can increase noise susceptibility.',
            shape: 'arm-upper'
        },
        rl: {
            name: 'RL Electrode (Ground)',
            description: 'Right leg ground/reference electrode for common-mode noise reduction.',
            placement: 'Place RL on right lower limb (or lower torso) away from active measurement sites.',
            clinical: 'Improves common mode rejection and stabilizes baseline.',
            ecgNote: 'RL does not form diagnostic lead voltage directly, but strongly affects signal quality.',
            shape: 'thigh'
        },
        ll: {
            name: 'LL Electrode',
            description: 'Left leg limb electrode that completes standard limb lead geometry.',
            placement: 'Prepare left lower limb site and place LL securely with clean skin contact.',
            clinical: 'Used in Leads II and III and augmented limb leads.',
            ecgNote: 'Lead II (RA to LL) often gives clear P waves and rhythm assessment.',
            shape: 'thigh'
        },
        v1: {
            name: 'V1 Chest Lead',
            description: 'Precordial lead at 4th intercostal space, right sternal border.',
            placement: 'Locate sternal angle, count to 4th intercostal space, then place at right sternal edge.',
            clinical: 'Useful for right ventricular and septal activity.',
            ecgNote: 'Incorrect ICS level can mimic conduction abnormalities.',
            shape: 'chest'
        },
        v2: {
            name: 'V2 Chest Lead',
            description: 'Precordial lead at 4th intercostal space, left sternal border.',
            placement: 'Same horizontal level as V1, mirrored to left sternal border.',
            clinical: 'Together with V1 evaluates septal/anterior electrical activity.',
            ecgNote: 'V1-V2 high placement can produce false anterior ST/T changes.',
            shape: 'chest'
        },
        v3: {
            name: 'V3 Chest Lead',
            description: 'Positioned midway between V2 and V4 on a straight path.',
            placement: 'Place only after confirming accurate V2 and V4 landmarks.',
            clinical: 'Bridges anterior precordial transition.',
            ecgNote: 'Incorrect spacing affects R-wave progression interpretation.',
            shape: 'chest'
        },
        v4: {
            name: 'V4 Chest Lead',
            description: 'Placed at 5th intercostal space, midclavicular line.',
            placement: 'Identify midclavicular line first, then find 5th intercostal space.',
            clinical: 'Key for anterior wall ischemia assessment.',
            ecgNote: 'Lateral shift of V4 alters ST-segment and R-wave appearance.',
            shape: 'chest'
        },
        v5: {
            name: 'V5 Chest Lead',
            description: 'Same horizontal level as V4 at anterior axillary line.',
            placement: 'Align with V4 level and place at anterior axillary line.',
            clinical: 'Important for lateral wall monitoring.',
            ecgNote: 'Keep V4-V6 on same horizontal line for consistency.',
            shape: 'chest'
        },
        v6: {
            name: 'V6 Chest Lead',
            description: 'Same horizontal level as V4-V5 at midaxillary line.',
            placement: 'Place laterally at midaxillary line, level with V4/V5.',
            clinical: 'Completes lateral precordial coverage.',
            ecgNote: 'Useful for detecting lateral conduction and ischemic changes.',
            shape: 'chest'
        }
    };

    const engine = window.ECGEngine;

    // ======== INITIALIZATION ========
    window.addEventListener('DOMContentLoaded', init);

    function init() {
        simulateLoading();
        setupEventListeners();
        setupGlossary();
        drawECGPreviewAnimation();
        setupMuscleSelection();
        setupStepNavigation();
        setupConditionCards();
        setupSignalSpeedControl();
    }

    function simulateLoading() {
        const fill = document.querySelector('.load-fill');
        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 30 + 20;
            if (progress >= 100) {
                progress = 100;
                clearInterval(interval);
                setTimeout(() => {
                    document.getElementById('loading-screen').classList.add('fade-out');
                    document.getElementById('app').classList.remove('hidden');
                }, 200);
            }
            fill.style.width = progress + '%';
        }, 80);
    }

    // ======== NAVIGATION ========
    function setupStepNavigation() {
        // Make nav steps clickable for completed steps
        document.querySelectorAll('.nav-step').forEach(step => {
            step.addEventListener('click', () => {
                const targetStep = parseInt(step.dataset.step);
                // Allow navigation to completed steps or the next available step
                if (state.completedSteps.has(targetStep) || targetStep <= Math.max(...state.completedSteps) + 1) {
                    goToStep(targetStep);
                }
            });
        });

        // Setup prev/next buttons
        const prevBtn = document.getElementById('nav-prev-btn');
        const nextBtn = document.getElementById('nav-next-btn');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (state.currentStep > 0) {
                    goToStep(state.currentStep - 1);
                }
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                if (canProceedToNextStep()) {
                    goToStep(state.currentStep + 1);
                } else {
                    showStepRequirementMessage();
                }
            });
        }
    }

    function canProceedToNextStep() {
        switch (state.currentStep) {
            case 0: return true;
            case 1: return state.equipmentExplored.size >= 6;
            case 2: return state.prepState.placed.size >= REQUIRED_ELECTRODES.length;
            case 3: return state.calibrated;
            case 4: return state.trialsSaved >= 1;
            case 5: return true;
            default: return true;
        }
    }

    function showStepRequirementMessage() {
        const messages = {
            1: 'Please explore all 6 equipment items before proceeding.',
            2: 'Please complete all preparation steps and place all electrodes.',
            3: 'Please run the calibration test before recording.',
            4: 'Please save at least one trial recording.'
        };
        const msg = messages[state.currentStep] || 'Complete the current step first.';
        alert('⚠️ ' + msg);
    }

    function updateNavButtons() {
        const prevBtn = document.getElementById('nav-prev-btn');
        const nextBtn = document.getElementById('nav-next-btn');

        if (prevBtn) {
            prevBtn.disabled = state.currentStep === 0;
        }

        if (nextBtn) {
            nextBtn.disabled = state.currentStep >= 5;
            if (canProceedToNextStep()) {
                nextBtn.classList.add('ready');
            } else {
                nextBtn.classList.remove('ready');
            }
        }
    }

    function goToStep(step) {
        // Mark current as completed if moving forward
        const navSteps = document.querySelectorAll('.nav-step');
        if (state.currentStep < step) {
            state.completedSteps.add(state.currentStep);
            navSteps[state.currentStep].classList.remove('active');
            navSteps[state.currentStep].classList.add('completed');
        }

        // Hide all sections
        document.querySelectorAll('.lab-step').forEach(s => s.classList.remove('active'));

        // Show target
        state.currentStep = step;
        document.getElementById(`step-${step}`).classList.add('active');
        
        // Update nav steps visual
        navSteps.forEach((ns, idx) => {
            ns.classList.remove('active');
            if (state.completedSteps.has(idx)) {
                ns.classList.add('completed');
            }
        });
        navSteps[step].classList.add('active');

        // Update guide
        updateGuide(step);
        updateNavButtons();

        // Initialize step-specific content
        if (step === 3) initCalibration();
        if (step === 4) initRecording();
        if (step === 5) initAnalysis();

        window.scrollTo(0, 0);
    }

    function updateGuide(step) {
        const guideEl = document.getElementById('guide-content');
        if (!guideEl) return;
        const muscleName = state.selectedMuscle ? muscleInfo[state.selectedMuscle]?.name : 'standard ECG lead setup (RA-LA-RL)';
        const guides = {
            0: `<p>Welcome to the ECG Virtual Laboratory!</p>
                <div class="guide-step">Review the basics of ECG waveform morphology before starting the practical steps.</div>
                <div class="guide-tip">💡 Focus on identifying P wave, QRS complex, and T wave in each heartbeat cycle.</div>`,
            1: `<p>Familiarize yourself with each piece of equipment.</p>
                <div class="guide-step">Click on each item on the lab bench to learn its purpose and function.</div>
                <div class="guide-warning">⚠️ You must explore ALL 6 items before proceeding.</div>
                <div class="guide-tip">💡 In a real lab, always inspect equipment before starting any recording.</div>`,
            2: `<p>Prepare all 10 electrode sites for 12-lead ECG.</p>
                <div class="guide-step">Follow the 4-step preparation process:</div>
                <ol style="padding-left:18px; color: var(--text-secondary); font-size: 0.85rem;">
                    <li>Clean with alcohol swabs</li>
                    <li>Abrade to reduce impedance</li>
                    <li>Apply conductive gel</li>
                    <li>Place all 10 electrodes (RA, LA, RL, LL, V1-V6)</li>
                </ol>
                <div class="guide-warning">⚠️ Single drag behavior enabled: drop each prep tool once on any zone to apply to all 10 sites.</div>
                <div class="guide-tip">💡 12-lead electrode landmarks:
                    <br>• RA: Right Arm (wrist/forearm)
                    <br>• LA: Left Arm (wrist/forearm)
                    <br>• RL: Right Leg (ankle) - Ground reference
                    <br>• LL: Left Leg (ankle)
                    <br>• V1: 4th ICS right sternal border
                    <br>• V2: 4th ICS left sternal border
                    <br>• V3: Midpoint between V2 and V4
                    <br>• V4: 5th ICS midclavicular line
                    <br>• V5: Anterior axillary line (V4 level)
                    <br>• V6: Midaxillary line (V4 level)
                    <br>• Target impedance: < 5 kΩ</div>`,
            3: `<p>Configure the ECG system for optimal recording.</p>
                <div class="guide-step">Adjust gain, filters, and sampling rate, then run calibration.</div>
                <div class="guide-tip">💡 Recommended settings:
                    <br>• Gain: 1000x
                    <br>• High-pass: 0.05-0.5 Hz
                    <br>• Low-pass: 100-150 Hz
                    <br>• Notch filter: ON
                    <br>• Sampling: ≥ 500 Hz</div>`,
            4: `<p>Record ECG signals after placing ${muscleName} correctly.</p>
                <div class="guide-step">Click on a patient card to select the rhythm condition, then capture trial recordings.</div>
                <div class="guide-warning">⚠️ Record at least one trial for each condition (4 total).</div>
                <div class="guide-tip">💡 Use the speed control to slow down the signal for detailed observation.
                    <br>• Normal: regular RR and sinus morphology
                    <br>• Tachycardia: shortened RR intervals
                    <br>• Bradycardia: prolonged RR intervals
                    <br>• Irregular pattern: variable RR intervals</div>`,
            5: `<p>Analyze your recorded data using signal processing techniques.</p>
                <div class="guide-step">Explore all 4 analysis tabs:
                    <br>1. Time Domain
                    <br>2. Frequency Domain (FFT)
                    <br>3. RMS Envelope
                    <br>4. Comparison View</div>
                <div class="guide-tip">💡 Key ECG checks:
                    <br>• Measure RR intervals
                    <br>• Compute heart rate (60000 / mean RR)
                    <br>• Compare normal vs abnormal rhythm behavior</div>`
        };
        guideEl.innerHTML = guides[step] || '';
    }

    // ======== LEAD SELECTION (Step 2) ========
    function setupMuscleSelection() {
        document.querySelectorAll('.muscle-region').forEach(region => {
            region.addEventListener('click', () => handleMuscleClick(region));
            region.addEventListener('mouseenter', () => highlightMuscle(region, true));
            region.addEventListener('mouseleave', () => highlightMuscle(region, false));
        });

        const selectBtn = document.getElementById('select-muscle-btn');
        if (selectBtn) {
            selectBtn.addEventListener('click', confirmMuscleSelection);
        }

        const changeBtn = document.getElementById('change-muscle-btn');
        if (changeBtn) {
            changeBtn.addEventListener('click', () => {
                document.getElementById('muscle-selection-panel').classList.remove('hidden');
                document.getElementById('prep-workspace').classList.add('hidden');
                state.selectedMuscle = null;
                resetPrepState();
            });
        }
    }

    function highlightMuscle(region, highlight) {
        if (highlight) {
            region.classList.add('hovered');
        } else {
            region.classList.remove('hovered');
        }
    }

    function handleMuscleClick(region) {
        const muscleType = region.dataset.muscle;
        const muscleName = region.dataset.name;

        // Remove selection from all
        document.querySelectorAll('.muscle-region').forEach(r => r.classList.remove('selected'));
        region.classList.add('selected');

        // Show muscle details
        const info = muscleInfo[muscleType];
        if (!info) return;

        document.querySelector('.muscle-placeholder')?.classList.add('hidden');
        const details = document.getElementById('muscle-details');
        details.classList.remove('hidden');
        document.getElementById('selected-muscle-name').textContent = muscleName;

        const infoText = document.getElementById('muscle-info-text');
        infoText.innerHTML = `
            <p><strong>Description:</strong> ${info.description}</p>
            <p><strong>Electrode Placement:</strong> ${info.placement}</p>
            <p><strong>Clinical Significance:</strong> ${info.clinical}</p>
            <p><strong>ECG Note:</strong> ${info.ecgNote}</p>
        `;

        // Update muscle diagram
        const diagram = document.getElementById('muscle-diagram');
        diagram.className = 'muscle-diagram ' + info.shape;

        state.selectedMuscle = muscleType;
    }

    function confirmMuscleSelection() {
        if (!state.selectedMuscle) {
            alert('Please select a lead region first.');
            return;
        }

        const info = muscleInfo[state.selectedMuscle];
        document.getElementById('muscle-selection-panel').classList.add('hidden');
        document.getElementById('prep-workspace').classList.remove('hidden');
        document.getElementById('prep-muscle-name').textContent = info.name;
        document.getElementById('muscle-label-text').textContent = info.name;

        updateGuide(2);
    }

    function resetPrepState() {
        state.prepState = {
            currentPhase: 'clean',
            cleaned: new Set(),
            abraded: new Set(),
            gelled: new Set(),
            placed: new Set(),
            validationScores: {},
            placementQuality: 0,
            selectedElectrode: null
        };
        // Reset visual states
        document.querySelectorAll('.prep-zone').forEach(z => {
            z.classList.remove('cleaned', 'abraded', 'gelled', 'electrode-placed');
        });
        document.querySelectorAll('.dot').forEach(d => d.classList.remove('done'));
        document.querySelectorAll('.tool-step').forEach(s => {
            s.classList.remove('active', 'completed');
        });
        document.getElementById('prep-step-1').classList.add('active');
        document.querySelectorAll('.electrode-target').forEach(t => t.classList.add('hidden'));
        document.querySelectorAll('.electrode-pick').forEach(e => e.classList.remove('placed'));
        document.getElementById('prep-next-btn').classList.add('hidden');
        document.getElementById('impedance-display').classList.add('hidden');
        const validationPanel = document.getElementById('validation-panel');
        if (validationPanel) validationPanel.classList.add('hidden');
        const threadLayer = document.getElementById('electrode-thread-layer');
        if (threadLayer) threadLayer.innerHTML = '';
    }

    // ======== CONDITION CARDS (Step 4) ========
    function setupConditionCards() {
        document.querySelectorAll('.condition-card').forEach(card => {
            card.addEventListener('click', () => {
                document.querySelectorAll('.condition-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                const condition = card.dataset.condition;
                state.currentCondition = condition;
                document.getElementById('condition-select').value = condition;
                updateConditionInfo();
            });
        });
    }

    // ======== SIGNAL SPEED CONTROL ========
    function setupSignalSpeedControl() {
        document.querySelectorAll('.speed-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.signalSpeed = parseFloat(btn.dataset.speed);
            });
        });
    }

    // ======== EVENT LISTENERS ========
    function setupEventListeners() {
        // Start button
        document.getElementById('start-lab-btn').addEventListener('click', () => {
            goToStep(1);
        });

        // Global reset button
        const resetBtn = document.getElementById('reset-lab-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                const confirmed = window.confirm('Reset the lab and clear current progress?');
                if (confirmed) {
                    window.location.reload();
                }
            });
        }

        // Equipment items
        document.querySelectorAll('.equipment-item').forEach(item => {
            item.addEventListener('click', () => handleEquipmentClick(item));
        });

        // Equipment next
        document.getElementById('equip-next-btn').addEventListener('click', () => {
            goToStep(2);
        });

        // Prep — drag and drop
        setupPrepDragDrop();

        // Prep next
        document.getElementById('prep-next-btn').addEventListener('click', () => {
            goToStep(3);
        });

        // Calibration controls
        document.getElementById('gain-slider').addEventListener('input', updateCalibDisplay);
        document.getElementById('hp-filter').addEventListener('input', updateCalibDisplay);
        document.getElementById('lp-filter').addEventListener('input', updateCalibDisplay);
        document.getElementById('notch-on').addEventListener('click', () => toggleNotch(true));
        document.getElementById('notch-off').addEventListener('click', () => toggleNotch(false));
        document.getElementById('sampling-rate').addEventListener('change', updateCalibDisplay);
        document.getElementById('run-calib-btn').addEventListener('click', runCalibration);
        document.getElementById('calib-next-btn').addEventListener('click', () => {
            goToStep(4);
        });

        // Recording controls
        document.getElementById('condition-select').addEventListener('change', (e) => {
            state.currentCondition = e.target.value;
            updateConditionInfo();
        });
        document.querySelectorAll('.contract-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.contract-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                const type = e.target.dataset.type;
                const forces = { rest: 0, light: 25, moderate: 50, max: 100 };
                state.forceLevel = forces[type];
                document.getElementById('force-slider').value = state.forceLevel;
                updateForceGauge();
            });
        });
        document.getElementById('force-slider').addEventListener('input', (e) => {
            state.forceLevel = parseInt(e.target.value);
            updateForceGauge();
            // Update active contraction button
            document.querySelectorAll('.contract-btn').forEach(b => b.classList.remove('active'));
        });
        document.getElementById('record-btn').addEventListener('click', startRecording);
        document.getElementById('stop-btn').addEventListener('click', stopRecording);
        document.getElementById('save-btn').addEventListener('click', saveTrial);
        document.getElementById('rec-next-btn').addEventListener('click', () => {
            goToStep(5);
        });

        // Analysis tabs
        document.querySelectorAll('.analysis-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const clickedTab = e.target.closest('.analysis-tab');
                if (!clickedTab) return;
                document.querySelectorAll('.analysis-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.analysis-panel').forEach(p => p.classList.remove('active'));
                clickedTab.classList.add('active');
                document.getElementById(`panel-${clickedTab.dataset.tab}`).classList.add('active');
                renderAnalysisTab(clickedTab.dataset.tab);
            });
        });

        document.getElementById('trial-select-time').addEventListener('change', () => renderAnalysisTab('time'));
        document.getElementById('trial-select-freq').addEventListener('change', () => renderAnalysisTab('frequency'));
        document.getElementById('time-zoom').addEventListener('input', () => renderAnalysisTab('time'));
        document.getElementById('fft-window').addEventListener('change', () => renderAnalysisTab('frequency'));
        document.getElementById('rms-window').addEventListener('input', (e) => {
            document.getElementById('rms-window-val').textContent = e.target.value + 'ms';
            renderAnalysisTab('rms');
        });

        // Download buttons
        document.getElementById('download-results-btn').addEventListener('click', downloadResultsReport);
        document.getElementById('download-data-btn').addEventListener('click', downloadRawDataCSV);

        // Glossary
        document.getElementById('glossary-btn').addEventListener('click', () => {
            document.getElementById('glossary-modal').classList.remove('hidden');
        });
        document.getElementById('close-glossary').addEventListener('click', () => {
            document.getElementById('glossary-modal').classList.add('hidden');
        });
    }

    // ======== ECG PREVIEW ANIMATION (Intro) ========
    function drawECGPreviewAnimation() {
        const canvas = document.getElementById('ecg-preview-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let offset = 0;

        function animate() {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Grid
            ctx.strokeStyle = '#1a2a3a';
            ctx.lineWidth = 0.5;
            for (let x = 0; x < canvas.width; x += 30) {
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
            }
            for (let y = 0; y < canvas.height; y += 30) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
            }

            // Draw simplified moving ECG cycle preview.
            ctx.strokeStyle = '#22d3ee';
            ctx.lineWidth = 2;
            ctx.shadowColor = '#22d3ee';
            ctx.shadowBlur = 6;
            ctx.beginPath();

            const centerY = canvas.height / 2;
            for (let x = 0; x < canvas.width; x++) {
                const t = (x + offset) / canvas.width;
                const phase1 = Math.exp(-Math.pow((t - 0.3) / 0.05, 2)) * 50;
                const phase2 = -Math.exp(-Math.pow((t - 0.4) / 0.06, 2)) * 80;
                const phase3 = Math.exp(-Math.pow((t - 0.52) / 0.05, 2)) * 35;
                const noise = (Math.random() - 0.5) * 2;
                const y = centerY - (phase1 + phase2 + phase3 + noise);

                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.shadowBlur = 0;

            offset += 0.5;
            if (offset > canvas.width) offset = 0;

            requestAnimationFrame(animate);
        }
        animate();
    }

    // ======== EQUIPMENT (Step 1) ========
    const equipmentInfo = {
        'equip-ecg': {
            name: 'ECG Amplifier System',
            html: `<h4>Purpose</h4>
            <p>Amplifies the tiny electrical signals (50 µV - 3 mV typical for surface ECG) generated by the heart to measurable levels.</p>
            <h4>Key Specifications</h4>
            <ul>
                <li><strong>Input Impedance:</strong> > 100 MΩ (to minimize signal loss)</li>
                <li><strong>CMRR:</strong> > 80 dB (Common Mode Rejection Ratio — rejects noise picked up by both electrodes)</li>
                <li><strong>Gain:</strong> 100x - 10,000x adjustable</li>
                <li><strong>Bandwidth:</strong>
                    <br>• Surface ECG: 20 – 450 Hz
                    <br>• Needle ECG: 10 Hz – 5 kHz</li>
            </ul>
            <h4>How It Works</h4>
            <p>Uses a <strong>differential amplifier</strong> — subtracts the signal at the reference electrode from the active electrode, amplifying only the difference (which is the ECG signal).</p>`
        },
        'equip-electrodes': {
            name: 'Surface Electrodes (Ag/AgCl)',
            html: `<h4>Purpose</h4>
            <p>Detect voltage changes on the skin surface caused by cardiac electrical activity.</p>
            <h4>Three Electrode Configuration</h4>
            <ul>
                <li><strong>RA:</strong> Right arm limb lead</li>
                <li><strong>LA:</strong> Left arm limb lead</li>
                <li><strong>RL (Ground):</strong> Right leg reference/ground</li>
            </ul>
            <h4>Material: Silver/Silver Chloride (Ag/AgCl)</h4>
            <p>Provides stable electrode-skin interface with low noise and minimal polarization artifact. The AgCl layer acts as a reversible electrode.</p>
            <h4>Inter-Electrode Distance</h4>
            <p>For limb-lead ECG, use standard anatomical sites and maintain consistent bilateral placement for repeatability.</p>`
        },
        'equip-gel': {
            name: 'Conductive Gel',
            html: `<h4>Purpose</h4>
            <p>Reduces the electrode-skin impedance by filling microscopic gaps between the electrode and skin surface.</p>
            <h4>Composition</h4>
            <ul>
                <li>Electrolyte solution (NaCl or KCl based)</li>
                <li>Viscosity agent (to keep it in place)</li>
                <li>pH balanced for skin compatibility</li>
            </ul>
            <h4>Why It Matters</h4>
            <p>Without gel, impedance can be > 100 kΩ, causing severe signal degradation. With gel, impedance drops to < 5 kΩ.</p>
            <h4>Application Tip</h4>
            <p>Apply a thin, even layer. Too much gel can create a "bridge" between electrodes, short-circuiting the signal.</p>`
        },
        'equip-swabs': {
            name: 'Alcohol Swabs (70% Isopropyl)',
            html: `<h4>Purpose</h4>
            <p>Clean the skin surface to remove oils, dead skin cells, lotions, and contaminants that increase impedance.</p>
            <h4>Why 70% Alcohol?</h4>
            <ul>
                <li>Effective at dissolving skin oils</li>
                <li>Evaporates quickly</li>
                <li>Mild disinfectant properties</li>
                <li>70% is more effective than 99% (water helps penetration)</li>
            </ul>
            <h4>Technique</h4>
            <p>Rub firmly in circular motions for 3-5 seconds per site. Allow to dry completely before electrode placement (wet alcohol increases impedance!).</p>`
        },
        'equip-daq': {
            name: 'Data Acquisition System (DAQ)',
            html: `<h4>Purpose</h4>
            <p>Converts the analog ECG signal to digital data for computer analysis and storage.</p>
            <h4>Key Parameters</h4>
            <ul>
                <li><strong>ADC Resolution:</strong> 12-24 bits (higher = more precise amplitude measurement)</li>
                <li><strong>Sampling Rate:</strong>
                    <br>• Surface ECG: <strong>1000 Hz minimum, 2000 Hz preferred</strong>
                    <br>• Needle ECG: <strong>10 kHz recommended</strong></li>
                <li><strong>Input Channels:</strong> 1-64+ simultaneous channels</li>
            </ul>
            <h4>Bandwidth Settings</h4>
            <ul>
                <li><strong>Surface ECG:</strong> 20 – 450 Hz</li>
                <li><strong>Needle ECG:</strong> 10 Hz – 5 kHz</li>
            </ul>
            <h4>Software</h4>
            <p>Records raw data, applies digital filters, and provides real-time visualization. Common software: LabChart, Spike2, MATLAB.</p>
            <h4>Nyquist Theorem</h4>
            <p>Sampling rate must be at least 2× the highest frequency of interest. For surface ECG (up to 450 Hz), minimum 1000 Hz sampling.</p>`
        },
        'equip-abrasive': {
            name: 'Abrasive Skin Prep Pads',
            html: `<h4>Purpose</h4>
            <p>Gently remove the outermost layer of dead skin cells (stratum corneum) which acts as an electrical insulator.</p>
            <h4>Why Abrasion?</h4>
            <ul>
                <li>The stratum corneum has very high electrical resistance</li>
                <li>Abrasion can reduce impedance from >200 kΩ to <5 kΩ</li>
                <li>More effective than alcohol alone</li>
            </ul>
            <h4>Technique</h4>
            <p>Light, circular rubbing for 3-5 seconds. Skin should appear slightly pink (increased blood flow) but NOT red or irritated.</p>
            <h4>Safety Note</h4>
            <p>Do not abrade broken skin, rashes, or sensitive areas. Always check for skin allergies first.</p>`
        }
    };

    function handleEquipmentClick(item) {
        const id = item.id;
        const info = equipmentInfo[id];
        if (!info) return;

        // Mark explored
        item.classList.add('explored');
        state.equipmentExplored.add(id);

        // Show info
        document.querySelector('.info-placeholder').classList.add('hidden');
        const details = document.getElementById('equip-details');
        details.classList.remove('hidden');
        document.getElementById('equip-detail-name').textContent = info.name;
        document.getElementById('equip-detail-body').innerHTML = info.html;

        // Update progress
        const count = state.equipmentExplored.size;
        document.getElementById('equip-progress').textContent = `${count} / 6 explored`;

        if (count >= 6) {
            document.getElementById('equip-next-btn').classList.remove('hidden');
        }
    }

    function setupPrepDragDrop() {
        const zones = document.querySelectorAll('.prep-zone');
        const armContainer = document.getElementById('arm-container');

        // Single-drag prep behavior: dropping current prep tool on any zone applies phase to all sites.
        zones.forEach(zone => {
            zone.addEventListener('dragenter', (e) => {
                e.preventDefault();
                zone.classList.add('drag-hover');
            });
            zone.addEventListener('dragleave', () => {
                zone.classList.remove('drag-hover');
            });
            zone.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
            });
            zone.addEventListener('drop', (e) => {
                e.preventDefault();
                zone.classList.remove('drag-hover');
                const isElectrode = e.dataTransfer.types.includes('electrode-type');
                if (isElectrode) return;
                applyPrepPhaseGlobally(state.prepState.currentPhase);
            });
        });

        // Fallback: drop on container
        armContainer.addEventListener('dragover', (e) => {
            const isElectrode = e.dataTransfer.types.includes('electrode-type');
            if (!isElectrode) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
            }
        });

        armContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            zones.forEach(z => z.classList.remove('drag-hover'));

            const isElectrode = e.dataTransfer.types.includes('electrode-type');
            if (!isElectrode) {
                applyPrepPhaseGlobally(state.prepState.currentPhase);
            }
        });

        // Add visual feedback when dragging tools
        const draggables = document.querySelectorAll('.tool-icon.draggable');
        draggables.forEach(drag => {
            drag.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', drag.id);
                drag.classList.add('dragging');
                e.dataTransfer.setData('prep-tool', drag.id);
                console.log('prep dragstart tool:', drag.id, 'phase:', state.prepState.currentPhase);
                highlightValidZones(state.prepState.currentPhase);
            });
            drag.addEventListener('dragend', () => {
                drag.classList.remove('dragging');
                zones.forEach(z => z.classList.remove('drag-hover', 'valid-target'));
            });
        });
    }

    function highlightValidZones(phase) {
        const prep = state.prepState;
        const zones = document.querySelectorAll('.prep-zone');
        
        zones.forEach(zone => {
            const zoneType = zone.dataset.zone;
            let isValid = false;
            
            if (phase === 'clean' && !prep.cleaned.has(zoneType)) {
                isValid = true;
            } else if (phase === 'abrade' && prep.cleaned.has(zoneType) && !prep.abraded.has(zoneType)) {
                isValid = true;
            } else if (phase === 'gel' && prep.abraded.has(zoneType) && !prep.gelled.has(zoneType)) {
                isValid = true;
            }
            
            if (isValid) {
                zone.classList.add('valid-target');
            }
        });
    }

    function applyPrepPhaseGlobally(phase) {
        if (!['clean', 'abrade', 'gel'].includes(phase)) return;
        const prep = state.prepState;

        if (phase === 'clean' && prep.cleaned.size === 0) {
            REQUIRED_ELECTRODES.forEach(zoneType => {
                prep.cleaned.add(zoneType);
                updateZoneVisual(zoneType, 'cleaned');
            });
            updatePrepDot('clean', 1);
            advancePrepPhase('abrade');
            return;
        }

        if (phase === 'abrade' && prep.cleaned.size === REQUIRED_ELECTRODES.length && prep.abraded.size === 0) {
            REQUIRED_ELECTRODES.forEach(zoneType => {
                prep.abraded.add(zoneType);
                updateZoneVisual(zoneType, 'abraded');
            });
            updatePrepDot('abrade', 1);
            showImpedance('final');
            advancePrepPhase('gel');
            return;
        }

        if (phase === 'gel' && prep.abraded.size === REQUIRED_ELECTRODES.length && prep.gelled.size === 0) {
            REQUIRED_ELECTRODES.forEach(zoneType => {
                prep.gelled.add(zoneType);
                updateZoneVisual(zoneType, 'gelled');
            });
            updatePrepDot('gel', 1);
            advancePrepPhase('place');
        }
    }

    function updateZoneVisual(zoneType, className) {
        const zones = {
            ra: 'prep-zone-ra', la: 'prep-zone-la', rl: 'prep-zone-rl', ll: 'prep-zone-ll',
            v1: 'prep-zone-v1', v2: 'prep-zone-v2', v3: 'prep-zone-v3', v4: 'prep-zone-v4', v5: 'prep-zone-v5', v6: 'prep-zone-v6'
        };
        const el = document.getElementById(zones[zoneType]);
        if (!el) {
            console.error('Zone element not found:', zones[zoneType]);
            return;
        }
        el.classList.remove('cleaned', 'abraded', 'gelled', 'electrode-placed');
        el.classList.add(className);
        
        // Trigger micro-animations
        if (className === 'cleaned') {
            triggerCleanAnimation(zoneType);
        } else if (className === 'abraded') {
            triggerAbradeAnimation(zoneType);
        } else if (className === 'gelled') {
            triggerGelAnimation(zoneType);
        }
    }

    function updatePrepDot(phase, count) {
        for (let i = 1; i <= count; i++) {
            const dot = document.getElementById(`${phase}-dot-${i}`);
            if (dot) {
                dot.classList.add('done');
                // Also mark parent substep-item as done
                const parent = dot.closest('.substep-item');
                if (parent) parent.classList.add('done');
            }
        }
        
        // Update site-dots in collapsible header
        const siteDots = document.querySelectorAll(`#prep-step-${getPhaseStepNum(phase)} .site-dots .dot`);
        siteDots.forEach((dot, i) => {
            if (i < count) dot.classList.add('done');
        });
    }
    
    function getPhaseStepNum(phase) {
        const phases = { clean: 1, abrade: 2, gel: 3, place: 4 };
        return phases[phase];
    }

    function advancePrepPhase(newPhase) {
        console.log('>>> Advancing to phase:', newPhase);
        state.prepState.currentPhase = newPhase;

        // Update collapsible step cards
        document.querySelectorAll('.collapsible-step').forEach(s => {
            s.classList.remove('active');
            if (s.dataset.step === newPhase) {
                s.classList.add('active');
                console.log('Activated collapsible step:', newPhase);
            }
        });
        
        // Also update old tool-step classes if they exist
        document.querySelectorAll('.tool-step').forEach(s => {
            s.classList.remove('active');
            if (s.dataset.step === newPhase) s.classList.add('active');
        });

        // Mark previous as completed
        const phases = ['clean', 'abrade', 'gel', 'place'];
        const idx = phases.indexOf(newPhase);
        for (let i = 0; i < idx; i++) {
            const stepEl = document.getElementById(`prep-step-${i + 1}`);
            if (stepEl) {
                stepEl.classList.add('completed');
                console.log('Marked completed: prep-step-' + (i + 1));
            }
        }
        
        // Update horizontal progress bar
        updatePrepProgressBar(newPhase);

        // If place phase, setup electrode dragging
        if (newPhase === 'place') {
            console.log('Setting up electrode placement handlers...');
            setTimeout(() => {
                setupElectrodePlacement();
                console.log('Electrode placement handlers initialized');
            }, 100);
        }
    }

    function setupElectrodePlacement() {
        const zones = document.querySelectorAll('.prep-zone');
        const trayElectrodes = document.querySelectorAll('.electrode-pick');
        const phase = state.prepState.currentPhase;

        if (phase !== 'place') return;

        initValidationPanel();
        console.log('Setting up electrode placement (tap electrode to auto-attach) for 10 electrodes');

        function setSelectedElectrode(type) {
            state.prepState.selectedElectrode = type;
            trayElectrodes.forEach(el => {
                if (el.dataset.type === type) el.classList.add('selected');
                else el.classList.remove('selected');
            });

            const messageEl = document.getElementById('summary-message');
            if (messageEl) {
                messageEl.innerHTML = `<p>${type.toUpperCase()} selected. Tap again to attach automatically to ${type.toUpperCase()} zone.</p>`;
            }
        }

        function clearSelectedElectrode() {
            state.prepState.selectedElectrode = null;
            trayElectrodes.forEach(el => el.classList.remove('selected'));
        }

        function attemptPlace(electrodeType, zoneType, zoneElement) {
            if (!electrodeType || !zoneType) return;

            if (electrodeType !== zoneType) {
                if (zoneElement) {
                    zoneElement.classList.add('wrong-target');
                    setTimeout(() => zoneElement.classList.remove('wrong-target'), 700);
                }
                showPlacementHint(electrodeType, zoneType);
                validateElectrodePlacement(electrodeType, false);
                return;
            }

            if (state.prepState.placed.has(zoneType)) {
                clearSelectedElectrode();
                return;
            }

            state.prepState.placed.add(zoneType);
            updateZoneVisual(zoneType, 'electrode-placed');
            validateElectrodePlacement(zoneType, true);
            drawElectrodeThread(zoneType);

            const pick = document.querySelector(`.electrode-pick[data-type="${zoneType}"]`);
            if (pick) {
                pick.classList.add('placed');
                pick.classList.remove('selected');
            }

            const dot = document.getElementById(`place-dot-${zoneType}`);
            if (dot) dot.classList.add('done');

            triggerElectrodePlacement(zoneType);
            clearSelectedElectrode();

            if (state.prepState.placed.size >= REQUIRED_ELECTRODES.length) {
                showValidationPanel();
                const nextBtn = document.getElementById('prep-next-btn');
                if (nextBtn) nextBtn.classList.remove('hidden');
                const prepStep4 = document.getElementById('prep-step-4');
                if (prepStep4) prepStep4.classList.add('completed');
                showImpedance('final');
            }
        }

        trayElectrodes.forEach(electrode => {
            electrode.setAttribute('draggable', 'false');
            electrode.ondragstart = (ev) => {
                if (electrode.classList.contains('placed')) {
                    ev.preventDefault();
                    return;
                }
                ev.dataTransfer.effectAllowed = 'move';
                ev.dataTransfer.setData('electrode-type', electrode.dataset.type);
                ev.dataTransfer.setData('text/plain', electrode.dataset.type);
                electrode.classList.add('dragging');
                setSelectedElectrode(electrode.dataset.type);
            };
            electrode.ondragend = () => electrode.classList.remove('dragging');
            electrode.onpointerdown = (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                if (electrode.classList.contains('placed')) return;
                const electrodeType = electrode.dataset.type;
                setSelectedElectrode(electrodeType);
                const zoneEl = document.getElementById(`prep-zone-${electrodeType}`);
                attemptPlace(electrodeType, electrodeType, zoneEl);
            };
            electrode.onclick = (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                if (electrode.classList.contains('placed')) return;
                const electrodeType = electrode.dataset.type;
                if (!state.prepState.placed.has(electrodeType)) {
                    setSelectedElectrode(electrodeType);
                    const zoneEl = document.getElementById(`prep-zone-${electrodeType}`);
                    attemptPlace(electrodeType, electrodeType, zoneEl);
                }
            };
        });

        zones.forEach(zone => {
            zone.ondragover = (ev) => {
                ev.preventDefault();
                if (state.prepState.currentPhase !== 'place') return;
                zone.classList.add('drag-hover');
            };
            zone.ondragleave = () => {
                zone.classList.remove('drag-hover');
            };
            zone.ondrop = (ev) => {
                ev.preventDefault();
                zone.classList.remove('drag-hover');
                if (state.prepState.currentPhase !== 'place') return;

                const electrodeType = ev.dataTransfer.getData('electrode-type') || ev.dataTransfer.getData('text/plain');
                const zoneType = zone.dataset.zone;
                attemptPlace(electrodeType, zoneType, zone);
            };
            zone.onclick = (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                if (state.prepState.currentPhase !== 'place') return;
                const zoneType = zone.dataset.zone;
                const selectedElectrodeType = state.prepState.selectedElectrode;
                if (!selectedElectrodeType) {
                    const messageEl = document.getElementById('summary-message');
                    if (messageEl) {
                        messageEl.innerHTML = '<p>Tap any electrode in the tray. It will auto-attach to the matching body zone.</p>';
                    }
                    return;
                }
                attemptPlace(selectedElectrodeType, zoneType, zone);
            };
        });
    }

    function drawElectrodeThread(zoneType) {
        const threadLayer = document.getElementById('electrode-thread-layer');
        if (!threadLayer) return;

        const zonePositions = {
            ra: { x: 500, y: 200 }, la: { x: 100, y: 200 }, rl: { x: 350, y: 600 }, ll: { x: 250, y: 600 },
            v1: { x: 270, y: 175 }, v2: { x: 330, y: 175 }, v3: { x: 345, y: 205 }, v4: { x: 360, y: 230 }, v5: { x: 390, y: 230 }, v6: { x: 420, y: 230 }
        };

        const idx = REQUIRED_ELECTRODES.indexOf(zoneType);
        const startX = 560;
        const startY = 100 + (idx * 18);
        const target = zonePositions[zoneType];
        if (!target) return;

        const existing = threadLayer.querySelector(`line[data-zone="${zoneType}"]`);
        if (existing) existing.remove();

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('class', 'electrode-thread');
        line.setAttribute('data-zone', zoneType);
        line.setAttribute('x1', startX);
        line.setAttribute('y1', startY);
        line.setAttribute('x2', target.x);
        line.setAttribute('y2', target.y);
        threadLayer.appendChild(line);
    }

    function showPlacementHint(electrodeType, zoneType) {
        const target = electrodeType.toUpperCase();
        const droppedOn = zoneType.toUpperCase();
        const messageEl = document.getElementById('summary-message');
        if (messageEl) {
            messageEl.innerHTML = `<p>Incorrect drop: ${target} cannot be placed on ${droppedOn}. Place ${target} on the ${target} zone.</p>`;
        }
    }

    function initValidationPanel() {
        const validationChecks = document.getElementById('validation-checks');
        if (!validationChecks) return;

        validationChecks.innerHTML = REQUIRED_ELECTRODES.map(type => {
            const label = type.toUpperCase();
            return `<div class="validation-item" id="validate-${type}">
                <div class="validate-icon"><i class="fas fa-circle"></i></div>
                <div class="validate-label">
                    <strong>${label}</strong>
                    <span class="validate-details">Awaiting placement</span>
                </div>
                <div class="validate-status">
                    <span class="status-correct"><i class="fas fa-check"></i> Correct</span>
                    <span class="status-incorrect"><i class="fas fa-times"></i> Incorrect</span>
                </div>
            </div>`;
        }).join('');
    }

    function validateElectrodePlacement(type, isCorrect) {
        if (!state.prepState.validationScores) {
            state.prepState.validationScores = {};
        }
        state.prepState.validationScores[type] = isCorrect ? 100 : 0;
        updateValidationUI(type, isCorrect);
    }

    function updateValidationUI(type, isCorrect) {
        const validationItem = document.getElementById(`validate-${type}`);
        if (!validationItem) return;

        validationItem.classList.remove('correct', 'incorrect');
        validationItem.classList.add(isCorrect ? 'correct' : 'incorrect');

        const statusDiv = validationItem.querySelector('.validate-status');
        if (statusDiv) {
            statusDiv.classList.add('visible');
            const ok = statusDiv.querySelector('.status-correct');
            const bad = statusDiv.querySelector('.status-incorrect');
            if (ok) ok.style.display = isCorrect ? 'inline-flex' : 'none';
            if (bad) bad.style.display = isCorrect ? 'none' : 'inline-flex';
        }

        const icon = validationItem.querySelector('.validate-icon i');
        if (icon) {
            icon.className = isCorrect ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
        }

        updatePlacementQualityScore();
    }

    function showValidationPanel() {
        const panel = document.getElementById('validation-panel');
        if (panel) {
            panel.classList.remove('hidden');
            panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function updatePlacementQualityScore() {
        if (!state.prepState.validationScores) return;

        const scores = REQUIRED_ELECTRODES.map(type => state.prepState.validationScores[type] || 0);
        const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

        const scoreEl = document.getElementById('placement-quality');
        if (scoreEl) scoreEl.textContent = avg + '%';

        const messageEl = document.getElementById('summary-message');
        if (messageEl) {
            let message = '';
            if (avg === 100) {
                message = '✓ Perfect placement. All 10 electrodes are correctly positioned.';
            } else if (avg >= 80) {
                message = '⚠ Almost there. Review highlighted incorrect electrodes for correction.';
            } else {
                message = '⚠ Multiple electrodes are incorrect. Signal quality will be poor until corrected.';
            }
            messageEl.innerHTML = `<p>${message}</p>`;
        }

        state.prepState.placementQuality = avg;
        console.log('Placement Quality Score:', avg + '%');
    }

    function showImpedance(zone) {
        const display = document.getElementById('impedance-display');
        if (display) display.classList.remove('hidden');

        let impedance;
        if (zone === 'final') {
            impedance = 2.5 + Math.random() * 2;
        } else {
            impedance = 15 - state.prepState.abraded.size * 4 + Math.random() * 2;
        }

        // Update old impedance display if it exists
        const el = document.getElementById('imp-value');
        if (el) el.textContent = impedance.toFixed(1) + ' kΩ';

        const fill = document.getElementById('imp-fill');
        if (fill) {
            const pct = Math.max(0, Math.min(100, (1 - impedance / 20) * 100));
            fill.style.width = pct + '%';
            fill.style.background = impedance < 5 ? 'var(--success)' : impedance < 10 ? 'var(--warning)' : 'var(--danger)';
        }

        const status = document.getElementById('imp-status');
        if (status) {
            if (impedance < 5) {
                status.textContent = '✓ Good — Below 5 kΩ threshold';
                status.style.color = 'var(--success)';
            } else if (impedance < 10) {
                status.textContent = '⚠ Acceptable — Could be better';
                status.style.color = 'var(--warning)';
            } else {
                status.textContent = '✗ Too high — Continue preparation';
                status.style.color = 'var(--danger)';
            }
        }
        
        // Update floating impedance indicator
        updateFloatingImpedance(impedance);
    }

    // ======== CALIBRATION (Step 3) ========
    let calibCtx, calibAnimFrame;

    function initCalibration() {
        const canvas = document.getElementById('calib-canvas');
        calibCtx = canvas.getContext('2d');
        drawCalibBaseline();
    }

    function updateCalibDisplay() {
        document.getElementById('gain-display').textContent = document.getElementById('gain-slider').value + 'x';
        document.getElementById('hp-display').textContent = document.getElementById('hp-filter').value + ' Hz';
        document.getElementById('lp-display').textContent = document.getElementById('lp-filter').value + ' Hz';
    }

    function toggleNotch(on) {
        document.getElementById('notch-on').classList.toggle('active', on);
        document.getElementById('notch-off').classList.toggle('active', !on);
    }

    function drawCalibBaseline() {
        if (!calibCtx) return;
        const canvas = calibCtx.canvas;
        calibCtx.fillStyle = '#000';
        calibCtx.fillRect(0, 0, canvas.width, canvas.height);
        drawGrid(calibCtx, canvas.width, canvas.height);

        // Flat baseline with noise
        calibCtx.strokeStyle = '#22d3ee';
        calibCtx.lineWidth = 1.5;
        calibCtx.beginPath();
        const centerY = canvas.height / 2;
        for (let x = 0; x < canvas.width; x++) {
            const noise = (Math.random() - 0.5) * 4;
            const y = centerY + noise;
            if (x === 0) calibCtx.moveTo(x, y);
            else calibCtx.lineTo(x, y);
        }
        calibCtx.stroke();
    }

    function runCalibration() {
        const canvas = document.getElementById('calib-canvas');
        const ctx = canvas.getContext('2d');
        const notchOn = document.getElementById('notch-on').classList.contains('active');
        const gain = parseInt(document.getElementById('gain-slider').value);
        const hp = parseInt(document.getElementById('hp-filter').value);
        const lp = parseInt(document.getElementById('lp-filter').value);
        const sr = parseInt(document.getElementById('sampling-rate').value);

        let frame = 0;
        const totalFrames = 180;

        function animateCalib() {
            frame++;
            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            drawGrid(ctx, canvas.width, canvas.height);

            const centerY = canvas.height / 2;
            ctx.strokeStyle = '#22d3ee';
            ctx.lineWidth = 1.5;
            ctx.shadowColor = '#22d3ee';
            ctx.shadowBlur = 3;
            ctx.beginPath();

            for (let x = 0; x < canvas.width; x++) {
                let noise = (Math.random() - 0.5) * 8;
                // Add 50Hz noise if notch off
                if (!notchOn) {
                    noise += Math.sin(x * 0.1 + frame * 0.3) * 20;
                }
                // Gain effect
                noise *= (gain / 1000);
                const y = centerY + noise;
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Update readouts progressively
            if (frame > 30) {
                const baseNoise = notchOn ? 3.2 : 18.5;
                const noiseRMS = (baseNoise * gain / 1000).toFixed(1);
                document.getElementById('baseline-val').textContent = (Math.random() * 2 - 1).toFixed(1) + ' µV';
                document.getElementById('noise-val').textContent = noiseRMS + ' µV RMS';
                document.getElementById('calib-imp-val').textContent = (3 + Math.random()).toFixed(1) + ' kΩ';
                const snr = notchOn ? (35 + Math.random() * 10).toFixed(0) : (12 + Math.random() * 5).toFixed(0);
                document.getElementById('snr-val').textContent = snr + ' dB';
            }

            if (frame < totalFrames) {
                requestAnimationFrame(animateCalib);
            } else {
                state.calibrated = true;
                document.getElementById('calib-next-btn').classList.remove('hidden');
                updateNavButtons();
            }
        }

        animateCalib();
    }

    // ======== RECORDING (Step 4) ========
    let ecgCtx, ecgAnimFrame;

    function initRecording() {
        const canvas = document.getElementById('ecg-canvas');
        if (!canvas) {
            console.error('ECG canvas not found');
            return;
        }
        // Ensure canvas has proper dimensions
        canvas.width = 900;
        canvas.height = 300;
        ecgCtx = canvas.getContext('2d');
        if (!ecgCtx) {
            console.error('Could not get canvas context');
            return;
        }
        state.signalBuffer = [];
        state.signalOffset = 0;
        updateConditionInfo();
        displaySignalQualityFromPlacement();
        drawECGBaseline();
    }

    function displaySignalQualityFromPlacement() {
        const placementQuality = state.prepState.placementQuality || 100;
        const qualityEl = document.getElementById('quality-value');
        const qualityFill = document.getElementById('quality-fill');
        const qualityMsg = document.getElementById('quality-message');
        const qualityIcon = document.querySelector('.quality-label i');
        
        if (!qualityEl) return;
        
        let quality = 'Good';
        let color = '#10b981'; // success
        let message = 'Electrode placement is optimal. Signal quality is excellent.';
        
        if (placementQuality >= 90) {
            quality = 'Excellent';
            color = '#10b981';
            message = '✓ Electrode placement is optimal. Signal quality is excellent.';
        } else if (placementQuality >= 75) {
            quality = 'Good';
            color = '#f59e0b';
            message = '⚠ Electrode placement is acceptable. Some noise may be present.';
            if (qualityIcon) qualityIcon.style.background = 'var(--warning-light)';
            if (qualityIcon) qualityIcon.style.color = 'var(--warning)';
        } else {
            quality = 'Poor';
            color = '#ef4444';
            message = '⚠ Electrode placement needs improvement. Expect significant noise in the signal.';
            if (qualityIcon) qualityIcon.style.background = 'var(--danger-light)';
            if (qualityIcon) qualityIcon.style.color = 'var(--danger)';
        }
        
        qualityEl.textContent = quality;
        qualityEl.className = 'quality-value ' + quality.toLowerCase();
        
        if (qualityFill) {
            qualityFill.style.width = placementQuality + '%';
            qualityFill.style.backgroundColor = color;
        }
        
        if (qualityMsg) {
            qualityMsg.textContent = message;
        }
        
        console.log('Signal Quality (from placement):', quality, '(' + placementQuality + '%)');
    }

    function updateConditionInfo() {
        const cond = engine.conditions[state.currentCondition];
        document.getElementById('condition-title').textContent = cond.name;
        document.getElementById('condition-desc').textContent = cond.description;
        const chars = document.getElementById('condition-chars');
        chars.innerHTML = '<ul>' + cond.characteristics.map(c => `<li>${c}</li>`).join('') + '</ul>';
    }

    function updateForceGauge() {
        document.getElementById('force-fill').style.height = state.forceLevel + '%';
        document.getElementById('force-value').textContent = state.forceLevel + '%';
    }

    function drawECGBaseline() {
        if (!ecgCtx) return;
        const canvas = ecgCtx.canvas;
        ecgCtx.fillStyle = '#000';
        ecgCtx.fillRect(0, 0, canvas.width, canvas.height);
        drawGrid(ecgCtx, canvas.width, canvas.height);

        ecgCtx.strokeStyle = '#22d3ee';
        ecgCtx.lineWidth = 1;
        ecgCtx.beginPath();
        const centerY = canvas.height / 2;
        for (let x = 0; x < canvas.width; x++) {
            ecgCtx.lineTo(x, centerY + (Math.random() - 0.5) * 3);
        }
        ecgCtx.stroke();
    }

    function startRecording() {
        // Ensure canvas is initialized
        if (!ecgCtx) {
            initRecording();
        }
        if (!ecgCtx) {
            console.error('Cannot start recording: canvas not initialized');
            return;
        }
        
        state.recording = true;
        document.getElementById('record-btn').classList.add('hidden');
        document.getElementById('stop-btn').classList.remove('hidden');
        document.getElementById('rec-indicator').classList.remove('hidden');
        document.getElementById('save-btn').classList.add('hidden');

        state.signalBuffer = [];
        animateRecording();
    }

    function animateRecording() {
        if (!state.recording) return;
        if (!ecgCtx || !ecgCtx.canvas) {
            console.error('Canvas context not available');
            return;
        }
        if (!engine) {
            console.error('ECG Engine not available');
            return;
        }

        const canvas = ecgCtx.canvas;
        const centerY = canvas.height / 2;
        const condition = state.currentCondition;
        const force = state.forceLevel;

        // Generate a chunk of signal - much slower for better visualization
        const baseChunkSize = 25;  // Reduced from 50
        const chunkSize = Math.max(3, Math.round(baseChunkSize * state.signalSpeed));
        const signal = engine.generateSignal(condition, force, chunkSize, state.signalOffset);
        state.signalOffset += chunkSize;

        // Add noise based on electrode placement quality
        const placementQuality = state.prepState.placementQuality || 100;
        const noiseAmount = (100 - placementQuality) * 0.5; // More noise if placement is poor
        
        for (let i = 0; i < signal.length; i++) {
            // Add proportional noise
            signal[i] += (Math.random() - 0.5) * noiseAmount / 50;
        }

        // Add to buffer
        for (let i = 0; i < signal.length; i++) {
            state.signalBuffer.push(signal[i]);
        }

        // Keep buffer manageable (show last ~900 samples)
        const maxDisplay = canvas.width;
        if (state.signalBuffer.length > maxDisplay * 2) {
            state.signalBuffer = state.signalBuffer.slice(-maxDisplay * 2);
        }

        // Draw
        ecgCtx.fillStyle = '#000';
        ecgCtx.fillRect(0, 0, canvas.width, canvas.height);
        drawGrid(ecgCtx, canvas.width, canvas.height);

        // Determine scale based on condition
        const scales = { normal: 80, tachycardia: 85, bradycardia: 78, irregular: 82 };
        const scale = scales[condition] || 80;

        // Color waveform based on placement quality
        let waveformColor = '#22d3ee'; // Default cyan (good)
        if (placementQuality < 85) {
            waveformColor = '#f59e0b'; // Orange (warning)
        }
        if (placementQuality < 70) {
            waveformColor = '#ef4444'; // Red (poor)
        }

        ecgCtx.strokeStyle = waveformColor;
        ecgCtx.lineWidth = 1.2;
        ecgCtx.shadowColor = waveformColor;
        ecgCtx.shadowBlur = 2;
        ecgCtx.beginPath();

        const displayStart = Math.max(0, state.signalBuffer.length - canvas.width);
        for (let i = displayStart; i < state.signalBuffer.length; i++) {
            const x = i - displayStart;
            const y = centerY - state.signalBuffer[i] * scale;
            if (i === displayStart) ecgCtx.moveTo(x, y);
            else ecgCtx.lineTo(x, y);
        }
        ecgCtx.stroke();
        ecgCtx.shadowBlur = 0;

        // Draw annotations for specific features
        drawSignalAnnotations(canvas, centerY, condition, force, scale);

        // Update metrics
        const recentSignal = state.signalBuffer.slice(-200);
        const rms = engine.calculateRMS(new Float32Array(recentSignal));
        const peak = engine.getPeakAmplitude(new Float32Array(recentSignal));
        const spectrum = engine.generateSpectrum(condition, force);
        const meanFreq = engine.calculateMeanFreq(spectrum.freqs, spectrum.powers);
        const bpmRange = engine.conditions[condition].bpm;
        const estimatedBPM = Math.round((bpmRange.min + bpmRange.max) / 2 + (force - 50) * 0.06);

        document.getElementById('rms-value').textContent = rms.toFixed(3) + ' mV';
        document.getElementById('peak-value').textContent = peak.toFixed(3) + ' mV';
        document.getElementById('freq-value').textContent = Math.round(meanFreq) + ' Hz';
        document.getElementById('mu-value').textContent = Math.max(30, estimatedBPM);

        // Update scale info
        const scaleInfo = document.getElementById('scale-info');
        if (scaleInfo) {
            const mvPerDiv = (canvas.height / 2 / scale / 5).toFixed(2);
            scaleInfo.textContent = `Scale: 1 div = ${mvPerDiv} mV | Time: ${Math.round(100/state.signalSpeed)} ms/div | Speed: ${state.signalSpeed}x`;
        }

        // Slower animation based on speed - increased delay for better visualization
        const delay = Math.round(40 / state.signalSpeed);
        setTimeout(() => {
            ecgAnimFrame = requestAnimationFrame(animateRecording);
        }, delay);
    }

    function drawSignalAnnotations(canvas, centerY, condition, force, scale) {
        const annotationsEl = document.getElementById('signal-annotations');
        if (!annotationsEl) return;

        // Clear previous annotations
        annotationsEl.innerHTML = '';

        // Add condition-specific annotations
        const annotations = [];

        if (condition === 'irregular') {
            annotations.push({
                text: 'Variable RR Intervals',
                description: 'Beat-to-beat timing changes',
                color: '#a78bfa'
            });
        }

        if (condition === 'tachycardia') {
            annotations.push({
                text: 'Fast Rhythm',
                description: 'Shortened RR intervals',
                color: '#fbbf24'
            });
        }

        if (condition === 'bradycardia') {
            annotations.push({
                text: 'Slow Rhythm',
                description: 'Prolonged RR intervals',
                color: '#f87171'
            });
        }

        if (force > 80 && condition === 'normal') {
            annotations.push({
                text: 'Stable Sinus Morphology',
                description: 'Consistent P-QRS-T sequence',
                color: '#34d399'
            });
        }

        // Render annotations
        annotations.forEach((ann, idx) => {
            const div = document.createElement('div');
            div.className = 'signal-annotation';
            div.style.borderColor = ann.color;
            div.innerHTML = `<strong style="color: ${ann.color}">${ann.text}</strong><br><small>${ann.description}</small>`;
            annotationsEl.appendChild(div);
        });
    }

    function stopRecording() {
        state.recording = false;
        cancelAnimationFrame(ecgAnimFrame);
        document.getElementById('stop-btn').classList.add('hidden');
        document.getElementById('record-btn').classList.remove('hidden');
        document.getElementById('save-btn').classList.remove('hidden');
        document.getElementById('rec-indicator').classList.add('hidden');
    }

    function saveTrial() {
        const condition = state.currentCondition;
        state.trials[condition] = {
            signal: [...state.signalBuffer],
            force: state.forceLevel,
            condition: condition
        };

        state.trialsSaved = Object.keys(state.trials).length;
        document.getElementById('trial-count').textContent = state.trialsSaved;
        document.getElementById('save-btn').classList.add('hidden');

        updateNavButtons();

        if (state.trialsSaved >= 4) {
            document.getElementById('rec-next-btn').classList.remove('hidden');
        }

        // Visual feedback
        const saveBtn = document.getElementById('save-btn');
        saveBtn.textContent = '✓ Saved!';
        setTimeout(() => { saveBtn.textContent = '💾 Save Trial'; }, 1000);
    }

    // ======== ANALYSIS (Step 5) ========
    function initAnalysis() {
        // Mark step 4 (Recording) as completed when entering Analysis
        if (!state.completedSteps.has(4)) {
            state.completedSteps.add(4);
            const navSteps = document.querySelectorAll('.nav-step');
            if (navSteps[4]) navSteps[4].classList.add('completed');
        }
        
        renderAnalysisTab('time');
        renderComparisonView();
        
        // Setup scroll-based completion for Analysis step
        setupAnalysisScrollCompletion();
    }
    
    function setupAnalysisScrollCompletion() {
        const summarySection = document.querySelector('.analysis-summary');
        if (!summarySection) return;
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    // Mark step 5 (Analysis) as completed
                    state.completedSteps.add(5);
                    const navSteps = document.querySelectorAll('.nav-step');
                    if (navSteps[5]) navSteps[5].classList.add('completed');
                    observer.disconnect();
                }
            });
        }, { threshold: 0.5 });
        
        observer.observe(summarySection);
    }

    function renderAnalysisTab(tab) {
        if (tab === 'time') renderTimeDomain();
        else if (tab === 'frequency') renderFrequencyDomain();
        else if (tab === 'rms') renderRMSEnvelope();
        else if (tab === 'comparison') renderComparisonView();
    }

    function renderTimeDomain() {
        const canvas = document.getElementById('analysis-time-canvas');
        const ctx = canvas.getContext('2d');
        const condition = document.getElementById('trial-select-time').value;
        const zoom = parseInt(document.getElementById('time-zoom').value);

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        drawGrid(ctx, canvas.width, canvas.height);

        // Generate a representative signal
        const signal = engine.generateSignal(condition, 50, 2000);
        
        // Auto-scale based on actual signal amplitude
        const peak = engine.getPeakAmplitude(signal);
        const autoScale = peak > 0 ? (canvas.height * 0.35) / peak : 80;
        const scale = autoScale * zoom;
        const centerY = canvas.height / 2;

        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 1.2;
        ctx.beginPath();

        const samplesPerPixel = Math.max(1, Math.floor(signal.length / canvas.width));
        for (let x = 0; x < canvas.width; x++) {
            const idx = Math.min(x * samplesPerPixel, signal.length - 1);
            const y = centerY - signal[idx] * scale;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Stats
        const rms = engine.calculateRMS(signal);
        document.getElementById('time-stats').innerHTML = `
            <div class="stat-item"><span class="stat-label">RMS Amplitude:</span><span class="stat-value">${rms.toFixed(3)} mV</span></div>
            <div class="stat-item"><span class="stat-label">Peak Amplitude:</span><span class="stat-value">${peak.toFixed(3)} mV</span></div>
            <div class="stat-item"><span class="stat-label">Duration:</span><span class="stat-value">2000 ms</span></div>
            <div class="stat-item"><span class="stat-label">Condition:</span><span class="stat-value">${engine.conditions[condition].name}</span></div>
        `;
    }

    function renderFrequencyDomain() {
        const canvas = document.getElementById('analysis-freq-canvas');
        const ctx = canvas.getContext('2d');
        const condition = document.getElementById('trial-select-freq').value;

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        drawGrid(ctx, canvas.width, canvas.height);

        const spectrum = engine.generateSpectrum(condition, 60);
        const maxPower = Math.max(...spectrum.powers) * 1.2;

        // Draw spectrum
        ctx.fillStyle = 'rgba(34, 211, 238, 0.3)';
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 1.5;
        ctx.beginPath();

        const scaleX = canvas.width / spectrum.freqs.length;
        const scaleY = (canvas.height - 40) / maxPower;

        ctx.moveTo(0, canvas.height);
        for (let i = 0; i < spectrum.freqs.length; i++) {
            const x = i * scaleX;
            const y = canvas.height - spectrum.powers[i] * scaleY - 20;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(canvas.width, canvas.height);
        ctx.fill();
        ctx.beginPath();
        for (let i = 0; i < spectrum.freqs.length; i++) {
            const x = i * scaleX;
            const y = canvas.height - spectrum.powers[i] * scaleY - 20;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Frequency labels
        ctx.fillStyle = '#64748b';
        ctx.font = '10px monospace';
        for (let f = 0; f <= 500; f += 100) {
            const x = (f / 500) * canvas.width;
            ctx.fillText(f + ' Hz', x, canvas.height - 5);
        }

        // Mean and median freq
        const meanF = engine.calculateMeanFreq(spectrum.freqs, spectrum.powers);
        const medianF = engine.calculateMedianFreq(spectrum.freqs, spectrum.powers);

        // Draw mean freq line
        const meanX = (meanF / 500) * canvas.width;
        ctx.strokeStyle = '#f87171';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(meanX, 0);
        ctx.lineTo(meanX, canvas.height);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#f87171';
        ctx.fillText(`Mean: ${Math.round(meanF)} Hz`, meanX + 5, 20);

        document.getElementById('freq-stats').innerHTML = `
            <div class="stat-item"><span class="stat-label">Mean Frequency:</span><span class="stat-value">${Math.round(meanF)} Hz</span></div>
            <div class="stat-item"><span class="stat-label">Median Frequency:</span><span class="stat-value">${Math.round(medianF)} Hz</span></div>
            <div class="stat-item"><span class="stat-label">Peak Power Freq:</span><span class="stat-value">${Math.round(spectrum.freqs[spectrum.powers.indexOf(Math.max(...spectrum.powers))])} Hz</span></div>
            <div class="stat-item"><span class="stat-label">Condition:</span><span class="stat-value">${engine.conditions[condition].name}</span></div>
        `;
    }

    function renderRMSEnvelope() {
        const canvas = document.getElementById('analysis-rms-canvas');
        const ctx = canvas.getContext('2d');
        const windowSize = parseInt(document.getElementById('rms-window').value);

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        drawGrid(ctx, canvas.width, canvas.height);

        // Generate a ramp signal (rest to MVC)
        // Generate a continuous normal rhythm segment for envelope stability analysis.
        const totalMs = 4000;
        const signal = engine.generateSignal('normal', 50, totalMs);

        const envelope = engine.calculateRMSEnvelope(new Float32Array(signal), windowSize);
        const maxEnv = Math.max(...envelope);
        const scaleY = maxEnv > 0 ? (canvas.height - 60) / (maxEnv * 1.2) : 1;
        const scaleX = canvas.width / envelope.length;

        // Draw envelope
        ctx.fillStyle = 'rgba(52, 211, 153, 0.2)';
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, canvas.height);
        for (let i = 0; i < envelope.length; i++) {
            ctx.lineTo(i * scaleX, canvas.height - envelope[i] * scaleY - 20);
        }
        ctx.lineTo(canvas.width, canvas.height);
        ctx.fill();
        ctx.beginPath();
        for (let i = 0; i < envelope.length; i++) {
            const x = i * scaleX;
            const y = canvas.height - envelope[i] * scaleY - 20;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Labels
        ctx.fillStyle = '#64748b';
        ctx.font = '10px monospace';
        ctx.fillText('Rest', 10, canvas.height - 5);
        ctx.fillText('MVC', canvas.width - 40, canvas.height - 5);
        ctx.fillText('Force →', canvas.width / 2 - 20, canvas.height - 5);

        document.getElementById('rms-stats').innerHTML = `
            <div class="stat-item"><span class="stat-label">Window Size:</span><span class="stat-value">${windowSize} ms</span></div>
            <div class="stat-item"><span class="stat-label">Peak RMS:</span><span class="stat-value">${Math.max(...envelope).toFixed(3)} mV</span></div>
            <div class="stat-item"><span class="stat-label">Signal shows:</span><span class="stat-value">Normal rhythm amplitude envelope</span></div>
        `;
    }

    function renderComparisonView() {
        const conditions = ['normal', 'tachycardia', 'bradycardia', 'irregular'];
        conditions.forEach(cond => {
            const canvas = document.getElementById(`comp-${cond}`);
            if (!canvas) return;
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            drawGrid(ctx, canvas.width, canvas.height);

            const signal = engine.generateSignal(cond, 50, 500);
            
            // Auto-scale based on actual signal amplitude
            const peak = engine.getPeakAmplitude(signal);
            const scale = peak > 0 ? (canvas.height * 0.35) / peak : 80;
            const centerY = canvas.height / 2;

            const colors = { normal: '#34d399', tachycardia: '#fbbf24', bradycardia: '#f87171', irregular: '#a78bfa' };
            ctx.strokeStyle = colors[cond];
            ctx.lineWidth = 1.2;
            ctx.beginPath();

            for (let x = 0; x < canvas.width; x++) {
                const idx = Math.min(x, signal.length - 1);
                const y = centerY - signal[idx] * scale;
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Stats
            const rms = engine.calculateRMS(signal);
            const spectrum = engine.generateSpectrum(cond, 50);
            const meanF = engine.calculateMeanFreq(spectrum.freqs, spectrum.powers);

            const statsEl = document.getElementById(`comp-stats-${cond}`);
            if (statsEl) {
                statsEl.innerHTML = `RMS: ${rms.toFixed(3)} mV | Peak: ${peak.toFixed(3)} mV | Mean Freq: ${Math.round(meanF)} Hz`;
            }
        });
    }

    // ======== DOWNLOAD FUNCTIONS ========
    function downloadResultsReport() {
        const conditions = ['normal', 'tachycardia', 'bradycardia', 'irregular'];
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
        
        let reportHTML = `
<!DOCTYPE html>
<html>
<head>
    <title>ECG Virtual Lab - Results Report</title>
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; max-width: 900px; margin: 40px auto; padding: 20px; background: #f8fafc; }
        h1 { color: #1e3a5f; border-bottom: 3px solid #4a90a4; padding-bottom: 10px; }
        h2 { color: #334155; margin-top: 30px; }
        .header-info { background: #e0f2fe; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        th, td { padding: 12px; text-align: left; border: 1px solid #e2e8f0; }
        th { background: #1e3a5f; color: white; }
        tr:nth-child(even) { background: #f8fafc; }
        .condition-normal { color: #10b981; font-weight: bold; }
        .condition-tachycardia { color: #f59e0b; font-weight: bold; }
        .condition-bradycardia { color: #ef4444; font-weight: bold; }
        .condition-irregular { color: #8b5cf6; font-weight: bold; }
        .summary-box { background: #f0fdf4; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px; }
    </style>
</head>
<body>
    <h1>ECG Virtual Laboratory - Results Report</h1>
    <div class="header-info">
        <strong>Experiment:</strong> Electrocardiography Signal Recording<br>
        <strong>Date:</strong> ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}<br>
        <strong>Selected Lead Region:</strong> ${state.selectedMuscle ? muscleInfo[state.selectedMuscle]?.name : 'Lead II Setup (RA-LA-RL)'}
    </div>

    <h2>Signal Analysis Results</h2>
    <table>
        <tr>
            <th>Condition</th>
            <th>RMS Amplitude (mV)</th>
            <th>Peak Amplitude (mV)</th>
            <th>Mean Frequency (Hz)</th>
            <th>Median Frequency (Hz)</th>
        </tr>`;

        conditions.forEach(cond => {
            const signal = engine.generateSignal(cond, 50, 2000);
            const rms = engine.calculateRMS(signal);
            const peak = engine.getPeakAmplitude(signal);
            const spectrum = engine.generateSpectrum(cond, 50);
            const meanF = engine.calculateMeanFreq(spectrum.freqs, spectrum.powers);
            const medianF = engine.calculateMedianFreq(spectrum.freqs, spectrum.powers);
            const condClass = `condition-${cond}`;
            
            reportHTML += `
        <tr>
            <td class="${condClass}">${engine.conditions[cond].name}</td>
            <td>${rms.toFixed(4)}</td>
            <td>${peak.toFixed(4)}</td>
            <td>${Math.round(meanF)}</td>
            <td>${Math.round(medianF)}</td>
        </tr>`;
        });

        reportHTML += `
    </table>

    <h2>Rhythm Characteristics</h2>
    <table>
        <tr>
            <th>Condition</th>
            <th>Estimated QRS Width (ms)</th>
            <th>Estimated QRS Amplitude (mV)</th>
            <th>RR Variability</th>
            <th>Heart Rate (bpm)</th>
        </tr>`;

        conditions.forEach(cond => {
            const params = engine.conditions[cond];
            const condClass = `condition-${cond}`;
            reportHTML += `
        <tr>
            <td class="${condClass}">${params.name}</td>
            <td>${params.qrsDurationMs}</td>
            <td>${params.qrsAmplitude}</td>
            <td>${Math.round((params.rrVariability || 0) * 100)}%</td>
            <td>${params.firingRate.min} - ${params.firingRate.max}</td>
        </tr>`;
        });

        reportHTML += `
    </table>

    <h2>Clinical Interpretation</h2>
    <div class="summary-box">
        <strong>Normal:</strong> Regular sinus rhythm with consistent RR intervals and P-QRS-T sequence.<br><br>
        <strong>Tachycardia:</strong> Faster sinus rhythm with shortened RR intervals and higher heart rate.<br><br>
        <strong>Bradycardia:</strong> Slower rhythm with prolonged RR intervals and lower heart rate.<br><br>
        <strong>Irregular:</strong> Variable RR intervals and rhythm instability with nonuniform beat timing.
    </div>

    <h2>System Configuration</h2>
    <table>
        <tr><th>Parameter</th><th>Value</th></tr>
        <tr><td>Sampling Rate</td><td>${engine.sampleRate} Hz</td></tr>
        <tr><td>ECG Type</td><td>Surface ECG</td></tr>
        <tr><td>Bandwidth</td><td>${engine.bandwidth.surface.low} - ${engine.bandwidth.surface.high} Hz</td></tr>
        <tr><td>Electrode Impedance</td><td>${engine.electrodeImpedance} kΩ</td></tr>
    </table>

    <div class="footer">
        Generated by ECG Virtual Laboratory | Biomedical Engineering Experiment<br>
        This report contains simulated data for educational purposes.
    </div>
</body>
</html>`;

        // Create and download the file
        const blob = new Blob([reportHTML], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `ECG_Results_Report_${timestamp}.html`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    function downloadRawDataCSV() {
        const conditions = ['normal', 'tachycardia', 'bradycardia', 'irregular'];
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
        const sampleDuration = 500; // ms
        
        let csvContent = 'Sample,Time(ms),Normal(mV),Tachycardia(mV),Bradycardia(mV),Irregular(mV)\n';
        
        // Generate signals for all conditions
        const signals = {};
        conditions.forEach(cond => {
            signals[cond] = engine.generateSignal(cond, 50, sampleDuration);
        });
        
        const numSamples = signals.normal.length;
        const timeStep = sampleDuration / numSamples;
        
        for (let i = 0; i < numSamples; i++) {
            const time = (i * timeStep).toFixed(3);
            csvContent += `${i},${time},${signals.normal[i].toFixed(6)},${signals.tachycardia[i].toFixed(6)},${signals.bradycardia[i].toFixed(6)},${signals.irregular[i].toFixed(6)}\n`;
        }
        
        // Add summary statistics at the end
        csvContent += '\n\n--- Summary Statistics ---\n';
        csvContent += 'Condition,RMS(mV),Peak(mV),MeanFreq(Hz),MedianFreq(Hz)\n';
        
        conditions.forEach(cond => {
            const rms = engine.calculateRMS(signals[cond]);
            const peak = engine.getPeakAmplitude(signals[cond]);
            const spectrum = engine.generateSpectrum(cond, 50);
            const meanF = engine.calculateMeanFreq(spectrum.freqs, spectrum.powers);
            const medianF = engine.calculateMedianFreq(spectrum.freqs, spectrum.powers);
            csvContent += `${engine.conditions[cond].name},${rms.toFixed(6)},${peak.toFixed(6)},${meanF.toFixed(2)},${medianF.toFixed(2)}\n`;
        });
        
        // Create and download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `ECG_Raw_Data_${timestamp}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    // ======== UTILITIES ========
    function drawGrid(ctx, w, h) {
        ctx.strokeStyle = 'rgba(30, 41, 59, 0.6)';
        ctx.lineWidth = 0.5;
        const gridSize = 30;
        for (let x = 0; x < w; x += gridSize) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        }
        for (let y = 0; y < h; y += gridSize) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }
        // Center lines
        ctx.strokeStyle = 'rgba(51, 65, 85, 0.8)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    }

    function getToolName(phase) {
        const tools = {
            clean: 'alcohol swab (🧻)',
            abrade: 'abrasive pad (📋)',
            gel: 'conductive gel (💧)',
            place: 'electrodes (RA, LA, RL)'
        };
        return tools[phase] || 'tool';
    }

    // ======== GLOSSARY ========
    function setupGlossary() {
        const terms = [
            { term: 'ECG (Electrocardiography)', def: 'A noninvasive recording of cardiac electrical activity from surface electrodes.' },
            { term: 'P Wave', def: 'Represents atrial depolarization and normally precedes each QRS in sinus rhythm.' },
            { term: 'QRS Complex', def: 'Represents ventricular depolarization; usually the highest-amplitude part of the ECG.' },
            { term: 'T Wave', def: 'Represents ventricular repolarization following the QRS complex.' },
            { term: 'RR Interval', def: 'Time between consecutive R peaks. Used to determine rhythm regularity and heart rate.' },
            { term: 'Heart Rate (bpm)', def: 'Estimated from RR interval using HR = 60000 / RR(ms).' },
            { term: 'Tachycardia', def: 'Heart rate above 100 bpm, commonly with shortened RR intervals.' },
            { term: 'Bradycardia', def: 'Heart rate below 60 bpm, commonly with prolonged RR intervals.' },
            { term: 'Irregular Rhythm', def: 'Rhythm with variable RR intervals and inconsistent beat timing.' },
            { term: 'Impedance', def: 'Resistance to electrical current flow at the electrode-skin interface. Must be < 5 kΩ for clean recordings. >10 kΩ causes increased noise and phase distortion.' },
            { term: 'CMRR (Common Mode Rejection Ratio)', def: 'Ability of the differential amplifier to reject signals common to both inputs (noise) while amplifying the difference (ECG).' },
            { term: 'Notch Filter', def: 'A filter that removes a specific frequency (50 or 60 Hz) to eliminate power line interference.' },
            { term: 'RMS (Root Mean Square)', def: 'A measure of signal amplitude calculated as the square root of the mean of squared values. Represents signal "power".' },
            { term: 'FFT (Fast Fourier Transform)', def: 'Algorithm that converts a time-domain signal into its frequency components, revealing the power spectrum.' },
            { term: 'Differential Amplifier', def: 'An amplifier that amplifies the difference between two inputs, rejecting common noise (essential for ECG).' },
            { term: 'Sampling Rate', def: 'Number of samples taken per second (Hz). Typical diagnostic ECG uses 500-1000 Hz.' },
            { term: 'Baseline Drift', def: 'Low-frequency movement of the ECG baseline due to respiration, motion, or electrode effects.' },
            { term: 'ST Segment', def: 'Segment between QRS end and T-wave start; important for ischemia interpretation.' },
            { term: 'PR Interval', def: 'Interval from P-wave onset to QRS onset; reflects AV conduction timing.' },
            { term: 'QT Interval', def: 'Interval from QRS onset to T-wave end; reflects ventricular depolarization and repolarization duration.' },
            { term: 'Lead II', def: 'A common rhythm-monitoring lead derived from RA to LL electrode vector.' }
        ];

        // Render glossary terms into the modal
        const glossaryList = document.getElementById('glossary-list');
        if (glossaryList) {
            glossaryList.innerHTML = terms.map(item => `
                <div class="glossary-item">
                    <h4>${item.term}</h4>
                    <p>${item.def}</p>
                </div>
            `).join('');
        }

        // Add glossary search functionality
        const searchInput = document.getElementById('glossary-search-input');
        if (searchInput && glossaryList) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase().trim();
                const items = glossaryList.querySelectorAll('.glossary-item');
                items.forEach(item => {
                    const term = item.querySelector('h4').textContent.toLowerCase();
                    const def = item.querySelector('p').textContent.toLowerCase();
                    if (term.includes(query) || def.includes(query)) {
                        item.style.display = '';
                    } else {
                        item.style.display = 'none';
                    }
                });
            });
        }
    }

// Global function for toggling prep step cards
function togglePrepStep(stepNum) {
    const steps = document.querySelectorAll('.collapsible-step');
    const targetStep = document.getElementById(`prep-step-${stepNum}`);
    
    // If clicking on the current active step, just toggle it
    if (targetStep.classList.contains('active')) {
        // Don't allow collapsing the current active step
        return;
    }
    
    // Otherwise, expand the clicked step (only if it's unlocked)
    steps.forEach((step, index) => {
        if (index + 1 === stepNum) {
            step.classList.add('active');
        } else {
            // Keep completed class but remove active
            step.classList.remove('active');
        }
    });
}

// Global function to update horizontal progress indicators
function updatePrepProgressBar(currentPhase) {
    const phases = ['clean', 'abrade', 'gel', 'place'];
    const currentIndex = phases.indexOf(currentPhase);
    
    document.querySelectorAll('.prep-step-indicator').forEach((indicator, index) => {
        indicator.classList.remove('active', 'completed');
        if (index < currentIndex) {
            indicator.classList.add('completed');
        } else if (index === currentIndex) {
            indicator.classList.add('active');
        }
    });
    
    document.querySelectorAll('.step-connector').forEach((connector, index) => {
        connector.classList.toggle('filled', index < currentIndex);
    });
}

// Global function to update floating impedance indicator
function updateFloatingImpedance(value, status) {
    const floatingImp = document.getElementById('floating-impedance');
    const valueEl = document.getElementById('imp-value-float');
    const statusEl = document.getElementById('imp-status-float');
    const ringFill = document.getElementById('imp-ring-fill');
    
    if (!floatingImp) return;
    
    // Show the floating indicator
    floatingImp.classList.add('visible');
    
    // Update values
    valueEl.textContent = value !== null ? `${value.toFixed(1)}` : '--';
    
    // Calculate ring fill (220 is full circumference)
    // Lower impedance = better = more fill
    let fillPercent = 0;
    let statusClass = '';
    
    if (value !== null) {
        if (value <= 5) {
            fillPercent = 100;
            statusClass = 'good';
            statusEl.textContent = 'Excellent';
        } else if (value <= 10) {
            fillPercent = 70;
            statusClass = 'warning';
            statusEl.textContent = 'Acceptable';
        } else {
            fillPercent = 30;
            statusClass = 'bad';
            statusEl.textContent = 'Too High';
        }
    } else {
        statusEl.textContent = 'Measure pending';
    }
    
    // Update ring
    ringFill.style.strokeDashoffset = 220 - (220 * fillPercent / 100);
    ringFill.classList.remove('good', 'warning', 'bad');
    if (statusClass) ringFill.classList.add(statusClass);
    
    statusEl.classList.remove('good', 'warning', 'bad');
    if (statusClass) statusEl.classList.add(statusClass);
}

// Global function for micro-animations
function triggerCleanAnimation(zoneType) {
    // zoneType can be string (ra/la/rl/ll) or number (1/2/3) - handle both for compatibility
    const zoneId = typeof zoneType === 'number' ? `prep-zone-${zoneType}` : `prep-zone-${zoneType}`;
    
    const zone = document.getElementById(zoneId);
    if (zone) zone.classList.add('cleaned');
}

function triggerAbradeAnimation(zoneType) {
    const zoneId = typeof zoneType === 'number' ? `prep-zone-${zoneType}` : `prep-zone-${zoneType}`;
    
    const zone = document.getElementById(zoneId);
    if (zone) zone.classList.add('abraded');
}

function triggerGelAnimation(zoneType) {
    const zoneId = typeof zoneType === 'number' ? `prep-zone-${zoneType}` : `prep-zone-${zoneType}`;
    
    const zone = document.getElementById(zoneId);
    if (zone) zone.classList.add('gelled');
}

function triggerElectrodePlacement(electrodeType) {
    const placedEl = document.getElementById(`placed-e-${electrodeType}`);
    if (placedEl) {
        placedEl.classList.remove('hidden');
        placedEl.classList.add('visible');
    }
}
