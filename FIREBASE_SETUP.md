# Firebase Setup Instructions (One-Time)

## Step 1: Create Firebase Project
1. Go to https://console.firebase.google.com/
2. Click "Add project" or "Create a project"
3. Name it: `sql-generator-shared` (or any name)
4. Disable Google Analytics (optional)
5. Click "Create project"

## Step 2: Create Realtime Database
1. In Firebase Console, click "Realtime Database" in left menu
2. Click "Create Database"
3. Choose location (closest to you)
4. Start in "Test mode" (for now - we'll secure it later)
5. Click "Enable"

## Step 3: Get Your Config
1. Click the gear icon ⚙️ next to "Project Overview"
2. Click "Project settings"
3. Scroll down to "Your apps"
4. Click the `</>` (web) icon
5. Register app name: `SQL Generator`
6. Copy the `firebaseConfig` object

## Step 4: Update app.js
Replace the `firebaseConfig` in `app.js` (around line 7) with your actual config from Step 3.

## Step 5: Set Database Rules (Important!)
1. Go to Realtime Database → Rules
2. Set rules to:
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
3. Click "Publish"

That's it! Now sharing works without any tokens!
