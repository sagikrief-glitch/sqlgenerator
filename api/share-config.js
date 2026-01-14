// Vercel serverless function to save shared configs to GitHub
// This runs server-side, so the GitHub token is secure

export default async function handler(req, res) {
    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const { configs } = req.body;
        
        if (!configs || !Array.isArray(configs)) {
            return res.status(400).json({ error: 'Invalid configs data' });
        }
        
        // Your GitHub token (set as environment variable in Vercel)
        const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
        if (!GITHUB_TOKEN) {
            return res.status(500).json({ error: 'GitHub token not configured on server' });
        }
        
        // Get current file SHA
        const apiUrl = 'https://api.github.com/repos/sagikrief-glitch/sqlgenerator/contents/shared-configs.json';
        const fileResponse = await fetch(apiUrl, {
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        let sha = null;
        if (fileResponse.ok) {
            const fileData = await fileResponse.json();
            sha = fileData.sha;
        } else if (fileResponse.status !== 404) {
            const error = await fileResponse.json();
            return res.status(fileResponse.status).json({ error: error.message || 'Failed to access GitHub' });
        }
        
        // Update file
        const commitResponse = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify({
                message: `Update shared configurations - ${new Date().toISOString()}`,
                content: Buffer.from(JSON.stringify(configs, null, 2)).toString('base64'),
                sha: sha
            })
        });
        
        if (commitResponse.ok) {
            return res.status(200).json({ success: true, message: 'Configuration shared successfully' });
        } else {
            const error = await commitResponse.json();
            return res.status(commitResponse.status).json({ error: error.message || 'Failed to save to GitHub' });
        }
    } catch (error) {
        console.error('Error in share-config:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
