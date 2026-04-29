export async function sendMagicLinkEmail(email: string, link: string): Promise<void> {
  if (process.env.SMTP_HOST) {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          }
        : undefined,
    });

    await transporter.sendMail({
      from: process.env.MAIL_FROM ?? "commons@example.com",
      to: email,
      subject: "Your Commons login link",
      text: `Sign in to Commons: ${link}`,
    });
    return;
  }

  // Local dev fallback when SMTP isn't configured.
  console.log(`[magic-link] ${email}: ${link}`);
}
