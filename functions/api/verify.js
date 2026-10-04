/**
 * Cloudflare Pages Function for Turnstile verification and Web3Forms email delivery
 * Handles contact form submissions with bot protection and email forwarding via Web3Forms
 */

const TURNSTILE_SECRET = '0x4AAAAAAFNxTXac0nIiQoTgzgnrP1hcD4';
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const WEB3FORMS_API_URL = 'https://api.web3forms.com/submit';
const WEB3FORMS_ACCESS_KEY = '71734b95-1c21-476e-aebb-5b83ff840ae1';
const RECIPIENT_EMAIL = 'apexdirectorate@gmail.com';

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
    console.log('Verifying Turnstile token...');
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
      console.error('Turnstile verification failed:', verifyResult['error-codes']);
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

    console.log('Turnstile verification successful. Sending email via Web3Forms...');

    // Step 2: Send email via Web3Forms after verification
    const emailSent = await sendViaWeb3Forms(name, email, message);

    if (!emailSent) {
      console.error('Web3Forms email delivery failed');
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

    console.log('Email sent successfully via Web3Forms');

    // Step 3: Return success
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Thank you! Your message has been sent successfully.'
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
 * Send email via Web3Forms
 * https://web3forms.com/documentation
 */
async function sendViaWeb3Forms(name, email, message) {
  try {
    const payload = {
      access_key: WEB3FORMS_ACCESS_KEY,
      name: name,
      email: email,
      message: message,
      subject: `New Contact Form Submission from ${name}`,
      from_name: 'Apex Directorate Contact Form',
      to_email: RECIPIENT_EMAIL
    };

    console.log('Sending to Web3Forms with payload:', { ...payload, access_key: '***' });

    const response = await fetch(WEB3FORMS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Web3Forms HTTP error:', response.status, errorText);
      return false;
    }

    const result = await response.json();
    console.log('Web3Forms response:', result);

    // Web3Forms returns success: true when email is sent
    if (result.success === true) {
      return true;
    }

    console.error('Web3Forms returned success: false', result);
    return false;
  } catch (error) {
    console.error('Web3Forms error:', error);
    return false;
  }
}
