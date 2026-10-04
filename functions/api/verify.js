/**
 * Cloudflare Pages Function for Turnstile verification and email delivery
 * Handles contact form submissions with bot protection and email forwarding
 */

const TURNSTILE_SECRET = '0x4AAAAAAFNxTXac0nIiQoTgzgnrP1hcD4';
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const RECIPIENT_EMAIL = 'apexdirectorate@gmail.com';

// Use environment variables for API keys
// Set these in your Cloudflare Pages project settings:
// - RESEND_API_KEY (for Resend)
// - or SENDGRID_API_KEY (for SendGrid)
// - or WEB3FORMS_ACCESS_KEY (for Web3Forms)

export async function onRequest(context) {
  // Only accept POST requests
  if (context.request.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Allow': 'POST'
        }
      }
    );
  }

  try {
    // Parse request body
    const body = await context.request.json();
    const token = body['cf-turnstile-response'];
    const name = body.name?.trim();
    const email = body.email?.trim();
    const message = body.message?.trim();

    // Validate required fields
    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing Turnstile token' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    if (!name || !email || !message) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: name, email, message' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid email address' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Step 1: Verify Turnstile token
    const verifyPayload = new URLSearchParams({
      secret: TURNSTILE_SECRET,
      response: token,
      remoteip: context.request.headers.get('cf-connecting-ip') || '0.0.0.0'
    });

    const verifyResponse = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: verifyPayload.toString()
    });

    const verifyResult = await verifyResponse.json();

    if (!verifyResult.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid Turnstile token',
          details: verifyResult['error-codes']
        }),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store'
          }
        }
      );
    }

    // Step 2: Send email after verification
    const emailSent = await sendContactEmail(name, email, message, context.env);

    if (!emailSent) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to send email. Please try again later.'
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store'
          }
        }
      );
    }

    // Step 3: Return success
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Contact form received. Email will be sent shortly.'
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store'
        }
      }
    );
  } catch (error) {
    console.error('Contact form error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Server error during processing'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * Send email using available service
 * Tries Resend first, then SendGrid, then Web3Forms
 */
async function sendContactEmail(name, email, message, env) {
  try {
    // Try Resend first (recommended)
    if (env.RESEND_API_KEY) {
      return await sendViaResend(name, email, message, env.RESEND_API_KEY);
    }

    // Try SendGrid second
    if (env.SENDGRID_API_KEY) {
      return await sendViaSendGrid(name, email, message, env.SENDGRID_API_KEY);
    }

    // Try Web3Forms third
    if (env.WEB3FORMS_ACCESS_KEY) {
      return await sendViaWeb3Forms(name, email, message, env.WEB3FORMS_ACCESS_KEY);
    }

    // If no email service is configured, log and return error
    console.error('No email service configured. Set RESEND_API_KEY, SENDGRID_API_KEY, or WEB3FORMS_ACCESS_KEY');
    return false;
  } catch (error) {
    console.error('Email sending error:', error);
    return false;
  }
}

/**
 * Send email via Resend
 * https://resend.com/docs/api-reference/emails/send
 */
async function sendViaResend(name, email, message, apiKey) {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'noreply@apexdirectorate.com',
        to: RECIPIENT_EMAIL,
        subject: `New Contact Form Submission from ${name}`,
        html: `
          <h2>New Contact Form Submission</h2>
          <p><strong>Name:</strong> ${escapeHtml(name)}</p>
          <p><strong>Email:</strong> ${escapeHtml(email)}</p>
          <p><strong>Message:</strong></p>
          <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
          <hr>
          <p style="color: #666; font-size: 12px;">Submitted via Apex Directorate contact form</p>
        `,
        reply_to: email
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Resend API error:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Resend error:', error);
    return false;
  }
}

/**
 * Send email via SendGrid
 * https://docs.sendgrid.com/api-reference/mail-send/mail-send
 */
async function sendViaSendGrid(name, email, message, apiKey) {
  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: RECIPIENT_EMAIL }],
            subject: `New Contact Form Submission from ${name}`
          }
        ],
        from: {
          email: 'noreply@apexdirectorate.com',
          name: 'Apex Directorate'
        },
        reply_to: {
          email: email,
          name: name
        },
        content: [
          {
            type: 'text/html',
            value: `
              <h2>New Contact Form Submission</h2>
              <p><strong>Name:</strong> ${escapeHtml(name)}</p>
              <p><strong>Email:</strong> ${escapeHtml(email)}</p>
              <p><strong>Message:</strong></p>
              <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
              <hr>
              <p style="color: #666; font-size: 12px;">Submitted via Apex Directorate contact form</p>
            `
          }
        ]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('SendGrid API error:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('SendGrid error:', error);
    return false;
  }
}

/**
 * Send email via Web3Forms
 * https://web3forms.com/documentation
 */
async function sendViaWeb3Forms(name, email, message, accessKey) {
  try {
    const response = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        access_key: accessKey,
        name: name,
        email: email,
        message: message,
        from_name: 'Apex Directorate Contact Form',
        subject: `New Contact Form Submission from ${name}`,
        redirect: false
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Web3Forms API error:', error);
      return false;
    }

    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error('Web3Forms error:', error);
    return false;
  }
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}
