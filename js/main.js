// js/main.js

import { renderTable, renderBaseline, addRow, deleteLastRow, clearAll, parseData, validateData, updateBacktestShadowColumn, renderRowHTML } from './data-input.js';
import { runBacktest, analyzeDivergence, findChartMarkers } from './backtest-engine.js';
import { calculateStatistics } from './statistics.js';
import { renderCharts, destroyCharts } from './charts.js';
import { generateConclusion } from './conclusion.js';

function getParams() {
    return {
        threshold: parseFloat(document.getElementById('threshold').value) || 1.5,
        swapCost: parseFloat(document.getElementById('swap-cost').value) || 0.4,
        tradeAmount: parseFloat(document.getElementById('trade-amount').value) || 100000,
    };
}

function init() {
    const container = document.getElementById('data-table-container');
    const baselineContainer = document.getElementById('baseline-inputs');

    // Initial render
    renderBaseline(baselineContainer);
    renderTable(container);

    // Table action buttons
    document.getElementById('add-row-btn').addEventListener('click', () => {
        addRow();
    });

    document.getElementById('delete-row-btn').addEventListener('click', () => {
        deleteLastRow();
    });

    document.getElementById('clear-all-btn').addEventListener('click', () => {
        if (confirm('确认清空所有数据？')) {
            clearAll();
            setBtImportStatus('');
        }
    });

    // Backtest Excel import / template download
    document.getElementById('bt-download-tpl').addEventListener('click', () => {
        downloadBacktestTemplate();
    });
    const btFileInput = document.getElementById('bt-file-input');
    document.getElementById('bt-import').addEventListener('click', () => btFileInput.click());
    btFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            // The dashboard refresh is fired from inside importBacktestFile()
            // once the FileReader callback finishes — see post-render hook.
            importBacktestFile(e.target.files[0]);
            e.target.value = '';
        }
    });

    // Auto-refresh dashboard and shadow column when backtest table data changes
    const dataTableContainer = document.getElementById('data-table-container');
    if (dataTableContainer) {
        dataTableContainer.addEventListener('input', (e) => {
            // Don't re-trigger on shadow column changes (readonly)
            if (e.target.classList.contains('shadow-cell')) return;
            updateBacktestShadowColumn();
            refreshDashboard();
        });
    }

    // Collapse toggles (smooth animation) - handle all collapsible sections
    document.querySelectorAll('.collapse-toggle').forEach(toggle => {
        const contentId = toggle.getAttribute('aria-controls');
        const content = document.getElementById(contentId);
        if (content) {
            toggle.addEventListener('click', () => {
                const expanded = toggle.getAttribute('aria-expanded') === 'true';
                toggle.setAttribute('aria-expanded', !expanded);
                content.classList.toggle('open');
            });
        }
    });

    // Run backtest button
    document.getElementById('run-backtest-btn').addEventListener('click', () => {
        executeBacktest();
    });

    // === Price Monitor Section ===
    initMonitorTable();
    document.getElementById('mon-add-row').addEventListener('click', () => { addMonitorRow(); updateShadowColumn(); renderMonitorCharts(); });
    document.getElementById('mon-del-row').addEventListener('click', () => { delMonitorRow(); updateShadowColumn(); renderMonitorCharts(); });
    document.getElementById('mon-download-tpl').addEventListener('click', downloadMonitorTemplate);

    // Auto-update shadow column and charts on any input change in monitor table
    document.getElementById('monitor-table').addEventListener('input', () => {
        updateShadowColumn();
        renderMonitorCharts();
    });

    const fileInput = document.getElementById('mon-file-input');
    document.getElementById('mon-import').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            importMonitorFile(e.target.files[0]);
            e.target.value = '';
        }
    });

    // Initial shadow calculation and chart render for demo data
    updateShadowColumn();
    renderMonitorCharts();

    // Initial shadow column + dashboard render from demo data
    setTimeout(() => {
        updateBacktestShadowColumn();
        refreshDashboard();
    }, 50);
}

function executeBacktest() {
    const data = parseData();

    if (data.length === 0) {
        alert('请先输入数据（至少需要一行有效数据）');
        return;
    }

    const errors = validateData(data);
    if (errors.length > 0) {
        alert('数据校验失败:\n' + errors.join('\n'));
        return;
    }

    const params = getParams();

    // Analyze divergence (used by both dashboard and stats panel)
    const analysis = analyzeDivergence(data, params.threshold);

    // Show and render dashboard
    renderDashboard(data, params.threshold, analysis);

    // Run swap engine
    const swaps = runBacktest(data, params);

    // Calculate results
    const totalProfitHKD = swaps.reduce((s, t) => s + t.profitHKD, 0);
    const profitableSwaps = swaps.filter(t => t.netProfit > 0);
    const dayCount = analysis.byDate.length;
    const upSwaps = swaps.filter(t => t.direction === 'sell_etf_buy_stock').length;
    const downSwaps = swaps.filter(t => t.direction === 'buy_etf_sell_stock').length;

    // Show results section
    const resultsSection = document.getElementById('backtest-results');
    resultsSection.classList.remove('hidden');

    // Render simplified stats
    renderStatsPanel({
        totalProfitHKD,
        totalSwaps: swaps.length,
        profitableSwaps: profitableSwaps.length,
        avgProfit: swaps.length > 0 ? totalProfitHKD / swaps.length : 0,
        upSwaps,
        downSwaps,
        beforeCount: analysis.before.signalCount,
        afterCount: analysis.after.signalCount,
        dayCount,
    });

    // Render charts
    destroyCharts();
    renderCharts(data, swaps);

    // Render swap log
    renderByDate(swaps, analysis);
    renderTradeLog(swaps);

    // Generate and show conclusion
    const stats = calculateStatistics(swaps.map(t => ({ pnl: t.netProfit })));
    const conclusion = generateConclusion(stats);
    renderConclusion(conclusion);
}

function renderStatsPanel(stats) {
    const panel = document.getElementById('stats-panel');
    const items = [
        { label: '覆盖天数', value: `${stats.dayCount} 天`, hint: '回测数据涉及的交易日数' },
        { label: '总锁定收益', value: `${stats.totalProfitHKD.toFixed(0)} HKD`, hint: '所有换仓的累计净收益（已扣手续费）' },
        { label: '换仓次数', value: `${stats.totalSwaps} 次`, hint: '触发阈值且通过滞回检查的换仓总次数' },
        { label: '盈利换仓', value: `${stats.profitableSwaps} 次`, hint: '锁定毛利 > 单笔成本的换仓数' },
        { label: '平均单次收益', value: `${stats.avgProfit.toFixed(0)} HKD`, hint: '总收益 / 换仓次数' },
        { label: '卖ETF换仓', value: `${stats.upSwaps} 次`, hint: 'ETF 高估时把 ETF 换回 Hynix 底仓' },
        { label: '买ETF换仓', value: `${stats.downSwaps} 次`, hint: 'ETF 折价时把 Hynix 底仓换成 ETF' },
        { label: '14:30前信号', value: `${stats.beforeCount} 次`, hint: '主板（KP）连续竞价时段超阈值的次数（统计口径，不等于换仓）' },
        { label: '14:30后信号', value: `${stats.afterCount} 次`, hint: '主板收盘后（仅 Next Trade 在盘）超阈值的次数' },
    ];

    panel.innerHTML = items.map(item => `
        <div class="stat-card">
            <div class="value">${item.value}</div>
            <div class="label">${item.label}</div>
            <div class="stat-hint">${item.hint}</div>
        </div>
    `).join('');
}

function renderByDate(trades, analysis) {
    const container = document.getElementById('by-date-container');
    const title = document.getElementById('by-date-title');
    if (!container) return;

    // Single-day data: hide the by-date section entirely.
    const real = analysis.byDate.filter(d => d.date && d.date !== '__single__');
    if (real.length <= 1) {
        title?.classList.add('hidden');
        container.innerHTML = '';
        return;
    }
    title?.classList.remove('hidden');

    // Aggregate trades per date
    const tradesByDate = new Map();
    for (const t of trades) {
        const key = t.date || '__single__';
        if (!tradesByDate.has(key)) tradesByDate.set(key, []);
        tradesByDate.get(key).push(t);
    }

    const rows = real.map(day => {
        const tList = tradesByDate.get(day.date) || [];
        const dayPnl = tList.reduce((s, t) => s + t.profitHKD, 0);
        const wins = tList.filter(t => t.netProfit > 0).length;
        const pnlColor = dayPnl >= 0 ? '#16a34a' : '#dc2626';
        return `
            <tr>
                <td>${day.date}</td>
                <td>${day.count}</td>
                <td>${day.signalCount}</td>
                <td>${tList.length}</td>
                <td>${wins}</td>
                <td style="color:#dc2626">${day.maxPremium.toFixed(2)}%</td>
                <td style="color:#2563eb">${day.maxDiscount.toFixed(2)}%</td>
                <td>${day.avgAbs.toFixed(2)}%</td>
                <td style="color:${pnlColor}; font-weight:600">${dayPnl.toFixed(0)} HKD</td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>日期</th>
                    <th>数据点</th>
                    <th>超阈值</th>
                    <th>换仓数</th>
                    <th>盈利换仓</th>
                    <th>最大溢价</th>
                    <th>最大折价</th>
                    <th>平均|偏离|</th>
                    <th>当日净利</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function renderTradeLog(swaps) {
    const container = document.getElementById('trade-log-container');

    if (swaps.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#64748b;">无换仓记录</p>';
        return;
    }

    const rows = swaps.map((t, i) => {
        const dirText = t.direction === 'sell_etf_buy_stock'
            ? '<span style="color:#dc2626">卖 ETF / 买 Hynix</span>'
            : '<span style="color:#2563eb">买 ETF / 卖 Hynix 底仓</span>';
        const pnlColor = t.netProfit >= 0 ? '#16a34a' : '#dc2626';
        return `
        <tr>
            <td>${i + 1}</td>
            <td>${t.date && t.date !== '__single__' ? t.date : '-'}</td>
            <td>${t.swapTime || t.swapIndex}</td>
            <td>${dirText}</td>
            <td>${t.premium >= 0 ? '+' : ''}${t.premium.toFixed(3)}%</td>
            <td>${t.rawProfit.toFixed(3)}%</td>
            <td style="color:#94a3b8">-${t.swapCost.toFixed(2)}%</td>
            <td style="color:${pnlColor}; font-weight:600">${t.netProfit.toFixed(3)}%</td>
            <td style="color:${pnlColor}; font-weight:600">${t.profitHKD.toFixed(0)} HKD</td>
        </tr>`;
    }).join('');

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>日期</th>
                    <th>换仓时间</th>
                    <th>方向</th>
                    <th>触发时偏离</th>
                    <th>锁定毛利</th>
                    <th>换仓成本</th>
                    <th>净利%</th>
                    <th>净利 HKD</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
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

        <h3 style="margin-top:1rem;">指标说明</h3>
        <div class="conclusion-metrics-note">
            <p><strong>夏普比率</strong> = 每笔交易平均收益率 ÷ 收益率标准差（未年化，无风险利率=0）</p>
            <p style="color:var(--color-text-muted); font-size:0.8rem;">衡量每承担一单位波动能获得多少收益。&gt;1.5 优秀，1~1.5 良好，0.5~1 一般，&lt;0.5 较差。</p>
            <p><strong>最大回撤</strong> = 累计收益从最高点到最低点的最大跌幅</p>
            <p><strong>胜率</strong> = 盈利交易次数 ÷ 总交易次数 × 100%</p>
        </div>
    `;
}

// ===== Shadow iNAV Validation =====

let shadowBacktestChart = null;

/**
 * Render shadow iNAV vs official iNAV comparison.
 * Only shows when data rows have both inavSource='truth' AND shadowInavChange != null.
 */
function renderShadowValidation(data) {
    const section = document.getElementById('shadow-validation-section');
    const canvas = document.getElementById('shadow-backtest-chart');
    const statsPanel = document.getElementById('shadow-validation-stats');

    // Filter rows that have both official iNAV and shadow calculation
    const validRows = data.filter(r => r.officialInavChange !== null && r.shadowInavChange !== null);

    if (validRows.length < 2) {
        section.classList.add('hidden');
        if (shadowBacktestChart) { shadowBacktestChart.destroy(); shadowBacktestChart = null; }
        return;
    }

    section.classList.remove('hidden');

    // Calculate stats
    const errors = validRows.map(r => r.shadowInavChange - r.inavChange);
    const absErrors = errors.map(e => Math.abs(e));
    const maxError = Math.max(...absErrors);
    const avgError = absErrors.reduce((s, e) => s + e, 0) / absErrors.length;
    const maxErrorRow = validRows[absErrors.indexOf(maxError)];

    statsPanel.innerHTML = `
        <div class="stat-card">
            <div class="value">${validRows.length}</div>
            <div class="label">对比数据点</div>
            <div class="stat-hint">同时有官方iNAV和海力士+汇率的行数</div>
        </div>
        <div class="stat-card">
            <div class="value">${avgError.toFixed(4)}%</div>
            <div class="label">平均绝对误差</div>
            <div class="stat-hint">影子iNAV涨跌幅与官方iNAV涨跌幅的平均偏差</div>
        </div>
        <div class="stat-card">
            <div class="value">${maxError.toFixed(4)}%</div>
            <div class="label">最大误差</div>
            <div class="stat-hint">出现在 ${maxErrorRow.time || '-'}</div>
        </div>
        <div class="stat-card">
            <div class="value">${maxError < 0.1 ? '优秀' : maxError < 0.3 ? '良好' : '偏大'}</div>
            <div class="label">模型精度</div>
            <div class="stat-hint">${maxError < 0.1 ? '误差<0.1%，可放心使用' : maxError < 0.3 ? '误差<0.3%，基本可用' : '建议检查数据对齐'}</div>
        </div>
    `;

    // Render chart
    const ctx = canvas.getContext('2d');
    if (shadowBacktestChart) shadowBacktestChart.destroy();

    const labels = validRows.map(r => r.time || '');
    const officialLine = validRows.map(r => r.officialInavChange);
    const shadowLine = validRows.map(r => r.shadowInavChange);
    const errorBars = errors;

    shadowBacktestChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: '官方 iNAV 涨跌幅 (%)',
                    data: officialLine,
                    borderColor: '#16a34a',
                    borderWidth: 2,
                    pointRadius: 0,
                    yAxisID: 'y',
                    fill: false,
                },
                {
                    label: '影子 iNAV 涨跌幅 (%)',
                    data: shadowLine,
                    borderColor: '#f59e0b',
                    borderWidth: 2,
                    pointRadius: 0,
                    borderDash: [5, 3],
                    yAxisID: 'y',
                    fill: false,
                },
                {
                    label: '误差 (%)',
                    data: errorBars,
                    type: 'bar',
                    backgroundColor: errorBars.map(e => e >= 0 ? 'rgba(220, 38, 38, 0.25)' : 'rgba(37, 99, 235, 0.25)'),
                    borderColor: errorBars.map(e => e >= 0 ? 'rgba(220, 38, 38, 0.6)' : 'rgba(37, 99, 235, 0.6)'),
                    borderWidth: 1,
                    yAxisID: 'y1',
                },
            ],
        },
        options: {
            responsive: true,
            plugins: {
                title: { display: true, text: '影子 iNAV vs 官方 iNAV（涨跌幅对比）' },
                legend: { labels: { usePointStyle: true, pointStyle: 'line' } },
            },
            scales: {
                y: { position: 'left', title: { display: true, text: '涨跌幅 (%)' } },
                y1: { position: 'right', title: { display: true, text: '误差 (%)' }, grid: { drawOnChartArea: false } },
            },
        },
    });
}

// ===== Backtest: Excel/CSV import & template =====

function setBtImportStatus(text, type = '') {
    const el = document.getElementById('bt-import-status');
    if (!el) return;
    el.textContent = text;
    el.className = 'fetch-status ' + type;
}

/**
 * Build the column definition used by the unified backtest data table.
 * 6 columns: 日期 | 时间 | iNAV(HKD) | 海力士股价(KRW) | KRW/HKD汇率 | ETF市价(HKD)
 *
 * Per-row iNAV resolution (truth → shadow → skip) happens in data-input.parseData.
 */
function getBacktestExportColumns() {
    return [
        { label: '日期',           placeholder: 'YYYY-MM-DD' },
        { label: '时间',           placeholder: 'HH:MM' },
        { label: 'iNAV(HKD)',      placeholder: '14:30前' },
        { label: '海力士股价(KRW)', placeholder: '201000' },
        { label: 'KRW/HKD汇率',    placeholder: '0.00600' },
        { label: 'ETF市价(HKD)',   placeholder: '10.15' },
    ];
}

function downloadBacktestTemplate() {
    const cols = getBacktestExportColumns();
    // Sample data mimicking real BBG export values (HKD-priced ETF)
    const sampleRows = [
        ['2026-05-21', '09:30', '93.80', '', '', '93.62'],
        ['2026-05-21', '09:45', '93.99', '', '', '94.12'],
        ['2026-05-21', '10:00', '93.59', '', '', '94.00'],
        ['2026-05-21', '10:30', '97.53', '', '', '97.78'],
        ['2026-05-21', '11:00', '97.04', '', '', '97.10'],
        ['2026-05-21', '11:30', '98.26', '', '', '98.12'],
        ['2026-05-21', '13:00', '97.70', '', '', '97.24'],
        ['2026-05-21', '13:30', '97.50', '', '', '97.30'],
        ['2026-05-21', '14:00', '98.41', '', '', '98.22'],
        ['2026-05-21', '14:30', '96.70', '', '', '96.78'],
        ['2026-05-21', '15:00', '96.04', '', '', '94.50'],
        ['2026-05-21', '15:30', '96.04', '', '', '93.96'],
        ['2026-05-21', '16:00', '96.06', '', '', '93.06'],
    ];

    const header = cols.map(c => c.label);
    const ws = XLSX.utils.aoa_to_sheet([header, ...sampleRows]);
    ws['!cols'] = cols.map(() => ({ wch: 15 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '回测数据');
    XLSX.writeFile(wb, 'backtest_template.xlsx');
}

/**
 * Import an Excel/CSV into the unified backtest data table.
 * Expected columns: 日期 | 时间 | iNAV(HKD) | 海力士股价(KRW) | KRW/HKD汇率 | ETF市价(HKD)
 *
 * - Multi-day is fully supported (engine groups by date and computes per-day baselines).
 * - Empty 日期 rows are bucketed into a synthetic single-day group.
 * - Empty iNAV cells are normal: parseData() falls back to shadow iNAV per row.
 * - Backward-compatible with the legacy 5-column "no-iNAV" template
 *   (日期 | 时间 | 海力士 | 汇率 | ETF) — detected by the header row.
 */
function importBacktestFile(file) {
    setBtImportStatus(`正在解析 ${(file.size/1024/1024).toFixed(1)} MB 文件…`, '');
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, { type: 'array', cellDates: false });

            // Auto-detect "Value Page" sheet (BBG BDH export) or use first sheet
            const sheetName = wb.SheetNames.includes('Value Page')
                ? 'Value Page'
                : wb.SheetNames[0];
            const ws = wb.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
            if (rows.length === 0) {
                setBtImportStatus('文件中没有数据', 'error');
                return;
            }

            // Detect BBG BDH "Value Page" format.
            // BBG exports each ticker as a 3-column block:
            //   col 0: serial datetime, col 1: 'TRADE', col 2: numeric value
            // The first row usually carries the ticker name (e.g. '7709IV Index')
            // somewhere in the first few cells. We scan the first ~3 rows for any
            // recognized ticker token; if found, use the BBG parser.
            const TICKER_REGEX = /(7709IV|7709\s*HK|000660\s*KP|000660\s*KT|KRW(\s|HKD)*Curncy)/i;
            const isBBGFormat = (() => {
                // Sniff the first 3 rows for any ticker tag + at least one TRADE cell
                for (let r = 0; r < Math.min(3, rows.length); r++) {
                    const row = rows[r] || [];
                    const joined = row.map(c => String(c ?? '')).join(' | ');
                    if (TICKER_REGEX.test(joined)) return true;
                }
                // Fallback: legacy detection (col 1 is serial date + col 2 === 'TRADE')
                const firstRow = rows[0] || [];
                return typeof firstRow[1] === 'number' && firstRow[1] > 40000 &&
                    String(firstRow[2] || '').toUpperCase() === 'TRADE';
            })();

            if (isBBGFormat) {
                parseBBGBacktestData(rows);
                return;
            }

            // --- Standard format parsing (header + data rows) ---
            // Detect legacy layout by inspecting header row.
            const header = rows[0].map(h => String(h ?? ''));
            const colCount = header.length;
            const headerHasInav = /iNAV/i.test(header[2] || '');
            const headerHasHynix = /海力士|hynix/i.test(header[2] || '');

            const dataRows = rows.slice(1).filter(r =>
                r && r.length > 1 && r[1] !== undefined && r[1] !== null && String(r[1]).trim() !== ''
            );
            if (dataRows.length === 0) {
                setBtImportStatus('文件中没有有效数据', 'error');
                return;
            }

            // Map each raw row to the entry shape used by the table.
            // Legacy templates use a single "海力士股价" column; we mirror it
            // into both KP and KT so downstream KP-fallback-to-KT logic works.
            const mapRow = (r) => {
                const date = normalizeDate(r[0]);
                const time = normalizeTime(r[1]);
                const v = (i) => (r[i] != null && r[i] !== '' ? String(r[i]) : '');
                let hx = '', fxRate = '', inavPrice = '', etfPrice = '';
                if (colCount >= 6 || (headerHasInav && colCount > 4)) {
                    // Modern 6-column layout: 日期|时间|iNAV|海力士|汇率|ETF
                    inavPrice = v(2); hx = v(3); fxRate = v(4); etfPrice = v(5);
                } else if (headerHasInav) {
                    // Legacy: 日期|时间|iNAV|ETF
                    inavPrice = v(2); etfPrice = v(3);
                } else if (headerHasHynix) {
                    // Legacy: 日期|时间|海力士|汇率|ETF
                    hx = v(2); fxRate = v(3); etfPrice = v(4);
                } else {
                    // Unknown: best-effort
                    inavPrice = v(2); hx = v(3); fxRate = v(4); etfPrice = v(5);
                }
                return { date, time, inavPrice, hynixKP: hx, hynixKT: hx, fxRate, etfPrice };
            };

            const tbody = document.getElementById('data-tbody');
            tbody.innerHTML = dataRows.map(r => renderRowHTML(mapRow(r))).join('');

            const uniqueDates = new Set(
                dataRows.map(r => normalizeDate(r[0])).filter(d => d !== '')
            );
            const dayCount = uniqueDates.size;
            const layoutHint = (colCount < 6 && (headerHasInav || headerHasHynix))
                ? '（旧版模板已自动适配）'
                : '';
            if (dayCount > 1) {
                setBtImportStatus(`已导入 ${dataRows.length} 行，覆盖 ${dayCount} 个交易日 ${layoutHint}`, 'success');
            } else if (dayCount === 1) {
                setBtImportStatus(`已导入 ${dataRows.length} 行（${[...uniqueDates][0]}）${layoutHint}`, 'success');
            } else {
                setBtImportStatus(`已导入 ${dataRows.length} 行（无日期列，按单日处理）${layoutHint}`, 'success');
            }
            updateBacktestShadowColumn();
            refreshDashboard();
        } catch (err) {
            setBtImportStatus('文件解析失败: ' + err.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

/**
 * Parse BBG BDH "Value Page" export.
 *
 * Column blocks (each ticker occupies 3 consecutive columns):
 *   [serial_datetime, "TRADE", numeric_value]
 *
 * The ticker name appears somewhere on the first row (or a header row)
 * inside its block — we auto-detect the role of each block by scanning
 * for ticker keywords:
 *   7709IV          -> iNAV (15-second grid)
 *   7709 HK Equity  -> ETF tick
 *   000660 KP       -> Hynix KOSPI tick (main board, 09:00-14:30 KST)
 *   000660 KT       -> Hynix Next Trade tick (08:00-20:00 KST)
 *   KRW Curncy      -> KRW/HKD FX tick
 *
 * Workflow:
 *   1. Each ticker -> a sorted [{ts, val}] tick list (ts = ms-since-epoch).
 *   2. Use iNAV's 15s timestamps as the master time grid.
 *   3. For ETF/KP/KT/FX: forward-fill (LOCF) the latest tick at-or-before
 *      each iNAV timestamp.
 *   4. Downsample the master grid to 1 row/minute (keep the LAST 15s tick of
 *      each minute, so 09:30 row uses the 09:30:45 iNAV value).
 */
function parseBBGBacktestData(rows) {
    const blocks = detectBBGTickerBlocks(rows);

    if (!blocks.inav || blocks.inav.ticks.length === 0) {
        setBtImportStatus('未识别到 7709IV (iNAV) 列，无法以 iNAV 为主轴对齐', 'error');
        return;
    }

    const inavTicks = blocks.inav.ticks;            // 15s-grid master
    const etfTicks  = blocks.etf?.ticks  || [];
    const kpTicks   = blocks.kp?.ticks   || [];
    const ktTicks   = blocks.kt?.ticks   || [];

    // BBG "KRW Curncy" returns KRW per USD (~1500), not KRW/HKD (~0.0052).
    // Convert to HKD per KRW using a flat USD/HKD = 7.8 constant — the HKD peg
    // band (7.75-7.85) keeps this within a few bps, well below the arbitrage
    // signal threshold. Downstream uses only the % change, so the multiplier
    // cancels in the ratio.
    const USD_HKD = 7.8;
    const fxTicksRaw = blocks.fx?.ticks || [];
    const fxTicks = fxTicksRaw.map(t => ({
        ts: t.ts,
        val: USD_HKD / t.val,    // HKD per KRW = USD/HKD ÷ KRW per USD
    }));

    // Pre-compute a forward-fill cursor per series
    const ffCursor = (ticks) => {
        let i = 0;
        return (ts) => {
            while (i + 1 < ticks.length && ticks[i + 1].ts <= ts) i++;
            if (ticks.length === 0) return null;
            return ticks[i].ts <= ts ? ticks[i].val : null;
        };
    };
    const ffEtf = ffCursor(etfTicks);
    const ffKp  = ffCursor(kpTicks);
    const ffKt  = ffCursor(ktTicks);
    const ffFx  = ffCursor(fxTicks);

    // KP (KOSPI main board) closes after 14:30 — beyond that we deliberately
    // leave the cell blank instead of LOCF-filling, so the table makes it
    // visually clear that no further main-board trades happened. The backtest
    // engine handles missing KP by falling back to KT (Next Trade).
    const KP_CUTOFF = '14:30';

    // 1) Build aligned 15s-grid rows from iNAV
    const aligned = inavTicks.map(t => {
        const time = tsToTimeStr(t.ts);    // HH:MM
        return {
            ts: t.ts,
            date: tsToDateStr(t.ts),
            time,
            inav: t.val,
            etf: ffEtf(t.ts),
            kp:  time > KP_CUTOFF ? null : ffKp(t.ts),
            kt:  ffKt(t.ts),
            fx:  ffFx(t.ts),
        };
    });

    // 2) Downsample to 1 row per minute — keep the FIRST tick of each minute
    //    (e.g. 09:30:00 snapshot, not 09:30:45). This makes the day's first
    //    row the true open-snapshot baseline; all change-vs-baseline % are
    //    measured against the actual 09:30:00 prices, with no 45-second
    //    look-ahead leakage.
    const byMinute = new Map();
    for (const a of aligned) {
        const key = `${a.date} ${a.time}`;
        if (!byMinute.has(key)) byMinute.set(key, a); // first wins
    }
    let finalRows = [...byMinute.values()].sort((x, y) => x.ts - y.ts);

    // 3) Trim per-day leading rows where ETF is still absent.
    //    Otherwise the day's first row (used as baseline by resolveDay) would
    //    have no ETF price, which the backtest engine treats as fatal.
    finalRows = trimLeadingNoEtfRowsPerDay(finalRows);

    // 4) Determine FX fallback (when no KRW Curncy block in this file)
    const hasFx = fxTicks.length > 0;
    const FX_FALLBACK = '0.00525';

    // 5) Render to the table (replace existing rows)
    const tbody = document.getElementById('data-tbody');
    tbody.innerHTML = finalRows.map(r => {
        const fxVal = (r.fx != null) ? r.fx.toFixed(6) : (hasFx ? '' : FX_FALLBACK);
        return renderRowHTML({
            date: r.date,
            time: r.time,
            inavPrice: r.inav != null ? r.inav.toFixed(4) : '',
            hynixKP: r.kp != null ? String(Math.round(r.kp)) : '',
            hynixKT: r.kt != null ? String(Math.round(r.kt)) : '',
            fxRate: fxVal,
            etfPrice: r.etf != null ? r.etf.toFixed(2) : '',
        });
    }).join('');

    // 6) Status line — show coverage details
    const dateSet = new Set(finalRows.map(r => r.date));
    const dateInfo = dateSet.size === 1
        ? [...dateSet][0]
        : `${dateSet.size} 天`;
    const parts = [];
    parts.push(`iNAV ${inavTicks.length} ticks`);
    if (etfTicks.length) parts.push(`ETF ${etfTicks.length}`);
    if (kpTicks.length)  parts.push(`KP ${kpTicks.length}`);
    if (ktTicks.length)  parts.push(`KT ${ktTicks.length}`);
    if (fxTicks.length)  parts.push(`FX ${fxTicks.length}`);
    else                  parts.push(`FX(回退${FX_FALLBACK})`);

    setBtImportStatus(
        `BBG Value Page 已识别 — 导入 ${finalRows.length} 行（${dateInfo}，1分钟粒度）｜${parts.join(' / ')}`,
        'success'
    );

    // Recompute shadow iNAV column + dashboard charts now that the table is filled
    updateBacktestShadowColumn();
    refreshDashboard();
}

/**
 * Drop rows from the front of each trading day until ETF has its first tick.
 * The backtest engine uses each day's first row as the baseline, and a missing
 * ETF baseline aborts the whole day.
 */
function trimLeadingNoEtfRowsPerDay(rows) {
    const seenEtfPerDay = new Set();
    const out = [];
    for (const r of rows) {
        if (r.etf != null) seenEtfPerDay.add(r.date);
        if (seenEtfPerDay.has(r.date)) out.push(r);
    }
    return out;
}

/**
 * Scan rows and return ticker -> { ticks: [{ts, val}] } blocks.
 *
 * Strategy: walk first ~5 rows looking for a cell that matches a ticker keyword,
 * then assume the ticker's data block starts at that column or the next.
 * Each block is 3 columns: [datetime_serial, 'TRADE', value].
 *
 * To be robust, we try the matched column AND its neighbors (+/-1, +/-2) and
 * pick the offset that yields the most valid (datetime, TRADE, number) rows.
 */
function detectBBGTickerBlocks(rows) {
    const TICKERS = [
        { key: 'inav', re: /7709\s*IV/i,           label: '7709IV' },
        { key: 'etf',  re: /7709\s*HK/i,           label: '7709 HK' },
        { key: 'kp',   re: /000660\s*KP/i,         label: '000660 KP' },
        { key: 'kt',   re: /000660\s*KT/i,         label: '000660 KT' },
        { key: 'fx',   re: /KRW(\s|HKD)*Curncy/i,  label: 'KRW Curncy' },
    ];

    // Find candidate starting columns for each ticker by scanning the first few rows.
    const headerRows = rows.slice(0, 5);
    const candidates = {};
    for (const t of TICKERS) {
        const cands = new Set();
        for (const row of headerRows) {
            if (!row) continue;
            for (let c = 0; c < row.length; c++) {
                const cell = String(row[c] ?? '');
                if (t.re.test(cell)) cands.add(c);
            }
        }
        candidates[t.key] = [...cands];
    }

    // For each ticker, scan all rows starting from each candidate column-offset
    // and try offsets {-2,-1,0,1,2} for the date column, then pick whichever
    // produces the most ticks. The block is [date, 'TRADE', value].
    const result = {};
    for (const t of TICKERS) {
        let best = { ticks: [], startCol: -1 };
        for (const c of candidates[t.key]) {
            for (const off of [0, -2, -1, 1, 2]) {
                const startCol = c + off;
                if (startCol < 0) continue;
                const ticks = extractTickBlock(rows, startCol);
                if (ticks.length > best.ticks.length) {
                    best = { ticks, startCol };
                }
            }
        }
        if (best.ticks.length > 0) {
            // sort by timestamp ascending
            best.ticks.sort((a, b) => a.ts - b.ts);
            result[t.key] = best;
        }
    }
    return result;
}

/**
 * Extract a [datetime_serial, 'TRADE', numeric_value] block starting at column
 * `startCol`. Returns [{ts: ms, val: number}] for every valid row.
 *
 * BBG often forward-fills the same (ts, val) across thousands of consecutive
 * rows when aligning to a master grid (e.g. KP keeps repeating its last trade
 * once a minute). We collapse such immediate duplicates to keep tick lists
 * lean — the LOCF cursor downstream produces identical results either way.
 */
function extractTickBlock(rows, startCol) {
    const out = [];
    let lastTs = -1;
    let lastVal = NaN;
    for (const row of rows) {
        if (!row) continue;
        const dtCell  = row[startCol];
        const tagCell = row[startCol + 1];
        const valCell = row[startCol + 2];
        if (typeof dtCell !== 'number' || dtCell <= 40000) continue;
        if (String(tagCell ?? '').toUpperCase() !== 'TRADE') continue;
        if (typeof valCell !== 'number' || !isFinite(valCell)) continue;
        const ts = serialToMs(dtCell);
        if (ts === lastTs && valCell === lastVal) continue;       // exact dup
        out.push({ ts, val: valCell });
        lastTs = ts;
        lastVal = valCell;
    }
    return out;
}

/**
 * Excel serial datetime -> JS Date ms-since-epoch (UTC).
 * Excel epoch is 1899-12-30; serial uses 1-based days in local time. We treat
 * the serial as a UTC instant for ordering purposes (all tickers are exported
 * with the same TZ=Hong_Kong from BBG, so cross-ticker comparisons are valid).
 */
function serialToMs(serial) {
    return Math.round((serial - 25569) * 86400 * 1000);
}

function tsToDateStr(ts) {
    return new Date(ts).toISOString().slice(0, 10);
}

function tsToTimeStr(ts) {
    const d = new Date(ts);
    const h = d.getUTCHours();
    const m = d.getUTCMinutes();
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

/**
 * Normalize a date cell into 'YYYY-MM-DD'.
 * Excel may give a date as a serial number (e.g. 45797), an ISO string, or
 * simply 'YYYY/MM/DD' / 'YYYY-MM-DD'. We coerce all three to ISO form.
 */
function normalizeDate(cell) {
    if (cell == null || cell === '') return '';
    if (typeof cell === 'number') {
        // SSF.format converts an Excel serial date to a string
        try {
            const formatted = XLSX.SSF.format('yyyy-mm-dd', cell);
            return String(formatted);
        } catch {
            return '';
        }
    }
    const s = String(cell).trim();
    // Convert '2026/05/13' -> '2026-05-13'; leave already-ISO strings intact.
    return s.replace(/\//g, '-');
}

function normalizeTime(cell) {
    if (cell == null || cell === '') return '';
    // Excel sometimes stores 'HH:MM' as a fraction of a day; coerce.
    if (typeof cell === 'number' && cell >= 0 && cell < 1) {
        try {
            return XLSX.SSF.format('hh:mm', cell);
        } catch {
            // fall through
        }
    }
    return String(cell).trim();
}

// ===== Price Monitor Section =====

const MONITOR_DEMO_ROWS = [
    { time: '09:30', inav: '93.8025', etf: '93.62' },
    { time: '09:35', inav: '94.5392', etf: '94.90' },
    { time: '09:40', inav: '94.5432', etf: '94.62' },
    { time: '09:45', inav: '93.9899', etf: '94.12' },
    { time: '09:50', inav: '93.8768', etf: '93.90' },
    { time: '09:55', inav: '92.7595', etf: '92.74' },
    { time: '10:00', inav: '93.5937', etf: '94.00' },
    { time: '10:05', inav: '94.4255', etf: '94.44' },
    { time: '10:10', inav: '94.9757', etf: '95.22' },
    { time: '10:15', inav: '94.7949', etf: '95.00' },
    { time: '10:20', inav: '95.6099', etf: '95.82' },
    { time: '10:25', inav: '96.4301', etf: '96.72' },
    { time: '10:30', inav: '97.5257', etf: '97.78' },
    { time: '10:35', inav: '97.3363', etf: '97.62' },
    { time: '10:40', inav: '98.3503', etf: '98.66' },
    { time: '10:45', inav: '97.8002', etf: '97.88' },
    { time: '10:50', inav: '97.2536', etf: '97.40' },
    { time: '10:55', inav: '97.4287', etf: '97.56' },
    { time: '11:00', inav: '97.0448', etf: '97.10' },
    { time: '11:05', inav: '97.1452', etf: '97.08' },
    { time: '11:10', inav: '97.5069', etf: '97.46' },
    { time: '11:15', inav: '97.6997', etf: '97.64' },
    { time: '11:20', inav: '97.8838', etf: '97.86' },
    { time: '11:25', inav: '98.3467', etf: '98.30' },
    { time: '11:30', inav: '98.2587', etf: '98.12' },
    { time: '11:35', inav: '98.1743', etf: '98.20' },
    { time: '11:40', inav: '98.1690', etf: '97.96' },
    { time: '11:45', inav: '97.7968', etf: '97.70' },
    { time: '11:50', inav: '96.9680', etf: '96.90' },
    { time: '11:55', inav: '96.9657', etf: '96.94' },
    { time: '13:00', inav: '97.6989', etf: '97.24' },
    { time: '13:05', inav: '97.4335', etf: '97.58' },
    { time: '13:10', inav: '97.3319', etf: '97.30' },
    { time: '13:15', inav: '97.5081', etf: '97.46' },
    { time: '13:20', inav: '97.5102', etf: '97.54' },
    { time: '13:25', inav: '98.0532', etf: '97.92' },
    { time: '13:30', inav: '97.4969', etf: '97.30' },
    { time: '13:35', inav: '97.4062', etf: '97.20' },
    { time: '13:40', inav: '97.4052', etf: '97.26' },
    { time: '13:45', inav: '97.4047', etf: '97.24' },
    { time: '13:50', inav: '97.7622', etf: '97.66' },
    { time: '13:55', inav: '98.2345', etf: '97.98' },
    { time: '14:00', inav: '98.4129', etf: '98.22' },
    { time: '14:05', inav: '98.5917', etf: '98.36' },
    { time: '14:10', inav: '98.8605', etf: '98.60' },
    { time: '14:15', inav: '98.3192', etf: '98.08' },
    { time: '14:20', inav: '97.3121', etf: '96.94' },
    { time: '14:25', inav: '95.4980', etf: '95.72' },
    { time: '14:30', inav: '96.6956', etf: '96.78' },
    { time: '14:35', inav: '96.6910', etf: '96.12' },
    { time: '14:40', inav: '96.7735', etf: '95.72' },
    { time: '14:45', inav: '96.7672', etf: '95.86' },
    { time: '14:50', inav: '96.0420', etf: '95.88' },
    { time: '14:55', inav: '96.0512', etf: '95.02' },
    { time: '15:00', inav: '96.0447', etf: '94.50' },
    { time: '15:05', inav: '96.0624', etf: '93.64' },
    { time: '15:10', inav: '96.0701', etf: '93.90' },
    { time: '15:15', inav: '96.0734', etf: '93.30' },
    { time: '15:20', inav: '96.0482', etf: '92.10' },
    { time: '15:25', inav: '96.0478', etf: '93.10' },
    { time: '15:30', inav: '96.0408', etf: '93.96' },
    { time: '15:35', inav: '96.0423', etf: '94.14' },
    { time: '15:40', inav: '96.0411', etf: '93.40' },
    { time: '15:45', inav: '96.0482', etf: '93.46' },
    { time: '15:50', inav: '96.0574', etf: '93.38' },
    { time: '15:55', inav: '96.0712', etf: '93.80' },
    { time: '16:00', inav: '96.0635' },
    { time: '16:05', inav: '96.0761' },
    { time: '16:10', inav: '96.0789' },
];

function initMonitorTable() {
    const tbody = document.getElementById('monitor-tbody');
    tbody.innerHTML = MONITOR_DEMO_ROWS.map(row => monitorRow(row)).join('');
}

function monitorRow(data = {}) {
    return `<tr>
        <td><input type="text" placeholder="HH:MM" value="${data.time || ''}"></td>
        <td><input type="number" step="any" class="inav-cell" placeholder="" value="${data.inav || ''}"></td>
        <td><input type="number" step="any" class="shadow-cell" placeholder="自动计算" readonly tabindex="-1" value="${data.shadow || ''}"></td>
        <td><input type="number" step="any" placeholder="ETF价" value="${data.etf || ''}"></td>
        <td><input type="number" step="any" placeholder="海力士" value="${data.hynix || ''}"></td>
        <td><input type="number" step="any" placeholder="KRW/HKD" value="${data.krwhkd || ''}"></td>
    </tr>`;
}

function addMonitorRow() {
    document.getElementById('monitor-tbody').insertAdjacentHTML('beforeend', monitorRow());
}

function delMonitorRow() {
    const tbody = document.getElementById('monitor-tbody');
    const rows = tbody.querySelectorAll('tr');
    if (rows.length > 1) rows[rows.length - 1].remove();
}

/**
 * Recalculate shadow iNAV for all rows based on first row as baseline.
 * Called on every input change — no button needed.
 */
function updateShadowColumn() {
    const tbody = document.getElementById('monitor-tbody');
    const rows = tbody.querySelectorAll('tr');
    if (rows.length < 1) return;

    // Read first row as baseline
    const firstInputs = rows[0].querySelectorAll('input');
    const baseInav = parseFloat(firstInputs[1].value) || null;
    const baseHynix = parseFloat(firstInputs[4].value) || null;
    const baseKrwhkd = parseFloat(firstInputs[5].value) || null;

    let lastEtf = null;
    let lastShadow = null;
    let lastInav = null;
    let lastTime = '';

    for (const row of rows) {
        const inputs = row.querySelectorAll('input');
        const shadowCell = inputs[2];
        const time = inputs[0].value.trim();
        const inav = parseFloat(inputs[1].value) || null;
        const etf = parseFloat(inputs[3].value) || null;
        const hynix = parseFloat(inputs[4].value) || null;
        const krwhkd = parseFloat(inputs[5].value) || null;

        if (baseInav && baseHynix && baseKrwhkd && hynix && krwhkd) {
            const hynixChange = (hynix - baseHynix) / baseHynix;
            const fxChange = (krwhkd - baseKrwhkd) / baseKrwhkd;
            const shadow = baseInav * (1 + hynixChange * 2) * (1 + fxChange);
            shadowCell.value = shadow.toFixed(2);
            lastShadow = shadow;
        } else {
            shadowCell.value = '';
        }

        if (etf) lastEtf = etf;
        if (inav) lastInav = inav;
        if (time) lastTime = time;
    }

    // Update divergence indicator with latest row data
    updateDivergenceIndicator(lastEtf, lastInav, lastShadow, lastTime);
}

function updateDivergenceIndicator(etf, officialInav, shadowInav, time) {
    const container = document.getElementById('divergence-indicator');
    if (!etf || !shadowInav) {
        container.innerHTML = '';
        return;
    }

    // Always prefer official iNAV (available all day from BBG)
    const referenceInav = officialInav || shadowInav;
    const inavSource = officialInav ? '官方iNAV' : '影子iNAV';

    // Calculate divergence
    const divergence = ((etf - referenceInav) / referenceInav * 100);
    const absDivergence = Math.abs(divergence);

    // Determine signal strength
    let signalClass = '';
    let actionText = '';
    let actionClass = 'hold';

    if (absDivergence >= 2.0) {
        signalClass = 'signal-strong';
        actionText = divergence > 0 ? '强烈卖出ETF / 买入股票' : '强烈买入ETF / 卖出股票';
        actionClass = divergence > 0 ? 'sell' : 'buy';
    } else if (absDivergence >= 1.0) {
        signalClass = 'signal';
        actionText = divergence > 0 ? '考虑卖出ETF / 买入股票' : '考虑买入ETF / 卖出股票';
        actionClass = divergence > 0 ? 'sell' : 'buy';
    } else {
        actionText = '偏离不足，暂不交易';
    }

    const valueClass = divergence > 0.1 ? 'positive' : (divergence < -0.1 ? 'negative' : 'neutral');

    container.innerHTML = `
        <div class="div-card">
            <div class="div-value neutral">${etf.toFixed(2)}</div>
            <div class="div-label">ETF成交价 (HKD)</div>
        </div>
        <div class="div-card">
            <div class="div-value neutral">${referenceInav.toFixed(2)}</div>
            <div class="div-label">${inavSource} (HKD)</div>
        </div>
        <div class="div-card ${signalClass}">
            <div class="div-value ${valueClass}">${divergence >= 0 ? '+' : ''}${divergence.toFixed(3)}%</div>
            <div class="div-label">偏离度（ETF vs ${inavSource}）</div>
            <div class="div-action ${actionClass}">${actionText}</div>
        </div>
        <div class="div-card">
            <div class="div-value neutral">${time}</div>
            <div class="div-label">最新数据时间</div>
        </div>
    `;
}

function downloadMonitorTemplate() {
    const header = ['时间', 'iNAV(HKD)', '影子iNAV(系统计算)', 'ETF成交价(HKD)', '海力士股价(KRW)', 'KRW/HKD汇率'];
    const sampleRows = [
        ['09:30', '90.50', '', '90.55', '200500', '0.0058'],
        ['09:45', '90.80', '', '90.85', '201000', '0.0058'],
        ['10:00', '91.20', '', '91.50', '201500', '0.0058'],
        ['14:30', '92.50', '', '92.45', '202800', '0.0058'],
        ['14:45', '', '', '92.80', '203200', '0.0058'],
        ['15:00', '', '', '93.10', '203500', '0.0058'],
    ];

    const ws = XLSX.utils.aoa_to_sheet([header, ...sampleRows]);
    ws['!cols'] = [{ wch: 8 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '价格数据');
    XLSX.writeFile(wb, 'price_monitor_template.xlsx');
}

function importMonitorFile(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

            // Skip header row
            const dataRows = rows.slice(1).filter(row => row.length > 0 && row[0]);

            if (dataRows.length === 0) {
                alert('文件中没有有效数据');
                return;
            }

            // Fill table - columns: 时间, iNAV, (影子iNAV跳过), ETF, 海力士, KRW/HKD
            const tbody = document.getElementById('monitor-tbody');
            tbody.innerHTML = dataRows.map(row => {
                const time = String(row[0] || '').trim();
                const inav = row[1] != null && row[1] !== '' ? String(row[1]) : '';
                // row[2] is shadow column - skip on import
                const etf = row[3] != null && row[3] !== '' ? String(row[3]) : '';
                const hynix = row[4] != null && row[4] !== '' ? String(row[4]) : '';
                const krwhkd = row[5] != null && row[5] !== '' ? String(row[5]) : '';
                return monitorRow({ time, inav, etf, hynix, krwhkd });
            }).join('');

            alert(`已导入 ${dataRows.length} 行数据`);
            updateShadowColumn();
            renderMonitorCharts();
        } catch (err) {
            alert('文件解析失败: ' + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

let chartPriceVsInav = null;
let chartShadowValidation = null;

function renderMonitorCharts() {
    // Parse table data
    const tbody = document.getElementById('monitor-tbody');
    const rows = tbody.querySelectorAll('tr');
    const data = [];

    for (const row of rows) {
        const inputs = row.querySelectorAll('input');
        const time = inputs[0].value.trim();
        const inav = parseFloat(inputs[1].value) || null;
        // inputs[2] is shadow column (readonly, skip for input)
        const etf = parseFloat(inputs[3].value) || null;
        const hynix = parseFloat(inputs[4].value) || null;
        const krwhkd = parseFloat(inputs[5].value) || null;
        if (time && (etf || inav || hynix)) {
            data.push({ time, inav, etf, hynix, krwhkd });
        }
    }

    if (data.length < 2) return;

    // Use first row as baseline (opening values)
    const baseRow = data[0];
    const baseInav = baseRow.inav;
    const baseHynix = baseRow.hynix;
    const baseKrwhkd = baseRow.krwhkd;

    if (!baseInav) return; // At minimum need iNAV baseline

    // Calculate shadow iNAV for all rows (only when Hynix + FX available)
    const labels = data.map(d => d.time);
    const officialInav = [];
    const etfPrices = [];
    const shadowInav = [];
    const hasShadowData = baseHynix && baseKrwhkd;

    for (const d of data) {
        etfPrices.push(d.etf);
        officialInav.push(d.inav);

        if (hasShadowData && d.hynix && d.krwhkd) {
            const hynixChange = (d.hynix - baseHynix) / baseHynix;
            const fxChange = (d.krwhkd - baseKrwhkd) / baseKrwhkd;
            const shadowHkd = baseInav * (1 + hynixChange * 2) * (1 + fxChange);
            shadowInav.push(parseFloat(shadowHkd.toFixed(4)));
        } else {
            shadowInav.push(null);
        }
    }

    // Chart 1: iNAV vs ETF Price (full day direct comparison)
    const ctx1 = document.getElementById('chart-price-vs-inav').getContext('2d');
    if (chartPriceVsInav) chartPriceVsInav.destroy();

    chartPriceVsInav = new Chart(ctx1, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'ETF 成交价',
                    data: etfPrices,
                    borderColor: '#2563eb',
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false,
                },
                {
                    label: 'iNAV（官方）',
                    data: officialInav,
                    borderColor: '#16a34a',
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false,
                    spanGaps: true,
                },
            ],
        },
        options: {
            responsive: true,
            plugins: {
                title: { display: true, text: 'ETF成交价 vs 官方iNAV（全天对比）' },
                legend: { labels: { usePointStyle: true, pointStyle: 'line' } },
            },
            scales: { y: { title: { display: true, text: '价格 (HKD)' } } },
        },
    });

    // Chart 2: Shadow iNAV vs Official iNAV (full day validation)
    // Only render when Hynix + FX data available for shadow calculation
    const canvas2 = document.getElementById('chart-shadow-validation');
    const ctx2 = canvas2.getContext('2d');
    if (chartShadowValidation) { chartShadowValidation.destroy(); chartShadowValidation = null; }

    if (!hasShadowData) {
        // No shadow data — hide the chart entirely
        canvas2.parentElement.style.display = 'none';
        return;
    }
    canvas2.parentElement.style.display = '';

    const validationLabels = [];
    const officialLine = [];
    const shadowLine = [];
    const errorLine = [];

    for (let i = 0; i < data.length; i++) {
        if (officialInav[i] !== null && shadowInav[i] !== null) {
            validationLabels.push(data[i].time);
            officialLine.push(officialInav[i]);
            shadowLine.push(shadowInav[i]);
            errorLine.push(((shadowInav[i] - officialInav[i]) / officialInav[i] * 100));
        }
    }

    chartShadowValidation = new Chart(ctx2, {
        type: 'line',
        data: {
            labels: validationLabels,
            datasets: [
                {
                    label: '官方 iNAV (HKD)',
                    data: officialLine,
                    borderColor: '#16a34a',
                    borderWidth: 2,
                    pointRadius: 2,
                    yAxisID: 'y',
                    fill: false,
                },
                {
                    label: '影子 iNAV (HKD)',
                    data: shadowLine,
                    borderColor: '#f59e0b',
                    borderWidth: 2,
                    pointRadius: 2,
                    borderDash: [5, 3],
                    yAxisID: 'y',
                    fill: false,
                },
                {
                    label: '误差 (%)',
                    data: errorLine,
                    type: 'bar',
                    backgroundColor: errorLine.map(e => e >= 0 ? 'rgba(220, 38, 38, 0.3)' : 'rgba(37, 99, 235, 0.3)'),
                    borderColor: errorLine.map(e => e >= 0 ? 'rgba(220, 38, 38, 0.7)' : 'rgba(37, 99, 235, 0.7)'),
                    borderWidth: 1,
                    yAxisID: 'y1',
                },
            ],
        },
        options: {
            responsive: true,
            plugins: {
                title: { display: true, text: '影子iNAV校验（全天对比官方）' },
                legend: {
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'line',
                    },
                },
            },
            scales: {
                y: { position: 'left', title: { display: true, text: '价格 (HKD)' } },
                y1: { position: 'right', title: { display: true, text: '误差 (%)' }, grid: { drawOnChartArea: false } },
            },
        },
    });
}

// ===== Dashboard Rendering =====

let divergenceChart = null;

/**
 * Refresh the divergence dashboard independently from running backtest.
 * Parses the current data table and renders the dashboard if valid data exists.
 * Uses the current threshold from the params input for signal counting.
 */
function refreshDashboard() {
    const data = parseData();
    if (data.length < 2) return;

    const errors = validateData(data);
    if (errors.length > 0) return;

    const params = getParams();
    const analysis = analyzeDivergence(data, params.threshold);
    renderDashboard(data, params.threshold, analysis);

    // Render the last-row divergence indicator in the dashboard
    renderDashboardDivergenceIndicator(data);
}

/**
 * Show the latest divergence as a text indicator in the dashboard area.
 * Uses the last valid row's data to display ETF price, iNAV, divergence %, and action hint.
 */
function renderDashboardDivergenceIndicator(data) {
    const container = document.getElementById('dashboard-divergence-indicator');
    if (!container) return;

    // Find last row with valid premium
    const lastRow = [...data].reverse().find(r => r.premiumDiscount != null);
    if (!lastRow) { container.innerHTML = ''; return; }

    const divergence = lastRow.premiumDiscount;
    const absDivergence = Math.abs(divergence);
    const etf = lastRow.etfPrice;
    const inav = lastRow.inavPrice;
    const time = lastRow.time || '';

    let signalClass = '';
    let actionText = '';
    let actionClass = 'hold';

    if (absDivergence >= 2.0) {
        signalClass = 'signal-strong';
        actionText = divergence > 0 ? '强烈卖出ETF / 买入股票' : '强烈买入ETF / 卖出股票';
        actionClass = divergence > 0 ? 'sell' : 'buy';
    } else if (absDivergence >= 1.0) {
        signalClass = 'signal';
        actionText = divergence > 0 ? '考虑卖出ETF / 买入股票' : '考虑买入ETF / 卖出股票';
        actionClass = divergence > 0 ? 'sell' : 'buy';
    } else {
        actionText = '偏离不足，暂不交易';
    }

    const valueClass = divergence > 0.1 ? 'positive' : (divergence < -0.1 ? 'negative' : 'neutral');

    container.innerHTML = `
        <div class="div-card">
            <div class="div-value neutral">${etf ? etf.toFixed(2) : '-'}</div>
            <div class="div-label">ETF 最新价 (HKD)</div>
        </div>
        <div class="div-card">
            <div class="div-value neutral">${inav ? inav.toFixed(2) : '-'}</div>
            <div class="div-label">iNAV (HKD)</div>
        </div>
        <div class="div-card ${signalClass}">
            <div class="div-value ${valueClass}">${divergence >= 0 ? '+' : ''}${divergence.toFixed(3)}%</div>
            <div class="div-label">最新偏离度</div>
            <div class="div-action ${actionClass}">${actionText}</div>
        </div>
        <div class="div-card">
            <div class="div-value neutral">${time}</div>
            <div class="div-label">数据时间</div>
        </div>
    `;
}

function renderDashboard(data, threshold, analysis) {
    const dashboard = document.getElementById('dashboard');
    dashboard.classList.remove('hidden');

    if (!analysis) {
        analysis = analyzeDivergence(data, threshold);
    }

    // Render divergence chart
    renderDivergenceChart(data, threshold);

    // Render iNAV price comparison chart (official vs shadow HKD values)
    renderInavComparisonChart(data);

    // Render iNAV deviation chart (percentage difference)
    renderInavValidationChart(data);

    // Render before/after stats
    renderPeriodStats('before-stats', analysis.before, threshold);
    renderPeriodStats('after-stats', analysis.after, threshold);
}

/**
 * Build human-friendly X-axis labels for chart.
 * - Single day: 'HH:MM'
 * - Multi day:  'MM-DD HH:MM'
 */
function buildAxisLabels(data) {
    const dates = new Set(data.map(d => d.date || '').filter(Boolean));
    const multiDay = dates.size > 1;
    return data.map(d => {
        const time = d.time || '';
        if (!multiDay || !d.date) return time;
        // 'YYYY-MM-DD' -> 'MM-DD'
        const md = d.date.length >= 10 ? d.date.slice(5) : d.date;
        return `${md} ${time}`;
    });
}

function renderDivergenceChart(data, threshold) {
    const ctx = document.getElementById('divergence-chart').getContext('2d');
    if (divergenceChart) divergenceChart.destroy();

    const labels = buildAxisLabels(data);
    const premiums = data.map(d => d.premiumDiscount);
    const { dayBoundaries, cutoffIndices } = findChartMarkers(data);

    divergenceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: '溢价/折价率 (%)',
                data: premiums,
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 5,
                pointHitRadius: 10,
                segment: {
                    borderColor: (ctx) => ctx.p1.parsed.y >= 0 ? '#dc2626' : '#2563eb',
                },
                fill: {
                    target: { value: 0 },
                    above: 'rgba(220, 38, 38, 0.08)',
                    below: 'rgba(37, 99, 235, 0.08)',
                },
            }],
        },
        options: {
            responsive: true,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                title: { display: true, text: 'ETF与iNAV偏离走势' },
                legend: {
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'line',
                    },
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const val = ctx.parsed.y;
                            if (val == null) return '';
                            const sign = val >= 0 ? '+' : '';
                            const tag = val >= 0 ? '溢价' : '折价';
                            return `${tag}: ${sign}${val.toFixed(3)}%`;
                        },
                        labelColor: (ctx) => {
                            const val = ctx.parsed.y;
                            const color = val >= 0 ? '#dc2626' : '#2563eb';
                            return { borderColor: color, backgroundColor: color };
                        }
                    }
                },
                annotation: undefined,
            },
            scales: {
                y: {
                    title: { display: true, text: '偏离率 (%)' },
                },
            },
        },
        plugins: [{
            id: 'thresholdAndMarkers',
            afterDraw(chart) {
                const { ctx, chartArea, scales } = chart;
                const yScale = scales.y;
                const xScale = scales.x;

                ctx.save();

                // Threshold horizontal lines (only draw if within chart area)
                ctx.setLineDash([5, 5]);
                ctx.strokeStyle = '#dc2626';
                ctx.lineWidth = 1;
                const yTop = yScale.getPixelForValue(threshold);
                const yBottom = yScale.getPixelForValue(-threshold);
                if (yTop >= chartArea.top && yTop <= chartArea.bottom) {
                    ctx.beginPath();
                    ctx.moveTo(chartArea.left, yTop);
                    ctx.lineTo(chartArea.right, yTop);
                    ctx.stroke();
                }
                if (yBottom >= chartArea.top && yBottom <= chartArea.bottom) {
                    ctx.beginPath();
                    ctx.moveTo(chartArea.left, yBottom);
                    ctx.lineTo(chartArea.right, yBottom);
                    ctx.stroke();
                }

                // Per-day cutoff (14:30) lines
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = '#ca8a04';
                ctx.lineWidth = 1.5;
                for (const idx of cutoffIndices) {
                    const xPos = xScale.getPixelForValue(idx);
                    ctx.beginPath();
                    ctx.moveTo(xPos, chartArea.top);
                    ctx.lineTo(xPos, chartArea.bottom);
                    ctx.stroke();
                }

                // Day boundary solid lines (multi-day only)
                ctx.setLineDash([]);
                ctx.strokeStyle = 'rgba(15, 23, 42, 0.18)';
                ctx.lineWidth = 1;
                for (const idx of dayBoundaries) {
                    const xPos = xScale.getPixelForValue(idx);
                    ctx.beginPath();
                    ctx.moveTo(xPos, chartArea.top);
                    ctx.lineTo(xPos, chartArea.bottom);
                    ctx.stroke();
                }

                // Label the first cutoff (avoid clutter when many days)
                if (cutoffIndices.length > 0) {
                    ctx.fillStyle = '#ca8a04';
                    ctx.font = '11px sans-serif';
                    const xPos = xScale.getPixelForValue(cutoffIndices[0]);
                    const labelText = cutoffIndices.length > 1
                        ? `14:30 主板收盘 (×${cutoffIndices.length})`
                        : '14:30 主板收盘';
                    ctx.fillText(labelText, xPos + 4, chartArea.top + 14);
                }

                ctx.restore();
            }
        }],
    });
}

let inavComparisonChart = null;

/**
 * Render chart showing official iNAV and shadow iNAV actual HKD values over the full day.
 * Visually demonstrates that official iNAV freezes after 14:30 while shadow (KT-based) continues.
 */
function renderInavComparisonChart(data) {
    const canvas = document.getElementById('inav-comparison-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (inavComparisonChart) inavComparisonChart.destroy();

    // We need rows that have both official iNAV and shadow iNAV data
    // Official iNAV price = row.inavPrice
    // Shadow iNAV price = baseInav * (1 + shadowInavChange/100)
    // We can reconstruct shadow price from the first row's iNAV + shadowInavChange
    const baseInav = data.length > 0 ? data[0].inavPrice : null;
    if (!baseInav) {
        canvas.parentElement.style.display = 'none';
        inavComparisonChart = null;
        return;
    }

    // Only show rows that have both official and shadow
    const validRows = data.filter(r => r.inavPrice && r.shadowInavChange !== null);
    if (validRows.length < 2) {
        canvas.parentElement.style.display = 'none';
        inavComparisonChart = null;
        return;
    }
    canvas.parentElement.style.display = '';

    const labels = validRows.map(r => r.time || '');
    const officialLine = validRows.map(r => r.inavPrice);
    const shadowLine = validRows.map(r => baseInav * (1 + r.shadowInavChange / 100));

    // Find 14:30 cutoff
    const cutoffIdx = validRows.findIndex(r => r.time && r.time > '14:30');

    inavComparisonChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: '官方 iNAV (HKD)',
                    data: officialLine,
                    borderColor: '#2563eb',
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    fill: false,
                },
                {
                    label: '影子 iNAV (HKD)',
                    data: shadowLine,
                    borderColor: '#f59e0b',
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    borderDash: [5, 3],
                    fill: false,
                },
            ],
        },
        options: {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                title: { display: true, text: '官方 iNAV vs 影子 iNAV（HKD 价格对比）' },
                legend: { labels: { usePointStyle: true, pointStyle: 'line' } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const val = ctx.parsed.y;
                            return `${ctx.dataset.label}: ${val != null ? val.toFixed(2) : '-'}`;
                        }
                    }
                },
            },
            scales: {
                y: { title: { display: true, text: '价格 (HKD)' } },
            },
        },
        plugins: [{
            id: 'comparisonCutoff',
            afterDraw(chart) {
                if (cutoffIdx <= 0) return;
                const { ctx, chartArea, scales } = chart;
                const xPos = scales.x.getPixelForValue(cutoffIdx);
                ctx.save();
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = '#ca8a04';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(xPos, chartArea.top);
                ctx.lineTo(xPos, chartArea.bottom);
                ctx.stroke();
                ctx.fillStyle = '#ca8a04';
                ctx.font = '11px sans-serif';
                ctx.fillText('14:30', xPos + 4, chartArea.top + 14);
                ctx.restore();
            }
        }],
    });
}

let inavValidationChart = null;

/**
 * Render chart comparing official iNAV vs shadow iNAV deviation over time.
 * Shows how the official iNAV diverges from reality (KT-based shadow) after 14:30.
 */
function renderInavValidationChart(data) {
    const canvas = document.getElementById('inav-validation-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (inavValidationChart) inavValidationChart.destroy();

    // Filter rows that have BOTH official and shadow iNAV changes
    const validRows = data.filter(r => r.officialInavChange !== null && r.shadowInavChange !== null);

    if (validRows.length < 2) {
        canvas.parentElement.style.display = 'none';
        inavValidationChart = null;
        return;
    }
    canvas.parentElement.style.display = '';

    const labels = validRows.map(r => r.time || '');
    const deviations = validRows.map(r => r.shadowInavChange - r.officialInavChange);

    // Find 14:30 cutoff index for vertical line
    const cutoffIdx = validRows.findIndex(r => r.time && r.time > '14:30');

    inavValidationChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: '影子iNAV vs 官方iNAV 偏差 (%)',
                data: deviations,
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 5,
                pointHitRadius: 10,
                segment: {
                    borderColor: (ctx) => {
                        const idx = ctx.p1DataIndex;
                        return (cutoffIdx > 0 && idx >= cutoffIdx) ? '#dc2626' : '#16a34a';
                    }
                },
                fill: {
                    target: { value: 0 },
                    above: 'rgba(220, 38, 38, 0.06)',
                    below: 'rgba(37, 99, 235, 0.06)',
                },
            }],
        },
        options: {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                title: { display: true, text: '官方iNAV vs 影子iNAV 偏差（验证iNAV准确性）' },
                legend: { labels: { usePointStyle: true, pointStyle: 'line' } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const val = ctx.parsed.y;
                            if (val == null) return '';
                            return `偏差: ${val >= 0 ? '+' : ''}${val.toFixed(3)}%`;
                        }
                    }
                },
            },
            scales: {
                y: { title: { display: true, text: '偏差 (%)' } },
            },
        },
        plugins: [{
            id: 'inavCutoffLine',
            afterDraw(chart) {
                if (cutoffIdx <= 0) return;
                const { ctx, chartArea, scales } = chart;
                const xScale = scales.x;
                const xPos = xScale.getPixelForValue(cutoffIdx);
                ctx.save();
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = '#ca8a04';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(xPos, chartArea.top);
                ctx.lineTo(xPos, chartArea.bottom);
                ctx.stroke();
                ctx.fillStyle = '#ca8a04';
                ctx.font = '11px sans-serif';
                ctx.fillText('14:30 主板收盘', xPos + 4, chartArea.top + 14);
                ctx.restore();
            }
        }],
    });
}

function renderPeriodStats(containerId, stats, threshold) {
    const container = document.getElementById(containerId);
    container.innerHTML = `
        <div class="mini-stat"><div class="val" style="color:#dc2626">${stats.maxPremium.toFixed(2)}%</div><div class="lbl">最大溢价</div></div>
        <div class="mini-stat"><div class="val" style="color:#2563eb">${stats.maxDiscount.toFixed(2)}%</div><div class="lbl">最大折价</div></div>
        <div class="mini-stat"><div class="val">${stats.signalCount}</div><div class="lbl">超阈值次数</div></div>
        <div class="mini-stat"><div class="val">${stats.avgAbs.toFixed(2)}%</div><div class="lbl">平均|偏离|</div></div>
    `;
}

document.addEventListener('DOMContentLoaded', init);

// Navbar active link tracking on scroll
(function() {
    const navLinks = document.querySelectorAll('.nav-links a');
    const sections = Array.from(navLinks).map(link => {
        const id = link.getAttribute('href').slice(1);
        return document.getElementById(id);
    }).filter(Boolean);

    function updateActiveLink() {
        const scrollPos = window.scrollY + 80;
        let activeIndex = 0;

        for (let i = 0; i < sections.length; i++) {
            if (sections[i].offsetTop <= scrollPos) {
                activeIndex = i;
            }
        }

        navLinks.forEach((link, i) => {
            link.classList.toggle('active', i === activeIndex);
        });
    }

    window.addEventListener('scroll', updateActiveLink);
    updateActiveLink();
})();
