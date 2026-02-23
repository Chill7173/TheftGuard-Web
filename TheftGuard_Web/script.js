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

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth();

let currentUserUid = null;
let currentDeviceRef = null; 

// ==========================================
// 2. DEVICE PAIRING & LIVE LISTENER
// ==========================================

function loadPairedDevice() {
    document.getElementById('pairingCard').style.display = 'block'; 
    
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
    });
}

function startListeningToDevice(macAddress) {
    if (currentDeviceRef) currentDeviceRef.off(); 

    currentDeviceRef = database.ref('live_grid/' + macAddress);
    
    currentDeviceRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            let poleVal = parseFloat(data.pole).toFixed(2);
            let houseVal = parseFloat(data.house).toFixed(2);
            
            document.getElementById('poleCurrent').innerText = poleVal + " A";
            document.getElementById('houseCurrent').innerText = houseVal + " A";
            
            const banner = document.getElementById('theftAlertBanner');
            if (poleVal - houseVal > 1.0) {
                document.querySelectorAll('.card-custom')[1].classList.add('theft-active');
                document.querySelectorAll('.card-custom')[2].classList.add('theft-active');
                banner.style.display = "block"; 
            } else {
                document.querySelectorAll('.card-custom').forEach(el => el.classList.remove('theft-active'));
                banner.style.display = "none"; 
            }
        }
    });
}

// ==========================================
// 3. FIREBASE AUTHENTICATION 
// ==========================================

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function handleLogin(e) {
    e.preventDefault(); 
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const loginBtn = document.getElementById('loginSubmitBtn');

    if (!isValidEmail(email)) return alert("Please enter a valid email address.");

    loginBtn.innerText = "Verifying...";
    loginBtn.disabled = true;

    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            currentUserUid = userCredential.user.uid; 
            
            bootstrap.Modal.getInstance(document.getElementById('loginModal')).hide();
            document.getElementById('loginBtn').style.display = 'none';
            document.getElementById('userProfile').style.display = 'flex';
            
            const username = userCredential.user.email.split('@')[0].toUpperCase();
            document.getElementById('userNameDisplay').innerText = username;

            loadPairedDevice(); 

            loginBtn.innerText = "Login";
            loginBtn.disabled = false;
        })
        .catch((error) => {
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                alert("Login Failed: Incorrect Email or Password.");
            } else {
                alert("Login Failed: " + error.message);
            }
            loginBtn.innerText = "Login";
            loginBtn.disabled = false;
        });
}

function handleRegister(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const registerBtn = document.getElementById('registerBtn');

    if (!email || !password) return alert("Please enter both an email and a password.");
    if (!isValidEmail(email)) return alert("Please enter a valid email address.");
    if (password.length < 6) return alert("Firebase requires passwords to be at least 6 characters long.");

    registerBtn.innerText = "Creating...";
    registerBtn.disabled = true;

    auth.createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
            currentUserUid = userCredential.user.uid; 
            alert("Account created! You can now pair a device.");
            
            bootstrap.Modal.getInstance(document.getElementById('loginModal')).hide();
            document.getElementById('loginBtn').style.display = 'none';
            document.getElementById('userProfile').style.display = 'flex';
            
            const username = userCredential.user.email.split('@')[0].toUpperCase();
            document.getElementById('userNameDisplay').innerText = username;

            loadPairedDevice(); 

            registerBtn.innerText = "Create Account";
            registerBtn.disabled = false;
        })
        .catch((error) => {
            if (error.code === 'auth/email-already-in-use') {
                alert("Registration Failed: This email is already registered.");
            } else {
                alert("Registration Failed: " + error.message);
            }
            registerBtn.innerText = "Create Account";
            registerBtn.disabled = false;
        });
}

function handleLogout() {
    auth.signOut().then(() => {
        currentUserUid = null;
        if (currentDeviceRef) currentDeviceRef.off(); 
        
        document.getElementById('userProfile').style.display = 'none';
        document.getElementById('loginBtn').style.display = 'block';
        document.getElementById('pairingCard').style.display = 'none'; 
        
        document.getElementById('poleCurrent').innerText = "0.0 A";
        document.getElementById('houseCurrent').innerText = "0.0 A";
        
        document.getElementById('loginEmail').value = "";
        document.getElementById('loginPassword').value = "";
    });
}

// ==========================================
// 4. NAVIGATION & UI LOGIC
// ==========================================

function showPage(pageId) {
    document.getElementById('dashboardPage').style.display = 'none';
    document.getElementById('costPage').style.display = 'none';
    document.getElementById(pageId + 'Page').style.display = 'block';

    document.getElementById('nav-dash').classList.remove('active');
    document.getElementById('nav-cost').classList.remove('active');
    
    if(pageId === 'dashboard') document.getElementById('nav-dash').classList.add('active');
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
        data: {
            labels: ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'],
            datasets: [{
                label: 'Bill (₹)',
                data: [1100, 1250, 1180, 1340, 1290, 1425],
                backgroundColor: '#30d158', 
                borderRadius: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { 
                y: { position: 'right', grid: { color: '#333' }, ticks: { color: '#8e8e93' } },
                x: { grid: { display: false }, ticks: { color: '#8e8e93' } }
            }
        }
    });
}

// ==========================================
// 5. DASHBOARD CHARTS & TABS
// ==========================================

const ctx = document.getElementById('usageChart').getContext('2d');
let usageChart = new Chart(ctx, {
    type: 'bar',
    data: { labels: [], datasets: [{ data: [], backgroundColor: '#0a84ff', borderRadius: 4, barPercentage: 0.8, categoryPercentage: 0.9 }] },
    options: {
        responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { 
            y: { position: 'right', grid: { color: '#333' }, ticks: { color: '#8e8e93', font: {size: 10} } }, 
            x: { grid: { display: false }, ticks: { color: '#8e8e93', font: { size: 9 }, autoSkip: false, minRotation: 0, maxRotation: 0 } } 
        }
    }
});

window.onload = function() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('daySelect').value = today;
    setView('week', document.querySelectorAll('.view-tab')[1]);
};

function setView(mode, element) {
    document.querySelectorAll('.view-tab').forEach(el => el.classList.remove('active'));
    if(element) element.classList.add('active');
    
    document.getElementById('customDateControls').style.display = 'none';
    document.getElementById('weekSubSelector').style.display = 'none';
    document.getElementById('monthSelectorWrapper').style.display = 'none';
    document.getElementById('daySelectorWrapper').style.display = 'none';

    let labels = [], data = [], total = 0, labelText = "", avgText = "";

    if (mode === 'day') {
        document.getElementById('daySelectorWrapper').style.display = 'block';
        updateDayData(); return;
    } 
    else if (mode === 'week') {
        document.getElementById('weekSubSelector').style.display = 'flex';
        setSubWeek(7, document.querySelectorAll('.sub-pill')[3]); return;
    }
    else if (mode === 'month') {
        document.getElementById('monthSelectorWrapper').style.display = 'block';
        updateMonthData(); return;
    }
    else if (mode === 'year') {
        labelText = "Year 2026";
        labels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        data = Array.from({length: 12}, () => Math.random() * 100 + 50);
        avgText = "Total: 1.2 MWh";
        usageChart.data.labels = labels;
        usageChart.data.datasets[0].data = data;
        usageChart.update();
    }

    if(mode === 'year') {
        total = data.reduce((a, b) => a + b, 0);
        document.getElementById('timeLabel').innerText = labelText;
        document.getElementById('totalUsageDisplay').innerText = total.toFixed(1) + " kWh";
        document.getElementById('avgLabel').innerText = avgText;
    }
}

function setSubWeek(weekNum, element) {
    document.querySelectorAll('.sub-pill').forEach(el => el.classList.remove('active'));
    if(element) element.classList.add('active');
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    let data = [];
    for(let i=0; i<7; i++) data.push(Math.random() * 10 + (weekNum));
    let total = data.reduce((a, b) => a + b, 0);
    
    let dateRangeText = "";
    if(weekNum === 4) dateRangeText = "19 Jan - 25 Jan (Week 4)";
    if(weekNum === 5) dateRangeText = "26 Jan - 1 Feb (Week 5)";
    if(weekNum === 6) dateRangeText = "2 Feb - 8 Feb (Week 6)";
    if(weekNum === 7) dateRangeText = "9 Feb - 15 Feb (Week 7)";

    document.getElementById('timeLabel').innerText = dateRangeText;
    document.getElementById('totalUsageDisplay').innerText = total.toFixed(1) + " kWh";
    document.getElementById('avgLabel').innerText = "Daily Avg: " + (total/7).toFixed(1) + " kWh";
    usageChart.data.labels = days;
    usageChart.data.datasets[0].data = data;
    usageChart.update();
}

function updateDayData() {
    const dateVal = document.getElementById('daySelect').value;
    const dateObj = new Date(dateVal);
    const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    let labels = []; let data = [];
    for(let i=0; i<24; i++) {
        let hour = i < 10 ? "0" + i : i;
        labels.push(hour); data.push(Math.random() * 2.5);
    }
    let total = data.reduce((a, b) => a + b, 0);
    document.getElementById('timeLabel').innerText = `Usage on ${dateStr}`;
    document.getElementById('totalUsageDisplay').innerText = total.toFixed(1) + " kWh";
    document.getElementById('avgLabel').innerText = "Peak: 8 PM";
    usageChart.data.labels = labels;
    usageChart.data.datasets[0].data = data;
    usageChart.update();
}

function updateMonthData() {
    const select = document.getElementById('monthSelect');
    const monthName = select.options[select.selectedIndex].text;
    let labels = Array.from({length: 30}, (_, i) => (i+1).toString());
    let data = Array.from({length: 30}, () => Math.random() * 10 + 2);
    let total = data.reduce((a, b) => a + b, 0);
    document.getElementById('timeLabel').innerText = `Usage for ${monthName}`;
    document.getElementById('totalUsageDisplay').innerText = total.toFixed(1) + " kWh";
    document.getElementById('avgLabel').innerText = "Daily Avg: " + (total/30).toFixed(1) + " kWh";
    usageChart.data.labels = labels;
    usageChart.data.datasets[0].data = data;
    usageChart.update();
}

function toggleCustomDate(element) {
    document.querySelectorAll('.view-tab').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    document.getElementById('weekSubSelector').style.display = 'none';
    document.getElementById('monthSelectorWrapper').style.display = 'none';
    document.getElementById('daySelectorWrapper').style.display = 'none';
    const controls = document.getElementById('customDateControls');
    controls.style.display = controls.style.display === 'block' ? 'none' : 'block';
}

function applyCustomRange() {
    const start = document.getElementById('startDate').value;
    const end = document.getElementById('endDate').value;
    if(!start || !end) return alert("Select dates");
    usageChart.data.labels = ['D1', 'D2', 'D3', 'D4'];
    usageChart.data.datasets[0].data = [12, 19, 3, 5];
    usageChart.update();
}