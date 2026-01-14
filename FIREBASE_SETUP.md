# Firebase Setup Instructions (One-Time, 5 Minutes)

## Step 1: Create Firebase Project

1. Go to https://console.firebase.google.com/
2. Click **"Add project"** or **"Create a project"**
3. Enter project name: `sql-generator-shared` (or any name you prefer)
4. **Disable Google Analytics** (optional, you can skip it)
5. Click **"Create project"**
6. Wait for project creation, then click **"Continue"**

## Step 2: Create Realtime Database

1. In Firebase Console, click **"Realtime Database"** in the left menu
2. Click **"Create Database"**
3. Choose a location (pick the one closest to you)
4. Start in **"Test mode"** (we'll secure it in the next step)
5. Click **"Enable"**

## Step 3: Set Database Security Rules

1. In Realtime Database, click the **"Rules"** tab
2. Replace the rules with this:

```json
{
  "rules": {
    "sharedConfigs": {
      ".read": true,
      ".write": true
    }
  }
}
```

3. Click **"Publish"**

> **Note:** These rules allow anyone to read/write. For production, you might want to add authentication, but for team sharing this works fine.

## Step 4: Get Your Firebase Configuration

1. Click the **gear icon ⚙️** next to "Project Overview"
2. Click **"Project settings"**
3. Scroll down to **"Your apps"** section
4. Click the **`</>` (web)** icon to add a web app
5. Register app name: `SQL Generator` (or any name)
6. **Don't check** "Also set up Firebase Hosting" (we're using GitHub Pages)
7. Click **"Register app"**
8. **Copy the `firebaseConfig` object** - it looks like this:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.firebaseio.com/",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

## Step 5: Update app.js

1. Open `app.js` in your project
2. Find the `firebaseConfig` object (around line 7)
3. **Replace** all the placeholder values with your actual Firebase config from Step 4
4. Save the file

## Step 6: Test It!

1. Refresh your website
2. Create a configuration
3. Click the **"Share"** button
4. It should work! ✅

## That's It!

Now anyone can:
- Click "Share" to share configurations
- See shared configurations automatically
- No tokens needed!
- No setup needed for users!

## Troubleshooting

**"Firebase is not configured yet" error:**
- Make sure you updated `firebaseConfig` in `app.js` with your real values
- Check that the database URL is correct
- Make sure you created the Realtime Database (not Firestore)

**Can't see shared configs:**
- Check browser console for errors
- Verify database rules are published
- Make sure database is in the correct region

**Sharing doesn't work:**
- Check that database rules allow write access
- Verify Firebase SDK is loaded (check browser console)
- Make sure `firebaseConfig` values are correct

## Free Tier Limits

- **Storage:** 1 GB
- **Bandwidth:** 10 GB/month
- **Connections:** 100 simultaneous
- **Perfect for team sharing!** 🎉
