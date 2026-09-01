# GitHub 每日趋势

一个简洁的本地工具，每日自动抓取 GitHub 热门项目并展示。

## 功能

- **高星项目 Top 10** - 各关注方向按 GitHub 星标数排序的项目
- **近期新项目 Top 10** - 各关注方向最近 30 天新创建的热门项目；“全部”分类仍按最近 7 天统计
- **趋势排序** - 近期候选先按最近活跃度拉取，再综合当前星数和估算日增星速度排序；优先使用每日数据快照计算，首次出现的项目使用项目年龄估算
- **历史数据浏览** - 支持查看过去 30 天的数据
- **一键翻译** - 将英文描述翻译成中文
- **领域筛选** - 聚焦大模型、AI Agent、Vibe Coding、教育、K12 和 AI 影视/视频
- **教育分类校验** - 高星榜至少 5000 星；近期榜统计最近 30 天、至少 50 星的新项目，并过滤仅误加 `education` 标签的仓库
- **关注方向** - OpenMAIC 这类“多智能体 + 互动课堂”项目会同时进入 AI Agent 和教育分类
- **项目进度观察** - 每条项目显示 GitHub 最近一次推送日期，便于跟踪活跃度
- **K12 细分** - 单独追踪幼儿园、小学、初中、高中及 K-12 教师和课程项目；近期项目最低 5 星，避免错过刚起步的垂直项目
- **定时抓取** - 支持配置每日自动更新

## 快速开始

```bash
# 1. 克隆项目
git clone https://github.com/你的用户名/github-trending.git
cd github-trending

# 2. 抓取数据
node fetch_data.js

# 3. 启动本地服务器
python3 -m http.server 8080

# 4. 打开浏览器访问
open http://localhost:8080
```

## 定时任务（macOS）

```bash
# 设置每天早上 9:00 自动抓取
./setup_cron.sh
```

## 文件说明

```
├── index.html        # 网页界面
├── fetch_data.js     # 数据抓取脚本
├── data.json         # 本地数据存储（自动生成）
├── setup_cron.sh     # macOS 定时任务配置
└── README.md
```

## 截图

![screenshot](screenshot.png)

## License

MIT
