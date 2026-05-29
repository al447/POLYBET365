const { Resend } = require('resend');

let resend = null;
const getClient = () => {
  if (!resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
};

const sendOtpEmail = async (email, code) => {
  const from = process.env.EMAIL_FROM || 'onboarding@resend.dev';
  const ttl = Number(process.env.OTP_TTL_MINUTES) || 10;

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0f1419;color:#e8eaed;border-radius:12px;">
    <h1 style="color:#4f6ef7;margin:0 0 16px;font-size:24px;">PolyBet365</h1>
    <p style="margin:0 0 24px;color:#9aa0a6;font-size:14px;">Your verification code:</p>
    <div style="background:#1a1f2e;border:1px solid #2a2f3e;border-radius:8px;padding:24px;text-align:center;margin-bottom:24px;">
      <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#fff;font-family:'SF Mono',Menlo,monospace;">${code}</span>
    </div>
    <p style="margin:0 0 8px;color:#9aa0a6;font-size:13px;">This code expires in ${ttl} minutes.</p>
    <p style="margin:0;color:#9aa0a6;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
  </div>`;

  try {
    const { data, error } = await getClient().emails.send({
      from: `PolyBet365 <${from}>`,
      to: [email],
      subject: 'Your PolyBet365 verification code',
      html,
      text: `Your PolyBet365 verification code is ${code}. It expires in ${ttl} minutes.`,
    });
    if (error) {
      console.error('[Email] Resend error:', error);
      throw new Error(error.message || 'Failed to send email');
    }
    return data;
  } catch (err) {
    console.error('[Email] Send failed:', err);
    throw err;
  }
};

module.exports = { sendOtpEmail };
