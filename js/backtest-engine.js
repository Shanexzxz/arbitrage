// js/backtest-engine.js

/**
 * Run backtest on normalized data with strategy parameters.
 *
 * @param {Array} data - Array of { time, inavChange, etfChange, premiumDiscount }
 * @param {Object} params - { openThreshold, closeThreshold, stopLoss, txCost }
 * @returns {Array} trades - Array of trade objects
 */
export function runBacktest(data, params) {
    const { openThreshold, closeThreshold, stopLoss, txCost } = params;
    const trades = [];
    let position = null; // current open position

    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const premium = row.premiumDiscount;

        if (premium === null || premium === undefined) continue;

        if (position === null) {
            // Check for entry signal
            if (premium >= openThreshold) {
                // ETF is expensive → sell ETF, buy stock
                position = {
                    direction: 'sell_etf_buy_stock',
                    entryIndex: i,
                    entryTime: row.time,
                    entryPremium: premium,
                };
            } else if (premium <= -openThreshold) {
                // ETF is cheap → buy ETF, sell stock
                position = {
                    direction: 'buy_etf_sell_stock',
                    entryIndex: i,
                    entryTime: row.time,
                    entryPremium: premium,
                };
            }
        } else {
            // Check for exit signal
            const entryPremium = position.entryPremium;
            const pnl = calculatePnL(position.direction, entryPremium, premium, txCost);
            const absPremium = Math.abs(premium);
            const isLastRow = i === data.length - 1;

            let exitReason = null;

            if (pnl <= -stopLoss) {
                exitReason = 'stop_loss';
            } else if (absPremium <= closeThreshold) {
                exitReason = 'mean_reversion';
            } else if (isLastRow) {
                exitReason = 'end_of_data';
            }

            if (exitReason) {
                trades.push({
                    ...position,
                    exitIndex: i,
                    exitTime: row.time,
                    exitPremium: premium,
                    pnl: pnl,
                    exitReason: exitReason,
                });
                position = null;
            }
        }
    }

    return trades;
}

/**
 * Calculate P&L for a trade.
 * When we sell ETF on premium: we profit as premium shrinks.
 * When we buy ETF on discount: we profit as discount shrinks.
 */
function calculatePnL(direction, entryPremium, exitPremium, txCost) {
    let raw;
    if (direction === 'sell_etf_buy_stock') {
        // Entered on premium, profit when premium decreases
        raw = entryPremium - exitPremium;
    } else {
        // Entered on discount (negative premium), profit when premium increases
        raw = exitPremium - entryPremium;
    }
    // Subtract round-trip transaction cost (2 × one-way)
    return raw - (txCost * 2);
}
