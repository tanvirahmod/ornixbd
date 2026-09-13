// Supabase Edge Function: imagekit-auth
// Generates a one-time ImageKit upload signature so the browser can upload
// directly to ImageKit WITHOUT exposing the private API key.
//
// The frontend calls this and receives:
//   { token, signature, expire, publicKey, folder, urlEndpoint }
//
// Docs: https://docs.imagekit.io/api-reference/upload-file-api/server-side-upload-api

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  // Handle CORS preflight for ALL requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const privateKey = Deno.env.get('IMAGEKIT_PRIVATE_KEY');
    const publicKey = Deno.env.get('IMAGEKIT_PUBLIC_KEY');
    const urlEndpoint = Deno.env.get('IMAGEKIT_URL_ENDPOINT');

    if (!privateKey || !publicKey || !urlEndpoint) {
      return new Response(
        JSON.stringify({ error: 'ImageKit is not configured. Set IMAGEKIT_PRIVATE_KEY, IMAGEKIT_PUBLIC_KEY and IMAGEKIT_URL_ENDPOINT in Edge Function secrets.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = crypto.randomUUID();
    const expire = Math.floor(Date.now() / 1000) + 60 * 30; // valid for 30 minutes

    // HMAC-SHA1 signature over "token + expire" using the private key
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(privateKey),
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(token + expire));
    const signature = hex(sig);

    return new Response(
      JSON.stringify({ token, signature, expire, publicKey, folder: '/', urlEndpoint }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
