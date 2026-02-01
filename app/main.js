// Chart is loaded via CDN in index.html

let data = {
    stats: { pushups: 10535 },
    dailyLogs: {},
    timerNames: { t1: "Mathematics", t2: "Reading", t3: "Coding" },
    settings: { pushupReminderMinutes: 25, gitAutoPush: true }
};

const timers = {
    t1: { seconds: 0, startTime: null, interval: null },
    t2: { seconds: 0, startTime: null, interval: null },
    t3: { seconds: 0, startTime: null, interval: null },
    pushup: { seconds: 25 * 60, startTime: null, interval: null, active: true }
};

let trendsChart = null;

// --- Migration Helper ---
function migrateData(loadedData) {
    if (!loadedData.timerNames) {
        loadedData.timerNames = { t1: "Mathematics", t2: "Reading", t3: "Coding" };
    }
    // Map old math/reading stats if they exist
    if (loadedData.stats.math) loadedData.stats.t1_total = loadedData.stats.math;
    if (loadedData.stats.reading) loadedData.stats.t2_total = loadedData.stats.reading;

    // Migrate dailyLogs keys from old format
    if (loadedData.dailyLogs) {
        Object.values(loadedData.dailyLogs).forEach(log => {
            if (log.math !== undefined) {
                log["Mathematics"] = (log["Mathematics"] || 0) + log.math;
                delete log.math;
            }
            if (log.reading !== undefined) {
                log["Reading"] = (log["Reading"] || 0) + log.reading;
                delete log.reading;
            }
        });
    }

    return loadedData;
}

// --- Initialization ---

const ghConfig = {
    repo: localStorage.getItem('gh-repo') || '',
    token: localStorage.getItem('gh-token') || '',
    dataFile: 'timer-data.json'
};

let dataSha = ''; // Required for GitHub File Updates

async function fetchGH(path, options = {}) {
    // Sanitize repo name: extract user/repo from URL if needed
    let repo = ghConfig.repo.trim();
    if (repo.includes("github.com/")) {
        repo = repo.split("github.com/")[1].split(/[?#]/)[0];
    }
    repo = repo.replace(/\/$/, ""); // Remove trailing slash

    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const url = `https://api.github.com/repos/${repo}${cleanPath}`;

    console.log(`GitHub API Request: ${options.method || 'GET'} ${url}`);

    const headers = {
        'Authorization': `Bearer ${ghConfig.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        ...options.headers
    };
    return fetch(url, { ...options, headers });
}

async function init() {
    console.log("Initializing App...");
    setupEventListeners(); // Must call this first so Save button works!

    if (!ghConfig.repo || !ghConfig.token) {
        console.warn("GitHub Configuration not found. Opening Settings.");
        document.getElementById('settings-modal').classList.add('active');
        return;
    }

    try {
        const res = await fetchGH(`/contents/${ghConfig.dataFile}`);
        console.log("GitHub Response Status:", res.status);

        if (res.ok) {
            const fileData = await res.json();
            dataSha = fileData.sha;
            const content = atob(fileData.content);
            data = migrateData(JSON.parse(content));
            console.log("Data loaded successfully from GitHub. SHA:", dataSha);

            if (!data.dailyLogs) data.dailyLogs = {};
            loadTimerState();
            updateUI();
            renderHeatmap();
            renderCharts();
        } else if (res.status === 404) {
            console.warn("GitHub path not found. This is normal if 'timer-data.json' doesn't exist yet, but if you see sync errors, ensure your 'username/repo' is correct in Settings.");
        } else if (res.status === 401 || res.status === 403) {
            alert("GitHub Authentication Failed: Check your Token in Settings.");
        } else {
            const err = await res.json();
            console.error("GitHub Load Error:", res.status, err);
            alert(`GitHub Error: ${err.message}`);
        }
    } catch (e) {
        console.error("Critical Init Error:", e);
        alert("Failed to initialize. Check console for details.");
    }

    startPushupLoop();

    if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission();
    }
}

function updateUI() {
    // Update Timer Titles
    Object.keys(data.timerNames).forEach(id => {
        const titleEl = document.querySelector(`.timer-title[data-id="${id}"]`);
        if (titleEl) titleEl.textContent = data.timerNames[id];

        const totalEl = document.getElementById(`${id}-total`);
        const totalSeconds = Object.values(data.dailyLogs).reduce((acc, log) => acc + (log[data.timerNames[id]] || 0), 0);
        if (totalEl) totalEl.textContent = `${(totalSeconds / 3600).toFixed(1)}h`;
    });

    const pushupEl = document.getElementById('total-pushups');
    if (pushupEl) pushupEl.textContent = data.stats.pushups.toLocaleString();

    // Update Current Timer Displays
    ['t1', 't2', 't3'].forEach(id => {
        const display = document.getElementById(`${id}-timer`);
        if (display) {
            const timer = timers[id];
            const hrs = Math.floor(timer.seconds / 3600);
            const mins = Math.floor((timer.seconds % 3600) / 60);
            const secs = timer.seconds % 60;
            display.textContent = `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

            const btn = document.getElementById(`${id}-start`);
            if (btn) btn.textContent = timer.interval ? "Pause" : "Start";
        }
    });

    const pushupDisplay = document.getElementById('pushup-timer');
    if (pushupDisplay) {
        const mins = Math.floor(timers.pushup.seconds / 60);
        const secs = timers.pushup.seconds % 60;
        pushupDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        const toggleBtn = document.getElementById('pushup-toggle');
        if (toggleBtn) toggleBtn.textContent = timers.pushup.active ? "Disable" : "Enable";
    }

    renderHistory();
}

function renderHistory() {
    const tbody = document.querySelector('#history-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Sort dates descending
    const sortedDates = Object.keys(data.dailyLogs).sort((a, b) => b.localeCompare(a)).slice(0, 10);

    sortedDates.forEach(date => {
        const log = data.dailyLogs[date];
        Object.entries(log).forEach(([name, value]) => {
            if (value === 0) return;
            const tr = document.createElement('tr');
            let displayValue = value;
            if (name !== 'pushups') {
                const hrs = Math.floor(value / 3600);
                const mins = Math.floor((value % 3600) / 60);
                displayValue = `${hrs}h ${mins}m`;
            } else {
                displayValue = `${value} reps`;
            }

            tr.innerHTML = `<td>${date}</td><td>${name}</td><td>${displayValue}</td>`;
            tbody.appendChild(tr);
        });
    });
}

// --- Sync & Logging ---

function getTodayKey() {
    return new Date().toISOString().split('T')[0];
}

async function saveData() {
    if (!ghConfig.repo || !ghConfig.token) {
        console.warn("GitHub config missing. Repo:", ghConfig.repo, "Token set:", !!ghConfig.token);
        return;
    }

    try {
        const content = btoa(JSON.stringify(data, null, 2));
        const body = {
            message: `Sync stats: ${new Date().toISOString()}`,
            content: content
        };

        // Only include SHA if we are updating an existing file
        if (dataSha) body.sha = dataSha;

        console.log("Saving to GitHub...", { repo: ghConfig.repo, file: ghConfig.dataFile, hasSha: !!dataSha });

        const res = await fetchGH(`/contents/${ghConfig.dataFile}`, {
            method: 'PUT',
            body: JSON.stringify(body)
        });

        const resData = await res.json();

        if (res.ok) {
            dataSha = resData.content.sha;
            console.log("GitHub Save Success! New SHA:", dataSha);
        } else {
            console.error("GitHub Save Error:", resData);
            let msg = resData.message || "Unknown Error";
            if (res.status === 404) {
                msg = "Repository Not Found. Check your 'username/repo' in Settings.";
            } else if (res.status === 401 || res.status === 403) {
                msg = "Permission Denied. Check your GitHub Token (needs 'repo' scope).";
            }
            alert(`Sync Failed: ${msg}`);
        }
    } catch (e) {
        console.error("Failed to save data to GitHub", e);
    }
}

function logToDaily(name, value) {
    const today = getTodayKey();
    if (!data.dailyLogs[today]) {
        data.dailyLogs[today] = {};
    }
    if (!data.dailyLogs[today][name]) data.dailyLogs[today][name] = 0;
    data.dailyLogs[today][name] += value;

    renderHeatmap();
    renderCharts();
    renderHistory();
}

// --- Visuals ---

function renderHeatmap() {
    console.log("Rendering Heatmap...");
    try {
        const heatmap = document.getElementById('heatmap');
        const monthsContainer = document.getElementById('heatmap-months');
        if (!heatmap || !monthsContainer) return;

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

            const log = data.dailyLogs[key] || {};
            const isInYear = y === selectedYear;

            // Sum all activities for the day
            const totalSeconds = Object.values(log).reduce((acc, val) => acc + (typeof val === 'number' ? val : 0), 0);
            const totalActivity = (totalSeconds / 3600) + ((log.pushups || 0) / 50);

            let level = 0;
            if (isInYear && d.getMonth() !== currentMonth) {
                currentMonth = d.getMonth();
                const monthEl = document.createElement('span');
                monthEl.textContent = monthNames[currentMonth];
                monthEl.style.gridColumnStart = Math.floor(i / 7) + 1;
                monthsContainer.appendChild(monthEl);
            }

            if (totalActivity > 0) level = 1;
            if (totalActivity > 0.5) level = 2;
            if (totalActivity > 2) level = 3;
            if (totalActivity > 5) level = 4;

            const dayEl = document.createElement('div');
            dayEl.className = `heatmap-day level-${level}`;

            if (!isInYear) {
                dayEl.style.visibility = 'hidden';
            } else {
                dayEl.title = `${key}: ${totalActivity.toFixed(1)} activity units`;
                const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                if (key === todayStr) {
                    dayEl.style.boxShadow = '0 0 6px var(--accent)';
                    dayEl.style.zIndex = '1';
                    dayEl.style.border = '1px solid var(--accent)';
                }
            }
            heatmap.appendChild(dayEl);
        }
        console.log("Heatmap rendered.");
    } catch (e) {
        console.error("Heatmap Render Error:", e);
    }
}

function renderCharts() {
    console.log("Rendering Charts...");
    try {
        const canvas = document.getElementById('trendsChart');
        if (!canvas) {
            console.warn("Trends chart canvas missing.");
            return;
        }
        const ctx = canvas.getContext('2d');
        const last7Days = [...Array(7)].map((_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (6 - i));
            return d.toISOString().split('T')[0];
        });

        const name1 = data.timerNames.t1;
        const name2 = data.timerNames.t2;

        const dataset1 = last7Days.map(day => (data.dailyLogs[day]?.[name1] || 0) / 3600);
        const dataset2 = last7Days.map(day => (data.dailyLogs[day]?.[name2] || 0) / 3600);

        if (trendsChart) trendsChart.destroy();

        trendsChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: last7Days.map(d => d.split('-').slice(1).join('/')),
                datasets: [
                    {
                        label: `${name1} (h)`,
                        data: dataset1,
                        borderColor: '#0071e3',
                        backgroundColor: 'rgba(0, 113, 227, 0.1)',
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: `${name2} (h)`,
                        data: dataset2,
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
        console.log("Charts rendered.");
    } catch (e) {
        console.error("Charts Render Error:", e);
    }
}

// --- Timer Logic ---

function toggleTimer(key) {
    const timer = timers[key];
    const display = document.getElementById(`${key}-timer`);
    const btn = document.getElementById(`${key}-start`);
    const name = data.timerNames[key];

    if (timer.interval) {
        // STOP TIMER
        clearInterval(timer.interval);
        timer.interval = null;
        btn.textContent = "Start";

        // Final calculation
        const sessionSeconds = Math.floor((Date.now() - timer.startTime) / 1000);
        const totalSession = timer.seconds + sessionSeconds;

        if (!data.stats[name]) data.stats[name] = 0;
        data.stats[name] += totalSession;
        logToDaily(name, totalSession);

        timer.seconds = 0;
        timer.startTime = null;
        display.textContent = "00:00:00";
        updateUI();
        saveData();
        saveTimerState();
    } else {
        // START TIMER
        btn.textContent = "Pause";
        timer.startTime = Date.now();
        timer.interval = setInterval(() => {
            const currentSession = Math.floor((Date.now() - timer.startTime) / 1000);
            const total = timer.seconds + currentSession;
            const hrs = Math.floor(total / 3600);
            const mins = Math.floor((total % 3600) / 60);
            const secs = total % 60;
            display.textContent = `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            saveTimerState();
        }, 1000);
    }
}

function startPushupLoop() {
    if (timers.pushup.interval) clearInterval(timers.pushup.interval);
    const display = document.getElementById('pushup-timer');

    // We store the 'target' time for a countdown
    if (!timers.pushup.startTime) {
        timers.pushup.startTime = Date.now();
    }

    timers.pushup.interval = setInterval(() => {
        if (!timers.pushup.active) return;

        const elapsed = Math.floor((Date.now() - timers.pushup.startTime) / 1000);
        const remaining = timers.pushup.seconds - elapsed;

        if (remaining <= 0) {
            triggerReminder();
            timers.pushup.startTime = Date.now();
            timers.pushup.seconds = data.settings.pushupReminderMinutes * 60;
        } else {
            const mins = Math.floor(remaining / 60);
            const secs = remaining % 60;
            display.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        saveTimerState();
    }, 1000);
}

function saveTimerState() {
    const state = {
        timers: {
            t1: { seconds: timers.t1.seconds, startTime: timers.t1.startTime, active: !!timers.t1.interval },
            t2: { seconds: timers.t2.seconds, startTime: timers.t2.startTime, active: !!timers.t2.interval },
            t3: { seconds: timers.t3.seconds, startTime: timers.t3.startTime, active: !!timers.t3.interval },
            pushup: { seconds: timers.pushup.seconds, startTime: timers.pushup.startTime, active: timers.pushup.active }
        },
        timestamp: Date.now()
    };
    localStorage.setItem('timer-state', JSON.stringify(state));
}

function loadTimerState() {
    const saved = localStorage.getItem('timer-state');
    if (!saved) return;
    try {
        const { timers: savedTimers } = JSON.parse(saved);

        Object.keys(savedTimers).forEach(key => {
            const savedTimer = savedTimers[key];
            if (key === 'pushup') {
                timers.pushup.seconds = savedTimer.seconds;
                timers.pushup.active = savedTimer.active;
                timers.pushup.startTime = savedTimer.startTime;
                // If it was active, startPushupLoop will pick up from current startTime
            } else {
                timers[key].seconds = savedTimer.seconds;
                timers[key].startTime = savedTimer.startTime;
                // If it was active, restart it
                if (savedTimer.active && timers[key].startTime) {
                    toggleTimer(key);
                }
            }
        });
    } catch (e) {
        console.error("Failed to load timer state", e);
    }
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
    ['t1', 't2', 't3'].forEach(id => {
        const startBtn = document.getElementById(`${id}-start`);
        if (startBtn) startBtn.onclick = () => toggleTimer(id);

        const titleEl = document.querySelector(`.timer-title[data-id="${id}"]`);
        if (titleEl) {
            titleEl.onblur = () => {
                const newName = titleEl.textContent.trim() || data.timerNames[id];
                data.timerNames[id] = newName;
                titleEl.textContent = newName;
                updateUI();
                saveData();
            };
            titleEl.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    titleEl.blur();
                }
            };
        }
    });

    const addRep = document.getElementById('add-rep');
    if (addRep) {
        addRep.onclick = () => {
            const reps = 10;
            data.stats.pushups += reps;
            logToDaily('pushups', reps);
            updateUI();
            saveData();
        };
    }

    const pushupToggle = document.getElementById('pushup-toggle');
    if (pushupToggle) {
        pushupToggle.onclick = (e) => {
            timers.pushup.active = !timers.pushup.active;
            e.target.textContent = timers.pushup.active ? "Disable" : "Enable";
        };
    }

    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.onclick = () => {
            document.body.classList.toggle('dark');
            renderCharts();
        };
    }

    const yearContainer = document.getElementById('heatmap-years');
    if (yearContainer) {
        yearContainer.onclick = (e) => {
            if (e.target.classList.contains('year-btn')) {
                yearContainer.querySelectorAll('.year-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
            }
        };
    }

    const syncBtn = document.getElementById('sync-btn');
    if (syncBtn) {
        syncBtn.onclick = async () => {
            syncBtn.classList.add('loading');
            syncBtn.disabled = true;
            try {
                const justPushUrl = 'https://raw.githubusercontent.com/Armaan-zsh/justpush/main/pushups.json';
                const resp = await fetch(justPushUrl);
                const justPushData = await resp.json();

                let mergedCount = 0;
                for (const [date, count] of Object.entries(justPushData)) {
                    if (!data.dailyLogs[date]) {
                        data.dailyLogs[date] = {};
                    }
                    if (data.dailyLogs[date].pushups !== count) {
                        data.dailyLogs[date].pushups = count;
                        mergedCount++;
                    }
                }

                data.stats.pushups = Object.values(data.dailyLogs).reduce((sum, log) => sum + (log.pushups || 0), 0);

                updateUI();
                renderHeatmap();
                renderCharts();
                await saveData();
                alert(`Sync Complete! Merged ${mergedCount} pushup updates.`);
            } catch (err) {
                console.error(err);
                alert('GitHub sync error.');
            } finally {
                syncBtn.classList.remove('loading');
                syncBtn.disabled = false;
            }
        };
    }

    const modal = document.getElementById('settings-modal');
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn && modal) {
        settingsBtn.onclick = () => {
            document.getElementById('gh-repo').value = ghConfig.repo;
            document.getElementById('gh-token').value = ghConfig.token;
            modal.classList.add('active');
        };
    }

    const closeSettings = document.getElementById('close-settings');
    if (closeSettings && modal) {
        closeSettings.onclick = () => {
            modal.classList.remove('active');
        };
    }

    const saveSettings = document.getElementById('save-settings');
    if (saveSettings && modal) {
        saveSettings.onclick = () => {
            const repo = document.getElementById('gh-repo').value.trim();
            const token = document.getElementById('gh-token').value.trim();

            if (repo && token) {
                localStorage.setItem('gh-repo', repo);
                localStorage.setItem('gh-token', token);
                ghConfig.repo = repo;
                ghConfig.token = token;
                modal.classList.remove('active');
                init();
            } else {
                alert('Please enter both Repository and Token.');
            }
        };
    }
}

init();
