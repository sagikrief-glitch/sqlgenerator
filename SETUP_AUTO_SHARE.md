# Setup Automatic Sharing (One-Time, 5 Minutes)

## Quick Setup - Choose One:

### Option 1: Vercel (Easiest - Recommended)

1. **Install Vercel CLI:**
   ```bash
   npm i -g vercel
   ```

2. **Deploy:**
   ```bash
   vercel
   ```
   - Follow prompts (login, link project)
   - It will auto-detect your project

3. **Add GitHub Token:**
   - Go to: https://vercel.com/dashboard
   - Select your project
   - Go to Settings → Environment Variables
   - Add: `GITHUB_TOKEN` = your GitHub personal access token
   - Redeploy

4. **Done!** Now sharing works automatically!

### Option 2: Netlify

1. **Deploy:**
   - Go to: https://app.netlify.com
   - Click "Add new site" → "Import an existing project"
   - Connect GitHub repo
   - Deploy

2. **Add GitHub Token:**
   - Site settings → Environment variables
   - Add: `GITHUB_TOKEN` = your GitHub token
   - Redeploy

3. **Done!**

## Get GitHub Token:

1. Go to: https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Check "repo" permission
4. Copy token
5. Add to Vercel/Netlify environment variables

## That's It!

After setup, users just click "Share" - no tokens needed! The token stays on the server.
