// js/data-input.js

// Unified column schema for the backtest table.
// Per-row iNAV resolution is handled in parseData(): if `iNAV(HKD)` is given,
// use it as the truth; otherwise fall back to the synthetic shadow iNAV
// derived from `海力士股价(KRW)` + `KRW/HKD汇率`. Rows that cannot resolve
// either way are silently skipped.
const COLUMNS = [
    { key: 'date',       label: '日期',          type: 'text',   placeholder: 'YYYY-MM-DD' },
    { key: 'time',       label: '时间',          type: 'text',   placeholder: 'HH:MM' },
    { key: 'inavPrice',  label: 'iNAV(HKD)',     type: 'number', placeholder: '14:30前' },
    { key: 'hynixPrice', label: '海力士股价(KRW)', type: 'number', placeholder: '201000' },
    { key: 'fxRate',     label: 'KRW/HKD汇率',    type: 'number', placeholder: '0.00600' },
    { key: 'etfPrice',   label: 'ETF市价(HKD)',   type: 'number', placeholder: '10.15' },
];

// Demo data spans 3 trading days. iNAV is provided up through 14:30 (BBG
// publishes it then), and left blank afterwards — the engine derives a
// synthetic iNAV for those rows from Hynix + FX.
const DEMO_DATA = [
    { date: '2026-05-13', time: '09:30', inavPrice: '10.00', hynixPrice: '200000', fxRate: '0.00600', etfPrice: '10.00' },
    { date: '2026-05-13', time: '10:30', inavPrice: '10.10', hynixPrice: '201000', fxRate: '0.00600', etfPrice: '10.28' }, // premium
    { date: '2026-05-13', time: '13:30', inavPrice: '10.15', hynixPrice: '201500', fxRate: '0.00601', etfPrice: '10.16' }, // reverted
    { date: '2026-05-13', time: '14:30', inavPrice: '10.20', hynixPrice: '202000', fxRate: '0.00601', etfPrice: '10.19' },
    { date: '2026-05-13', time: '15:30', inavPrice: '',      hynixPrice: '202200', fxRate: '0.00600', etfPrice: '10.40' }, // shadow iNAV
    { date: '2026-05-13', time: '16:00', inavPrice: '',      hynixPrice: '202300', fxRate: '0.00601', etfPrice: '10.25' },
    { date: '2026-05-14', time: '09:30', inavPrice: '10.25', hynixPrice: '202500', fxRate: '0.00600', etfPrice: '10.25' },
    { date: '2026-05-14', time: '10:30', inavPrice: '10.32', hynixPrice: '203200', fxRate: '0.00601', etfPrice: '10.10' }, // discount
    { date: '2026-05-14', time: '13:30', inavPrice: '10.30', hynixPrice: '203000', fxRate: '0.00600', etfPrice: '10.32' },
    { date: '2026-05-14', time: '14:30', inavPrice: '10.31', hynixPrice: '203100', fxRate: '0.00601', etfPrice: '10.30' },
    { date: '2026-05-14', time: '15:30', inavPrice: '',      hynixPrice: '203300', fxRate: '0.00601', etfPrice: '10.34' },
    { date: '2026-05-14', time: '16:00', inavPrice: '',      hynixPrice: '203400', fxRate: '0.00600', etfPrice: '10.35' },
    { date: '2026-05-15', time: '09:30', inavPrice: '10.35', hynixPrice: '203500', fxRate: '0.00600', etfPrice: '10.36' },
    { date: '2026-05-15', time: '10:30', inavPrice: '10.40', hynixPrice: '204000', fxRate: '0.00601', etfPrice: '10.55' }, // premium
    { date: '2026-05-15', time: '13:30', inavPrice: '10.42', hynixPrice: '204200', fxRate: '0.00600', etfPrice: '10.43' },
    { date: '2026-05-15', time: '14:30', inavPrice: '10.45', hynixPrice: '204500', fxRate: '0.00601', etfPrice: '10.44' },
    { date: '2026-05-15', time: '15:30', inavPrice: '',      hynixPrice: '204600', fxRate: '0.00600', etfPrice: '10.62' },
    { date: '2026-05-15', time: '16:00', inavPrice: '',      hynixPrice: '204800', fxRate: '0.00601', etfPrice: '10.50' },
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
        return `<td><input type="${c.type}" data-key="${c.key}" placeholder="${c.placeholder}" step="any" value="${value}"></td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
}

function generateRow() {
    const cells = COLUMNS.map(c =>
        `<td><input type="${c.type}" data-key="${c.key}" placeholder="${c.placeholder}" step="any"></td>`
    ).join('');
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
        if (row.inavPrice !== null && row.inavPrice !== undefined && baseInav) {
            // Prefer the truth path whenever the row reports an iNAV.
            inavChange = ((row.inavPrice - baseInav) / baseInav) * 100;
            inavSource = 'truth';
        } else if (row.hynixPrice !== null && row.hynixPrice !== undefined &&
                   row.fxRate !== null && row.fxRate !== undefined &&
                   baseHynix && baseFx) {
            const hynixChange = ((row.hynixPrice - baseHynix) / baseHynix) * 100;
            const fxChange = ((row.fxRate - baseFx) / baseFx) * 100;
            inavChange = hynixChange * 2 + fxChange;
            inavSource = 'shadow';
        } else {
            // Skip: cannot resolve iNAV for this row.
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
