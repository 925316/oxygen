# ONI Seed Scanner / ONI 种子扫描器

[English](#english) · [简体中文](#简体中文)

---

## English

A fully local, offline Oxygen Not Included seed tool that does not need the game
to be running. It is built on `@onimaxxing/worldgen-node`, a WASM build of the
game's worldgen engine baselined against build 737195.

### Quick start (graphical interface)

1. Double-click `start.bat`
2. The browser opens the scanner page automatically (local address, no network)
3. Set the filters and press **Start scan**

Close the black console window to stop the server.

Installing dependencies on a fresh machine:

```bat
cd /d <path to this folder>
npm install
```

### Using the interface

**Scan settings**

- **Start seed / Seed count**: scans `start` through `start + count - 1`
- **Filters** are all "at least / at most" thresholds; `0` means no limit
  - big volcanoes >= N
  - iron / copper / gold volcanoes each >= N
  - total metal >= kg/s (sum of the three metal volcano outputs)
  - salt water / clean water / total water >= kg/s
  - junk vents <= N (chlorine, CO2, polluted oxygen, leaky oil fissures, ...)
  - **no geysers inside the 50x38 base** (on by default, see below)
- Filters are stored in the browser and restored on the next visit

**Results table**

Click any header to sort. Click a row to open that seed's detail panel.

**Detail panel**

- **Base layout (50x38)**: your plan is drawn directly. Red is the reserved
  area, green is the printing pod, blue dots are geysers inside the base, yellow
  dots are junk vents inside the base, red dots are geysers blocking the plan.
  Geysers outside the base are not drawn but are all listed in the table
- **Geyser details**: type, output, position inside the 50x38 frame, and zone
- **Resources**: crude oil, magma, lead, wolframite, ice, sand, algae, coal,
  diamond

**Language**

The top right corner switches between Chinese and English. The choice is
remembered. It affects the interface, the CLI (`--lang`) and the server
responses; JSON field names stay the same.

### Base plan (hard requirement)

Coordinates are local to the base, origin at the **top-left corner**, X to the
right, Y downward:

```
+----------------------------------------+
|                        |               |
|                        |   vertical    |
|                        |   X36~49      |
|                        |   Y0~31       |
+------------------------+---------------+
|      horizontal        | pod | next-to |
|     X0~31  Y32~37      |     |  X36~39 |
+------------------------+---------------+
    width 32               4      14
```

| Zone | X range | Y range |
|---|---|---|
| horizontal | 0 ~ 31 | 32 ~ 37 |
| pod | 32 ~ 35 | 34 ~ 37 |
| next to pod | 36 ~ 39 | 32 ~ 37 |
| vertical | 36 ~ 49 | 0 ~ 31 |
| above pod | 32 ~ 35 | 32 ~ 33 |

Any geyser landing in one of these blocks marks the seed `blocked`, and it is
filtered out when base clearance is required.

The printing pod is placed differently for every seed, so every check is
relative to that seed's own pod rather than to a hard-coded coordinate.

### Performance

The interface and the CLI share one implementation (`app/`), so they cannot
disagree.

Scanning runs at about 20-22 seeds/s on 16 cores. The bottleneck is the fixed
cost of one world generation (about 220 ms on one core), not the scheduler:
1000 seeds take roughly 45 seconds.

The detail panel generates each seed once. Opening the same seed again reuses
the result in memory.

### Pre-scan feasibility

Before a scan starts, the tool estimates whether the filter can be satisfied and
how long it will take:

- structurally impossible filters (for example, 5+ big volcanoes) are refused
  immediately instead of burning the whole range
- very strict filters warn with "about N seeds needed for 100 candidates" and
  ask for confirmation

Measured hit rates (vanilla Terra, 600 seeds):

| Filter | Hit rate |
|---|---|
| big volcanoes >= 1 | 43.2% |
| big volcanoes >= 2 | 9.8% |
| big volcanoes >= 3 | 2.5% |
| iron/copper/gold each >= 1 | 9.0% |
| big >= 2 + all three metals + water >= 8 | 0.3% |

Big volcanoes and metal volcanoes are negatively correlated: asking for both is
harder than multiplying the two rates independently.

### Command line

**Scan (multi-threaded)**

```bash
node scripts/ci-scan.cjs shard --from 0 --to 100000 --threads 15 --output out/shard-0.json
node scripts/ci-scan.cjs merge --inputs out --output out/hits.json
node scripts/ci-report.cjs --input out/hits.json --output out/summary.md
```

- `--from` / `--to` are the seed range, `--to` exclusive
- Filters default to none; pass `--filter-file config/default-filter.json` or a
  single threshold such as `--big-volcano 2`
- This is the same path as the interface and GitHub Actions, so a filter
  cannot behave differently depending on how you start it

**Inspect one seed**

```bash
node scripts/inspect-seed.cjs 12695
node scripts/inspect-seed.cjs SNDST-A-12695-0-0-0-0 --lang en
```

Prints the full profile: geysers, water breakdown, volcano/metal/gas summary,
base clearance, resources and oil wells.

> Chinese may render as `?` in PowerShell. That is console encoding, not data.
> Run `[Console]::OutputEncoding=[Text.Encoding]::UTF8` first to see it.

**Single-threaded scan**

```bash
node scripts/ci-scan.cjs shard --from 0 --to 2000 --threads 1 --output out/shard-0.json
```

### GitHub Actions

`.github/workflows/scan.yml` runs scans on free runners: trigger manually, give
the seed range and shard count, and each shard runs as its own job. The merge
job combines the shards and publishes a report.

Entry point: repository -> Actions -> `scan` -> Run workflow.

| Input | Meaning | Default |
|---|---|---|
| `from` | first seed | 0 |
| `count` | how many seeds | 100000 |
| `shards` | parallel jobs | 8 |
| `threads` | threads per shard | 4 |
| `big_volcano` / `iron` / `copper` / `gold` | minimums | 2 / 1 / 1 / 1 |
| `min_water` | total water >= kg/s | 8 |
| `require_clear` | 50x38 base must be clear | checked |

Artifacts (kept 30 days, not committed):

- `hits.json`: every hit with score, geyser data and pod coordinates
- `summary.md`: also posted to the run summary, with a Top 25 table and the
  rejection breakdown

Shard results are cached by `filter + range + shard index`, so rerunning the
same parameters does not recompute. The merge step verifies that every shard is
present and that total coverage equals the range length; a missing shard fails
the run instead of silently producing an incomplete answer.

Running the same pipeline locally:

```bash
# four shards
node scripts/ci-scan.cjs shard --from 0 --to 100000 --shards 4 --index 0 \
  --threads 4 --filter-file config/default-filter.json --output out/shard-0.json
# merge and report
node scripts/ci-scan.cjs merge --inputs out --output out/hits.json
node scripts/ci-report.cjs --input out/hits.json --output out/summary.md
```

Default filters live in `config/default-filter.json` and can be overridden with
environment variables (`CI_BIG_VOLCANO`, `CI_MIN_WATER`, ...; see
`scripts/ci-scan.cjs`).

`.github/workflows/ci.yml` is the regression suite: syntax check, unit tests and
workflow YAML validation on Node 20 and 22.

### Scoring

The score is a relative ranking value, not an absolute quality measure:

| Axis | Target | Weight |
|---|---|---|
| total water (priced by processing cost) | 12 kg/s | 35 |
| volcano output | 4 kg/s | 20 |
| metal volcano output | 1.5 kg/s | 15 |
| natural gas + hydrogen | 0.3 kg/s | 10 |
| each junk vent | — | -2 |

Weights and targets live in `DEFAULT_WEIGHTS` / `DEFAULT_TARGETS` in
`app/scoring.cjs`.

### Layout

| Path | Purpose |
|---|---|
| `start.bat` | Double-click to start the interface |
| `package.json` | `npm start` also starts the interface |
| `server.cjs` | Local server: static page + JSON API |
| `public/` | Interface: `index.html` / `i18n.js` / `locales.js` / `app.js` / `style.css` |
| `config/default-filter.json` | Default filters, shared by the UI and CI |
| `app/seedgen.cjs` | The only module that talks to the worldgen engine, with the one-slot cache |
| `app/analysis.cjs` | Geyser statistics, base verdict, quick rejection |
| `app/scoring.cjs` | Scoring and threshold filters |
| `app/base-plan.cjs` | 50x38 base geometry |
| `app/feasibility.cjs` | Pre-scan feasibility model |
| `app/feasibility-text.cjs` | Wording for verdicts, per language |
| `app/locales.cjs` | Node-side access to the shared name tables |
| `app/cli-text.cjs` | CLI strings per language |
| `app/dispatcher.cjs` | Work-stealing scheduler |
| `app/scan-worker.cjs` | Scan worker |
| `scripts/` | CLI tools (scan, inspect, CI shard/merge/report) |
| `bench/` | Throughput and hit-rate measurements |
| `verify/` | Consistency, HTTP and memory regression checks |
| `test/` | Unit tests (`npm test`) |
| `tools/` | Repository audits (comments, characters, i18n, requires) |
| `results-*.json` | Local scan history (gitignored) |

### Gotchas

- **`scaled_rate` is grams per second, not kg/s**; divide by 1000. The upstream
  README does not say this clearly.
- **The printing pod position is not fixed**; derive it per seed.
- `worldgen.generate()` keeps a one-slot cache that each call replaces. Each
  worker thread has its own instance.
- The same seed number under a different cluster prefix is a different map;
  never drop the prefix. `SNDST-A` is vanilla Terra, `V-SNDST-C` is Spaced Out.
- **Basegame coordinates have five groups**: `SNDST-A-<seed>-0-0-0-0`. The
  engine accepts a shorter coordinate without complaining, but it describes a
  different map (a variant with story traits has 24 geysers, vanilla has 17).
- A worker thread cannot block with `Atomics.wait`; progress is reported by
  counting batches.

---

## 简体中文

全本地、离线、无需游戏运行的 ONI 种子工具。基于 `@onimaxxing/worldgen-node`
（游戏 worldgen 引擎的 WASM 编译版，基线 build 737195）。

### 快速开始（推荐：图形界面）

1. 双击 `start.bat`
2. 浏览器会自动打开扫描页面（本地地址，不联网）
3. 设置筛选条件，点「开始扫描」

关闭那个黑色命令行窗口即可停止服务。

首次在新机器使用需要装依赖：

```bat
cd /d <本目录路径>
npm install
```

### 界面说明

**扫描设置**

- **起始种子 / 扫描数量**：扫 `起始种子` 到 `起始种子 + 数量 - 1` 区间
- **筛选条件**：全部是「至少 / 至多」阈值，留 0 表示不限制
  - 大火山 ≥ N 座
  - 铁 / 铜 / 金火山各 ≥ N 座
  - 金属总产 ≥ kg/s（铁+铜+金火山产出之和）
  - 盐水 / 清水 / 水总量 ≥ kg/s
  - 废弃喷孔 ≤ N 个（氯气、二氧化碳、污氧、渗油裂缝等）
  - **基地 50×38 内不能有泉**（默认勾选，见下节）
- 条件会记在浏览器里，下次打开自动恢复

**结果表**

点表头任意列可排序。点一行打开该种子的详情。

**详情面板**

- **基地平面图（50×38）**：直接画出你的布局，红色是规划区，绿色是打印仓，
  蓝点是落在基地范围内的泉，黄点是落在范围内的废弃喷孔，红点是挡住规划区的泉。
  基地外的泉不会画在图上，但右侧明细表里全都列出来了
- **泉水明细**：泉的类型、产出、在 50×38 里的坐标、所在区域
- **资源储量**：原油、岩浆、铅、钨、冰、沙、藻类、煤、钻石

**界面语言**

右上角可在中文 / English 之间切换，选择会记在浏览器里。语言同时影响界面、
命令行（`--lang`）和服务端返回的文案；JSON 字段名保持不变。

### 基地规划区（硬性要求）

坐标系以基地**左上角**为原点，X 向右，Y 向下：

```
+----------------------------------------+
|                        |               |
|                        |  垂直区域     |
|                        |   X36~49      |
|                        |   Y0~31       |
+------------------------+---------------+
|     水平区域           | 仓 |  打印仓旁 |
|     X0~31  Y32~37      |    |  X36~39   |
+------------------------+---------------+
   宽度 32                 4      14
```

| 区域 | X 范围 | Y 范围 |
|---|---|---|
| 水平区域 | 0 ~ 31 | 32 ~ 37 |
| 打印仓 | 32 ~ 35 | 34 ~ 37 |
| 打印仓旁 | 36 ~ 39 | 32 ~ 37 |
| 垂直区域 | 36 ~ 49 | 0 ~ 31 |
| 打印仓上方 | 32 ~ 35 | 32 ~ 33 |

只要有泉水落进上面任一块，该种子就被判为 `blocked`，在要求「基地净空」时会被筛掉。

打印仓在世界里的位置每个种子都不同，所以所有判定都是相对每个种子自己的打印仓
换算出来，不是写死坐标。

### 性能说明

界面和命令行共用同一套逻辑（`app/`），结果不会对不上。

扫描速度约 20~22/秒（16 核实测），瓶颈在每次世界生成的固定成本（约 220 ms，
单核实测），不是调度方式。1000 个种子约 45 秒。

详情页每个种子只生成一次；再次打开同一个种子会复用内存里的结果。

### 扫描前的可行性判断

开始扫描前，界面会先估算这组条件能不能满足、大概要扫多久：

- 结构性不可能的条件（例如大火山 ≥5）会直接拒绝，不浪费扫描时间
- 条件很严时会提示「预计要扫 N 个种子才能凑够 100 个候选」，让你确认后再开

实测命中率（本体 Terra，600 个种子）：

| 条件 | 命中率 |
|---|---|
| 大火山 ≥1 | 43.2% |
| 大火山 ≥2 | 9.8% |
| 大火山 ≥3 | 2.5% |
| 铁/铜/金火山各 ≥1 | 9.0% |
| 大火山 ≥2 + 三金属各 ≥1 + 水 ≥8 | 0.3% |

注意大火山和金属火山是负相关的：两个条件一起要，比单独相乘还要难一半。

### 命令行用法

**扫描（多线程）**

```bash
node scripts/ci-scan.cjs shard --from 0 --to 100000 --threads 15 --output out/shard-0.json
node scripts/ci-scan.cjs merge --inputs out --output out/hits.json
node scripts/ci-report.cjs --input out/hits.json --output out/summary.md
```

- `--from` / `--to` 是种子区间，`--to` 不含
- 默认不加任何筛选；要筛就传 `--filter-file config/default-filter.json`，
  或单独给某项阈值，例如 `--big-volcano 2`
- 和界面、GitHub Actions 走同一条路径，同一个条件不会因为启动方式不同而给出不同结果

**查看单个种子**

```bash
node scripts/inspect-seed.cjs 12695
node scripts/inspect-seed.cjs SNDST-A-12695-0-0-0-0 --lang zh
```

输出完整档案：泉水详情、水源分类、火山/金属/气体汇总、基地净空、资源储量、油井数。

> PowerShell 里中文可能显示成 `?`，那是控制台编码问题，不影响数据。
> 若要看正常中文，先执行 `[Console]::OutputEncoding=[Text.Encoding]::UTF8`。

**单线程扫描**

```bash
node scripts/ci-scan.cjs shard --from 0 --to 2000 --threads 1 --output out/shard-0.json
```

### GitHub Actions

`.github/workflows/scan.yml` 把扫描放到免费 runner 上跑：手动触发，填种子区间和
分片数，每个分片是一个独立 job，跑完自动合并、出报告。

入口：仓库 → Actions → `scan` → Run workflow。

| 输入 | 说明 | 默认 |
|---|---|---|
| `from` | 起始种子 | 0 |
| `count` | 扫描数量 | 100000 |
| `shards` | 分片数（= 并行 job 数） | 8 |
| `threads` | 每分片线程数 | 4 |
| `big_volcano` / `iron` / `copper` / `gold` | 下限 | 2 / 1 / 1 / 1 |
| `min_water` | 水总量 ≥ kg/s | 8 |
| `require_clear` | 基地 50×38 净空 | 勾选 |

产物（不进仓库，作为 artifact 保存 30 天）：

- `hits.json`：全部命中种子，含分数、泉水数据、基地坐标
- `summary.md`：同时贴到运行页面的 Summary，含 Top 25 表格和淘汰原因分布

分片结果会按 `filter + 区间 + 分片号` 做缓存，同一组参数重跑不会重复计算。
区间跨分片不重叠也不留缝；合并时会校验分片齐全且覆盖率等于区间长度，
少一个分片就直接失败，不会悄悄给出不完整的结论。

本地跑同一套流程：

```bash
# 分成 4 片分别跑
node scripts/ci-scan.cjs shard --from 0 --to 100000 --shards 4 --index 0 \
  --threads 4 --filter-file config/default-filter.json --output out/shard-0.json
# 合并 + 出报告
node scripts/ci-scan.cjs merge --inputs out --output out/hits.json
node scripts/ci-report.cjs --input out/hits.json --output out/summary.md
```

筛选条件的默认值在 `config/default-filter.json`，也可以直接用环境变量覆盖
（`CI_BIG_VOLCANO`、`CI_MIN_WATER` 等，见 `scripts/ci-scan.cjs`）。

`.github/workflows/ci.yml` 是回归测试：Node 20 / 22 双版本跑语法检查、单元测试、
工作流 YAML 校验。

### 评分说明

结果表里的「分数」是给排序用的相对值，不是绝对好坏：

| 项目 | 目标值 | 权重 |
|---|---|---|
| 水总量（按处理成本加权） | 12 kg/s | 35 |
| 火山产出 | 4 kg/s | 20 |
| 金属火山产出 | 1.5 kg/s | 15 |
| 天然气 + 氢气 | 0.3 kg/s | 10 |
| 每个废弃喷孔 | — | -2 |

权重和目标值在 `app/scoring.cjs` 的 `DEFAULT_WEIGHTS` / `DEFAULT_TARGETS` 里。

### 文件说明

| 路径 | 用途 |
|---|---|
| `start.bat` | 双击启动图形界面 |
| `package.json` | `npm start` 也能启动界面 |
| `server.cjs` | 本地服务：静态页面 + JSON 接口 |
| `public/` | 界面：`index.html` / `i18n.js` / `locales.js` / `app.js` / `style.css` |
| `config/default-filter.json` | 扫描条件默认值（界面与 CI 共用） |
| `app/seedgen.cjs` | 唯一接触 worldgen 引擎的模块，含单槽缓存 |
| `app/analysis.cjs` | 泉统计、基地判定、快速淘汰 |
| `app/scoring.cjs` | 评分与阈值筛选 |
| `app/base-plan.cjs` | 50×38 基地几何 |
| `app/feasibility.cjs` | 扫描前的可行性判断 |
| `app/feasibility-text.cjs` | 可行性文案，按语言生成 |
| `app/locales.cjs` | 服务端读取共享名称表 |
| `app/cli-text.cjs` | 命令行文案，按语言生成 |
| `app/dispatcher.cjs` | 动态任务分配调度器 |
| `app/scan-worker.cjs` | 扫描 worker |
| `scripts/` | 命令行工具（扫描、单种子查看、CI 分片/合并/报告） |
| `bench/` | 性能与命中率实测脚本 |
| `verify/` | 一致性、HTTP、内存回归测试 |
| `test/` | 单元测试（`npm test`） |
| `tools/` | 仓库审计（注释、字符、多语言、引用） |
| `results-*.json` | 本地历史扫描结果（已 gitignore） |

### 踩坑记录

- **`scaled_rate` 单位是 g/s，不是 kg/s**，务必 `/ 1000`。官方 README 没写清。
- **打印仓位置不是固定的**，每个种子都不同，必须按种子自己的坐标换算。
- `worldgen.generate()` 有单槽缓存，每次调用会替换上一次的。多线程时每个
  worker 有自己的实例，互不干扰。
- 同一个种子数字在不同 cluster 前缀下是完全不同的地图，记种子时别丢前缀。
  `SNDST-A` = 本体 Terra，`V-SNDST-C` = 太空 DLC。
- **本体坐标是五段**：`SNDST-A-<seed>-0-0-0-0`。少写一段引擎不报错，
  但语义已经不同（带故事特质的变体会有 24 个泉，本体是 17 个）。
- 单个 worker 不能用 `Atomics.wait` 阻塞（会卡住整个线程且拿不到消息），
  进度上报靠计数批处理。
