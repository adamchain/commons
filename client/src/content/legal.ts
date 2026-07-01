// Canonical in-app legal copy — Privacy Policy and Terms of Service. Rendered by
// the LegalDocument component (in-app reader + onboarding consent gate) and the
// public /legal/* routes. Keep this in sync with the published web versions at
// oncommons.co. Plain data so it stays easy to diff and update.

export type LegalBlock =
  | { type: "p"; text: string }
  | { type: "subhead"; text: string }
  | { type: "ul"; items: string[] };

export interface LegalSection {
  /** Section number as displayed, e.g. "1". */
  n: string;
  title: string;
  blocks: LegalBlock[];
}

export interface LegalDocument {
  /** Stable slug used in routes and consent tracking. */
  slug: "privacy" | "terms";
  title: string;
  updated: string;
  /** Lead paragraphs shown above the numbered sections. */
  intro: LegalBlock[];
  sections: LegalSection[];
}

export const PRIVACY_POLICY: LegalDocument = {
  slug: "privacy",
  title: "Privacy Policy",
  updated: "May 2026",
  intro: [],
  sections: [
    {
      n: "1",
      title: "Who We Are",
      blocks: [
        {
          type: "p",
          text: 'COMMONS is a social planning app operated by On Commons LLC, based in Philadelphia, Pennsylvania ("COMMONS," "we," "us," or "our"). This Privacy Policy explains how we collect, use, store, and protect your information when you use the COMMONS app.',
        },
        {
          type: "p",
          text: "If you have questions about this policy, contact us at privacy@oncommons.co.",
        },
      ],
    },
    {
      n: "2",
      title: "What We Collect",
      blocks: [
        { type: "subhead", text: "Information you give us directly:" },
        {
          type: "ul",
          items: [
            "Phone number — used to verify your identity at sign-up.",
            "Name — first name only, displayed on your profile.",
            "Neighborhood — where you spend time in Philadelphia.",
            "Interests — used to personalize your feed.",
            "Profile photo or avatar — optional, displayed on your profile.",
            "Plan content — titles, descriptions, dates, locations, and any other information you add when posting a plan.",
            "Messages — content you send in plan group chats.",
            "Invite codes — who you invited and whether they joined.",
          ],
        },
        { type: "subhead", text: "Information we collect automatically:" },
        {
          type: "ul",
          items: [
            "Device information — device type, operating system, app version.",
            "Usage data — how you use the app, which plans you view, join, or post.",
            "Location — neighborhood-level only, used to show you relevant plans nearby. We do not collect or store your precise GPS location.",
            "Log data — error reports, timestamps, and technical information used to keep the app running.",
            "Cookies and similar tracking technologies — we may use cookies or similar technologies to maintain your session and improve app performance.",
          ],
        },
        { type: "subhead", text: "Information from third parties:" },
        {
          type: "p",
          text: "If you were invited by another user, we receive your phone number from the invite flow. We do not receive any information from third party social media platforms.",
        },
        { type: "subhead", text: "Information we do not collect:" },
        {
          type: "ul",
          items: [
            "We do not collect your full name unless you choose to provide it.",
            "We do not collect payment information — COMMONS is free.",
            "We do not collect precise GPS location.",
            "We do not collect data from third party social media accounts.",
          ],
        },
      ],
    },
    {
      n: "3",
      title: "How We Use Your Information",
      blocks: [
        { type: "subhead", text: "We use your information to:" },
        {
          type: "ul",
          items: [
            "Create and manage your account.",
            "Personalize your feed based on your neighborhood and interests.",
            "Show you plans happening near you.",
            "Send you notifications about plans, your network, and what's happening in Philadelphia.",
            "Improve the app based on how people use it.",
            "Keep the community safe by investigating reports and enforcing our Community Guidelines.",
            "Communicate with you about COMMONS including updates and announcements.",
          ],
        },
        { type: "subhead", text: "We do not use your information to:" },
        {
          type: "ul",
          items: [
            "Sell advertising.",
            "Build profiles for third party marketing.",
            "Make automated decisions that significantly affect you.",
            "Use automated decision-making or profiling that produces legal or similarly significant effects.",
          ],
        },
      ],
    },
    {
      n: "4",
      title: "How We Share Your Information",
      blocks: [
        { type: "p", text: "We do not sell your personal data. Ever." },
        { type: "p", text: "We share your information only in these limited circumstances:" },
        {
          type: "p",
          text: "With other COMMONS users: Your first name, profile photo or avatar, neighborhood, interests, hosted plans, and joined plans are visible to other users on the app. Your phone number is never visible to other users.",
        },
        {
          type: "p",
          text: "With service providers: We work with a small number of trusted third party providers to operate COMMONS. These include:",
        },
        {
          type: "ul",
          items: [
            "Twilio — SMS verification and notifications.",
            "Railway / Vercel — app infrastructure and data storage.",
            "Sentry — bug tracking and app stability.",
            "Google Places API — venue search and location data.",
          ],
        },
        {
          type: "p",
          text: "All third party service providers are bound by data processing agreements and are prohibited from using your data for their own purposes. These providers access your data only to perform services for us and are contractually required to protect it.",
        },
        {
          type: "p",
          text: "For safety and legal reasons: We may share your information if we believe in good faith that disclosure is necessary to:",
        },
        {
          type: "ul",
          items: [
            "Comply with a legal obligation or court order.",
            "Protect the safety of any person.",
            "Prevent fraud or abuse.",
            "Protect the rights and property of COMMONS.",
          ],
        },
        {
          type: "p",
          text: "We will notify you of legal requests for your data where we are permitted to do so.",
        },
      ],
    },
    {
      n: "5",
      title: "Your Information and Other Users",
      blocks: [
        {
          type: "p",
          text: "When you join a plan, other participants can see your first name and profile photo in the group chat and going list. When you post a plan, your first name appears as the organizer.",
        },
        { type: "p", text: "Your phone number is never shared with other users." },
        {
          type: "p",
          text: "If you post a plan visible to everyone on COMMONS, anyone on the app can see it. If you post to your network only, it is visible only to people you have added to your network.",
        },
        {
          type: "p",
          text: "Past plans you have joined or hosted may remain visible to other users after you leave or delete your account, as they form part of the shared community record. Your personal information will be removed from these records upon account deletion.",
        },
      ],
    },
    {
      n: "6",
      title: "Location",
      blocks: [
        {
          type: "p",
          text: "We ask for your neighborhood during onboarding to show you relevant plans nearby. We use neighborhood-level location only — we do not track or store your precise GPS coordinates.",
        },
        {
          type: "p",
          text: "We never share your location with other users beyond the neighborhood you choose to display on your profile. We do not sell or share neighborhood-level location data with third parties for advertising or marketing purposes.",
        },
      ],
    },
    {
      n: "7",
      title: "Push Notifications and SMS",
      blocks: [
        {
          type: "p",
          text: "We send in-app notifications to keep you informed about your plans, your network, and what's happening in Philadelphia. You can manage your notification preferences at any time in Settings.",
        },
        {
          type: "p",
          text: "By providing your phone number and creating an account, you consent to receive SMS messages from COMMONS, including verification codes and plan reminders. Message and data rates may apply. Message frequency varies. You can opt out of SMS at any time by texting STOP to any message we send, or by updating your preferences in Settings. Text HELP for help. For more information see our Terms of Service.",
        },
      ],
    },
    {
      n: "8",
      title: "Data Retention",
      blocks: [
        { type: "p", text: "We keep your data for as long as your account is active. When you delete your account:" },
        {
          type: "ul",
          items: [
            "Your profile, plans, and messages are deleted within a reasonable period not to exceed 30 days.",
            "Some data may be retained longer where required by law or for legitimate safety purposes — for example, records of safety reports or account violations.",
            "Aggregate, anonymized data that cannot identify you may be retained indefinitely for product improvement purposes.",
          ],
        },
      ],
    },
    {
      n: "9",
      title: "Security",
      blocks: [
        {
          type: "p",
          text: "We take reasonable technical and organizational measures to protect your information from unauthorized access, loss, or misuse. These include encrypted data transmission, secure servers, and access controls.",
        },
        {
          type: "p",
          text: "No system is perfectly secure. If you believe your account has been compromised, contact us immediately at security@oncommons.co.",
        },
        {
          type: "p",
          text: "In the event of a data breach that affects your personal information, we will notify you as required by applicable law.",
        },
      ],
    },
    {
      n: "10",
      title: "Children",
      blocks: [
        {
          type: "p",
          text: "COMMONS is not intended for anyone under 18. We do not knowingly collect personal information from anyone under 18. If we become aware that a user is under 18, we will delete their account and data promptly.",
        },
        {
          type: "p",
          text: "If you believe a minor is using COMMONS, please contact us at safety@oncommons.co.",
        },
      ],
    },
    {
      n: "11",
      title: "Your Rights and Choices",
      blocks: [
        { type: "subhead", text: "You have the right to:" },
        {
          type: "ul",
          items: [
            "Access the personal information we hold about you.",
            "Correct inaccurate information through your profile settings.",
            "Delete your account and personal data through Settings.",
            "Opt out of non-essential communications through notification preferences.",
            "Request a copy of your data by contacting us at privacy@oncommons.co.",
          ],
        },
        { type: "p", text: "We will respond to all requests within 30 days." },
        {
          type: "p",
          text: "California residents: Under the California Consumer Privacy Act (CCPA), you have additional rights including the right to know what personal information we collect, the right to delete your personal information, and the right to opt out of the sale of your personal information. We do not sell personal information. You also have the right to non-discrimination for exercising your CCPA rights — we will not deny you services, charge you different prices, or provide a different quality of service because you exercised your rights under CCPA. To exercise your rights, contact us at privacy@oncommons.co.",
        },
        {
          type: "p",
          text: "Virginia, Colorado, and Connecticut residents: You may have additional rights under your state privacy laws, including the right to opt out of certain data processing. Contact us at privacy@oncommons.co to exercise these rights.",
        },
      ],
    },
    {
      n: "12",
      title: "Third Party Links and Services",
      blocks: [
        {
          type: "p",
          text: "COMMONS may contain links to third party websites or services — for example, venue websites or Google Maps. We are not responsible for the privacy practices of third parties. We encourage you to review their privacy policies before sharing any information with them.",
        },
      ],
    },
    {
      n: "13",
      title: "Changes to This Policy",
      blocks: [
        {
          type: "p",
          text: "We may update this Privacy Policy from time to time. If we make material changes, we will provide at least 14 days notice before the changes take effect through the app or by email. Your continued use of COMMONS after changes take effect means you accept the updated policy.",
        },
        { type: "p", text: "The date at the top of this page always reflects the most recent version." },
      ],
    },
    {
      n: "14",
      title: "Contact Us",
      blocks: [
        { type: "p", text: "Questions, requests, or concerns about your privacy:" },
        {
          type: "p",
          text: "On Commons LLC, 200 S. Broad Street, Philadelphia, Pennsylvania 19102. privacy@oncommons.co. www.oncommons.co",
        },
      ],
    },
  ],
};

export const TERMS_OF_SERVICE: LegalDocument = {
  slug: "terms",
  title: "Terms of Service",
  updated: "May 2026",
  intro: [],
  sections: [
    {
      n: "1",
      title: "About COMMONS",
      blocks: [
        {
          type: "p",
          text: 'COMMONS is a social planning app for women in Philadelphia. It lets you post plans, discover what\'s happening nearby, and connect with people through shared experiences. COMMONS is operated by On Commons LLC, a Pennsylvania company ("COMMONS," "we," "us," or "our").',
        },
        {
          type: "p",
          text: "By downloading, accessing, or using COMMONS, you agree to these Terms of Service. If you don't agree, don't use the app.",
        },
      ],
    },
    {
      n: "2",
      title: "Who Can Use COMMONS",
      blocks: [
        {
          type: "p",
          text: "COMMONS operates as a private membership community. Access is limited to members who identify as women. This restriction is consistent with our rights as a private organization and is integral to the safety and purpose of the platform.",
        },
        {
          type: "p",
          text: "By creating an account you confirm that you identify as a woman. We reserve the right to remove any account that we believe undermines the safety, culture, or intent of the COMMONS community. COMMONS reserves the right to determine, in its sole discretion, whether conduct constitutes a violation of this policy.",
        },
        {
          type: "p",
          text: "You must be at least 18 years old to use COMMONS. By creating an account, you confirm that you are 18 or older and that the information you provide is accurate and complete.",
        },
        {
          type: "p",
          text: "COMMONS is currently available by invitation only. Access requires either an invite code from an existing member or approval from COMMONS directly.",
        },
        {
          type: "p",
          text: "We reserve the right to refuse access or terminate accounts at our discretion, including for violations of these Terms or our Community Guidelines.",
        },
      ],
    },
    {
      n: "3",
      title: "Your Account",
      blocks: [
        {
          type: "p",
          text: "You are responsible for your account and everything that happens under it. Keep your login credentials secure. If you think your account has been compromised, contact us immediately at nishika@oncommons.co.",
        },
        {
          type: "p",
          text: "You may only create one account. Accounts are personal and non-transferable.",
        },
      ],
    },
    {
      n: "4",
      title: "Community Guidelines",
      blocks: [
        {
          type: "p",
          text: "By using COMMONS you agree to our Community Guidelines, which are incorporated into these Terms. The Guidelines require you to:",
        },
        {
          type: "ul",
          items: [
            "Show up kindly. No harassment, hate speech, bigotry, or discrimination of any kind.",
            "Keep it real. Your profile, plans, and photos must reflect the actual you. No impersonation.",
            "Show up when you say you will. If you can't make a plan, drop out early so others can take your spot.",
            "Look out for each other. Meet in public for first plans. Report anything that feels unsafe or off.",
            "Love the city. Respect venues, tip well, and leave places better than you found them.",
          ],
        },
        {
          type: "p",
          text: "Violations of the Community Guidelines may result in warnings, suspension, or permanent removal from COMMONS. COMMONS reserves the right to determine, in its sole discretion, whether conduct constitutes a violation of these Guidelines.",
        },
      ],
    },
    {
      n: "5",
      title: "Women-First Community Policy",
      blocks: [
        {
          type: "p",
          text: "COMMONS is built to be a space where women feel safe meeting new people and making plans in their city. We take this seriously.",
        },
        { type: "subhead", text: "We do not tolerate:" },
        {
          type: "ul",
          items: [
            "Any behavior that makes another user feel unsafe, targeted, or harassed.",
            "Joining the platform under false pretenses or with the intent to exploit or harm members, including misrepresenting your gender identity for the purpose of gaining access to the platform.",
            "Any conduct that undermines the women-first culture of COMMONS.",
          ],
        },
        {
          type: "p",
          text: "Violations of this policy will result in immediate removal. We reserve the right to report serious safety violations to law enforcement.",
        },
      ],
    },
    {
      n: "6",
      title: "Plans and Content",
      blocks: [
        {
          type: "p",
          text: "When you post a plan, write a description, or send a message on COMMONS, you own that content. By posting it, you give COMMONS a non-exclusive, royalty-free license to display, distribute, and promote it within the app and in our marketing materials (for example, sharing a plan on our Instagram). We will never sell your content to third parties. We do not use your content to train artificial intelligence or machine learning models.",
        },
        { type: "p", text: "You are responsible for the content you post. Do not post anything that:" },
        {
          type: "ul",
          items: [
            "Is false, misleading, or impersonates someone else.",
            "Is illegal, harmful, threatening, or abusive.",
            "Violates someone else's privacy or intellectual property.",
            "Is spam or commercial solicitation without our permission.",
          ],
        },
        {
          type: "p",
          text: "We reserve the right to remove any content that violates these Terms or that we determine is harmful to the community, without notice.",
        },
        { type: "p", text: "Your content belongs to you. See this Section for how we use it." },
      ],
    },
    {
      n: "7",
      title: "Plans Are Between Users",
      blocks: [
        {
          type: "p",
          text: "COMMONS is a technology platform that enables users to discover and coordinate plans. COMMONS does not organize, host, sponsor, or operate any plan posted by users, and is not a party to any agreement between users. When you choose to attend a plan, you do so voluntarily and entirely at your own risk.",
        },
        {
          type: "p",
          text: "COMMONS makes no representations about the identity, character, or intentions of other users. We strongly encourage you to meet in public places, share your plans with someone you trust, and report any concerns immediately.",
        },
        {
          type: "p",
          text: "TO THE MAXIMUM EXTENT PERMITTED BY LAW, COMMONS EXPRESSLY DISCLAIMS ALL LIABILITY FOR ANY INJURY, LOSS, DAMAGE, OR HARM ARISING FROM OR RELATED TO YOUR ATTENDANCE AT OR PARTICIPATION IN ANY PLAN, INCLUDING BUT NOT LIMITED TO PERSONAL INJURY, PROPERTY DAMAGE, EMOTIONAL DISTRESS, OR DEATH.",
        },
      ],
    },
    {
      n: "8",
      title: "Safety",
      blocks: [
        {
          type: "p",
          text: "Your safety matters to us. If you experience harassment, feel unsafe, or witness behavior that violates our Community Guidelines, please report it immediately through the app or at safety@oncommons.co.",
        },
        {
          type: "p",
          text: "We take safety reports seriously and will investigate promptly. We reserve the right to remove users who pose a safety risk to the community.",
        },
        {
          type: "p",
          text: "COMMONS does not conduct background checks on users and cannot verify the accuracy of any information users provide. You acknowledge that there are risks inherent in meeting strangers, and you assume full responsibility for taking appropriate precautions.",
        },
      ],
    },
    {
      n: "9",
      title: "Privacy",
      blocks: [
        {
          type: "p",
          text: "Your privacy matters. Our Privacy Policy explains how we collect, use, and protect your information. By using COMMONS, you agree to our Privacy Policy, which is incorporated into these Terms.",
        },
        {
          type: "p",
          text: "We will never sell your personal data to third parties. We use your information only to operate and improve COMMONS.",
        },
      ],
    },
    {
      n: "10",
      title: "Invite Codes",
      blocks: [
        {
          type: "p",
          text: "Invite codes are personal and non-transferable. You may not sell, trade, or commercially distribute invite codes. Invite codes have no monetary value and are not redeemable for cash or any other consideration. We reserve the right to revoke invite codes at any time and for any reason.",
        },
      ],
    },
    {
      n: "11",
      title: "Intellectual Property",
      blocks: [
        {
          type: "p",
          text: "COMMONS and everything in it — the name, logo, design, copy, and code — belong to us. You may not copy, reproduce, modify, or distribute any part of COMMONS without our written permission.",
        },
        { type: "p", text: "Your content belongs to you. See Section 6 for how we use it." },
      ],
    },
    {
      n: "12",
      title: "Termination",
      blocks: [
        {
          type: "p",
          text: "You can delete your account at any time through Settings. When you delete your account, your profile and personal data will be removed in accordance with our Privacy Policy.",
        },
        {
          type: "p",
          text: "We can suspend or terminate your account at any time if we believe you have violated these Terms, posed a safety risk, or for any other reason at our discretion. We will try to give you notice when possible, but are not required to.",
        },
        {
          type: "p",
          text: "Upon termination, your license to use COMMONS immediately ends. Sections 6, 7, 13, 14, 15, and 16 survive termination.",
        },
      ],
    },
    {
      n: "13",
      title: "Disclaimers",
      blocks: [
        {
          type: "p",
          text: 'COMMONS is provided "as is." We do our best to keep it running smoothly but we cannot guarantee it will always be available, error-free, or secure. We are not responsible for any loss or damage caused by your use of the app. COMMONS does not warrant that the app will be free of viruses or other harmful components.',
        },
        {
          type: "p",
          text: "To the fullest extent permitted by law, COMMONS disclaims all warranties, express or implied, including warranties of merchantability, fitness for a particular purpose, and non-infringement.",
        },
      ],
    },
    {
      n: "14",
      title: "Limitation of Liability",
      blocks: [
        {
          type: "p",
          text: "To the fullest extent permitted by law, COMMONS will not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the app or attendance at any plan, even if we have been advised of the possibility of such damages.",
        },
        {
          type: "p",
          text: "Our total liability to you for any claim arising from your use of COMMONS will not exceed the amount you have paid us in the twelve months preceding the claim, or $100, whichever is greater.",
        },
        {
          type: "p",
          text: "Some jurisdictions do not allow the exclusion of certain warranties or limitation of liability. In such jurisdictions, our liability is limited to the greatest extent permitted by law.",
        },
      ],
    },
    {
      n: "15",
      title: "Indemnification",
      blocks: [
        {
          type: "p",
          text: "You agree to defend, indemnify, and hold COMMONS harmless from any claims, damages, or expenses (including legal fees) arising from your use of the app, your content, or your violation of these Terms.",
        },
      ],
    },
    {
      n: "16",
      title: "Dispute Resolution",
      blocks: [
        {
          type: "p",
          text: "Before filing any legal claim, you agree to contact us at nishika@oncommons.co and give us 30 days to resolve the dispute informally. If we cannot resolve it informally, any dispute arising from these Terms or your use of COMMONS will be resolved through binding individual arbitration under the rules of the American Arbitration Association, except that either party may bring claims in small claims court if they qualify.",
        },
        {
          type: "p",
          text: "TO THE EXTENT PERMITTED BY LAW, YOU AND COMMONS EACH WAIVE ANY RIGHT TO A JURY TRIAL IN ANY ACTION ARISING FROM THESE TERMS OR YOUR USE OF THE APP.",
        },
        {
          type: "p",
          text: "You agree that any dispute resolution proceedings will be conducted on an individual basis and not in a class action or representative action.",
        },
      ],
    },
    {
      n: "17",
      title: "Governing Law",
      blocks: [
        {
          type: "p",
          text: "These Terms are governed by the laws of the Commonwealth of Pennsylvania, without regard to conflict of law principles. Any disputes not subject to arbitration will be resolved in the courts of Philadelphia County, Pennsylvania.",
        },
      ],
    },
    {
      n: "18",
      title: "Changes to These Terms",
      blocks: [
        {
          type: "p",
          text: "We may update these Terms from time to time. If we make material changes, we will provide at least 14 days notice before the changes take effect through the app or by email. Your continued use of COMMONS after changes take effect means you accept the new Terms.",
        },
      ],
    },
    {
      n: "19",
      title: "Contact",
      blocks: [
        { type: "p", text: "Questions about these Terms? Reach us at:" },
        {
          type: "p",
          text: "On Commons LLC, 200 S. Broad Street, Philadelphia PA 19102. nishika@oncommons.co. www.oncommons.co",
        },
      ],
    },
  ],
};

export const LEGAL_DOCS: Record<LegalDocument["slug"], LegalDocument> = {
  privacy: PRIVACY_POLICY,
  terms: TERMS_OF_SERVICE,
};
