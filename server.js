import { join } from "path";
import { spawn } from "child_process";

const DATA_FILE = join(import.meta.dir, "timer-data.json");

const server = Bun.serve({
    port: 3000,
    async fetch(req) {
        const url = new URL(req.url);

        // API Endpoint: Get Data
        if (url.pathname === "/api/data" && req.method === "GET") {
            const file = Bun.file(DATA_FILE);
            if (await file.exists()) {
                return new Response(file, {
                    headers: { "Content-Type": "application/json" },
                });
            }
            return new Response(JSON.stringify({}), { status: 404 });
        }

        // API Endpoint: Save Data
        if (url.pathname === "/api/data" && req.method === "POST") {
            try {
                const newData = await req.json();
                await Bun.write(DATA_FILE, JSON.stringify(newData, null, 2));

                // Auto-Git-Push Logic
                if (newData.settings?.gitAutoPush) {
                    spawn("git", ["add", DATA_FILE]);
                    spawn("git", ["commit", "-m", `Sync stats: ${new Date().toISOString()}`]);
                    spawn("git", ["push", "origin", "main"]);
                    console.log("Git sync triggered");
                }

                return new Response(JSON.stringify({ success: true }));
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), { status: 500 });
            }
        }
        // API Endpoint: Sync JustPush
        if (url.pathname === "/api/sync-justpush" && req.method === "POST") {
            try {
                const justPushUrl = 'https://raw.githubusercontent.com/Armaan-zsh/justpush/main/pushups.json';
                const response = await fetch(justPushUrl);
                if (!response.ok) throw new Error('Failed to fetch from GitHub');

                const justPushData = await response.json();
                const file = Bun.file(DATA_FILE);
                const localData = await file.json();

                if (!localData.dailyLogs) localData.dailyLogs = {};

                let mergedCount = 0;
                for (const [date, count] of Object.entries(justPushData)) {
                    if (!localData.dailyLogs[date]) {
                        localData.dailyLogs[date] = { math: 0, reading: 0, pushups: 0 };
                    }
                    if (localData.dailyLogs[date].pushups !== count) {
                        localData.dailyLogs[date].pushups = count;
                        mergedCount++;
                    }
                }

                localData.stats.pushups = Object.values(localData.dailyLogs).reduce((sum, log) => sum + (log.pushups || 0), 0);

                await Bun.write(DATA_FILE, JSON.stringify(localData, null, 2));
                return new Response(JSON.stringify({ success: true, merged: mergedCount, total: localData.stats.pushups }));
            } catch (err) {
                return new Response(JSON.stringify({ error: err.message }), { status: 500 });
            }
        }

        // Serve Static Files from /app
        let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
        const file = Bun.file(join(import.meta.dir, "app", filePath));

        if (await file.exists()) {
            return new Response(file);
        }

        return new Response("Not Found", { status: 404 });
    },
});

console.log(`Server running at http://localhost:${server.port}`);
