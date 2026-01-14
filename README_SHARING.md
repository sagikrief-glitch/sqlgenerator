# How to Enable Token-Free Sharing

## Option 1: Use Netlify Function (Recommended - No Tokens!)

1. **Deploy to Netlify:**
   - Push your code to GitHub
   - Go to https://app.netlify.com
   - Click "New site from Git"
   - Connect your GitHub repo
   - Deploy

2. **Set GitHub Token (One-time, server-side only):**
   - In Netlify dashboard, go to Site settings → Environment variables
   - Add: `GITHUB_TOKEN` = your GitHub personal access token
   - The token stays on the server, users never see it!

3. **Update the URL in app.js:**
   - Find line with `const netlifyUrl = 'https://your-site.netlify.app/.netlify/functions/share-config';`
   - Replace with your actual Netlify URL

4. **That's it!** Now sharing works with one click, no tokens needed!

## Option 2: Manual Sharing (Current Fallback)

If Netlify function isn't set up, clicking "Share" will download a JSON file that you can manually commit to GitHub.

## Option 3: Use Firebase (Alternative)

See `FIREBASE_SETUP.md` for Firebase setup instructions.
