/**
 * Cloudflare Pages Function - /api/changelog
 *
 * Build-time snapshot of git history (the edge has no git).
 * Regenerate with: node deploy/gen-changelog.cjs
 * Snapshot taken: 2026-09-10T06:18:58.108Z
 */
const ENTRIES = [
    {
        "hash": "9a3fed3",
        "date": "2026-06-25",
        "subject": "feat: 多日 BBG demo + 14:20 后理论 iNAV + 数据质量诊断与可视化升级"
    },
    {
        "hash": "346852a",
        "date": "2026-06-10",
        "subject": "用户可见层文案统一中文化（Theo / Published / Premium 等术语）"
    },
    {
        "hash": "306bb9d",
        "date": "2026-06-10",
        "subject": "偏离走势图叠加 Published 对照线 + 文案精确化"
    },
    {
        "hash": "90d42b6",
        "date": "2026-06-10",
        "subject": "把'单笔盈亏分布'图换成'按日 × 时段 触发热力图'"
    },
    {
        "hash": "25df6f9",
        "date": "2026-06-10",
        "subject": "新增交易窗口过滤：默认下午 13:00–15:55，避免 16:00 港股收盘后误触发"
    },
    {
        "hash": "23dbe8c",
        "date": "2026-06-08",
        "subject": "偏离监控看板两张图同步瘦身（高度 ~600px → 240px）"
    },
    {
        "hash": "8b0b109",
        "date": "2026-06-08",
        "subject": "回测三张图表瘦身：累计收益曲线高度从 ~500px 压到 200px"
    },
    {
        "hash": "b7ffc79",
        "date": "2026-06-08",
        "subject": "回测结果统计卡片瘦身（视觉密度提升约 1.6×）"
    },
    {
        "hash": "cbc620c",
        "date": "2026-06-08",
        "subject": "回测结果面板按'汇总/单笔特征/方向分布'三组重组"
    },
    {
        "hash": "78bcc9d",
        "date": "2026-06-08",
        "subject": "新增看板放大模式 + Theo Premium Monitor 面板（对齐桌面端 Excel）"
    },
    {
        "hash": "e6ab19b",
        "date": "2026-06-08",
        "subject": "统一'理论 iNAV'文案，清除残留'影子 iNAV'标签"
    },
    {
        "hash": "1e1d117",
        "date": "2026-06-08",
        "subject": "对齐桌面端理论 iNAV 框架：统一公式 + 多重参考价 + tick 维度 + Bias + 昨收 fallback"
    },
    {
        "hash": "dc8f40f",
        "date": "2026-06-08",
        "subject": "重构可行性指标：删除胜率/回撤/盈亏比/夏普，改用触发频率+平均锁定收益+安全边际倍数"
    },
    {
        "hash": "09d89ae",
        "date": "2026-06-05",
        "subject": "fix(cutoff): move iNAV/KP cutoff from 14:30 to 14:20 + soften pre-cutoff shadow cells"
    },
    {
        "hash": "4f232c1",
        "date": "2026-06-05",
        "subject": "fix(shadow-inav): relay from 14:30 official truth instead of resynthesizing all day"
    },
    {
        "hash": "c141492",
        "date": "2026-06-02",
        "subject": "feat(ui): add changelog panel auto-built from git log"
    },
    {
        "hash": "8545f59",
        "date": "2026-06-02",
        "subject": "tweak(strategy): bump default 背离阈值 from 1.5% to 2.0%"
    },
    {
        "hash": "485e9e8",
        "date": "2026-06-01",
        "subject": "feat(strategy): rewrite backtest as position-swap arbitrage (底仓换仓套利)"
    },
    {
        "hash": "a8de4c2",
        "date": "2026-06-01",
        "subject": "feat(import): rewrite BBG Value Page parser + sticky table header + KP main-board-closed cell"
    },
    {
        "hash": "9d3a585",
        "date": "2026-05-27",
        "subject": "fix: 去重影子iNAV验证图 + 夏普比率说明 + 14:30后数据修复"
    },
    {
        "hash": "e285d7a",
        "date": "2026-05-27",
        "subject": "feat: 14:30后用KT影子iNAV替代冻结的官方iNAV"
    },
    {
        "hash": "fa76640",
        "date": "2026-05-25",
        "subject": "feat: 大幅优化回测体验 — BBG导入、影子iNAV、图表增强"
    },
    {
        "hash": "2d9e38c",
        "date": "2026-05-21",
        "subject": "fix: remove iNAV冻结 assumption - iNAV available all day from BBG"
    },
    {
        "hash": "77721e7",
        "date": "2026-05-19",
        "subject": "feat(backtest): reposition as multi-day backtest with auto-resolved iNAV"
    },
    {
        "hash": "03c31e7",
        "date": "2026-05-19",
        "subject": "fix: move indicator guide below strategy params + update nav order"
    },
    {
        "hash": "8e57771",
        "date": "2026-05-18",
        "subject": "chore(deploy): add start.sh / watchdog.sh and ignore runtime artifacts"
    },
    {
        "hash": "026c07d",
        "date": "2026-05-18",
        "subject": "feat(server): serve static frontend and bind 0.0.0.0 with env-configurable port"
    },
    {
        "hash": "b16da43",
        "date": "2026-05-18",
        "subject": "fix: reorder divergence cards - price, iNAV, divergence, time"
    },
    {
        "hash": "5bcf2af",
        "date": "2026-05-18",
        "subject": "feat: add real-time divergence indicator panel with trade signal"
    },
    {
        "hash": "713152f",
        "date": "2026-05-18",
        "subject": "fix: all chart legends use line style instead of rectangles"
    },
    {
        "hash": "051c95f",
        "date": "2026-05-18",
        "subject": "fix: validation chart error shown as bars + legend uses line style"
    },
    {
        "hash": "6571186",
        "date": "2026-05-18",
        "subject": "feat: charts render in real-time, remove manual \"生成图表\" button"
    },
    {
        "hash": "1895584",
        "date": "2026-05-18",
        "subject": "feat: shadow iNAV column updates in real-time on every input"
    },
    {
        "hash": "23a8c8d",
        "date": "2026-05-18",
        "subject": "feat: add dedicated shadow iNAV column (full day, auto-calculated)"
    },
    {
        "hash": "10c12d5",
        "date": "2026-05-18",
        "subject": "fix: remove separate baseline inputs, use first table row as base"
    },
    {
        "hash": "90b525e",
        "date": "2026-05-18",
        "subject": "feat: KRW/HKD replaces USD/HKD + shadow iNAV auto-fills with orange highlight"
    },
    {
        "hash": "f72812b",
        "date": "2026-05-18",
        "subject": "fix: iNAV baseline changed from USD to HKD"
    },
    {
        "hash": "ffa42c2",
        "date": "2026-05-18",
        "subject": "feat: add Excel/CSV import and template download for price monitor"
    },
    {
        "hash": "3225a13",
        "date": "2026-05-18",
        "subject": "fix: clarify iNAV column - \"14:30后留空\" instead of \"官方iNAV\""
    },
    {
        "hash": "fd974ce",
        "date": "2026-05-18",
        "subject": "feat: add price monitor section with two key charts"
    },
    {
        "hash": "82a6a05",
        "date": "2026-05-18",
        "subject": "feat: add divergence dashboard + simplify to 3 params + rebalance model"
    },
    {
        "hash": "5abeed7",
        "date": "2026-05-18",
        "subject": "docs: add V2 strategy - shadow iNAV window (14:30-16:10) + rebalance model"
    },
    {
        "hash": "6fcbba9",
        "date": "2026-05-18",
        "subject": "style: move run button inside strategy params card"
    },
    {
        "hash": "37a1b92",
        "date": "2026-05-18",
        "subject": "style: BBG guide restyled as appendix (lighter, separated from main content)"
    },
    {
        "hash": "994549c",
        "date": "2026-05-18",
        "subject": "fix: remove max-width cap, content now fills available width"
    },
    {
        "hash": "4e293e0",
        "date": "2026-05-18",
        "subject": "style: outline-style sidebar + compact header"
    },
    {
        "hash": "51ff7c9",
        "date": "2026-05-18",
        "subject": "style: lighten sidebar - transparent bg, thin border, subtle text"
    },
    {
        "hash": "f8a384e",
        "date": "2026-05-18",
        "subject": "feat: replace top navbar with fixed sidebar navigation"
    },
    {
        "hash": "4bf829c",
        "date": "2026-05-18",
        "subject": "feat: add sticky navigation bar with scroll-tracking active state"
    },
    {
        "hash": "9b91c39",
        "date": "2026-05-18",
        "subject": "docs: add Bloomberg data guide section at page bottom"
    }
];

const TOTAL = 83;

export async function onRequestGet(context) {
    const { searchParams } = new URL(context.request.url);
    const raw = parseInt(searchParams.get('limit'), 10);
    const limit = Math.max(1, Math.min(50, Number.isNaN(raw) ? 15 : raw));

    return new Response(JSON.stringify({ entries: ENTRIES.slice(0, limit), total: TOTAL }), {
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=300',
        },
    });
}
