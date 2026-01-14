// Netlify serverless function to save shared configs to GitHub
// This runs server-side, so the GitHub token is secure

exports.handler = async (event, context) => {
    // Only allow POST
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }
    
    try {
        const { configs } = JSON.parse(event.body);
        
        // Your GitHub token (set as environment variable in Netlify)
        const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
        if (!GITHUB_TOKEN) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'GitHub token not configured' })
            };
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
                message: `Update shared configurations`,
                content: Buffer.from(JSON.stringify(configs, null, 2)).toString('base64'),
                sha: sha
            })
        });
        
        if (commitResponse.ok) {
            return {
                statusCode: 200,
                body: JSON.stringify({ success: true })
            };
        } else {
            const error = await commitResponse.json();
            return {
                statusCode: commitResponse.status,
                body: JSON.stringify({ error: error.message || 'Failed to save' })
            };
        }
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
