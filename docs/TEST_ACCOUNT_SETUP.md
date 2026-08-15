# App Store Review Test Account Setup Guide

## Overview

Apple requires a functional test account for App Review. This guide explains how to create and configure the test account that reviewers will use to test the Commons app.

---

## Two Options for Test Accounts

### Option 1: Test Bypass Account (Recommended for App Review)

**Pros:**
- No dependency on SMS delivery
- Reviewer doesn't need their own phone
- Works immediately with fixed credentials
- Simple to document in App Store Connect

**Cons:**
- Requires `ALLOW_TEST_LOGIN=1` in production environment
- Creates a minor security bypass (only works with documented phone number)

### Option 2: Real Phone Number with Twilio Verify

**Pros:**
- Uses real authentication flow
- No special environment configuration needed
- More secure (no bypass in production)

**Cons:**
- Reviewer must have access to that phone number
- Depends on SMS delivery working reliably
- Requires setting up a real phone number for testing

---

## Option 1: Test Bypass Account (Recommended)

### Step 1: Run the Seed Script

The test account setup script creates a fully populated demo account:

```bash
# Run against your production MongoDB
MONGODB_URI="mongodb+srv://your-production-db" \
ALLOW_TEST_LOGIN=1 \
npx tsx server/src/scripts/seedAppReviewAccount.ts
```

**What this creates:**
- User account with phone `+19999999999`
- Complete profile (name, bio, interests, neighborhoods)
- RSVPs to upcoming plans
- Network connections with other users
- Forum memberships
- Completed onboarding flow

### Step 2: Enable Test Login in Production

Add this environment variable to your production backend:

```bash
ALLOW_TEST_LOGIN=1
```

**Where to set this:**
- Railway: Settings → Variables
- Heroku: Settings → Config Vars
- Vercel: Settings → Environment Variables
- Docker: docker-compose.yml or .env file
- Direct server: /etc/environment or systemd service file

**Security Note:** The test bypass only works with the documented phone number `+19999999999`. Regular users cannot exploit this to bypass authentication.

### Step 3: Verify Test Login Works

Test the account yourself before submitting:

1. **Open your production app** (TestFlight or local build with production API)
2. **Start sign-in flow**
3. **Enter phone:** +1 (999) 999-9999
4. **Enter code:** 999999
5. **Verify you're signed in** as "App Reviewer"
6. **Check that demo data appears:** plans, network, forums

### Step 4: Document in App Store Connect

When filling out "App Review Information" in App Store Connect:

**Demo Account:**
```
Username: +19999999999
Password: 999999
```

**Additional Information/Notes:**
```
Test Account Instructions:
1. Launch Commons app
2. Tap "Get Started"
3. Enter phone number: +1 (999) 999-9999
4. Enter verification code: 999999
5. You'll be signed in as "App Reviewer" with demo data

This test account has:
- Completed profile with neighborhoods and interests
- RSVPs to sample plans
- Network connections with other users
- Forum memberships
- All features accessible without invite code

Note: This is a special test account enabled via ALLOW_TEST_LOGIN=1 
in our production environment specifically for App Review.
```

---

## Option 2: Real Phone Number Account

### Step 1: Choose a Phone Number

Select a phone number you control that can receive SMS:
- Your own phone
- Company phone
- Twilio phone number (if you have one)
- Google Voice number

**Important:** This number must be able to receive SMS from Twilio Verify.

### Step 2: Create Account via Normal Sign-In

1. **Open your production app** (TestFlight or with production API)
2. **Sign in with the chosen phone number**
3. **Complete onboarding:**
   - Add name (e.g., "App Reviewer")
   - Select neighborhoods
   - Choose interests
   - Accept terms/privacy
4. **Add demo activity:**
   - RSVP to some plans
   - Join a few forums
   - Add a profile photo
   - Connect with other users (if any exist)

### Step 3: Keep Phone Number Active

**Critical:** The phone number must remain active and able to receive SMS during the entire review period (typically 1-3 days).

### Step 4: Document in App Store Connect

**Demo Account:**
```
Username: +1 XXX-XXX-XXXX (your real phone number)
Password: SMS verification code will be sent
```

**Additional Information/Notes:**
```
Test Account Instructions:
1. Launch Commons app
2. Tap "Get Started"
3. Enter phone number: +1 XXX-XXX-XXXX
4. Wait for SMS verification code (typically arrives in 10-30 seconds)
5. Enter the 6-digit code received via SMS
6. You'll be signed in to the demo account

This account has:
- Completed profile with neighborhoods and interests
- RSVPs to sample plans
- Network connections
- All features accessible

Note: SMS verification uses Twilio Verify. If the code doesn't arrive 
within 1 minute, please request a new code.
```

---

## Maintaining Test Account Data

### Keep Demo Data Fresh

Test accounts should have realistic, current data:

**Plans:**
- At least 3-5 upcoming plans
- Mix of plan types (social, food, events)
- Some with photos
- Some with RSVPs from multiple users

**Profile:**
- Complete name and bio
- Profile photo or avatar
- 3+ neighborhoods selected
- 5+ interests selected

**Activity:**
- 5+ network connections
- Forum memberships
- Past notifications
- Some chat history (if possible)

**Refresh periodically:**
```bash
# Re-run seed script to refresh demo data
MONGODB_URI="mongodb+srv://your-production-db" \
ALLOW_TEST_LOGIN=1 \
npx tsx server/src/scripts/seedAppReviewAccount.ts
```

### Test Before Each Submission

**Checklist before submitting:**
- [ ] Test account can sign in
- [ ] Profile is complete
- [ ] Upcoming plans are visible
- [ ] Can create a new plan
- [ ] Can RSVP to plans
- [ ] Forums load and can post
- [ ] Chat works (if others are online)
- [ ] Push notifications permission requested
- [ ] Location permission requested
- [ ] Camera/photos permission requested
- [ ] Account deletion works

---

## Troubleshooting

### Issue: Test bypass not working

**Symptoms:** Entering +19999999999 / 999999 shows "Invalid code"

**Solutions:**
1. Verify `ALLOW_TEST_LOGIN=1` is set in production environment
2. Restart backend after setting environment variable
3. Check backend logs for test-login confirmation message
4. Verify you're connected to production API, not localhost

**Check environment variable:**
```bash
# SSH to your server or check your hosting dashboard
echo $ALLOW_TEST_LOGIN
# Should output: 1
```

### Issue: Test account has no data

**Symptoms:** Sign-in works but no plans, neighborhoods, or activity appear

**Solutions:**
1. Run seed scripts to create base data:
   ```bash
   SEED_DEMO_ACCOUNTS=1 npx tsx src/scripts/runSeed.ts
   ```
2. Run app review account script:
   ```bash
   npx tsx src/scripts/seedAppReviewAccount.ts
   ```
3. Verify MongoDB has neighborhoods, plans, and users
4. Check API health endpoint: `/api/health`

### Issue: SMS not arriving (Option 2)

**Symptoms:** Real phone number doesn't receive verification code

**Solutions:**
1. Check Twilio Verify configuration (SID, auth token)
2. Verify phone number format: E.164 (+1XXXXXXXXXX)
3. Check Twilio trial limitations (trial accounts only send to verified numbers)
4. Check Twilio console for delivery status
5. Wait 2-3 minutes (carrier delays can occur)
6. Request a new code

### Issue: Reviewer reports "Invite code required"

**Symptoms:** App shows invite code screen even for test account

**Solutions:**
1. Ensure test account has `onboardingComplete: true`
2. Re-run seed script to update account
3. Consider disabling invite-only mode temporarily for review
4. Add note in App Review Information explaining invite-only model

---

## Security Considerations

### Test Bypass Account

**Risks:**
- Anyone with knowledge of `+19999999999` / `999999` can sign in
- Test account has access to all app features

**Mitigations:**
- Only enable `ALLOW_TEST_LOGIN=1` when actively under review
- Disable after approval: remove environment variable
- Test account has no access to real user data
- Monitor test account activity logs
- Consider IP whitelisting Apple's review servers (advanced)

**After Approval:**
```bash
# Disable test bypass
ALLOW_TEST_LOGIN=0
# or remove the variable entirely

# Restart backend to apply change
```

### Real Phone Number Account

**Risks:**
- Phone number visible to Apple reviewers
- Account remains active after review

**Mitigations:**
- Use a dedicated phone number, not personal
- Delete account after approval if desired
- Change phone number later if needed
- Monitor account for unexpected activity

---

## App Store Connect Configuration

### App Review Information Section

**Sign-in Required:** Yes

**Demo Account Information:**

For **Test Bypass** (Option 1):
```
Username: +19999999999
Password: 999999
```

For **Real Phone** (Option 2):
```
Username: [Your phone number]
Password: SMS code sent via Twilio Verify
```

**Notes:**
```
Test Account Instructions:

1. Launch Commons app
2. Tap "Get Started" to begin sign-in
3. Enter the provided phone number
4. [For Option 1] Enter verification code: 999999
   [For Option 2] Check SMS for 6-digit code and enter it
5. You'll be signed in to a fully populated test account

Features to Test:
- Browse nearby plans (requires location permission - please allow)
- View plan details and RSVP
- Create a new plan with photos (requires camera permission)
- Join community forums and post
- View user profiles and add to network
- Test push notifications (permission will be requested)
- Account deletion: Settings → Account → Delete My Account

The test account is pre-populated with:
✓ Complete profile (name, bio, neighborhoods, interests)
✓ RSVPs to upcoming plans
✓ Network connections
✓ Forum memberships
✓ Sample notifications

Support: privacy@oncommons.co
Privacy Policy: https://www.oncommons.co/legal/privacy
```

---

## Quick Reference

### Test Bypass Account (Option 1)

```bash
# Create test account
MONGODB_URI="mongodb+srv://..." npx tsx server/src/scripts/seedAppReviewAccount.ts

# Enable in production
ALLOW_TEST_LOGIN=1

# Test credentials
Phone: +19999999999
Code: 999999

# Disable after approval
ALLOW_TEST_LOGIN=0
```

### Real Phone Account (Option 2)

```bash
# Just sign in normally via the app with your chosen phone number
# Receive SMS code via Twilio Verify
# Complete onboarding manually

# Add demo activity via the app UI or via seed scripts
```

---

## Related Documentation

- `/workspace/docs/APP_STORE_SUBMISSION_CHECKLIST.md` - Complete submission checklist
- `/workspace/docs/APP_STORE_REVIEWER_INSTRUCTIONS.md` - Full reviewer instructions
- `/workspace/docs/PRODUCTION_BUILD_GUIDE.md` - Production build process
- `/workspace/server/src/routes/auth.ts` - Authentication implementation
- `/workspace/server/src/scripts/seedAppReviewAccount.ts` - Test account seed script

---

**Last Updated:** [Current Date]  
**Maintained By:** Commons Development Team  
**Support:** privacy@oncommons.co
