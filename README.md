# dokorail-proxy

Vercel serverless 反向代理（上游地址由部署侧环境变量注入），解决 GitHub Actions runner 出口 IP 被 Cloudflare 403 的问题。jr-delay baker（ooep/delay）通过本代理抓取上游的列车 feed / 时刻表索引 / 几何 catalog。

## 一键部署（约 2 分钟）

### 1. 推到 GitHub
把本目录推成一个新仓库，例如 `ooep/dokorail-proxy`：

```sh
cd dokorail-proxy
git init && git add -A && git commit -m "dokorail-proxy: initial"
# 在 GitHub 建空仓库 ooep/dokorail-proxy 后：
git remote add origin git@github.com:ooep/dokorail-proxy.git
git push -u origin main
```

### 2. Vercel 导入部署
1. 打开 <https://vercel.com/new>
2. 选中刚建的 `ooep/dokorail-proxy` 仓库
3. Framework Preset 选 **Other**，Root Directory 保持默认，点 **Deploy**
4. 等待 ~1 分钟，得到域名 `https://<项目名>.vercel.app`

**必须**在 Project → Settings → Environment Variables 配置 `UPSTREAM`（上游站点地址）。
代码不带任何默认上游：未配置时所有请求直接返回 500 `upstream_not_configured`。

### 3. 部署后立刻自测（关键，别跳）

用上游实际在用的三类路径各测一次：

- a) 实时 feed API（baker 最核心的调用，应返回 JSON 且带 X-Train-Search 头自动注入）
- b) 首页 HTML（baker 用来发现内容寻址的几何 catalog 路径，应返回 HTML）
- c) 时刻表索引文件（~0.5MB，测响应体大小是否在 4.5MB 限制内）

三项都正常后，把代理域名配进 jr-suki：在 GitHub 仓库 `ooep/delay` → Settings → Secrets and variables → Actions 里更新上游地址相关的 Secret（baker 从 Secret 读取，见该仓 workflow env）。

## 缓存策略（已内置在 api/proxy.js）

| 路径类 | 缓存 | 原因 |
|---|---|---|
| 实时 feed API | 边缘 10s | 去重突发 bake，晚点数据仍新鲜 |
| 内容寻址几何文件 | 边缘 24h + immutable | 内容寻址，rebuild 即换 hash |
| 时刻表 bundle 文件 | 边缘 10min | 一天内稳定 |
| 首页 HTML | 不缓存 | catalog 路径每次 rebuild 都变 |

## 接入 baker（jr-suki 侧）

baker 的上游基址从环境变量/Secret 读取（无硬编码默认值）。GitHub Actions workflow 经
Secret 注入代理域名；本地开发把同一变量指向上游即可，行为不变。

## Hobby 免费额度口径（2026-10 测算）

- bake 频率 5min × 运营 21h = 7,560 次/月 × 每次 ~7 个请求 ≈ 5.3 万次调用/月（额度 100 万，富余）
- 真正瓶颈是 **Fast Origin Transfer 10GB/月**：靠上面的静态长缓存，实时回源只剩实时 feed API——feed 单次体积需 <0.5MB 才安全，部署后用上面自测 c) 同款命令实测 feed 大小
- 硬限制：单次响应体 4.5MB，几何 catalog 超限会 502，届时需把大文件拆到 CDN 静态托管
