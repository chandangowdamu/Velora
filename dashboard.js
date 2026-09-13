// ==================== VELORA PATIENT DASHBOARD JS ====================

const API_BASE = '';

// --- Booking State ---
const bookingState = {
    selectedDoctorId: null,
    selectedDoctorName: '',
    selectedDoctorSpec: '',
    selectedDisease: '',
    diseases: [],
    doctors: []
};

// --- Auth Check ---
function getToken() {
    return localStorage.getItem('velora_token');
}

function authHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
    };
}

// Redirect to login if not authenticated
if (!getToken()) {
    window.location.href = '/login.html';
}

// --- Toast Notification ---
function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// --- Load Patient Profile ---
async function loadProfile() {
    try {
        const res = await fetch(`${API_BASE}/api/auth/profile`, { headers: authHeaders() });
        if (res.status === 401) {
            localStorage.removeItem('velora_token');
            localStorage.removeItem('velora_patient');
            window.location.href = '/login.html';
            return;
        }
        const profile = await res.json();

        // Welcome bar
        document.getElementById('welcomeTitle').textContent = `Welcome back, ${profile.name}!`;
        document.getElementById('userNameBadge').textContent = profile.name;
        document.getElementById('userEmailBadge').textContent = profile.email;
        document.getElementById('userAvatar').textContent = profile.name ? profile.name.charAt(0).toUpperCase() : '?';

        // Profile card
        document.getElementById('pName').textContent = profile.name || '--';
        document.getElementById('pEmail').textContent = profile.email || '--';
        document.getElementById('pAge').textContent = profile.age || '--';
        document.getElementById('pGender').textContent = profile.gender || '--';

        // Conditions as tags
        const condEl = document.getElementById('pConditions');
        if (profile.conditions && profile.conditions.trim()) {
            condEl.innerHTML = profile.conditions.split(',').map(c =>
                `<span class="condition-tag">${c.trim()}</span>`
            ).join('');
        } else {
            condEl.textContent = 'None reported';
        }

        // Allergies as tags
        const allergyEl = document.getElementById('pAllergies');
        if (profile.allergies && profile.allergies.trim()) {
            allergyEl.innerHTML = profile.allergies.split(',').map(a =>
                `<span class="allergy-tag">${a.trim()}</span>`
            ).join('');
        } else {
            allergyEl.textContent = 'None reported';
        }

        // Profile status — styled badge
        const isComplete = profile.profile_complete;
        const badgeEl = document.getElementById('profileStatusBadge');
        const cardEl  = document.getElementById('profileStatusCard');
        if (badgeEl) {
            badgeEl.innerHTML = isComplete
                ? `<span class="profile-status-badge complete">✅ Complete</span>`
                : `<span class="profile-status-badge incomplete">⚠️ Incomplete</span>`;
        }
        if (cardEl) {
            cardEl.classList.toggle('profile-complete-card', isComplete);
        }

        // Pre-fill patient name in booking form if available
        const nameInput = document.getElementById('tokenPatientName');
        if (nameInput && profile.name) {
            nameInput.value = profile.name;
        }

    } catch (err) {
        console.error('Failed to load profile:', err);
    }
}

// --- Load Appointments ---
async function loadAppointments() {
    try {
        const res = await fetch(`${API_BASE}/api/patient/appointments`, { headers: authHeaders() });
        const appointments = await res.json();

        // Update stats
        document.getElementById('totalApts').textContent = appointments.length;
        document.getElementById('confirmedApts').textContent = appointments.filter(a => a.status === 'Confirmed').length;

        const area = document.getElementById('appointmentsArea');

        if (appointments.length === 0) {
            area.innerHTML = `
                <div class="empty-state">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    <p>No appointments yet. Book your first appointment above.</p>
                </div>`;
            return;
        }

        area.innerHTML = `
            <table class="apt-table">
                <thead>
                    <tr>
                        <th>Doctor</th>
                        <th>Department</th>
                        <th>Token / Disease</th>
                        <th>Date</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${appointments.map(apt => `
                        <tr>
                            <td><strong>${apt.doctor}</strong></td>
                            <td>${apt.department}</td>
                            <td style="color:var(--primary);font-weight:600">${apt.notes || '—'}</td>
                            <td>${new Date(apt.appointment_date).toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'})}</td>
                            <td><span class="status-badge ${apt.status.toLowerCase()}">${apt.status}</span></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>`;

    } catch (err) {
        console.error('Failed to load appointments:', err);
    }
}

// ==================== DISEASE FILTER & DOCTOR CARDS ====================

// Load disease list into the filter dropdown
async function loadDiseaseFilter() {
    try {
        const res = await fetch(`${API_BASE}/api/disease-list`);
        const diseases = await res.json();
        bookingState.diseases = diseases;

        const select = document.getElementById('diseaseFilter');
        diseases.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d;
            opt.textContent = d;
            select.appendChild(opt);
        });

        // Listen for change
        select.addEventListener('change', () => {
            loadDoctors(select.value || null);
        });

    } catch (err) {
        console.error('Failed to load disease list:', err);
    }
}

// Load doctors (optionally filtered by disease)
async function loadDoctors(disease = null) {
    const grid = document.getElementById('doctorsGrid');
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>Loading doctors...</p></div>`;

    try {
        let url = `${API_BASE}/api/doctors`;
        if (disease) url += `?disease=${encodeURIComponent(disease)}`;

        const res = await fetch(url);
        const doctors = await res.json();
        bookingState.doctors = doctors;

        if (doctors.length === 0) {
            grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>No doctors found for this selection.</p></div>`;
            return;
        }

        grid.innerHTML = doctors.map(doc => `
            <div class="doctor-card" onclick="openDoctorProfile(${doc.id})">
                <div class="doctor-card-top">
                    <div class="doctor-avatar" style="background:${doc.avatar_color}">
                        ${doc.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                    </div>
                    <div class="doctor-card-info">
                        <h4>${doc.name}</h4>
                        <p>${doc.specialization}</p>
                    </div>
                </div>
                <div class="doctor-card-meta">
                    <span class="doctor-rating">⭐ ${doc.rating}</span>
                    <span class="doctor-exp">${doc.experience_years} yrs exp</span>
                </div>
                <button class="btn-view-profile" onclick="event.stopPropagation(); openDoctorProfile(${doc.id})">
                    View Profile & Book
                </button>
            </div>
        `).join('');

    } catch (err) {
        console.error('Failed to load doctors:', err);
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>Error loading doctors. Is the server running?</p></div>`;
    }
}

// ==================== DOCTOR MINI PROFILE MODAL ====================

async function openDoctorProfile(doctorId) {
    try {
        const res = await fetch(`${API_BASE}/api/doctors/${doctorId}`);
        const doc = await res.json();

        const content = document.getElementById('doctorProfileContent');
        content.innerHTML = `
            <div class="profile-modal-header">
                <div class="profile-avatar-lg" style="background:${doc.avatar_color}">
                    ${doc.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                </div>
                <div class="profile-header-info">
                    <h2>${doc.name}</h2>
                    <span class="spec-badge">${doc.specialization}</span>
                    <p style="font-size:0.8rem;color:#64748b;margin-top:0.3rem">${doc.qualification}</p>
                </div>
            </div>

            <div class="profile-stats-row">
                <div class="profile-stat">
                    <div class="profile-stat-value">${doc.experience_years}</div>
                    <div class="profile-stat-label">Years Exp</div>
                </div>
                <div class="profile-stat">
                    <div class="profile-stat-value">⭐ ${doc.rating}</div>
                    <div class="profile-stat-label">Rating</div>
                </div>
                <div class="profile-stat">
                    <div class="profile-stat-value">30</div>
                    <div class="profile-stat-label">Daily Slots</div>
                </div>
            </div>

            <p class="profile-bio">${doc.bio}</p>

            <div style="margin-bottom:0.5rem;font-size:0.8rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Treats Diseases</div>
            <div class="profile-diseases-list">
                ${(doc.diseases || []).map(d => `<span class="profile-disease-tag">${d}</span>`).join('')}
            </div>

            <button class="btn-book-doctor" onclick="openBookingFromProfile(${doc.id}, '${doc.name.replace(/'/g, "\\'")}', '${doc.specialization.replace(/'/g, "\\'")}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:middle;margin-right:6px"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                Book Appointment
            </button>
        `;

        document.getElementById('doctorProfileModal').classList.add('active');

    } catch (err) {
        showToast('❌ Failed to load doctor profile.');
    }
}

function closeDoctorProfile() {
    document.getElementById('doctorProfileModal').classList.remove('active');
}

// Close modal on backdrop click
document.getElementById('doctorProfileModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeDoctorProfile();
});

// ==================== BOOKING MODAL ====================

function openBookingFromProfile(doctorId, doctorName, doctorSpec) {
    closeDoctorProfile();

    bookingState.selectedDoctorId = doctorId;
    bookingState.selectedDoctorName = doctorName;
    bookingState.selectedDoctorSpec = doctorSpec;

    // Determine the disease from current filter or first disease
    const filterValue = document.getElementById('diseaseFilter').value;
    bookingState.selectedDisease = filterValue || 'General Consultation';

    document.getElementById('bookingDoctorName').textContent = doctorName;
    document.getElementById('bookingDoctorSpec').textContent = doctorSpec;
    document.getElementById('bookingDiseaseName').textContent = bookingState.selectedDisease;

    // Reset form
    document.getElementById('tokenDate').value = '';
    document.getElementById('slotInfoBar').style.display = 'none';
    document.getElementById('tokenBookBtn').disabled = false;
    document.getElementById('tokenBookBtn').textContent = 'Book Token';

    // Set min date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('tokenDate').setAttribute('min', today);

    document.getElementById('bookingModal').classList.add('active');
}

function closeBookingModal() {
    document.getElementById('bookingModal').classList.remove('active');
}

document.getElementById('bookingModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeBookingModal();
});

// --- Date change → check slots ---
document.getElementById('tokenDate')?.addEventListener('change', async (e) => {
    const date = e.target.value;
    if (!date || !bookingState.selectedDoctorId) return;

    try {
        const res = await fetch(`${API_BASE}/api/doctors/${bookingState.selectedDoctorId}/slots?date=${date}`);
        const slots = await res.json();

        const bar = document.getElementById('slotInfoBar');
        const fill = document.getElementById('slotProgressFill');
        const text = document.getElementById('slotText');
        const avail = document.getElementById('slotAvailable');
        const bookBtn = document.getElementById('tokenBookBtn');

        bar.style.display = 'block';
        fill.style.width = `${(slots.booked / slots.max_tokens) * 100}%`;
        text.textContent = `${slots.booked} / ${slots.max_tokens} booked`;

        if (slots.available > 0) {
            avail.textContent = `${slots.available} available`;
            avail.classList.remove('full');
            bookBtn.disabled = false;
            bookBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:middle;margin-right:6px"><path d="M20 6L9 17l-5-5"/></svg>
                Book Token
            `;
        } else {
            avail.textContent = 'FULL — No slots';
            avail.classList.add('full');
            bookBtn.disabled = true;
            bookBtn.textContent = 'No Slots Available';
            fill.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
        }

    } catch (err) {
        console.error('Failed to check slots:', err);
    }
});

// --- Handle Token Booking ---
async function handleTokenBooking(e) {
    e.preventDefault();

    const btn = document.getElementById('tokenBookBtn');
    btn.disabled = true;
    btn.textContent = 'Booking...';

    const date = document.getElementById('tokenDate').value;
    const patientName = document.getElementById('tokenPatientName').value;

    try {
        const res = await fetch(`${API_BASE}/api/book-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                doctor_id: bookingState.selectedDoctorId,
                booking_date: date,
                patient_name: patientName,
                patient_email: '',
                disease: bookingState.selectedDisease
            })
        });

        if (!res.ok) {
            const err = await res.json();
            showToast('❌ ' + (err.detail || 'Booking failed.'));
            btn.disabled = false;
            btn.textContent = 'Book Token';
            return;
        }

        const data = await res.json();

        if (data.status === 'success') {
            const receipt = data.receipt;

            // ✅ Also save to patient's MongoDB appointment history (so it appears in Appointment History)
            try {
                await fetch(`${API_BASE}/api/patient/appointments`, {
                    method: 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify({
                        department: receipt.doctor_specialization,
                        doctor: receipt.doctor_name,
                        appointment_date: receipt.booking_date,
                        notes: `Token #${String(receipt.token_number).padStart(3,'0')} — ${receipt.disease}`
                    })
                });
            } catch (saveErr) {
                console.warn('Could not save appointment to history:', saveErr);
            }

            closeBookingModal();
            showReceipt(receipt);
            showToast('✅ Token booked successfully!');
            // Refresh appointments count
            loadAppointments();
        }

    } catch (err) {
        showToast('❌ Connection error. Please try again.');
        btn.disabled = false;
        btn.textContent = 'Book Token';
    }
}

// ==================== RECEIPT MODAL ====================

function showReceipt(receipt) {
    const content = document.getElementById('receiptContent');

    const formattedDate = new Date(receipt.booking_date).toLocaleDateString('en-IN', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    content.innerHTML = `
        <div class="receipt-wrapper">
            <div class="receipt-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
            </div>
            <h2 class="receipt-title">Booking Confirmed!</h2>
            <p class="receipt-subtitle">Your appointment has been successfully booked</p>

            <div class="receipt-token-badge">#${String(receipt.token_number).padStart(3, '0')}</div>
            <div class="receipt-token-label">Your Token Number</div>

            <div class="receipt-details">
                <div class="receipt-row">
                    <span class="receipt-row-label">Booking ID</span>
                    <span class="receipt-row-value">#${receipt.booking_id}</span>
                </div>
                <div class="receipt-row">
                    <span class="receipt-row-label">Doctor</span>
                    <span class="receipt-row-value">${receipt.doctor_name}</span>
                </div>
                <div class="receipt-row">
                    <span class="receipt-row-label">Specialization</span>
                    <span class="receipt-row-value">${receipt.doctor_specialization}</span>
                </div>
                <div class="receipt-row">
                    <span class="receipt-row-label">Disease</span>
                    <span class="receipt-row-value">${receipt.disease}</span>
                </div>
                <div class="receipt-row">
                    <span class="receipt-row-label">Patient</span>
                    <span class="receipt-row-value">${receipt.patient_name}</span>
                </div>
                <div class="receipt-row">
                    <span class="receipt-row-label">Date</span>
                    <span class="receipt-row-value">${formattedDate}</span>
                </div>
                <div class="receipt-row">
                    <span class="receipt-row-label">Token</span>
                    <span class="receipt-row-value">${receipt.token_number} of ${receipt.max_tokens}</span>
                </div>
                <div class="receipt-row">
                    <span class="receipt-row-label">Status</span>
                    <span class="receipt-row-value"><span class="receipt-status">✅ ${receipt.status}</span></span>
                </div>
            </div>

            <button class="btn-receipt-close" onclick="closeReceiptModal()">Close Receipt</button>
        </div>
    `;

    document.getElementById('receiptModal').classList.add('active');
}

function closeReceiptModal() {
    document.getElementById('receiptModal').classList.remove('active');
}

document.getElementById('receiptModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeReceiptModal();
});

// --- Logout ---
document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('velora_token');
    localStorage.removeItem('velora_patient');
    window.location.href = '/login.html';
});

// --- Sidebar Navigation ---
document.querySelectorAll('.nav-item[data-section]').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');
    });
});

// --- Initialize Dashboard ---
loadProfile();
loadAppointments();
loadDiseaseFilter();
loadDoctors();


// ==================== AI HEALTH CHATBOT ====================

const ASSEMBLYAI_KEY = '0e5c017b0cef48e0bead3f6308a31049';
const TRANSLATE_KEY  = 'sk_7c8knd4x_XfLx20bqQ5LsmfLdhUCPjJjv'; // reserved for translate

const chatState = {
    isOpen: false,
    isRecording: false,
    mediaRecorder: null,
    audioChunks: [],
    initialized: false
};

// ---------- Open / Close ----------
function openChatbot() {
    document.getElementById('chatPanel').classList.add('open');
    document.getElementById('chatOverlay').classList.add('open');
    chatState.isOpen = true;
    if (!chatState.initialized) {
        chatState.initialized = true;
        showWelcomeMessage();
    }
    setTimeout(() => document.getElementById('chatInput')?.focus(), 450);
}

function closeChatbot() {
    document.getElementById('chatPanel').classList.remove('open');
    document.getElementById('chatOverlay').classList.remove('open');
    chatState.isOpen = false;
    window.speechSynthesis?.cancel();
    if (chatState.isRecording) stopRecording();
}

// ---------- Add a message bubble ----------
function addMessage(role, content, isHTML = false) {
    const msgs = document.getElementById('chatMessages');
    const now  = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const avatarChar = role === 'user'
        ? (document.getElementById('userAvatar')?.textContent?.trim() || 'U')
        : '🤖';

    const wrapper = document.createElement('div');
    wrapper.className = `chat-msg ${role}`;

    wrapper.innerHTML = `
        <div class="chat-msg-avatar">${avatarChar}</div>
        <div>
            ${isHTML ? content : `<div class="chat-bubble">${content}</div>`}
            <div class="chat-time">${now}</div>
        </div>`;

    msgs.appendChild(wrapper);
    msgs.scrollTop = msgs.scrollHeight;
    return wrapper;
}

// ---------- Typing indicator ----------
function showTyping() {
    const msgs = document.getElementById('chatMessages');
    const el = document.createElement('div');
    el.className = 'chat-msg bot';
    el.id = 'chatTyping';
    el.innerHTML = `
        <div class="chat-msg-avatar">🤖</div>
        <div class="chat-typing">
            <div class="typing-dots">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        </div>`;
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
}
function hideTyping() {
    document.getElementById('chatTyping')?.remove();
}

// ---------- Welcome message ----------
function showWelcomeMessage() {
    const welcomeHTML = `
        <div class="chat-bubble" style="background:linear-gradient(135deg,#0c1222,#1e293b);color:#fff;border:none;max-width:340px">
            <div style="font-size:1.4rem;margin-bottom:0.4rem">🏥 Hi! I'm Velora AI</div>
            <div style="font-size:0.82rem;color:#94a3b8;line-height:1.65">
                Your personal AI Health Assistant. I can answer questions about:
                <div style="margin-top:0.55rem;display:flex;flex-direction:column;gap:0.3rem">
                    <span>🔬 Any A–Z disease information</span>
                    <span>🔴 Symptoms & warning signs</span>
                    <span>💊 Treatments & therapies</span>
                    <span>🤖 AI diagnostic insights</span>
                    <span>🎙️ Voice-powered queries</span>
                </div>
            </div>
        </div>
        <div class="chat-chips">
            <span class="chat-chip" onclick="quickChat('Tell me about Diabetes')">🩸 Diabetes</span>
            <span class="chat-chip" onclick="quickChat('Asthma symptoms')">🫁 Asthma</span>
            <span class="chat-chip" onclick="quickChat('Migraine treatment')">🧠 Migraine</span>
            <span class="chat-chip" onclick="quickChat('Hypertension info')">❤️ Hypertension</span>
            <span class="chat-chip" onclick="quickChat('Epilepsy AI insight')">⚡ Epilepsy</span>
            <span class="chat-chip" onclick="quickChat('Pneumonia overview')">🫁 Pneumonia</span>
        </div>`;

    const msgs = document.getElementById('chatMessages');
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-msg bot';
    wrapper.innerHTML = `<div class="chat-msg-avatar">🤖</div><div>${welcomeHTML}</div>`;
    msgs.appendChild(wrapper);
}

// ---------- Quick-send from chips ----------
function quickChat(text) {
    const input = document.getElementById('chatInput');
    input.value = text;
    sendChatMessage();
}

// ---------- Main send function ----------
async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    if (!message) return;

    input.value = '';
    input.style.height = 'auto';
    addMessage('user', message);

    showTyping();
    document.getElementById('chatSendBtn').disabled = true;

    try {
        const res = await fetch(`${API_BASE}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });
        const data = await res.json();
        await new Promise(r => setTimeout(r, 550)); // slight natural delay
        hideTyping();
        renderChatResponse(data);
    } catch (err) {
        hideTyping();
        addMessage('bot', '❌ Server connection error. Please ensure the backend is running.');
    } finally {
        document.getElementById('chatSendBtn').disabled = false;
        document.getElementById('chatInput').focus();
    }
}

// ---------- Render chatbot response ----------
function renderChatResponse({ intent, diseases }) {
    if (!diseases || diseases.length === 0) {
        const msgs = [
            '🔍 I didn\'t find a match. Try asking about a specific disease like <b>Diabetes</b>, <b>Asthma</b>, or <b>Migraine</b>.',
            '💡 Ask me things like: <i>"What are symptoms of Epilepsy?"</i> or <i>"How is Hypertension treated?"</i>',
            '🏥 No results found. Try browsing the A–Z disease list from the sidebar!'
        ];
        const pick = msgs[Math.floor(Math.random() * msgs.length)];
        addMessage('bot', pick);

        // Suggest popular diseases
        const suggestions = ['Diabetes','Asthma','Hypertension','Migraine','Glaucoma','Pneumonia','Stroke','Epilepsy'];
        const msgs2 = document.getElementById('chatMessages');
        const extra = document.createElement('div');
        extra.style.cssText = 'margin-top:-0.5rem;padding-left:2.5rem';
        extra.innerHTML = `<div class="chat-chips">
            <span style="font-size:0.72rem;color:#64748b;font-weight:600;width:100%;display:block;margin-bottom:0.2rem">Try one of these:</span>
            ${suggestions.map(s => `<span class="chat-chip" onclick="quickChat('${s}')">${s}</span>`).join('')}
        </div>`;
        msgs2.appendChild(extra);
        msgs2.scrollTop = msgs2.scrollHeight;
        speakText('I could not find a match. Please ask about a specific disease name.');
        return;
    }

    if (diseases.length === 1) {
        renderDiseaseCard(diseases[0], intent);
        return;
    }

    addMessage('bot', `🔍 Found <b>${diseases.length} results</b> for your query:`);
    diseases.forEach(d => renderDiseaseCard(d, intent));
}

// ---------- Render one disease card ----------
function renderDiseaseCard(d, intent) {
    let body = '';
    let speakText_ = '';

    if (intent === 'symptoms') {
        body = `<div><div class="chat-section-label">🔴 Symptoms</div>
                    <div class="chat-section-text">${d.symptoms}</div></div>`;
        speakText_ = `Symptoms of ${d.name}: ${d.symptoms}`;
    } else if (intent === 'treatment') {
        body = `<div><div class="chat-section-label">💊 Treatment</div>
                    <div class="chat-section-text">${d.treatment}</div></div>`;
        speakText_ = `Treatment for ${d.name}: ${d.treatment}`;
    } else if (intent === 'ai_insight') {
        body = `<div class="chat-ai-insight"><span>🤖</span><span>${d.ai_insight}</span></div>`;
        speakText_ = `AI insight for ${d.name}: ${d.ai_insight}`;
    } else {
        body = `
            <div><div class="chat-section-label">📖 Overview</div>
                 <div class="chat-section-text">${d.overview}</div></div>
            <div><div class="chat-section-label">🔴 Symptoms</div>
                 <div class="chat-section-text">${d.symptoms}</div></div>
            <div><div class="chat-section-label">💊 Treatment</div>
                 <div class="chat-section-text">${d.treatment}</div></div>
            <div class="chat-ai-insight"><span>🤖</span><span>${d.ai_insight}</span></div>`;
        speakText_ = `${d.name} is a ${d.category} condition. ${d.overview}. Symptoms include: ${d.symptoms}. Treatment: ${d.treatment}`;
    }

    const safeName = d.name.replace(/'/g, "\\'");
    const cardHTML = `
        <div class="chat-disease-card">
            <div class="chat-disease-hdr">
                <div class="chat-disease-name">${d.name}</div>
                <div>
                    <span class="chat-disease-cat">${d.category}</span>
                    ${d.severity ? `<span class="chat-disease-cat" style="background:rgba(239,68,68,0.2);color:#fca5a5">⚡ ${d.severity}</span>` : ''}
                </div>
            </div>
            <div class="chat-disease-body">${body}</div>
        </div>
        <div class="chat-chips">
            <span class="chat-chip" onclick="quickChat('symptoms of ${safeName}')">🔴 Symptoms</span>
            <span class="chat-chip" onclick="quickChat('treatment for ${safeName}')">💊 Treatment</span>
            <span class="chat-chip" onclick="quickChat('AI insight ${safeName}')">🤖 AI Insight</span>
        </div>`;

    addMessage('bot', cardHTML, true);
    speakText(speakText_);
}

// ==================== TEXT-TO-SPEECH (Web Speech API) ====================
function speakText(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const clean = text.replace(/[\u{1F000}-\u{1FFFF}]/gu, '').replace(/[🔬🩺💊🎙️🔍💡🏥🔴🤖📖⚡❤️🧠🫁🩸]/g, '').trim();
    if (!clean) return;
    const utt = new SpeechSynthesisUtterance(clean);
    utt.rate = 0.93; utt.pitch = 1.0; utt.volume = 0.95;
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v =>
        v.name.includes('Google UK English Female') ||
        v.name.includes('Google US English') ||
        v.name.includes('Microsoft Aria') ||
        v.name.includes('Microsoft Zira')
    ) || voices.find(v => v.lang.startsWith('en'));
    if (voice) utt.voice = voice;
    window.speechSynthesis.speak(utt);
}

// ==================== SPEECH-TO-TEXT (AssemblyAI + fallback) ====================
async function toggleVoiceInput() {
    chatState.isRecording ? stopRecording() : startRecording();
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        chatState.audioChunks = [];
        const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
        chatState.mediaRecorder = new MediaRecorder(stream, { mimeType: mime });

        chatState.mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chatState.audioChunks.push(e.data); };
        chatState.mediaRecorder.onstop = async () => {
            stream.getTracks().forEach(t => t.stop());
            const blob = new Blob(chatState.audioChunks, { type: mime });
            await processAudio(blob);
        };

        chatState.mediaRecorder.start();
        chatState.isRecording = true;
        document.getElementById('chatMicBtn').classList.add('recording');
        document.getElementById('chatVoiceIndicator').classList.add('active');
        document.getElementById('chatInput').placeholder = '🎙️ Listening... tap mic again to stop';

    } catch (err) {
        if (err.name === 'NotAllowedError') {
            showToast('❌ Microphone permission denied.');
        } else {
            // Fallback to browser STT directly
            useBrowserSTT();
        }
    }
}

function stopRecording() {
    if (chatState.mediaRecorder && chatState.isRecording) {
        chatState.mediaRecorder.stop();
        chatState.isRecording = false;
        document.getElementById('chatMicBtn').classList.remove('recording');
        document.getElementById('chatVoiceIndicator').classList.remove('active');
        document.getElementById('chatInput').placeholder = '⏳ Processing...';
    }
}

async function processAudio(blob) {
    try {
        // 1. Upload to AssemblyAI
        const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
            method: 'POST',
            headers: { 'authorization': ASSEMBLYAI_KEY, 'content-type': 'application/octet-stream' },
            body: blob
        });
        if (!uploadRes.ok) throw new Error('upload_failed');
        const { upload_url } = await uploadRes.json();

        // 2. Request transcription
        const txRes = await fetch('https://api.assemblyai.com/v2/transcript', {
            method: 'POST',
            headers: { 'authorization': ASSEMBLYAI_KEY, 'content-type': 'application/json' },
            body: JSON.stringify({ audio_url: upload_url, language_code: 'en' })
        });
        const { id } = await txRes.json();

        // 3. Poll for result
        let result, tries = 0;
        do {
            await new Promise(r => setTimeout(r, 1500));
            const poll = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
                headers: { 'authorization': ASSEMBLYAI_KEY }
            });
            result = await poll.json();
            tries++;
        } while (result.status !== 'completed' && result.status !== 'error' && tries < 25);

        if (result.status === 'completed' && result.text) {
            document.getElementById('chatInput').value = result.text;
            document.getElementById('chatInput').placeholder = 'Ask about any disease, symptoms, treatment...';
            sendChatMessage();
        } else {
            throw new Error('transcription_failed');
        }

    } catch (_) {
        // Fallback to browser speech recognition
        document.getElementById('chatInput').placeholder = 'Ask about any disease, symptoms, treatment...';
        useBrowserSTT();
    }
}

function useBrowserSTT() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showToast('❌ Speech recognition not supported in this browser.'); return; }
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.onresult = e => {
        const text = e.results[0][0].transcript;
        document.getElementById('chatInput').value = text;
        sendChatMessage();
    };
    rec.onerror = () => showToast('❌ Speech recognition error. Please type your query.');
    rec.start();
    document.getElementById('chatMicBtn').classList.add('recording');
    rec.onend = () => document.getElementById('chatMicBtn').classList.remove('recording');
}

// ---------- Input keyboard & resize ----------
document.getElementById('chatInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
});
document.getElementById('chatInput')?.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 90) + 'px';
});
