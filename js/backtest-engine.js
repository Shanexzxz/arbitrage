// js/backtest-engine.js

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

const CUTOFF = '14:20';

/**
 * Run the **position-swap arbitrage** backtest (底仓换仓套利).
 *
 * Strategy model:
 *   - The trader is assumed to hold a large Hynix base position permanently
 *     (delta neutrality maintained across the swap).
 *   - When |premium| >= threshold, the trader **immediately swaps** a slice
 *     of the position:
 *       * Premium > 0 (ETF overvalued)  → 卖 ETF / 买 Hynix
 *       * Premium < 0 (ETF undervalued) → 买 ETF / 卖 Hynix（卖出部分底仓）
 *   - The swap **instantly locks in** `|premium| - swapCost` percent of profit.
 *     There is no exit / reversion / stop-loss concept: the post-swap delta
 *     stays neutral, so further price moves do not affect realized P&L.
 *
 * Hysteresis (滞回) to avoid over-trading:
 *   - Each direction (up / down) is independently "armed".
 *   - After a swap fires on direction D, D is disarmed until the premium
 *     comes back within `threshold * 0.5` of zero on that side.
 *   - This means: a slowly widening one-sided drift fires once, not 87 times.
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
            const premium = row.premiumDiscount;
            if (premium === null || premium === undefined) continue;

            // Re-arm whichever side has come back within the inner band.
            if (premium <  halfBand) armedUp = true;
            if (premium > -halfBand) armedDown = true;

            // Fire on the side that is both armed AND beyond threshold.
            const fireUp   = armedUp   && premium >=  threshold;
            const fireDown = armedDown && premium <= -threshold;
            if (!fireUp && !fireDown) continue;

            const direction = fireUp ? 'sell_etf_buy_stock' : 'buy_etf_sell_stock';
            const rawProfit = Math.abs(premium);        // locked-in gross %
            const netProfit = rawProfit - swapCost;     // after the round-trip swap cost
            const profitHKD = netProfit * (tradeAmount / 100);

            swaps.push({
                date,
                direction,
                swapIndex: globalIndex,
                swapTime: row.time,
                premium,
                rawProfit,
                netProfit,
                profitHKD,
                swapCost,
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
