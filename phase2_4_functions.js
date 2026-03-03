// Phase 2, 3, 4 Additional Functions
// This file contains all the functionality for Rules (Phase 2), Analytics (Phase 3), and Email Reports (Phase 4)

// ==================== PHASE 2: RULES & AUTOMATION ====================

let automationRules = [];

// ==================== PHASE 3: ANALYTICS TRACKING ====================
let lastAnalyticsUpdate = 0;
let analyticsUpdateInterval = 2000; // Update every 2 seconds max
const analyticsDebounce = () => {
    const now = Date.now();
    if (now - lastAnalyticsUpdate > analyticsUpdateInterval) {
        lastAnalyticsUpdate = now;
        return true;
    }
    return false;
};

function loadRules() {
    const savedRules = localStorage.getItem('theftguardRules');
    if (savedRules) {
        automationRules = JSON.parse(savedRules);
    } else {
        automationRules = [
            { id: 1, name: 'Critical Theft Alert', condition: 'theft_suspected', threshold: null, action: 'alert' },
            { id: 2, name: 'High Usage Warning', condition: 'usage_high', threshold: 20, action: 'alert' }
        ];
        saveRules();
    }
    updateRulesList();
}

function saveRules() {
    localStorage.setItem('theftguardRules', JSON.stringify(automationRules));
}

function showRuleBuilder() {
    const section = document.getElementById('ruleBuilderSection');
    if (section) section.style.display = 'block';
    const thresholdInput = document.getElementById('ruleThreshold');
    if (thresholdInput) {
        thresholdInput.placeholder = `e.g., 15 (${userSettings.unit})`;
    }
}

function cancelRuleBuilder() {
    document.getElementById('ruleBuilderSection').style.display = 'none';
    document.getElementById('ruleName').value = '';
    document.getElementById('ruleThreshold').value = '';
}

function saveRule() {
    const name = document.getElementById('ruleName').value.trim();
    const condition = document.getElementById('ruleCondition').value;
    let threshold = document.getElementById('ruleThreshold').value;
    const action = document.getElementById('ruleAction').value;

    if (!name) {
        showToast('Error', 'Please enter a rule name', 'danger', 3000);
        return;
    }

    // convert threshold from display unit to base Amps
    let thrVal = threshold ? parseFloat(threshold) : null;
    if (thrVal !== null) {
        if (userSettings.unit === 'W') {
            thrVal = thrVal / 230;
        } else if (userSettings.unit === 'kW') {
            thrVal = thrVal * 1000 / 230;
        }
    }
    const newRule = {
        id: automationRules.length + 1,
        name: name,
        condition: condition,
        threshold: thrVal !== null ? thrVal : null,
        action: action,
        enabled: true,
        createdAt: new Date().toISOString()
    };

    automationRules.push(newRule);
    saveRules();
    updateRulesList();
    cancelRuleBuilder();
    showToast('Success', `Rule "${name}" created`, 'success', 3000);
}

function deleteRule(ruleId) {
    if (confirm('Delete this rule?')) {
        automationRules = automationRules.filter(r => r.id !== ruleId);
        saveRules();
        updateRulesList();
        showToast('Deleted', 'Rule removed', 'info', 2000);
    }
}

function toggleRule(ruleId) {
    const rule = automationRules.find(r => r.id === ruleId);
    if (rule) {
        rule.enabled = !rule.enabled;
        saveRules();
        updateRulesList();
    }
}

function updateRulesList() {
    const rulesList = document.getElementById('rulesList');
    const noRulesMsg = document.getElementById('noRulesMessage');

    if (automationRules.length === 0) {
        rulesList.innerHTML = '';
        noRulesMsg.style.display = 'block';
        return;
    }

    noRulesMsg.style.display = 'none';
    rulesList.innerHTML = automationRules.map(rule => {
        // prepare display threshold in current unit
        let thrDisplay = '';
        if (rule.threshold !== null && rule.threshold !== undefined) {
            let v = rule.threshold;
            if (userSettings.unit === 'W') v = v * 230;
            else if (userSettings.unit === 'kW') v = v * 230 / 1000;
            thrDisplay = '→ ' + v.toFixed(2) + ' ' + userSettings.unit;
        }
        return `
        <div class="card-custom mb-3 p-3" style="border-left: 3px solid ${rule.enabled ? '#00ff00' : '#ff3b30'};">
            <div class="d-flex justify-content-between align-items-start mb-2">
                <div>
                    <h6 class="fw-bold text-white mb-1">${rule.name}</h6>
                    <small class="text-white-50">${rule.condition.toUpperCase()} ${thrDisplay}</small>
                </div>
                <span class="badge ${rule.enabled ? 'bg-success' : 'bg-danger'}">
                    ${rule.enabled ? 'Active' : 'Inactive'}
                </span>
            </div>
            <div class="d-flex gap-2">
                <button class="btn btn-sm btn-outline-light" onclick="toggleRule(${rule.id})">
                    ${rule.enabled ? 'Disable' : 'Enable'}
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteRule(${rule.id})">
                    Delete
                </button>
            </div>
        </div>
    `;
    }).join('');
}

function evaluateRules(poleVal, houseVal) {
    automationRules.filter(r => r.enabled).forEach(rule => {
        let triggered = false;

        if (rule.condition === 'usage_high' && poleVal > rule.threshold) {
            triggered = true;
        } else if (rule.condition === 'usage_low' && poleVal < rule.threshold) {
            triggered = true;
        } else if (rule.condition === 'theft_suspected' && (poleVal - houseVal) > 0.2) {
            triggered = true;
        } else if (rule.condition === 'anomaly') {
            // Check if current reading is outside normal range
            const avgUsage = realTimeReadings.length > 0 ?
                realTimeReadings.reduce((s, r) => s + r.pole_current, 0) / realTimeReadings.length : 0;
            if (Math.abs(poleVal - avgUsage) > 5) {
                triggered = true;
            }
        }

        if (triggered) {
            executeRuleAction(rule, poleVal);
        }
    });
}

function executeRuleAction(rule, currentValue) {
    switch (rule.action) {
        case 'alert':
            showToast('Rule Triggered', `${rule.name}: ${currentValue}A`, 'warning', 5000);
            addNotification(rule.name, `Condition met: ${rule.condition}`, 'warning');
            break;
        case 'email':
            sendEmailAlert(rule.name, currentValue);
            break;
        case 'disconnect':
            if (confirm(`Execute: ${rule.name}? This will disconnect the relay.`)) {
                disconnectRelay();
            }
            break;
        case 'log':
            logRuleEvent(rule.name, currentValue);
            break;
    }
}

function logRuleEvent(ruleName, value) {
    const event = {
        timestamp: new Date().toISOString(),
        rule: ruleName,
        value: value
    };
    let events = JSON.parse(localStorage.getItem('theftguardRuleEvents') || '[]');
    events.push(event);
    localStorage.setItem('theftguardRuleEvents', JSON.stringify(events.slice(-100)));
}

// ==================== PHASE 3: ADVANCED ANALYTICS ====================

function calculateAnalytics() {
    if (realTimeReadings.length === 0) {
        const elem = document.getElementById('avgDailyUsage');
        if (elem) elem.innerText = '0.00 ' + userSettings.unit;
        const elem2 = document.getElementById('peakUsage');
        if (elem2) elem2.innerText = '0.00 ' + userSettings.unit;
        const elem3 = document.getElementById('anomalyCount');
        if (elem3) elem3.innerText = '0';
        const elem4 = document.getElementById('efficiencyScore');
        if (elem4) elem4.innerText = '100%';
        return;
    }

    try {
// convert readings into selected unit
    const readings = realTimeReadings.map(r => {
        let val = parseFloat(r.pole_current);
        if (userSettings.unit === 'W') val *= 230;
        else if (userSettings.unit === 'kW') val = val * 230 / 1000;
        return val;
    });
        const avgDaily = (readings.reduce((a, b) => a + b, 0) / readings.length).toFixed(2);
        const peakUsage = Math.max(...readings).toFixed(2);

        const avgElem = document.getElementById('avgDailyUsage');
        if (avgElem) avgElem.innerText = `${avgDaily} ${userSettings.unit}`;
        
        const peakElem = document.getElementById('peakUsage');
        if (peakElem) peakElem.innerText = `${peakUsage} ${userSettings.unit}`;

        const anomalies = calculateAnomalies();
        const anomalyElem = document.getElementById('anomalyCount');
        if (anomalyElem) anomalyElem.innerText = anomalies.length;

        const efficiency = calculateEfficiencyScore();
        const effElem = document.getElementById('efficiencyScore');
        if (effElem) effElem.innerText = efficiency + '%';

        updatePatternChart();
        updateAnomalyChart();
        updateHourlyBreakdown();
    } catch (e) {
        console.error('Error calculating analytics:', e);
    }
}

function calculateAnomalies() {
    if (realTimeReadings.length < 10) return [];

    // convert readings to selected unit for anomaly detection
    const converted = realTimeReadings.map(r => {
        let val = parseFloat(r.pole_current);
        if (userSettings.unit === 'W') val *= 230;
        else if (userSettings.unit === 'kW') val = val * 230 / 1000;
        return val;
    });
    const avg = converted.reduce((s, v) => s + v, 0) / converted.length;
    const stdDev = Math.sqrt(
        converted.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / converted.length
    );

    return realTimeReadings.filter(r => Math.abs(r.pole_current - avg) > stdDev * 2);
}

function calculateEfficiencyScore() {
    if (realTimeReadings.length === 0) return 0;
    const avgDiff = realTimeReadings.reduce((s, r) => s + Math.abs(r.pole_current - r.house_current), 0) / realTimeReadings.length;
    const avgPole = realTimeReadings.reduce((s, r) => s + r.pole_current, 0) / realTimeReadings.length;
    return Math.max(0, Math.min(100, 100 - (avgDiff / avgPole * 100)));
}

function updatePatternChart() {
    const canvasElem = document.getElementById('patternChart');
    const parent = canvasElem ? canvasElem.parentElement : null;
    if (!canvasElem) return;
    if (realTimeReadings.length === 0) {
        if (parent) parent.innerHTML = '<div class="text-white-50" style="padding: 40px; text-align:center;">No readings yet</div>';
        return;
    }
    // remove any placeholder message
    if (parent) parent.innerHTML = '<canvas id="patternChart" style="position: absolute; top: 0; left: 0; width: 100% !important; height: 100% !important;"></canvas>';
    const newCanvas = document.getElementById('patternChart');
    if (!newCanvas) return;

    try {
        const lastReadings = realTimeReadings.slice(-24);
        const labels = lastReadings.map((r, i) => {
            const date = new Date(r.timestamp);
            return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        });
        const poleData = lastReadings.map(r => parseFloat(r.pole_current) || 0);

        if (window.patternChartInstance) {
            window.patternChartInstance.destroy();
        }

        const ctx = newCanvas.getContext('2d');
        window.patternChartInstance = new Chart(ctx, {
            type: 'area',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Usage Pattern (' + userSettings.unit + ')',
                    data: poleData,
                    borderColor: '#ffcc00',
                    backgroundColor: 'rgba(255, 204, 0, 0.15)',
                    tension: 0.3,
                    fill: true,
                    borderWidth: 2,
                    pointRadius: 4,
                    pointBackgroundColor: '#ffcc00',
                    pointBorderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: { 
                    legend: { display: true, labels: { color: '#fff', font: { size: 12 } } },
                    title: { display: false }
                },
                scales: {
                    y: { 
                        beginAtZero: true,
                        ticks: { color: '#999' }, 
                        grid: { color: '#333', drawBorder: false }
                    },
                    x: { 
                        ticks: { color: '#999', maxRotation: 45, minRotation: 0 }, 
                        grid: { color: '#333', drawBorder: false }
                    }
                }
            }
        });
    } catch (e) {
        console.error('Error rendering pattern chart:', e);
    }
}

function updateAnomalyChart() {
    const canvasElem = document.getElementById('anomalyChart');
    const parent = canvasElem ? canvasElem.parentElement : null;
    if (!canvasElem) return;
    if (realTimeReadings.length === 0) {
        if (parent) parent.innerHTML = '<div class="text-white-50" style="padding: 40px; text-align:center;">No readings yet</div>';
        return;
    }
    if (parent) parent.innerHTML = '<canvas id="anomalyChart" style="position: absolute; top: 0; left: 0; width: 100% !important; height: 100% !important;"></canvas>';
    const newCanvas = document.getElementById('anomalyChart');
    if (!newCanvas) return;

    try {
        const anomalies = calculateAnomalies();
        if (anomalies.length === 0) {
            if (parent) parent.innerHTML = '<div class="text-white-50" style="padding: 40px; text-align:center;">No anomalies detected</div>';
            return;
        }
        const hours = 24;
        const anomalyCount = new Array(hours).fill(0);

        anomalies.forEach(a => {
            const hour = new Date(a.timestamp).getHours();
            anomalyCount[hour]++;
        });

        if (window.anomalyChartInstance) {
            window.anomalyChartInstance.destroy();
        }

        const ctx = newCanvas.getContext('2d');
        window.anomalyChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`),
                datasets: [{
                    label: 'Anomalies Detected',
                    data: anomalyCount,
                    backgroundColor: 'rgba(255, 59, 48, 0.6)',
                    borderColor: '#ff3b30',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { 
                    legend: { display: true, labels: { color: '#fff', font: { size: 12 } } }
                },
                scales: {
                    y: { 
                        beginAtZero: true,
                        ticks: { color: '#999' }, 
                        grid: { color: '#333', drawBorder: false }
                    },
                    x: { 
                        ticks: { color: '#999' }, 
                        grid: { color: '#333', drawBorder: false }
                    }
                }
            }
        });
    } catch (e) {
        console.error('Error rendering anomaly chart:', e);
    }
}

function updateHourlyBreakdown() {
    const container = document.getElementById('hourlyBreakdown');
    if (!container) return;
    if (realTimeReadings.length === 0) {
        container.innerHTML = '<div class="text-white-50" style="padding: 20px; text-align:center;">No readings yet</div>';
        return;
    }

    try {
        const hourlyStats = new Array(24).fill(null).map(() => ({ sum: 0, count: 0 }));
        
        realTimeReadings.forEach(r => {
            const hour = new Date(r.timestamp).getHours();
            hourlyStats[hour].sum += parseFloat(r.pole_current) || 0;
            hourlyStats[hour].count++;
        });

        const hourlyAvg = hourlyStats.map(stat => stat.count > 0 ? stat.sum / stat.count : 0);
        const maxVal = Math.max(...hourlyAvg);
        const validMaxVal = maxVal > 0 ? maxVal : 1;
        const totalSum = hourlyAvg.reduce((a,b)=>a+b,0);
        if (totalSum === 0) {
            container.innerHTML = '<div class="text-white-50" style="padding:20px;text-align:center;">No usage data</div>';
            return;
        }
        container.innerHTML = hourlyAvg.map((val, hour) => {
            const pct = maxVal > 0 ? ((val / validMaxVal) * 100).toFixed(0) : 0;
            const displayVal = val.toFixed(2);
            const unit = userSettings.unit || 'A';
            return `
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                    <span style="width: 35px; text-align: right; font-size: 12px; color: #999; font-weight: 500;">${String(hour).padStart(2, '0')}:00</span>
                    <div style="flex: 1; height: 24px; background: #333; border-radius: 4px; position: relative; overflow: hidden;">
                        <div style="height: 100%; width: ${pct}%; background: linear-gradient(90deg, #ffcc00, #ff9500); border-radius: 4px; transition: width 0.3s ease;"></div>
                    </div>
                    <span style="width: 50px; text-align: right; font-weight: bold; color: #ffcc00; font-size: 12px;">${displayVal} ${unit}</span>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error('Error updating hourly breakdown:', e);
    }
}

// ==================== PHASE 3: EMAIL REPORTS ====================

function saveEmailPreferences() {
    const prefs = {
        dailyReport: document.getElementById('emailDailyReport')?.checked || false,
        weeklyReport: document.getElementById('emailWeeklyReport')?.checked || false,
        monthlyReport: document.getElementById('emailMonthlyReport')?.checked || false,
        anomalyAlerts: document.getElementById('emailAnomalyAlerts')?.checked || false
    };
    localStorage.setItem('emailPreferences', JSON.stringify(prefs));
}

function scheduleEmailReports() {
    // This would typically be handled server-side
    // For now, we'll store the schedule preference
    const prefs = JSON.parse(localStorage.getItem('emailPreferences') || '{}');
    
    if (prefs.dailyReport) {
        // Schedule daily report at 8 AM
        scheduleDailyReport();
    }
    if (prefs.weeklyReport) {
        // Schedule weekly report on Monday at 9 AM
        scheduleWeeklyReport();
    }
    if (prefs.monthlyReport) {
        // Schedule monthly report on 1st of month at 10 AM
        scheduleMonthlyReport();
    }
}

function generateEmailReport(type) {
    const readings = realTimeReadings;
    const avgUsage = readings.length > 0 ? (readings.reduce((s, r) => s + r.pole_current, 0) / readings.length).toFixed(2) : 0;
    const maxUsage = readings.length > 0 ? Math.max(...readings.map(r => r.pole_current)).toFixed(2) : 0;

    const report = {
        type: type,
        timestamp: new Date().toISOString(),
        summary: {
            averageUsage: avgUsage,
            peakUsage: maxUsage,
            totalReadings: readings.length,
            anomalies: calculateAnomalies().length
        }
    };

    return report;
}

function sendEmailAlert(subject, content) {
    const alert = {
        subject: subject,
        content: content,
        timestamp: new Date().toISOString(),
        email: currentUser?.email || 'admin@theftguard.local'
    };
    
    console.log('Email alert queued:', alert);
    addNotification(subject, content, 'danger');
    
    // Queue for backend processing via Firebase
    localStorage.setItem('emailQueue', JSON.stringify([
        ...JSON.parse(localStorage.getItem('emailQueue') || '[]'),
        alert
    ]));
}

function scheduleDailyReport() {
    const now = new Date();
    const scheduled = new Date();
    scheduled.setHours(8, 0, 0, 0);
    
    if (scheduled <= now) {
        scheduled.setDate(scheduled.getDate() + 1);
    }
    
    const timeout = scheduled - now;
    setTimeout(() => {
        const report = generateEmailReport('daily');
        sendEmailAlert('Daily Energy Report', JSON.stringify(report));
        scheduleDailyReport();
    }, timeout);
}

function scheduleWeeklyReport() {
    const now = new Date();
    const scheduled = new Date();
    scheduled.setDate(scheduled.getDate() + (1 + 7 - scheduled.getDay()) % 7);
    scheduled.setHours(9, 0, 0, 0);
    
    const timeout = Math.max(0, scheduled - now);
    setTimeout(() => {
        const report = generateEmailReport('weekly');
        sendEmailAlert('Weekly Energy Report', JSON.stringify(report));
        scheduleWeeklyReport();
    }, timeout);
}

function scheduleMonthlyReport() {
    const now = new Date();
    const scheduled = new Date();
    scheduled.setMonth(scheduled.getMonth() + 1);
    scheduled.setDate(1);
    scheduled.setHours(10, 0, 0, 0);
    
    const timeout = Math.max(0, scheduled - now);
    setTimeout(() => {
        const report = generateEmailReport('monthly');
        sendEmailAlert('Monthly Energy Bill Report', JSON.stringify(report));
        scheduleMonthlyReport();
    }, timeout);
}

// ==================== PHASE 4: PWA INSTALL PROMPT ====================

let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showPWAInstallPrompt();
});

function showPWAInstallPrompt() {
    if (deferredPrompt) {
        showToast('Install App', 'Add TheftGuard to your home screen', 'info', 5000);
    }
}

function installPWA() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('PWA installed');
                showToast('Success', 'App installed to home screen', 'success', 3000);
            }
            deferredPrompt = null;
        });
    }
}

// ==================== PAGE NAVIGATION FUNCTIONS ====================



// ==================== OFFLINE SUPPORT & SYNC ====================

window.addEventListener('online', () => {
    showToast('Connected', 'Back online - syncing data', 'success', 2000);
    syncOfflineData();
});

window.addEventListener('offline', () => {
    showToast('Offline', 'App will work with cached data', 'warning', 2000);
});

function syncOfflineData() {
    const queue = JSON.parse(localStorage.getItem('emailQueue') || '[]');
    if (queue.length > 0) {
        console.log('Syncing', queue.length, 'queued items');
        // Process queue here
        localStorage.setItem('emailQueue', '[]');
    }
}

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', () => {
    loadRules();
    scheduleEmailReports();
    if (typeof calculateAnalytics === 'function') {
        calculateAnalytics();
    }
    // Setup email preference listeners
    ['emailDailyReport', 'emailWeeklyReport', 'emailMonthlyReport', 'emailAnomalyAlerts'].forEach(id => {
        const elem = document.getElementById(id);
        if (elem) {
            elem.addEventListener('change', saveEmailPreferences);
        }
    });
});
