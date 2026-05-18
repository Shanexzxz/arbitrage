// js/main.js

import { renderTable, renderBaseline, addRow, deleteLastRow, clearAll, parseData, validateData } from './data-input.js';
import { runBacktest } from './backtest-engine.js';
import { calculateStatistics } from './statistics.js';
import { renderCharts, destroyCharts } from './charts.js';
import { generateConclusion } from './conclusion.js';
import { fetchAllData } from './yahoo-fetch.js';

function getCurrentMode() {
    const checked = document.querySelector('input[name="input-mode"]:checked');
    return checked ? checked.value : 'inav';
}

function getCurrentDataSource() {
    const checked = document.querySelector('input[name="data-source"]:checked');
    return checked ? checked.value : 'api';
}

function toggleDataSource(source) {
    const apiSection = document.getElementById('api-section');
    const manualSection = document.getElementById('manual-section');
    const tableSection = document.getElementById('data-table-section');

    if (source === 'api') {
        apiSection.classList.remove('hidden');
        manualSection.classList.add('hidden');
        // Hide table until data is fetched
        tableSection.classList.add('hidden');
    } else {
        apiSection.classList.add('hidden');
        manualSection.classList.remove('hidden');
        tableSection.classList.remove('hidden');
    }
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
    const source = getCurrentDataSource();

    // Initial render
    renderTickerInputs(mode);
    renderBaseline(baselineContainer, mode);
    renderTable(container, mode);
    toggleDataSource(source);
    updateHints();

    // Data source switch (API vs Manual)
    document.querySelectorAll('input[name="data-source"]').forEach(radio => {
        radio.addEventListener('change', () => {
            toggleDataSource(getCurrentDataSource());
            updateHints();
            setFetchStatus('');
        });
    });

    // Calculation mode switch
    document.querySelectorAll('input[name="input-mode"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const newMode = getCurrentMode();
            renderTickerInputs(newMode);
            renderBaseline(baselineContainer, newMode);
            renderTable(container, newMode);
            updateHints();
            setFetchStatus('');
        });
    });

    // Fetch data button
    document.getElementById('fetch-data-btn').addEventListener('click', () => {
        handleFetchData();
    });

    // Data source provider switch (Yahoo / Alpha Vantage / etc.)
    document.getElementById('data-source-provider').addEventListener('change', (e) => {
        const tokenInput = document.getElementById('api-token');
        if (e.target.value === 'yahoo') {
            tokenInput.classList.add('hidden');
        } else {
            tokenInput.classList.remove('hidden');
        }
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

    // Collapse toggle (smooth animation)
    const toggle = document.querySelector('.collapse-toggle');
    const content = document.getElementById('guide-content');
    if (toggle && content) {
        toggle.addEventListener('click', () => {
            const expanded = toggle.getAttribute('aria-expanded') === 'true';
            toggle.setAttribute('aria-expanded', !expanded);
            content.classList.toggle('open');
        });
    }

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
        { label: '总收益率', value: `${stats.totalReturn.toFixed(2)}%`, hint: '所有交易盈亏之和' },
        { label: '最大回撤', value: `${stats.maxDrawdown.toFixed(2)}%`, hint: '从累计收益峰值到谷值的最大跌幅' },
        { label: '胜率', value: `${stats.winRate.toFixed(1)}%`, hint: '盈利交易数 / 总交易数' },
        { label: '盈亏比', value: stats.profitLossRatio.toFixed(2), hint: '平均盈利 / 平均亏损，>1表示赚多亏少' },
        { label: '夏普比率', value: stats.sharpeRatio.toFixed(2), hint: '每承担1单位风险获得的超额收益，>1.5为优秀' },
        { label: '交易次数', value: stats.totalTrades, hint: '回测期间触发的套利交易总数' },
    ];

    panel.innerHTML = items.map(item => `
        <div class="stat-card">
            <div class="value">${item.value}</div>
            <div class="label">${item.label}</div>
            <div class="stat-hint">${item.hint}</div>
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

// ===== Yahoo Finance Ticker Config =====

const TICKER_FIELDS_INAV = [
    { key: 'etf', label: 'ETF代码（港股）', placeholder: '7709.HK', defaultValue: '7709.HK' },
    { key: 'hynix', label: '海力士股票代码', placeholder: '000660.KS', defaultValue: '000660.KS' },
];

const TICKER_FIELDS_NO_INAV = [
    { key: 'etf', label: 'ETF代码（港股）', placeholder: '7709.HK', defaultValue: '7709.HK' },
    { key: 'hynix', label: '海力士股票代码', placeholder: '000660.KS', defaultValue: '000660.KS' },
    { key: 'fx', label: '汇率', placeholder: 'KRWHKD=X', defaultValue: 'KRWHKD=X' },
];

function renderTickerInputs(mode) {
    const container = document.getElementById('ticker-inputs');
    const fields = mode === 'inav' ? TICKER_FIELDS_INAV : TICKER_FIELDS_NO_INAV;

    container.innerHTML = fields.map(f => `
        <div class="ticker-item">
            <label for="ticker-${f.key}">${f.label}</label>
            <input type="text" id="ticker-${f.key}" placeholder="${f.placeholder}" value="${f.defaultValue}">
        </div>
    `).join('');
}

function getTickerValues(mode) {
    const fields = mode === 'inav' ? TICKER_FIELDS_INAV : TICKER_FIELDS_NO_INAV;
    const tickers = {};
    for (const f of fields) {
        const input = document.getElementById(`ticker-${f.key}`);
        tickers[f.key] = input ? input.value.trim() : '';
    }
    return tickers;
}

function setFetchStatus(text, type = '') {
    const el = document.getElementById('fetch-status');
    el.textContent = text;
    el.className = 'fetch-status ' + type;
}

async function handleFetchData() {
    const mode = getCurrentMode();
    const tickers = getTickerValues(mode);
    const provider = document.getElementById('data-source-provider').value;

    // Validate tickers
    const requiredKeys = mode === 'inav' ? ['etf', 'hynix'] : ['etf', 'hynix', 'fx'];
    const emptyFields = requiredKeys.filter(k => !tickers[k]);
    if (emptyFields.length > 0) {
        setFetchStatus('请填写所有代码', 'error');
        return;
    }

    // Check provider + mode compatibility
    if (mode === 'inav' && provider === 'yahoo') {
        setFetchStatus('Yahoo Finance 不提供 iNAV 数据，请切换为「系统计算 iNAV」或更换数据源', 'error');
        return;
    }

    setFetchStatus('正在获取数据...', 'loading');

    try {
        // Build fetch tickers based on mode
        const fetchTickers = {
            hynix: tickers.hynix,
            fx: tickers.fx || 'KRWHKD=X',
            etf: tickers.etf,
        };

        const { baseline, rows } = await fetchAllData(fetchTickers, 'no-inav');

        // Fill baseline inputs
        for (const [key, value] of Object.entries(baseline)) {
            const input = document.getElementById(key);
            if (input && value != null) {
                input.value = value;
            }
        }

        // Fill table with fetched rows
        fillTableWithFetchedData(mode, rows);

        // Show table section after successful fetch
        document.getElementById('data-table-section').classList.remove('hidden');

        setFetchStatus(`已获取 ${rows.length} 条数据`, 'success');
    } catch (error) {
        setFetchStatus(`获取失败: ${error.message}`, 'error');
        console.error('Fetch error:', error);
    }
}

function fillTableWithFetchedData(mode, rows) {
    const container = document.getElementById('data-table-container');
    const columns = mode === 'inav'
        ? [{ key: 'time' }, { key: 'inavPrice' }, { key: 'etfPrice' }]
        : [{ key: 'time' }, { key: 'hynixPrice' }, { key: 'fxPrice' }, { key: 'etfPrice' }];

    // Map fxPrice to fxRate for table compatibility
    const mappedRows = rows.map(row => ({
        ...row,
        fxRate: row.fxPrice || row.fxRate,
    }));

    // Rebuild table with fetched data
    const { getColumns } = { getColumns: (m) => m === 'inav'
        ? [
            { key: 'time', label: '时间', type: 'text', placeholder: 'e.g. 09:30' },
            { key: 'inavPrice', label: 'iNAV', type: 'number', placeholder: '10.12' },
            { key: 'etfPrice', label: 'ETF市价', type: 'number', placeholder: '10.15' },
          ]
        : [
            { key: 'time', label: '时间', type: 'text', placeholder: 'e.g. 09:30' },
            { key: 'hynixPrice', label: '海力士股价', type: 'number', placeholder: '201000' },
            { key: 'fxRate', label: 'KRW/HKD汇率', type: 'number', placeholder: '0.00600' },
            { key: 'etfPrice', label: 'ETF市价', type: 'number', placeholder: '10.15' },
          ]
    };

    const cols = getColumns(mode);
    const tableRows = mappedRows.map(row => {
        const cells = cols.map(c => {
            const val = row[c.key] !== undefined ? row[c.key] : '';
            return `<td><input type="${c.type}" data-key="${c.key}" placeholder="${c.placeholder}" step="any" value="${val}"></td>`;
        }).join('');
        return `<tr>${cells}</tr>`;
    }).join('');

    container.innerHTML = `
        <table>
            <thead>
                <tr>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr>
            </thead>
            <tbody id="data-tbody">
                ${tableRows}
            </tbody>
        </table>
    `;
}

function updateHints() {
    const mode = getCurrentMode();
    const source = getCurrentDataSource();

    const modeHint = document.getElementById('mode-hint');
    const sourceHint = document.getElementById('source-hint');

    if (mode === 'inav') {
        modeHint.textContent = '数据源直接提供 iNAV 时选此项（如 Bloomberg 7709IV Index），系统仅对比 iNAV 与 ETF 市价';
    } else {
        modeHint.textContent = '无 iNAV 数据源时选此项，系统用海力士股价×2 + 汇率变动自动合成 iNAV';
    }

    if (source === 'api') {
        sourceHint.textContent = '通过 API 自动获取实时行情数据';
    } else {
        sourceHint.textContent = '手动填入基准价格（昨收）和当日实时价格数据';
    }

    // Disable/enable Yahoo Finance based on mode
    updateProviderAvailability(mode);
}

function updateProviderAvailability(mode) {
    const select = document.getElementById('data-source-provider');
    const tokenInput = document.getElementById('api-token');
    if (!select) return;

    const yahooOption = select.querySelector('option[value="yahoo"]');
    if (mode === 'inav') {
        yahooOption.disabled = true;
        yahooOption.textContent = 'Yahoo Finance（不支持 iNAV，请选其他数据源）';
        // If yahoo is currently selected, auto-switch to first available alternative
        if (select.value === 'yahoo') {
            select.value = 'alphavantage';
            tokenInput.classList.remove('hidden');
        }
    } else {
        yahooOption.disabled = false;
        yahooOption.textContent = 'Yahoo Finance（免费，无需Token）';
        // Auto-switch back to Yahoo when switching to system-calculated mode
        select.value = 'yahoo';
        tokenInput.classList.add('hidden');
    }
}

document.addEventListener('DOMContentLoaded', init);
