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
  title: "COMMONS — Privacy Policy",
  updated: "July 2026",
  intro: [
    {
      type: "p",
      text: 'COMMONS is a social planning app operated by On Commons LLC, Philadelphia, Pennsylvania ("COMMONS," "we," "us"). This Policy explains how we collect, use, store, and protect your information across the COMMONS app, our website, and our events. COMMONS is intended for individuals who are physically located in and using the service in the United States, with an initial focus on Philadelphia, Pennsylvania. COMMONS does not offer the service in the EU, EEA, or UK, does not target individuals located there, and does not monitor individuals\' behavior in those jurisdictions. Questions: privacy@oncommons.co.',
    },
  ],
  sections: [
    {
      n: "1",
      title: "Scope",
      blocks: [
        {
          type: "p",
          text: "This Policy applies to information we collect through the app, website, and events. COMMONS does not offer service in, target, or monitor the behavior of individuals in the EU, EEA, or UK.",
        },
      ],
    },
    {
      n: "2",
      title: "Information We Collect",
      blocks: [
        { type: "subhead", text: "You give us directly:" },
        {
          type: "p",
          text: "phone number (sign-up verification and account security); name (displayed on profile); email address (account communication and notifications, if provided); neighborhood; interests; optional profile photo or avatar; plan content (titles, descriptions, dates, locations, anything you add); messages in plan group chats; invite codes (who you invited and whether they joined); and event registration information if you register for a COMMONS-hosted event (name, contact information, RSVP status), used to organize the event and communicate with attendees; community memberships and roles (communities you join or organize); community content you post (bulletin posts and community group chat messages); and, if a community organizer sets a membership question, your answer to that question.",
        },
        { type: "subhead", text: "We collect automatically:" },
        {
          type: "p",
          text: "device information (device type, OS, app version); usage data (plans viewed, joined, posted); neighborhood-level location only — we do not collect or store precise GPS location; log data (errors, timestamps, technical data); and cookies or similar technologies for sessions and performance.",
        },
        { type: "subhead", text: "From third parties:" },
        {
          type: "p",
          text: "if you were invited, we receive your phone number from the invite flow; we receive nothing from social media platforms.",
        },
        { type: "subhead", text: "Event photography:" },
        {
          type: "p",
          text: "COMMONS-hosted events may be photographed or recorded, and images may include you and be used in our marketing, per our Terms of Service; for marketing use that identifies you, we may request a separate written photo and video release at the event; to opt out, tell us at the event or email privacy@oncommons.co.",
        },
        {
          type: "p",
          text: "Where a COMMONS-hosted event is held at a third-party venue, our recording of the venue and its property is governed by a separate recording addendum with the venue.",
        },
        { type: "subhead", text: "We do not collect:" },
        {
          type: "p",
          text: "gender or sex, payment information (COMMONS is currently free), precise GPS location, data from third-party social accounts, or biometric information.",
        },
      ],
    },
    {
      n: "3",
      title: "How We Use Your Information",
      blocks: [
        {
          type: "p",
          text: "We use your information to create and manage your account; personalize your feed by neighborhood and interests; show you nearby plans; send notifications about plans, your network, and what's happening in Philadelphia; organize and run COMMONS-hosted events; improve the app; keep the community safe by investigating reports and enforcing our Community Guidelines; and communicate updates and announcements. We do not use your information to sell advertising, build profiles for third-party marketing, train AI or machine-learning models, or make automated decisions with legal or similarly significant effects.",
        },
      ],
    },
    {
      n: "4",
      title: "How We Share Your Information. We do not sell your personal data. Ever.",
      blocks: [
        { type: "p", text: "We share only as follows." },
        { type: "subhead", text: "With other users:" },
        {
          type: "p",
          text: "your name, profile photo or avatar, neighborhood, interests, hosted plans, and joined plans are visible on the app; your phone number and email are never visible to other users. Communities you join or organize are visible on your profile; your membership-question answer, if any, is visible to that community's organizer.",
        },
        { type: "subhead", text: "With service providers, who may access data only to perform services for us, are contractually required to protect it, and may not use it for their own purposes:" },
        {
          type: "p",
          text: "Twilio (SMS verification and texts); Railway (hosting and infrastructure); MongoDB Atlas (database hosting and storage); Google Cloud Storage (image hosting); Google Maps/Google Places (venue search and location features); Mailchimp (email); Sentry (error monitoring); DiceBear (avatar generation).",
        },
        { type: "subhead", text: "For legal reasons:" },
        {
          type: "p",
          text: "to comply with law, respond to lawful requests, enforce our Terms, or protect the rights, safety, and property of COMMONS and others.",
        },
        { type: "subhead", text: "In a business transfer:" },
        {
          type: "p",
          text: "if COMMONS is involved in a merger, acquisition, or sale of assets, subject to this Policy.",
        },
      ],
    },
    {
      n: "5",
      title: "What Other Users Can See",
      blocks: [
        {
          type: "p",
          text: "Your profile (name, photo, neighborhood, interests) and the plans you host or join are visible to other users in your neighborhood and to those on plans with you. Plan group chat messages are visible to members of that plan. When you join a community, your name and profile photo appear in its member list; bulletin posts and community chat messages are visible to that community's members; and plans posted as \"community only\" are visible only to that community's members. Your phone number and email are never shown to other users.",
        },
      ],
    },
    {
      n: "6",
      title: "Data Security",
      blocks: [
        {
          type: "p",
          text: "We use reasonable technical and organizational measures to protect your information, including encryption in transit and access controls. No system is perfectly secure, but we work to protect your data and will notify you of breaches as required by law. Contact security@oncommons.co with security concerns.",
        },
      ],
    },
    {
      n: "7",
      title: "Data Retention",
      blocks: [
        {
          type: "p",
          text: "We keep your information while your account is active. When you delete your account, we remove your personal information within 30 days, except where we must retain it for legal, safety, or dispute-resolution reasons. Backups are overwritten on a rolling cycle and fully cleared within 90 days.",
        },
      ],
    },
    {
      n: "8",
      title: "Your Choices",
      blocks: [
        {
          type: "p",
          text: "You can edit your profile, adjust notifications, and delete your account at any time in the app. To report a compromised account or a safety concern, contact safety@oncommons.co. You may request access to or deletion of your information by emailing privacy@oncommons.co, and we will respond as required by law.",
        },
      ],
    },
    {
      n: "9",
      title: "Children's Privacy",
      blocks: [
        {
          type: "p",
          text: "COMMONS is for adults 18 and older. We do not knowingly collect information from anyone under 18. If we learn we have, we will delete it.",
        },
      ],
    },
    {
      n: "10",
      title: "Your Privacy Rights",
      blocks: [
        {
          type: "p",
          text: "Depending on where you live, you may have additional rights. The CCPA may not currently apply to COMMONS; to the extent it does, California residents have the following rights under the CCPA: the right to know what personal information we collect and how we use it; the right to request deletion of personal information; and the right to opt out of the sale of personal information (note: we do not sell personal information). Residents of Virginia, Colorado, Connecticut, and other states with applicable privacy laws may have additional rights under those laws, including rights to access, correct, delete, or obtain a copy of personal information. To exercise any of these rights, email privacy@oncommons.co. Regardless of where you live, you can access and delete your information through the mechanisms described in Section 8.",
        },
      ],
    },
    {
      n: "11",
      title: "Do Not Track",
      blocks: [
        {
          type: "p",
          text: "COMMONS does not respond to browser \"Do Not Track\" signals.",
        },
      ],
    },
    {
      n: "12",
      title: "Changes to This Policy",
      blocks: [
        {
          type: "p",
          text: "We may update this Policy; material changes will be communicated via the app or email. Continued use after changes take effect constitutes acceptance. The date above reflects the current version.",
        },
      ],
    },
    {
      n: "13",
      title: "Contact",
      blocks: [
        {
          type: "p",
          text: "On Commons LLC, 200 S. Broad Street, Philadelphia, PA 19102, privacy@oncommons.co · www.oncommons.co.",
        },
      ],
    },
  ],
};

export const TERMS_OF_SERVICE: LegalDocument = {
  slug: "terms",
  title: "COMMONS — Terms of Service",
  updated: "July 2026",
  intro: [],
  sections: [
    {
      n: "1",
      title: "Acceptance of Terms",
      blocks: [
        {
          type: "p",
          text: 'By downloading, accessing, or using COMMONS ("the app"), operated by On Commons LLC ("COMMONS," "we," "us"), you agree to these Terms of Service and our Privacy Policy. If you don\'t agree, don\'t use the app. These Terms, the Privacy Policy, the Community Guidelines, and any Official COMMONS Event terms are the entire agreement between you and COMMONS.',
        },
      ],
    },
    {
      n: "2",
      title: "Eligibility",
      blocks: [
        {
          type: "p",
          text: "You must be 18 or older to use COMMONS. The app is built for women, and we market it to women, but eligibility and access are open to all adults regardless of sex, gender identity, or sexual orientation. Enforcement and account decisions are based on conduct, not identity — we do not make eligibility, enforcement, or removal decisions based on a person's sex, gender identity, or sexual orientation.",
        },
      ],
    },
    {
      n: "3",
      title: "Your Account",
      blocks: [
        {
          type: "p",
          text: "You're responsible for keeping your account secure and for activity under it. Provide accurate information and keep it current. Notify us at security@oncommons.co if you believe your account has been compromised. You may not impersonate others, create accounts for anyone under 18, or share your account.",
        },
      ],
    },
    {
      n: "4",
      title: "Community Conduct",
      blocks: [
        {
          type: "p",
          text: "You agree to act in good faith and follow our Community Guidelines. You may not harass, threaten, or abuse others; post false or misleading information; join plans in bad faith; or use the app to harm others. We may remove content, suspend, or remove members who violate these Terms or the Guidelines, in our sole discretion, acting in good faith. A removed member may request reconsideration at safety@oncommons.co; reinstatement is at our discretion and this is not a guaranteed appeal.",
        },
      ],
    },
    {
      n: "4a",
      title: "Communities",
      blocks: [
        {
          type: "p",
          text: "COMMONS may allow members to create and organize communities, subject to COMMONS approval. Community organizers are members acting on their own behalf and are not employees, agents, or representatives of COMMONS. Organizers may set a membership question and manage their communities, and must do so consistent with these Terms and the Community Guidelines; membership questions and organizer decisions must be based on conduct, interests, or logistics, and may not be used to exclude members based on sex, gender identity, sexual orientation, or any other characteristic protected by applicable law. COMMONS may review, approve, suspend, or remove any community, organizer, or community content at any time, in its sole discretion, acting in good faith.",
        },
      ],
    },
    {
      n: "5",
      title: "Plans and Events",
      blocks: [
        {
          type: "p",
          text: "COMMONS lets members organize and join plans. You participate at your own risk. COMMONS does not vet members beyond the measures described in our Privacy Policy and is not responsible for the conduct of members at plans or events, whether organized by members or by COMMONS.",
        },
      ],
    },
    {
      n: "6",
      title: "Official COMMONS Events",
      blocks: [
        {
          type: "p",
          text: "Some events are organized by COMMONS (\"Official COMMONS Events\"). These may have additional registration terms, and by attending you consent to the photography and recording terms provided at the event. To the fullest extent permitted by law, COMMONS is not liable for injuries, losses, or damages arising from event attendance, except for gross negligence or willful misconduct.",
        },
      ],
    },
    {
      n: "7",
      title: "Content and Licenses",
      blocks: [
        {
          type: "p",
          text: "You retain ownership of content you post. By posting, you grant COMMONS a worldwide, non-exclusive, royalty-free, sublicensable license to use, display, reproduce, and distribute your content in connection with operating and promoting the app. You waive moral rights to the extent permitted by law. If you don't want identifiable images of you used for marketing, contact privacy@oncommons.co.",
        },
      ],
    },
    {
      n: "8",
      title: "Prohibited Uses",
      blocks: [
        {
          type: "p",
          text: "You may not use the app for any unlawful purpose, to violate others' rights, to distribute malware, to scrape or harvest data, or to interfere with the app's operation.",
        },
      ],
    },
    {
      n: "9",
      title: "Third-Party Services",
      blocks: [
        {
          type: "p",
          text: "The app relies on third-party services and may link to third-party content. We're not responsible for third-party services or content.",
        },
      ],
    },
    {
      n: "10",
      title: "Intellectual Property; DMCA",
      blocks: [
        {
          type: "p",
          text: "COMMONS and its content (excluding user content) are owned by On Commons LLC and protected by law. We respect intellectual property rights and respond to valid DMCA notices. Send notices to our designated agent at dmca@oncommons.co; our agent is also registered with the U.S. Copyright Office DMCA Designated Agent Directory.",
        },
      ],
    },
    {
      n: "11",
      title: "Apple and Google Terms",
      blocks: [
        {
          type: "p",
          text: "If you download the app from the Apple App Store: these Terms are between you and COMMONS, not Apple. Apple has no obligation to provide support or maintenance for the app. Apple is not responsible for any product warranties or claims (product liability, legal/regulatory compliance, consumer protection). In the event of any third-party claim that the app infringes intellectual property rights, COMMONS, not Apple, is responsible. Apple and its subsidiaries are third-party beneficiaries of these Terms and may enforce them against you.",
        },
        {
          type: "p",
          text: "If you download the app from the Google Play Store: your use is also subject to the Google Play Terms of Service, and you acknowledge that Google is not responsible for the app or its content.",
        },
      ],
    },
    {
      n: "12",
      title: "Disclaimers",
      blocks: [
        {
          type: "p",
          text: "The app is provided \"as is\" and \"as available\" without warranties of any kind, express or implied, to the fullest extent permitted by law.",
        },
      ],
    },
    {
      n: "13",
      title: "Limitation of Liability",
      blocks: [
        {
          type: "p",
          text: "To the fullest extent permitted by law, COMMONS is not liable for indirect, incidental, special, consequential, or punitive damages, or for lost profits or data, arising from your use of the app — except for gross negligence or willful misconduct. Our total liability will not exceed the greater of the amount you paid us in the past twelve months or $100.",
        },
      ],
    },
    {
      n: "14",
      title: "Indemnification",
      blocks: [
        {
          type: "p",
          text: "You agree to indemnify and hold COMMONS harmless from third-party claims arising from your use of the app, your content, or your violation of these Terms or the rights of others, to the extent such claims arise from your negligent, knowing, or willful conduct.",
        },
      ],
    },
    {
      n: "15",
      title: "Dispute Resolution; Arbitration",
      blocks: [
        {
          type: "p",
          text: "Most disputes can be resolved informally — contact us first at legal@oncommons.co and we'll try to resolve it within 60 days. If we can't, you and COMMONS agree to resolve disputes through binding individual arbitration under the AAA Consumer Arbitration Rules and the AAA Mass Arbitration Supplementary Rules where applicable, in Philadelphia, PA. You may opt out of arbitration within 30 days of first accepting these Terms by emailing arbitration@oncommons.co. You and COMMONS waive the right to a jury trial and to participate in class actions. If the class-action waiver is found unenforceable, the arbitration provision is void as to that claim. This section does not prevent either party from seeking relief in small claims court.",
        },
      ],
    },
    {
      n: "16",
      title: "Changes to These Terms",
      blocks: [
        {
          type: "p",
          text: "We may update these Terms; for material changes we will give at least 14 days' notice via the app or email. For any material change to the arbitration agreement in Section 15, we will notify you by both email and in-app notification, and you will have a fresh 30-day period to opt out of the modified arbitration agreement by the method described in Section 15; if you do not opt out within that period the modified arbitration agreement applies, and if you do opt out the arbitration agreement in effect before the change continues to govern. Continued use after changes take effect constitutes acceptance. The date above reflects the current version.",
        },
      ],
    },
    {
      n: "17",
      title: "Miscellaneous",
      blocks: [
        {
          type: "p",
          text: "Entire agreement: these Terms, the Privacy Policy, the Community Guidelines, and any Official COMMONS Event terms are the entire agreement regarding the app and supersede prior agreements on that subject. Severability: invalid provisions are enforced to the maximum permissible extent and the remainder stays in effect. Assignment: you may not assign these Terms or your account without our written consent; we may assign without restriction, including in a merger, acquisition, reorganization, or asset sale. No waiver: failure to enforce any provision is not a waiver. Force majeure: we are not liable for delay or failure caused by events beyond our reasonable control, including acts of God, disasters, war, terrorism, labor disputes, governmental action, internet or utility failures, or third-party provider failures. Notices; electronic communications: you consent to receive communications electronically (app, push, SMS, email), which satisfy any writing requirement; legal notices to us must be sent to On Commons LLC, 200 S. Broad Street, Philadelphia, PA 19102, with a copy to legal@oncommons.co. Time limit: to the extent permitted by law, claims must be filed within one (1) year after arising or are permanently barred, except that this limitation does not apply to claims for personal injury or wrongful death or to any claim whose limitations period may not be shortened by agreement under applicable law. California users: under Cal. Civ. Code § 1789.3, you may contact the Complaint Assistance Unit, Division of Consumer Services, California Department of Consumer Affairs, 1625 North Market Blvd., Suite N 112, Sacramento, CA 95834; (800) 952-5210. Headings are for convenience only. Contact: On Commons LLC, 200 S. Broad Street, Philadelphia, PA 19102 · legal@oncommons.co",
        },
      ],
    },
  ],
};

export const LEGAL_DOCS: Record<LegalDocument["slug"], LegalDocument> = {
  privacy: PRIVACY_POLICY,
  terms: TERMS_OF_SERVICE,
};
