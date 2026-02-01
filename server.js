import { join } from "path";

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
                return new Response(JSON.stringify({ success: true }));
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), { status: 500 });
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
