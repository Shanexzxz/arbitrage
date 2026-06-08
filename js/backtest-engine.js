// js/backtest-engine.js

import { TICK_SIZE } from './data-input.js';

/**
 * Group an array of normalized rows by their `date` field.
 * Rows with no date land together under the synthetic key '__single__'.
 * Within each group the original order is preserved.
 *
 * @param {Array} data - rows with optional `date` field
 * @returns {Array<{date: string, rows: Array, startIndex: number}>}
 *   `startIndex` is the offset of this day's first row in the original `data`,
 *   so callers can map per-day indices back to the global timeline (used by
 *   chart entry/exit markers).
 */
function groupByDate(data) {
    const groups = new Map();
    data.forEach((row, idx) => {
        const key = row.date || '__single__';
        if (!groups.has(key)) groups.set(key, { date: key, rows: [], startIndex: idx });
        groups.get(key).rows.push(row);
    });
    return [...groups.values()];
}

// 14:20 KST = main-board (KP) entering 收盘集合竞价. After this point, the
// ONLY thing that changes about the iNAV formula is that KP no longer prints
// (LOCF freezes it automatically inside data-input.resolveDay). The CUTOFF
// constant is kept purely to slice the divergence statistics into morning vs
// afternoon buckets — it does NOT branch the iNAV computation any more.
const CUTOFF = '14:20';

/**
 * Pick the executable premium for a given trigger direction.
 *
 *   - direction = 'sell_etf_buy_stock'  → fills at Bid (use premiumBid)
 *   - direction = 'buy_etf_sell_stock'  → fills at Ask (use premiumAsk)
 *   - missing Bid/Ask → falls back to premiumLast
 *
 * Returns the (signed) premium in %, ready to be compared against ±threshold.
 */
function executablePremium(row, direction) {
    if (direction === 'sell_etf_buy_stock') {
        return row.premiumBid != null ? row.premiumBid : row.premiumLast;
    }
    return row.premiumAsk != null ? row.premiumAsk : row.premiumLast;
}

/**
 * Run the **position-swap arbitrage** backtest (底仓换仓套利).
 *
 * Strategy model:
 *   - The trader is assumed to hold a large Hynix base position permanently
 *     (delta neutrality maintained across the swap).
 *   - When |premium| >= threshold, the trader **immediately swaps** a slice
 *     of the position:
 *       * Premium > 0 (ETF overvalued)  → 卖 ETF / 买 Hynix       (fills at Bid)
 *       * Premium < 0 (ETF undervalued) → 买 ETF / 卖 Hynix底仓    (fills at Ask)
 *   - The swap **instantly locks in** `|premium_executable| - swapCost` percent.
 *     There is no exit / reversion / stop-loss concept: the post-swap delta
 *     stays neutral, so further price moves do not affect realized P&L.
 *
 * Multiple reference prices:
 *   - The signal-side check still uses `premiumLast` (the visible quote) to
 *     decide whether the threshold was breached at all.
 *   - The locked-in profit, however, uses the **executable** side: Bid for a
 *     sell-ETF swap, Ask for a buy-ETF swap. When Bid/Ask data is absent we
 *     transparently fall back to Last so legacy datasets keep working.
 *
 * Hysteresis (滞回) to avoid over-trading:
 *   - Each direction (up / down) is independently "armed".
 *   - After a swap fires on direction D, D is disarmed until the premium
 *     comes back within `threshold * 0.5` of zero on that side.
 *
 * Day boundary:
 *   - The two arm flags reset at the start of each new day.
 *
 * @param {Array} data
 * @param {Object} params - { threshold, swapCost, tradeAmount }
 *     swapCost: total cost per swap in % (covers both legs: sell one, buy the
 *               other). The legacy `txCost` field is still accepted for
 *               backward compatibility and is treated as swapCost.
 * @returns {Array<Object>} swaps
 */
export function runBacktest(data, params) {
    const { threshold, tradeAmount } = params;
    const swapCost = params.swapCost != null ? params.swapCost : (params.txCost || 0);

    const swaps = [];
    const groups = groupByDate(data);

    const halfBand = threshold * 0.5;

    for (const { date, rows, startIndex } of groups) {
        // Independent arm flags so opposite-side swaps don't block each other.
        let armedUp = true;     // ready to fire on premium >= +threshold
        let armedDown = true;   // ready to fire on premium <= -threshold

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const globalIndex = startIndex + i;
            const premiumLast = row.premiumLast != null ? row.premiumLast : row.premiumDiscount;
            if (premiumLast == null) continue;

            // Re-arm on the visible (Last-based) premium.
            if (premiumLast <  halfBand) armedUp = true;
            if (premiumLast > -halfBand) armedDown = true;

            const fireUp   = armedUp   && premiumLast >=  threshold;
            const fireDown = armedDown && premiumLast <= -threshold;
            if (!fireUp && !fireDown) continue;

            const direction = fireUp ? 'sell_etf_buy_stock' : 'buy_etf_sell_stock';

            // Use the executable side for actual locked-in profit.
            const premiumExec = executablePremium(row, direction);
            const rawProfit = Math.abs(premiumExec);             // gross %
            const netProfit = rawProfit - swapCost;
            const profitHKD = netProfit * (tradeAmount / 100);

            // Tick conversion (informational): how many HKD ticks the spread
            // represents at current Theo. Useful for sanity-checking that the
            // signal is bigger than micro-structure noise.
            const theo = row.theoInav || row.inavPrice;
            const spreadTicks = theo ? (Math.abs(premiumExec) / 100) * theo / TICK_SIZE : null;

            swaps.push({
                date,
                direction,
                swapIndex: globalIndex,
                swapTime: row.time,
                premium: premiumLast,        // legacy field (Last-based)
                premiumExec,                 // executable-side
                rawProfit,
                netProfit,
                profitHKD,
                swapCost,
                spreadTicks,
                bias: row.bias,
                refSide: (row.premiumBid != null && fireUp) ? 'bid'
                       : (row.premiumAsk != null && fireDown) ? 'ask'
                       : 'last',
            });

            if (fireUp)   armedUp   = false;
            if (fireDown) armedDown = false;
        }
    }

    return swaps;
}

/**
 * Analyze divergence stats overall and split by the daily 14:20 cutoff.
 * Multi-day aware: each day's rows are split independently before being
 * merged into `before` / `after` aggregate buckets.
 *
 * Returns:
 *   - all:    overall stats { maxPremium, maxDiscount, avgAbs, signalCount, count }
 *   - before: rows with row.time <= '14:20' from every day
 *   - after:  rows with row.time >  '14:20' from every day
 *   - byDate: array of per-day summaries (count, signalCount, maxPremium, maxDiscount, avgAbs)
 *   - cutoff: the cutoff string ('14:20')
 *
 * @param {Array} data
 * @param {number} threshold
 * @returns {Object}
 */
export function analyzeDivergence(data, threshold) {
    const before = [];
    const after = [];
    const groups = groupByDate(data);
    const byDate = [];

    for (const { date, rows } of groups) {
        const dayBefore = [];
        const dayAfter = [];
        for (const row of rows) {
            if (row.premiumDiscount === null || row.premiumDiscount === undefined) continue;
            if (row.time && row.time > CUTOFF) {
                dayAfter.push(row);
                after.push(row);
            } else {
                dayBefore.push(row);
                before.push(row);
            }
        }
        const dayAll = [...dayBefore, ...dayAfter];
        byDate.push({
            date,
            count: dayAll.length,
            ...calcStats(dayAll, threshold),
        });
    }

    const beforeStats = calcStats(before, threshold);
    const afterStats = calcStats(after, threshold);
    const allStats = calcStats(data.filter(r => r.premiumDiscount != null), threshold);

    return {
        before: { ...beforeStats, count: before.length },
        after: { ...afterStats, count: after.length },
        all: { ...allStats, count: data.length },
        byDate,
        cutoff: CUTOFF,
    };
}

function calcStats(rows, threshold) {
    if (rows.length === 0) return { maxPremium: 0, maxDiscount: 0, avgAbs: 0, signalCount: 0 };
    const premiums = rows.map(r => r.premiumDiscount);
    const maxPremium = Math.max(...premiums);
    const maxDiscount = Math.min(...premiums);
    const avgAbs = premiums.reduce((s, p) => s + Math.abs(p), 0) / premiums.length;
    const signalCount = premiums.filter(p => Math.abs(p) >= threshold).length;
    return { maxPremium, maxDiscount, avgAbs, signalCount };
}

/**
 * Find the global indices where each new day starts, plus the global indices
 * that are the first row strictly after 14:20 within each day.
 * Used by chart renderers to draw per-day cutoff and day-divider lines.
 *
 * @param {Array} data
 * @returns {{ dayBoundaries: number[], cutoffIndices: number[] }}
 */
export function findChartMarkers(data) {
    const dayBoundaries = [];
    const cutoffIndices = [];
    const groups = groupByDate(data);
    for (const { rows, startIndex } of groups) {
        if (startIndex > 0) dayBoundaries.push(startIndex);
        const cutoffOffset = rows.findIndex(r => r.time && r.time > CUTOFF);
        if (cutoffOffset > 0) cutoffIndices.push(startIndex + cutoffOffset);
    }
    return { dayBoundaries, cutoffIndices };
}
