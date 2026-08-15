# Privacy Policy URL Configuration Guide

## Overview

Apple App Store Connect requires a **public HTTPS URL** for your privacy policy. This document explains how to ensure your privacy policy is properly configured for App Store submission.

---

## Current Configuration

### In-App Privacy Policy

**Location:** `/workspace/client/src/content/legal.ts`

The app includes privacy policy content that is displayed in-app at:
- Route: `/legal/privacy`
- Accessible from: Settings → Legal → Privacy Policy

### Privacy Contact Emails
- **General Privacy:** privacy@oncommons.co
- **Safety & Moderation:** safety@oncommons.co

---

## Required: Public Privacy Policy URL

For App Store Connect, you must provide a publicly accessible HTTPS URL:

### ✅ Recommended URL Format
```
https://www.oncommons.co/legal/privacy
```

### Requirements Checklist

- [ ] Privacy policy is hosted at a public HTTPS URL (not http://)
- [ ] URL is accessible without authentication or login
- [ ] Content matches the in-app privacy policy exactly
- [ ] URL is stable and won't change after submission
- [ ] URL loads quickly and is mobile-friendly
- [ ] Domain has valid SSL certificate

---

## Deployment Options

### Option 1: Deploy Client as Static Site (Recommended)

If you deploy your Vite/React client to a public web host:

1. **Build the client:**
   ```bash
   cd client
   npm run build
   ```

2. **Deploy `dist/` folder to:**
   - Vercel, Netlify, Cloudflare Pages, or similar
   - Your own web server with HTTPS

3. **Privacy policy will be accessible at:**
   ```
   https://www.oncommons.co/legal/privacy
   ```

4. **Verify the URL loads correctly** in a browser before submission.

### Option 2: Separate Privacy Policy Page

If the client web deployment is not ready:

1. Create a simple static HTML page with the privacy policy content
2. Host it separately at `https://www.oncommons.co/privacy.html`
3. Ensure the content matches what's in `/workspace/client/src/content/legal.ts`

### Option 3: Use a Third-Party Privacy Policy Generator

Services like:
- **Termly** (https://termly.io)
- **iubenda** (https://www.iubenda.com)
- **TermsFeed** (https://www.termsfeed.com)

These provide hosted URLs, but you must:
- Customize the policy to match your actual data practices
- Keep the in-app content synchronized with the hosted version

---

## Privacy Policy Content Requirements

Your privacy policy MUST include:

### ✅ Required Sections

1. **Data Collection**
   - What data you collect (phone, name, email, location, photos, etc.)
   - How you collect it (user input, device permissions, automatic)

2. **Data Usage**
   - Why you collect each type of data
   - How you use it (authentication, features, notifications, etc.)

3. **Data Sharing**
   - Who you share data with (if anyone)
   - Third-party services (Twilio, Google Cloud Storage, MongoDB, SMTP, APNs)
   - Clarify that you don't sell data to advertisers

4. **Data Storage & Security**
   - Where data is stored (MongoDB, GCS)
   - Security measures
   - Data retention policies

5. **User Rights**
   - Right to access data
   - Right to delete account (complies with Apple Guideline 5.1.1)
   - How to exercise these rights

6. **Cookies & Tracking**
   - Clarify you don't use third-party tracking
   - Session/auth tokens only

7. **Children's Privacy**
   - Age restrictions (17+ due to UGC)
   - COPPA compliance statement

8. **Changes to Policy**
   - How users will be notified of updates
   - Last updated date

9. **Contact Information**
   - privacy@oncommons.co
   - Physical address (if applicable for GDPR/CCPA)

---

## Synchronization Checklist

Before submission, ensure consistency:

### App Store Connect Privacy Questionnaire
- [ ] Data types in questionnaire match privacy policy
- [ ] Purposes match privacy policy
- [ ] "Linked to identity" flags match privacy policy

### PrivacyInfo.xcprivacy
- [ ] Data types in manifest match privacy policy
- [ ] API usage reasons are documented

### In-App Privacy Policy
- [ ] In-app content at `/legal/privacy` matches public URL content
- [ ] Contact emails are correct and monitored

### Info.plist Permission Strings
- [ ] Camera, location, photo library purposes align with privacy policy

---

## Setting the Privacy URL in App Store Connect

When you're ready to submit:

1. **Log in to App Store Connect**
2. **Navigate to:** My Apps → Commons → App Information
3. **Find:** Privacy Policy URL field
4. **Enter:** `https://www.oncommons.co/legal/privacy`
5. **Save**

---

## Updating VITE_APP_STORE_URL

Once your app is live on the App Store, update the app store URL:

**File:** `/workspace/client/src/lib/appStore.ts`

```typescript
// Current
export const VITE_APP_STORE_URL = process.env.VITE_APP_STORE_URL || '';

// After app approval, set in environment:
VITE_APP_STORE_URL=https://apps.apple.com/app/idXXXXXXXXXX
```

This enables the "Rate on App Store" feature in the app.

---

## Pre-Submission Verification

### Manual Testing Checklist

Before submitting to App Review:

```bash
# Test privacy policy URL loads correctly
curl -I https://www.oncommons.co/legal/privacy

# Should return:
# HTTP/2 200
# content-type: text/html
```

- [ ] URL returns HTTP 200 status
- [ ] Page loads in mobile Safari
- [ ] Page loads in desktop browser
- [ ] Content is readable and properly formatted
- [ ] No broken links or images
- [ ] SSL certificate is valid (green lock icon)
- [ ] Page loads in under 3 seconds

---

## Common Issues & Solutions

### Issue: Privacy policy URL returns 404
**Solution:** Ensure the route `/legal/privacy` exists in your web deployment. Check that client build includes all routes.

### Issue: URL requires authentication
**Solution:** Make sure `/legal/privacy` is publicly accessible without login. Check your server/routing configuration.

### Issue: HTTP instead of HTTPS
**Solution:** Configure SSL certificate on your domain. Use a service like Let's Encrypt or your hosting provider's SSL.

### Issue: In-app and web versions differ
**Solution:** The source of truth is `/workspace/client/src/content/legal.ts`. Ensure both web and app render from this file.

### Issue: Apple rejects due to missing information
**Solution:** Review Apple's privacy policy guidelines and ensure all required sections are present. Common missing items: third-party data sharing, data retention, children's privacy.

---

## Additional Resources

- **Apple Privacy Guidelines:** https://developer.apple.com/app-store/review/guidelines/#privacy
- **App Store Connect Help:** https://help.apple.com/app-store-connect/#/dev1c7de93bb
- **GDPR Compliance:** https://gdpr.eu/
- **CCPA Compliance:** https://oag.ca.gov/privacy/ccpa

---

## Next Steps

1. **Deploy your web app** with the privacy policy at a public URL
2. **Verify the URL** loads correctly in multiple browsers
3. **Update App Store Connect** with the privacy policy URL
4. **Test the in-app privacy** link to ensure consistency
5. **Document the URL** in your submission materials

---

**Last Updated:** [Current Date]  
**Maintained By:** Commons Development Team  
**Contact:** privacy@oncommons.co
