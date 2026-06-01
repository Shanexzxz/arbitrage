# Arbitrage · 港股 2 倍做多海力士 ETF 套利回测

> HK 2x Long Hynix ETF vs SK Hynix 跨市场套利的**回测 + 实时盯盘**工具。
> 纯前端（HTML/JS/Chart.js）+ 一个极薄的 Node 代理（用于解决 Yahoo Finance 的 CORS）。

- **GitHub**: https://github.com/Shanexzxz/arbitrage
- **远端分支**: `origin/master`
- **本地路径**: `/data/workspace/arbitrage`
- **入口页面**: http://<server-ip>:3001/
- **默认端口**: `3001`（可用 `PORT` 环境变量覆盖）

---

## 一、项目做什么

围绕「港股 2x Long Hynix ETF」与其底层「SK Hynix（KRX: 000660.KS）」之间的价差做**跨市场套利**：

1. **数据导入与回测（历史）**：支持直接导入 BBG BDH 导出的 Excel（自动识别 Value Page 格式），按日内分钟级数据跑策略回测。基准价格取每个交易日首行，**持仓不跨日结算**。
2. **API 盯盘（实时）**：通过后端 `/quote` 代理实时拉取 Yahoo Finance 行情。
3. **指标说明 / BBG 指南**：内置文档区块。
4. **iNAV 处理**：14:30 后用 KT 影子 iNAV 替代冻结的官方 iNAV（见 commit `e285d7a`）。

---

## 二、目录结构

```
arbitrage/
├── index.html              # 单页应用入口
├── css/                    # 样式
├── js/                     # 前端业务代码
│   ├── main.js             #   入口 / 页面装配
│   ├── data-input.js       #   BBG Excel / CSV 导入
│   ├── backtest-engine.js  #   回测核心
│   ├── yahoo-fetch.js      #   调后端 /quote 拉行情
│   ├── charts.js           #   Chart.js 可视化
│   ├── statistics.js       #   统计指标
│   └── conclusion.js       #   结论输出
├── server/
│   ├── proxy.js            # Express 后端（静态托管 + Yahoo 代理）
│   ├── package.json        # 仅 express + cors
│   └── node_modules/       # 首次启动自动 npm install
├── docs/                   # 文档资料
├── tests/                  # 测试
├── start.sh                # 启停脚本（前台/后台/restart/status/logs）
├── watchdog.sh             # 看门狗：进程挂掉自动拉起
├── server.log              # 运行日志（带滚动，最多保留 5 份）
└── .server.pid             # 后台进程 pid（由 start.sh 维护）
```

---

## 三、技术栈

| 层 | 技术 |
|---|---|
| 前端 | 原生 HTML / CSS / JS，CDN 引入 Chart.js 4.4 + SheetJS（xlsx）0.18 |
| 后端 | Node.js + Express 4 + cors |
| 数据源 | Yahoo Finance Chart API (`query2.finance.yahoo.com`)、BBG BDH 导出 Excel |
| 部署 | 裸机 Linux + `setsid nohup` 后台进程 + 自写 watchdog（无 systemd / pm2 / docker） |

---

## 四、后端 API

只有一个代理端点：

```
GET /quote?symbol=000660.KS&interval=5m&range=1d
```

- 透传到 `https://query2.finance.yahoo.com/v8/finance/chart/{symbol}`
- 默认 `interval=5m`、`range=1d`、`includePrePost=false`
- 失败时返回 `{ error, symbol }`

静态资源（`index.html` / `css/` / `js/`）由同一个 Express 实例从项目根目录托管。

---

## 五、部署 / 日常运维

### 5.1 拉取最新代码并重启（标准流程）

```bash
cd /data/workspace/arbitrage
git pull --ff-only origin master
./start.sh restart
```

> 仅当 `server/package.json` 变化时才需要重装依赖；`start.sh` 在首次启动会自动 `npm install`。
> 如要强制重装：`rm -rf server/node_modules && ./start.sh restart`

### 5.2 `start.sh` 命令清单

| 命令 | 作用 |
|---|---|
| `./start.sh` | 前台启动（Ctrl+C 退出，调试用） |
| `./start.sh -d` / `bg` | 后台启动（detached，写 `.server.pid`） |
| `./start.sh stop` | 停止后台实例，并清理孤儿 node 进程 |
| `./start.sh restart` | = stop + bg |
| `./start.sh status` | 查看 pid、端口监听、HTTP 健康检查 |
| `./start.sh logs` | `tail -f server.log` |

### 5.3 环境变量（可写入 `.env`，启动时自动加载）

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `3001` | 监听端口 |
| `HOST` | `0.0.0.0` | 监听地址（默认对局域网开放） |
| `ENTRY` | `server/proxy.js` | Node 入口文件 |

### 5.4 看门狗（可选）

```bash
./watchdog.sh start    # 后台跑守护，进程挂掉自动 ./start.sh -d
./watchdog.sh stop
./watchdog.sh status
```

---

## 六、给 AI / 新协作者的速读提示

每次"激活"本项目，**只需要读这份 README + `start.sh`** 即可掌握：

- 项目目的（ETF 套利回测 + 盯盘）
- 代码组织（前端在 `js/`，后端只有 `server/proxy.js`）
- 怎么部署（`git pull` + `./start.sh restart`）
- 怎么排障（`./start.sh status` / `logs`，日志在 `server.log`）

无需通读 `js/` 下的全部源文件，除非要改具体业务逻辑。
