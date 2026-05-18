// js/data-input.js

const COLUMNS_INAV = [
    { key: 'time', label: '时间', type: 'text', placeholder: 'e.g. 09:30' },
    { key: 'inavChange', label: 'iNAV涨跌幅(%)', type: 'number', placeholder: '0.00' },
    { key: 'etfChange', label: 'ETF市价涨跌幅(%)', type: 'number', placeholder: '0.00' },
];

const COLUMNS_NO_INAV = [
    { key: 'time', label: '时间', type: 'text', placeholder: 'e.g. 09:30' },
    { key: 'hynixChange', label: '海力士涨跌幅(%)', type: 'number', placeholder: '0.00' },
    { key: 'fxChange', label: '汇率变动(%)', type: 'number', placeholder: '0.00' },
    { key: 'etfChange', label: 'ETF市价涨跌幅(%)', type: 'number', placeholder: '0.00' },
];

const DEFAULT_ROW_COUNT = 5;

export function getColumns(mode) {
    return mode === 'inav' ? COLUMNS_INAV : COLUMNS_NO_INAV;
}

export function renderTable(container, mode) {
    const columns = getColumns(mode);
    const html = `
        <table>
            <thead>
                <tr>${columns.map(c => `<th>${c.label}</th>`).join('')}</tr>
            </thead>
            <tbody id="data-tbody">
                ${generateRows(columns, DEFAULT_ROW_COUNT)}
            </tbody>
        </table>
    `;
    container.innerHTML = html;
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
        `<td><input type="${c.type}" data-key="${c.key}" placeholder="${c.placeholder}" step="0.01"></td>`
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

export function parseData(mode) {
    const tbody = document.getElementById('data-tbody');
    if (!tbody) return [];

    const columns = getColumns(mode);
    const rows = tbody.querySelectorAll('tr');
    const data = [];

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
            // Mode B: synthesize premium/discount
            if (mode === 'no-inav' && entry.hynixChange !== null && entry.fxChange !== null && entry.etfChange !== null) {
                const syntheticInav = entry.hynixChange * 2 + entry.fxChange;
                entry.inavChange = syntheticInav;
                entry.premiumDiscount = entry.etfChange - syntheticInav;
            }
            // Mode A: calculate premium/discount
            if (mode === 'inav' && entry.inavChange !== null && entry.etfChange !== null) {
                entry.premiumDiscount = entry.etfChange - entry.inavChange;
            }
            data.push(entry);
        }
    }

    return data;
}

export function validateData(data, mode) {
    const errors = [];

    if (data.length === 0) {
        errors.push('请至少输入一行有效数据');
        return errors;
    }

    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (row.etfChange === null) {
            errors.push(`第 ${i + 1} 行：ETF市价涨跌幅为必填项`);
        }
        if (mode === 'inav' && row.inavChange === null) {
            errors.push(`第 ${i + 1} 行：iNAV涨跌幅为必填项`);
        }
        if (mode === 'no-inav') {
            if (row.hynixChange === null) errors.push(`第 ${i + 1} 行：海力士涨跌幅为必填项`);
            if (row.fxChange === null) errors.push(`第 ${i + 1} 行：汇率变动为必填项`);
        }
    }

    return errors;
}
