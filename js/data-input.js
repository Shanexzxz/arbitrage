// js/data-input.js

// Unified column schema for the backtest table.
// 14:30前用官方iNAV，14:30后用KT股价计算影子iNAV替代。
// KP = 000660 KP Equity (韩国主板，到14:30)
// KT = 000660 KT Equity (Next Trade，到16:30)
const COLUMNS = [
    { key: 'date',       label: '日期',          type: 'text',   placeholder: 'YYYY-MM-DD' },
    { key: 'time',       label: '时间',          type: 'text',   placeholder: 'HH:MM' },
    { key: 'inavPrice',  label: 'iNAV(HKD)',     type: 'number', placeholder: '官方值' },
    { key: 'shadowInav', label: '影子iNAV',      type: 'number', placeholder: '自动计算', readonly: true },
    { key: 'hynixKP',    label: '海力士KP(KRW)',  type: 'number', placeholder: '主板' },
    { key: 'hynixKT',    label: '海力士KT(KRW)',  type: 'number', placeholder: 'NextTrade' },
    { key: 'fxRate',     label: 'KRW/HKD汇率',    type: 'number', placeholder: '0.00525' },
    { key: 'etfPrice',   label: 'ETF市价(HKD)',   type: 'number', placeholder: '93.62' },
];

// Demo data from actual BBG export (2026-05-21), 5-min intervals.
// Real BBG data (2026-05-21): iNAV + ETF + Hynix KP(主板到14:30) + KT(NextTrade到16:30).
// FX用常量0.00525近似。14:30后用KT计算影子iNAV替代官方iNAV。
const DEMO_DATA = [
    { date: '2026-05-21', time: '09:30', inavPrice: '93.8025', hynixKP: '1896500', hynixKT: '1897000', fxRate: '0.00525', etfPrice: '93.62' },
    { date: '2026-05-21', time: '09:35', inavPrice: '94.5392', hynixKP: '1907000', hynixKT: '1908000', fxRate: '0.00525', etfPrice: '94.90' },
    { date: '2026-05-21', time: '09:40', inavPrice: '94.5432', hynixKP: '1904000', hynixKT: '1905000', fxRate: '0.00525', etfPrice: '94.62' },
    { date: '2026-05-21', time: '09:45', inavPrice: '93.9899', hynixKP: '1900000', hynixKT: '1900000', fxRate: '0.00525', etfPrice: '94.12' },
    { date: '2026-05-21', time: '09:50', inavPrice: '93.8768', hynixKP: '1899500', hynixKT: '1899000', fxRate: '0.00525', etfPrice: '93.90' },
    { date: '2026-05-21', time: '09:55', inavPrice: '92.7595', hynixKP: '1888000', hynixKT: '1887000', fxRate: '0.00525', etfPrice: '92.74' },
    { date: '2026-05-21', time: '10:00', inavPrice: '93.5937', hynixKP: '1899000', hynixKT: '1899000', fxRate: '0.00525', etfPrice: '94.00' },
    { date: '2026-05-21', time: '10:05', inavPrice: '94.4255', hynixKP: '1906000', hynixKT: '1906000', fxRate: '0.00525', etfPrice: '94.44' },
    { date: '2026-05-21', time: '10:10', inavPrice: '94.9757', hynixKP: '1912000', hynixKT: '1912000', fxRate: '0.00525', etfPrice: '95.22' },
    { date: '2026-05-21', time: '10:15', inavPrice: '94.7949', hynixKP: '1911000', hynixKT: '1910000', fxRate: '0.00525', etfPrice: '95.00' },
    { date: '2026-05-21', time: '10:20', inavPrice: '95.6099', hynixKP: '1918500', hynixKT: '1919000', fxRate: '0.00525', etfPrice: '95.82' },
    { date: '2026-05-21', time: '10:25', inavPrice: '96.4301', hynixKP: '1928000', hynixKT: '1928000', fxRate: '0.00525', etfPrice: '96.72' },
    { date: '2026-05-21', time: '10:30', inavPrice: '97.5257', hynixKP: '1939000', hynixKT: '1940000', fxRate: '0.00525', etfPrice: '97.78' },
    { date: '2026-05-21', time: '10:35', inavPrice: '97.3363', hynixKP: '1939000', hynixKT: '1939000', fxRate: '0.00525', etfPrice: '97.62' },
    { date: '2026-05-21', time: '10:40', inavPrice: '98.3503', hynixKP: '1949000', hynixKT: '1948000', fxRate: '0.00525', etfPrice: '98.66' },
    { date: '2026-05-21', time: '10:45', inavPrice: '97.8002', hynixKP: '1941000', hynixKT: '1941000', fxRate: '0.00525', etfPrice: '97.88' },
    { date: '2026-05-21', time: '10:50', inavPrice: '97.2536', hynixKP: '1934000', hynixKT: '1935000', fxRate: '0.00525', etfPrice: '97.40' },
    { date: '2026-05-21', time: '10:55', inavPrice: '97.4287', hynixKP: '1939000', hynixKT: '1939000', fxRate: '0.00525', etfPrice: '97.56' },
    { date: '2026-05-21', time: '11:00', inavPrice: '97.0448', hynixKP: '1935000', hynixKT: '1935000', fxRate: '0.00525', etfPrice: '97.10' },
    { date: '2026-05-21', time: '11:05', inavPrice: '97.1452', hynixKP: '1934000', hynixKT: '1934000', fxRate: '0.00525', etfPrice: '97.08' },
    { date: '2026-05-21', time: '11:10', inavPrice: '97.5069', hynixKP: '1938000', hynixKT: '1938000', fxRate: '0.00525', etfPrice: '97.46' },
    { date: '2026-05-21', time: '11:15', inavPrice: '97.6997', hynixKP: '1941000', hynixKT: '1941000', fxRate: '0.00525', etfPrice: '97.64' },
    { date: '2026-05-21', time: '11:20', inavPrice: '97.8838', hynixKP: '1943000', hynixKT: '1942000', fxRate: '0.00525', etfPrice: '97.86' },
    { date: '2026-05-21', time: '11:25', inavPrice: '98.3467', hynixKP: '1948000', hynixKT: '1947000', fxRate: '0.00525', etfPrice: '98.30' },
    { date: '2026-05-21', time: '11:30', inavPrice: '98.2587', hynixKP: '1947000', hynixKT: '1947000', fxRate: '0.00525', etfPrice: '98.12' },
    { date: '2026-05-21', time: '11:35', inavPrice: '98.1743', hynixKP: '1947000', hynixKT: '1947000', fxRate: '0.00525', etfPrice: '98.20' },
    { date: '2026-05-21', time: '11:40', inavPrice: '98.1690', hynixKP: '1946000', hynixKT: '1946000', fxRate: '0.00525', etfPrice: '97.96' },
    { date: '2026-05-21', time: '11:45', inavPrice: '97.7968', hynixKP: '1942000', hynixKT: '1942000', fxRate: '0.00525', etfPrice: '97.70' },
    { date: '2026-05-21', time: '11:50', inavPrice: '96.9680', hynixKP: '1934000', hynixKT: '1933000', fxRate: '0.00525', etfPrice: '96.90' },
    { date: '2026-05-21', time: '11:55', inavPrice: '96.9657', hynixKP: '1933000', hynixKT: '1933000', fxRate: '0.00525', etfPrice: '96.94' },
    { date: '2026-05-21', time: '12:00', inavPrice: '97.3313', hynixKP: '1937000', hynixKT: '1937000', fxRate: '0.00525', etfPrice: '' },
    { date: '2026-05-21', time: '12:05', inavPrice: '97.9656', hynixKP: '1943000', hynixKT: '1944000', fxRate: '0.00525', etfPrice: '' },
    { date: '2026-05-21', time: '12:10', inavPrice: '97.8662', hynixKP: '1943000', hynixKT: '1942000', fxRate: '0.00525', etfPrice: '' },
    { date: '2026-05-21', time: '12:15', inavPrice: '97.6071', hynixKP: '1940000', hynixKT: '1939000', fxRate: '0.00525', etfPrice: '' },
    { date: '2026-05-21', time: '12:20', inavPrice: '97.4277', hynixKP: '1938000', hynixKT: '1938000', fxRate: '0.00525', etfPrice: '' },
    { date: '2026-05-21', time: '12:25', inavPrice: '97.6018', hynixKP: '1941000', hynixKT: '1940000', fxRate: '0.00525', etfPrice: '' },
    { date: '2026-05-21', time: '12:30', inavPrice: '97.1497', hynixKP: '1936000', hynixKT: '1937000', fxRate: '0.00525', etfPrice: '' },
    { date: '2026-05-21', time: '12:35', inavPrice: '97.3265', hynixKP: '1935000', hynixKT: '1936000', fxRate: '0.00525', etfPrice: '' },
    { date: '2026-05-21', time: '12:40', inavPrice: '97.6896', hynixKP: '1940000', hynixKT: '1941000', fxRate: '0.00525', etfPrice: '' },
    { date: '2026-05-21', time: '12:45', inavPrice: '97.6969', hynixKP: '1941000', hynixKT: '1941000', fxRate: '0.00525', etfPrice: '' },
    { date: '2026-05-21', time: '12:50', inavPrice: '98.1578', hynixKP: '1945000', hynixKT: '1945000', fxRate: '0.00525', etfPrice: '' },
    { date: '2026-05-21', time: '12:55', inavPrice: '97.5164', hynixKP: '1939000', hynixKT: '1940000', fxRate: '0.00525', etfPrice: '' },
    { date: '2026-05-21', time: '13:00', inavPrice: '97.6989', hynixKP: '1940000', hynixKT: '1941000', fxRate: '0.00525', etfPrice: '97.24' },
    { date: '2026-05-21', time: '13:05', inavPrice: '97.4335', hynixKP: '1940000', hynixKT: '1939000', fxRate: '0.00525', etfPrice: '97.58' },
    { date: '2026-05-21', time: '13:10', inavPrice: '97.3319', hynixKP: '1939000', hynixKT: '1939000', fxRate: '0.00525', etfPrice: '97.30' },
    { date: '2026-05-21', time: '13:15', inavPrice: '97.5081', hynixKP: '1939000', hynixKT: '1939000', fxRate: '0.00525', etfPrice: '97.46' },
    { date: '2026-05-21', time: '13:20', inavPrice: '97.5102', hynixKP: '1940000', hynixKT: '1941000', fxRate: '0.00525', etfPrice: '97.54' },
    { date: '2026-05-21', time: '13:25', inavPrice: '98.0532', hynixKP: '1947000', hynixKT: '1947000', fxRate: '0.00525', etfPrice: '97.92' },
    { date: '2026-05-21', time: '13:30', inavPrice: '97.4969', hynixKP: '1941000', hynixKT: '1941000', fxRate: '0.00525', etfPrice: '97.30' },
    { date: '2026-05-21', time: '13:35', inavPrice: '97.4062', hynixKP: '1940000', hynixKT: '1940000', fxRate: '0.00525', etfPrice: '97.20' },
    { date: '2026-05-21', time: '13:40', inavPrice: '97.4052', hynixKP: '1941000', hynixKT: '1941000', fxRate: '0.00525', etfPrice: '97.26' },
    { date: '2026-05-21', time: '13:45', inavPrice: '97.4047', hynixKP: '1941000', hynixKT: '1941000', fxRate: '0.00525', etfPrice: '97.24' },
    { date: '2026-05-21', time: '13:50', inavPrice: '97.7622', hynixKP: '1944000', hynixKT: '1943000', fxRate: '0.00525', etfPrice: '97.66' },
    { date: '2026-05-21', time: '13:55', inavPrice: '98.2345', hynixKP: '1947000', hynixKT: '1947000', fxRate: '0.00525', etfPrice: '97.98' },
    { date: '2026-05-21', time: '14:00', inavPrice: '98.4129', hynixKP: '1947000', hynixKT: '1948000', fxRate: '0.00525', etfPrice: '98.22' },
    { date: '2026-05-21', time: '14:05', inavPrice: '98.5917', hynixKP: '1949000', hynixKT: '1949000', fxRate: '0.00525', etfPrice: '98.36' },
    { date: '2026-05-21', time: '14:10', inavPrice: '98.8605', hynixKP: '1952000', hynixKT: '1952000', fxRate: '0.00525', etfPrice: '98.60' },
    { date: '2026-05-21', time: '14:15', inavPrice: '98.3192', hynixKP: '1950000', hynixKT: '1949000', fxRate: '0.00525', etfPrice: '98.08' },
    { date: '2026-05-21', time: '14:20', inavPrice: '97.3121', hynixKP: '', hynixKT: '', fxRate: '0.00525', etfPrice: '96.94' },
    { date: '2026-05-21', time: '14:25', inavPrice: '95.4980', hynixKP: '', hynixKT: '', fxRate: '0.00525', etfPrice: '95.72' },
    { date: '2026-05-21', time: '14:30', inavPrice: '96.6956', hynixKP: '1940000', hynixKT: '', fxRate: '0.00525', etfPrice: '96.78' },
    { date: '2026-05-21', time: '14:35', inavPrice: '96.6910', hynixKP: '', hynixKT: '', fxRate: '0.00525', etfPrice: '96.12' },
    { date: '2026-05-21', time: '14:40', inavPrice: '96.7735', hynixKP: '', hynixKT: '1938000', fxRate: '0.00525', etfPrice: '95.72' },
    { date: '2026-05-21', time: '14:45', inavPrice: '96.7672', hynixKP: '', hynixKT: '1934000', fxRate: '0.00525', etfPrice: '95.86' },
    { date: '2026-05-21', time: '14:50', inavPrice: '96.0420', hynixKP: '', hynixKT: '1933000', fxRate: '0.00525', etfPrice: '95.88' },
    { date: '2026-05-21', time: '14:55', inavPrice: '96.0512', hynixKP: '', hynixKT: '1926000', fxRate: '0.00525', etfPrice: '95.02' },
    { date: '2026-05-21', time: '15:00', inavPrice: '96.0447', hynixKP: '', hynixKT: '1918000', fxRate: '0.00525', etfPrice: '94.50' },
    { date: '2026-05-21', time: '15:05', inavPrice: '96.0624', hynixKP: '', hynixKT: '1914000', fxRate: '0.00525', etfPrice: '93.64' },
    { date: '2026-05-21', time: '15:10', inavPrice: '96.0701', hynixKP: '', hynixKT: '1913000', fxRate: '0.00525', etfPrice: '93.90' },
    { date: '2026-05-21', time: '15:15', inavPrice: '96.0734', hynixKP: '', hynixKT: '1894000', fxRate: '0.00525', etfPrice: '93.30' },
    { date: '2026-05-21', time: '15:20', inavPrice: '96.0482', hynixKP: '', hynixKT: '1899000', fxRate: '0.00525', etfPrice: '92.10' },
    { date: '2026-05-21', time: '15:25', inavPrice: '96.0478', hynixKP: '', hynixKT: '1906000', fxRate: '0.00525', etfPrice: '93.10' },
    { date: '2026-05-21', time: '15:30', inavPrice: '96.0408', hynixKP: '', hynixKT: '1909000', fxRate: '0.00525', etfPrice: '93.96' },
    { date: '2026-05-21', time: '15:35', inavPrice: '96.0423', hynixKP: '', hynixKT: '1905000', fxRate: '0.00525', etfPrice: '94.14' },
    { date: '2026-05-21', time: '15:40', inavPrice: '96.0411', hynixKP: '', hynixKT: '1903000', fxRate: '0.00525', etfPrice: '93.40' },
    { date: '2026-05-21', time: '15:45', inavPrice: '96.0482', hynixKP: '', hynixKT: '1909000', fxRate: '0.00525', etfPrice: '93.46' },
    { date: '2026-05-21', time: '15:50', inavPrice: '96.0574', hynixKP: '', hynixKT: '1908000', fxRate: '0.00525', etfPrice: '93.38' },
    { date: '2026-05-21', time: '15:55', inavPrice: '96.0712', hynixKP: '', hynixKT: '1917000', fxRate: '0.00525', etfPrice: '93.80' },
    { date: '2026-05-21', time: '16:00', inavPrice: '96.0635', hynixKP: '', hynixKT: '1914000', fxRate: '0.00525', etfPrice: '' },
    { date: '2026-05-21', time: '16:05', inavPrice: '96.0761', hynixKP: '', hynixKT: '1913000', fxRate: '0.00525', etfPrice: '' },
    { date: '2026-05-21', time: '16:10', inavPrice: '96.0789', hynixKP: '', hynixKT: '1918000', fxRate: '0.00525', etfPrice: '' },
    { date: '2026-05-21', time: '16:15', inavPrice: '96.0968', hynixKP: '', hynixKT: '1920000', fxRate: '0.00525', etfPrice: '' },
    { date: '2026-05-21', time: '16:20', inavPrice: '96.0744', hynixKP: '', hynixKT: '1920000', fxRate: '0.00525', etfPrice: '' },
    { date: '2026-05-21', time: '16:25', inavPrice: '96.0789', hynixKP: '', hynixKT: '1920000', fxRate: '0.00525', etfPrice: '' },
    { date: '2026-05-21', time: '16:30', inavPrice: '', hynixKP: '', hynixKT: '1922000', fxRate: '0.00525', etfPrice: '' }
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
const INAV_CUTOFF = '14:30';

function resolveDay(date, rows) {
    if (rows.length === 0) return [];
    const base = rows[0];

    const baseInav = base.inavPrice;
    const baseEtf = base.etfPrice;
    // Hynix baseline: prefer KP (main board opening), fallback to KT
    const baseHynix = base.hynixKP || base.hynixKT;
    const baseFx = base.fxRate;
    if (!baseEtf) return []; // ETF base is mandatory

    const out = [];
    for (const row of rows) {
        if (row.etfPrice === null || row.etfPrice === undefined) continue;

        const etfChange = ((row.etfPrice - baseEtf) / baseEtf) * 100;
        const isAfterCutoff = row.time && row.time > INAV_CUTOFF;

        // Determine which Hynix price to use for shadow calc
        // After 14:30: must use KT (main board closed)
        // Before 14:30: prefer KP, fallback KT
        const hynixPrice = isAfterCutoff
            ? (row.hynixKT || null)
            : (row.hynixKP || row.hynixKT || null);

        // Compute shadow iNAV change (always, for validation chart)
        let shadowInavChange = null;
        if (hynixPrice && baseHynix && baseFx && row.fxRate) {
            const hynixChange = ((hynixPrice - baseHynix) / baseHynix) * 100;
            const fxChange = ((row.fxRate - baseFx) / baseFx) * 100;
            shadowInavChange = hynixChange * 2 + fxChange;
        }

        // Compute official iNAV change (always, for validation chart)
        let officialInavChange = null;
        if (row.inavPrice !== null && row.inavPrice !== undefined && baseInav) {
            officialInavChange = ((row.inavPrice - baseInav) / baseInav) * 100;
        }

        // Decide which iNAV to use for the actual premium/discount calculation
        let inavChange = null;
        let inavSource = null;

        if (!isAfterCutoff && officialInavChange !== null) {
            // Before 14:30: trust official iNAV
            inavChange = officialInavChange;
            inavSource = 'truth';
        } else if (shadowInavChange !== null) {
            // After 14:30 (or no official iNAV): use shadow
            inavChange = shadowInavChange;
            inavSource = 'shadow';
        } else if (officialInavChange !== null) {
            // Fallback: use official even after cutoff if no shadow available
            inavChange = officialInavChange;
            inavSource = 'truth';
        } else {
            continue;
        }

        out.push({
            date: date === '__single__' ? '' : date,
            time: row.time,
            inavPrice: row.inavPrice,
            hynixKP: row.hynixKP,
            hynixKT: row.hynixKT,
            fxRate: row.fxRate,
            etfPrice: row.etfPrice,
            inavChange,
            etfChange,
            premiumDiscount: etfChange - inavChange,
            inavSource,
            shadowInavChange,
            officialInavChange,
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

    // Find column indices
    const shadowIdx = COLUMNS.findIndex(c => c.key === 'shadowInav');
    if (shadowIdx < 0) return;
    const dateIdx = COLUMNS.findIndex(c => c.key === 'date');
    const timeIdx = COLUMNS.findIndex(c => c.key === 'time');
    const inavIdx = COLUMNS.findIndex(c => c.key === 'inavPrice');
    const kpIdx = COLUMNS.findIndex(c => c.key === 'hynixKP');
    const ktIdx = COLUMNS.findIndex(c => c.key === 'hynixKT');
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
        // Hynix baseline: prefer KP (main board opening)
        const baseHynix = parseFloat(firstInputs[kpIdx]?.value) || parseFloat(firstInputs[ktIdx]?.value) || null;
        const baseFx = parseFloat(firstInputs[fxIdx]?.value) || null;

        for (const { inputs } of dayRows) {
            const shadowInput = inputs[shadowIdx];
            if (!shadowInput) continue;

            const time = inputs[timeIdx]?.value.trim() || '';
            const isAfterCutoff = time > '14:30';

            // After 14:30 use KT, before use KP (fallback KT)
            const hynix = isAfterCutoff
                ? (parseFloat(inputs[ktIdx]?.value) || null)
                : (parseFloat(inputs[kpIdx]?.value) || parseFloat(inputs[ktIdx]?.value) || null);
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
