// Sends the permission link to the recipient automatically.
// Email: Gmail / any SMTP account (GMAIL_USER + GMAIL_APP_PASSWORD, or
// SMTP_*), or Resend. SMS: Twilio. Each channel is used only when its
// environment variables are set.

import nodemailer from "nodemailer";

export type ChannelResult = {
  channel: "email" | "sms";
  sent: boolean;
  detail: string;
};

function buildMessage(name: string, inviteUrl: string) {
  return {
    subject: "Location sharing request",
    text:
      `Hi ${name}, you have been asked to share your live location. ` +
      `Once you approve, your location will always be shown on the ` +
      `requester's live map until you press Stop Sharing. ` +
      `Open this link to agree or decline: ${inviteUrl}`,
    html:
      `<p>Hi ${escapeHtml(name)},</p>` +
      `<p>You have been asked to share your live location.</p>` +
      `<p><a href="${inviteUrl}">Open the permission page</a> to agree or decline.</p>` +
      `<p><b>Once you approve, your location will always be shown</b> on the requester's live map ` +
      `(updated every second while the page is open, last known location otherwise) ` +
      `until you press <b>Stop Sharing</b> on the same page.</p>`
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}

async function sendSmtp(
  to: string,
  name: string,
  inviteUrl: string
): Promise<ChannelResult | null> {
  const user = process.env.SMTP_USER || process.env.GMAIL_USER;
  const pass = process.env.SMTP_PASSWORD || process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) return null;

  const msg = buildMessage(name, inviteUrl);

  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 465),
      secure: Number(process.env.SMTP_PORT || 465) === 465,
      auth: { user, pass }
    });

    await transport.sendMail({
      from: process.env.SMTP_FROM || `Location Request <${user}>`,
      to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html
    });

    return { channel: "email", sent: true, detail: `Email sent to ${to}` };
  } catch (error) {
    console.error("SMTP error", error);
    return {
      channel: "email",
      sent: false,
      detail: "Email could not be sent (check Gmail app password)"
    };
  }
}

async function sendEmail(
  to: string,
  name: string,
  inviteUrl: string
): Promise<ChannelResult> {
  const smtp = await sendSmtp(to, name, inviteUrl);
  if (smtp) return smtp;

  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!key || !from) {
    return {
      channel: "email",
      sent: false,
      detail:
        "Email not set up yet: add GMAIL_USER and GMAIL_APP_PASSWORD in your hosting settings"
    };
  }

  const msg = buildMessage(name, inviteUrl);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: msg.subject,
        text: msg.text,
        html: msg.html
      })
    });

    if (!res.ok) {
      console.error("Resend error", res.status, await res.text());
      return { channel: "email", sent: false, detail: "Email could not be sent" };
    }

    return { channel: "email", sent: true, detail: `Email sent to ${to}` };
  } catch (error) {
    console.error(error);
    return { channel: "email", sent: false, detail: "Email could not be sent" };
  }
}

async function sendSms(
  to: string,
  name: string,
  inviteUrl: string
): Promise<ChannelResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!sid || !token || !from) {
    return { channel: "sms", sent: false, detail: "SMS not configured" };
  }

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization:
            "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          To: to,
          From: from,
          Body: buildMessage(name, inviteUrl).text
        })
      }
    );

    if (!res.ok) {
      console.error("Twilio error", res.status, await res.text());
      return { channel: "sms", sent: false, detail: "SMS could not be sent" };
    }

    return { channel: "sms", sent: true, detail: `SMS sent to ${to}` };
  } catch (error) {
    console.error(error);
    return { channel: "sms", sent: false, detail: "SMS could not be sent" };
  }
}

export async function sendInvite(opts: {
  name: string;
  phone: string;
  email: string;
  inviteUrl: string;
}) {
  return Promise.all([
    sendEmail(opts.email, opts.name, opts.inviteUrl),
    sendSms(opts.phone, opts.name, opts.inviteUrl)
  ]);
}

export function inviteMessageText(name: string, inviteUrl: string) {
  return buildMessage(name, inviteUrl).text;
}
