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

const CUTOFF = '14:30';

/**
 * Run backtest with the rebalance model, day by day.
 * Positions never carry across days: if still open at the last row of a day,
 * exit there with reason 'end_of_day'. The very last row of the whole dataset
 * uses 'end_of_data' to preserve previous semantics.
 *
 * Each trade carries a `date` field so downstream code can group trades by day.
 *
 * @param {Array} data
 * @param {Object} params - { threshold, txCost, tradeAmount }
 * @returns {Array}
 */
export function runBacktest(data, params) {
    const { threshold, txCost, tradeAmount } = params;
    const trades = [];
    const groups = groupByDate(data);
    const totalLastIndex = data.length - 1;

    for (const { date, rows, startIndex } of groups) {
        let position = null;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const globalIndex = startIndex + i;
            const premium = row.premiumDiscount;
            if (premium === null || premium === undefined) continue;

            if (position === null) {
                if (Math.abs(premium) >= threshold) {
                    position = {
                        date,
                        direction: premium > 0 ? 'sell_etf_buy_stock' : 'buy_etf_sell_stock',
                        entryIndex: globalIndex,
                        entryTime: row.time,
                        entryPremium: premium,
                    };
                }
                continue;
            }

            const entryAbs = Math.abs(position.entryPremium);
            const currentAbs = Math.abs(premium);
            const crossedZero = (position.entryPremium > 0 && premium <= 0) ||
                                (position.entryPremium < 0 && premium >= 0);
            const isLastRowOfDay = i === rows.length - 1;
            const isLastRowOverall = globalIndex === totalLastIndex;

            if (currentAbs < entryAbs * 0.5 || crossedZero || isLastRowOfDay) {
                const rawProfit = entryAbs - currentAbs;
                const netProfit = rawProfit - (txCost * 2);
                const profitHKD = netProfit * (tradeAmount / 100);

                let exitReason;
                if (crossedZero) exitReason = 'cross_zero';
                else if (currentAbs < entryAbs * 0.5) exitReason = 'reversion';
                else if (isLastRowOverall) exitReason = 'end_of_data';
                else exitReason = 'end_of_day';

                trades.push({
                    ...position,
                    exitIndex: globalIndex,
                    exitTime: row.time,
                    exitPremium: premium,
                    rawProfit,
                    netProfit,
                    profitHKD,
                    exitReason,
                });
                position = null;

                // Mid-day reversal: open opposite side immediately if still beyond threshold.
                if (!isLastRowOfDay && Math.abs(premium) >= threshold) {
                    position = {
                        date,
                        direction: premium > 0 ? 'sell_etf_buy_stock' : 'buy_etf_sell_stock',
                        entryIndex: globalIndex,
                        entryTime: row.time,
                        entryPremium: premium,
                    };
                }
            }
        }
    }

    return trades;
}

/**
 * Analyze divergence stats overall and split by the daily 14:30 cutoff.
 * Multi-day aware: each day's rows are split independently before being
 * merged into `before` / `after` aggregate buckets.
 *
 * Returns:
 *   - all:    overall stats { maxPremium, maxDiscount, avgAbs, signalCount, count }
 *   - before: rows with row.time <= '14:30' from every day
 *   - after:  rows with row.time >  '14:30' from every day
 *   - byDate: array of per-day summaries (count, signalCount, maxPremium, maxDiscount, avgAbs)
 *   - cutoff: the cutoff string ('14:30')
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
 * that are the first row strictly after 14:30 within each day.
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
