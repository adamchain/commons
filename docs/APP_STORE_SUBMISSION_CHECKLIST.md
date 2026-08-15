# App Store Submission Checklist for Commons

Complete this checklist before creating your final archive in Xcode and submitting to App Store Connect.

---

## ✅ Part 1: Code & Configuration

### Xcode Project Configuration

- [ ] **Project opened in Xcode via workspace**
  - Open `client/ios/App/App.xcworkspace` (not `.xcodeproj`)
  
- [ ] **Version and Build Numbers updated**
  - Marketing Version: 1.0 (or appropriate version)
  - Build Number: Increment from previous (currently 13)
  - Location: Xcode → Target → General → Identity

- [ ] **Deployment Target verified**
  - Current: iOS 14.0
  - Recommended: Keep at 14.0 or bump to 15.0+ if using newer APIs
  - Location: Xcode → Target → General → Deployment Info

- [ ] **Bundle Identifier confirmed**
  - Should be: `com.oncommons.mvp`
  - Location: Xcode → Target → General → Identity

- [ ] **Signing & Capabilities configured**
  - Signing: Automatic
  - Team: WU33P9WH4C
  - Provisioning Profile: Xcode Managed
  - Push Notifications capability: Enabled
  - Location: Xcode → Target → Signing & Capabilities

### Info.plist - Permissions

- [x] **Permission strings are user-friendly and clear**
  - ✅ Camera: "Take photos to share in your plans..."
  - ✅ Location: "Discover nearby plans and places..."
  - ✅ Photo Library: "Select photos from your library..."
  - ✅ Photo Library Add: "Save photos you take in Commons..."
  
- [x] **Unused permissions removed**
  - ✅ `NSLocationAlwaysAndWhenInUseUsageDescription` removed
  - ✅ Background `fetch` mode removed (only `remote-notification` remains)

- [x] **Export compliance set**
  - ✅ `ITSAppUsesNonExemptEncryption` = false

### Entitlements

- [ ] **App.entitlements reviewed**
  - Push Notifications: `aps-environment` = production ✅
  - No unnecessary entitlements added

### Privacy Manifest

- [x] **PrivacyInfo.xcprivacy created and configured**
  - ✅ File created at `client/ios/App/App/PrivacyInfo.xcprivacy`
  - ✅ Data collection types documented
  - ✅ API usage reasons specified
  - ✅ No tracking enabled

### Dependencies & Pods

- [ ] **CocoaPods dependencies installed**
  ```bash
  cd client/ios/App
  pod install
  # or
  cd client
  npx cap sync ios
  ```

- [ ] **Verify Pods/ directory exists**
  - Should contain Capacitor plugins after install

- [ ] **No unused dependencies or frameworks**
  - Review `Podfile` for unused plugins
  - Current plugins: App, Camera, Clipboard, Geolocation, Preferences, Push

---

## ✅ Part 2: Build & Environment

### Production API Configuration

- [ ] **VITE_API_URL set to production backend**
  ```bash
  cd client
  # Create or update .env.production
  echo "VITE_API_URL=https://your-production-api.com" > .env.production
  ```

- [ ] **Production API is live and stable**
  - Test health endpoint: `curl https://your-production-api.com/api/health`
  - Verify all endpoints are operational
  - Check database connections (MongoDB)
  - Verify third-party services (Twilio, GCS, SMTP, APNs)

- [ ] **Environment variables configured on backend**
  - `NODE_ENV=production`
  - `ALLOW_TEST_LOGIN` = 0 or 1 (decide based on reviewer access method)
  - `SEED_DEMO_ACCOUNTS` = 0 (disable in production unless intentional)
  - All API keys and secrets set (Twilio, APNs, GCS, SMTP)

### Test Account Preparation

- [ ] **Test account created and functional**
  - Option A: Real phone number with Twilio SMS verification
  - Option B: Test bypass (+19999999999 / 999999) if `ALLOW_TEST_LOGIN=1`

- [ ] **Test account has demo data**
  - Profile completed
  - Joined at least one neighborhood/community
  - Sample plans visible
  - Mock chat conversations exist
  - Photos in profile or plans

- [ ] **Account deletion tested**
  - Verify Settings → Delete Account works
  - Confirm deletion is immediate and removes all data

### Web Build

- [ ] **Client built for production**
  ```bash
  cd client
  npm run build
  ```

- [ ] **Capacitor synced with iOS**
  ```bash
  npx cap sync ios
  # or
  npx cap copy ios
  ```

- [ ] **Assets and icons verified**
  - App icon present at `client/ios/App/App/Assets.xcassets/AppIcon.appiconset/`
  - Launch screen configured

---

## ✅ Part 3: Xcode Archive & Export

### Pre-Archive Checks

- [ ] **Scheme set to "App"**
  - Xcode → Product → Scheme → App

- [ ] **Build Configuration set to "Release"**
  - Xcode → Product → Scheme → Edit Scheme → Run → Build Configuration

- [ ] **Target device set to "Any iOS Device (arm64)"**
  - Xcode toolbar → Select "Any iOS Device (arm64)"

- [ ] **Clean build folder**
  ```
  Xcode → Product → Clean Build Folder (Cmd+Shift+K)
  ```

### Create Archive

- [ ] **Archive created successfully**
  ```
  Xcode → Product → Archive
  ```
  - Wait for build to complete
  - Should open Organizer window with new archive

- [ ] **Archive validated**
  - Organizer → Distribute App → App Store Connect → Next
  - Click "Validate App" (not "Upload")
  - Wait for validation to complete
  - Fix any errors or warnings

### Common Archive Issues

If you encounter errors:

- **Signing issues:** Check provisioning profiles in Xcode → Preferences → Accounts
- **Missing entitlements:** Verify App.entitlements matches App Store Connect capabilities
- **Icon issues:** Ensure all required icon sizes exist in Assets.xcassets
- **Bitcode errors:** Bitcode is deprecated in Xcode 14+, can be ignored
- **Framework issues:** Run `pod install` again and clean build folder

---

## ✅ Part 4: App Store Connect Setup

### App Information

- [ ] **App created in App Store Connect**
  - Navigate to: https://appstoreconnect.apple.com → My Apps → + (New App)
  - Name: Commons
  - Bundle ID: com.oncommons.mvp

- [ ] **App Information completed**
  - Category: Social Networking (primary), Lifestyle (secondary)
  - Age Rating: 17+ (UGC, Social Networking)
  - Support URL: https://www.oncommons.co/support
  - Marketing URL: https://www.oncommons.co

### Privacy

- [ ] **Privacy Policy URL set**
  - URL: `https://www.oncommons.co/legal/privacy`
  - Verify URL is publicly accessible
  - Verify URL loads correctly on mobile Safari

- [ ] **App Privacy questionnaire completed**
  - See: `/workspace/docs/APP_STORE_CONNECT_METADATA.md`
  - Data types: Phone, Email, Name, Address, Photos, Location, User ID, Device ID, Usage, Diagnostics
  - No data used for tracking
  - Data linked to user (except diagnostics)

### App Review Information

- [ ] **Contact information provided**
  - First/Last Name
  - Phone Number
  - Email Address

- [ ] **Demo account credentials provided**
  - Use template from: `/workspace/docs/APP_STORE_REVIEWER_INSTRUCTIONS.md`
  - Include phone number and verification method
  - Document any special test features

- [ ] **Review notes added**
  - Copy relevant sections from `APP_STORE_REVIEWER_INSTRUCTIONS.md`
  - Explain invite-only model
  - Explain test account has demo data
  - Note location/camera permissions are optional

### Version Information

- [ ] **Version 1.0 created**
  - App Store Connect → My Apps → Commons → + Version or Platform

- [ ] **Screenshots uploaded**
  - Required sizes: 6.9", 6.7", 6.5" displays
  - Recommended: 5-6 screenshots per size
  - See: `/workspace/docs/APP_STORE_CONNECT_METADATA.md` for content ideas

- [ ] **App description and metadata added**
  - App Name: Commons
  - Subtitle: Neighborhood plans and community
  - Promotional Text (optional)
  - Description (4000 char max)
  - Keywords (100 char max)
  - Use template: `/workspace/docs/APP_STORE_CONNECT_METADATA.md`

- [ ] **What's New text added** (for v1.0)
  - Describe initial release features

### Build Upload

- [ ] **Build uploaded to App Store Connect**
  ```
  Xcode → Organizer → Distribute App → App Store Connect → Upload
  ```
  - Select archive
  - Choose signing options (Automatic is fine)
  - Upload and wait for processing

- [ ] **Build appears in App Store Connect**
  - Can take 5-60 minutes to process
  - Check: App Store Connect → TestFlight → iOS Builds

- [ ] **Build selected for version**
  - App Store Connect → App Store → Version 1.0 → Build → Select build

- [ ] **Export Compliance set**
  - If prompted: "Uses Encryption: No" (standard HTTPS only)

---

## ✅ Part 5: Pre-Submission Testing

### TestFlight (Recommended)

- [ ] **TestFlight build tested internally**
  - Distribute to internal testers first
  - Test on real device, not simulator
  - Verify all core features work
  - Check push notifications
  - Test account deletion

### Feature Testing

- [ ] **Authentication works**
  - SMS verification with real phone
  - Test account bypass (if enabled)

- [ ] **Location services work**
  - App requests when-in-use permission
  - Nearby plans display correctly
  - Manual neighborhood selection works if permission denied

- [ ] **Camera & Photos work**
  - Camera permission requested when needed
  - Photo library permission requested when needed
  - Upload to plan works
  - Profile photo upload works

- [ ] **Push notifications work**
  - Permission requested appropriately
  - Test notifications sent from backend
  - Notifications appear on device
  - Tapping notification opens correct screen

- [ ] **Account deletion works**
  - Settings → Delete Account
  - Confirmation dialog appears
  - Account deleted immediately
  - Cannot log back in with deleted account

- [ ] **All links work**
  - Support URL loads
  - Privacy Policy loads (in-app and web)
  - Terms of Service loads
  - Any other embedded web views

### Compliance Checks

- [ ] **No placeholder content**
  - Remove any "TODO", "Lorem ipsum", or test text
  - Remove debug buttons or developer features
  - Remove unused code comments

- [ ] **No hardcoded test credentials** (except documented bypass)
  - Review code for hardcoded passwords, tokens, API keys

- [ ] **No console logs in production** (optional, but recommended)
  - Remove excessive logging
  - Keep only critical error logs

- [ ] **App handles offline gracefully**
  - Test with airplane mode
  - App doesn't crash without network
  - Appropriate error messages shown

---

## ✅ Part 6: Submit for Review

### Final Checks

- [ ] **All required fields in App Store Connect are green**
  - No red dots or "Missing" indicators

- [ ] **Screenshots look professional**
  - High quality, no blur
  - Accurate representation of app
  - All required sizes uploaded

- [ ] **Metadata is accurate**
  - No typos in description
  - Keywords are relevant
  - Age rating matches content

- [ ] **Build is selected**
  - Version shows a build number under "Build"

### Submit

- [ ] **"Submit for Review" button clicked**
  - App Store Connect → My Apps → Commons → Version 1.0
  - Click "Submit for Review"
  - Confirm all information is correct

- [ ] **Submission confirmation received**
  - Status changes to "Waiting for Review"
  - Email confirmation sent

---

## ✅ Part 7: Post-Submission

### Monitor Status

- [ ] **Check App Store Connect daily**
  - Status updates: Waiting for Review → In Review → Pending Developer Release (or Approved)

- [ ] **Respond to Apple messages within 24 hours**
  - Check email for any questions from App Review
  - Respond promptly to avoid delays

### If Rejected

- [ ] **Read rejection reason carefully**
  - Apple will explain which guideline was violated

- [ ] **Fix the issue**
  - Make necessary code or metadata changes
  - Update build version if code changes made
  - Upload new build if needed

- [ ] **Respond or resubmit**
  - App Store Connect → Resolution Center
  - Explain your changes or provide clarification

### If Approved

- [ ] **Release app** (if not auto-released)
  - App Store Connect → Version 1.0 → Release This Version

- [ ] **Update VITE_APP_STORE_URL**
  - Set to: `https://apps.apple.com/app/idXXXXXXXXXX`
  - Push update in future version

- [ ] **Monitor reviews and feedback**
  - Check App Store reviews
  - Respond to user feedback
  - Plan for future updates

---

## 📋 Quick Reference

### Key Files Modified/Created

| File | Status | Purpose |
|------|--------|---------|
| `client/ios/App/App/Info.plist` | ✅ Updated | Improved permission strings, removed unused permissions |
| `client/ios/App/App/PrivacyInfo.xcprivacy` | ✅ Created | Required privacy manifest |
| `client/ios/App/App/App.entitlements` | ✅ Verified | Push notifications configured |
| `docs/APP_STORE_REVIEWER_INSTRUCTIONS.md` | ✅ Created | Test account and reviewer instructions |
| `docs/APP_STORE_CONNECT_METADATA.md` | ✅ Created | Complete ASC metadata template |
| `docs/PRIVACY_POLICY_URL_CONFIG.md` | ✅ Created | Privacy URL configuration guide |
| `docs/APP_STORE_SUBMISSION_CHECKLIST.md` | ✅ Created | This checklist |
| `docs/PRODUCTION_BUILD_GUIDE.md` | 📝 Next | Build process documentation |

### Command Quick Reference

```bash
# Install dependencies
cd client/ios/App && pod install

# Sync Capacitor
cd client && npx cap sync ios

# Build client for production
cd client && npm run build && npx cap copy ios

# Open workspace in Xcode
open client/ios/App/App.xcworkspace
```

### Important URLs

- **App Store Connect:** https://appstoreconnect.apple.com
- **Developer Portal:** https://developer.apple.com/account
- **Review Guidelines:** https://developer.apple.com/app-store/review/guidelines/
- **Privacy Guidelines:** https://developer.apple.com/app-store/review/guidelines/#privacy

### Support Contacts

- **Privacy:** privacy@oncommons.co
- **Safety:** safety@oncommons.co
- **General:** Via in-app support at www.oncommons.co/support

---

## 🎯 Estimated Timeline

- **Preparation (this checklist):** 2-4 hours
- **Archive & Upload:** 30-60 minutes
- **App Store Processing:** 5-60 minutes
- **Review Queue:** 24-48 hours (typically)
- **In Review:** 1-24 hours (typically)
- **Total:** 1-3 days from submission to approval (average)

---

**Checklist Version:** 1.0  
**Last Updated:** [Current Date]  
**Maintained By:** Commons Development Team

Good luck with your App Store submission! 🚀
