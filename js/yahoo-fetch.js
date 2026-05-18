// js/yahoo-fetch.js

const PROXY_BASE = 'http://localhost:3001';

/**
 * Fetch chart data from Yahoo Finance via local proxy.
 * @param {string} symbol - e.g. '000660.KS', 'KRWHKD=X'
 * @param {string} interval - e.g. '5m', '1m', '15m'
 * @param {string} range - e.g. '1d', '5d'
 * @returns {Object} { previousClose, timestamps, prices }
 */
export async function fetchQuote(symbol, interval = '5m', range = '1d') {
    const url = `${PROXY_BASE}/quote?symbol=${encodeURIComponent(symbol)}&interval=${interval}&range=${range}`;
    const response = await fetch(url);

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Failed to fetch ${symbol}: ${response.status}`);
    }

    const data = await response.json();
    const result = data.chart.result[0];
    const meta = result.meta;
    const timestamps = result.timestamp || [];
    const closes = result.indicators.quote[0].close || [];

    return {
        symbol: meta.symbol,
        currency: meta.currency,
        previousClose: meta.chartPreviousClose || meta.previousClose,
        regularMarketPrice: meta.regularMarketPrice,
        timestamps,
        prices: closes,
    };
}

/**
 * Fetch all required data based on mode and tickers.
 * @param {Object} tickers - { etf, inav?, hynix?, fx? }
 * @param {string} mode - 'inav' or 'no-inav'
 * @returns {Object} { baseline, rows }
 */
export async function fetchAllData(tickers, mode) {
    if (mode === 'inav') {
        // Fetch iNAV proxy (ETF's NAV ticker) and ETF market price
        const [inavData, etfData] = await Promise.all([
            fetchQuote(tickers.inav),
            fetchQuote(tickers.etf),
        ]);

        const baseline = {
            baseInavPrice: inavData.previousClose,
            baseEtfPrice: etfData.previousClose,
        };

        // Merge timestamps — use ETF's timestamps as primary
        const rows = buildRows(etfData.timestamps, {
            inavPrice: inavData.prices,
            etfPrice: etfData.prices,
        });

        return { baseline, rows };
    } else {
        // Mode B: Fetch Hynix, FX rate, and ETF
        const [hynixData, fxData, etfData] = await Promise.all([
            fetchQuote(tickers.hynix),
            fetchQuote(tickers.fx),
            fetchQuote(tickers.etf),
        ]);

        const baseline = {
            baseHynixPrice: hynixData.previousClose,
            baseFxRate: fxData.previousClose,
            baseEtfPrice: etfData.previousClose,
        };

        // Use Hynix timestamps as primary (Korean market opens first)
        const rows = buildRows(hynixData.timestamps, {
            hynixPrice: hynixData.prices,
            fxPrice: fxData.prices,
            etfPrice: etfData.prices,
        });

        return { baseline, rows };
    }
}

/**
 * Build table rows from timestamps and price arrays.
 * Filters out null values and formats timestamps as HH:MM.
 */
function buildRows(timestamps, priceArrays) {
    const rows = [];
    const keys = Object.keys(priceArrays);

    for (let i = 0; i < timestamps.length; i++) {
        // Skip if any price is null/undefined
        const hasNull = keys.some(k => priceArrays[k][i] == null);
        if (hasNull) continue;

        const date = new Date(timestamps[i] * 1000);
        const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

        const row = { time };
        for (const key of keys) {
            row[key] = priceArrays[key][i];
        }
        rows.push(row);
    }

    return rows;
}
