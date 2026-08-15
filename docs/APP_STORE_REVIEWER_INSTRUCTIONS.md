# App Store Reviewer Instructions for Commons

## Test Account Credentials

**For App Store Connect → App Review Information:**

### Test Account Option 1: Production Test Account (Recommended)

Use a real phone number with Twilio Verify SMS authentication:

```
Phone Number: [ADD YOUR TEST PHONE NUMBER]
Verification: Standard SMS code will be sent
```

**Instructions for reviewer:**
1. Launch the Commons app
2. Tap "Get Started"
3. Enter the phone number above
4. Check SMS for the 6-digit verification code
5. Enter the code to complete sign-in
6. The test account is already populated with demo neighborhood data, plans, and community content

---

### Test Account Option 2: Developer Bypass (Requires Backend Configuration)

If `ALLOW_TEST_LOGIN=1` is enabled in production backend:

```
Phone Number: +19999999999
Verification Code: 999999
```

**⚠️ Important:** Only use this option if you have explicitly enabled `ALLOW_TEST_LOGIN=1` in your production environment variables. This bypass is typically disabled for production.

---

## Features to Test

### Core Social Features
- Browse nearby neighborhood plans (requires location permission)
- View community forums and discussions
- Join or create new plans
- Upload photos to plans (requires camera/photo library permission)
- Search for venues and places
- Chat with other community members

### Push Notifications
- The app requests push notification permissions on first launch
- Plan invitations and updates will send push notifications
- Chat messages trigger real-time notifications

### Account Management
- Navigate to Settings → Account
- Test the "Delete My Account" feature (complies with Apple Guideline 5.1.1)
- Account deletion is immediate and permanent

### Legal & Privacy
- Privacy Policy: Available in-app at Settings → Legal → Privacy Policy
- Terms of Service: Available in-app at Settings → Legal → Terms of Service
- Support contact: privacy@oncommons.co

---

## App Category & Audience

**Primary Category:** Social Networking  
**Secondary Category:** Lifestyle  
**Age Rating:** 17+ (User Generated Content, Social Networking)

**Target Audience:** Women-focused, neighborhood-based social planning community. Currently focused on Philadelphia-area neighborhoods.

**Invite-Only Access:** The app is invite-only. The test account provided has full access to all features without requiring an invite code.

---

## Technical Requirements Met

✅ iOS 14.0+ deployment target  
✅ Push notifications configured (APNs production)  
✅ Location services (when-in-use only)  
✅ Camera and photo library access  
✅ No in-app purchases  
✅ No third-party advertising  
✅ No user tracking (ATT not required)  
✅ Account deletion available  
✅ Privacy manifest included

---

## Backend & API Status

**Production API:** Fully operational and stable  
**Expected Load:** Ready for production traffic  
**Uptime Monitoring:** Active  

All API endpoints are live and tested. The reviewer test account has pre-populated data to demonstrate the full user experience.

---

## Support & Contact

**Privacy Questions:** privacy@oncommons.co  
**Safety & Moderation:** safety@oncommons.co  
**General Support:** Via in-app Settings → Support (opens web view)  
**Website:** https://www.oncommons.co

---

## Notes for App Review Team

1. **Location Permission:** The app requests "When In Use" location to show nearby plans. This is optional - the user can manually select their neighborhood if they deny location access.

2. **Camera/Photos:** Used for adding profile pictures and uploading photos to plans and community posts.

3. **Push Notifications:** Used for plan updates, chat messages, and community activity notifications.

4. **User-Generated Content:** The app includes robust content moderation features, user blocking, and reporting tools accessible from any user profile or post.

5. **Invite-Only Model:** While the app is generally invite-only, the provided test account bypasses invite requirements for full feature testing.

6. **Demo Data:** The test account is pre-populated with realistic neighborhood data, sample plans, and community content to showcase the full experience.

---

**Last Updated:** [DATE - Update this before submission]  
**App Version:** 1.0  
**Build Number:** [Update with final build number]
