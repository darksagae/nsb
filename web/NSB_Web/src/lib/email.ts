export async function sendResendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const resendFromEmail = process.env.RESEND_FROM_EMAIL?.trim() || 'info@nsbmotors.com';

  if (!resendApiKey) {
    return { ok: false, error: 'Email service not configured' };
  }

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: `NSB Motors Ug <${resendFromEmail}>`,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      ...(opts.text ? { text: opts.text } : {}),
    }),
  });

  if (!emailRes.ok) {
    const errText = await emailRes.text();
    let message = errText || 'Failed to send email';
    try {
      const parsed = JSON.parse(errText) as { message?: string };
      if (parsed.message) message = parsed.message;
    } catch {
      // keep raw text
    }
    return { ok: false, error: message };
  }

  return { ok: true };
}
