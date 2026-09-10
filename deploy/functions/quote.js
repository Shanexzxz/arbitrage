/**
 * Cloudflare Pages Function — Yahoo Finance Chart API proxy.
 *
 * Replaces the `/quote` route of server/proxy.js so the frontend keeps
 * working same-origin when hosted on Cloudflare Pages.
 *
 * GET /quote?symbol=000660.KS&interval=5m&range=1d
 */
export async function onRequestGet(context) {
    const { searchParams } = new URL(context.request.url);
    const symbol = searchParams.get('symbol');
    const interval = searchParams.get('interval') || '5m';
    const range = searchParams.get('range') || '1d';

    const json = (body, status = 200) =>
        new Response(JSON.stringify(body), {
            status,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-store',
            },
        });

    if (!symbol) {
        return json({ error: 'Missing symbol parameter' }, 400);
    }

    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
        `?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}&includePrePost=false`;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
                'Accept': 'application/json,text/plain,*/*',
            },
            cf: { cacheTtl: 30, cacheEverything: true },
        });

        if (!response.ok) {
            return json({ error: `Yahoo Finance returned ${response.status}`, symbol }, response.status);
        }

        return json(await response.json());
    } catch (error) {
        return json({ error: error.message, symbol }, 500);
    }
}
