// js/data-input.js

// Mode A: user inputs raw iNAV price and ETF price
const COLUMNS_INAV = [
    { key: 'time', label: '时间', type: 'text', placeholder: 'e.g. 09:30' },
    { key: 'inavPrice', label: 'iNAV', type: 'number', placeholder: '10.12' },
    { key: 'etfPrice', label: 'ETF市价', type: 'number', placeholder: '10.15' },
];

// Mode B: user inputs raw Hynix price, FX rate, and ETF price
const COLUMNS_NO_INAV = [
    { key: 'time', label: '时间', type: 'text', placeholder: 'e.g. 09:30' },
    { key: 'hynixPrice', label: '海力士股价', type: 'number', placeholder: '201000' },
    { key: 'fxRate', label: 'KRW/HKD汇率', type: 'number', placeholder: '0.00600' },
    { key: 'etfPrice', label: 'ETF市价', type: 'number', placeholder: '10.15' },
];

// Baseline fields (previous close)
const BASELINE_INAV = [
    { key: 'baseInavPrice', label: 'iNAV昨收', placeholder: '10.00' },
    { key: 'baseEtfPrice', label: 'ETF昨收', placeholder: '10.00' },
];

const BASELINE_NO_INAV = [
    { key: 'baseHynixPrice', label: '海力士昨收', placeholder: '200000' },
    { key: 'baseFxRate', label: '汇率昨收', placeholder: '0.00600' },
    { key: 'baseEtfPrice', label: 'ETF昨收', placeholder: '10.00' },
];

// Demo baseline values
const DEMO_BASELINE_INAV = { baseInavPrice: '10.00', baseEtfPrice: '10.00' };
const DEMO_BASELINE_NO_INAV = { baseHynixPrice: '200000', baseFxRate: '0.00600', baseEtfPrice: '10.00' };

// Demo intraday data (today's prices, relative to baseline)
const DEMO_DATA_INAV = [
    { time: '09:30', inavPrice: '10.05', etfPrice: '10.06' },
    { time: '09:35', inavPrice: '10.12', etfPrice: '10.10' },
    { time: '09:40', inavPrice: '10.18', etfPrice: '10.35' },
    { time: '09:45', inavPrice: '10.21', etfPrice: '10.23' },
    { time: '09:50', inavPrice: '10.25', etfPrice: '10.24' },
    { time: '09:55', inavPrice: '10.19', etfPrice: '10.02' },
    { time: '10:00', inavPrice: '10.23', etfPrice: '10.22' },
    { time: '10:05', inavPrice: '10.30', etfPrice: '10.48' },
    { time: '10:10', inavPrice: '10.32', etfPrice: '10.33' },
    { time: '10:15', inavPrice: '10.28', etfPrice: '10.29' },
];

const DEMO_DATA_NO_INAV = [
    { time: '09:30', hynixPrice: '200500', fxRate: '0.00600', etfPrice: '10.06' },
    { time: '09:35', hynixPrice: '201200', fxRate: '0.00599', etfPrice: '10.10' },
    { time: '09:40', hynixPrice: '201800', fxRate: '0.00601', etfPrice: '10.35' },
    { time: '09:45', hynixPrice: '202200', fxRate: '0.00600', etfPrice: '10.23' },
    { time: '09:50', hynixPrice: '202600', fxRate: '0.00599', etfPrice: '10.24' },
    { time: '09:55', hynixPrice: '202000', fxRate: '0.00600', etfPrice: '10.02' },
    { time: '10:00', hynixPrice: '202400', fxRate: '0.00601', etfPrice: '10.22' },
    { time: '10:05', hynixPrice: '203000', fxRate: '0.00600', etfPrice: '10.48' },
    { time: '10:10', hynixPrice: '203200', fxRate: '0.00601', etfPrice: '10.33' },
    { time: '10:15', hynixPrice: '202800', fxRate: '0.00600', etfPrice: '10.29' },
];

export function getColumns(mode) {
    return mode === 'inav' ? COLUMNS_INAV : COLUMNS_NO_INAV;
}

function getBaselineFields(mode) {
    return mode === 'inav' ? BASELINE_INAV : BASELINE_NO_INAV;
}

function getDemoBaseline(mode) {
    return mode === 'inav' ? DEMO_BASELINE_INAV : DEMO_BASELINE_NO_INAV;
}

function getDemoData(mode) {
    return mode === 'inav' ? DEMO_DATA_INAV : DEMO_DATA_NO_INAV;
}

/**
 * Render the baseline input fields.
 */
export function renderBaseline(container, mode) {
    const fields = getBaselineFields(mode);
    const demo = getDemoBaseline(mode);
    const html = fields.map(f => `
        <div class="baseline-item">
            <label for="${f.key}">${f.label}</label>
            <input type="number" id="${f.key}" data-key="${f.key}" placeholder="${f.placeholder}" step="any" value="${demo[f.key] || ''}">
        </div>
    `).join('');
    container.innerHTML = html;
}

/**
 * Render the intraday data table.
 */
export function renderTable(container, mode) {
    const columns = getColumns(mode);
    const demoData = getDemoData(mode);
    const html = `
        <table>
            <thead>
                <tr>${columns.map(c => `<th>${c.label}</th>`).join('')}</tr>
            </thead>
            <tbody id="data-tbody">
                ${generateRowsWithData(columns, demoData)}
            </tbody>
        </table>
    `;
    container.innerHTML = html;
}

function generateRowsWithData(columns, dataRows) {
    let rows = '';
    for (const rowData of dataRows) {
        rows += generateRowWithData(columns, rowData);
    }
    return rows;
}

function generateRowWithData(columns, rowData) {
    const cells = columns.map(c => {
        const value = rowData && rowData[c.key] !== undefined ? rowData[c.key] : '';
        return `<td><input type="${c.type}" data-key="${c.key}" placeholder="${c.placeholder}" step="any" value="${value}"></td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
}

function generateRow(columns) {
    const cells = columns.map(c =>
        `<td><input type="${c.type}" data-key="${c.key}" placeholder="${c.placeholder}" step="any"></td>`
    ).join('');
    return `<tr>${cells}</tr>`;
}

export function addRow(mode) {
    const tbody = document.getElementById('data-tbody');
    if (!tbody) return;
    const columns = getColumns(mode);
    tbody.insertAdjacentHTML('beforeend', generateRow(columns));
}

export function deleteLastRow() {
    const tbody = document.getElementById('data-tbody');
    if (!tbody) return;
    const rows = tbody.querySelectorAll('tr');
    if (rows.length > 1) {
        rows[rows.length - 1].remove();
    }
}

export function clearAll(mode) {
    const tableContainer = document.getElementById('data-table-container');
    const baselineContainer = document.getElementById('baseline-inputs');
    if (tableContainer) renderTable(tableContainer, mode);
    if (baselineContainer) renderBaseline(baselineContainer, mode);
}

/**
 * Read baseline values from the input fields.
 */
function readBaseline(mode) {
    const fields = getBaselineFields(mode);
    const baseline = {};
    for (const f of fields) {
        const input = document.getElementById(f.key);
        const val = input ? parseFloat(input.value) : null;
        baseline[f.key] = isNaN(val) ? null : val;
    }
    return baseline;
}

/**
 * Parse raw price data and calculate changes relative to baseline (previous close).
 */
export function parseData(mode) {
    const baseline = readBaseline(mode);
    const tbody = document.getElementById('data-tbody');
    if (!tbody) return [];

    const columns = getColumns(mode);
    const rows = tbody.querySelectorAll('tr');
    const data = [];

    if (mode === 'inav') {
        const baseInav = baseline.baseInavPrice;
        const baseEtf = baseline.baseEtfPrice;

        if (baseInav === null || baseEtf === null || baseInav === 0 || baseEtf === 0) {
            return [];
        }

        for (const row of rows) {
            const inputs = row.querySelectorAll('input');
            const entry = {};
            let hasValue = false;

            inputs.forEach((input, i) => {
                const key = columns[i].key;
                if (columns[i].type === 'number') {
                    const val = parseFloat(input.value);
                    entry[key] = isNaN(val) ? null : val;
                    if (!isNaN(val)) hasValue = true;
                } else {
                    entry[key] = input.value.trim();
                }
            });

            if (!hasValue || entry.inavPrice === null || entry.etfPrice === null) continue;

            const inavChange = ((entry.inavPrice - baseInav) / baseInav) * 100;
            const etfChange = ((entry.etfPrice - baseEtf) / baseEtf) * 100;
            const premiumDiscount = etfChange - inavChange;

            data.push({
                time: entry.time,
                inavPrice: entry.inavPrice,
                etfPrice: entry.etfPrice,
                inavChange,
                etfChange,
                premiumDiscount,
            });
        }
    } else {
        // Mode B: no-inav
        const baseHynix = baseline.baseHynixPrice;
        const baseFx = baseline.baseFxRate;
        const baseEtf = baseline.baseEtfPrice;

        if (baseHynix === null || baseFx === null || baseEtf === null ||
            baseHynix === 0 || baseFx === 0 || baseEtf === 0) {
            return [];
        }

        for (const row of rows) {
            const inputs = row.querySelectorAll('input');
            const entry = {};
            let hasValue = false;

            inputs.forEach((input, i) => {
                const key = columns[i].key;
                if (columns[i].type === 'number') {
                    const val = parseFloat(input.value);
                    entry[key] = isNaN(val) ? null : val;
                    if (!isNaN(val)) hasValue = true;
                } else {
                    entry[key] = input.value.trim();
                }
            });

            if (!hasValue || entry.hynixPrice === null || entry.fxRate === null || entry.etfPrice === null) continue;

            const hynixChange = ((entry.hynixPrice - baseHynix) / baseHynix) * 100;
            const fxChange = ((entry.fxRate - baseFx) / baseFx) * 100;
            const etfChange = ((entry.etfPrice - baseEtf) / baseEtf) * 100;

            // Synthesize iNAV change: 2x Hynix change + FX impact
            const syntheticInavChange = hynixChange * 2 + fxChange;
            const premiumDiscount = etfChange - syntheticInavChange;

            data.push({
                time: entry.time,
                hynixPrice: entry.hynixPrice,
                fxRate: entry.fxRate,
                etfPrice: entry.etfPrice,
                hynixChange,
                fxChange,
                etfChange,
                inavChange: syntheticInavChange,
                premiumDiscount,
            });
        }
    }

    return data;
}

export function validateData(data, mode) {
    const errors = [];
    const baseline = readBaseline(mode);

    // Validate baseline
    if (mode === 'inav') {
        if (baseline.baseInavPrice === null || baseline.baseInavPrice === 0) {
            errors.push('基准价格：请输入iNAV昨收价');
        }
        if (baseline.baseEtfPrice === null || baseline.baseEtfPrice === 0) {
            errors.push('基准价格：请输入ETF昨收价');
        }
    } else {
        if (baseline.baseHynixPrice === null || baseline.baseHynixPrice === 0) {
            errors.push('基准价格：请输入海力士昨收价');
        }
        if (baseline.baseFxRate === null || baseline.baseFxRate === 0) {
            errors.push('基准价格：请输入汇率昨收');
        }
        if (baseline.baseEtfPrice === null || baseline.baseEtfPrice === 0) {
            errors.push('基准价格：请输入ETF昨收价');
        }
    }

    if (errors.length > 0) return errors;

    if (data.length === 0) {
        errors.push('请至少输入一行当日实时数据');
    }

    return errors;
}
