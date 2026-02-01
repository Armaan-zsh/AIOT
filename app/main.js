let data = {
    stats: { math: 0, reading: 0, pushups: 10535, squats: 0 },
    settings: { pushupReminderMinutes: 25 }
};

const timers = {
    math: { seconds: 0, interval: null, startTime: null },
    reading: { seconds: 0, interval: null, startTime: null },
    pushup: { seconds: 25 * 60, interval: null, active: true }
};

// --- Initialization ---

async function init() {
    try {
        const res = await fetch('/api/data');
        if (res.ok) {
            data = await res.json();
            updateUI();
        }
    } catch (e) {
        console.error("Failed to load data", e);
    }

    setupEventListeners();
    startPushupLoop();

    // Request notification permission
    if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission();
    }
}

function updateUI() {
    document.getElementById('pushup-count').textContent = data.stats.pushups.toLocaleString();
    document.getElementById('math-total').textContent = `${(data.stats.math / 3600).toFixed(1)}h`;
    document.getElementById('reading-total').textContent = `${(data.stats.reading / 3600).toFixed(1)}h`;
}

// --- Sync ---

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

// --- Timer Logic ---

function formatTime(totalSeconds) {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatPushupTime(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function toggleTimer(key) {
    const timer = timers[key];
    const display = document.getElementById(`${key}-timer`);
    const btn = document.getElementById(`${key}-start`);

    if (timer.interval) {
        // Pause
        clearInterval(timer.interval);
        timer.interval = null;
        btn.textContent = "Start";
        data.stats[key] += timer.seconds;
        timer.seconds = 0;
        display.textContent = "00:00:00";
        updateUI();
        saveData();
    } else {
        // Start
        btn.textContent = "Pause";
        timer.startTime = Date.now();
        timer.interval = setInterval(() => {
            timer.seconds++;
            display.textContent = formatTime(timer.seconds);
        }, 1000);
    }
}

// --- Pushup Loop ---

function startPushupLoop() {
    const display = document.getElementById('pushup-timer');
    timers.pushup.interval = setInterval(() => {
        if (!timers.pushup.active) return;

        timers.pushup.seconds--;
        display.textContent = formatPushupTime(timers.pushup.seconds);

        if (timers.pushup.seconds <= 0) {
            triggerReminder();
            timers.pushup.seconds = data.settings.pushupReminderMinutes * 60;
        }
    }, 1000);
}

function triggerReminder() {
    // Browser Notification
    if (Notification.permission === "granted") {
        new Notification("Time for Pushups!", {
            body: "Stretch your legs and hit a set of pushups. Keep the streak alive!",
            icon: "/favicon.ico"
        });
    }
    // Visual Alert
    document.getElementById('pushup-card').style.borderColor = "#ff3b30";
    setTimeout(() => {
        document.getElementById('pushup-card').style.borderColor = "transparent";
    }, 5000);
}

// --- Event Listeners ---

function setupEventListeners() {
    document.getElementById('math-start').onclick = () => toggleTimer('math');
    document.getElementById('math-pause').onclick = () => toggleTimer('math');

    document.getElementById('reading-start').onclick = () => toggleTimer('reading');
    document.getElementById('reading-pause').onclick = () => toggleTimer('reading');

    document.getElementById('add-rep').onclick = () => {
        data.stats.pushups += 10; // Log 10 per click for efficiency
        updateUI();
        saveData();
    };

    document.getElementById('pushup-toggle').onclick = (e) => {
        timers.pushup.active = !timers.pushup.active;
        e.target.textContent = timers.pushup.active ? "Disable" : "Enable";
    };

    document.getElementById('theme-toggle').onclick = () => {
        document.body.classList.toggle('dark');
    };
}

init();
