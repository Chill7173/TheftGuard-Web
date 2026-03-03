// ==========================================
// 1. FIREBASE SETUP & GLOBAL VARIABLES
// ==========================================

const firebaseConfig = {
    apiKey: "AIzaSyCgs1XEForas7sCQvyvth6oB75GOu1k4c4",
    authDomain: "theftguard-iot.firebaseapp.com",
    databaseURL: "https://theftguard-iot-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "theftguard-iot",
    storageBucket: "theftguard-iot.firebasestorage.app",
    messagingSenderId: "466492128446",
    appId: "1:466492128446:web:bbdc92edfe4141736df2ef"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth();

let currentUserUid = null;
let currentDeviceRef = null;
let realTimeReadings = [];
let pairedMacAddress = null;

// Phase 1: Settings, Notifications, & Alerts
let notificationHistory = [];
let userSettings = {
    theme: 'dark',
    unit: 'A',
    refresh: 10,
    alertTheft: true,
    alertAnomalies: true,
    alertSummaryEmail: false
};
let deviceOnline = false;
let lastTheftAlert = 0;
let lastAnomalyAlert = 0;

// ==========================================
// 1.5 NOTIFICATION & SETTINGS SYSTEM (Phase 1)
// ==========================================

function showToast(title, message, type = 'info', duration = 5000) {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return; // Safety check
    
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    toast.innerHTML = `
        <div class="toast-title">
            <i class="bi bi-${type === 'critical' ? 'exclamation-triangle-fill' : type === 'warning' ? 'exclamation-circle-fill' : type === 'success' ? 'check-circle-fill' : 'info-circle-fill'}"></i>
            ${title}
        </div>
        <div class="toast-message">${message}</div>
    `;
    toastContainer.appendChild(toast);
    
    // Add to notification history (but only for non-info types)
    if (type !== 'info') {
        addNotification(title, message, type);
    }
    
    // Auto-dismiss
    if (duration > 0) {
        setTimeout(() => {
            toast.classList.add('removing');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
}

function addNotification(title, message, type = 'info') {
    const notification = {
        id: Date.now(),
        title,
        message,
        type,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        read: false
    };
    
    notificationHistory.unshift(notification);
    if (notificationHistory.length > 50) notificationHistory.pop();
    
    updateNotificationBadge();
    updateNotificationList();
}

function updateNotificationBadge() {
    const unreadCount = notificationHistory.filter(n => !n.read).length;
    const badge = document.getElementById('notificationBadge');
    if (badge) {
        if (unreadCount > 0) {
            badge.textContent = unreadCount;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }
}

function updateNotificationList() {
    const notificationList = document.getElementById('notificationList');
    if (!notificationList) return;
    
    if (notificationHistory.length === 0) {
        notificationList.innerHTML = '<div class="notification-empty">No notifications yet</div>';
        return;
    }
    
    notificationList.innerHTML = notificationHistory.map(notif => `
        <div class="notification-item" onclick="markNotificationAsRead(${notif.id})">
            <div class="notification-item-header">
                <div class="notification-badge-${notif.type}"></div>
                <span class="notification-item-title">${notif.title}</span>
                <span class="notification-item-time">${notif.timestamp}</span>
            </div>
            <div class="notification-item-text">${notif.message}</div>
        </div>
    `).join('');
}

function markNotificationAsRead(notifId) {
    const notif = notificationHistory.find(n => n.id === notifId);
    if (notif) notif.read = true;
    updateNotificationBadge();
    updateNotificationList();
}

function clearAllNotifications() {
    notificationHistory = [];
    updateNotificationBadge();
    updateNotificationList();
}

function toggleNotificationCenter() {
    const center = document.getElementById('notificationCenter');
    if (!center) return;
    
    const isHidden = center.style.display === 'none' || center.style.display === '';
    center.style.display = isHidden ? 'block' : 'none';
    
    // Mark all as read when opening
    if (isHidden) {
        notificationHistory.forEach(n => n.read = true);
        updateNotificationBadge();
        updateNotificationList();
    }
}

function toggleMobileMenu() {
    const menu = document.getElementById('mobileMenu');
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
    }
}

function changeSetting(key, value) {
    userSettings[key] = value;
    localStorage.setItem('theftguardSettings', JSON.stringify(userSettings));
    
    // Apply settings immediately
    if (key === 'unit') {
        // Refresh display with new unit
        if (realTimeReadings.length > 0) {
            const last = realTimeReadings[realTimeReadings.length - 1];
            updateReadingDisplay(last.pole_current, last.house_current);
        }
        // recalc analytics with new unit labels
        if (typeof calculateAnalytics === 'function') {
            calculateAnalytics();
        }
        // if automation page is visible, refresh thresholds display
        const autoPage = document.getElementById('automationPage');
        if (autoPage && autoPage.style.display !== 'none' && typeof updateRulesList === 'function') {
            updateRulesList();
        }
    }
    
    showToast('Settings Updated', `${key} changed to ${value}`, 'success', 3000);
}

function updateReadingDisplay(poleVal, houseVal) {
    const poleDisplay = document.getElementById('poleCurrent');
    const houseDisplay = document.getElementById('houseCurrent');
    
    if (!poleDisplay || !houseDisplay) return;
    
    let poleText = parseFloat(poleVal).toFixed(2);
    let houseText = parseFloat(houseVal).toFixed(2);
    
    // Convert based on unit
    if (userSettings.unit === 'W') {
        poleText = (parseFloat(poleVal) * 230).toFixed(2);
        houseText = (parseFloat(houseVal) * 230).toFixed(2);
    } else if (userSettings.unit === 'kW') {
        poleText = (parseFloat(poleVal) * 230 / 1000).toFixed(2);
        houseText = (parseFloat(houseVal) * 230 / 1000).toFixed(2);
    }
    
    poleDisplay.innerText = `${poleText} ${userSettings.unit}`;
    houseDisplay.innerText = `${houseText} ${userSettings.unit}`;
    
    // also update analytics when readings change
    if (typeof analyticsDebounce === 'function' && analyticsDebounce()) {
        if (typeof calculateAnalytics === 'function' && document.getElementById('analyticsPage').style.display !== 'none') {
            calculateAnalytics();
        }
    }
}

function loadSettings() {
    const saved = localStorage.getItem('theftguardSettings');
    if (saved) {
        try {
            userSettings = { ...userSettings, ...JSON.parse(saved) };
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
    }
    
    // Update form values
    const unitSelect = document.getElementById('unitSelect');
    if (unitSelect) unitSelect.value = userSettings.unit;
    
    const refreshSelect = document.getElementById('refreshSelect');
    if (refreshSelect) refreshSelect.value = userSettings.refresh;
    
    const alertTheft = document.getElementById('alertTheft');
    if (alertTheft) alertTheft.checked = userSettings.alertTheft;
    
    const alertAnomalies = document.getElementById('alertAnomalies');
    if (alertAnomalies) alertAnomalies.checked = userSettings.alertAnomalies;
    
    const alertEmail = document.getElementById('alertSummaryEmail');
    if (alertEmail) alertEmail.checked = userSettings.alertSummaryEmail;
}

function updateDeviceStatus(online) {
    deviceOnline = online;
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    
    if (statusDot) {
        if (online) {
            statusDot.classList.add('online');
        } else {
            statusDot.classList.remove('online');
        }
    }
    
    if (statusText) {
        statusText.textContent = online ? 'Online' : 'Offline';
    }
}



// ==========================================
// 2. DEVICE PAIRING & LIVE LISTENER
// ==========================================

function loadPairedDevice() {
    document.getElementById('nav-pair').style.display = 'inline-block'; 
    database.ref('users/' + currentUserUid + '/paired_device').once('value').then((snapshot) => {
        const macAddress = snapshot.val();
        if (macAddress) {
            document.getElementById('pairedDeviceLabel').innerText = "✅ Connected to: " + macAddress;
            document.getElementById('macInput').value = macAddress;
            startListeningToDevice(macAddress);
        } else {
            document.getElementById('pairedDeviceLabel').innerText = "⚠️ No device paired yet. Please enter your hardware MAC.";
        }
    });
}

function pairDevice() {
    const mac = document.getElementById('macInput').value.trim().toUpperCase();
    if (!mac) return alert("Please enter a valid MAC address.");
    database.ref('users/' + currentUserUid + '/paired_device').set(mac).then(() => {
        alert("Device paired successfully!");
        document.getElementById('pairedDeviceLabel').innerText = "✅ Connected to: " + mac;
        startListeningToDevice(mac); 
        bootstrap.Modal.getInstance(document.getElementById('pairingModal')).hide();
    });
}

function startListeningToDevice(macAddress) {
    if (currentDeviceRef) currentDeviceRef.off();
    pairedMacAddress = macAddress;
    realTimeReadings = [];
    lastTheftAlert = 0;
    lastAnomalyAlert = 0;
    currentDeviceRef = database.ref('live_grid/' + macAddress);
    
    currentDeviceRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            let poleVal = parseFloat(data.pole).toFixed(2);
            let houseVal = parseFloat(data.house).toFixed(2);
            const difference = parseFloat(poleVal) - parseFloat(houseVal);
            
            // Store real-time reading with timestamp
            realTimeReadings.push({
                timestamp: new Date().toISOString(),
                pole_current: parseFloat(poleVal),
                house_current: parseFloat(houseVal),
                difference: difference,
                line_loss: ((difference) / parseFloat(poleVal) * 100).toFixed(2) + "%"
            });
            
            // Keep only last 1000 readings to avoid memory bloat
            if (realTimeReadings.length > 1000) {
                realTimeReadings.shift();
            }
            
            // Update device status to online
            if (!deviceOnline) {
                updateDeviceStatus(true);
            }
            
            // Update display with current unit
            updateReadingDisplay(poleVal, houseVal);
            
            // Evaluate automation rules (Phase 2)
            if (typeof evaluateRules === 'function') {
                evaluateRules(parseFloat(poleVal), parseFloat(houseVal));
            }

            // Update analytics in real-time if page is visible (Phase 3)
            if (typeof analyticsDebounce === 'function' && analyticsDebounce()) {
                if (typeof calculateAnalytics === 'function' && document.getElementById('analyticsPage').style.display !== 'none') {
                    calculateAnalytics();
                }
            }
            
            // ==================== THEFT DETECTION ====================
            if (difference > 1.0) {
                // Theft detected
                const banner = document.getElementById('theftAlertBanner');
                document.querySelectorAll('.card-custom')[0].classList.add('theft-active');
                document.querySelectorAll('.card-custom')[2].classList.add('theft-active'); 
                if (banner) banner.style.display = "block"; 
                
                // Generate toast alert (rate-limited to once per minute)
                const now = Date.now();
                if (now - lastTheftAlert > 60000 && userSettings.alertTheft) {
                    showToast(
                        '🚨 THEFT ALERT!',
                        `Potential energy theft detected! Difference: ${difference.toFixed(2)}A`,
                        'critical',
                        0  // Don't auto-dismiss critical alerts
                    );
                    lastTheftAlert = now;
                }
            } else {
                // No theft
                document.querySelectorAll('.card-custom').forEach(el => el.classList.remove('theft-active'));
                const banner = document.getElementById('theftAlertBanner');
                if (banner) banner.style.display = "none"; 
            }
            
            // ==================== ANOMALY DETECTION ====================
            if (realTimeReadings.length >= 10) {
                const recent = realTimeReadings.slice(-10);
                const avgDifference = recent.reduce((sum, r) => sum + r.difference, 0) / recent.length;
                const stdDev = Math.sqrt(recent.reduce((sum, r) => sum + Math.pow(r.difference - avgDifference, 2), 0) / recent.length);
                const threshold = avgDifference + (2 * stdDev);
                
                if (difference > threshold && userSettings.alertAnomalies) {
                    const now = Date.now();
                    if (now - lastAnomalyAlert > 120000) {  // Rate-limit to once per 2 minutes
                        showToast(
                            '⚠️ ANOMALY DETECTED',
                            `Unusual energy pattern detected (${difference.toFixed(2)}A vs avg ${avgDifference.toFixed(2)}A)`,
                            'warning',
                            5000
                        );
                        lastAnomalyAlert = now;
                    }
                }
            }
        }
    }, (error) => {
        if (error.code === 'PERMISSION_DENIED') {
            showToast('Connection Error', 'Cannot access device data', 'warning', 5000);
            updateDeviceStatus(false);
        }
    });
}

// ==========================================
// 3. FIREBASE AUTHENTICATION
// ==========================================

auth.onAuthStateChanged((user) => {
    if (user && user.emailVerified) {
        currentUserUid = user.uid; 
        document.getElementById('landingPage').classList.add('hidden');
        document.getElementById('loginPage').style.display = 'none';
        document.getElementById('loginBtn').style.display = 'none';
        document.getElementById('userProfile').style.display = 'flex';
        document.getElementById('nav-dash').style.display = 'block';
        document.getElementById('nav-control').style.display = 'block';
        document.getElementById('nav-cost').style.display = 'block';
        document.getElementById('nav-dataset').style.display = 'block';
        const username = user.displayName ? user.displayName.toUpperCase() : user.email.split('@')[0].toUpperCase();
        document.getElementById('userNameDisplay').innerText = username;
        loadPairedDevice(); 
        showPage('dashboard');
    } else if (user && !user.emailVerified) {
        auth.signOut();
    } else {
        currentUserUid = null;
        document.getElementById('landingPage').classList.remove('hidden');
        document.getElementById('loginPage').style.display = 'none';
        document.getElementById('loginBtn').style.display = 'block';
        document.getElementById('userProfile').style.display = 'none';
        document.getElementById('nav-dash').style.display = 'none';
        document.getElementById('nav-control').style.display = 'none';
        document.getElementById('nav-cost').style.display = 'none';
        document.getElementById('nav-dataset').style.display = 'none';
        document.getElementById('dashboardPage').style.display = 'none';
        document.getElementById('controlPage').style.display = 'none';
        document.getElementById('costPage').style.display = 'none';
        document.getElementById('settingsPage').style.display = 'none';
        document.getElementById('datasetPage').style.display = 'none';
    }
});

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function handleRegister(e) {
    e.preventDefault();
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerPasswordConfirm').value;
    const registerBtn = document.getElementById('registerBtn');

    if (!email || !password) return alert("Please enter both an email and a password.");
    if (!isValidEmail(email)) return alert("Please enter a valid email address.");
    if (password.length < 6) return alert("Firebase requires passwords to be at least 6 characters long.");
    if (password !== confirmPassword) return alert("Passwords do not match.");

    registerBtn.innerText = "Creating..."; registerBtn.disabled = true;

    auth.createUserWithEmailAndPassword(email, password).then((userCredential) => {
        userCredential.user.sendEmailVerification().then(() => {
            alert("Account created! A verification link has been sent. Please check your email and verify before logging in.");
            auth.signOut();
            registerBtn.innerText = "Create Account"; registerBtn.disabled = false;
            document.getElementById('registerEmail').value = ""; 
            document.getElementById('registerPassword').value = "";
            document.getElementById('registerPasswordConfirm').value = "";
            toggleForm();
        });
    }).catch((error) => {
        alert("Registration Failed: " + error.message);
        registerBtn.innerText = "Create Account"; registerBtn.disabled = false;
    });
}

function handleLogin(e) {
    e.preventDefault(); 
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const loginBtn = document.getElementById('loginSubmitBtn');

    if (!email || !password) return alert("Please enter both an email and a password.");
    loginBtn.innerText = "Logging in..."; loginBtn.disabled = true;

    auth.signInWithEmailAndPassword(email, password).then((userCredential) => {
        if (userCredential.user.emailVerified) {
            document.getElementById('loginEmail').value = "";
            document.getElementById('loginPassword').value = "";
            loginBtn.innerText = "Log In"; loginBtn.disabled = false;
        } else {
            alert("Please verify your email before logging in.");
            auth.signOut();
            loginBtn.innerText = "Log In"; loginBtn.disabled = false;
        }
    }).catch((error) => {
        alert("Login Failed: " + error.message);
        loginBtn.innerText = "Log In"; loginBtn.disabled = false;
    });
}

function handleForgotPassword(e) {
    e.preventDefault();
    const email = document.getElementById('forgotEmail').value;
    if (!email) return alert("Please enter your email.");
    if (!isValidEmail(email)) return alert("Please enter a valid email.");
    
    auth.sendPasswordResetEmail(email).then(() => {
        alert("Password reset email sent! Check your inbox.");
        document.getElementById('forgotEmail').value = "";
    }).catch((error) => {
        alert("Error: " + error.message);
    });
}

function handleLogout() {
    if (confirm("Are you sure you want to logout?")) {
        auth.signOut();
    }
}

function navigateToLogin() {
    document.getElementById('landingPage').classList.add('hidden');
    document.getElementById('loginPage').style.display = 'block';
}

function toggleForm() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    loginForm.style.display = loginForm.style.display === 'none' ? 'block' : 'none';
    registerForm.style.display = registerForm.style.display === 'none' ? 'block' : 'none';
}

function changeUsername() {
    const user = auth.currentUser;
    const newUsername = document.getElementById('newUsernameInput').value;
    if (!newUsername) return alert("Please enter a new username.");
    user.updateProfile({ displayName: newUsername }).then(() => {
        document.getElementById('userNameDisplay').innerText = newUsername.toUpperCase();
        document.getElementById('newUsernameInput').value = "";
        alert("Username updated successfully!");
    }).catch((err) => alert("Error: " + err.message));
}

function sendPasswordReset() {
    const user = auth.currentUser;
    if (!user) return alert("No user logged in.");
    auth.sendPasswordResetEmail(user.email).then(() => alert("Reset email sent!"))
        .catch(err => alert("Error: " + err.message));
}

// ==========================================
// 4. PAGE NAVIGATION
// ==========================================

function showPage(pageName) {
    // Hide all pages
    document.getElementById('dashboardPage').style.display = 'none';
    document.getElementById('controlPage').style.display = 'none';
    document.getElementById('costPage').style.display = 'none';
    document.getElementById('datasetPage').style.display = 'none';
    document.getElementById('settingsPage').style.display = 'none';
    document.getElementById('automationPage').style.display = 'none';
    document.getElementById('analyticsPage').style.display = 'none';

    // Update active nav link
    document.querySelectorAll('.nav-link-custom').forEach(link => link.classList.remove('active'));
    document.getElementById(`nav-${pageName}`)?.classList.add('active');

    // Show selected page
    document.getElementById(`${pageName}Page`).style.display = 'block';

    // Load data for specific pages
    if (pageName === 'automation' && typeof loadRules === 'function') {
        loadRules();
    } else if (pageName === 'analytics' && typeof calculateAnalytics === 'function') {
        // Delay slightly to ensure DOM elements are fully rendered
        setTimeout(() => {
            try {
                calculateAnalytics();
            } catch (e) {
                console.error('Error loading analytics:', e);
            }
        }, 50);
    }

    window.scrollTo(0, 0);
    // Special handlers
    if (pageName === 'dataset') loadDatasetPage();
    if (pageName === 'cost') updateCostPage();
}

// ==========================================
// 5. COST PAGE
// ==========================================

function updateCostPage() {
    if (realTimeReadings.length === 0) {
        document.getElementById('costValue').innerText = "$0.00";
        document.getElementById('usageValue').innerText = "0 kWh";
        return;
    }
    const readings = realTimeReadings; 
    let energyUsed = 0;
    for (let i = 1; i < readings.length; i++) {
        const timeGap = (new Date(readings[i].timestamp) - new Date(readings[i-1].timestamp)) / 3600000;
        energyUsed += readings[i].house_current * timeGap;
    }
    const costPerKwh = 0.12;
    const totalCost = (energyUsed / 1000) * costPerKwh;
    document.getElementById('costValue').innerText = "$" + totalCost.toFixed(2);
    document.getElementById('usageValue').innerText = (energyUsed / 1000).toFixed(2) + " kWh";
}

// ==========================================
// 6. CHARTING (for dashboard & cost pages)
// ==========================================

let minuteChart = null;
let hourChart = null;
const chartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: { legend: { display: true, labels: { color: '#fff', font: { size: 12 } } } },
    scales: {
        x: { ticks: { color: '#8e8e93' }, grid: { color: '#333' } },
        y: { ticks: { color: '#8e8e93' }, grid: { color: '#333' } }
    }
};

function updateMinuteData() {
    const ctx = document.getElementById('minuteChart').getContext('2d');
    const labels = [];
    const poleData = [];
    const houseData = [];
    
    const last60 = realTimeReadings.slice(Math.max(0, realTimeReadings.length - 60));
    last60.forEach((reading, idx) => {
        labels.push(idx % 10 === 0 ? new Date(reading.timestamp).toLocaleTimeString([], {minute: '2-digit'}) : '');
        poleData.push(reading.pole_current);
        houseData.push(reading.house_current);
    });
    
    const datasets = [
        { label: 'Pole Current', data: poleData, borderColor: '#ff453a', backgroundColor: 'rgba(255, 69, 58, 0.1)', tension: 0.4 },
        { label: 'House Current', data: houseData, borderColor: '#30d158', backgroundColor: 'rgba(48, 209, 88, 0.1)', tension: 0.4 }
    ];
    
    if (!minuteChart) {
        minuteChart = new Chart(ctx, { type: 'line', data: { labels: labels, datasets: datasets }, options: chartOptions });
    } else {
        minuteChart.data.labels = labels;
        minuteChart.data.datasets = datasets;
        minuteChart.update();
    }
}

function updateHourData() {
    const ctx = document.getElementById('hourChart').getContext('2d');
    const labels = [];
    const avgPole = [];
    const avgHouse = [];
    
    const minuryGroups = [];
    for (let i = 0; i < realTimeReadings.length; i += Math.ceil(realTimeReadings.length / 12)) {
        minuryGroups.push(realTimeReadings.slice(i, i + Math.ceil(realTimeReadings.length / 12)));
    }
    
    minuryGroups.forEach((group, idx) => {
        if (group.length > 0) {
            labels.push(idx + ':00');
            avgPole.push(group.reduce((sum, r) => sum + r.pole_current, 0) / group.length);
            avgHouse.push(group.reduce((sum, r) => sum + r.house_current, 0) / group.length);
        }
    });
    
    const datasets = [
        { label: 'Pole Current', data: avgPole, borderColor: '#ff453a', backgroundColor: 'rgba(255, 69, 58, 0.1)', tension: 0.4 },
        { label: 'House Current', data: avgHouse, borderColor: '#30d158', backgroundColor: 'rgba(48, 209, 88, 0.1)', tension: 0.4 }
    ];
    
    if (!hourChart) {
        hourChart = new Chart(ctx, { type: 'line', data: { labels: labels, datasets: datasets }, options: chartOptions });
    } else {
        hourChart.data.labels = labels;
        hourChart.data.datasets = datasets;
        hourChart.update();
    }
}

function setView(view) {
    document.querySelectorAll('.btn-view').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    if (view === 'minute') updateMinuteData();
    if (view === 'hour') updateHourData();
}

// ==========================================
// 7. DATASET VISUALIZATION ADDON
// ==========================================

let filteredDataset = [];
let numericFields = [];
let categoricalFields = [];
let datetimeFields = [];
let datasetChart = null;

function loadDatasetPage() {
    document.getElementById('datasetChart').style.display = 'none';
    document.getElementById('datasetEmpty').style.display = 'block';
    document.getElementById('liveDataBtn').disabled = false;
    document.getElementById('sampleDataBtn').disabled = false;
}

function loadLiveDeviceData() {
    if (realTimeReadings.length === 0) {
        alert("No real-time data available yet. Please ensure device is paired and transmitting.");
        return;
    }
    
    filteredDataset = JSON.parse(JSON.stringify(realTimeReadings));
    document.getElementById('datasetEmpty').style.display = 'none';
    document.getElementById('datasetChart').style.display = 'block';
    document.getElementById('datasetInfo').innerText = `Loaded ${filteredDataset.length} live readings`;
    
    computeFieldLists();
    updateDatasetVisualization('pole_current', 'distribution');
}

function loadSampleDataset() {
    filteredDataset = [
        { pole_current: 15.2, house_current: 12.8, difference: 2.4, line_loss: '15.79%', timestamp: '2024-01-01T10:00:00Z' },
        { pole_current: 14.8, house_current: 12.5, difference: 2.3, line_loss: '15.54%', timestamp: '2024-01-01T10:01:00Z' },
        { pole_current: 16.1, house_current: 13.2, difference: 2.9, line_loss: '18.01%', timestamp: '2024-01-01T10:02:00Z' },
        { pole_current: 14.5, house_current: 12.2, difference: 2.3, line_loss: '15.86%', timestamp: '2024-01-01T10:03:00Z' },
        { pole_current: 15.7, house_current: 13.0, difference: 2.7, line_loss: '17.20%', timestamp: '2024-01-01T10:04:00Z' },
        { pole_current: 16.3, house_current: 13.5, difference: 2.8, line_loss: '17.18%', timestamp: '2024-01-01T10:05:00Z' },
        { pole_current: 15.0, house_current: 12.6, difference: 2.4, line_loss: '16.00%', timestamp: '2024-01-01T10:06:00Z' },
    ];
    document.getElementById('datasetEmpty').style.display = 'none';
    document.getElementById('datasetChart').style.display = 'block';
    document.getElementById('datasetInfo').innerText = `Loaded ${filteredDataset.length} sample readings`;
    computeFieldLists();
    updateDatasetVisualization('pole_current', 'distribution');
}

function computeFieldLists() {
    if (filteredDataset.length === 0) return;
    numericFields = [];
    categoricalFields = [];
    Object.keys(filteredDataset[0]).forEach(field => {
        const val = filteredDataset[0][field];
        if (!isNaN(val) && val !== null) numericFields.push(field);
        else categoricalFields.push(field);
    });
}

function updateDatasetVisualization(field, chartType) {
    if (chartType === 'distribution') {
        const hist = getHistogram(filteredDataset, field, 15);
        const labels = hist.labels;
        const datasets = [{ label: field, data: Object.values(hist.counts), backgroundColor: '#0a84ff' }];
        createOrUpdateChart(labels, datasets);
    } else if (chartType === 'categorical') {
        const uniqueVals = [...new Set(filteredDataset.map(o => o[field]))];
        const counts = {};
        uniqueVals.forEach(val => counts[val] = filteredDataset.filter(o => o[field] === val).length);
        const labels = Object.keys(counts);
        const datasets = [{ label: first, data: Object.values(counts), backgroundColor: '#0a84ff' }];
        createOrUpdateChart(labels, datasets);
    }
}

function getHistogram(data, field, bins) {
    const values = data.map(o => parseFloat(o[field])).filter(v => !isNaN(v));
    if (values.length === 0) return { labels: [], counts: [] };
    const min = Math.min(...values), max = Math.max(...values);
    bins = bins || 20;
    const step = (max - min) / bins;
    const counts = Array(bins).fill(0);
    const labels = [];
    for (let i = 0; i < bins; i++) {
        const start = min + i * step;
        const end = min + (i + 1) * step;
        labels.push(`${start.toFixed(2)}-${end.toFixed(2)}`);
    }
    values.forEach(v => {
        let idx = Math.floor((v - min) / step);
        if (idx >= bins) idx = bins - 1;
        counts[idx]++;
    });
    return { labels, counts };
}

function createOrUpdateChart(labels, datasets) {
    const ctx = document.getElementById('datasetChart').getContext('2d');
    if (!datasetChart) {
        datasetChart = new Chart(ctx, { type: 'bar', data: { labels: labels, datasets: datasets }, options: JSON.parse(JSON.stringify(chartOptions)) });
    } else {
        datasetChart.data.labels = labels;
        datasetChart.data.datasets = datasets;
        datasetChart.update();
    }
}

function exportDatasetSummary() {
    const rows = [];
    rows.push(['Field', 'Type', 'Unique/Mean?', 'Missing']);
    numericFields.forEach(f => {
        const vals = filteredDataset.map(o => parseFloat(o[f])).filter(v => !isNaN(v));
        const mean = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : '';
        const missing = filteredDataset.filter(o => o[f] == null || o[f] === '').length;
        rows.push([f, 'Numeric', mean, missing]);
    });
    categoricalFields.forEach(f => {
        const uniq = new Set(filteredDataset.map(o => o[f])).size;
        const missing = filteredDataset.filter(o => o[f] == null || o[f] === '').length;
        rows.push([f, 'Categorical', uniq, missing]);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'dataset_summary.csv';
    a.click();
}

function changeSetting(key, value) {
    userSettings[key] = value;
    localStorage.setItem('theftguardSettings', JSON.stringify(userSettings));
    if (key === 'theme') applyTheme(value);
    showToast('Settings Updated', `${key} has been changed`, 'success', 3000);
}

function loadSettings() {
    const saved = localStorage.getItem('theftguardSettings');
    if (saved) userSettings = JSON.parse(saved);
    applyTheme(userSettings.theme);
    document.getElementById('themeSelect').value = userSettings.theme;
    document.getElementById('unitSelect').value = userSettings.unit;
    document.getElementById('refreshSelect').value = userSettings.refresh;
    document.getElementById('alertTheft').checked = userSettings.alertTheft;
    document.getElementById('alertAnomalies').checked = userSettings.alertAnomalies;
    document.getElementById('alertSummaryEmail').checked = userSettings.alertSummaryEmail;
}

function applyTheme(theme) {
    if (theme === 'light') {
        document.body.classList.add('light-theme');
    } else {
        document.body.classList.remove('light-theme');
    }
}

function updateDeviceStatus(online) {
    deviceOnline = online;
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    if (online) {
        statusDot.classList.add('online');
        statusText.textContent = 'Online';
    } else {
        statusDot.classList.remove('online');
        statusText.textContent = 'Offline';
    }
}


// ==========================================
// 2. DEVICE PAIRING & LIVE LISTENER
// ==========================================

function loadPairedDevice() {
    document.getElementById('nav-pair').style.display = 'inline-block'; 
    database.ref('users/' + currentUserUid + '/paired_device').once('value').then((snapshot) => {
        const macAddress = snapshot.val();
        if (macAddress) {
            document.getElementById('pairedDeviceLabel').innerText = "✅ Connected to: " + macAddress;
            document.getElementById('macInput').value = macAddress;
            startListeningToDevice(macAddress);
        } else {
            document.getElementById('pairedDeviceLabel').innerText = "⚠️ No device paired yet. Please enter your hardware MAC.";
        }
    });
}

function pairDevice() {
    const mac = document.getElementById('macInput').value.trim().toUpperCase();
    if (!mac) return alert("Please enter a valid MAC address.");
    database.ref('users/' + currentUserUid + '/paired_device').set(mac).then(() => {
        alert("Device paired successfully!");
        document.getElementById('pairedDeviceLabel').innerText = "✅ Connected to: " + mac;
        startListeningToDevice(mac); 
        bootstrap.Modal.getInstance(document.getElementById('pairingModal')).hide();
    });
}

// ==========================================
// 3. FIREBASE AUTHENTICATION
// ==========================================

auth.onAuthStateChanged((user) => {
    if (user && user.emailVerified) {
        currentUserUid = user.uid; 
        document.getElementById('landingPage').classList.add('hidden');
        document.getElementById('loginPage').style.display = 'none';
        document.getElementById('loginBtn').style.display = 'none';
        document.getElementById('userProfile').style.display = 'flex';
        document.getElementById('nav-dash').style.display = 'block';
        document.getElementById('nav-control').style.display = 'block';
        document.getElementById('nav-cost').style.display = 'block';
        document.getElementById('nav-dataset').style.display = 'block';
        const username = user.displayName ? user.displayName.toUpperCase() : user.email.split('@')[0].toUpperCase();
        document.getElementById('userNameDisplay').innerText = username;
        loadPairedDevice(); 
        showPage('dashboard');
    } else if (user && !user.emailVerified) {
        auth.signOut();
    } else {
        currentUserUid = null;
        document.getElementById('landingPage').classList.remove('hidden');
        document.getElementById('loginPage').style.display = 'none';
        document.getElementById('loginBtn').style.display = 'block';
        document.getElementById('userProfile').style.display = 'none';
        document.getElementById('nav-dash').style.display = 'none';
        document.getElementById('nav-control').style.display = 'none';
        document.getElementById('nav-cost').style.display = 'none';
        document.getElementById('nav-dataset').style.display = 'none';
        document.getElementById('dashboardPage').style.display = 'none';
        document.getElementById('controlPage').style.display = 'none';
        document.getElementById('costPage').style.display = 'none';
        document.getElementById('settingsPage').style.display = 'none';
        document.getElementById('datasetPage').style.display = 'none';
    }
});

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function handleRegister(e) {
    e.preventDefault();
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerPasswordConfirm').value;
    const registerBtn = document.getElementById('registerBtn');

    if (!email || !password) return alert("Please enter both an email and a password.");
    if (!isValidEmail(email)) return alert("Please enter a valid email address.");
    if (password.length < 6) return alert("Firebase requires passwords to be at least 6 characters long.");
    if (password !== confirmPassword) return alert("Passwords do not match.");

    registerBtn.innerText = "Creating..."; registerBtn.disabled = true;

    auth.createUserWithEmailAndPassword(email, password).then((userCredential) => {
        userCredential.user.sendEmailVerification().then(() => {
            alert("Account created! A verification link has been sent. Please check your email and verify before logging in.");
            auth.signOut();
            registerBtn.innerText = "Create Account"; registerBtn.disabled = false;
            document.getElementById('registerEmail').value = ""; 
            document.getElementById('registerPassword').value = "";
            document.getElementById('registerPasswordConfirm').value = "";
            toggleForm();
        });
    }).catch((error) => {
        alert("Registration Failed: " + error.message);
        registerBtn.innerText = "Create Account"; registerBtn.disabled = false;
    });
}

function handleLogin(e) {
    e.preventDefault(); 
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const loginBtn = document.getElementById('loginSubmitBtn');

    if (!isValidEmail(email)) return alert("Please enter a valid email address.");
    loginBtn.innerText = "Verifying..."; loginBtn.disabled = true;

    auth.signInWithEmailAndPassword(email, password).then((userCredential) => {
        if (!userCredential.user.emailVerified) {
            alert("Access Denied: Please verify your email address first.");
            auth.signOut(); loginBtn.innerText = "Sign In"; loginBtn.disabled = false; return;
        }
        currentUserUid = userCredential.user.uid; 
        document.getElementById('loginPage').style.display = 'none';
        document.getElementById('loginBtn').style.display = 'none';
        document.getElementById('userProfile').style.display = 'flex';
        const username = userCredential.user.displayName ? userCredential.user.displayName.toUpperCase() : userCredential.user.email.split('@')[0].toUpperCase();
        document.getElementById('userNameDisplay').innerText = username;
        loadPairedDevice(); 
        showPage('dashboard');
        loginBtn.innerText = "Sign In"; loginBtn.disabled = false;
    }).catch((error) => {
        alert("Login Failed: " + error.message);
        loginBtn.innerText = "Sign In"; loginBtn.disabled = false;
    });
}

function handleForgotPassword() {
    let email = document.getElementById('loginEmail').value.trim();
    if (!email) email = prompt("Please enter your registered email address:");
    if (!email) return; 
    if (!isValidEmail(email)) return alert("Please enter a valid email address.");
    auth.sendPasswordResetEmail(email).then(() => {
        alert("A password reset link has been sent to " + email);
    }).catch((error) => alert("Error sending reset email: " + error.message));
}

function handleLogout() {
    auth.signOut().then(() => {
        currentUserUid = null;
        realTimeReadings = [];
        pairedMacAddress = null;
        if (currentDeviceRef) currentDeviceRef.off();
        document.getElementById('landingPage').classList.remove('hidden');
        document.getElementById('dashboardPage').style.display = 'none';
        document.getElementById('controlPage').style.display = 'none';
        document.getElementById('costPage').style.display = 'none';
        document.getElementById('settingsPage').style.display = 'none';
        document.getElementById('datasetPage').style.display = 'none';
        document.getElementById('userProfile').style.display = 'none';
        document.getElementById('loginBtn').style.display = 'block';
        document.getElementById('nav-pair').style.display = 'none'; 
        document.getElementById('poleCurrent').innerText = "0.0 A";
        document.getElementById('houseCurrent').innerText = "0.0 A";
        document.querySelectorAll('.card-custom').forEach(el => el.classList.remove('theft-active'));
        document.getElementById('theftAlertBanner').style.display = "none";
        document.getElementById('loginEmail').value = ""; document.getElementById('loginPassword').value = "";
        document.getElementById('macInput').value = ""; document.getElementById('pairedDeviceLabel').innerText = "No device paired yet.";
    });
}

// ==========================================
// 4. ACCOUNT SETTINGS & NAVIGATION
// ==========================================

function changeUsername() {
    const newName = document.getElementById('newUsernameInput').value.trim();
    if (!newName) return alert("Please enter a valid username.");
    const user = auth.currentUser;
    if (user) {
        user.updateProfile({ displayName: newName }).then(() => {
            alert("Username updated!");
            document.getElementById('userNameDisplay').innerText = newName.toUpperCase();
            document.getElementById('newUsernameInput').value = ""; 
        }).catch((error) => alert("Error: " + error.message));
    }
}

function sendPasswordReset() {
    const user = auth.currentUser;
    if (user) {
        auth.sendPasswordResetEmail(user.email).then(() => alert("Reset email sent!"))
        .catch((error) => alert("Error: " + error.message));
    }
}

function calculateCost() {
    const units = 190.2; 
    const rate = document.getElementById('unitRate').value;
    const total = (units * rate).toFixed(2);
    document.getElementById('calculatedTotal').innerText = "₹ " + total;
}

function renderCostChart() {
    const ctxCost = document.getElementById('costChart').getContext('2d');
    if (window.costChartInstance) { window.costChartInstance.destroy(); }
    window.costChartInstance = new Chart(ctxCost, {
        type: 'bar',
        data: { labels: ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'], datasets: [{ label: 'Bill (₹)', data: [1100, 1250, 1180, 1340, 1290, 1425], backgroundColor: '#30d158', borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { position: 'right', grid: { color: '#333' }, ticks: { color: '#8e8e93' } }, x: { grid: { display: false }, ticks: { color: '#8e8e93' } } } }
    });
}

// ==========================================
// 5. CHARTS INITIALIZATION & ONLOAD
// ==========================================

const dashboardChartOptions = {
    responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
    scales: { 
        y: { position: 'right', grid: { color: '#333' }, ticks: { color: '#8e8e93', font: {size: 10} } }, 
        x: { grid: { display: false }, ticks: { color: '#8e8e93', font: { size: 9 }, autoSkip: false, minRotation: 0, maxRotation: 0 } } 
    }
};

const usageCtx = document.getElementById('usageChart').getContext('2d');
let usageChart = new Chart(usageCtx, { type: 'bar', data: { labels: [], datasets: [{ data: [], backgroundColor: '#0a84ff', borderRadius: 4, barPercentage: 0.8 }] }, options: JSON.parse(JSON.stringify(dashboardChartOptions)) });

const sourceCtx = document.getElementById('sourceChart').getContext('2d');
let sourceChart = new Chart(sourceCtx, { type: 'bar', data: { labels: [], datasets: [{ data: [], backgroundColor: '#ffcc00', borderRadius: 4, barPercentage: 0.8 }] }, options: JSON.parse(JSON.stringify(dashboardChartOptions)) });

window.onload = function() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    const lastDayOfMonth = new Date(year, now.getMonth() + 1, 0).getDate();
    const minDate = `${year}-${month}-01`;
    const maxDate = `${year}-${month}-${String(lastDayOfMonth).padStart(2, '0')}`;

    // Usage Chart Setup
    document.getElementById('daySelect').value = todayStr;
    const hourDateInput = document.getElementById('hourDateSelect');
    hourDateInput.value = todayStr; hourDateInput.min = minDate; hourDateInput.max = maxDate;
    
    // Source Chart Setup
    document.getElementById('sourceDaySelect').value = todayStr;
    const sourceHourDateInput = document.getElementById('sourceHourDateSelect');
    sourceHourDateInput.value = todayStr; sourceHourDateInput.min = minDate; sourceHourDateInput.max = maxDate;
    
    // Populate 24 hour dropdowns
    const hourSelect = document.getElementById('hourTimeSelect');
    const sourceHourSelect = document.getElementById('sourceHourTimeSelect');
    for(let i=0; i<24; i++) {
        let opt1 = document.createElement('option'); let opt2 = document.createElement('option');
        opt1.value = i; opt2.value = i;
        let displayHour = i % 12 || 12; let ampm = i >= 12 ? 'PM' : 'AM';
        opt1.text = `${displayHour}:00 ${ampm}`; opt2.text = `${displayHour}:00 ${ampm}`;
        hourSelect.appendChild(opt1); sourceHourSelect.appendChild(opt2);
    }
    document.getElementById('hourTimeSelect').value = now.getHours();
    document.getElementById('sourceHourTimeSelect').value = now.getHours();

    setView('week', document.querySelectorAll('.view-tab')[3]); 
    setSourceView('week', document.querySelectorAll('.source-tab')[3]); 
};

// ==========================================
// 6. LOAD USAGE CHART LOGIC (BLUE)
// ==========================================

function setView(mode, element) {
    document.querySelectorAll('.view-tabs:first-of-type .view-tab').forEach(el => el.classList.remove('active'));
    if(element) element.classList.add('active');
    
    document.getElementById('weekSubSelector').style.display = 'none';
    document.getElementById('monthSelectorWrapper').style.display = 'none';
    document.getElementById('daySelectorWrapper').style.display = 'none';
    document.getElementById('hourSelectorWrapper').style.display = 'none';
    usageChart.options.scales.x.grid.display = false;

    if (mode === 'minute') { document.getElementById('timeLabel').innerText = "Live Usage (Last 60 Minutes)"; updateMinuteData(); }
    else if (mode === 'hour') { document.getElementById('hourSelectorWrapper').style.display = 'flex'; updateHourData(); }
    else if (mode === 'day') { document.getElementById('daySelectorWrapper').style.display = 'block'; updateDayData(); } 
    else if (mode === 'week') { document.getElementById('weekSubSelector').style.display = 'flex'; setSubWeek(7, document.querySelectorAll('.sub-pill')[3]); }
    else if (mode === 'month') { document.getElementById('monthSelectorWrapper').style.display = 'block'; updateMonthData(); }
    else if (mode === 'year') {
        let labels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        let data = Array.from({length: 12}, () => Math.random() * 100 + 50);
        let total = data.reduce((a, b) => a + b, 0);
        document.getElementById('timeLabel').innerText = "Year 2026";
        document.getElementById('totalUsageDisplay').innerText = total.toFixed(1) + " kWh";
        document.getElementById('avgLabel').innerText = "Total: 1.2 MWh";
        usageChart.data.labels = labels; usageChart.data.datasets[0].data = data; usageChart.update();
    }
}

function setSubWeek(weekNum, element) {
    document.querySelectorAll('.sub-pill:not(.source-pill)').forEach(el => el.classList.remove('active'));
    if(element) element.classList.add('active');
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    let data = Array.from({length: 7}, () => Math.random() * 10 + weekNum);
    let total = data.reduce((a, b) => a + b, 0);
    document.getElementById('timeLabel').innerText = weekNum === 7 ? "9 Feb - 15 Feb (Week 7)" : `Week ${weekNum}`;
    document.getElementById('totalUsageDisplay').innerText = total.toFixed(1) + " kWh";
    document.getElementById('avgLabel').innerText = "Daily Avg: " + (total/7).toFixed(1) + " kWh";
    usageChart.data.labels = days; usageChart.data.datasets[0].data = data; usageChart.update();
}

function updateDayData() {
    const dateStr = new Date(document.getElementById('daySelect').value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    let labels = Array.from({length: 24}, (_, i) => i.toString());
    let data = Array.from({length: 24}, () => Math.random() * 2.5);
    let total = data.reduce((a, b) => a + b, 0);
    document.getElementById('timeLabel').innerText = `Usage on ${dateStr}`;
    document.getElementById('totalUsageDisplay').innerText = total.toFixed(1) + " kWh";
    document.getElementById('avgLabel').innerText = "Peak: 8 PM";
    usageChart.data.labels = labels; usageChart.data.datasets[0].data = data; usageChart.update();
}

function updateMonthData() {
    const select = document.getElementById('monthSelect');
    let labels = Array.from({length: 30}, (_, i) => (i+1).toString());
    let data = Array.from({length: 30}, () => Math.random() * 10 + 2);
    let total = data.reduce((a, b) => a + b, 0);
    document.getElementById('timeLabel').innerText = `Usage for ${select.options[select.selectedIndex].text}`;
    document.getElementById('totalUsageDisplay').innerText = total.toFixed(1) + " kWh";
    document.getElementById('avgLabel').innerText = "Daily Avg: " + (total/30).toFixed(1) + " kWh";
    usageChart.data.labels = labels; usageChart.data.datasets[0].data = data; usageChart.update();
}

function updateMinuteData() {
    let labels = [], data = [], now = new Date();
    for(let i = 59; i >= 0; i--) {
        let pastTime = new Date(now.getTime() - (i * 60000));
        let mins = pastTime.getMinutes().toString().padStart(2, '0');
        labels.push(mins === '00' ? `${pastTime.getHours() % 12 || 12}:00` : mins);
        data.push(Math.random() * 1.0 + 0.5); 
    }
    document.getElementById('totalUsageDisplay').innerText = data.reduce((a, b) => a + b, 0).toFixed(2) + " kWh";
    document.getElementById('avgLabel').innerText = "Updating in real-time...";
    usageChart.options.scales.x.grid.display = true;
    usageChart.options.scales.x.grid.drawOnChartArea = true;
    usageChart.options.scales.x.grid.color = (context) => (context.index !== undefined && labels[context.index].includes(':00')) ? 'rgba(255, 255, 255, 0.4)' : 'transparent';
    usageChart.options.scales.x.grid.borderDash = [5, 5]; 
    usageChart.data.labels = labels; usageChart.data.datasets[0].data = data; usageChart.update();
}

function updateHourData() {
    const dateStr = new Date(document.getElementById('hourDateSelect').value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    let h = parseInt(document.getElementById('hourTimeSelect').value);
    let displayHour = h % 12 || 12, ampm = h >= 12 ? 'PM' : 'AM';
    let labels = Array.from({length: 60}, (_, i) => i.toString().padStart(2, '0'));
    let data = Array.from({length: 60}, () => Math.random() * 1.5);
    document.getElementById('timeLabel').innerText = `Usage on ${dateStr} (${displayHour}:00 ${ampm} - ${displayHour}:59 ${ampm})`;
    document.getElementById('totalUsageDisplay').innerText = data.reduce((a, b) => a + b, 0).toFixed(2) + " kWh";
    document.getElementById('avgLabel').innerText = "Hourly Total";
    usageChart.data.labels = labels; usageChart.data.datasets[0].data = data; usageChart.update();
}

// ==========================================
// 7. SOURCE POWER CHART LOGIC (YELLOW)
// ==========================================

function setSourceView(mode, element) {
    document.querySelectorAll('.source-tab').forEach(el => el.classList.remove('active'));
    if(element) element.classList.add('active');
    
    document.getElementById('sourceWeekSubSelector').style.display = 'none';
    document.getElementById('sourceMonthSelectorWrapper').style.display = 'none';
    document.getElementById('sourceDaySelectorWrapper').style.display = 'none';
    document.getElementById('sourceHourSelectorWrapper').style.display = 'none';
    sourceChart.options.scales.x.grid.display = false;

    if (mode === 'minute') { document.getElementById('sourceTimeLabel').innerText = "Live Source (Last 60 Minutes)"; updateSourceMinuteData(); }
    else if (mode === 'hour') { document.getElementById('sourceHourSelectorWrapper').style.display = 'flex'; updateSourceHourData(); }
    else if (mode === 'day') { document.getElementById('sourceDaySelectorWrapper').style.display = 'block'; updateSourceDayData(); } 
    else if (mode === 'week') { document.getElementById('sourceWeekSubSelector').style.display = 'flex'; setSourceSubWeek(7, document.querySelectorAll('.source-pill')[3]); }
    else if (mode === 'month') { document.getElementById('sourceMonthSelectorWrapper').style.display = 'block'; updateSourceMonthData(); }
    else if (mode === 'year') {
        let labels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        let data = Array.from({length: 12}, () => Math.random() * 105 + 50);
        let total = data.reduce((a, b) => a + b, 0);
        document.getElementById('sourceTimeLabel').innerText = "Year 2026";
        document.getElementById('sourceTotalDisplay').innerText = total.toFixed(1) + " kWh";
        document.getElementById('sourceAvgLabel').innerText = "Total: 1.3 MWh";
        sourceChart.data.labels = labels; sourceChart.data.datasets[0].data = data; sourceChart.update();
    }
}

function setSourceSubWeek(weekNum, element) {
    document.querySelectorAll('.source-pill').forEach(el => el.classList.remove('active'));
    if(element) element.classList.add('active');
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    let data = Array.from({length: 7}, () => Math.random() * 11 + weekNum);
    let total = data.reduce((a, b) => a + b, 0);
    document.getElementById('sourceTimeLabel').innerText = weekNum === 7 ? "9 Feb - 15 Feb (Week 7)" : `Week ${weekNum}`;
    document.getElementById('sourceTotalDisplay').innerText = total.toFixed(1) + " kWh";
    document.getElementById('sourceAvgLabel').innerText = "Daily Avg: " + (total/7).toFixed(1) + " kWh";
    sourceChart.data.labels = days; sourceChart.data.datasets[0].data = data; sourceChart.update();
}

function updateSourceDayData() {
    const dateStr = new Date(document.getElementById('sourceDaySelect').value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    let labels = Array.from({length: 24}, (_, i) => i.toString());
    let data = Array.from({length: 24}, () => Math.random() * 2.8);
    let total = data.reduce((a, b) => a + b, 0);
    document.getElementById('sourceTimeLabel').innerText = `Source on ${dateStr} (Demo Data)`;
    document.getElementById('sourceTotalDisplay').innerText = total.toFixed(1) + " kWh";
    document.getElementById('sourceAvgLabel').innerText = "Peak: 8 PM";
    sourceChart.data.labels = labels; sourceChart.data.datasets[0].data = data; sourceChart.update();
}

function updateSourceMonthData() {
    const select = document.getElementById('sourceMonthSelect');
    let labels = Array.from({length: 30}, (_, i) => (i+1).toString());
    let data = Array.from({length: 30}, () => Math.random() * 11 + 2);
    let total = data.reduce((a, b) => a + b, 0);
    document.getElementById('sourceTimeLabel').innerText = `Source for ${select.options[select.selectedIndex].text} (Demo Data)`;
    document.getElementById('sourceTotalDisplay').innerText = total.toFixed(1) + " kWh";
    document.getElementById('sourceAvgLabel').innerText = "Daily Avg: " + (total/30).toFixed(1) + " kWh";
    sourceChart.data.labels = labels; sourceChart.data.datasets[0].data = data; sourceChart.update();
}

function updateSourceMinuteData() {
    let labels = [], data = [], now = new Date();
    for(let i = 59; i >= 0; i--) {
        let pastTime = new Date(now.getTime() - (i * 60000));
        let mins = pastTime.getMinutes().toString().padStart(2, '0');
        labels.push(mins === '00' ? `${pastTime.getHours() % 12 || 12}:00` : mins);
        data.push(Math.random() * 1.2 + 0.6); 
    }
    document.getElementById('sourceTotalDisplay').innerText = data.reduce((a, b) => a + b, 0).toFixed(2) + " kWh";
    document.getElementById('sourceAvgLabel').innerText = "Updating in real-time...";
    sourceChart.options.scales.x.grid.display = true;
    sourceChart.options.scales.x.grid.drawOnChartArea = true;
    sourceChart.options.scales.x.grid.color = (context) => (context.index !== undefined && labels[context.index].includes(':00')) ? 'rgba(255, 255, 255, 0.4)' : 'transparent';
    sourceChart.options.scales.x.grid.borderDash = [5, 5]; 
    sourceChart.data.labels = labels; sourceChart.data.datasets[0].data = data; sourceChart.update();
}

function updateSourceHourData() {
    const dateStr = new Date(document.getElementById('sourceHourDateSelect').value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    let h = parseInt(document.getElementById('sourceHourTimeSelect').value);
    let displayHour = h % 12 || 12, ampm = h >= 12 ? 'PM' : 'AM';
    let labels = Array.from({length: 60}, (_, i) => i.toString().padStart(2, '0'));
    let data = Array.from({length: 60}, () => Math.random() * 1.8);
    document.getElementById('sourceTimeLabel').innerText = `Source on ${dateStr} (${displayHour}:00 ${ampm} - ${displayHour}:59 ${ampm})`;
    document.getElementById('sourceTotalDisplay').innerText = data.reduce((a, b) => a + b, 0).toFixed(2) + " kWh";
    document.getElementById('sourceAvgLabel').innerText = "Hourly Total";
    sourceChart.data.labels = labels; sourceChart.data.datasets[0].data = data; sourceChart.update();
}

// ================================
// 8. DATASET VISUALIZER ADDON
// ================================

function navigateToLogin() {
    document.getElementById('landingPage').classList.add('hidden');
    document.getElementById('loginPage').style.display = 'flex';
}

function goBackToLanding() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('landingPage').classList.remove('hidden');
}

function toggleForm() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const label = document.getElementById('formTypeLabel');
    
    if (loginForm.style.display === 'block') {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        label.innerText = 'Create New Account';
    } else {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        label.innerText = 'Sign In to Your Account';
    }
}
filteredDataset = [];
numericFields = [];
categoricalFields = [];
datetimeFields = [];
datasetChart = null;

function generateSampleDataset() {
    const departments = ['Engineering', 'Sales', 'HR', 'Marketing', 'Finance', 'Operations'];
    const regions = ['North', 'South', 'East', 'West', 'Central'];
    const statuses = ['Active', 'Inactive', 'On Leave', 'Retired'];
    const data = [];
    
    for (let i = 0; i < 150; i++) {
        const dept = departments[Math.floor(Math.random() * departments.length)];
        const hire_date = new Date(2015 + Math.floor(Math.random() * 9), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1);
        const review_date = new Date(2024 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1);
        
        data.push({
            emp_id: 1000 + i,
            name: `Employee_${i + 1}`,
            age: 25 + Math.floor(Math.random() * 40),
            salary: 40000 + Math.floor(Math.random() * 120000),
            performance_score: Math.floor(Math.random() * 101),
            years_employed: Math.floor(Math.random() * 15),
            department: dept,
            region: regions[Math.floor(Math.random() * regions.length)],
            status: statuses[Math.floor(Math.random() * statuses.length)],
            hire_date: hire_date.toISOString().split('T')[0],
            last_review: review_date.toISOString().split('T')[0]
        });
    }
    
    return data;
}

function loadDatasetPage() {
    if (realTimeReadings.length > 0) {
        loadLiveDeviceData();
    } else {
        loadSampleDataset();
    }
}

function loadLiveDeviceData() {
    if (realTimeReadings.length === 0) return alert('No device data available. Pair a device first.');
    rawDataset = realTimeReadings.slice();
    filteredDataset = rawDataset.slice();
    computeFieldLists();
    renderDatasetMetrics();
    document.getElementById('datasetControls').style.display = 'block';
    updateDatasetChart();
}

function loadSampleDataset() {
    rawDataset = generateSampleDataset();
    filteredDataset = rawDataset.slice();
    computeFieldLists();
    renderDatasetMetrics();
    document.getElementById('datasetControls').style.display = 'block';
    updateDatasetChart();
}

function toggleCustomInput() {
    const section = document.getElementById('customInputSection');
    section.style.display = section.style.display === 'none' ? 'block' : 'none';
}

function loadDataset() {
    const txt = document.getElementById('dataInput').value.trim();
    if (!txt) return alert('Please paste JSON data.');
    try {
        rawDataset = JSON.parse(txt);
    } catch (e) {
        return alert('Invalid JSON: ' + e.message);
    }
    if (!Array.isArray(rawDataset)) return alert('Data must be an array of objects.');
    filteredDataset = rawDataset.slice();
    computeFieldLists();
    renderDatasetMetrics();
    document.getElementById('datasetControls').style.display = 'block';
    updateDatasetChart();
}

function computeFieldLists() {
    const fields = new Set();
    rawDataset.forEach(o => Object.keys(o).forEach(k => fields.add(k)));
    const all = Array.from(fields);
    numericFields = all.filter(f => rawDataset.every(o => o[f] == null || typeof o[f] === 'number' || !isNaN(parseFloat(o[f]))));
    datetimeFields = all.filter(f => rawDataset.every(o => o[f] == null || !isNaN(Date.parse(o[f]))));
    categoricalFields = all.filter(f => !numericFields.includes(f) && !datetimeFields.includes(f));

    const numSel = document.getElementById('numericFieldSelect');
    numSel.innerHTML = '';
    numericFields.forEach(f => { const opt = document.createElement('option'); opt.value = f; opt.text = f; numSel.appendChild(opt); });
    const catSel = document.getElementById('catFieldSelect');
    catSel.innerHTML = '';
    categoricalFields.forEach(f => { const opt = document.createElement('option'); opt.value = f; opt.text = f; catSel.appendChild(opt); });

    if (datetimeFields.length > 0) {
        document.getElementById('dateFieldWrapper').style.display = 'block';
        const dateSel = document.getElementById('dateFieldSelect');
        dateSel.innerHTML = '';
        datetimeFields.forEach(f => { const opt = document.createElement('option'); opt.value = f; opt.text = f; dateSel.appendChild(opt); });
        setupDateFilter();
    } else {
        document.getElementById('dateFieldWrapper').style.display = 'none';
        document.getElementById('dateFilter').style.display = 'none';
    }
}

function setupDateFilter() {
    const field = document.getElementById('dateFieldSelect').value;
    if (!field) return;
    const dates = rawDataset.map(o => new Date(o[field])).filter(d => !isNaN(d));
    if (dates.length === 0) { document.getElementById('dateFilter').style.display = 'none'; return; }
    document.getElementById('dateFilter').style.display = 'block';
    const min = new Date(Math.min(...dates));
    const max = new Date(Math.max(...dates));
    const fmt = d => d.toISOString().split('T')[0];
    document.getElementById('dsStart').min = fmt(min);
    document.getElementById('dsStart').max = fmt(max);
    document.getElementById('dsStart').value = fmt(min);
    document.getElementById('dsEnd').min = fmt(min);
    document.getElementById('dsEnd').max = fmt(max);
    document.getElementById('dsEnd').value = fmt(max);
    applyDateFilter();
}

function applyDateFilter() {
    const field = document.getElementById('dateFieldSelect').value;
    const start = new Date(document.getElementById('dsStart').value);
    const end = new Date(document.getElementById('dsEnd').value);
    filteredDataset = rawDataset.filter(o => {
        const d = new Date(o[field]);
        return !isNaN(d) && d >= start && d <= end;
    });
    renderDatasetMetrics();
    updateDatasetChart();
}

function renderDatasetMetrics() {
    document.getElementById('dsEntries').innerText = filteredDataset.length;
    const fields = new Set();
    filteredDataset.forEach(o => Object.keys(o).forEach(k => fields.add(k)));
    document.getElementById('dsFields').innerText = fields.size;
    const seen = new Set();
    let dupCount = 0;
    filteredDataset.forEach(o => {
        const key = JSON.stringify(o);
        if (seen.has(key)) dupCount++;
        else seen.add(key);
    });
    document.getElementById('dsDuplicates').innerText = dupCount;
}

function updateDatasetChart() {
    const numSel = Array.from(document.getElementById('numericFieldSelect').selectedOptions).map(o => o.value);
    const catSel = Array.from(document.getElementById('catFieldSelect').selectedOptions).map(o => o.value);
    if (!numSel.length && !catSel.length) {
        if (datasetChart) { datasetChart.data.labels = []; datasetChart.data.datasets = []; datasetChart.update(); }
        return;
    }
    let labels = [], datasets = [];
    if (numSel.length > 0) {
        numSel.forEach((f, i) => {
            const hist = getHistogram(filteredDataset, f, 20);
            datasets.push({ label: f, data: hist.counts, backgroundColor: i % 2 === 0 ? '#0a84ff' : '#ff6f61' });
            labels = hist.labels;
        });
        createOrUpdateChart(labels, datasets);
    } else if (catSel.length > 0) {
        const first = catSel[0];
        const counts = {};
        filteredDataset.forEach(o => { const v = o[first]; counts[v] = (counts[v] || 0) + 1; });
        labels = Object.keys(counts);
        datasets = [{ label: first, data: Object.values(counts), backgroundColor: '#0a84ff' }];
        createOrUpdateChart(labels, datasets);
    }
}



// ==========================================
// 9. EVENT LISTENER INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', function() {
    // Initialize settings from localStorage
    loadSettings();
    
    // Initialize notification badge
    updateNotificationBadge();
    updateNotificationList();
    
    // Mobile menu hamburger toggle
    const hamburger = document.getElementById('hamburger');
    if (hamburger) {
        hamburger.addEventListener('click', toggleMobileMenu);
    }
    
    // Close mobile menu when navigating
    document.querySelectorAll('#mobileMenu a').forEach(link => {
        link.addEventListener('click', () => {
            const menu = document.getElementById('mobileMenu');
            menu.style.display = 'none';
        });
    });
    
    // Notification center toggle
    const notificationBell = document.getElementById('notificationBtn');
    if (notificationBell) {
        notificationBell.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleNotificationCenter();
        });
    }
    
    // Close notification center when clicking outside
    document.addEventListener('click', (e) => {
        const center = document.getElementById('notificationCenter');
        const bell = document.getElementById('notificationBtn');
        if (center && bell && !center.contains(e.target) && !bell.contains(e.target)) {
            center.style.display = 'none';
        }
    });

    const unitSelect = document.getElementById('unitSelect');
    if (unitSelect) {
        unitSelect.addEventListener('change', (e) => changeSetting('unit', e.target.value));
    }
    
    const refreshSelect = document.getElementById('refreshSelect');
    if (refreshSelect) {
        refreshSelect.addEventListener('change', (e) => changeSetting('refresh', parseInt(e.target.value)));
    }
    
    const alertTheftCheckbox = document.getElementById('alertTheft');
    if (alertTheftCheckbox) {
        alertTheftCheckbox.addEventListener('change', (e) => changeSetting('alertTheft', e.target.checked));
    }
    
    const alertAnomaliesCheckbox = document.getElementById('alertAnomalies');
    if (alertAnomaliesCheckbox) {
        alertAnomaliesCheckbox.addEventListener('change', (e) => changeSetting('alertAnomalies', e.target.checked));
    }
    
    const alertEmailCheckbox = document.getElementById('alertSummaryEmail');
    if (alertEmailCheckbox) {
        alertEmailCheckbox.addEventListener('change', (e) => changeSetting('alertSummaryEmail', e.target.checked));
    }
    
    // Device status indicator - start as offline, will update from Firebase
    updateDeviceStatus(false);
});
