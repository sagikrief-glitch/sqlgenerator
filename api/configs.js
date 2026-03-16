// Vercel serverless: GET list, POST add one, DELETE by id (query: ?id=xxx). Uses GitHub shared-configs.json.

const GITHUB_API_URL = 'https://api.github.com/repos/sagikrief-glitch/sqlgenerator/contents/shared-configs.json';

function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
}

export default async function handler(req, res) {
    cors(res);
    // CORS preflight: return 200 so edge doesn't strip headers
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        res.status(500).json({ error: 'GITHUB_TOKEN not configured' });
        return;
    }

    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json'
    };

    async function getConfigs() {
        const resp = await fetch(GITHUB_API_URL, { headers });
        if (resp.status === 404) return { configs: [], sha: null };
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.message || `GitHub ${resp.status}`);
        }
        const data = await resp.json();
        const content = data.content ? Buffer.from(data.content, 'base64').toString('utf8') : '[]';
        let configs = [];
        try {
            configs = JSON.parse(content);
        } catch (_) {}
        if (!Array.isArray(configs)) configs = [];
        return { configs, sha: data.sha };
    }

    async function putConfigs(configs, sha) {
        const resp = await fetch(GITHUB_API_URL, {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: `Update shared configurations - ${new Date().toISOString()}`,
                content: Buffer.from(JSON.stringify(configs, null, 2)).toString('base64'),
                sha: sha || undefined
            })
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.message || `GitHub PUT ${resp.status}`);
        }
    }

    try {
        if (req.method === 'GET') {
            const { configs } = await getConfigs();
            res.status(200).json(configs);
            return;
        }

        if (req.method === 'POST') {
            const config = typeof req.body === 'object' && req.body !== null ? req.body : {};
            if (!config.id) config.id = 'config_' + Date.now();
            const { configs, sha } = await getConfigs();
            configs.unshift(config);
            await putConfigs(configs, sha);
            res.status(201).json({ success: true });
            return;
        }

        if (req.method === 'DELETE') {
            const id = req.query && req.query.id;
            if (!id) {
                res.status(400).json({ error: 'Missing id' });
                return;
            }
            const { configs, sha } = await getConfigs();
            const next = configs.filter(c => c.id !== decodeURIComponent(id));
            await putConfigs(next, sha);
            res.status(200).json({ success: true });
            return;
        }

        res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('api/configs error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
