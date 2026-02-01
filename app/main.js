// Chart is loaded via CDN in index.html

let data = {
    stats: { math: 0, reading: 0, pushups: 10535, squats: 0 },
    dailyLogs: {},
    settings: { pushupReminderMinutes: 25, gitAutoPush: true }
};

const timers = {
    math: { seconds: 0, interval: null },
    reading: { seconds: 0, interval: null },
    pushup: { seconds: 25 * 60, interval: null, active: true }
};

let trendsChart = null;

// --- Initialization ---

async function init() {
    try {
        const res = await fetch('/api/data');
        if (res.ok) {
            data = await res.json();
            if (!data.dailyLogs) data.dailyLogs = {};
            updateUI();
            renderHeatmap();
            renderCharts();
        }
    } catch (e) {
        console.error("Failed to load data", e);
    }

    setupEventListeners();
    startPushupLoop();

    if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission();
    }
}

function updateUI() {
    document.getElementById('pushup-count').textContent = data.stats.pushups.toLocaleString();
    document.getElementById('math-total').textContent = `${(data.stats.math / 3600).toFixed(1)}h`;
    document.getElementById('reading-total').textContent = `${(data.stats.reading / 3600).toFixed(1)}h`;
}

// --- Sync & Logging ---

function getTodayKey() {
    return new Date().toISOString().split('T')[0];
}

async function saveData() {
    try {
        await fetch('/api/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } catch (e) {
        console.error("Failed to save data", e);
    }
}

function logToDaily(type, value) {
    const today = getTodayKey();
    if (!data.dailyLogs[today]) {
        data.dailyLogs[today] = { math: 0, reading: 0, pushups: 0 };
    }
    data.dailyLogs[today][type] += value;
    renderHeatmap();
    renderCharts();
}

// --- Visuals ---

function renderHeatmap() {
    const heatmap = document.getElementById('heatmap');
    const monthsContainer = document.getElementById('heatmap-months');
    heatmap.innerHTML = '';
    monthsContainer.innerHTML = '';

    const selectedYear = 2026;
    const yearStart = new Date(selectedYear, 0, 1);
    const yearEnd = new Date(selectedYear, 11, 31);

    // Adjust start to previous Sunday for grid alignment
    const startDate = new Date(yearStart);
    startDate.setDate(startDate.getDate() - startDate.getDay());

    const totalWeeks = 53;
    const totalDays = totalWeeks * 7;
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    let currentMonth = -1;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < totalDays; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);

        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const key = `${y}-${m}-${day}`;

        const log = data.dailyLogs[key] || { math: 0, reading: 0, pushups: 0 };
        const isInYear = y === selectedYear;

        // Month labels (check every day, but only add the first time we see a month in its column)
        if (isInYear && d.getMonth() !== currentMonth) {
            currentMonth = d.getMonth();
            const monthEl = document.createElement('span');
            monthEl.textContent = monthNames[currentMonth];
            // Week index is i / 7
            monthEl.style.gridColumnStart = Math.floor(i / 7) + 1;
            monthsContainer.appendChild(monthEl);
        }

        const totalActivity = (log.math / 3600) + (log.reading / 3600) + (log.pushups / 50);
        let level = 0;
        if (totalActivity > 0) level = 1;
        if (totalActivity > 0.5) level = 2;
        if (totalActivity > 2) level = 3;
        if (totalActivity > 5) level = 4;

        const dayEl = document.createElement('div');
        dayEl.className = `heatmap-day level-${level}`;

        // Hide days outside the year but keep the space
        if (!isInYear) {
            dayEl.style.visibility = 'hidden';
        } else {
            dayEl.title = `${key}: ${totalActivity.toFixed(1)} activity units`;

            // Highlight today
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            if (key === todayStr) {
                dayEl.style.boxShadow = '0 0 6px var(--accent)';
                dayEl.style.zIndex = '1';
                dayEl.style.border = '1px solid var(--accent)';
            }
        }

        heatmap.appendChild(dayEl);
    }
}

function renderCharts() {
    const ctx = document.getElementById('trendsChart').getContext('2d');
    const last7Days = [...Array(7)].map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d.toISOString().split('T')[0];
    });

    const mathData = last7Days.map(day => (data.dailyLogs[day]?.math || 0) / 3600);
    const readingData = last7Days.map(day => (data.dailyLogs[day]?.reading || 0) / 3600);

    if (trendsChart) trendsChart.destroy();

    trendsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: last7Days.map(d => d.split('-').slice(1).join('/')),
            datasets: [
                {
                    label: 'Math (h)',
                    data: mathData,
                    borderColor: '#0071e3',
                    backgroundColor: 'rgba(0, 113, 227, 0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Reading (h)',
                    data: readingData,
                    borderColor: '#86868b',
                    backgroundColor: 'rgba(134, 134, 139, 0.1)',
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { display: false }, ticks: { color: '#a1a1a6' } },
                x: { grid: { display: false }, ticks: { color: '#a1a1a6' } }
            }
        }
    });
}

// --- Timer Logic ---

function toggleTimer(key) {
    const timer = timers[key];
    const display = document.getElementById(`${key}-timer`);
    const btn = document.getElementById(`${key}-start`);

    if (timer.interval) {
        clearInterval(timer.interval);
        timer.interval = null;
        btn.textContent = "Start";

        // Update stats and daily log
        data.stats[key] += timer.seconds;
        logToDaily(key, timer.seconds);

        timer.seconds = 0;
        display.textContent = "00:00:00";
        updateUI();
        saveData();
    } else {
        btn.textContent = "Pause";
        timer.seconds = 0;
        timer.interval = setInterval(() => {
            timer.seconds++;
            const hrs = Math.floor(timer.seconds / 3600);
            const mins = Math.floor((timer.seconds % 3600) / 60);
            const secs = timer.seconds % 60;
            display.textContent = `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }, 1000);
    }
}

function startPushupLoop() {
    const display = document.getElementById('pushup-timer');
    timers.pushup.interval = setInterval(() => {
        if (!timers.pushup.active) return;
        timers.pushup.seconds--;
        const mins = Math.floor(timers.pushup.seconds / 60);
        const secs = timers.pushup.seconds % 60;
        display.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        if (timers.pushup.seconds <= 0) {
            triggerReminder();
            timers.pushup.seconds = data.settings.pushupReminderMinutes * 60;
        }
    }, 1000);
}

function triggerReminder() {
    if (Notification.permission === "granted") {
        new Notification("Pulse Check", { body: "Time for a set of pushups!" });
    }
    document.getElementById('pushup-card').style.boxShadow = "0 0 20px rgba(255, 59, 48, 0.4)";
    setTimeout(() => {
        document.getElementById('pushup-card').style.boxShadow = "none";
    }, 5000);
}

// --- Event Listeners ---

function setupEventListeners() {
    document.getElementById('math-start').onclick = () => toggleTimer('math');
    document.getElementById('reading-start').onclick = () => toggleTimer('reading');

    document.getElementById('add-rep').onclick = () => {
        const reps = 10;
        data.stats.pushups += reps;
        logToDaily('pushups', reps);
        updateUI();
        saveData();
    };

    document.getElementById('pushup-toggle').onclick = (e) => {
        timers.pushup.active = !timers.pushup.active;
        e.target.textContent = timers.pushup.active ? "Disable" : "Enable";
    };

    document.getElementById('theme-toggle').onclick = () => {
        document.body.classList.toggle('dark');
        renderCharts(); // Re-render for color updates
    };

    // Year buttons interaction
    const yearContainer = document.getElementById('heatmap-years');
    if (yearContainer) {
        yearContainer.onclick = (e) => {
            if (e.target.classList.contains('year-btn')) {
                yearContainer.querySelectorAll('.year-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
            }
        };
    }

    // JustPush Sync
    const syncBtn = document.getElementById('sync-btn');
    if (syncBtn) {
        syncBtn.onclick = async () => {
            syncBtn.classList.add('loading');
            syncBtn.disabled = true;
            try {
                const resp = await fetch('/api/sync-justpush', { method: 'POST' });
                const result = await resp.json();
                if (result.success) {
                    const newData = await (await fetch('/api/data')).json();
                    Object.assign(data, newData);
                    updateUI();
                    renderHeatmap();
                    renderCharts();
                    alert(`Sync Complete! Merged ${result.merged} updates.`);
                } else {
                    alert('Sync failed. Check connection.');
                }
            } catch (err) {
                console.error(err);
                alert('External sync error.');
            } finally {
                syncBtn.classList.remove('loading');
                syncBtn.disabled = false;
            }
        };
    }
}

init();
