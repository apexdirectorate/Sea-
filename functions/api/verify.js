/**
 * Cloudflare Pages Function for Turnstile bot protection verification
 * Handles POST requests and validates Turnstile tokens server-side
 */

const TURNSTILE_SECRET = '0x4AAAAAAFNxTXac0nIiQoTgzgnrP1hcD4';
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

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

    // Validate token presence
    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing Turnstile token' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Prepare verification payload
    const verifyPayload = new URLSearchParams({
      secret: TURNSTILE_SECRET,
      response: token,
      remoteip: context.request.headers.get('cf-connecting-ip') || '0.0.0.0'
    });

    // POST to Cloudflare Turnstile verification endpoint
    const verifyResponse = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: verifyPayload.toString()
    });

    // Parse verification response
    const verifyResult = await verifyResponse.json();

    // Check verification result
    if (verifyResult.success) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Turnstile verification successful'
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store'
          }
        }
      );
    } else {
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
  } catch (error) {
    console.error('Turnstile verification error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Server error during verification'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
