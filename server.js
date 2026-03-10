/**
 * Simple config API server.
 * Run: node server.js
 * Then set CONFIG_API_BASE in app.js to http://localhost:3000/api (or use as-is).
 * Stores configs in shared-configs.json in the same folder.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const CONFIGS_FILE = path.join(__dirname, 'shared-configs.json');

function readConfigs() {
    try {
        const data = fs.readFileSync(CONFIGS_FILE, 'utf8');
        const arr = JSON.parse(data);
        return Array.isArray(arr) ? arr : [];
    } catch (e) {
        if (e.code === 'ENOENT') return [];
        throw e;
    }
}

function writeConfigs(arr) {
    fs.writeFileSync(CONFIGS_FILE, JSON.stringify(arr, null, 2), 'utf8');
}

function send(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(body));
}

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); }
        });
        req.on('error', reject);
    });
}

const server = http.createServer(async (req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
    }

    const url = req.url || '';
    const [pathPart, queryPart] = url.split('?');
    const pathMatch = pathPart.match(/^\/api\/configs\/?(.*)$/);
    const pathId = pathMatch ? (pathMatch[1] || '').replace(/^\/+/, '') : null;
    const queryId = queryPart ? new URLSearchParams(queryPart).get('id') : null;
    const id = pathId || queryId;

    if (!pathMatch) {
        send(res, 404, { error: 'Not found' });
        return;
    }

    try {
        if (req.method === 'GET' && !id) {
            const configs = readConfigs();
            send(res, 200, configs);
            return;
        }

        if (req.method === 'POST' && !id) {
            const config = await parseBody(req);
            if (!config.id) config.id = 'config_' + Date.now();
            const configs = readConfigs();
            configs.unshift(config);
            writeConfigs(configs);
            send(res, 201, { success: true });
            return;
        }

        if (req.method === 'DELETE' && id) {
            const configs = readConfigs().filter(c => c.id !== decodeURIComponent(id));
            writeConfigs(configs);
            send(res, 200, { success: true });
            return;
        }

        send(res, 405, { error: 'Method not allowed' });
    } catch (e) {
        console.error(e);
        send(res, 500, { error: e.message || 'Internal server error' });
    }
});

server.listen(PORT, () => {
    console.log('Config API running at http://localhost:' + PORT + '/api');
});
