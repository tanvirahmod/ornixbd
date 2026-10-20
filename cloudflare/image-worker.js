const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;
const CACHE_CONTROL = `public, max-age=${CACHE_TTL_SECONDS}, immutable`;

function formatBucket(accept) {
  if (accept.includes('image/avif')) return 'avif';
  if (accept.includes('image/webp')) return 'webp';
  return 'other';
}

function responseWithCacheStatus(response, cacheStatus, headOnly = false) {
  const headers = new Headers(response.headers);
  headers.set('X-Image-Cache', cacheStatus);
  return new Response(headOnly ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', {
        status: 405,
        headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' },
      });
    }

    const requestUrl = new URL(request.url);
    if (requestUrl.pathname === '/') {
      return new Response('Image not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }

    const transformations = requestUrl.searchParams.getAll('tr');
    const unexpectedParams = [...requestUrl.searchParams.keys()].some((key) => key !== 'tr');
    if (
      unexpectedParams ||
      transformations.length > 1 ||
      (transformations.length === 1 && !/^w-(?:[1-9]\d{0,3}),f-auto,q-75$/.test(transformations[0])) ||
      (transformations.length === 1 && Number(transformations[0].match(/^w-(\d+)/)?.[1]) > 2048)
    ) {
      return new Response('Unsupported image transformation', {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const accept = request.headers.get('Accept') ?? '*/*';
    const cacheUrl = new URL(requestUrl);
    if (transformations.length === 1) {
      cacheUrl.searchParams.set('__image_format', formatBucket(accept));
    }
    const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
    const cached = await caches.default.match(cacheKey);
    if (cached) {
      return responseWithCacheStatus(cached, 'HIT', request.method === 'HEAD');
    }

    const endpoint = env.IMAGEKIT_ENDPOINT;
    if (!endpoint || !/^[a-zA-Z0-9_-]+$/.test(endpoint)) {
      console.error('IMAGEKIT_ENDPOINT is missing or invalid.');
      return new Response('Image service is not configured', {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const originUrl = new URL(`https://ik.imagekit.io/${endpoint}${requestUrl.pathname}${requestUrl.search}`);
    let origin;
    try {
      origin = await fetch(originUrl.toString(), {
        headers: { Accept: accept },
      });
    } catch (error) {
      console.error('ImageKit request failed:', error);
      return new Response('Image service is temporarily unavailable', {
        status: 502,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const headers = new Headers(origin.headers);
    headers.delete('Set-Cookie');
    headers.set('Access-Control-Allow-Origin', '*');
    const isImage = origin.status === 200 && (headers.get('Content-Type') ?? '').startsWith('image/');
    if (!isImage) {
      headers.set('Cache-Control', 'no-store');
      return responseWithCacheStatus(new Response(origin.body, {
        status: origin.status,
        statusText: origin.statusText,
        headers,
      }), 'BYPASS', request.method === 'HEAD');
    }

    headers.set('Cache-Control', CACHE_CONTROL);
    const cacheable = new Response(origin.body, {
      status: origin.status,
      statusText: origin.statusText,
      headers,
    });
    ctx.waitUntil(
      caches.default.put(cacheKey, cacheable.clone()).catch((error) => {
        console.error('Could not store image in Cloudflare cache:', error);
      }),
    );
    return responseWithCacheStatus(cacheable, 'MISS', request.method === 'HEAD');
  },
};
