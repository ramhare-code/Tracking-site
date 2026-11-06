// Sends the permission link to the recipient automatically.
// Email uses Resend, SMS uses Twilio. Each channel is optional:
// it is only used when its environment variables are set.

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
      `Open this link to agree or decline: ${inviteUrl}`,
    html:
      `<p>Hi ${escapeHtml(name)},</p>` +
      `<p>You have been asked to share your live location.</p>` +
      `<p><a href="${inviteUrl}">Open the permission page</a> to agree or decline.</p>` +
      `<p>You can stop sharing at any time from the same page.</p>`
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}

async function sendEmail(
  to: string,
  name: string,
  inviteUrl: string
): Promise<ChannelResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!key || !from) {
    return { channel: "email", sent: false, detail: "Email not configured" };
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
