// js/data-input.js

// Mode A: user inputs raw iNAV price and ETF price, system calculates changes
const COLUMNS_INAV = [
    { key: 'time', label: '时间', type: 'text', placeholder: 'e.g. 09:30' },
    { key: 'inavPrice', label: 'iNAV', type: 'number', placeholder: '10.00' },
    { key: 'etfPrice', label: 'ETF市价', type: 'number', placeholder: '10.00' },
];

// Mode B: user inputs raw Hynix price, FX rate, and ETF price
const COLUMNS_NO_INAV = [
    { key: 'time', label: '时间', type: 'text', placeholder: 'e.g. 09:30' },
    { key: 'hynixPrice', label: '海力士股价', type: 'number', placeholder: '200000' },
    { key: 'fxRate', label: 'KRW/HKD汇率', type: 'number', placeholder: '0.0060' },
    { key: 'etfPrice', label: 'ETF市价', type: 'number', placeholder: '10.00' },
];

const DEFAULT_ROW_COUNT = 5;

// Demo data: Mode A - raw iNAV and ETF prices over a trading session
// iNAV starts at 10.00, ETF starts at 10.00
// Includes moments where ETF deviates significantly from iNAV (arbitrage signals)
const DEMO_DATA_INAV = [
    { time: '09:30', inavPrice: '10.00', etfPrice: '10.00' },
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

// Demo data: Mode B - raw Hynix stock price (KRW), FX rate, and ETF price (HKD)
const DEMO_DATA_NO_INAV = [
    { time: '09:30', hynixPrice: '200000', fxRate: '0.00600', etfPrice: '10.00' },
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

function getDemoData(mode) {
    return mode === 'inav' ? DEMO_DATA_INAV : DEMO_DATA_NO_INAV;
}

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

function generateRows(columns, count) {
    let rows = '';
    for (let i = 0; i < count; i++) {
        rows += generateRow(columns);
    }
    return rows;
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
    const container = document.getElementById('data-table-container');
    if (container) {
        renderTable(container, mode);
    }
}

/**
 * Parse raw price data and calculate changes + premium/discount.
 *
 * Mode A (inav): Input iNAV price + ETF price → calculate % changes from first row (base)
 * Mode B (no-inav): Input Hynix price + FX rate + ETF price → synthesize iNAV, calculate changes
 *
 * The first row is the baseline (t=0). All subsequent rows are compared to the first row.
 */
export function parseData(mode) {
    const tbody = document.getElementById('data-tbody');
    if (!tbody) return [];

    const columns = getColumns(mode);
    const rows = tbody.querySelectorAll('tr');
    const rawRows = [];

    // Step 1: Parse raw values from inputs
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

        if (hasValue) {
            rawRows.push(entry);
        }
    }

    if (rawRows.length < 2) return rawRows.length === 0 ? [] : rawRows;

    // Step 2: Calculate changes relative to first row (baseline)
    const data = [];
    const base = rawRows[0];

    if (mode === 'inav') {
        const baseInav = base.inavPrice;
        const baseEtf = base.etfPrice;

        if (baseInav === null || baseEtf === null || baseInav === 0 || baseEtf === 0) {
            return [];
        }

        for (let i = 0; i < rawRows.length; i++) {
            const row = rawRows[i];
            if (row.inavPrice === null || row.etfPrice === null) continue;

            const inavChange = ((row.inavPrice - baseInav) / baseInav) * 100;
            const etfChange = ((row.etfPrice - baseEtf) / baseEtf) * 100;
            const premiumDiscount = etfChange - inavChange;

            data.push({
                time: row.time,
                inavPrice: row.inavPrice,
                etfPrice: row.etfPrice,
                inavChange,
                etfChange,
                premiumDiscount,
            });
        }
    } else {
        // Mode B: no-inav
        const baseHynix = base.hynixPrice;
        const baseFx = base.fxRate;
        const baseEtf = base.etfPrice;

        if (baseHynix === null || baseFx === null || baseEtf === null ||
            baseHynix === 0 || baseFx === 0 || baseEtf === 0) {
            return [];
        }

        for (let i = 0; i < rawRows.length; i++) {
            const row = rawRows[i];
            if (row.hynixPrice === null || row.fxRate === null || row.etfPrice === null) continue;

            const hynixChange = ((row.hynixPrice - baseHynix) / baseHynix) * 100;
            const fxChange = ((row.fxRate - baseFx) / baseFx) * 100;
            const etfChange = ((row.etfPrice - baseEtf) / baseEtf) * 100;

            // Synthesize iNAV change: 2x Hynix change + FX impact
            const syntheticInavChange = hynixChange * 2 + fxChange;
            const premiumDiscount = etfChange - syntheticInavChange;

            data.push({
                time: row.time,
                hynixPrice: row.hynixPrice,
                fxRate: row.fxRate,
                etfPrice: row.etfPrice,
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

    if (data.length === 0) {
        errors.push('请至少输入两行有效数据（第一行为基准价格）');
        return errors;
    }

    if (data.length < 2) {
        errors.push('需要至少两行数据才能计算涨跌幅（第一行为基准）');
        return errors;
    }

    return errors;
}
