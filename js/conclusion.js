// js/conclusion.js

/**
 * Generate feasibility conclusion from statistics.
 *
 * @param {Object} stats - from calculateStatistics
 * @returns {Object} { light, verdict, risks, suggestion }
 */
export function generateConclusion(stats) {
    const { sharpeRatio, winRate, maxDrawdown, totalReturn, totalTrades, profitLossRatio } = stats;

    if (totalTrades === 0) {
        return {
            light: 'red',
            verdict: '无交易信号触发。当前参数下无套利机会，建议降低开仓阈值或检查数据覆盖时段。',
            risks: ['数据量不足或阈值过高'],
            suggestion: '尝试将开仓阈值降低 0.5% 重新回测。',
        };
    }

    // Determine traffic light
    const light = determineLight(sharpeRatio, winRate, maxDrawdown);

    // Generate verdict
    const verdict = generateVerdict(light, stats);

    // Identify risks
    const risks = identifyRisks(stats);

    // Generate suggestion
    const suggestion = generateSuggestion(light, stats);

    return { light, verdict, risks, suggestion };
}

function determineLight(sharpeRatio, winRate, maxDrawdown) {
    // Red conditions (any one triggers)
    if (sharpeRatio < 0.5 || maxDrawdown > 20) {
        return 'red';
    }
    // Green conditions (all must be met)
    if (sharpeRatio > 1.5 && winRate > 60 && maxDrawdown < 10) {
        return 'green';
    }
    // Otherwise yellow
    return 'yellow';
}

function generateVerdict(light, stats) {
    const { totalReturn, totalTrades, winRate, sharpeRatio, maxDrawdown } = stats;

    if (light === 'green') {
        return `策略可行。共 ${totalTrades} 笔交易，胜率 ${winRate.toFixed(1)}%，累计收益 ${totalReturn.toFixed(2)}%，夏普比率 ${sharpeRatio.toFixed(2)}，最大回撤 ${maxDrawdown.toFixed(2)}%。策略表现优异，建议实盘验证。`;
    }
    if (light === 'yellow') {
        return `策略需谨慎评估。共 ${totalTrades} 笔交易，胜率 ${winRate.toFixed(1)}%，累计收益 ${totalReturn.toFixed(2)}%，夏普比率 ${sharpeRatio.toFixed(2)}，最大回撤 ${maxDrawdown.toFixed(2)}%。策略有盈利潜力但风险收益比一般，建议优化参数后再评估。`;
    }
    return `不建议执行该策略。共 ${totalTrades} 笔交易，胜率 ${winRate.toFixed(1)}%，累计收益 ${totalReturn.toFixed(2)}%，夏普比率 ${sharpeRatio.toFixed(2)}，最大回撤 ${maxDrawdown.toFixed(2)}%。当前参数下策略风险过高或收益不足。`;
}

function identifyRisks(stats) {
    const risks = [];
    const { maxDrawdown, winRate, totalTrades, profitLossRatio, sharpeRatio } = stats;

    if (maxDrawdown > 15) risks.push(`最大回撤达 ${maxDrawdown.toFixed(1)}%，资金风险较高`);
    if (maxDrawdown > 10 && maxDrawdown <= 15) risks.push(`最大回撤 ${maxDrawdown.toFixed(1)}%，需注意仓位控制`);
    if (winRate < 50) risks.push(`胜率仅 ${winRate.toFixed(1)}%，低于50%，需靠大盈利覆盖频繁小亏损`);
    if (totalTrades < 5) risks.push('交易样本过少，统计结果不够可靠');
    if (profitLossRatio < 1) risks.push('盈亏比 < 1，平均亏损大于平均盈利');
    if (sharpeRatio < 1) risks.push('夏普比率偏低（<1），单笔收益波动大');

    // Always mention structural risks
    risks.push('杠杆ETF存在每日复利衰减，长期持仓需注意');
    risks.push('跨市场执行存在时间差和汇率波动风险');

    return risks;
}

function generateSuggestion(light, stats) {
    const { winRate, maxDrawdown, totalTrades } = stats;

    if (light === 'green') {
        return '建议以小仓位实盘验证1-2周，确认滑点和执行延迟对策略的实际影响。';
    }
    if (light === 'yellow') {
        if (maxDrawdown > 10) return '建议提高开仓阈值以减少回撤，或缩小单笔仓位。';
        if (winRate < 55) return '建议调整平仓阈值，尝试更宽松的止盈条件提升胜率。';
        return '建议微调参数并增加回测数据量以验证稳定性。';
    }
    if (totalTrades < 3) return '数据样本不足，建议扩大回测时间范围。';
    return '当前参数组合不适合实盘，建议重新评估策略假设或更换阈值。';
}
