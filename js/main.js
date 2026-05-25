// js/main.js

import { renderTable, renderBaseline, addRow, deleteLastRow, clearAll, parseData, validateData, getColumns, updateBacktestShadowColumn } from './data-input.js';
import { runBacktest, analyzeDivergence, findChartMarkers } from './backtest-engine.js';
import { calculateStatistics } from './statistics.js';
import { renderCharts, destroyCharts } from './charts.js';
import { generateConclusion } from './conclusion.js';

function getParams() {
    return {
        threshold: parseFloat(document.getElementById('threshold').value) || 1.5,
        txCost: parseFloat(document.getElementById('tx-cost').value) || 0.2,
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
            importBacktestFile(e.target.files[0]);
            e.target.value = '';
            // Auto-refresh dashboard after import
            setTimeout(refreshDashboard, 100);
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

    // Run backtest engine
    const trades = runBacktest(data, params);

    // Calculate results
    const totalProfitHKD = trades.reduce((s, t) => s + t.profitHKD, 0);
    const profitableTrades = trades.filter(t => t.netProfit > 0);
    const dayCount = analysis.byDate.length;

    // Show results section
    const resultsSection = document.getElementById('backtest-results');
    resultsSection.classList.remove('hidden');

    // Render simplified stats
    renderStatsPanel({
        totalProfitHKD,
        totalTrades: trades.length,
        profitableTrades: profitableTrades.length,
        avgProfit: trades.length > 0 ? totalProfitHKD / trades.length : 0,
        beforeCount: analysis.before.signalCount,
        afterCount: analysis.after.signalCount,
        dayCount,
    });

    // Render charts
    destroyCharts();
    renderCharts(data, trades);

    // Shadow iNAV validation (when both official iNAV and Hynix+FX available)
    renderShadowValidation(data);

    // Render trade log
    renderByDate(trades, analysis);
    renderTradeLog(trades);

    // Generate and show conclusion
    const stats = calculateStatistics(trades.map(t => ({ pnl: t.netProfit })));
    const conclusion = generateConclusion(stats);
    renderConclusion(conclusion);
}

function renderStatsPanel(stats) {
    const panel = document.getElementById('stats-panel');
    const items = [
        { label: '覆盖天数', value: `${stats.dayCount} 天`, hint: '回测数据涉及的交易日数' },
        { label: '总套利收益', value: `${stats.totalProfitHKD.toFixed(0)} HKD`, hint: '所有调仓交易的累计净收益' },
        { label: '信号触发', value: `${stats.totalTrades} 次`, hint: '背离超阈值的调仓次数' },
        { label: '有效交易', value: `${stats.profitableTrades} 次`, hint: '扣除费用后仍盈利的交易' },
        { label: '平均单次收益', value: `${stats.avgProfit.toFixed(0)} HKD`, hint: '总收益 / 交易次数' },
        { label: '14:30前信号', value: `${stats.beforeCount} 次`, hint: '韩国主板交易时段的信号（多日累计）' },
        { label: '14:30后信号', value: `${stats.afterCount} 次`, hint: '韩国主板收盘后的信号（多日累计）' },
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
        const winRate = tList.length > 0 ? (wins / tList.length) * 100 : 0;
        const pnlColor = dayPnl >= 0 ? '#16a34a' : '#dc2626';
        return `
            <tr>
                <td>${day.date}</td>
                <td>${day.count}</td>
                <td>${day.signalCount}</td>
                <td>${tList.length}</td>
                <td>${wins} / ${tList.length} (${winRate.toFixed(0)}%)</td>
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
                    <th>交易数</th>
                    <th>胜率</th>
                    <th>最大溢价</th>
                    <th>最大折价</th>
                    <th>平均|偏离|</th>
                    <th>当日收益</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
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
            <td>${t.date && t.date !== '__single__' ? t.date : '-'}</td>
            <td>${t.entryTime || t.entryIndex}</td>
            <td>${t.exitTime || t.exitIndex}</td>
            <td>${t.direction === 'sell_etf_buy_stock' ? '卖ETF/买股票' : '买ETF/卖股票'}</td>
            <td>${t.entryPremium.toFixed(2)}%</td>
            <td>${t.exitPremium.toFixed(2)}%</td>
            <td style="color:${t.netProfit >= 0 ? '#16a34a' : '#dc2626'}">${t.profitHKD.toFixed(0)} HKD</td>
            <td>${formatExitReason(t.exitReason)}</td>
        </tr>
    `).join('');

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>日期</th>
                    <th>调仓时间</th>
                    <th>回归时间</th>
                    <th>方向</th>
                    <th>入场背离</th>
                    <th>出场背离</th>
                    <th>收益</th>
                    <th>退出原因</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function formatExitReason(reason) {
    const map = {
        'reversion': '背离回归',
        'cross_zero': '穿越零轴',
        'end_of_day': '当日收盘',
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
    const validRows = data.filter(r => r.inavSource === 'truth' && r.shadowInavChange !== null);

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
    const officialLine = validRows.map(r => r.inavChange);
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

            // Detect BBG BDH format: row[0] has col[1] as a large serial date (>40000)
            // and col[2] === 'TRADE'
            const firstRow = rows[0];
            const isBBGFormat = firstRow &&
                typeof firstRow[1] === 'number' && firstRow[1] > 40000 &&
                String(firstRow[2] || '').toUpperCase() === 'TRADE';

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

            // Map each raw row to the 6-column entry shape used by the table.
            const mapRow = (r) => {
                const date = normalizeDate(r[0]);
                const time = normalizeTime(r[1]);
                const v = (i) => (r[i] != null && r[i] !== '' ? String(r[i]) : '');
                if (colCount >= 6 || (headerHasInav && colCount > 4)) {
                    // Modern 6-column layout
                    return { date, time, inavPrice: v(2), hynixPrice: v(3), fxRate: v(4), etfPrice: v(5) };
                }
                if (headerHasInav) {
                    // Legacy: 日期 | 时间 | iNAV | ETF
                    return { date, time, inavPrice: v(2), hynixPrice: '', fxRate: '', etfPrice: v(3) };
                }
                if (headerHasHynix) {
                    // Legacy: 日期 | 时间 | 海力士 | 汇率 | ETF
                    return { date, time, inavPrice: '', hynixPrice: v(2), fxRate: v(3), etfPrice: v(4) };
                }
                // Unknown: treat as modern layout best-effort
                return { date, time, inavPrice: v(2), hynixPrice: v(3), fxRate: v(4), etfPrice: v(5) };
            };

            const cols = getColumns();
            const tbody = document.getElementById('data-tbody');
            const html = dataRows.map(r => {
                const entry = mapRow(r);
                const cells = cols.map(c => {
                    const value = entry[c.key] !== undefined ? entry[c.key] : '';
                    const readonlyAttr = c.readonly ? 'readonly tabindex="-1"' : '';
                    const cls = c.readonly ? ' class="shadow-cell"' : '';
                    return `<td><input type="${c.type}" data-key="${c.key}" placeholder="${c.placeholder}" step="any" value="${value}" ${readonlyAttr}${cls}></td>`;
                }).join('');
                return `<tr>${cells}</tr>`;
            }).join('');
            tbody.innerHTML = html;

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
        } catch (err) {
            setBtImportStatus('文件解析失败: ' + err.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

/**
 * Parse BBG BDH format (raw tick export from Bloomberg Excel).
 * Layout: ColA=ticker, ColB=serial_datetime, ColC="TRADE", ColD=iNAV_value, ColE=0
 *         ColG=ticker, ColH=serial_datetime, ColI="TRADE", ColJ=ETF_value, ColK=0
 * Merges iNAV ticks and ETF ticks by minute into unified rows.
 */
function parseBBGBacktestData(rows) {
    // Build time -> value maps
    const inavByMinute = new Map();
    const etfByMinute = new Map();
    let dateStr = '';

    for (const row of rows) {
        // iNAV column (B=1, D=3)
        if (row[1] && typeof row[1] === 'number' && row[1] > 40000 && row[3] != null) {
            if (!dateStr) dateStr = serialToDateStr(row[1]);
            const time = serialToTimeStr(row[1]);
            if (!inavByMinute.has(time)) inavByMinute.set(time, row[3]);
        }
        // ETF column (H=7, J=9)
        if (row[7] && typeof row[7] === 'number' && row[7] > 40000 && row[9] != null) {
            if (!dateStr) dateStr = serialToDateStr(row[7]);
            const time = serialToTimeStr(row[7]);
            if (!etfByMinute.has(time)) etfByMinute.set(time, row[9]);
        }
    }

    // Merge all unique times, sorted
    const allTimes = [...new Set([...inavByMinute.keys(), ...etfByMinute.keys()])].sort();

    // Sample at 5-minute intervals to keep table manageable
    const sampledTimes = allTimes.filter(t => {
        const m = parseInt(t.split(':')[1], 10);
        return m % 5 === 0;
    });

    // If still too many rows (>80), sample at 15-min intervals
    const finalTimes = sampledTimes.length > 80
        ? sampledTimes.filter(t => { const m = parseInt(t.split(':')[1], 10); return m % 15 === 0; })
        : sampledTimes;

    const cols = getColumns();
    const tbody = document.getElementById('data-tbody');
    const html = finalTimes.map(time => {
        const inav = inavByMinute.get(time);
        const etf = etfByMinute.get(time);
        const entry = {
            date: dateStr,
            time,
            inavPrice: inav != null ? inav.toFixed(4) : '',
            hynixPrice: '',
            fxRate: '',
            etfPrice: etf != null ? etf.toFixed(2) : '',
        };
        const cells = cols.map(c => {
            const value = entry[c.key] !== undefined ? entry[c.key] : '';
            const readonlyAttr = c.readonly ? 'readonly tabindex="-1"' : '';
            const cls = c.readonly ? ' class="shadow-cell"' : '';
            return `<td><input type="${c.type}" data-key="${c.key}" placeholder="${c.placeholder}" step="any" value="${value}" ${readonlyAttr}${cls}></td>`;
        }).join('');
        return `<tr>${cells}</tr>`;
    }).join('');
    tbody.innerHTML = html;

    const inavCount = [...finalTimes].filter(t => inavByMinute.has(t)).length;
    const etfCount = [...finalTimes].filter(t => etfByMinute.has(t)).length;
    setBtImportStatus(
        `BBG格式已识别 — 导入 ${finalTimes.length} 行（${dateStr}），iNAV ${inavCount} 条，ETF ${etfCount} 条`,
        'success'
    );
}

/**
 * Convert Excel serial datetime to 'YYYY-MM-DD'.
 */
function serialToDateStr(serial) {
    const d = new Date((serial - 25569) * 86400 * 1000);
    return d.toISOString().slice(0, 10);
}

/**
 * Convert Excel serial datetime to 'HH:MM'.
 */
function serialToTimeStr(serial) {
    const totalSeconds = Math.round((serial % 1) * 86400);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
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
                        ? `14:30 韩国收盘 (×${cutoffIndices.length})`
                        : '14:30 韩国收盘';
                    ctx.fillText(labelText, xPos + 4, chartArea.top + 14);
                }

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
