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

// Relay DOM Elements
const relayToggle = document.getElementById('relayToggle');
const relayStatusText = document.getElementById('relayStatusText');

// Live Chart Data Arrays (Hold 60 data points for Live/Hour tabs)
let liveHouseData = Array(60).fill(0);
let livePoleData = Array(60).fill(0);
let liveTimeLabels = Array(60).fill('');

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

// SEND RELAY COMMANDS 
relayToggle.addEventListener('change', (e) => {
    const isCutoff = e.target.checked;
    
    if (currentDeviceRef) {
        currentDeviceRef.child('relay_cutoff').set(isCutoff);
    } else {
        if (isCutoff) {
            relayStatusText.innerText = "⚠️ POWER CUT (Not Paired)";
            relayStatusText.style.color = "#ff3b30";
        } else {
            relayStatusText.innerText = "Power is ON (Not Paired)";
            relayStatusText.style.color = "#4CAF50";
        }
    }
});

function startListeningToDevice(macAddress) {
    if (currentDeviceRef) currentDeviceRef.off(); 
    currentDeviceRef = database.ref('live_grid/' + macAddress);
    
    currentDeviceRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            // -- SENSOR LOGIC (WITH DEADBAND) --
            let poleValRaw = data.pole !== undefined ? parseFloat(data.pole) : 0.00;
            let houseValRaw = data.house !== undefined ? parseFloat(data.house) : 0.00;
            
            // DEADBAND: Ignore "Vampire Power" (< 0.10A)
            if (poleValRaw < 0.10) poleValRaw = 0.00; 
            if (houseValRaw < 0.10) houseValRaw = 0.00; 
            
            let poleVal = poleValRaw.toFixed(2);
            let houseVal = houseValRaw.toFixed(2);
            
            document.getElementById('poleCurrent').innerText = poleVal + " A";
            document.getElementById('houseCurrent').innerText = houseVal + " A";
            
            // Push Real Data to Charts
            updateLiveCharts(houseValRaw, poleValRaw);
            
            // 🚨 UPDATED ALERT LOGIC (Threshold: 0.15A)
            const banner = document.getElementById('theftAlertBanner');
            let currentDiff = Math.abs(poleValRaw - houseValRaw);
            
            if (currentDiff > 0.15) {
                document.querySelectorAll('.card-custom')[0].classList.add('theft-active');
                document.querySelectorAll('.card-custom')[2].classList.add('theft-active'); 
                banner.innerHTML = `<i class="bi bi-exclamation-triangle-fill me-2"></i> CRITICAL ALERT: THEFT DETECTED (${currentDiff.toFixed(2)}A LOSS)`;
                banner.style.display = "block"; 
            } else {
                document.querySelectorAll('.card-custom').forEach(el => el.classList.remove('theft-active'));
                banner.style.display = "none"; 
            }

            // -- RELAY CUTOFF --
            const isCutoff = data.relay_cutoff === true;
            if (relayToggle.checked !== isCutoff) {
                relayToggle.checked = isCutoff;
            }
            if (isCutoff) {
                relayStatusText.innerText = "⚠️ POWER CUT";
                relayStatusText.style.color = "#ff3b30"; 
            } else {
                relayStatusText.innerText = "Power is ON";
                relayStatusText.style.color = "#4CAF50"; 
            }
        }
    });
}

// Function to push real data into the charts
function updateLiveCharts(newHouseVal, newPoleVal) {
    const now = new Date();
    const timeString = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    
    liveHouseData.shift(); liveHouseData.push(newHouseVal);
    livePoleData.shift(); livePoleData.push(newPoleVal);
    liveTimeLabels.shift(); liveTimeLabels.push(timeString);
    
    // Update Blue Chart if Live or Hour is selected
    if (document.querySelectorAll('.view-tab')[0].classList.contains('active') || document.querySelectorAll('.view-tab')[1].classList.contains('active')) {
        usageChart.data.labels = liveTimeLabels;
        usageChart.data.datasets[0].data = liveHouseData;
        usageChart.update('none'); 
        document.getElementById('totalUsageDisplay').innerText = newHouseVal.toFixed(2) + " A";
    }
    
    // Update Yellow Chart if Live or Hour is selected
    if (document.querySelectorAll('.source-tab')[0].classList.contains('active') || document.querySelectorAll('.source-tab')[1].classList.contains('active')) {
        sourceChart.data.labels = liveTimeLabels;
        sourceChart.data.datasets[0].data = livePoleData;
        sourceChart.update('none');
        document.getElementById('sourceTotalDisplay').innerText = newPoleVal.toFixed(2) + " A";
    }
}

// ==========================================
// 3. FIREBASE AUTHENTICATION (WITH PERSISTENCE)
// ==========================================

auth.onAuthStateChanged((user) => {
    if (user && user.emailVerified) {
        currentUserUid = user.uid; 
        document.getElementById('loginBtn').style.display = 'none';
        document.getElementById('userProfile').style.display = 'flex';
        const username = user.displayName ? user.displayName.toUpperCase() : user.email.split('@')[0].toUpperCase();
        document.getElementById('userNameDisplay').innerText = username;
        loadPairedDevice(); 
    } else if (user && !user.emailVerified) {
        auth.signOut();
    }
});

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function handleRegister(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const registerBtn = document.getElementById('registerBtn');

    if (!email || !password) return alert("Please enter both an email and a password.");
    if (!isValidEmail(email)) return alert("Please enter a valid email address.");
    if (password.length < 6) return alert("Firebase requires passwords to be at least 6 characters long.");

    registerBtn.innerText = "Creating..."; registerBtn.disabled = true;

    auth.createUserWithEmailAndPassword(email, password).then((userCredential) => {
        userCredential.user.sendEmailVerification().then(() => {
            alert("Account created! A verification link has been sent. Please verify before logging in.");
            auth.signOut();
            bootstrap.Modal.getInstance(document.getElementById('loginModal')).hide();
            registerBtn.innerText = "Create Account"; registerBtn.disabled = false;
            document.getElementById('loginEmail').value = ""; document.getElementById('loginPassword').value = "";
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
            auth.signOut(); loginBtn.innerText = "Login"; loginBtn.disabled = false; return;
        }
        currentUserUid = userCredential.user.uid; 
        bootstrap.Modal.getInstance(document.getElementById('loginModal')).hide();
        document.getElementById('loginBtn').style.display = 'none';
        document.getElementById('userProfile').style.display = 'flex';
        const username = userCredential.user.displayName ? userCredential.user.displayName.toUpperCase() : userCredential.user.email.split('@')[0].toUpperCase();
        document.getElementById('userNameDisplay').innerText = username;
        loadPairedDevice(); 
        loginBtn.innerText = "Login"; loginBtn.disabled = false;
    }).catch((error) => {
        alert("Login Failed: " + error.message);
        loginBtn.innerText = "Login"; loginBtn.disabled = false;
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
    showPage('dashboard'); 
    auth.signOut().then(() => {
        currentUserUid = null;
        if (currentDeviceRef) currentDeviceRef.off(); 
        document.getElementById('userProfile').style.display = 'none';
        document.getElementById('loginBtn').style.display = 'block';
        document.getElementById('nav-pair').style.display = 'none'; 
        
        document.getElementById('poleCurrent').innerText = "0.00 A";
        document.getElementById('houseCurrent').innerText = "0.00 A";
        document.querySelectorAll('.card-custom').forEach(el => el.classList.remove('theft-active'));
        document.getElementById('theftAlertBanner').style.display = "none";
        
        relayToggle.checked = false;
        relayStatusText.innerText = "Power is ON";
        relayStatusText.style.color = "#4CAF50";
        
        document.getElementById('loginEmail').value = ""; document.getElementById('loginPassword').value = "";
        document.getElementById('macInput').value = ""; document.getElementById('pairedDeviceLabel').innerText = "No device paired yet.";
        
        liveHouseData.fill(0); livePoleData.fill(0); liveTimeLabels.fill('');
        usageChart.update(); sourceChart.update();
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

function showPage(pageId) {
    document.getElementById('dashboardPage').style.display = 'none';
    document.getElementById('controlPage').style.display = 'none';
    document.getElementById('costPage').style.display = 'none';
    document.getElementById('settingsPage').style.display = 'none';
    
    document.getElementById(pageId + 'Page').style.display = 'block';

    document.getElementById('nav-dash').classList.remove('active');
    document.getElementById('nav-control').classList.remove('active');
    document.getElementById('nav-cost').classList.remove('active');
    
    if(pageId === 'dashboard') {
        document.getElementById('nav-dash').classList.add('active');
        usageChart.update(); sourceChart.update();
    }
    if(pageId === 'control') document.getElementById('nav-control').classList.add('active');
    if(pageId === 'cost') {
        document.getElementById('nav-cost').classList.add('active');
        renderCostChart();
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

const chartOptions = {
    responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
    animation: { duration: 0 }, 
    scales: { 
        y: { position: 'right', grid: { color: '#333' }, ticks: { color: '#8e8e93', font: {size: 10} } }, 
        x: { 
            grid: { display: false }, 
            ticks: { 
                color: '#8e8e93', 
                font: { size: 9 }, 
                autoSkip: true, 
                maxRotation: 0, 
                minRotation: 0,
                maxTicksLimit: 12 
            } 
        } 
    }
};

const usageCtx = document.getElementById('usageChart').getContext('2d');
let usageChart = new Chart(usageCtx, { type: 'line', data: { labels: liveTimeLabels, datasets: [{ data: liveHouseData, borderColor: '#0a84ff', backgroundColor: 'rgba(10, 132, 255, 0.1)', borderWidth: 2, fill: true, pointRadius: 0 }] }, options: JSON.parse(JSON.stringify(chartOptions)) });

const sourceCtx = document.getElementById('sourceChart').getContext('2d');
let sourceChart = new Chart(sourceCtx, { type: 'line', data: { labels: liveTimeLabels, datasets: [{ data: livePoleData, borderColor: '#ffcc00', backgroundColor: 'rgba(255, 204, 0, 0.1)', borderWidth: 2, fill: true, pointRadius: 0 }] }, options: JSON.parse(JSON.stringify(chartOptions)) });

window.onload = function() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    
    document.getElementById('daySelect').value = todayStr;
    document.getElementById('sourceDaySelect').value = todayStr;
    
    setView('minute', document.querySelectorAll('.view-tab')[0]); 
    setSourceView('minute', document.querySelectorAll('.source-tab')[0]); 
};

// ==========================================
// 6. TABS LOGIC (LIVE DATA vs FAKE UI DATA)
// ==========================================

function setView(mode, element) {
    document.querySelectorAll('.view-tabs:first-of-type .view-tab').forEach(el => el.classList.remove('active'));
    if(element) element.classList.add('active');
    
    document.getElementById('weekSubSelector').style.display = 'none';
    document.getElementById('monthSelectorWrapper').style.display = 'none';
    document.getElementById('daySelectorWrapper').style.display = 'none';
    
    usageChart.options.scales.x.grid.display = false;
    usageChart.config.type = (mode === 'minute' || mode === 'hour') ? 'line' : 'bar'; 

    if (mode === 'minute') { 
        document.getElementById('timeLabel').innerText = "Live Real-Time Usage"; 
        document.getElementById('avgLabel').innerText = "Streaming from hardware...";
        // 🚨 FIX: Instantly pull the latest real-time value instead of leaving the demo text!
        document.getElementById('totalUsageDisplay').innerText = Number(liveHouseData[59]).toFixed(2) + " A";
        
        usageChart.data.labels = liveTimeLabels;
        usageChart.data.datasets[0].data = liveHouseData;
        usageChart.update();
    } else if (mode === 'hour') {
        document.getElementById('timeLabel').innerText = "Current Session (Last 60 ticks)"; 
        document.getElementById('avgLabel').innerText = "Active Database Feed";
        // 🚨 FIX: Instantly pull the latest real-time value!
        document.getElementById('totalUsageDisplay').innerText = Number(liveHouseData[59]).toFixed(2) + " A";
        
        usageChart.data.labels = liveTimeLabels;
        usageChart.data.datasets[0].data = liveHouseData;
        usageChart.update();
    } else if (mode === 'day') { 
        document.getElementById('daySelectorWrapper').style.display = 'block'; 
        updateDayData(); 
    } else if (mode === 'week') { 
        document.getElementById('weekSubSelector').style.display = 'flex'; 
        setSubWeek(7, document.querySelectorAll('.sub-pill')[3]); 
    } else if (mode === 'month') { 
        document.getElementById('monthSelectorWrapper').style.display = 'block'; 
        updateMonthData(); 
    } else if (mode === 'year') {
        let labels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        let data = Array.from({length: 12}, () => Math.random() * 50 + 100);
        let total = data.reduce((a, b) => a + b, 0);
        document.getElementById('timeLabel').innerText = "Year 2026 (Demo Data)";
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
    document.getElementById('timeLabel').innerText = weekNum === 7 ? "Week 7 (Demo Data)" : `Week ${weekNum} (Demo Data)`;
    document.getElementById('totalUsageDisplay').innerText = total.toFixed(1) + " kWh";
    document.getElementById('avgLabel').innerText = "Daily Avg: " + (total/7).toFixed(1) + " kWh";
    usageChart.data.labels = days; usageChart.data.datasets[0].data = data; usageChart.update();
}

function updateDayData() {
    const dateStr = new Date(document.getElementById('daySelect').value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    let labels = Array.from({length: 24}, (_, i) => i.toString());
    let data = Array.from({length: 24}, () => Math.random() * 2.5);
    let total = data.reduce((a, b) => a + b, 0);
    document.getElementById('timeLabel').innerText = `Usage on ${dateStr} (Demo Data)`;
    document.getElementById('totalUsageDisplay').innerText = total.toFixed(1) + " kWh";
    document.getElementById('avgLabel').innerText = "Peak: 8 PM";
    usageChart.data.labels = labels; usageChart.data.datasets[0].data = data; usageChart.update();
}

function updateMonthData() {
    const select = document.getElementById('monthSelect');
    let labels = Array.from({length: 30}, (_, i) => (i+1).toString());
    let data = Array.from({length: 30}, () => Math.random() * 10 + 2);
    let total = data.reduce((a, b) => a + b, 0);
    document.getElementById('timeLabel').innerText = `Usage for ${select.options[select.selectedIndex].text} (Demo Data)`;
    document.getElementById('totalUsageDisplay').innerText = total.toFixed(1) + " kWh";
    document.getElementById('avgLabel').innerText = "Daily Avg: " + (total/30).toFixed(1) + " kWh";
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
    
    sourceChart.options.scales.x.grid.display = false;
    sourceChart.config.type = (mode === 'minute' || mode === 'hour') ? 'line' : 'bar';

    if (mode === 'minute') { 
        document.getElementById('sourceTimeLabel').innerText = "Live Real-Time Source"; 
        document.getElementById('sourceAvgLabel').innerText = "Streaming from hardware...";
        // 🚨 FIX: Instantly pull the latest real-time value!
        document.getElementById('sourceTotalDisplay').innerText = Number(livePoleData[59]).toFixed(2) + " A";
        
        sourceChart.data.labels = liveTimeLabels;
        sourceChart.data.datasets[0].data = livePoleData;
        sourceChart.update();
    } else if (mode === 'hour') {
        document.getElementById('sourceTimeLabel').innerText = "Current Session (Last 60 ticks)"; 
        document.getElementById('sourceAvgLabel').innerText = "Active Database Feed";
        // 🚨 FIX: Instantly pull the latest real-time value!
        document.getElementById('sourceTotalDisplay').innerText = Number(livePoleData[59]).toFixed(2) + " A";
        
        sourceChart.data.labels = liveTimeLabels;
        sourceChart.data.datasets[0].data = livePoleData;
        sourceChart.update();
    } else if (mode === 'day') { 
        document.getElementById('sourceDaySelectorWrapper').style.display = 'block'; 
        updateSourceDayData(); 
    } else if (mode === 'week') { 
        document.getElementById('sourceWeekSubSelector').style.display = 'flex'; 
        setSourceSubWeek(7, document.querySelectorAll('.source-pill')[3]); 
    } else if (mode === 'month') { 
        document.getElementById('sourceMonthSelectorWrapper').style.display = 'block'; 
        updateSourceMonthData(); 
    } else if (mode === 'year') {
        let labels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        let data = Array.from({length: 12}, () => Math.random() * 55 + 100); 
        let total = data.reduce((a, b) => a + b, 0);
        document.getElementById('sourceTimeLabel').innerText = "Year 2026 (Demo Data)";
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
    document.getElementById('sourceTimeLabel').innerText = weekNum === 7 ? "Week 7 (Demo Data)" : `Week ${weekNum} (Demo Data)`;
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