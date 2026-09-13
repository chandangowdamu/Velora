/**
 * CAREPLUS MEDICAL & AI CARE - MAIN APPLICATION SCRIPT
 */

document.addEventListener('DOMContentLoaded', () => {
    initAlphabetBar();
    initDiseaseGrid();
    init3DViewer();
    loadDepartments();
    loadServices();
    initBookingForm();
    initApiKeySystem();
});

// State Management
const state = {
    currentLetter: null,
    searchQuery: '',
    diseases: [],
    apiKey: 'CP-AI-KEY-2026-SECURE',
    isApiKeyValid: true,
    
    // 3D Viewer State
    totalFrames: 60,
    currentFrame: 1,
    isPlaying: false,
    playInterval: null,
    fpsDelay: 50,
    customFrameImages: [] // Slot for user image array if provided
};

// ==================== 1. A-Z ALPHABET & DISEASE ENGINE ====================

function initAlphabetBar() {
    const alphabetBar = document.getElementById('alphabetBar');
    if (!alphabetBar) return;

    const letters = ['ALL', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];

    alphabetBar.innerHTML = letters.map(letter => `
        <button class="alphabet-btn ${letter === 'ALL' ? 'active' : ''}" data-letter="${letter}">
            ${letter}
        </button>
    `).join('');

    // Event Delegation
    alphabetBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.alphabet-btn');
        if (!btn) return;

        document.querySelectorAll('.alphabet-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const selectedLetter = btn.dataset.letter;
        state.currentLetter = selectedLetter === 'ALL' ? null : selectedLetter;
        state.searchQuery = '';
        document.getElementById('diseaseSearchInput').value = '';
        document.getElementById('searchClearBtn').style.display = 'none';

        document.getElementById('currentLetterDisplay').textContent = selectedLetter === 'ALL' ? 'All (A-Z)' : `Letter '${selectedLetter}'`;

        fetchDiseases();
    });

    // Search Input Listener
    const searchInput = document.getElementById('diseaseSearchInput');
    const searchClearBtn = document.getElementById('searchClearBtn');

    searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.trim();
        searchClearBtn.style.display = state.searchQuery ? 'block' : 'none';

        if (state.searchQuery) {
            document.querySelectorAll('.alphabet-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('currentLetterDisplay').textContent = `Search: "${state.searchQuery}"`;
        } else {
            document.querySelector('.alphabet-btn[data-letter="ALL"]').classList.add('active');
            document.getElementById('currentLetterDisplay').textContent = 'All (A-Z)';
        }

        debounce(() => fetchDiseases(), 300)();
    });

    searchClearBtn.addEventListener('click', () => {
        searchInput.value = '';
        state.searchQuery = '';
        searchClearBtn.style.display = 'none';
        document.querySelector('.alphabet-btn[data-letter="ALL"]').click();
    });
}

async function fetchDiseases() {
    const diseaseGrid = document.getElementById('diseaseGrid');
    diseaseGrid.innerHTML = `
        <div class="loading-spinner">
            <div class="spinner"></div>
            <p>Fetching medical database records...</p>
        </div>
    `;

    try {
        let url = '/api/diseases';
        const params = new URLSearchParams();
        if (state.currentLetter) params.append('letter', state.currentLetter);
        if (state.searchQuery) params.append('query', state.searchQuery);

        if (params.toString()) url += `?${params.toString()}`;

        const res = await fetch(url);
        const data = await res.json();
        state.diseases = data;
        renderDiseaseCards(data);
    } catch (err) {
        console.error("Failed to load disease data:", err);
        diseaseGrid.innerHTML = `<div class="error-msg">Failed to connect to API database. Make sure backend is running.</div>`;
    }
}

function renderDiseaseCards(diseases) {
    const diseaseGrid = document.getElementById('diseaseGrid');

    if (!diseases || diseases.length === 0) {
        diseaseGrid.innerHTML = `
            <div class="no-results" style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
                <h3>No Medical Conditions Found</h3>
                <p>Try clicking another letter (A-Z) or adjusting your search term.</p>
            </div>
        `;
        return;
    }

    diseaseGrid.innerHTML = diseases.map(disease => `
        <div class="disease-card" onclick="openDiseaseModal(${disease.id})">
            <div>
                <div class="card-top">
                    <span class="category-tag">${disease.category}</span>
                    <span class="letter-pill">A-Z #${disease.letter}</span>
                </div>
                <h3 class="disease-name">${disease.name}</h3>
                <p class="disease-overview">${disease.overview}</p>
            </div>
            <button class="btn-card-action">
                <span>View AI Diagnostic & Treatment</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
            </button>
        </div>
    `).join('');
}

async function openDiseaseModal(diseaseId) {
    try {
        const res = await fetch(`/api/diseases/${diseaseId}`);
        const disease = await res.json();

        document.getElementById('modalCategory').textContent = disease.category;
        document.getElementById('modalTitle').textContent = disease.name;
        document.getElementById('modalOverview').textContent = disease.overview;

        // Parse symptoms into pills
        const symptomsArray = disease.symptoms.split(',').map(s => s.trim());
        document.getElementById('modalSymptoms').innerHTML = symptomsArray.map(sym => `
            <span class="symptom-pill">${sym}</span>
        `).join('');

        document.getElementById('modalAiInsight').textContent = disease.ai_insight;
        document.getElementById('modalTreatment').textContent = disease.treatment;

        document.getElementById('diseaseModal').classList.add('active');
    } catch (err) {
        alert("Unable to fetch detailed report for disease.");
    }
}

function closeDiseaseModal() {
    document.getElementById('diseaseModal').classList.remove('active');
}

// Modal Backdrop Click
document.getElementById('diseaseModal')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) {
        closeDiseaseModal();
    }
});
document.getElementById('closeDiseaseModal')?.addEventListener('click', closeDiseaseModal);

// ==================== 2. 3D ANIMATION FRAME SCRUBBING ENGINE ====================

function init3DViewer() {
    const canvas = document.getElementById('frameCanvas');
    const scrubber = document.getElementById('frameScrubber');
    const playBtn = document.getElementById('btnPlayPause');
    const prevBtn = document.getElementById('btnPrevFrame');
    const nextBtn = document.getElementById('btnNextFrame');
    const speedSelect = document.getElementById('speedSelect');

    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Render initial frame
    renderAnimationFrame(ctx, state.currentFrame);

    // Scrubber Input Event
    scrubber.addEventListener('input', (e) => {
        state.currentFrame = parseInt(e.target.value, 10);
        updateFrameUI(ctx);
    });

    // Play / Pause Toggle
    playBtn.addEventListener('click', () => {
        if (state.isPlaying) {
            pauseAnimation();
        } else {
            startAnimation(ctx);
        }
    });

    prevBtn.addEventListener('click', () => {
        pauseAnimation();
        state.currentFrame = state.currentFrame > 1 ? state.currentFrame - 1 : state.totalFrames;
        updateFrameUI(ctx);
    });

    nextBtn.addEventListener('click', () => {
        pauseAnimation();
        state.currentFrame = state.currentFrame < state.totalFrames ? state.currentFrame + 1 : 1;
        updateFrameUI(ctx);
    });

    if (speedSelect) {
        speedSelect.addEventListener('change', (e) => {
            state.fpsDelay = parseInt(e.target.value, 10);
            if (state.isPlaying) {
                pauseAnimation();
                startAnimation(ctx);
            }
        });
    }
}

function startAnimation(ctx) {
    state.isPlaying = true;
    const playIcon = document.getElementById('playIcon');
    const pauseIcon = document.getElementById('pauseIcon');
    if (playIcon) playIcon.style.display = 'none';
    if (pauseIcon) pauseIcon.style.display = 'block';

    state.playInterval = setInterval(() => {
        state.currentFrame = state.currentFrame < state.totalFrames ? state.currentFrame + 1 : 1;
        updateFrameUI(ctx);
    }, state.fpsDelay);
}

function pauseAnimation() {
    state.isPlaying = false;
    const playIcon = document.getElementById('playIcon');
    const pauseIcon = document.getElementById('pauseIcon');
    if (playIcon) playIcon.style.display = 'block';
    if (pauseIcon) pauseIcon.style.display = 'none';
    if (state.playInterval) clearInterval(state.playInterval);
}

function updateFrameUI(ctx) {
    const scrubber = document.getElementById('frameScrubber');
    const counter = document.getElementById('frameCounter');
    if (scrubber) scrubber.value = state.currentFrame;
    if (counter) counter.textContent = `Frame ${state.currentFrame} / ${state.totalFrames}`;
    renderAnimationFrame(ctx, state.currentFrame);
}

/**
 * 3D Procedural Anatomical Frame Renderer
 * Generates smooth 3D rotational scan slices with density heatmaps and coordinate grids.
 * If user drops custom images into `state.customFrameImages`, it renders image frames.
 */
function renderAnimationFrame(ctx, frameIndex) {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;

    // Clear Canvas
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, width, height);

    // Draw Subtle 3D Grid Lines
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.3)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }

    // Rotational Scan Mathematics
    const angle = (frameIndex / state.totalFrames) * Math.PI * 2;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = 140;

    // Draw Rotating 3D Anatomical Brain / Organ Slice Wireframe
    ctx.save();
    ctx.translate(centerX, centerY);

    // Outer Elliptical Skull/Thorax Boundary
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * Math.cos(angle * 0.5) * 0.3 + radius, radius * 0.85, angle, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(14, 165, 233, 0.8)';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#0ea5e9';
    ctx.shadowBlur = 12;
    ctx.stroke();

    // Inner Radiodensity Heatmap Spheres (Simulated Scan Lesion & Tissue Layers)
    const lobes = [
        { offsetX: Math.sin(angle) * 50, offsetY: Math.cos(angle) * 30, r: 45, color: 'rgba(16, 185, 129, 0.4)' },
        { offsetX: -Math.sin(angle) * 40, offsetY: -Math.cos(angle) * 40, r: 35, color: 'rgba(56, 189, 248, 0.4)' },
        { offsetX: Math.cos(angle * 2) * 20, offsetY: Math.sin(angle * 2) * 20, r: 25, color: 'rgba(244, 63, 94, 0.5)' }
    ];

    lobes.forEach(lobe => {
        const grad = ctx.createRadialGradient(lobe.offsetX, lobe.offsetY, 2, lobe.offsetX, lobe.offsetY, lobe.r);
        grad.addColorStop(0, lobe.color);
        grad.addColorStop(1, 'rgba(2, 6, 23, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(lobe.offsetX, lobe.offsetY, lobe.r, 0, Math.PI * 2);
        ctx.fill();
    });

    // Crosshair Scanner Line
    const scanY = (Math.sin(angle) * 0.5 + 0.5) * (height - 100) - (height / 2 - 50);
    ctx.beginPath();
    ctx.moveTo(-width / 2 + 50, scanY);
    ctx.lineTo(width / 2 - 50, scanY);
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();

    // Render Scanning Reticle & Frame Index Text
    ctx.fillStyle = '#0ea5e9';
    ctx.font = '12px "Outfit", sans-serif';
    ctx.fillText(`AXIAL SLICE ANGLE: ${(angle * 180 / Math.PI).toFixed(1)}°`, 20, height - 20);
    ctx.fillText(`VOXEL DENSITY: 1024 HU`, width - 180, height - 20);
}

// ==================== 3. DEPARTMENTS & SERVICES ====================

async function loadDepartments() {
    const grid = document.getElementById('departmentsGrid');
    if (!grid) return;

    try {
        const res = await fetch('/api/departments');
        const departments = await res.json();

        // Icon Mapping
        const iconSvg = {
            ambulance: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-1.1 0-2 .9-2 2v7c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M9 10h4"/></svg>`,
            bear: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="14" r="7"/><circle cx="7" cy="7" r="3"/><circle cx="17" cy="7" r="3"/><circle cx="10" cy="13" r="1"/><circle cx="14" cy="13" r="1"/><path d="M11 16c.5.5 1.5.5 2 0"/></svg>`,
            heart: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.78-8.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/><path d="M3.5 12h6l1.5-3 3 6 1.5-3h4.5"/></svg>`,
            scanner: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 12h10M12 7v10"/></svg>`,
            brain: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/></svg>`,
            bone: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 1 0-5 0 2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0 5 0Z"/></svg>`
        };

        grid.innerHTML = departments.map(dept => `
            <div class="dept-card">
                <div class="dept-icon-wrapper">
                    ${iconSvg[dept.icon_type] || iconSvg.heart}
                </div>
                <h3 class="dept-name">${dept.name}</h3>
                <p class="dept-desc">${dept.description}</p>
                <a href="${dept.url}" target="_blank" rel="noopener" class="dept-url-btn">
                    <span>Visit Department</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
            </div>
        `).join('');
    } catch (err) {
        console.error("Failed to load departments:", err);
    }
}

async function loadServices() {
    const grid = document.getElementById('servicesGrid');
    if (!grid) return;

    try {
        const res = await fetch('/api/services');
        const services = await res.json();

        grid.innerHTML = services.map(srv => `
            <div class="service-card">
                <a href="${srv.online_url}" target="_blank" rel="noopener" class="service-img-link" title="Open ${srv.title}">
                    <img src="${srv.image_url}" alt="${srv.title}" class="service-image" loading="lazy">
                </a>
                <div class="service-content">
                    <h3 class="service-title">${srv.title}</h3>
                    <p class="service-desc">${srv.description}</p>
                    <a href="${srv.online_url}" target="_blank" rel="noopener" class="btn-service-url">
                        Visit Online Service &rarr;
                    </a>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error("Failed to load services:", err);
    }
}

// ==================== 4. APPOINTMENT BOOKING ====================

function initBookingForm() {
    const form = document.getElementById('heroBookingForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const department = document.getElementById('heroDepartment').value;
        const doctor = document.getElementById('heroDoctor').value;
        const appointment_date = document.getElementById('heroDate').value;

        if (!department || !doctor || !appointment_date) {
            alert("Please select department, doctor, and preferred date.");
            return;
        }

        try {
            const res = await fetch('/api/appointments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patient_name: "Guest Patient",
                    department,
                    doctor,
                    appointment_date
                })
            });

            const data = await res.json();

            if (data.status === 'success') {
                alert(`🎉 Appointment Confirmed!\n\nBooking ID: #${data.appointment_id}\nDepartment: ${data.details.department}\nDoctor: ${data.details.doctor}\nDate: ${data.details.date}`);
                form.reset();
            }
        } catch (err) {
            alert("Error booking appointment. Please check server connection.");
        }
    });
}

function openBookingModal() {
    document.getElementById('quickBookingCard')?.scrollIntoView({ behavior: 'smooth' });
}

// ==================== 5. API KEY AUTHENTICATION ====================

function initApiKeySystem() {
    const badgeBtn = document.getElementById('apiKeyTriggerBtn');
    const modal = document.getElementById('apiKeyModal');
    const closeBtn = document.getElementById('closeApiKeyModal');
    const verifyBtn = document.getElementById('btnVerifyApiKey');
    const keyInput = document.getElementById('apiKeyInput');
    const feedback = document.getElementById('apiKeyFeedback');

    if (!badgeBtn || !modal) return;

    badgeBtn.addEventListener('click', () => {
        modal.classList.add('active');
    });

    closeBtn?.addEventListener('click', () => modal.classList.remove('active'));

    verifyBtn?.addEventListener('click', async () => {
        const inputKey = keyInput.value.trim();
        if (!inputKey) {
            feedback.className = 'api-feedback error';
            feedback.textContent = 'Please enter an API Key.';
            return;
        }

        feedback.className = 'api-feedback';
        feedback.textContent = 'Verifying key against SQLite Database...';

        try {
            const res = await fetch('/api/auth/verify-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: inputKey })
            });

            const data = await res.json();

            if (data.valid) {
                state.apiKey = inputKey;
                state.isApiKeyValid = true;
                feedback.className = 'api-feedback success';
                feedback.textContent = `✅ ${data.message}`;
                document.querySelector('.api-btn-text').textContent = 'API Key: Validated';
                document.getElementById('dbInfoText').textContent = `Authenticated: ${data.client_name}`;
                setTimeout(() => modal.classList.remove('active'), 1500);
            } else {
                state.isApiKeyValid = false;
                feedback.className = 'api-feedback error';
                feedback.textContent = `❌ ${data.message}`;
                document.querySelector('.api-btn-text').textContent = 'API Key: Invalid';
            }
        } catch (err) {
            feedback.className = 'api-feedback error';
            feedback.textContent = 'Error connecting to API auth endpoint.';
        }
    });
}

function closeApiKeyModal() {
    document.getElementById('apiKeyModal')?.classList.remove('active');
}

// Helper Debounce
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
