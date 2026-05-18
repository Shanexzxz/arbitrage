// js/backtest-engine.js

/**
 * Run backtest with rebalance model.
 * Entry: when |premiumDiscount| >= threshold (divergence)
 * Exit: when |premiumDiscount| shrinks (reversion)
 * Profit = |entry premium| - |exit premium| - 2 * txCost
 *
 * @param {Array} data - Array of { time, premiumDiscount, ... }
 * @param {Object} params - { threshold, txCost, tradeAmount }
 * @returns {Object} { trades, signals }
 */
export function runBacktest(data, params) {
    const { threshold, txCost, tradeAmount } = params;
    const trades = [];
    let position = null;

    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const premium = row.premiumDiscount;

        if (premium === null || premium === undefined) continue;

        if (position === null) {
            // Check for divergence signal
            if (Math.abs(premium) >= threshold) {
                position = {
                    direction: premium > 0 ? 'sell_etf_buy_stock' : 'buy_etf_sell_stock',
                    entryIndex: i,
                    entryTime: row.time,
                    entryPremium: premium,
                };
            }
        } else {
            // Check for reversion: absolute premium shrinks or crosses zero
            const entryAbs = Math.abs(position.entryPremium);
            const currentAbs = Math.abs(premium);
            const crossedZero = (position.entryPremium > 0 && premium <= 0) ||
                                (position.entryPremium < 0 && premium >= 0);
            const isLastRow = i === data.length - 1;

            // Exit when premium reverts below entry or crosses zero
            if (currentAbs < entryAbs * 0.5 || crossedZero || isLastRow) {
                const rawProfit = entryAbs - currentAbs;
                const netProfit = rawProfit - (txCost * 2);
                const profitHKD = netProfit * (tradeAmount / 100);

                trades.push({
                    ...position,
                    exitIndex: i,
                    exitTime: row.time,
                    exitPremium: premium,
                    rawProfit,
                    netProfit,
                    profitHKD,
                    exitReason: isLastRow ? 'end_of_data' : (crossedZero ? 'cross_zero' : 'reversion'),
                });
                position = null;

                // Check if current point is also a new signal (opposite direction)
                if (!isLastRow && Math.abs(premium) >= threshold) {
                    position = {
                        direction: premium > 0 ? 'sell_etf_buy_stock' : 'buy_etf_sell_stock',
                        entryIndex: i,
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
 * Analyze data for dashboard metrics.
 * Splits data at 14:30 cutoff and computes divergence statistics.
 *
 * @param {Array} data - Array of { time, premiumDiscount }
 * @param {number} threshold - divergence threshold %
 * @returns {Object} dashboard metrics
 */
export function analyzeDivergence(data, threshold) {
    const CUTOFF = '14:30';

    const before = [];
    const after = [];

    for (const row of data) {
        if (row.premiumDiscount === null || row.premiumDiscount === undefined) continue;
        if (row.time && row.time > CUTOFF) {
            after.push(row);
        } else {
            before.push(row);
        }
    }

    const calcStats = (rows) => {
        if (rows.length === 0) return { maxPremium: 0, maxDiscount: 0, avgAbs: 0, signalCount: 0 };
        const premiums = rows.map(r => r.premiumDiscount);
        const maxPremium = Math.max(...premiums);
        const maxDiscount = Math.min(...premiums);
        const avgAbs = premiums.reduce((s, p) => s + Math.abs(p), 0) / premiums.length;
        const signalCount = premiums.filter(p => Math.abs(p) >= threshold).length;
        return { maxPremium, maxDiscount, avgAbs, signalCount };
    };

    const beforeStats = calcStats(before);
    const afterStats = calcStats(after);
    const allStats = calcStats(data.filter(r => r.premiumDiscount != null));

    return {
        before: { ...beforeStats, count: before.length },
        after: { ...afterStats, count: after.length },
        all: { ...allStats, count: data.length },
        cutoff: CUTOFF,
    };
}
