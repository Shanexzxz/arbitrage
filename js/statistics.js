// js/statistics.js

/**
 * Calculate backtest performance statistics.
 *
 * @param {Array} trades - Array of { pnl, ... }
 * @returns {Object} stats
 */
export function calculateStatistics(trades) {
    if (trades.length === 0) {
        return {
            totalTrades: 0,
            winCount: 0,
            lossCount: 0,
            winRate: 0,
            totalReturn: 0,
            maxDrawdown: 0,
            profitLossRatio: 0,
            sharpeRatio: 0,
            avgWin: 0,
            avgLoss: 0,
        };
    }

    const pnls = trades.map(t => t.pnl);
    const totalTrades = trades.length;
    const wins = pnls.filter(p => p > 0);
    const losses = pnls.filter(p => p <= 0);
    const winCount = wins.length;
    const lossCount = losses.length;
    const winRate = (winCount / totalTrades) * 100;
    const totalReturn = pnls.reduce((sum, p) => sum + p, 0);

    // Average win / loss
    const avgWin = wins.length > 0 ? wins.reduce((s, p) => s + p, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, p) => s + p, 0) / losses.length) : 0;
    const profitLossRatio = avgLoss > 0 ? avgWin / avgLoss : (avgWin > 0 ? 99 : 0);

    // Max drawdown (from cumulative P&L curve)
    const maxDrawdown = calculateMaxDrawdown(pnls);

    // Sharpe ratio (simplified: mean / std of per-trade returns)
    const sharpeRatio = calculateSharpe(pnls);

    return {
        totalTrades,
        winCount,
        lossCount,
        winRate,
        totalReturn,
        maxDrawdown,
        profitLossRatio,
        sharpeRatio,
        avgWin,
        avgLoss,
    };
}

function calculateMaxDrawdown(pnls) {
    let cumulative = 0;
    let peak = 0;
    let maxDD = 0;

    for (const pnl of pnls) {
        cumulative += pnl;
        if (cumulative > peak) {
            peak = cumulative;
        }
        const drawdown = peak - cumulative;
        if (drawdown > maxDD) {
            maxDD = drawdown;
        }
    }

    return maxDD;
}

/**
 * Simplified Sharpe Ratio (non-annualized, zero risk-free rate).
 * Formula: mean(per-trade returns) / std(per-trade returns)
 *
 * Interpretation:
 *   > 2.0: 优秀（每单位波动获得2倍以上收益）
 *   > 1.0: 良好
 *   0.5~1.0: 一般
 *   < 0.5: 较差（收益不稳定）
 *
 * Note: 未年化处理，因日内套利持仓时间不固定；无风险利率视为0。
 */
function calculateSharpe(pnls) {
    const n = pnls.length;
    if (n < 2) return 0;

    const mean = pnls.reduce((s, p) => s + p, 0) / n;
    const variance = pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / (n - 1);
    const std = Math.sqrt(variance);

    if (std === 0) return mean > 0 ? 99 : 0;
    return mean / std;
}
