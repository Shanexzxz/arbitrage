// js/data-input.js

// Unified column schema for the backtest table.
//
// Theoretical iNAV model (used at all times, no time-zone gating):
//
//     Theo_iNAV(t) = Published_iNAV × (1 + L × r),
//     where r = KT(t) / KP_ref(t) - 1,  L = 2.
//
// KP_ref:
//   - During main-board hours: latest KP tick.
//   - After 14:20: KP freezes at the 14:20 tick — the engine simply carries
//     forward the last KP it saw (LOCF).
//   - For the day's very first row (or any row before KP has printed),
//     fall back to `prevKrxClose` if the user supplied one; otherwise the
//     row's own KP / KT (so r ≈ 0 and Theo ≈ Published).
//
// KP = 000660 KP Equity (主板连续竞价 09:00-14:20 + 14:30 收盘集合竞价)
// KT = 000660 KT Equity (Next Trade 盘后延伸至 16:30)
//
// ETF reference prices: we now track Last AND Bid/Offer when available, so
// the backtest can evaluate executable premium per direction:
//   - Sell-ETF leg fills at Bid (worst case for the seller)
//   - Buy-ETF  leg fills at Ask (worst case for the buyer)
const COLUMNS = [
    { key: 'date',       label: '日期',          type: 'text',   placeholder: 'YYYY-MM-DD' },
    { key: 'time',       label: '时间',          type: 'text',   placeholder: 'HH:MM' },
    { key: 'inavPrice',  label: 'iNAV(HKD)',     type: 'number', placeholder: '官方值' },
    { key: 'theoInav',   label: '理论iNAV',      type: 'number', placeholder: '自动计算', readonly: true },
    { key: 'hynixKP',    label: '海力士KP(KRW)',  type: 'number', placeholder: '主板' },
    { key: 'hynixKT',    label: '海力士KT(KRW)',  type: 'number', placeholder: 'NextTrade' },
    { key: 'fxRate',     label: 'KRW/HKD汇率',    type: 'number', placeholder: '0.005200' },
    { key: 'etfPrice',   label: 'ETF Last',       type: 'number', placeholder: '93.62' },
    { key: 'etfBid',     label: 'ETF Bid',        type: 'number', placeholder: '可空' },
    { key: 'etfAsk',     label: 'ETF Ask',        type: 'number', placeholder: '可空' },
];

// 7709 HK tick size (HKD) — used to express premium spreads in ticks for the
// "spread in ticks" diagnostics, matching how the live monitor sheet reports.
export const TICK_SIZE = 0.005;
export const LEVERAGE = 2;
// Day-level previous KRX close, optional. When set, used as KP_ref denominator
// before the day's first KP tick prints.
let prevKrxCloseByDate = new Map();
export function setPrevKrxClose(date, value) {
    if (date) prevKrxCloseByDate.set(date, value);
}
export function getPrevKrxClose(date) {
    return prevKrxCloseByDate.get(date) ?? null;
}
export function clearPrevKrxClose() { prevKrxCloseByDate = new Map(); }

// Fallback demo data — small inline sample shown if the network fetch of
// data/demo-multi-day.json fails. The real default dataset (5 trading days
// from the BBG "7709 vs 2x ETF" export) is loaded async via
// loadAndPopulateDemoData() at startup.
const DEMO_DATA = [
    { date: '2026-06-09', time: '13:00', inavPrice: '95.80', hynixKP: '1980000', hynixKT: '1980000', etfPrice: '97.92' },
    { date: '2026-06-09', time: '13:30', inavPrice: '96.05', hynixKP: '1982000', hynixKT: '1982000', etfPrice: '98.12' },
    { date: '2026-06-09', time: '14:00', inavPrice: '95.95', hynixKP: '1981000', hynixKT: '1981000', etfPrice: '98.00' },
    { date: '2026-06-09', time: '14:30', inavPrice: '95.80', hynixKP: '',        hynixKT: '1979000', etfPrice: '97.80' },
    { date: '2026-06-09', time: '15:00', inavPrice: '95.50', hynixKP: '',        hynixKT: '1972000', etfPrice: '97.20' },
];

export function getColumns() {
    return COLUMNS;
}

function getDemoData() {
    return DEMO_DATA;
}

/**
 * Render the baseline notice + the day-level "previous KRX close" input.
 *
 * Baselines (per-day first row) are derived automatically. The only optional
 * day-level input is `prevKrxClose` (000660 KP previous-trading-day close),
 * which serves as the strictly-correct r-denominator before the day's first
 * KP tick has printed (per the desk's caveats sheet).
 */
export function renderBaseline(container) {
    container.innerHTML = `
        <div class="baseline-notice">
            <div class="baseline-notice-row"><strong>理论 iNAV 公式</strong>：
                <code>Theo = Published × (1 + 2 × (KT / KP_ref − 1))</code>
                — 全天通用，不再区分 14:20 前后。
            </div>
            <div class="baseline-notice-row"><strong>KP_ref</strong>：取该行截至当前的最后一笔 KP（14:20 后自然冻结）；若当日尚无 KP，可选用"前一日 KRX 收盘"作为基准（更严格）。</div>
            <div class="baseline-notice-row"><strong>基准价格</strong>：%-涨跌仍按每日第一行自动锚定。</div>
            <ul class="baseline-notice-list">
                <li><span class="tag-truth">参与回测</span> 该行有 <code>Published iNAV</code> + <code>KT</code> 即可计算 Theo 并参与触发判定。</li>
                <li><span class="tag-shadow">Bid / Ask</span> 留空可，则按 ETF Last 评估；填上后回测会按"卖 ETF 用 Bid、买 ETF 用 Ask"的可执行价分别评估。</li>
                <li><span class="tag-skip">跳过</span> 缺 Published 或缺 KT 的行不参与回测。</li>
            </ul>
            <div class="baseline-notice-row" style="margin-top:0.6rem;">
                <label for="prev-krx-close" style="font-weight:600;">前一日 KRX 收盘 (KRW)</label>
                <input id="prev-krx-close" type="number" step="any" placeholder="可空 — 不填则用当日首笔 KP" style="margin-left:0.5rem; padding:0.2rem 0.4rem; width:140px;">
                <span class="hint" style="margin-left:0.5rem; color:var(--color-text-muted); font-size:0.78rem;">仅用作早盘 KP_ref 的更严格 fallback。多日数据时只对单日生效，不填则忽略。</span>
            </div>
        </div>
    `;

    const prev = container.querySelector('#prev-krx-close');
    if (prev) {
        prev.addEventListener('input', () => {
            const v = parseFloat(prev.value);
            // Apply to all dates currently in the table (single day or all of multi-day).
            clearPrevKrxClose();
            if (!isNaN(v) && v > 0) {
                const tbody = document.getElementById('data-tbody');
                if (tbody) {
                    const dateIdx = COLUMNS.findIndex(c => c.key === 'date');
                    const seen = new Set();
                    for (const tr of tbody.querySelectorAll('tr')) {
                        const inputs = tr.querySelectorAll('input');
                        const d = inputs[dateIdx]?.value.trim() || '__single__';
                        if (seen.has(d)) continue;
                        seen.add(d);
                        setPrevKrxClose(d, v);
                    }
                }
            }
            updateBacktestShadowColumn();
            container.dispatchEvent(new CustomEvent('prevclose:changed', { bubbles: true }));
        });
    }
}

/**
 * Render the unified intraday data table.
 *
 * Initial render uses the inline DEMO_DATA fallback (small, no network needed).
 * The real default dataset — 5 BBG trading days preprocessed offline — is
 * loaded asynchronously from /data/demo-multi-day.json by
 * loadAndPopulateDemoData(); see main.js init for the wire-up.
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

/**
 * Asynchronously fetch and load the multi-day BBG demo dataset.
 *
 * Hosted at /data/demo-multi-day.json (preprocessed by tools/preprocess-demo.cjs
 * from the 62MB BBG export, see commit notes). On success, replaces the
 * current table body with the new rows. On failure (404 / parse error /
 * offline), keeps the inline fallback and logs to console — the user can
 * still import their own Excel.
 *
 * @returns {Promise<{ok: boolean, rows?: number, dates?: string[], error?: string}>}
 */
// Per-(date,time) flag = 1 when the source iNAV tick happens at-or-after
// an intraday >1% jump (BBG NAV re-publish / ex-div / data patch). Populated
// by loadAndPopulateDemoData(); consumed by the data-quality panel via
// getDataQualityFlags(). Returns an empty Map for user-imported / pasted
// datasets where suspect detection isn't available.
let suspectFlags = new Map();
export function getDataQualityFlags() { return suspectFlags; }

export async function loadAndPopulateDemoData() {
    try {
        const resp = await fetch('/data/demo-multi-day.json', { cache: 'no-store' });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('empty or non-array payload');
        }
        const tbody = document.getElementById('data-tbody');
        if (!tbody) throw new Error('#data-tbody not in DOM yet');
        // Normalize: ensure all expected keys exist as strings; the JSON
        // emits numbers for inavPrice / hynixKP / hynixKT / etfPrice and
        // null for empty KP (post-14:20). renderRowHTML expects strings
        // and handles empty/null transparently.
        const norm = data.map(r => ({
            date: r.date || '',
            time: r.time || '',
            inavPrice: r.inavPrice != null ? String(r.inavPrice) : '',
            hynixKP:   r.hynixKP   != null ? String(r.hynixKP)   : '',
            hynixKT:   r.hynixKT   != null ? String(r.hynixKT)   : '',
            fxRate:    r.fxRate    != null ? String(r.fxRate)    : '',
            etfPrice:  r.etfPrice  != null ? String(r.etfPrice)  : '',
            etfBid:    r.etfBid    != null ? String(r.etfBid)    : '',
            etfAsk:    r.etfAsk    != null ? String(r.etfAsk)    : '',
        }));
        tbody.innerHTML = generateRowsWithData(norm);

        // Capture suspect-row metadata in a side channel keyed by date|time.
        suspectFlags = new Map();
        for (const r of data) {
            if (r.inavSuspect) suspectFlags.set(`${r.date}|${r.time}`, 1);
        }

        const dates = [...new Set(norm.map(r => r.date).filter(Boolean))].sort();
        return { ok: true, rows: norm.length, dates };
    } catch (err) {
        console.warn('[demo] loadAndPopulateDemoData failed:', err.message);
        return { ok: false, error: err.message };
    }
}

function generateRowsWithData(dataRows) {
    return dataRows.map(rowData => generateRowWithData(rowData)).join('');
}

/**
 * Public re-export so main.js's BBG/CSV importers can render rows with the
 * same logic (including the "主板已收盘" placeholder for KP after 14:20).
 */
export function renderRowHTML(rowData) {
    return generateRowWithData(rowData);
}

function generateRowWithData(rowData) {
    // After 14:20 the KOSPI main board is closed (集合竞价开始) → render
    // hynixKP as a disabled placeholder cell. The 理论 iNAV column (computed
    // by updateBacktestShadowColumn) is the engine's actual decision input
    // for the entire day, so it renders the same way before and after 14:20.
    const time = rowData?.time || '';
    const isMainBoardClosed = time && time > '14:20';

    const cells = COLUMNS.map(c => {
        const value = rowData && rowData[c.key] !== undefined ? rowData[c.key] : '';

        if (c.key === 'hynixKP' && isMainBoardClosed) {
            return `<td><input type="text" data-key="hynixKP" class="closed-cell" value="主板已收盘" readonly tabindex="-1"></td>`;
        }

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
 *
 * Theoretical iNAV (single formula, used at every row):
 *
 *     Theo(t) = Published_iNAV(t) × (1 + L × r),
 *     r       = KT(t) / KP_ref(t) - 1
 *     L       = 2
 *
 * KP_ref selection per row:
 *   1. The latest KP tick we have observed at-or-before `t` (LOCF). KP stops
 *      ticking after 14:20 KST (main-board close), so this naturally freezes
 *      to the 14:20 print, which is exactly what the live monitor sheet uses
 *      ("KRX_last").
 *   2. If no KP has printed yet (very first rows of the day), fall back to:
 *        a) `prevKrxClose` for the day, if the user supplied one (the
 *           strictly-correct S₀ per the desk's docs); else
 *        b) the row's own KT — making r ≈ 0 and Theo ≈ Published.
 *
 * Premium / Discount is computed separately per ETF reference price:
 *   - premiumLast = (Last - Theo) / Theo
 *   - premiumBid  = (Bid  - Theo) / Theo
 *   - premiumAsk  = (Ask  - Theo) / Theo
 *   - premiumMid  = ((Bid+Ask)/2 - Theo) / Theo
 *
 * The "executable" premium per direction:
 *   - Selling ETF (premium > 0)  → Bid     (worst case for the seller)
 *   - Buying  ETF (premium < 0)  → Ask     (worst case for the buyer)
 *   When Bid/Ask absent, falls back to Last.
 *
 * Each output row carries:
 *   - theoInav            HKD value of the theoretical iNAV
 *   - inavChange          theoretical iNAV %-change vs day's first row
 *   - etfChange           ETF Last %-change (kept for charts)
 *   - premiumDiscount     legacy field = (ETF_last - Theo) / Theo  (== premiumLast)
 *   - premiumLast/Bid/Ask/Mid     all in %
 *   - premiumExecutable   Bid for sell-side, Ask for buy-side (rebuilt by engine)
 *   - bias                'premium' | 'discount' | 'flat'  (Flat: |x| < 0.05%)
 *   - spreadTicks         |Last - Theo| / TICK_SIZE  (in ticks)
 *   - inavSource          'truth' if Published was present this row, else 'derived'
 *                          (rows fully missing Published just skip)
 *   - kpRef / kpRefSource diagnostic — what we used as r-denominator
 *
 *   Legacy diagnostic fields for the validation charts:
 *   - shadowInavChange    synthetic vs 09:30 (Hynix×2 + FX)
 *   - officialInavChange  Published vs 09:30
 */
const FLAT_BAND_PCT = 0.05;  // |premium| < this → "Flat"

// HKT cutoff = KRX 主板收盘 (KST 15:20). After this, two facts hold:
//   1. KP stops ticking (LOCF freeze takes effect naturally).
//   2. BBG-published 7709 IV becomes UNRELIABLE — it diverges from the
//      true post-close fair-value (often −5% to −11% drifts that have no
//      ETF-side counterpart). Empirically validated across 06-02..06-09:
//      ETF and our (KT/KP_freeze)-based Theo are well-aligned, but
//      Published iNAV runs off in random directions.
//
// So after KP_CUTOFF we freeze Published at its 14:20 value and let Theo
// move only via KT relative to KP_freeze. This matches how a desk trader
// mentally extrapolates fair value once the main board closes.
const KP_CUTOFF_HKT = '14:20';

function resolveDay(date, rows) {
    if (rows.length === 0) return [];
    const base = rows[0];

    const baseInav = base.inavPrice;
    const baseEtf = base.etfPrice;
    const baseHynix = base.hynixKP || base.hynixKT;
    const baseFx = base.fxRate;
    if (!baseEtf) return [];

    // Day-level optional previous KRX close, used when KP hasn't printed yet.
    const dayKey = date === '__single__' ? '__single__' : date;
    const prevClose = getPrevKrxClose(dayKey) || null;

    // LOCF cursor over KP — captures 14:20 freeze automatically.
    let kpLast = null;
    // LOCF cursor over Published iNAV at-or-before KP_CUTOFF — used as the
    // base after main-board close (when raw Published becomes unreliable).
    let inavFrozen = null;

    const out = [];
    for (const row of rows) {
        if (row.etfPrice === null || row.etfPrice === undefined) continue;

        // Update KP LOCF tracker
        if (row.hynixKP != null) kpLast = row.hynixKP;
        // Update inavFrozen ONLY while we are still in or before the cutoff
        // window. Past 14:20 we keep the last seen pre-cutoff value.
        if (row.time && row.time <= KP_CUTOFF_HKT && row.inavPrice != null) {
            inavFrozen = row.inavPrice;
        }

        const etfLast = row.etfPrice;
        const etfBid = (row.etfBid != null ? row.etfBid : null);
        const etfAsk = (row.etfAsk != null ? row.etfAsk : null);
        const etfMid = (etfBid != null && etfAsk != null) ? (etfBid + etfAsk) / 2 : null;

        const etfChange = ((etfLast - baseEtf) / baseEtf) * 100;

        // ---- Theoretical iNAV ----
        //   - Pre-cutoff:  use the row's live Published iNAV as the base.
        //   - Post-cutoff: use the 14:20-frozen Published as the base.
        // KP_ref selection (denominator of r) is unchanged: latest KP tick
        // observed at-or-before the row, falling back to prevClose / KT.
        const isPostCutoff = row.time && row.time > KP_CUTOFF_HKT;
        const inavBase = isPostCutoff ? inavFrozen : row.inavPrice;

        let theoInav = null;
        let kpRef = null;
        let kpRefSource = null;
        if (kpLast != null)            { kpRef = kpLast;       kpRefSource = 'kp_locf'; }
        else if (prevClose != null)    { kpRef = prevClose;    kpRefSource = 'prev_close'; }
        else if (row.hynixKT != null)  { kpRef = row.hynixKT;  kpRefSource = 'kt_self'; }

        let r = null;
        if (kpRef != null && row.hynixKT != null && kpRef > 0) {
            r = row.hynixKT / kpRef - 1;
        }
        if (inavBase != null && r != null) {
            theoInav = inavBase * (1 + LEVERAGE * r);
        }

        // ---- Diagnostic series (always vs 09:30 baseline) ----
        const diagHynix = row.hynixKP || row.hynixKT || null;
        let shadowInavChange = null;
        if (diagHynix && baseHynix && baseFx && row.fxRate) {
            const hynixChange = ((diagHynix - baseHynix) / baseHynix) * 100;
            const fxChange = ((row.fxRate - baseFx) / baseFx) * 100;
            shadowInavChange = hynixChange * 2 + fxChange;
        }
        let officialInavChange = null;
        if (row.inavPrice != null && baseInav) {
            officialInavChange = ((row.inavPrice - baseInav) / baseInav) * 100;
        }

        // Skip rows where we can't compute Theo (missing Published or no KP_ref).
        if (theoInav == null) continue;

        // ---- Premiums vs Theoretical iNAV ----
        const pLast = (etfLast - theoInav) / theoInav * 100;
        const pBid  = etfBid != null ? (etfBid - theoInav) / theoInav * 100 : null;
        const pAsk  = etfAsk != null ? (etfAsk - theoInav) / theoInav * 100 : null;
        const pMid  = etfMid != null ? (etfMid - theoInav) / theoInav * 100 : null;

        const inavChange = (theoInav - baseInav) / baseInav * 100;

        // Bias label per Last
        let bias = 'flat';
        if (pLast >  FLAT_BAND_PCT) bias = 'premium';
        if (pLast < -FLAT_BAND_PCT) bias = 'discount';

        // Spread in ticks (Last vs Theo, signed)
        const spreadTicks = (etfLast - theoInav) / TICK_SIZE;

        out.push({
            date: date === '__single__' ? '' : date,
            time: row.time,
            inavPrice: row.inavPrice,
            theoInav,
            hynixKP: row.hynixKP,
            hynixKT: row.hynixKT,
            fxRate: row.fxRate,
            etfPrice: etfLast,
            etfBid, etfAsk, etfMid,
            inavChange,
            etfChange,
            premiumDiscount: pLast,           // legacy alias
            premiumLast: pLast,
            premiumBid: pBid,
            premiumAsk: pAsk,
            premiumMid: pMid,
            bias,
            spreadTicks,
            inavSource: 'truth',              // single-formula model — always Theo
            kpRef, kpRefSource,
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
 * Recalculate the "理论 iNAV" column shown in the backtest table.
 *
 * Single all-day formula (matches resolveDay()):
 *   Theo = Published × (1 + L × (KT/KP_ref - 1))
 *
 * KP_ref:
 *   - LOCF over the day's KP column (so it freezes at the 14:20 print).
 *   - If no KP yet, use prevKrxClose for the day if set, else fall back to
 *     KT (r ≈ 0 → Theo ≈ Published).
 */
export function updateBacktestShadowColumn() {
    const tbody = document.getElementById('data-tbody');
    if (!tbody) return;
    const rows = [...tbody.querySelectorAll('tr')];
    if (rows.length === 0) return;

    const theoIdx = COLUMNS.findIndex(c => c.key === 'theoInav');
    if (theoIdx < 0) return;
    const dateIdx = COLUMNS.findIndex(c => c.key === 'date');
    const inavIdx = COLUMNS.findIndex(c => c.key === 'inavPrice');
    const kpIdx = COLUMNS.findIndex(c => c.key === 'hynixKP');
    const ktIdx = COLUMNS.findIndex(c => c.key === 'hynixKT');

    // Group rows by date so KP-LOCF resets across day boundaries.
    const groups = new Map();
    for (const tr of rows) {
        const inputs = tr.querySelectorAll('input');
        const date = inputs[dateIdx]?.value.trim() || '__single__';
        if (!groups.has(date)) groups.set(date, []);
        groups.get(date).push({ tr, inputs });
    }

    for (const [date, dayRows] of groups) {
        const prevClose = getPrevKrxClose(date) || null;
        let kpLast = null;

        for (const { inputs } of dayRows) {
            const theoCell = inputs[theoIdx];
            if (!theoCell) continue;

            const inav = parseFloat(inputs[inavIdx]?.value);
            const kp   = parseFloat(inputs[kpIdx]?.value);
            const kt   = parseFloat(inputs[ktIdx]?.value);

            if (!isNaN(kp)) kpLast = kp;

            let kpRef = null;
            if (kpLast != null)         kpRef = kpLast;
            else if (prevClose != null) kpRef = prevClose;
            else if (!isNaN(kt))        kpRef = kt;

            let theo = null;
            if (!isNaN(inav) && !isNaN(kt) && kpRef != null && kpRef > 0) {
                theo = inav * (1 + LEVERAGE * (kt / kpRef - 1));
            }
            theoCell.value = theo != null ? theo.toFixed(4) : '';
        }
    }
}
