# Production Build Guide for Commons iOS App

This guide walks you through the complete process of building Commons for production and creating the final archive for App Store submission.

---

## Prerequisites

Before you begin, ensure you have:

- [x] Xcode 15.x or later installed
- [x] macOS Ventura (13.0) or later
- [x] Node.js 18.x or later
- [x] Valid Apple Developer account and team access
- [x] Production backend API deployed and accessible

---

## Part 1: Environment Configuration

### Step 1.1: Configure Production API URL

The iOS app needs to know your production API URL at build time.

**Create production environment file:**

```bash
cd client
```

Create `.env.production`:

```bash
# Production API Configuration
VITE_API_URL=https://your-production-api.com

# Optional: App Store URL (set after app is live)
VITE_APP_STORE_URL=

# Any other production environment variables
# VITE_SENTRY_DSN=your-sentry-dsn
# VITE_ANALYTICS_ID=your-analytics-id
```

**⚠️ Critical:** Replace `https://your-production-api.com` with your actual production backend URL.

**Verify the API URL:**

```bash
# Test that your production API is accessible
curl https://your-production-api.com/api/health

# Expected response: 200 OK with health status
```

### Step 1.2: Verify Backend Environment Variables

Ensure your production backend has all required environment variables:

```bash
# Required for production
NODE_ENV=production

# Authentication
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_VERIFY_SERVICE_SID=your_verify_sid

# Optional: Test login bypass for App Review
ALLOW_TEST_LOGIN=1  # Set to 1 if using +19999999999 test account
SEED_DEMO_ACCOUNTS=0  # Set to 0 for production

# Database
MONGODB_URI=mongodb+srv://your-production-mongo

# Push Notifications
APNS_KEY_ID=your_apns_key_id
APNS_TEAM_ID=your_team_id
APNS_BUNDLE_ID=com.oncommons.mvp
APNS_KEY_PATH=./path/to/apns/key.p8

# Storage
GCS_BUCKET=your-production-bucket
GOOGLE_APPLICATION_CREDENTIALS=./path/to/gcs-key.json

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

**Verify critical services:**

```bash
# Test Twilio (send verification)
# Test APNs (send push notification to test device)
# Test GCS (upload a test image)
# Test MongoDB (query health check)
```

---

## Part 2: Install Dependencies

### Step 2.1: Install Client Dependencies

```bash
cd client
npm install
```

### Step 2.2: Install iOS Dependencies

```bash
cd ios/App
pod install
```

**Or use Capacitor to sync:**

```bash
cd client
npx cap sync ios
```

**Expected output:**
```
✔ Copying web assets from dist to ios/App/App/public in 2.34s
✔ Creating capacitor.config.json in ios/App/App in 1.23ms
✔ copy ios in 2.35s
✔ Updating iOS plugins in 3.45s
✔ Updating iOS native dependencies with pod install in 12.34s
✔ update ios in 15.89s
```

**Verify Pods installed:**

```bash
ls client/ios/App/Pods/

# Expected output:
# CapacitorApp  CapacitorCamera  CapacitorClipboard  
# CapacitorGeolocation  CapacitorPreferences  CapacitorPushNotifications
```

---

## Part 3: Build Client for Production

### Step 3.1: Clean Previous Builds

```bash
cd client
rm -rf dist node_modules/.vite
```

### Step 3.2: Build Production Bundle

```bash
npm run build
```

**This command:**
1. Reads `.env.production` for environment variables
2. Compiles TypeScript to JavaScript
3. Bundles React components with Vite
4. Minifies and optimizes assets
5. Outputs to `client/dist/`

**Expected output:**

```
vite v5.x.x building for production...
✓ 1234 modules transformed.
dist/index.html                   0.45 kB
dist/assets/index-abc123.css      45.67 kB │ gzip: 12.34 kB
dist/assets/index-xyz789.js      234.56 kB │ gzip: 78.90 kB
✓ built in 12.34s
```

**Verify build:**

```bash
ls client/dist/

# Expected output:
# index.html  assets/  favicon.ico  ...
```

**Verify API URL is embedded:**

```bash
grep -r "your-production-api.com" client/dist/assets/

# Should find your production API URL in the bundled JavaScript
```

### Step 3.3: Copy Web Assets to iOS

```bash
npx cap copy ios
```

**This command:**
1. Copies `client/dist/` to `client/ios/App/App/public/`
2. Updates Capacitor configuration
3. Ensures iOS app has the latest web bundle

**Verify copy:**

```bash
ls client/ios/App/App/public/

# Expected output:
# index.html  assets/  ...
```

---

## Part 4: Configure Xcode Project

### Step 4.1: Open Workspace

**⚠️ Important:** Always open the workspace, not the project file.

```bash
open client/ios/App/App.xcworkspace
```

### Step 4.2: Update Version and Build Number

1. **Select the "App" target** in Xcode navigator
2. **Go to General tab**
3. **Update Identity section:**
   - **Display Name:** Commons
   - **Bundle Identifier:** com.oncommons.mvp
   - **Version:** 1.0 (or your version)
   - **Build:** Increment from last submission (e.g., 14, 15, 16...)

**Why increment build number?**
- Each archive uploaded to App Store Connect must have a unique build number
- Marketing version (1.0) can stay the same across build number increments

### Step 4.3: Verify Signing

1. **Go to Signing & Capabilities tab**
2. **Verify settings:**
   - **Automatically manage signing:** ✅ Checked
   - **Team:** WU33P9WH4C (your team)
   - **Provisioning Profile:** Xcode Managed Profile
   - **Signing Certificate:** Apple Distribution

**If signing errors occur:**
- Xcode → Preferences → Accounts → Download Manual Profiles
- Try toggling "Automatically manage signing" off and back on
- Verify your Apple ID has proper access to the team

### Step 4.4: Verify Capabilities

Ensure these capabilities are enabled:

- [x] **Push Notifications** (required for APNs)

**How to add capabilities:**
1. Click "+ Capability" button
2. Search for "Push Notifications"
3. Double-click to add

**Verify entitlements file:**

```bash
cat client/ios/App/App/App.entitlements
```

Expected:
```xml
<key>aps-environment</key>
<string>production</string>
```

### Step 4.5: Verify Deployment Target

1. **General tab → Deployment Info**
2. **iOS Deployment Target:** 14.0 (or 15.0+)

**Why this matters:**
- Lower target = more devices supported
- Higher target = can use newer iOS APIs

---

## Part 5: Pre-Archive Validation

### Step 5.1: Clean Build Folder

```
Xcode → Product → Clean Build Folder
(or press Cmd+Shift+K)
```

### Step 5.2: Select Scheme and Destination

1. **Scheme:** Ensure "App" is selected (top left in Xcode toolbar)
2. **Destination:** Select "Any iOS Device (arm64)"

**⚠️ Important:** Do NOT select "Simulator" - archives can only be created for real devices.

### Step 5.3: Test Build Locally

Before archiving, do a test build:

```
Xcode → Product → Build
(or press Cmd+B)
```

**Build should succeed** with no errors. Warnings are OK but should be reviewed.

**Common build errors:**

| Error | Solution |
|-------|----------|
| "No such module 'Capacitor'" | Run `pod install` again |
| "Code signing error" | Check Signing & Capabilities settings |
| "Missing Info.plist values" | Verify all permission strings are set |
| "Framework not found" | Clean build folder and rebuild |

---

## Part 6: Create Archive

### Step 6.1: Create Archive

```
Xcode → Product → Archive
(or press Cmd+Shift+Option+K? No, use menu)
```

**This process:**
1. Builds in Release configuration (optimized, no debug symbols)
2. Signs with Distribution certificate
3. Creates `.xcarchive` bundle
4. Opens Organizer window when complete

**Time:** 2-5 minutes depending on machine

**Expected result:** Organizer window opens showing new archive with:
- App name: Commons
- Version: 1.0
- Build: (your build number)
- Date: Today
- Size: ~50-150 MB (varies)

**If archive fails:**
- Read error carefully
- Common issues: signing, missing entitlements, code issues
- Fix error, clean build folder, try again

---

## Part 7: Validate Archive

Before uploading to App Store Connect, validate locally.

### Step 7.1: Validate in Organizer

1. **Select your archive** in Organizer
2. **Click "Distribute App"**
3. **Select:** App Store Connect
4. **Click:** Next
5. **Select:** Upload (or just Validate for now)
6. **Choose options:**
   - ✅ Upload app's symbols for Apple to symbolicate crashes
   - ✅ Manage Version and Build Number (recommended)
   - ⬜ Strip Swift symbols (optional, reduces size)
7. **Click:** Next
8. **Automatically manage signing:** Keep checked
9. **Click:** Next
10. **Review details**, then click "Validate" (or "Upload")

**Validation checks:**
- Code signing
- Entitlements match App Store Connect
- Required icons present
- Info.plist valid
- Privacy manifest valid
- Export compliance

**Validation time:** 1-5 minutes

**Expected result:** ✅ "App Validated Successfully"

### Step 7.2: Common Validation Issues

| Issue | Solution |
|-------|----------|
| **ITMS-90683: Missing purpose string** | Add missing permission string to Info.plist |
| **ITMS-90206: Invalid Bundle** | Check bundle ID matches App Store Connect |
| **ITMS-90339: Deprecated API** | Update deprecated code or frameworks |
| **ITMS-90078: Missing 64-bit support** | Ensure build is for arm64 |
| **ITMS-90125: Binary is invalid** | Rebuild with correct signing |

**If validation fails:**
1. Fix the reported issue
2. Increment build number
3. Create new archive
4. Validate again

---

## Part 8: Upload to App Store Connect

### Step 8.1: Upload Archive

Once validation succeeds:

1. **Click "Distribute App"** again
2. **Select:** App Store Connect → Upload
3. **Follow wizard** (same as validation)
4. **Click "Upload"** on final screen

**Upload time:** 2-10 minutes depending on connection

**Expected result:** 
```
Upload Successful
Your app has been uploaded to App Store Connect.
```

### Step 8.2: Verify Upload in App Store Connect

1. **Log in:** https://appstoreconnect.apple.com
2. **Navigate:** My Apps → Commons → TestFlight tab → iOS Builds
3. **Wait:** 5-60 minutes for "Processing" to complete
4. **Status should change to:** "Ready to Submit"

**Build processing:**
- Apple scans for malware
- Generates app thinning variants
- Processes symbols for crash reports

**While processing, you can:**
- Update app metadata (screenshots, description)
- Fill out App Privacy questionnaire
- Add App Review Information

---

## Part 9: Configure App Store Connect

### Step 9.1: Select Build for Version

1. **Navigate:** My Apps → Commons → App Store tab
2. **Select version:** 1.0 (or create new version)
3. **Scroll to "Build" section**
4. **Click:** ➕ (plus icon) next to Build
5. **Select your uploaded build** from the list
6. **Export Compliance:** Select "No" (uses standard HTTPS only)

### Step 9.2: Complete All Required Fields

Use the templates in `/workspace/docs/APP_STORE_CONNECT_METADATA.md`:

- [ ] App Name
- [ ] Subtitle
- [ ] Screenshots (all required sizes)
- [ ] Description
- [ ] Keywords
- [ ] Support URL
- [ ] Marketing URL
- [ ] Privacy Policy URL
- [ ] What's New (version description)
- [ ] App Review Information (test account)

### Step 9.3: Complete App Privacy

See `/workspace/docs/APP_STORE_CONNECT_METADATA.md` for complete questionnaire answers.

**Quick summary:**
- **Track users?** No
- **Collect data?** Yes
  - Phone, email, name, location, photos, user content
  - All linked to identity (except diagnostics)
  - Used for app functionality, not tracking

---

## Part 10: Submit for Review

### Step 10.1: Final Checks

- [ ] All required fields are green (no red dots)
- [ ] Build is selected
- [ ] Screenshots uploaded for all sizes
- [ ] Privacy questionnaire completed
- [ ] App Review Information filled out
- [ ] Test account works
- [ ] Version status shows "Ready to Submit"

### Step 10.2: Submit

1. **Click "Submit for Review"** button (top right)
2. **Review information** on confirmation screen
3. **Click "Submit"** to confirm

**Status will change:**
- "Waiting for Review" → Queue for review
- "In Review" → Apple is testing (1-24 hours typically)
- "Pending Developer Release" → Approved! (or "Ready for Sale" if auto-release)

---

## Part 11: Environment Variables Reference

### Client Environment (.env.production)

```bash
# API Configuration
VITE_API_URL=https://api.oncommons.co

# Analytics (optional)
# VITE_POSTHOG_KEY=your_key
# VITE_SENTRY_DSN=your_dsn

# Features (optional)
# VITE_ENABLE_BETA_FEATURES=false

# App Store (set after approval)
VITE_APP_STORE_URL=
```

### Backend Environment (Production)

```bash
# Node
NODE_ENV=production
PORT=3000

# Database
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/commons-prod

# Authentication
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_VERIFY_SERVICE_SID=VAxxxxx
JWT_SECRET=your-secure-random-string

# Test Access (for App Review)
ALLOW_TEST_LOGIN=1  # Set to 1 if using test bypass
SEED_DEMO_ACCOUNTS=0  # Keep 0 in production

# Apple Push Notifications
APNS_KEY_ID=ABC123DEFG
APNS_TEAM_ID=WU33P9WH4C
APNS_BUNDLE_ID=com.oncommons.mvp
APNS_KEY_PATH=/path/to/AuthKey_ABC123DEFG.p8

# Storage
GCS_BUCKET=commons-prod-uploads
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@oncommons.co
SMTP_PASS=your-app-password
SMTP_FROM=Commons <noreply@oncommons.co>

# CORS (allow web and native)
CORS_ORIGIN=https://www.oncommons.co,capacitor://localhost,ionic://localhost
```

---

## Part 12: Troubleshooting

### Issue: "VITE_API_URL is undefined in app"

**Symptoms:** App can't connect to API, shows localhost or undefined

**Solution:**
```bash
# Verify .env.production exists
cat client/.env.production

# Rebuild with production env
cd client
npm run build
npx cap copy ios

# Verify URL in bundle
grep -r "your-api-url" client/dist/assets/
```

### Issue: "Archive failed with signing error"

**Symptoms:** "No signing certificate found" or "Provisioning profile doesn't match"

**Solution:**
1. Xcode → Preferences → Accounts → Download Manual Profiles
2. Target → Signing & Capabilities → Toggle "Automatically manage signing"
3. Clean build folder (Cmd+Shift+K)
4. Try archive again

### Issue: "Build validation failed with ITMS-90683"

**Symptoms:** Missing purpose string for Camera, Location, or Photos

**Solution:**
```bash
# Verify Info.plist has all required strings
cat client/ios/App/App/Info.plist | grep -A 1 "UsageDescription"

# Should show:
# NSCameraUsageDescription
# NSLocationWhenInUseUsageDescription
# NSPhotoLibraryUsageDescription
# NSPhotoLibraryAddUsageDescription
```

### Issue: "Pods not found after sync"

**Symptoms:** "No such module 'CapacitorCamera'" or similar

**Solution:**
```bash
cd client/ios/App
pod deintegrate
pod install

# Then rebuild in Xcode
```

### Issue: "Web assets not updating in iOS app"

**Symptoms:** Old code running in app after rebuild

**Solution:**
```bash
# Hard refresh web build
cd client
rm -rf dist
npm run build
npx cap copy ios --inline

# Clean build in Xcode
# Product → Clean Build Folder
```

---

## Part 13: Post-Approval

### After App is Approved

1. **Release the app** (if not auto-released)
2. **Get App Store URL:** https://apps.apple.com/app/idXXXXXXXXXX
3. **Update environment variable:**

```bash
# Add to .env.production
VITE_APP_STORE_URL=https://apps.apple.com/app/idXXXXXXXXXX
```

4. **Plan version 1.1** with this change and any bug fixes

---

## Quick Command Reference

```bash
# Full production build process
cd client
npm install
npm run build
npx cap sync ios
open ios/App/App.xcworkspace

# Then in Xcode:
# 1. Update version/build number
# 2. Product → Clean Build Folder
# 3. Product → Archive
# 4. Distribute → Upload to App Store Connect

# Verify production API
curl https://your-production-api.com/api/health

# Check bundle for API URL
grep -r "your-api-url" client/dist/assets/
```

---

## Checklist Summary

- [ ] Production API deployed and tested
- [ ] Environment variables configured (client + backend)
- [ ] Dependencies installed (npm, pods)
- [ ] Client built for production
- [ ] Web assets copied to iOS
- [ ] Version and build number incremented
- [ ] Signing configured correctly
- [ ] Archive created successfully
- [ ] Archive validated without errors
- [ ] Archive uploaded to App Store Connect
- [ ] Build processed and ready
- [ ] Build selected in App Store Connect
- [ ] All metadata completed
- [ ] App Privacy questionnaire completed
- [ ] Test account documented and working
- [ ] Submitted for review

---

**Guide Version:** 1.0  
**Last Updated:** [Current Date]  
**Maintained By:** Commons Development Team

For questions or issues, refer to:
- `/workspace/docs/APP_STORE_SUBMISSION_CHECKLIST.md`
- `/workspace/docs/APP_STORE_CONNECT_METADATA.md`
- Apple Developer Documentation: https://developer.apple.com/documentation
