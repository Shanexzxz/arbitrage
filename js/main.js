// js/main.js

import { renderTable, renderBaseline, addRow, deleteLastRow, clearAll, parseData, validateData } from './data-input.js';
import { runBacktest } from './backtest-engine.js';
import { calculateStatistics } from './statistics.js';
import { renderCharts, destroyCharts } from './charts.js';
import { generateConclusion } from './conclusion.js';

function getCurrentMode() {
    const checked = document.querySelector('input[name="input-mode"]:checked');
    return checked ? checked.value : 'inav';
}

function getParams() {
    return {
        openThreshold: parseFloat(document.getElementById('open-threshold').value) || 1.5,
        closeThreshold: parseFloat(document.getElementById('close-threshold').value) || 0.3,
        stopLoss: parseFloat(document.getElementById('stop-loss').value) || 3.0,
        txCost: parseFloat(document.getElementById('tx-cost').value) || 0.2,
        positionSize: parseFloat(document.getElementById('position-size').value) || 100000,
    };
}

function init() {
    const container = document.getElementById('data-table-container');
    const baselineContainer = document.getElementById('baseline-inputs');
    const mode = getCurrentMode();

    // Initial render
    renderBaseline(baselineContainer, mode);
    renderTable(container, mode);

    // Mode switch
    document.querySelectorAll('input[name="input-mode"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const newMode = getCurrentMode();
            renderBaseline(baselineContainer, newMode);
            renderTable(container, newMode);
        });
    });

    // Table action buttons
    document.getElementById('add-row-btn').addEventListener('click', () => {
        addRow(getCurrentMode());
    });

    document.getElementById('delete-row-btn').addEventListener('click', () => {
        deleteLastRow();
    });

    document.getElementById('clear-all-btn').addEventListener('click', () => {
        if (confirm('确认清空所有数据？')) {
            clearAll(getCurrentMode());
        }
    });

    // Collapse toggle
    const toggle = document.querySelector('.collapse-toggle');
    const content = document.getElementById('guide-content');
    toggle.addEventListener('click', () => {
        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', !expanded);
        toggle.textContent = expanded ? '指标计算说明 ▶' : '指标计算说明 ▼';
        content.classList.toggle('hidden');
    });

    // Run backtest button
    document.getElementById('run-backtest-btn').addEventListener('click', () => {
        executeBacktest();
    });
}

function executeBacktest() {
    const mode = getCurrentMode();
    const data = parseData(mode);

    if (data.length === 0) {
        alert('请先输入数据（至少需要一行有效数据）');
        return;
    }

    const errors = validateData(data, mode);
    if (errors.length > 0) {
        alert('数据校验失败:\n' + errors.join('\n'));
        return;
    }

    const params = getParams();

    // Run engine
    const trades = runBacktest(data, params);

    // Calculate statistics
    const stats = calculateStatistics(trades);

    // Show results section
    const resultsSection = document.getElementById('backtest-results');
    resultsSection.classList.remove('hidden');

    // Render stats panel
    renderStatsPanel(stats);

    // Render charts
    destroyCharts();
    renderCharts(data, trades);

    // Render trade log
    renderTradeLog(trades);

    // Generate and show conclusion
    const conclusion = generateConclusion(stats);
    renderConclusion(conclusion);
}

function renderStatsPanel(stats) {
    const panel = document.getElementById('stats-panel');
    const items = [
        { label: '总收益率', value: `${stats.totalReturn.toFixed(2)}%` },
        { label: '最大回撤', value: `${stats.maxDrawdown.toFixed(2)}%` },
        { label: '胜率', value: `${stats.winRate.toFixed(1)}%` },
        { label: '盈亏比', value: stats.profitLossRatio.toFixed(2) },
        { label: '夏普比率', value: stats.sharpeRatio.toFixed(2) },
        { label: '交易次数', value: stats.totalTrades },
    ];

    panel.innerHTML = items.map(item => `
        <div class="stat-card">
            <div class="value">${item.value}</div>
            <div class="label">${item.label}</div>
        </div>
    `).join('');
}

function renderTradeLog(trades) {
    const container = document.getElementById('trade-log-container');

    if (trades.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#64748b;">无交易记录</p>';
        return;
    }

    const rows = trades.map((t, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${t.entryTime || t.entryIndex}</td>
            <td>${t.exitTime || t.exitIndex}</td>
            <td>${t.direction === 'sell_etf_buy_stock' ? '卖ETF/买股票' : '买ETF/卖股票'}</td>
            <td>${t.entryPremium.toFixed(2)}%</td>
            <td>${t.exitPremium.toFixed(2)}%</td>
            <td style="color:${t.pnl >= 0 ? '#16a34a' : '#dc2626'}">${t.pnl.toFixed(2)}%</td>
            <td>${formatExitReason(t.exitReason)}</td>
        </tr>
    `).join('');

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>开仓时间</th>
                    <th>平仓时间</th>
                    <th>方向</th>
                    <th>开仓溢价率</th>
                    <th>平仓溢价率</th>
                    <th>盈亏</th>
                    <th>退出原因</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function formatExitReason(reason) {
    const map = {
        'mean_reversion': '均值回归',
        'stop_loss': '止损',
        'end_of_data': '数据结束',
    };
    return map[reason] || reason;
}

function renderConclusion(conclusion) {
    const section = document.getElementById('conclusion');
    section.classList.remove('hidden');

    // Traffic light
    const lightContainer = document.getElementById('traffic-light');
    lightContainer.innerHTML = `
        <span class="light red ${conclusion.light === 'red' ? 'active' : ''}"></span>
        <span class="light yellow ${conclusion.light === 'yellow' ? 'active' : ''}"></span>
        <span class="light green ${conclusion.light === 'green' ? 'active' : ''}"></span>
    `;

    // Conclusion text
    const textContainer = document.getElementById('conclusion-text');
    textContainer.innerHTML = `
        <h3>判定结果</h3>
        <p><strong>${conclusion.verdict}</strong></p>

        <h3>风险提示</h3>
        <ul>${conclusion.risks.map(r => `<li>${r}</li>`).join('')}</ul>

        <h3>优化建议</h3>
        <p>${conclusion.suggestion}</p>
    `;
}

document.addEventListener('DOMContentLoaded', init);
