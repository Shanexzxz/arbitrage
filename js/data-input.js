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

// Demo data from actual BBG export (2026-05-21), 1-minute granularity (420 rows, 09:30-16:29).
// 与"导入 BBG Excel"得到的结果完全一致：iNAV 取每分钟首个 15s tick 作为快照，
// ETF/KP/KT/FX 用 LOCF 对齐到该时刻。FX 已从 KRW/USD（~1500）按 USD/HKD=7.8 换算成 HKD/KRW（~0.0052）。
const DEMO_DATA = [
    { date: '2026-05-21', time: '09:30', inavPrice: '93.8025', hynixKP: '1897000', hynixKT: '1897000', fxRate: '0.005199', etfPrice: '94.10' },
    { date: '2026-05-21', time: '09:31', inavPrice: '94.2730', hynixKP: '1904000', hynixKT: '1904000', fxRate: '0.005199', etfPrice: '94.70' },
    { date: '2026-05-21', time: '09:32', inavPrice: '94.3654', hynixKP: '1905000', hynixKT: '1905000', fxRate: '0.005200', etfPrice: '94.74' },
    { date: '2026-05-21', time: '09:33', inavPrice: '94.8152', hynixKP: '1909000', hynixKT: '1909000', fxRate: '0.005198', etfPrice: '95.24' },
    { date: '2026-05-21', time: '09:34', inavPrice: '94.6300', hynixKP: '1909000', hynixKT: '1909000', fxRate: '0.005198', etfPrice: '94.98' },
    { date: '2026-05-21', time: '09:35', inavPrice: '94.5392', hynixKP: '1907000', hynixKT: '1908000', fxRate: '0.005198', etfPrice: '94.90' },
    { date: '2026-05-21', time: '09:36', inavPrice: '94.5402', hynixKP: '1907000', hynixKT: '1907000', fxRate: '0.005197', etfPrice: '94.86' },
    { date: '2026-05-21', time: '09:37', inavPrice: '94.8152', hynixKP: '1910000', hynixKT: '1909000', fxRate: '0.005198', etfPrice: '94.92' },
    { date: '2026-05-21', time: '09:38', inavPrice: '94.7245', hynixKP: '1907000', hynixKT: '1908000', fxRate: '0.005198', etfPrice: '94.88' },
    { date: '2026-05-21', time: '09:39', inavPrice: '94.9109', hynixKP: '1910000', hynixKT: '1910000', fxRate: '0.005199', etfPrice: '95.02' },
    { date: '2026-05-21', time: '09:40', inavPrice: '94.5432', hynixKP: '1905000', hynixKT: '1905000', fxRate: '0.005199', etfPrice: '94.62' },
    { date: '2026-05-21', time: '09:41', inavPrice: '94.4556', hynixKP: '1906500', hynixKT: '1906000', fxRate: '0.005200', etfPrice: '94.66' },
    { date: '2026-05-21', time: '09:42', inavPrice: '93.9015', hynixKP: '1900500', hynixKT: '1900000', fxRate: '0.005199', etfPrice: '94.02' },
    { date: '2026-05-21', time: '09:43', inavPrice: '93.9025', hynixKP: '1902000', hynixKT: '1900000', fxRate: '0.005198', etfPrice: '94.12' },
    { date: '2026-05-21', time: '09:44', inavPrice: '93.9893', hynixKP: '1901000', hynixKT: '1901000', fxRate: '0.005198', etfPrice: '94.18' },
    { date: '2026-05-21', time: '09:45', inavPrice: '93.9899', hynixKP: '1900000', hynixKT: '1901000', fxRate: '0.005198', etfPrice: '94.14' },
    { date: '2026-05-21', time: '09:46', inavPrice: '93.8006', hynixKP: '1899000', hynixKT: '1899000', fxRate: '0.005198', etfPrice: '94.06' },
    { date: '2026-05-21', time: '09:47', inavPrice: '93.8000', hynixKP: '1899000', hynixKT: '1899000', fxRate: '0.005197', etfPrice: '93.94' },
    { date: '2026-05-21', time: '09:48', inavPrice: '93.6135', hynixKP: '1898000', hynixKT: '1897000', fxRate: '0.005197', etfPrice: '93.76' },
    { date: '2026-05-21', time: '09:49', inavPrice: '93.7948', hynixKP: '1900000', hynixKT: '1900000', fxRate: '0.005196', etfPrice: '93.88' },
    { date: '2026-05-21', time: '09:50', inavPrice: '93.8768', hynixKP: '1900000', hynixKT: '1899000', fxRate: '0.005192', etfPrice: '93.90' },
    { date: '2026-05-21', time: '09:51', inavPrice: '93.8730', hynixKP: '1900000', hynixKT: '1900000', fxRate: '0.005191', etfPrice: '93.94' },
    { date: '2026-05-21', time: '09:52', inavPrice: '94.0551', hynixKP: '1902000', hynixKT: '1903000', fxRate: '0.005192', etfPrice: '94.20' },
    { date: '2026-05-21', time: '09:53', inavPrice: '93.9645', hynixKP: '1901000', hynixKT: '1902000', fxRate: '0.005192', etfPrice: '93.96' },
    { date: '2026-05-21', time: '09:54', inavPrice: '93.4069', hynixKP: '1896000', hynixKT: '1896000', fxRate: '0.005188', etfPrice: '93.38' },
    { date: '2026-05-21', time: '09:55', inavPrice: '92.7595', hynixKP: '1888000', hynixKT: '1888000', fxRate: '0.005185', etfPrice: '92.82' },
    { date: '2026-05-21', time: '09:56', inavPrice: '92.8491', hynixKP: '1889000', hynixKT: '1889000', fxRate: '0.005185', etfPrice: '92.90' },
    { date: '2026-05-21', time: '09:57', inavPrice: '92.7613', hynixKP: '1888000', hynixKT: '1888000', fxRate: '0.005187', etfPrice: '92.78' },
    { date: '2026-05-21', time: '09:58', inavPrice: '93.5927', hynixKP: '1898000', hynixKT: '1898000', fxRate: '0.005190', etfPrice: '93.58' },
    { date: '2026-05-21', time: '09:59', inavPrice: '93.6852', hynixKP: '1900000', hynixKT: '1900000', fxRate: '0.005190', etfPrice: '93.80' },
    { date: '2026-05-21', time: '10:00', inavPrice: '93.5937', hynixKP: '1901000', hynixKT: '1900000', fxRate: '0.005189', etfPrice: '94.14' },
    { date: '2026-05-21', time: '10:01', inavPrice: '93.7843', hynixKP: '1900000', hynixKT: '1900000', fxRate: '0.005189', etfPrice: '94.00' },
    { date: '2026-05-21', time: '10:02', inavPrice: '94.1510', hynixKP: '1904000', hynixKT: '1904000', fxRate: '0.005190', etfPrice: '94.36' },
    { date: '2026-05-21', time: '10:03', inavPrice: '94.3340', hynixKP: '1903000', hynixKT: '1903000', fxRate: '0.005190', etfPrice: '94.22' },
    { date: '2026-05-21', time: '10:04', inavPrice: '94.2435', hynixKP: '1905000', hynixKT: '1905000', fxRate: '0.005191', etfPrice: '94.40' },
    { date: '2026-05-21', time: '10:05', inavPrice: '94.4255', hynixKP: '1906000', hynixKT: '1906000', fxRate: '0.005191', etfPrice: '94.44' },
    { date: '2026-05-21', time: '10:06', inavPrice: '94.6133', hynixKP: '1908000', hynixKT: '1908000', fxRate: '0.005191', etfPrice: '94.78' },
    { date: '2026-05-21', time: '10:07', inavPrice: '94.6178', hynixKP: '1909000', hynixKT: '1909000', fxRate: '0.005192', etfPrice: '94.90' },
    { date: '2026-05-21', time: '10:08', inavPrice: '94.7016', hynixKP: '1909000', hynixKT: '1909000', fxRate: '0.005192', etfPrice: '94.92' },
    { date: '2026-05-21', time: '10:09', inavPrice: '94.7957', hynixKP: '1910000', hynixKT: '1910000', fxRate: '0.005192', etfPrice: '95.06' },
    { date: '2026-05-21', time: '10:10', inavPrice: '94.9757', hynixKP: '1913000', hynixKT: '1913000', fxRate: '0.005192', etfPrice: '95.22' },
    { date: '2026-05-21', time: '10:11', inavPrice: '95.0724', hynixKP: '1913000', hynixKT: '1913000', fxRate: '0.005192', etfPrice: '95.12' },
    { date: '2026-05-21', time: '10:12', inavPrice: '95.0723', hynixKP: '1912000', hynixKT: '1913000', fxRate: '0.005192', etfPrice: '95.10' },
    { date: '2026-05-21', time: '10:13', inavPrice: '94.9767', hynixKP: '1913000', hynixKT: '1913000', fxRate: '0.005191', etfPrice: '95.08' },
    { date: '2026-05-21', time: '10:14', inavPrice: '94.5187', hynixKP: '1907000', hynixKT: '1907000', fxRate: '0.005190', etfPrice: '94.78' },
    { date: '2026-05-21', time: '10:15', inavPrice: '94.7949', hynixKP: '1911000', hynixKT: '1911000', fxRate: '0.005191', etfPrice: '95.00' },
    { date: '2026-05-21', time: '10:16', inavPrice: '94.9748', hynixKP: '1913000', hynixKT: '1913000', fxRate: '0.005192', etfPrice: '95.28' },
    { date: '2026-05-21', time: '10:17', inavPrice: '95.0628', hynixKP: '1915000', hynixKT: '1914000', fxRate: '0.005191', etfPrice: '95.46' },
    { date: '2026-05-21', time: '10:18', inavPrice: '95.4321', hynixKP: '1918000', hynixKT: '1918000', fxRate: '0.005191', etfPrice: '95.66' },
    { date: '2026-05-21', time: '10:19', inavPrice: '95.4265', hynixKP: '1918000', hynixKT: '1918000', fxRate: '0.005191', etfPrice: '95.76' },
    { date: '2026-05-21', time: '10:20', inavPrice: '95.6099', hynixKP: '1919000', hynixKT: '1919000', fxRate: '0.005190', etfPrice: '95.80' },
    { date: '2026-05-21', time: '10:21', inavPrice: '95.6960', hynixKP: '1920000', hynixKT: '1920000', fxRate: '0.005189', etfPrice: '95.90' },
    { date: '2026-05-21', time: '10:22', inavPrice: '95.7003', hynixKP: '1920000', hynixKT: '1920000', fxRate: '0.005190', etfPrice: '95.90' },
    { date: '2026-05-21', time: '10:23', inavPrice: '95.6099', hynixKP: '1919000', hynixKT: '1920000', fxRate: '0.005190', etfPrice: '95.80' },
    { date: '2026-05-21', time: '10:24', inavPrice: '95.6937', hynixKP: '1922000', hynixKT: '1920000', fxRate: '0.005189', etfPrice: '96.00' },
    { date: '2026-05-21', time: '10:25', inavPrice: '96.4301', hynixKP: '1928000', hynixKT: '1928000', fxRate: '0.005190', etfPrice: '96.72' },
    { date: '2026-05-21', time: '10:26', inavPrice: '96.6143', hynixKP: '1930000', hynixKT: '1930000', fxRate: '0.005190', etfPrice: '96.78' },
    { date: '2026-05-21', time: '10:27', inavPrice: '97.0694', hynixKP: '1935000', hynixKT: '1935000', fxRate: '0.005190', etfPrice: '97.26' },
    { date: '2026-05-21', time: '10:28', inavPrice: '97.3451', hynixKP: '1939000', hynixKT: '1939000', fxRate: '0.005190', etfPrice: '97.66' },
    { date: '2026-05-21', time: '10:29', inavPrice: '97.4366', hynixKP: '1940000', hynixKT: '1940000', fxRate: '0.005190', etfPrice: '97.74' },
    { date: '2026-05-21', time: '10:30', inavPrice: '97.5257', hynixKP: '1940000', hynixKT: '1940000', fxRate: '0.005189', etfPrice: '97.78' },
    { date: '2026-05-21', time: '10:31', inavPrice: '97.9742', hynixKP: '1945000', hynixKT: '1945000', fxRate: '0.005189', etfPrice: '98.16' },
    { date: '2026-05-21', time: '10:32', inavPrice: '98.1627', hynixKP: '1948000', hynixKT: '1948000', fxRate: '0.005191', etfPrice: '98.36' },
    { date: '2026-05-21', time: '10:33', inavPrice: '97.8903', hynixKP: '1945000', hynixKT: '1945000', fxRate: '0.005190', etfPrice: '98.02' },
    { date: '2026-05-21', time: '10:34', inavPrice: '97.6132', hynixKP: '1939000', hynixKT: '1939000', fxRate: '0.005190', etfPrice: '97.60' },
    { date: '2026-05-21', time: '10:35', inavPrice: '97.3363', hynixKP: '1940000', hynixKT: '1939000', fxRate: '0.005190', etfPrice: '97.78' },
    { date: '2026-05-21', time: '10:36', inavPrice: '97.8968', hynixKP: '1948000', hynixKT: '1945000', fxRate: '0.005191', etfPrice: '98.36' },
    { date: '2026-05-21', time: '10:37', inavPrice: '98.1727', hynixKP: '1948000', hynixKT: '1947000', fxRate: '0.005191', etfPrice: '98.48' },
    { date: '2026-05-21', time: '10:38', inavPrice: '98.1724', hynixKP: '1947000', hynixKT: '1947000', fxRate: '0.005191', etfPrice: '98.56' },
    { date: '2026-05-21', time: '10:39', inavPrice: '98.3474', hynixKP: '1949000', hynixKT: '1949000', fxRate: '0.005189', etfPrice: '98.60' },
    { date: '2026-05-21', time: '10:40', inavPrice: '98.3503', hynixKP: '1949000', hynixKT: '1948500', fxRate: '0.005189', etfPrice: '98.66' },
    { date: '2026-05-21', time: '10:41', inavPrice: '98.1666', hynixKP: '1948000', hynixKT: '1948000', fxRate: '0.005189', etfPrice: '98.56' },
    { date: '2026-05-21', time: '10:42', inavPrice: '98.3478', hynixKP: '1949000', hynixKT: '1949000', fxRate: '0.005189', etfPrice: '98.50' },
    { date: '2026-05-21', time: '10:43', inavPrice: '98.0772', hynixKP: '1946000', hynixKT: '1947000', fxRate: '0.005189', etfPrice: '98.26' },
    { date: '2026-05-21', time: '10:44', inavPrice: '97.6197', hynixKP: '1942000', hynixKT: '1941000', fxRate: '0.005189', etfPrice: '97.92' },
    { date: '2026-05-21', time: '10:45', inavPrice: '97.8002', hynixKP: '1941000', hynixKT: '1941000', fxRate: '0.005189', etfPrice: '97.94' },
    { date: '2026-05-21', time: '10:46', inavPrice: '97.3415', hynixKP: '1937500', hynixKT: '1937000', fxRate: '0.005188', etfPrice: '97.60' },
    { date: '2026-05-21', time: '10:47', inavPrice: '97.4258', hynixKP: '1938000', hynixKT: '1938000', fxRate: '0.005187', etfPrice: '97.66' },
    { date: '2026-05-21', time: '10:48', inavPrice: '97.6148', hynixKP: '1940000', hynixKT: '1940000', fxRate: '0.005189', etfPrice: '97.86' },
    { date: '2026-05-21', time: '10:49', inavPrice: '97.3451', hynixKP: '1937000', hynixKT: '1937000', fxRate: '0.005190', etfPrice: '97.68' },
    { date: '2026-05-21', time: '10:50', inavPrice: '97.2536', hynixKP: '1935000', hynixKT: '1935000', fxRate: '0.005190', etfPrice: '97.46' },
    { date: '2026-05-21', time: '10:51', inavPrice: '97.3551', hynixKP: '1938000', hynixKT: '1938000', fxRate: '0.005190', etfPrice: '97.48' },
    { date: '2026-05-21', time: '10:52', inavPrice: '97.2529', hynixKP: '1937000', hynixKT: '1937000', fxRate: '0.005187', etfPrice: '97.52' },
    { date: '2026-05-21', time: '10:53', inavPrice: '97.3432', hynixKP: '1937000', hynixKT: '1937000', fxRate: '0.005187', etfPrice: '97.54' },
    { date: '2026-05-21', time: '10:54', inavPrice: '97.5261', hynixKP: '1939000', hynixKT: '1939000', fxRate: '0.005187', etfPrice: '97.62' },
    { date: '2026-05-21', time: '10:55', inavPrice: '97.4287', hynixKP: '1939000', hynixKT: '1939000', fxRate: '0.005185', etfPrice: '97.56' },
    { date: '2026-05-21', time: '10:56', inavPrice: '97.5161', hynixKP: '1938000', hynixKT: '1939000', fxRate: '0.005186', etfPrice: '97.54' },
    { date: '2026-05-21', time: '10:57', inavPrice: '97.0622', hynixKP: '1937000', hynixKT: '1934000', fxRate: '0.005186', etfPrice: '97.22' },
    { date: '2026-05-21', time: '10:58', inavPrice: '97.0542', hynixKP: '1935000', hynixKT: '1935000', fxRate: '0.005185', etfPrice: '97.12' },
    { date: '2026-05-21', time: '10:59', inavPrice: '97.4139', hynixKP: '1938000', hynixKT: '1937000', fxRate: '0.005183', etfPrice: '97.48' },
    { date: '2026-05-21', time: '11:00', inavPrice: '97.0448', hynixKP: '1935000', hynixKT: '1935500', fxRate: '0.005181', etfPrice: '97.10' },
    { date: '2026-05-21', time: '11:01', inavPrice: '97.5105', hynixKP: '1939000', hynixKT: '1939000', fxRate: '0.005182', etfPrice: '97.50' },
    { date: '2026-05-21', time: '11:02', inavPrice: '97.3259', hynixKP: '1936000', hynixKT: '1936000', fxRate: '0.005183', etfPrice: '97.30' },
    { date: '2026-05-21', time: '11:03', inavPrice: '97.3265', hynixKP: '1937000', hynixKT: '1937000', fxRate: '0.005183', etfPrice: '97.38' },
    { date: '2026-05-21', time: '11:04', inavPrice: '97.1461', hynixKP: '1936000', hynixKT: '1936000', fxRate: '0.005183', etfPrice: '97.20' },
    { date: '2026-05-21', time: '11:05', inavPrice: '97.1452', hynixKP: '1935000', hynixKT: '1934000', fxRate: '0.005183', etfPrice: '97.14' },
    { date: '2026-05-21', time: '11:06', inavPrice: '96.8697', hynixKP: '1933000', hynixKT: '1933000', fxRate: '0.005182', etfPrice: '96.90' },
    { date: '2026-05-21', time: '11:07', inavPrice: '96.8717', hynixKP: '1932000', hynixKT: '1931000', fxRate: '0.005182', etfPrice: '96.86' },
    { date: '2026-05-21', time: '11:08', inavPrice: '97.0501', hynixKP: '1933000', hynixKT: '1933000', fxRate: '0.005181', etfPrice: '96.98' },
    { date: '2026-05-21', time: '11:09', inavPrice: '97.0465', hynixKP: '1935000', hynixKT: '1934000', fxRate: '0.005181', etfPrice: '96.94' },
    { date: '2026-05-21', time: '11:10', inavPrice: '97.5069', hynixKP: '1939000', hynixKT: '1939000', fxRate: '0.005182', etfPrice: '97.48' },
    { date: '2026-05-21', time: '11:11', inavPrice: '97.6960', hynixKP: '1941000', hynixKT: '1941000', fxRate: '0.005181', etfPrice: '97.66' },
    { date: '2026-05-21', time: '11:12', inavPrice: '97.6059', hynixKP: '1941000', hynixKT: '1941000', fxRate: '0.005182', etfPrice: '97.60' },
    { date: '2026-05-21', time: '11:13', inavPrice: '97.6992', hynixKP: '1941000', hynixKT: '1940000', fxRate: '0.005181', etfPrice: '97.64' },
    { date: '2026-05-21', time: '11:14', inavPrice: '97.6958', hynixKP: '1941000', hynixKT: '1941000', fxRate: '0.005182', etfPrice: '97.62' },
    { date: '2026-05-21', time: '11:15', inavPrice: '97.6997', hynixKP: '1941000', hynixKT: '1941000', fxRate: '0.005183', etfPrice: '97.64' },
    { date: '2026-05-21', time: '11:16', inavPrice: '97.5145', hynixKP: '1938000', hynixKT: '1938000', fxRate: '0.005182', etfPrice: '97.30' },
    { date: '2026-05-21', time: '11:17', inavPrice: '97.3261', hynixKP: '1936000', hynixKT: '1937000', fxRate: '0.005181', etfPrice: '97.30' },
    { date: '2026-05-21', time: '11:18', inavPrice: '97.3349', hynixKP: '1937000', hynixKT: '1936500', fxRate: '0.005182', etfPrice: '97.24' },
    { date: '2026-05-21', time: '11:19', inavPrice: '97.3313', hynixKP: '1939000', hynixKT: '1937000', fxRate: '0.005182', etfPrice: '97.42' },
    { date: '2026-05-21', time: '11:20', inavPrice: '97.8838', hynixKP: '1944000', hynixKT: '1942000', fxRate: '0.005183', etfPrice: '97.88' },
    { date: '2026-05-21', time: '11:21', inavPrice: '97.8824', hynixKP: '1943000', hynixKT: '1943000', fxRate: '0.005183', etfPrice: '97.90' },
    { date: '2026-05-21', time: '11:22', inavPrice: '98.2465', hynixKP: '1946000', hynixKT: '1946000', fxRate: '0.005184', etfPrice: '98.22' },
    { date: '2026-05-21', time: '11:23', inavPrice: '98.3405', hynixKP: '1948000', hynixKT: '1948000', fxRate: '0.005185', etfPrice: '98.36' },
    { date: '2026-05-21', time: '11:24', inavPrice: '98.3455', hynixKP: '1949000', hynixKT: '1949000', fxRate: '0.005185', etfPrice: '98.46' },
    { date: '2026-05-21', time: '11:25', inavPrice: '98.3467', hynixKP: '1948000', hynixKT: '1948000', fxRate: '0.005186', etfPrice: '98.32' },
    { date: '2026-05-21', time: '11:26', inavPrice: '98.3537', hynixKP: '1947000', hynixKT: '1948000', fxRate: '0.005187', etfPrice: '98.36' },
    { date: '2026-05-21', time: '11:27', inavPrice: '98.2630', hynixKP: '1948000', hynixKT: '1948000', fxRate: '0.005186', etfPrice: '98.24' },
    { date: '2026-05-21', time: '11:28', inavPrice: '98.1690', hynixKP: '1947000', hynixKT: '1947000', fxRate: '0.005186', etfPrice: '98.08' },
    { date: '2026-05-21', time: '11:29', inavPrice: '98.3537', hynixKP: '1948000', hynixKT: '1948000', fxRate: '0.005185', etfPrice: '98.36' },
    { date: '2026-05-21', time: '11:30', inavPrice: '98.2587', hynixKP: '1947000', hynixKT: '1947000', fxRate: '0.005186', etfPrice: '98.12' },
    { date: '2026-05-21', time: '11:31', inavPrice: '98.4476', hynixKP: '1950000', hynixKT: '1950000', fxRate: '0.005186', etfPrice: '98.34' },
    { date: '2026-05-21', time: '11:32', inavPrice: '98.4469', hynixKP: '1950000', hynixKT: '1950000', fxRate: '0.005185', etfPrice: '98.30' },
    { date: '2026-05-21', time: '11:33', inavPrice: '98.1706', hynixKP: '1947000', hynixKT: '1947000', fxRate: '0.005187', etfPrice: '98.20' },
    { date: '2026-05-21', time: '11:34', inavPrice: '98.3615', hynixKP: '1949000', hynixKT: '1948000', fxRate: '0.005187', etfPrice: '98.34' },
    { date: '2026-05-21', time: '11:35', inavPrice: '98.1743', hynixKP: '1947000', hynixKT: '1947000', fxRate: '0.005186', etfPrice: '98.22' },
    { date: '2026-05-21', time: '11:36', inavPrice: '97.9861', hynixKP: '1945000', hynixKT: '1945000', fxRate: '0.005185', etfPrice: '97.94' },
    { date: '2026-05-21', time: '11:37', inavPrice: '98.0776', hynixKP: '1947000', hynixKT: '1946000', fxRate: '0.005186', etfPrice: '98.10' },
    { date: '2026-05-21', time: '11:38', inavPrice: '97.9885', hynixKP: '1946000', hynixKT: '1945000', fxRate: '0.005186', etfPrice: '98.10' },
    { date: '2026-05-21', time: '11:39', inavPrice: '98.0778', hynixKP: '1947000', hynixKT: '1946000', fxRate: '0.005186', etfPrice: '98.10' },
    { date: '2026-05-21', time: '11:40', inavPrice: '98.1690', hynixKP: '1946000', hynixKT: '1946000', fxRate: '0.005186', etfPrice: '98.00' },
    { date: '2026-05-21', time: '11:41', inavPrice: '98.0710', hynixKP: '1945000', hynixKT: '1945000', fxRate: '0.005186', etfPrice: '97.94' },
    { date: '2026-05-21', time: '11:42', inavPrice: '97.7985', hynixKP: '1942000', hynixKT: '1942000', fxRate: '0.005185', etfPrice: '97.60' },
    { date: '2026-05-21', time: '11:43', inavPrice: '97.7054', hynixKP: '1941000', hynixKT: '1941000', fxRate: '0.005186', etfPrice: '97.62' },
    { date: '2026-05-21', time: '11:44', inavPrice: '97.8892', hynixKP: '1943000', hynixKT: '1943000', fxRate: '0.005187', etfPrice: '97.82' },
    { date: '2026-05-21', time: '11:45', inavPrice: '97.7968', hynixKP: '1943000', hynixKT: '1942000', fxRate: '0.005186', etfPrice: '97.70' },
    { date: '2026-05-21', time: '11:46', inavPrice: '97.7054', hynixKP: '1942000', hynixKT: '1942000', fxRate: '0.005186', etfPrice: '97.70' },
    { date: '2026-05-21', time: '11:47', inavPrice: '97.6115', hynixKP: '1937000', hynixKT: '1939000', fxRate: '0.005185', etfPrice: '97.32' },
    { date: '2026-05-21', time: '11:48', inavPrice: '97.1520', hynixKP: '1936000', hynixKT: '1936000', fxRate: '0.005185', etfPrice: '97.16' },
    { date: '2026-05-21', time: '11:49', inavPrice: '97.0648', hynixKP: '1936000', hynixKT: '1936000', fxRate: '0.005185', etfPrice: '97.10' },
    { date: '2026-05-21', time: '11:50', inavPrice: '96.9680', hynixKP: '1934000', hynixKT: '1934000', fxRate: '0.005184', etfPrice: '96.90' },
    { date: '2026-05-21', time: '11:51', inavPrice: '96.6881', hynixKP: '1933000', hynixKT: '1932000', fxRate: '0.005183', etfPrice: '96.76' },
    { date: '2026-05-21', time: '11:52', inavPrice: '97.2399', hynixKP: '1938000', hynixKT: '1938000', fxRate: '0.005184', etfPrice: '97.16' },
    { date: '2026-05-21', time: '11:53', inavPrice: '97.3277', hynixKP: '1938000', hynixKT: '1938000', fxRate: '0.005183', etfPrice: '97.24' },
    { date: '2026-05-21', time: '11:54', inavPrice: '97.2363', hynixKP: '1936000', hynixKT: '1937000', fxRate: '0.005183', etfPrice: '97.00' },
    { date: '2026-05-21', time: '11:55', inavPrice: '96.9657', hynixKP: '1933000', hynixKT: '1933000', fxRate: '0.005183', etfPrice: '96.94' },
    { date: '2026-05-21', time: '11:56', inavPrice: '97.4182', hynixKP: '1939000', hynixKT: '1938000', fxRate: '0.005183', etfPrice: '97.32' },
    { date: '2026-05-21', time: '11:57', inavPrice: '97.4167', hynixKP: '1939000', hynixKT: '1939000', fxRate: '0.005183', etfPrice: '97.28' },
    { date: '2026-05-21', time: '11:58', inavPrice: '97.3313', hynixKP: '1938000', hynixKT: '1938000', fxRate: '0.005184', etfPrice: '97.26' },
    { date: '2026-05-21', time: '11:59', inavPrice: '97.5178', hynixKP: '1940000', hynixKT: '1939000', fxRate: '0.005184', etfPrice: '97.40' },
    { date: '2026-05-21', time: '12:00', inavPrice: '97.3313', hynixKP: '1938000', hynixKT: '1938000', fxRate: '0.005184', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:01', inavPrice: '97.3331', hynixKP: '1939000', hynixKT: '1938000', fxRate: '0.005183', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:02', inavPrice: '97.4203', hynixKP: '1940000', hynixKT: '1940000', fxRate: '0.005183', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:03', inavPrice: '97.5993', hynixKP: '1940000', hynixKT: '1940000', fxRate: '0.005182', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:04', inavPrice: '97.8745', hynixKP: '1944000', hynixKT: '1943000', fxRate: '0.005182', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:05', inavPrice: '97.9656', hynixKP: '1943000', hynixKT: '1944000', fxRate: '0.005182', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:06', inavPrice: '97.7834', hynixKP: '1944000', hynixKT: '1944000', fxRate: '0.005182', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:07', inavPrice: '97.9643', hynixKP: '1945000', hynixKT: '1945000', fxRate: '0.005182', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:08', inavPrice: '97.8761', hynixKP: '1942000', hynixKT: '1942500', fxRate: '0.005182', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:09', inavPrice: '97.5924', hynixKP: '1941000', hynixKT: '1941000', fxRate: '0.005180', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:10', inavPrice: '97.8662', hynixKP: '1943000', hynixKT: '1943000', fxRate: '0.005180', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:11', inavPrice: '97.8798', hynixKP: '1943000', hynixKT: '1943000', fxRate: '0.005181', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:12', inavPrice: '97.6975', hynixKP: '1941000', hynixKT: '1941000', fxRate: '0.005181', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:13', inavPrice: '97.6925', hynixKP: '1942000', hynixKT: '1941000', fxRate: '0.005181', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:14', inavPrice: '97.3282', hynixKP: '1938000', hynixKT: '1939000', fxRate: '0.005180', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:15', inavPrice: '97.6071', hynixKP: '1940000', hynixKT: '1939000', fxRate: '0.005182', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:16', inavPrice: '97.6071', hynixKP: '1940000', hynixKT: '1940000', fxRate: '0.005182', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:17', inavPrice: '97.5193', hynixKP: '1940000', hynixKT: '1939000', fxRate: '0.005183', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:18', inavPrice: '97.4274', hynixKP: '1938000', hynixKT: '1937500', fxRate: '0.005183', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:19', inavPrice: '97.4296', hynixKP: '1938000', hynixKT: '1938000', fxRate: '0.005183', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:20', inavPrice: '97.4277', hynixKP: '1938000', hynixKT: '1938000', fxRate: '0.005182', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:21', inavPrice: '97.1438', hynixKP: '1936000', hynixKT: '1935000', fxRate: '0.005182', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:22', inavPrice: '97.3229', hynixKP: '1936000', hynixKT: '1937000', fxRate: '0.005182', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:23', inavPrice: '97.2316', hynixKP: '1935000', hynixKT: '1935000', fxRate: '0.005181', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:24', inavPrice: '97.3241', hynixKP: '1937000', hynixKT: '1937000', fxRate: '0.005181', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:25', inavPrice: '97.6018', hynixKP: '1942000', hynixKT: '1940000', fxRate: '0.005182', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:26', inavPrice: '97.7846', hynixKP: '1942000', hynixKT: '1942000', fxRate: '0.005183', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:27', inavPrice: '97.8772', hynixKP: '1943000', hynixKT: '1942000', fxRate: '0.005183', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:28', inavPrice: '97.7922', hynixKP: '1942000', hynixKT: '1942000', fxRate: '0.005183', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:29', inavPrice: '97.5141', hynixKP: '1939000', hynixKT: '1939000', fxRate: '0.005184', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:30', inavPrice: '97.1497', hynixKP: '1937000', hynixKT: '1937000', fxRate: '0.005184', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:31', inavPrice: '97.1527', hynixKP: '1936000', hynixKT: '1936000', fxRate: '0.005184', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:32', inavPrice: '97.1483', hynixKP: '1934000', hynixKT: '1934000', fxRate: '0.005183', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:33', inavPrice: '97.4203', hynixKP: '1938000', hynixKT: '1938000', fxRate: '0.005183', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:34', inavPrice: '97.2328', hynixKP: '1935000', hynixKT: '1935000', fxRate: '0.005182', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:35', inavPrice: '97.3265', hynixKP: '1936000', hynixKT: '1936000', fxRate: '0.005182', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:36', inavPrice: '97.3258', hynixKP: '1937000', hynixKT: '1936000', fxRate: '0.005182', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:37', inavPrice: '97.5105', hynixKP: '1940000', hynixKT: '1940000', fxRate: '0.005182', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:38', inavPrice: '97.6915', hynixKP: '1941000', hynixKT: '1941000', fxRate: '0.005182', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:39', inavPrice: '97.7885', hynixKP: '1941000', hynixKT: '1941000', fxRate: '0.005182', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:40', inavPrice: '97.6896', hynixKP: '1941000', hynixKT: '1941000', fxRate: '0.005181', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:41', inavPrice: '97.5994', hynixKP: '1939000', hynixKT: '1939000', fxRate: '0.005182', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:42', inavPrice: '97.6014', hynixKP: '1940000', hynixKT: '1940000', fxRate: '0.005182', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:43', inavPrice: '97.6026', hynixKP: '1940000', hynixKT: '1940000', fxRate: '0.005182', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:44', inavPrice: '97.7819', hynixKP: '1941000', hynixKT: '1941000', fxRate: '0.005182', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:45', inavPrice: '97.6969', hynixKP: '1942000', hynixKT: '1942000', fxRate: '0.005184', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:46', inavPrice: '97.9800', hynixKP: '1943000', hynixKT: '1943000', fxRate: '0.005184', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:47', inavPrice: '97.9744', hynixKP: '1944000', hynixKT: '1943000', fxRate: '0.005182', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:48', inavPrice: '98.0670', hynixKP: '1945000', hynixKT: '1945000', fxRate: '0.005182', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:49', inavPrice: '98.0639', hynixKP: '1945000', hynixKT: '1945000', fxRate: '0.005182', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:50', inavPrice: '98.1578', hynixKP: '1946000', hynixKT: '1946000', fxRate: '0.005183', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:51', inavPrice: '98.0743', hynixKP: '1946000', hynixKT: '1946000', fxRate: '0.005184', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:52', inavPrice: '97.6143', hynixKP: '1941000', hynixKT: '1941000', fxRate: '0.005184', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:53', inavPrice: '97.8863', hynixKP: '1944000', hynixKT: '1944000', fxRate: '0.005184', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:54', inavPrice: '97.6080', hynixKP: '1942000', hynixKT: '1942000', fxRate: '0.005182', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:55', inavPrice: '97.5164', hynixKP: '1940000', hynixKT: '1940000', fxRate: '0.005182', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:56', inavPrice: '97.4267', hynixKP: '1939000', hynixKT: '1939000', fxRate: '0.005182', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:57', inavPrice: '97.3326', hynixKP: '1941000', hynixKT: '1939000', fxRate: '0.005182', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:58', inavPrice: '97.5181', hynixKP: '1940000', hynixKT: '1940000', fxRate: '0.005182', etfPrice: '97.22' },
    { date: '2026-05-21', time: '12:59', inavPrice: '97.7923', hynixKP: '1943000', hynixKT: '1942500', fxRate: '0.005182', etfPrice: '97.22' },
    { date: '2026-05-21', time: '13:00', inavPrice: '97.6989', hynixKP: '1940000', hynixKT: '1941000', fxRate: '0.005182', etfPrice: '97.72' },
    { date: '2026-05-21', time: '13:01', inavPrice: '97.4227', hynixKP: '1940000', hynixKT: '1940000', fxRate: '0.005184', etfPrice: '97.58' },
    { date: '2026-05-21', time: '13:02', inavPrice: '97.5201', hynixKP: '1939000', hynixKT: '1939000', fxRate: '0.005185', etfPrice: '97.54' },
    { date: '2026-05-21', time: '13:03', inavPrice: '97.7017', hynixKP: '1941000', hynixKT: '1942000', fxRate: '0.005185', etfPrice: '97.70' },
    { date: '2026-05-21', time: '13:04', inavPrice: '97.5201', hynixKP: '1939000', hynixKT: '1940000', fxRate: '0.005185', etfPrice: '97.52' },
    { date: '2026-05-21', time: '13:05', inavPrice: '97.4335', hynixKP: '1940000', hynixKT: '1939000', fxRate: '0.005186', etfPrice: '97.58' },
    { date: '2026-05-21', time: '13:06', inavPrice: '97.3396', hynixKP: '1940000', hynixKT: '1940000', fxRate: '0.005186', etfPrice: '97.52' },
    { date: '2026-05-21', time: '13:07', inavPrice: '97.4311', hynixKP: '1939000', hynixKT: '1940000', fxRate: '0.005186', etfPrice: '97.50' },
    { date: '2026-05-21', time: '13:08', inavPrice: '97.3384', hynixKP: '1939000', hynixKT: '1939000', fxRate: '0.005185', etfPrice: '97.30' },
    { date: '2026-05-21', time: '13:09', inavPrice: '97.1539', hynixKP: '1937000', hynixKT: '1938000', fxRate: '0.005185', etfPrice: '97.22' },
    { date: '2026-05-21', time: '13:10', inavPrice: '97.3319', hynixKP: '1939000', hynixKT: '1939000', fxRate: '0.005185', etfPrice: '97.30' },
    { date: '2026-05-21', time: '13:11', inavPrice: '97.4251', hynixKP: '1939000', hynixKT: '1939000', fxRate: '0.005184', etfPrice: '97.46' },
    { date: '2026-05-21', time: '13:12', inavPrice: '97.6046', hynixKP: '1940000', hynixKT: '1939000', fxRate: '0.005184', etfPrice: '97.60' },
    { date: '2026-05-21', time: '13:13', inavPrice: '97.5105', hynixKP: '1941000', hynixKT: '1940000', fxRate: '0.005183', etfPrice: '97.56' },
    { date: '2026-05-21', time: '13:14', inavPrice: '97.5081', hynixKP: '1940000', hynixKT: '1940000', fxRate: '0.005182', etfPrice: '97.46' },
    { date: '2026-05-21', time: '13:15', inavPrice: '97.5081', hynixKP: '1940000', hynixKT: '1939000', fxRate: '0.005182', etfPrice: '97.46' },
    { date: '2026-05-21', time: '13:16', inavPrice: '97.2340', hynixKP: '1939000', hynixKT: '1938000', fxRate: '0.005182', etfPrice: '97.34' },
    { date: '2026-05-21', time: '13:17', inavPrice: '97.4179', hynixKP: '1940000', hynixKT: '1940000', fxRate: '0.005182', etfPrice: '97.34' },
    { date: '2026-05-21', time: '13:18', inavPrice: '97.6020', hynixKP: '1942000', hynixKT: '1940000', fxRate: '0.005182', etfPrice: '97.56' },
    { date: '2026-05-21', time: '13:19', inavPrice: '97.5985', hynixKP: '1942000', hynixKT: '1941000', fxRate: '0.005182', etfPrice: '97.70' },
    { date: '2026-05-21', time: '13:20', inavPrice: '97.5102', hynixKP: '1941000', hynixKT: '1941000', fxRate: '0.005182', etfPrice: '97.56' },
    { date: '2026-05-21', time: '13:21', inavPrice: '97.6868', hynixKP: '1943000', hynixKT: '1942000', fxRate: '0.005181', etfPrice: '97.58' },
    { date: '2026-05-21', time: '13:22', inavPrice: '97.7779', hynixKP: '1946000', hynixKT: '1944000', fxRate: '0.005181', etfPrice: '97.84' },
    { date: '2026-05-21', time: '13:23', inavPrice: '98.0589', hynixKP: '1948000', hynixKT: '1948000', fxRate: '0.005182', etfPrice: '97.94' },
    { date: '2026-05-21', time: '13:24', inavPrice: '97.9624', hynixKP: '1948000', hynixKT: '1948000', fxRate: '0.005181', etfPrice: '97.86' },
    { date: '2026-05-21', time: '13:25', inavPrice: '98.0532', hynixKP: '1947500', hynixKT: '1947000', fxRate: '0.005182', etfPrice: '97.92' },
    { date: '2026-05-21', time: '13:26', inavPrice: '97.7803', hynixKP: '1946000', hynixKT: '1946000', fxRate: '0.005180', etfPrice: '97.64' },
    { date: '2026-05-21', time: '13:27', inavPrice: '97.4021', hynixKP: '1942000', hynixKT: '1942000', fxRate: '0.005178', etfPrice: '97.34' },
    { date: '2026-05-21', time: '13:28', inavPrice: '97.3137', hynixKP: '1941000', hynixKT: '1941000', fxRate: '0.005178', etfPrice: '97.30' },
    { date: '2026-05-21', time: '13:29', inavPrice: '97.4947', hynixKP: '1944000', hynixKT: '1944000', fxRate: '0.005178', etfPrice: '97.50' },
    { date: '2026-05-21', time: '13:30', inavPrice: '97.4969', hynixKP: '1942000', hynixKT: '1942000', fxRate: '0.005178', etfPrice: '97.30' },
    { date: '2026-05-21', time: '13:31', inavPrice: '97.1302', hynixKP: '1940000', hynixKT: '1940000', fxRate: '0.005178', etfPrice: '97.24' },
    { date: '2026-05-21', time: '13:32', inavPrice: '97.1344', hynixKP: '1939000', hynixKT: '1939000', fxRate: '0.005179', etfPrice: '97.12' },
    { date: '2026-05-21', time: '13:33', inavPrice: '97.2221', hynixKP: '1940000', hynixKT: '1939000', fxRate: '0.005179', etfPrice: '97.26' },
    { date: '2026-05-21', time: '13:34', inavPrice: '97.2221', hynixKP: '1940000', hynixKT: '1940000', fxRate: '0.005179', etfPrice: '97.12' },
    { date: '2026-05-21', time: '13:35', inavPrice: '97.4062', hynixKP: '1940000', hynixKT: '1940000', fxRate: '0.005178', etfPrice: '97.16' },
    { date: '2026-05-21', time: '13:36', inavPrice: '97.3199', hynixKP: '1941000', hynixKT: '1940000', fxRate: '0.005178', etfPrice: '97.24' },
    { date: '2026-05-21', time: '13:37', inavPrice: '97.0437', hynixKP: '1939000', hynixKT: '1939000', fxRate: '0.005177', etfPrice: '97.06' },
    { date: '2026-05-21', time: '13:38', inavPrice: '97.1357', hynixKP: '1940000', hynixKT: '1939000', fxRate: '0.005177', etfPrice: '97.10' },
    { date: '2026-05-21', time: '13:39', inavPrice: '97.1330', hynixKP: '1940000', hynixKT: '1939000', fxRate: '0.005177', etfPrice: '97.06' },
    { date: '2026-05-21', time: '13:40', inavPrice: '97.4052', hynixKP: '1941000', hynixKT: '1941000', fxRate: '0.005177', etfPrice: '97.26' },
    { date: '2026-05-21', time: '13:41', inavPrice: '97.4864', hynixKP: '1942000', hynixKT: '1942000', fxRate: '0.005175', etfPrice: '97.32' },
    { date: '2026-05-21', time: '13:42', inavPrice: '97.3067', hynixKP: '1941000', hynixKT: '1941000', fxRate: '0.005174', etfPrice: '97.22' },
    { date: '2026-05-21', time: '13:43', inavPrice: '97.3087', hynixKP: '1941000', hynixKT: '1941000', fxRate: '0.005177', etfPrice: '97.24' },
    { date: '2026-05-21', time: '13:44', inavPrice: '97.4035', hynixKP: '1943000', hynixKT: '1942000', fxRate: '0.005178', etfPrice: '97.40' },
    { date: '2026-05-21', time: '13:45', inavPrice: '97.4047', hynixKP: '1941000', hynixKT: '1941000', fxRate: '0.005179', etfPrice: '97.24' },
    { date: '2026-05-21', time: '13:46', inavPrice: '97.4074', hynixKP: '1942000', hynixKT: '1941000', fxRate: '0.005179', etfPrice: '97.32' },
    { date: '2026-05-21', time: '13:47', inavPrice: '97.4935', hynixKP: '1943000', hynixKT: '1942000', fxRate: '0.005178', etfPrice: '97.46' },
    { date: '2026-05-21', time: '13:48', inavPrice: '97.5884', hynixKP: '1942500', hynixKT: '1943000', fxRate: '0.005178', etfPrice: '97.48' },
    { date: '2026-05-21', time: '13:49', inavPrice: '97.6726', hynixKP: '1943000', hynixKT: '1944000', fxRate: '0.005177', etfPrice: '97.46' },
    { date: '2026-05-21', time: '13:50', inavPrice: '97.7622', hynixKP: '1944000', hynixKT: '1943000', fxRate: '0.005177', etfPrice: '97.66' },
    { date: '2026-05-21', time: '13:51', inavPrice: '97.9513', hynixKP: '1944000', hynixKT: '1945000', fxRate: '0.005178', etfPrice: '97.84' },
    { date: '2026-05-21', time: '13:52', inavPrice: '97.8637', hynixKP: '1944500', hynixKT: '1944000', fxRate: '0.005179', etfPrice: '97.80' },
    { date: '2026-05-21', time: '13:53', inavPrice: '98.1389', hynixKP: '1947000', hynixKT: '1947000', fxRate: '0.005179', etfPrice: '98.00' },
    { date: '2026-05-21', time: '13:54', inavPrice: '98.2302', hynixKP: '1947000', hynixKT: '1947000', fxRate: '0.005180', etfPrice: '97.98' },
    { date: '2026-05-21', time: '13:55', inavPrice: '98.2345', hynixKP: '1948000', hynixKT: '1947000', fxRate: '0.005180', etfPrice: '98.00' },
    { date: '2026-05-21', time: '13:56', inavPrice: '98.2257', hynixKP: '1947000', hynixKT: '1947000', fxRate: '0.005180', etfPrice: '98.10' },
    { date: '2026-05-21', time: '13:57', inavPrice: '98.4116', hynixKP: '1949000', hynixKT: '1949000', fxRate: '0.005179', etfPrice: '98.26' },
    { date: '2026-05-21', time: '13:58', inavPrice: '98.5050', hynixKP: '1949000', hynixKT: '1949000', fxRate: '0.005180', etfPrice: '98.32' },
    { date: '2026-05-21', time: '13:59', inavPrice: '98.5093', hynixKP: '1949000', hynixKT: '1949000', fxRate: '0.005181', etfPrice: '98.30' },
    { date: '2026-05-21', time: '14:00', inavPrice: '98.4129', hynixKP: '1949000', hynixKT: '1948000', fxRate: '0.005180', etfPrice: '98.26' },
    { date: '2026-05-21', time: '14:01', inavPrice: '98.2315', hynixKP: '1948000', hynixKT: '1947000', fxRate: '0.005180', etfPrice: '98.16' },
    { date: '2026-05-21', time: '14:02', inavPrice: '98.3189', hynixKP: '1948000', hynixKT: '1948000', fxRate: '0.005180', etfPrice: '98.28' },
    { date: '2026-05-21', time: '14:03', inavPrice: '98.5066', hynixKP: '1949000', hynixKT: '1949000', fxRate: '0.005179', etfPrice: '98.30' },
    { date: '2026-05-21', time: '14:04', inavPrice: '98.5917', hynixKP: '1950000', hynixKT: '1950000', fxRate: '0.005178', etfPrice: '98.42' },
    { date: '2026-05-21', time: '14:05', inavPrice: '98.5917', hynixKP: '1949000', hynixKT: '1949000', fxRate: '0.005178', etfPrice: '98.38' },
    { date: '2026-05-21', time: '14:06', inavPrice: '98.5994', hynixKP: '1950000', hynixKT: '1950000', fxRate: '0.005178', etfPrice: '98.34' },
    { date: '2026-05-21', time: '14:07', inavPrice: '98.5107', hynixKP: '1949000', hynixKT: '1949000', fxRate: '0.005179', etfPrice: '98.36' },
    { date: '2026-05-21', time: '14:08', inavPrice: '98.5956', hynixKP: '1949000', hynixKT: '1949000', fxRate: '0.005177', etfPrice: '98.46' },
    { date: '2026-05-21', time: '14:09', inavPrice: '98.5931', hynixKP: '1950000', hynixKT: '1949000', fxRate: '0.005177', etfPrice: '98.50' },
    { date: '2026-05-21', time: '14:10', inavPrice: '98.8605', hynixKP: '1953000', hynixKT: '1953000', fxRate: '0.005176', etfPrice: '98.64' },
    { date: '2026-05-21', time: '14:11', inavPrice: '98.5905', hynixKP: '1952000', hynixKT: '1952000', fxRate: '0.005176', etfPrice: '98.44' },
    { date: '2026-05-21', time: '14:12', inavPrice: '98.7773', hynixKP: '1952000', hynixKT: '1952000', fxRate: '0.005176', etfPrice: '98.60' },
    { date: '2026-05-21', time: '14:13', inavPrice: '98.5019', hynixKP: '1950000', hynixKT: '1950000', fxRate: '0.005177', etfPrice: '98.14' },
    { date: '2026-05-21', time: '14:14', inavPrice: '98.1393', hynixKP: '1947000', hynixKT: '1947000', fxRate: '0.005177', etfPrice: '97.86' },
    { date: '2026-05-21', time: '14:15', inavPrice: '98.3192', hynixKP: '1950000', hynixKT: '1949000', fxRate: '0.005177', etfPrice: '98.08' },
    { date: '2026-05-21', time: '14:16', inavPrice: '97.5915', hynixKP: '1943000', hynixKT: '1943000', fxRate: '0.005177', etfPrice: '97.32' },
    { date: '2026-05-21', time: '14:17', inavPrice: '97.0410', hynixKP: '1939000', hynixKT: '1939000', fxRate: '0.005175', etfPrice: '96.80' },
    { date: '2026-05-21', time: '14:18', inavPrice: '97.1267', hynixKP: '1942000', hynixKT: '1941000', fxRate: '0.005175', etfPrice: '97.20' },
    { date: '2026-05-21', time: '14:19', inavPrice: '97.2179', hynixKP: '1941000', hynixKT: '1941000', fxRate: '0.005175', etfPrice: '97.16' },
    { date: '2026-05-21', time: '14:20', inavPrice: '97.3121', hynixKP: '1941000', hynixKT: '1941000', fxRate: '0.005175', etfPrice: '96.94' },
    { date: '2026-05-21', time: '14:21', inavPrice: '96.5780', hynixKP: '', hynixKT: '1941000', fxRate: '0.005176', etfPrice: '96.46' },
    { date: '2026-05-21', time: '14:22', inavPrice: '96.6842', hynixKP: '', hynixKT: '1941000', fxRate: '0.005179', etfPrice: '96.58' },
    { date: '2026-05-21', time: '14:23', inavPrice: '96.4965', hynixKP: '', hynixKT: '1941000', fxRate: '0.005178', etfPrice: '96.42' },
    { date: '2026-05-21', time: '14:24', inavPrice: '96.4113', hynixKP: '', hynixKT: '1941000', fxRate: '0.005179', etfPrice: '96.48' },
    { date: '2026-05-21', time: '14:25', inavPrice: '95.4980', hynixKP: '', hynixKT: '1941000', fxRate: '0.005179', etfPrice: '95.74' },
    { date: '2026-05-21', time: '14:26', inavPrice: '96.1329', hynixKP: '', hynixKT: '1941000', fxRate: '0.005178', etfPrice: '95.98' },
    { date: '2026-05-21', time: '14:27', inavPrice: '96.4970', hynixKP: '', hynixKT: '1941000', fxRate: '0.005178', etfPrice: '96.32' },
    { date: '2026-05-21', time: '14:28', inavPrice: '96.5026', hynixKP: '', hynixKT: '1941000', fxRate: '0.005180', etfPrice: '96.44' },
    { date: '2026-05-21', time: '14:29', inavPrice: '96.5060', hynixKP: '', hynixKT: '1941000', fxRate: '0.005181', etfPrice: '96.52' },
    { date: '2026-05-21', time: '14:30', inavPrice: '96.6956', hynixKP: '', hynixKT: '1941000', fxRate: '0.005180', etfPrice: '96.84' },
    { date: '2026-05-21', time: '14:31', inavPrice: '97.1443', hynixKP: '', hynixKT: '1941000', fxRate: '0.005180', etfPrice: '97.00' },
    { date: '2026-05-21', time: '14:32', inavPrice: '96.9616', hynixKP: '', hynixKT: '1941000', fxRate: '0.005180', etfPrice: '96.84' },
    { date: '2026-05-21', time: '14:33', inavPrice: '97.0580', hynixKP: '', hynixKT: '1941000', fxRate: '0.005182', etfPrice: '96.80' },
    { date: '2026-05-21', time: '14:34', inavPrice: '96.8691', hynixKP: '', hynixKT: '1941000', fxRate: '0.005179', etfPrice: '96.70' },
    { date: '2026-05-21', time: '14:35', inavPrice: '96.6910', hynixKP: '', hynixKT: '1941000', fxRate: '0.005180', etfPrice: '96.12' },
    { date: '2026-05-21', time: '14:36', inavPrice: '96.7812', hynixKP: '', hynixKT: '1941000', fxRate: '0.005181', etfPrice: '95.78' },
    { date: '2026-05-21', time: '14:37', inavPrice: '96.7801', hynixKP: '', hynixKT: '1941000', fxRate: '0.005181', etfPrice: '95.72' },
    { date: '2026-05-21', time: '14:38', inavPrice: '96.7801', hynixKP: '', hynixKT: '1941000', fxRate: '0.005180', etfPrice: '95.18' },
    { date: '2026-05-21', time: '14:39', inavPrice: '96.7786', hynixKP: '', hynixKT: '1941000', fxRate: '0.005180', etfPrice: '95.26' },
    { date: '2026-05-21', time: '14:40', inavPrice: '96.7735', hynixKP: '', hynixKT: '1939000', fxRate: '0.005179', etfPrice: '95.72' },
    { date: '2026-05-21', time: '14:41', inavPrice: '96.7757', hynixKP: '', hynixKT: '1940000', fxRate: '0.005179', etfPrice: '95.66' },
    { date: '2026-05-21', time: '14:42', inavPrice: '96.7743', hynixKP: '', hynixKT: '1940000', fxRate: '0.005179', etfPrice: '95.70' },
    { date: '2026-05-21', time: '14:43', inavPrice: '96.7738', hynixKP: '', hynixKT: '1936000', fxRate: '0.005178', etfPrice: '95.60' },
    { date: '2026-05-21', time: '14:44', inavPrice: '96.7686', hynixKP: '', hynixKT: '1938000', fxRate: '0.005176', etfPrice: '95.78' },
    { date: '2026-05-21', time: '14:45', inavPrice: '96.7672', hynixKP: '', hynixKT: '1934000', fxRate: '0.005178', etfPrice: '95.86' },
    { date: '2026-05-21', time: '14:46', inavPrice: '96.0411', hynixKP: '', hynixKT: '1933000', fxRate: '0.005178', etfPrice: '95.82' },
    { date: '2026-05-21', time: '14:47', inavPrice: '96.0437', hynixKP: '', hynixKT: '1935000', fxRate: '0.005179', etfPrice: '95.68' },
    { date: '2026-05-21', time: '14:48', inavPrice: '96.0459', hynixKP: '', hynixKT: '1937000', fxRate: '0.005179', etfPrice: '95.70' },
    { date: '2026-05-21', time: '14:49', inavPrice: '96.0439', hynixKP: '', hynixKT: '1937000', fxRate: '0.005179', etfPrice: '95.74' },
    { date: '2026-05-21', time: '14:50', inavPrice: '96.0420', hynixKP: '', hynixKT: '1934000', fxRate: '0.005179', etfPrice: '95.88' },
    { date: '2026-05-21', time: '14:51', inavPrice: '96.0570', hynixKP: '', hynixKT: '1933000', fxRate: '0.005181', etfPrice: '95.60' },
    { date: '2026-05-21', time: '14:52', inavPrice: '96.0570', hynixKP: '', hynixKT: '1932000', fxRate: '0.005182', etfPrice: '95.28' },
    { date: '2026-05-21', time: '14:53', inavPrice: '96.0548', hynixKP: '', hynixKT: '1930000', fxRate: '0.005181', etfPrice: '95.30' },
    { date: '2026-05-21', time: '14:54', inavPrice: '96.0488', hynixKP: '', hynixKT: '1926000', fxRate: '0.005181', etfPrice: '95.02' },
    { date: '2026-05-21', time: '14:55', inavPrice: '96.0512', hynixKP: '', hynixKT: '1927000', fxRate: '0.005180', etfPrice: '95.08' },
    { date: '2026-05-21', time: '14:56', inavPrice: '96.0460', hynixKP: '', hynixKT: '1929000', fxRate: '0.005179', etfPrice: '95.02' },
    { date: '2026-05-21', time: '14:57', inavPrice: '96.0440', hynixKP: '', hynixKT: '1925000', fxRate: '0.005179', etfPrice: '94.76' },
    { date: '2026-05-21', time: '14:58', inavPrice: '96.0449', hynixKP: '', hynixKT: '1923000', fxRate: '0.005179', etfPrice: '94.80' },
    { date: '2026-05-21', time: '14:59', inavPrice: '96.0449', hynixKP: '', hynixKT: '1922000', fxRate: '0.005179', etfPrice: '94.62' },
    { date: '2026-05-21', time: '15:00', inavPrice: '96.0447', hynixKP: '', hynixKT: '1919000', fxRate: '0.005180', etfPrice: '94.50' },
    { date: '2026-05-21', time: '15:01', inavPrice: '96.0567', hynixKP: '', hynixKT: '1922000', fxRate: '0.005180', etfPrice: '94.52' },
    { date: '2026-05-21', time: '15:02', inavPrice: '96.0522', hynixKP: '', hynixKT: '1920000', fxRate: '0.005180', etfPrice: '94.52' },
    { date: '2026-05-21', time: '15:03', inavPrice: '96.0635', hynixKP: '', hynixKT: '1915000', fxRate: '0.005182', etfPrice: '94.14' },
    { date: '2026-05-21', time: '15:04', inavPrice: '96.0701', hynixKP: '', hynixKT: '1918000', fxRate: '0.005182', etfPrice: '94.00' },
    { date: '2026-05-21', time: '15:05', inavPrice: '96.0624', hynixKP: '', hynixKT: '1915000', fxRate: '0.005182', etfPrice: '93.64' },
    { date: '2026-05-21', time: '15:06', inavPrice: '96.0622', hynixKP: '', hynixKT: '1914000', fxRate: '0.005182', etfPrice: '93.80' },
    { date: '2026-05-21', time: '15:07', inavPrice: '96.0609', hynixKP: '', hynixKT: '1920000', fxRate: '0.005182', etfPrice: '94.20' },
    { date: '2026-05-21', time: '15:08', inavPrice: '96.0624', hynixKP: '', hynixKT: '1922000', fxRate: '0.005182', etfPrice: '95.00' },
    { date: '2026-05-21', time: '15:09', inavPrice: '96.0587', hynixKP: '', hynixKT: '1917000', fxRate: '0.005181', etfPrice: '94.22' },
    { date: '2026-05-21', time: '15:10', inavPrice: '96.0701', hynixKP: '', hynixKT: '1914000', fxRate: '0.005182', etfPrice: '93.92' },
    { date: '2026-05-21', time: '15:11', inavPrice: '96.0619', hynixKP: '', hynixKT: '1912000', fxRate: '0.005181', etfPrice: '93.72' },
    { date: '2026-05-21', time: '15:12', inavPrice: '96.0625', hynixKP: '', hynixKT: '1909000', fxRate: '0.005182', etfPrice: '93.62' },
    { date: '2026-05-21', time: '15:13', inavPrice: '96.0657', hynixKP: '', hynixKT: '1906000', fxRate: '0.005183', etfPrice: '93.42' },
    { date: '2026-05-21', time: '15:14', inavPrice: '96.0642', hynixKP: '', hynixKT: '1902000', fxRate: '0.005183', etfPrice: '93.14' },
    { date: '2026-05-21', time: '15:15', inavPrice: '96.0734', hynixKP: '', hynixKT: '1896000', fxRate: '0.005184', etfPrice: '93.30' },
    { date: '2026-05-21', time: '15:16', inavPrice: '96.0537', hynixKP: '', hynixKT: '1893000', fxRate: '0.005181', etfPrice: '93.10' },
    { date: '2026-05-21', time: '15:17', inavPrice: '96.0427', hynixKP: '', hynixKT: '1887000', fxRate: '0.005179', etfPrice: '92.74' },
    { date: '2026-05-21', time: '15:18', inavPrice: '96.0440', hynixKP: '', hynixKT: '1895000', fxRate: '0.005179', etfPrice: '92.64' },
    { date: '2026-05-21', time: '15:19', inavPrice: '96.0526', hynixKP: '', hynixKT: '1900000', fxRate: '0.005179', etfPrice: '92.48' },
    { date: '2026-05-21', time: '15:20', inavPrice: '96.0482', hynixKP: '', hynixKT: '1899000', fxRate: '0.005179', etfPrice: '92.10' },
    { date: '2026-05-21', time: '15:21', inavPrice: '96.0431', hynixKP: '', hynixKT: '1900000', fxRate: '0.005180', etfPrice: '92.52' },
    { date: '2026-05-21', time: '15:22', inavPrice: '96.0482', hynixKP: '', hynixKT: '1904000', fxRate: '0.005179', etfPrice: '92.86' },
    { date: '2026-05-21', time: '15:23', inavPrice: '96.0438', hynixKP: '', hynixKT: '1901000', fxRate: '0.005178', etfPrice: '93.00' },
    { date: '2026-05-21', time: '15:24', inavPrice: '96.0460', hynixKP: '', hynixKT: '1903000', fxRate: '0.005179', etfPrice: '92.58' },
    { date: '2026-05-21', time: '15:25', inavPrice: '96.0478', hynixKP: '', hynixKT: '1906000', fxRate: '0.005179', etfPrice: '93.10' },
    { date: '2026-05-21', time: '15:26', inavPrice: '96.0488', hynixKP: '', hynixKT: '1909000', fxRate: '0.005179', etfPrice: '93.12' },
    { date: '2026-05-21', time: '15:27', inavPrice: '96.0432', hynixKP: '', hynixKT: '1906000', fxRate: '0.005179', etfPrice: '93.46' },
    { date: '2026-05-21', time: '15:28', inavPrice: '96.0504', hynixKP: '', hynixKT: '1908000', fxRate: '0.005180', etfPrice: '93.14' },
    { date: '2026-05-21', time: '15:29', inavPrice: '96.0485', hynixKP: '', hynixKT: '1909000', fxRate: '0.005179', etfPrice: '93.94' },
    { date: '2026-05-21', time: '15:30', inavPrice: '96.0408', hynixKP: '', hynixKT: '1909000', fxRate: '0.005178', etfPrice: '93.98' },
    { date: '2026-05-21', time: '15:31', inavPrice: '96.0405', hynixKP: '', hynixKT: '1908000', fxRate: '0.005178', etfPrice: '94.18' },
    { date: '2026-05-21', time: '15:32', inavPrice: '96.0383', hynixKP: '', hynixKT: '1906000', fxRate: '0.005178', etfPrice: '93.70' },
    { date: '2026-05-21', time: '15:33', inavPrice: '96.0411', hynixKP: '', hynixKT: '1906000', fxRate: '0.005177', etfPrice: '93.60' },
    { date: '2026-05-21', time: '15:34', inavPrice: '96.0383', hynixKP: '', hynixKT: '1906000', fxRate: '0.005177', etfPrice: '93.78' },
    { date: '2026-05-21', time: '15:35', inavPrice: '96.0423', hynixKP: '', hynixKT: '1906000', fxRate: '0.005178', etfPrice: '94.14' },
    { date: '2026-05-21', time: '15:36', inavPrice: '96.0438', hynixKP: '', hynixKT: '1906000', fxRate: '0.005178', etfPrice: '93.90' },
    { date: '2026-05-21', time: '15:37', inavPrice: '96.0438', hynixKP: '', hynixKT: '1906000', fxRate: '0.005178', etfPrice: '93.68' },
    { date: '2026-05-21', time: '15:38', inavPrice: '96.0395', hynixKP: '', hynixKT: '1905000', fxRate: '0.005178', etfPrice: '93.50' },
    { date: '2026-05-21', time: '15:39', inavPrice: '96.0426', hynixKP: '', hynixKT: '1905000', fxRate: '0.005177', etfPrice: '93.46' },
    { date: '2026-05-21', time: '15:40', inavPrice: '96.0411', hynixKP: '', hynixKT: '1904000', fxRate: '0.005178', etfPrice: '93.40' },
    { date: '2026-05-21', time: '15:41', inavPrice: '96.0478', hynixKP: '', hynixKT: '1903000', fxRate: '0.005178', etfPrice: '93.48' },
    { date: '2026-05-21', time: '15:42', inavPrice: '96.0500', hynixKP: '', hynixKT: '1902000', fxRate: '0.005178', etfPrice: '93.78' },
    { date: '2026-05-21', time: '15:43', inavPrice: '96.0501', hynixKP: '', hynixKT: '1907000', fxRate: '0.005178', etfPrice: '93.46' },
    { date: '2026-05-21', time: '15:44', inavPrice: '96.0484', hynixKP: '', hynixKT: '1909000', fxRate: '0.005178', etfPrice: '93.46' },
    { date: '2026-05-21', time: '15:45', inavPrice: '96.0482', hynixKP: '', hynixKT: '1909000', fxRate: '0.005178', etfPrice: '93.46' },
    { date: '2026-05-21', time: '15:46', inavPrice: '96.0494', hynixKP: '', hynixKT: '1907000', fxRate: '0.005179', etfPrice: '93.50' },
    { date: '2026-05-21', time: '15:47', inavPrice: '96.0553', hynixKP: '', hynixKT: '1907000', fxRate: '0.005179', etfPrice: '93.50' },
    { date: '2026-05-21', time: '15:48', inavPrice: '96.0568', hynixKP: '', hynixKT: '1907000', fxRate: '0.005180', etfPrice: '93.50' },
    { date: '2026-05-21', time: '15:49', inavPrice: '96.0554', hynixKP: '', hynixKT: '1908000', fxRate: '0.005180', etfPrice: '93.40' },
    { date: '2026-05-21', time: '15:50', inavPrice: '96.0574', hynixKP: '', hynixKT: '1908000', fxRate: '0.005180', etfPrice: '93.38' },
    { date: '2026-05-21', time: '15:51', inavPrice: '96.0567', hynixKP: '', hynixKT: '1909000', fxRate: '0.005179', etfPrice: '93.40' },
    { date: '2026-05-21', time: '15:52', inavPrice: '96.0690', hynixKP: '', hynixKT: '1912000', fxRate: '0.005182', etfPrice: '93.46' },
    { date: '2026-05-21', time: '15:53', inavPrice: '96.0611', hynixKP: '', hynixKT: '1916000', fxRate: '0.005182', etfPrice: '93.50' },
    { date: '2026-05-21', time: '15:54', inavPrice: '96.0701', hynixKP: '', hynixKT: '1916000', fxRate: '0.005183', etfPrice: '93.70' },
    { date: '2026-05-21', time: '15:55', inavPrice: '96.0712', hynixKP: '', hynixKT: '1917000', fxRate: '0.005182', etfPrice: '93.80' },
    { date: '2026-05-21', time: '15:56', inavPrice: '96.0701', hynixKP: '', hynixKT: '1916000', fxRate: '0.005182', etfPrice: '94.00' },
    { date: '2026-05-21', time: '15:57', inavPrice: '96.0668', hynixKP: '', hynixKT: '1913000', fxRate: '0.005183', etfPrice: '93.92' },
    { date: '2026-05-21', time: '15:58', inavPrice: '96.0632', hynixKP: '', hynixKT: '1915000', fxRate: '0.005183', etfPrice: '93.58' },
    { date: '2026-05-21', time: '15:59', inavPrice: '96.0642', hynixKP: '', hynixKT: '1913000', fxRate: '0.005183', etfPrice: '93.54' },
    { date: '2026-05-21', time: '16:00', inavPrice: '96.0635', hynixKP: '', hynixKT: '1913000', fxRate: '0.005183', etfPrice: '93.46' },
    { date: '2026-05-21', time: '16:01', inavPrice: '96.0683', hynixKP: '', hynixKT: '1913000', fxRate: '0.005183', etfPrice: '93.46' },
    { date: '2026-05-21', time: '16:02', inavPrice: '96.0668', hynixKP: '', hynixKT: '1912000', fxRate: '0.005183', etfPrice: '93.46' },
    { date: '2026-05-21', time: '16:03', inavPrice: '96.0666', hynixKP: '', hynixKT: '1913000', fxRate: '0.005182', etfPrice: '93.46' },
    { date: '2026-05-21', time: '16:04', inavPrice: '96.0701', hynixKP: '', hynixKT: '1912000', fxRate: '0.005183', etfPrice: '93.46' },
    { date: '2026-05-21', time: '16:05', inavPrice: '96.0761', hynixKP: '', hynixKT: '1913000', fxRate: '0.005185', etfPrice: '93.46' },
    { date: '2026-05-21', time: '16:06', inavPrice: '96.0801', hynixKP: '', hynixKT: '1916000', fxRate: '0.005185', etfPrice: '93.46' },
    { date: '2026-05-21', time: '16:07', inavPrice: '96.0725', hynixKP: '', hynixKT: '1917000', fxRate: '0.005185', etfPrice: '93.46' },
    { date: '2026-05-21', time: '16:08', inavPrice: '96.0687', hynixKP: '', hynixKT: '1918000', fxRate: '0.005186', etfPrice: '93.46' },
    { date: '2026-05-21', time: '16:09', inavPrice: '96.0792', hynixKP: '', hynixKT: '1920000', fxRate: '0.005186', etfPrice: '93.06' },
    { date: '2026-05-21', time: '16:10', inavPrice: '96.0789', hynixKP: '', hynixKT: '1918000', fxRate: '0.005187', etfPrice: '93.06' },
    { date: '2026-05-21', time: '16:11', inavPrice: '96.0762', hynixKP: '', hynixKT: '1918000', fxRate: '0.005187', etfPrice: '93.06' },
    { date: '2026-05-21', time: '16:12', inavPrice: '96.0934', hynixKP: '', hynixKT: '1918000', fxRate: '0.005192', etfPrice: '93.06' },
    { date: '2026-05-21', time: '16:13', inavPrice: '96.0922', hynixKP: '', hynixKT: '1922000', fxRate: '0.005191', etfPrice: '93.06' },
    { date: '2026-05-21', time: '16:14', inavPrice: '96.0878', hynixKP: '', hynixKT: '1920000', fxRate: '0.005191', etfPrice: '93.06' },
    { date: '2026-05-21', time: '16:15', inavPrice: '96.0968', hynixKP: '', hynixKT: '1921000', fxRate: '0.005192', etfPrice: '93.06' },
    { date: '2026-05-21', time: '16:16', inavPrice: '96.0958', hynixKP: '', hynixKT: '1923000', fxRate: '0.005192', etfPrice: '93.06' },
    { date: '2026-05-21', time: '16:17', inavPrice: '96.0923', hynixKP: '', hynixKT: '1926000', fxRate: '0.005192', etfPrice: '93.06' },
    { date: '2026-05-21', time: '16:18', inavPrice: '96.0892', hynixKP: '', hynixKT: '1927000', fxRate: '0.005192', etfPrice: '93.06' },
    { date: '2026-05-21', time: '16:19', inavPrice: '96.0803', hynixKP: '', hynixKT: '1926000', fxRate: '0.005188', etfPrice: '93.06' },
    { date: '2026-05-21', time: '16:20', inavPrice: '96.0744', hynixKP: '', hynixKT: '1920000', fxRate: '0.005187', etfPrice: '93.06' },
    { date: '2026-05-21', time: '16:21', inavPrice: '96.0865', hynixKP: '', hynixKT: '1923000', fxRate: '0.005188', etfPrice: '93.06' },
    { date: '2026-05-21', time: '16:22', inavPrice: '96.0814', hynixKP: '', hynixKT: '1924000', fxRate: '0.005187', etfPrice: '93.06' },
    { date: '2026-05-21', time: '16:23', inavPrice: '96.0945', hynixKP: '', hynixKT: '1923000', fxRate: '0.005188', etfPrice: '93.06' },
    { date: '2026-05-21', time: '16:24', inavPrice: '96.0829', hynixKP: '', hynixKT: '1921000', fxRate: '0.005187', etfPrice: '93.06' },
    { date: '2026-05-21', time: '16:25', inavPrice: '96.0789', hynixKP: '', hynixKT: '1920000', fxRate: '0.005187', etfPrice: '93.06' },
    { date: '2026-05-21', time: '16:26', inavPrice: '96.0739', hynixKP: '', hynixKT: '1923000', fxRate: '0.005187', etfPrice: '93.06' },
    { date: '2026-05-21', time: '16:27', inavPrice: '96.0765', hynixKP: '', hynixKT: '1923000', fxRate: '0.005185', etfPrice: '93.06' },
    { date: '2026-05-21', time: '16:28', inavPrice: '96.0679', hynixKP: '', hynixKT: '1923000', fxRate: '0.005185', etfPrice: '93.06' },
    { date: '2026-05-21', time: '16:29', inavPrice: '96.0745', hynixKP: '', hynixKT: '1923000', fxRate: '0.005184', etfPrice: '93.06' }
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

    const out = [];
    for (const row of rows) {
        if (row.etfPrice === null || row.etfPrice === undefined) continue;

        // Update KP LOCF tracker
        if (row.hynixKP != null) kpLast = row.hynixKP;

        const etfLast = row.etfPrice;
        const etfBid = (row.etfBid != null ? row.etfBid : null);
        const etfAsk = (row.etfAsk != null ? row.etfAsk : null);
        const etfMid = (etfBid != null && etfAsk != null) ? (etfBid + etfAsk) / 2 : null;

        const etfChange = ((etfLast - baseEtf) / baseEtf) * 100;

        // ---- Theoretical iNAV (the single formula, all-day) ----
        // Need: published iNAV + KT + a sensible KP_ref to compute r.
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
        if (row.inavPrice != null && r != null) {
            theoInav = row.inavPrice * (1 + LEVERAGE * r);
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
