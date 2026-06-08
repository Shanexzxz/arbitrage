// js/conclusion.js

/**
 * Generate a feasibility conclusion for the position-swap arbitrage strategy.
 *
 * Unlike statistical strategies (which need win-rate / drawdown / sharpe),
 * a swap strategy that locks in profit at trigger time only needs to answer:
 *
 *   1. Are there enough opportunities to make this worthwhile?
 *      → frequency-per-day
 *
 *   2. Is the average opportunity big enough to comfortably cover swap cost?
 *      → margin = (avgGross − swapCost) / swapCost
 *
 * @param {Object} stats   from calculateStatistics — uses totalTrades + avgWin
 * @param {Object} extra   { dayCount, swapCost }
 * @returns {Object} { light, verdict, risks, suggestion }
 */
export function generateConclusion(stats, extra = {}) {
    const { totalTrades, totalReturn, avgWin } = stats;
    const dayCount = Math.max(1, extra.dayCount || 1);
    const swapCost = extra.swapCost != null ? extra.swapCost : 0;

    if (totalTrades === 0) {
        return {
            light: 'red',
            verdict: '当前数据 / 阈值组合下未触发任何换仓机会，策略无法运转。',
            risks: ['无可吃的偏离 — 阈值过高或市场处于平静期'],
            suggestion: '尝试降低背离阈值（例如 1.5%）或扩大回测时间范围以验证机会密度。',
        };
    }

    // Locked-in metrics (per swap, in %)
    const avgNet = avgWin;                            // already net of swapCost
    const avgGross = avgNet + swapCost;               // |premium| at trigger
    const freqPerDay = totalTrades / dayCount;
    const marginRatio = swapCost > 0 ? avgNet / swapCost : Infinity;

    const light = determineLight(freqPerDay, marginRatio, avgNet);
    const verdict = generateVerdict(light, {
        totalTrades, totalReturn, dayCount, freqPerDay,
        avgGross, avgNet, marginRatio, swapCost,
    });
    const risks = identifyRisks({ freqPerDay, avgNet, marginRatio, totalTrades, dayCount });
    const suggestion = generateSuggestion(light, { freqPerDay, marginRatio, avgNet });

    return { light, verdict, risks, suggestion };
}

function determineLight(freqPerDay, marginRatio, avgNet) {
    // 红：根本不赚钱（净利 ≤ 0）
    if (avgNet <= 0) return 'red';
    // 绿：每天 ≥ 1 次机会 且 净利至少等于成本本身（marginRatio ≥ 1）
    if (freqPerDay >= 1 && marginRatio >= 1) return 'green';
    return 'yellow';
}

function generateVerdict(light, m) {
    const head = `共 ${m.totalTrades} 次换仓，覆盖 ${m.dayCount} 天（约每天 ${m.freqPerDay.toFixed(1)} 次）。`
        + ` 平均触发偏离 ${m.avgGross.toFixed(2)}%，扣 ${m.swapCost.toFixed(2)}% 换仓成本后，单笔平均锁定 ${m.avgNet.toFixed(2)}%；`
        + ` 累计 ${m.totalReturn.toFixed(2)}%。`;

    if (light === 'green') {
        return `策略可行。${head}` +
            ` 安全边际 ${m.marginRatio.toFixed(1)}× 成本，机会密度健康，建议小仓位实盘验证滑点与执行延迟。`;
    }
    if (light === 'yellow') {
        if (m.freqPerDay < 1) {
            return `策略勉强可行。${head}` +
                ` 平均每天换仓 < 1 次，机会偏稀；可考虑略降阈值或扩大数据窗口以判断稳定性。`;
        }
        return `策略勉强可行。${head}` +
            ` 安全边际仅 ${m.marginRatio.toFixed(1)}× 成本，单点滑点 / 执行延迟可能侵蚀利润。`;
    }
    return `不建议执行。${head}` +
        ` 平均锁定收益 ≤ 0，说明换仓成本未被偏离覆盖，应提高阈值或寻找更高波动期数据。`;
}

function identifyRisks(m) {
    const risks = [];

    if (m.totalTrades < 5) {
        risks.push(`样本仅 ${m.totalTrades} 笔，结论的统计置信度有限`);
    }
    if (m.dayCount < 3) {
        risks.push('回测覆盖天数 < 3，单日行情不能代表常态');
    }
    if (m.freqPerDay < 1) {
        risks.push(`日均换仓 ${m.freqPerDay.toFixed(2)} 次，机会密度偏稀，资金利用率低`);
    }
    if (m.marginRatio < 1) {
        risks.push(`平均净利 ${m.avgNet.toFixed(2)}% 仅相当于 ${m.marginRatio.toFixed(1)}× 成本，对滑点敏感`);
    }

    // Always-relevant structural risks
    risks.push('换仓的两条腿（ETF 与 Hynix）必须接近同时成交，跨市场执行延迟会侵蚀价差');
    risks.push('回测用每分钟首笔快照价；实盘成交价可能差几个基点（滑点）');
    risks.push('策略假设 Hynix 底仓充足，且每笔换仓不超过底仓上限（本工具不强制校验）');

    return risks;
}

function generateSuggestion(light, m) {
    if (light === 'green') {
        return '建议以小仓位实盘 1–2 周，重点观察实际成交价与回测快照价的偏差，校准 swapCost 参数。';
    }
    if (light === 'yellow') {
        if (m.freqPerDay < 1) {
            return '机会过稀。可适当降低背离阈值 0.3~0.5 个百分点，或扩大回测窗口到 ≥ 5 天再判断。';
        }
        return '安全边际偏窄。可提高阈值（如 +0.5%）以筛掉边缘信号，或确认实际换仓成本是否更低。';
    }
    return '当前参数下没有套利空间。建议提高阈值以筛出更显著的偏离机会，或检查 swapCost 输入是否高估。';
}
