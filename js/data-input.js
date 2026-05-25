// js/data-input.js

// Unified column schema for the backtest table.
// Per-row iNAV resolution is handled in parseData(): if `iNAV(HKD)` is given,
// use it as the truth; otherwise fall back to the synthetic shadow iNAV
// derived from `海力士股价(KRW)` + `KRW/HKD汇率`. Rows that cannot resolve
// either way are silently skipped.
const COLUMNS = [
    { key: 'date',       label: '日期',          type: 'text',   placeholder: 'YYYY-MM-DD' },
    { key: 'time',       label: '时间',          type: 'text',   placeholder: 'HH:MM' },
    { key: 'inavPrice',  label: 'iNAV(HKD)',     type: 'number', placeholder: '官方值' },
    { key: 'shadowInav', label: '影子iNAV',      type: 'number', placeholder: '自动计算', readonly: true },
    { key: 'hynixPrice', label: '海力士股价(KRW)', type: 'number', placeholder: '201000' },
    { key: 'fxRate',     label: 'KRW/HKD汇率',    type: 'number', placeholder: '0.00600' },
    { key: 'etfPrice',   label: 'ETF市价(HKD)',   type: 'number', placeholder: '10.15' },
];

// Demo data from actual BBG export (2026-05-21), 5-min intervals.
// iNAV + ETF from BBG; Hynix approximated from ETF movements (at half rate for 2x leverage);
// FX ≈ 0.006 KRW/HKD. Shadow iNAV will show meaningful error vs official iNAV.
const DEMO_DATA = [
    { date: '2026-05-21', time: '09:30', inavPrice: '93.8025', hynixPrice: '200000', fxRate: '0.006000', etfPrice: '93.62' },
    { date: '2026-05-21', time: '09:35', inavPrice: '94.5392', hynixPrice: '201294', fxRate: '0.006000', etfPrice: '94.90' },
    { date: '2026-05-21', time: '09:40', inavPrice: '94.5432', hynixPrice: '201066', fxRate: '0.006000', etfPrice: '94.62' },
    { date: '2026-05-21', time: '09:45', inavPrice: '93.9899', hynixPrice: '200523', fxRate: '0.006000', etfPrice: '94.12' },
    { date: '2026-05-21', time: '09:50', inavPrice: '93.8768', hynixPrice: '200269', fxRate: '0.006000', etfPrice: '93.90' },
    { date: '2026-05-21', time: '09:55', inavPrice: '92.7595', hynixPrice: '199250', fxRate: '0.006000', etfPrice: '92.74' },
    { date: '2026-05-21', time: '10:00', inavPrice: '93.5937', hynixPrice: '200292', fxRate: '0.006001', etfPrice: '94.00' },
    { date: '2026-05-21', time: '10:05', inavPrice: '94.4255', hynixPrice: '200615', fxRate: '0.006001', etfPrice: '94.44' },
    { date: '2026-05-21', time: '10:10', inavPrice: '94.9757', hynixPrice: '201291', fxRate: '0.006001', etfPrice: '95.22' },
    { date: '2026-05-21', time: '10:15', inavPrice: '94.7949', hynixPrice: '201257', fxRate: '0.006001', etfPrice: '95.00' },
    { date: '2026-05-21', time: '10:20', inavPrice: '95.6099', hynixPrice: '202229', fxRate: '0.006001', etfPrice: '95.82' },
    { date: '2026-05-21', time: '10:25', inavPrice: '96.4301', hynixPrice: '203305', fxRate: '0.006001', etfPrice: '96.72' },
    { date: '2026-05-21', time: '10:30', inavPrice: '97.5257', hynixPrice: '204347', fxRate: '0.006001', etfPrice: '97.78' },
    { date: '2026-05-21', time: '10:35', inavPrice: '97.3363', hynixPrice: '203836', fxRate: '0.006001', etfPrice: '97.62' },
    { date: '2026-05-21', time: '10:40', inavPrice: '98.3503', hynixPrice: '204280', fxRate: '0.006001', etfPrice: '98.66' },
    { date: '2026-05-21', time: '10:45', inavPrice: '97.8002', hynixPrice: '203267', fxRate: '0.006001', etfPrice: '97.88' },
    { date: '2026-05-21', time: '10:50', inavPrice: '97.2536', hynixPrice: '202839', fxRate: '0.006002', etfPrice: '97.40' },
    { date: '2026-05-21', time: '10:55', inavPrice: '97.4287', hynixPrice: '203187', fxRate: '0.006002', etfPrice: '97.56' },
    { date: '2026-05-21', time: '11:00', inavPrice: '97.0448', hynixPrice: '203178', fxRate: '0.006002', etfPrice: '97.10' },
    { date: '2026-05-21', time: '11:05', inavPrice: '97.1452', hynixPrice: '203513', fxRate: '0.006002', etfPrice: '97.08' },
    { date: '2026-05-21', time: '11:10', inavPrice: '97.5069', hynixPrice: '204096', fxRate: '0.006002', etfPrice: '97.46' },
    { date: '2026-05-21', time: '11:15', inavPrice: '97.6997', hynixPrice: '204195', fxRate: '0.006002', etfPrice: '97.64' },
    { date: '2026-05-21', time: '11:20', inavPrice: '97.8838', hynixPrice: '204056', fxRate: '0.006002', etfPrice: '97.86' },
    { date: '2026-05-21', time: '11:25', inavPrice: '98.3467', hynixPrice: '203963', fxRate: '0.006002', etfPrice: '98.30' },
    { date: '2026-05-21', time: '11:30', inavPrice: '98.2587', hynixPrice: '203446', fxRate: '0.006002', etfPrice: '98.12' },
    { date: '2026-05-21', time: '11:35', inavPrice: '98.1743', hynixPrice: '203442', fxRate: '0.006003', etfPrice: '98.20' },
    { date: '2026-05-21', time: '11:40', inavPrice: '98.1690', hynixPrice: '203520', fxRate: '0.006003', etfPrice: '97.96' },
    { date: '2026-05-21', time: '11:45', inavPrice: '97.7968', hynixPrice: '203737', fxRate: '0.006003', etfPrice: '97.70' },
    { date: '2026-05-21', time: '11:50', inavPrice: '96.9680', hynixPrice: '203336', fxRate: '0.006003', etfPrice: '96.90' },
    { date: '2026-05-21', time: '11:55', inavPrice: '96.9657', hynixPrice: '203542', fxRate: '0.006003', etfPrice: '96.94' },
    { date: '2026-05-21', time: '13:00', inavPrice: '97.6989', hynixPrice: '202763', fxRate: '0.006004', etfPrice: '97.24' },
    { date: '2026-05-21', time: '13:05', inavPrice: '97.4335', hynixPrice: '202981', fxRate: '0.006004', etfPrice: '97.58' },
    { date: '2026-05-21', time: '13:10', inavPrice: '97.3319', hynixPrice: '203001', fxRate: '0.006004', etfPrice: '97.30' },
    { date: '2026-05-21', time: '13:15', inavPrice: '97.5081', hynixPrice: '203538', fxRate: '0.006005', etfPrice: '97.46' },
    { date: '2026-05-21', time: '13:20', inavPrice: '97.5102', hynixPrice: '204003', fxRate: '0.006005', etfPrice: '97.54' },
    { date: '2026-05-21', time: '13:25', inavPrice: '98.0532', hynixPrice: '204590', fxRate: '0.006005', etfPrice: '97.92' },
    { date: '2026-05-21', time: '13:30', inavPrice: '97.4969', hynixPrice: '203823', fxRate: '0.006005', etfPrice: '97.30' },
    { date: '2026-05-21', time: '13:35', inavPrice: '97.4062', hynixPrice: '203396', fxRate: '0.006005', etfPrice: '97.20' },
    { date: '2026-05-21', time: '13:40', inavPrice: '97.4052', hynixPrice: '203055', fxRate: '0.006005', etfPrice: '97.26' },
    { date: '2026-05-21', time: '13:45', inavPrice: '97.4047', hynixPrice: '202759', fxRate: '0.006005', etfPrice: '97.24' },
    { date: '2026-05-21', time: '13:50', inavPrice: '97.7622', hynixPrice: '203044', fxRate: '0.006005', etfPrice: '97.66' },
    { date: '2026-05-21', time: '13:55', inavPrice: '98.2345', hynixPrice: '203565', fxRate: '0.006005', etfPrice: '97.98' },
    { date: '2026-05-21', time: '14:00', inavPrice: '98.4129', hynixPrice: '204251', fxRate: '0.006005', etfPrice: '98.22' },
    { date: '2026-05-21', time: '14:05', inavPrice: '98.5917', hynixPrice: '204849', fxRate: '0.006006', etfPrice: '98.36' },
    { date: '2026-05-21', time: '14:10', inavPrice: '98.8605', hynixPrice: '205317', fxRate: '0.006006', etfPrice: '98.60' },
    { date: '2026-05-21', time: '14:15', inavPrice: '98.3192', hynixPrice: '204627', fxRate: '0.006006', etfPrice: '98.08' },
    { date: '2026-05-21', time: '14:20', inavPrice: '97.3121', hynixPrice: '203141', fxRate: '0.006006', etfPrice: '96.94' },
    { date: '2026-05-21', time: '14:25', inavPrice: '95.4980', hynixPrice: '201757', fxRate: '0.006006', etfPrice: '95.72' },
    { date: '2026-05-21', time: '14:30', inavPrice: '96.6956', hynixPrice: '202405', fxRate: '0.006006', etfPrice: '96.78' },
    { date: '2026-05-21', time: '14:35', inavPrice: '96.6910', hynixPrice: '201886', fxRate: '0.006006', etfPrice: '96.12' },
    { date: '2026-05-21', time: '14:40', inavPrice: '96.7735', hynixPrice: '201722', fxRate: '0.006006', etfPrice: '95.72' },
    { date: '2026-05-21', time: '14:45', inavPrice: '96.7672', hynixPrice: '202076', fxRate: '0.006006', etfPrice: '95.86' },
    { date: '2026-05-21', time: '14:50', inavPrice: '96.0420', hynixPrice: '202316', fxRate: '0.006006', etfPrice: '95.88' },
    { date: '2026-05-21', time: '14:55', inavPrice: '96.0512', hynixPrice: '201495', fxRate: '0.006007', etfPrice: '95.02' },
    { date: '2026-05-21', time: '15:00', inavPrice: '96.0447', hynixPrice: '200911', fxRate: '0.006007', etfPrice: '94.50' },
    { date: '2026-05-21', time: '15:05', inavPrice: '96.0624', hynixPrice: '200019', fxRate: '0.006007', etfPrice: '93.64' },
    { date: '2026-05-21', time: '15:10', inavPrice: '96.0701', hynixPrice: '200234', fxRate: '0.006007', etfPrice: '93.90' },
    { date: '2026-05-21', time: '15:15', inavPrice: '96.0734', hynixPrice: '199757', fxRate: '0.006007', etfPrice: '93.30' },
    { date: '2026-05-21', time: '15:20', inavPrice: '96.0482', hynixPrice: '198852', fxRate: '0.006007', etfPrice: '92.10' },
    { date: '2026-05-21', time: '15:25', inavPrice: '96.0478', hynixPrice: '199573', fxRate: '0.006007', etfPrice: '93.10' },
    { date: '2026-05-21', time: '15:30', inavPrice: '96.0408', hynixPrice: '200316', fxRate: '0.006007', etfPrice: '93.96' },
    { date: '2026-05-21', time: '15:35', inavPrice: '96.0423', hynixPrice: '200534', fxRate: '0.006007', etfPrice: '94.14' },
    { date: '2026-05-21', time: '15:40', inavPrice: '96.0411', hynixPrice: '199765', fxRate: '0.006007', etfPrice: '93.40' },
    { date: '2026-05-21', time: '15:45', inavPrice: '96.0482', hynixPrice: '199835', fxRate: '0.006007', etfPrice: '93.46' },
    { date: '2026-05-21', time: '15:50', inavPrice: '96.0574', hynixPrice: '199774', fxRate: '0.006008', etfPrice: '93.38' },
    { date: '2026-05-21', time: '15:55', inavPrice: '96.0712', hynixPrice: '200150', fxRate: '0.006008', etfPrice: '93.80' },
];

export function getColumns() {
    return COLUMNS;
}

function getDemoData() {
    return DEMO_DATA;
}

/**
 * Render the baseline notice. Baselines are now derived automatically from the
 * first row of each trading day, so this section only renders an informational
 * tip; the previous explicit input fields are retired.
 */
export function renderBaseline(container) {
    container.innerHTML = `
        <div class="baseline-notice">
            <div class="baseline-notice-row"><strong>基准价格</strong>：自动取每个交易日<strong>第一行</strong>（通常为 09:30 开盘值），无需手动填写。</div>
            <div class="baseline-notice-row"><strong>iNAV 来源</strong>：每行<strong>独立判断</strong>。</div>
            <ul class="baseline-notice-list">
                <li><span class="tag-truth">真 iNAV</span> 该行 <code>iNAV(HKD)</code> 列有值时直接使用，最准。建议从 BBG <code>7709IV HK Equity</code> 导出 09:30–14:30 的分钟数据。</li>
                <li><span class="tag-shadow">影子 iNAV</span> 该行 <code>iNAV(HKD)</code> 留空、但 <code>海力士股价</code> 与 <code>汇率</code> 都有值时，系统按 <code>海力士涨跌% × 2 + 汇率涨跌%</code> 自动合成（用于覆盖 14:30 之后 BBG 停更的窗口）。</li>
                <li><span class="tag-skip">跳过</span> 三者都不全的行不参与回测。</li>
            </ul>
        </div>
    `;
}

/**
 * Render the unified intraday data table.
 */
export function renderTable(container) {
    const html = `
        <table>
            <thead>
                <tr>${COLUMNS.map(c => `<th>${c.label}</th>`).join('')}</tr>
            </thead>
            <tbody id="data-tbody">
                ${generateRowsWithData(DEMO_DATA)}
            </tbody>
        </table>
    `;
    container.innerHTML = html;
}

function generateRowsWithData(dataRows) {
    return dataRows.map(rowData => generateRowWithData(rowData)).join('');
}

function generateRowWithData(rowData) {
    const cells = COLUMNS.map(c => {
        const value = rowData && rowData[c.key] !== undefined ? rowData[c.key] : '';
        const readonlyAttr = c.readonly ? 'readonly tabindex="-1"' : '';
        const cls = c.readonly ? ' class="shadow-cell"' : '';
        return `<td><input type="${c.type}" data-key="${c.key}" placeholder="${c.placeholder}" step="any" value="${value}" ${readonlyAttr}${cls}></td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
}

function generateRow() {
    const cells = COLUMNS.map(c => {
        const readonlyAttr = c.readonly ? 'readonly tabindex="-1"' : '';
        const cls = c.readonly ? ' class="shadow-cell"' : '';
        return `<td><input type="${c.type}" data-key="${c.key}" placeholder="${c.placeholder}" step="any" ${readonlyAttr}${cls}></td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
}

export function addRow() {
    const tbody = document.getElementById('data-tbody');
    if (!tbody) return;
    tbody.insertAdjacentHTML('beforeend', generateRow());
}

export function deleteLastRow() {
    const tbody = document.getElementById('data-tbody');
    if (!tbody) return;
    const rows = tbody.querySelectorAll('tr');
    if (rows.length > 1) {
        rows[rows.length - 1].remove();
    }
}

export function clearAll() {
    const tableContainer = document.getElementById('data-table-container');
    const baselineContainer = document.getElementById('baseline-inputs');
    if (tableContainer) renderTable(tableContainer);
    if (baselineContainer) renderBaseline(baselineContainer);
}

/**
 * Read every input row from the table into raw entries, preserving order.
 * Empty rows (no numeric values at all) are skipped.
 */
function readRows() {
    const tbody = document.getElementById('data-tbody');
    if (!tbody) return [];
    const out = [];
    for (const tr of tbody.querySelectorAll('tr')) {
        const inputs = tr.querySelectorAll('input');
        const entry = {};
        let hasNumeric = false;
        inputs.forEach((input, i) => {
            const col = COLUMNS[i];
            if (!col) return;
            if (col.readonly) return; // skip computed columns
            if (col.type === 'number') {
                const val = parseFloat(input.value);
                entry[col.key] = isNaN(val) ? null : val;
                if (!isNaN(val)) hasNumeric = true;
            } else {
                entry[col.key] = input.value.trim();
            }
        });
        if (!hasNumeric) continue;
        out.push(entry);
    }
    return out;
}

/**
 * Resolve a single day's rows into engine-ready records.
 * Each output row carries:
 *   - inavSource: 'truth' | 'shadow' (for downstream UI badges)
 *   - The original prices kept for diagnostics.
 */
function resolveDay(date, rows) {
    if (rows.length === 0) return [];
    const base = rows[0];

    // The day's anchor for iNAV-truth and synthetic-iNAV both come from the
    // first row. We allow either path to anchor (whichever data the first row
    // actually has). If the first row has an iNAV, we anchor truth there;
    // we always anchor synthetic on Hynix+FX if those are present.
    const baseInav = base.inavPrice;
    const baseEtf = base.etfPrice;
    const baseHynix = base.hynixPrice;
    const baseFx = base.fxRate;
    if (!baseEtf) return []; // ETF base is mandatory

    const out = [];
    for (const row of rows) {
        if (row.etfPrice === null || row.etfPrice === undefined) continue;

        const etfChange = ((row.etfPrice - baseEtf) / baseEtf) * 100;

        let inavChange = null;
        let inavSource = null;
        let shadowInavChange = null;

        // Always compute shadow when Hynix+FX available (for validation)
        if (row.hynixPrice !== null && row.hynixPrice !== undefined &&
            row.fxRate !== null && row.fxRate !== undefined &&
            baseHynix && baseFx) {
            const hynixChange = ((row.hynixPrice - baseHynix) / baseHynix) * 100;
            const fxChange = ((row.fxRate - baseFx) / baseFx) * 100;
            shadowInavChange = hynixChange * 2 + fxChange;
        }

        if (row.inavPrice !== null && row.inavPrice !== undefined && baseInav) {
            inavChange = ((row.inavPrice - baseInav) / baseInav) * 100;
            inavSource = 'truth';
        } else if (shadowInavChange !== null) {
            inavChange = shadowInavChange;
            inavSource = 'shadow';
        } else {
            continue;
        }

        out.push({
            date: date === '__single__' ? '' : date,
            time: row.time,
            inavPrice: row.inavPrice,
            hynixPrice: row.hynixPrice,
            fxRate: row.fxRate,
            etfPrice: row.etfPrice,
            inavChange,
            etfChange,
            premiumDiscount: etfChange - inavChange,
            inavSource,
            shadowInavChange,
        });
    }
    return out;
}

/**
 * Parse the table into the engine-ready format.
 *
 * Multi-day aware: rows are grouped by `date`, and each group's first row is
 * used as that day's baseline. Per-row iNAV is auto-resolved (truth → shadow
 * → skip).
 *
 * Rows whose `date` is empty are bucketed under '__single__'.
 *
 * The `mode` parameter is accepted for backward compatibility but ignored.
 */
export function parseData(_mode) {
    const raw = readRows();
    if (raw.length === 0) return [];

    const groups = new Map();
    for (const row of raw) {
        const key = row.date && row.date !== '' ? row.date : '__single__';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }

    const out = [];
    for (const [date, rows] of groups) {
        out.push(...resolveDay(date, rows));
    }
    return out;
}

/**
 * Validate the parsed data. Each detected day must contribute at least 2 valid
 * rows (otherwise change-vs-baseline is meaningless).
 *
 * The `mode` parameter is accepted for backward compatibility but ignored.
 */
export function validateData(data, _mode) {
    const errors = [];
    if (!data || data.length === 0) {
        errors.push('请至少输入一行有效数据（每行至少填 ETF 市价 + iNAV 或 海力士股价+汇率）');
        return errors;
    }
    const counts = new Map();
    for (const row of data) {
        const key = row.date || '__single__';
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    for (const [date, c] of counts) {
        if (c < 2) {
            const label = date === '__single__' ? '（无日期）' : date;
            errors.push(`日期 ${label} 仅 ${c} 行，至少需要 2 行（首行作为基准）`);
        }
    }
    return errors;
}

/**
 * Recalculate shadow iNAV for all rows in the backtest data table.
 * Groups by date; each day's first row provides the baseline iNAV, Hynix, FX.
 * Shadow = baseInav * (1 + hynixChange*2) * (1 + fxChange).
 * Only fills when Hynix + FX are available for that row.
 */
export function updateBacktestShadowColumn() {
    const tbody = document.getElementById('data-tbody');
    if (!tbody) return;
    const rows = [...tbody.querySelectorAll('tr')];
    if (rows.length === 0) return;

    // Find the shadow column index
    const shadowIdx = COLUMNS.findIndex(c => c.key === 'shadowInav');
    if (shadowIdx < 0) return;

    // Also find indices for date, inav, hynix, fx
    const dateIdx = COLUMNS.findIndex(c => c.key === 'date');
    const inavIdx = COLUMNS.findIndex(c => c.key === 'inavPrice');
    const hynixIdx = COLUMNS.findIndex(c => c.key === 'hynixPrice');
    const fxIdx = COLUMNS.findIndex(c => c.key === 'fxRate');

    // Group rows by date
    const groups = new Map();
    for (const tr of rows) {
        const inputs = tr.querySelectorAll('input');
        const date = inputs[dateIdx]?.value.trim() || '__single__';
        if (!groups.has(date)) groups.set(date, []);
        groups.get(date).push({ tr, inputs });
    }

    for (const [, dayRows] of groups) {
        if (dayRows.length === 0) continue;
        const firstInputs = dayRows[0].inputs;
        const baseInav = parseFloat(firstInputs[inavIdx]?.value) || null;
        const baseHynix = parseFloat(firstInputs[hynixIdx]?.value) || null;
        const baseFx = parseFloat(firstInputs[fxIdx]?.value) || null;

        for (const { inputs } of dayRows) {
            const shadowInput = inputs[shadowIdx];
            if (!shadowInput) continue;

            const hynix = parseFloat(inputs[hynixIdx]?.value) || null;
            const fx = parseFloat(inputs[fxIdx]?.value) || null;

            if (baseInav && baseHynix && baseFx && hynix && fx) {
                const hynixChange = (hynix - baseHynix) / baseHynix;
                const fxChange = (fx - baseFx) / baseFx;
                const shadow = baseInav * (1 + hynixChange * 2) * (1 + fxChange);
                shadowInput.value = shadow.toFixed(4);
            } else {
                shadowInput.value = '';
            }
        }
    }
}
