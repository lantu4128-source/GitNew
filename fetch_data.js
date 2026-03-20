#!/usr/bin/env node
/**
 * GitHub 趋势数据抓取脚本
 * 运行方式: node fetch_data.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');

// 领域配置 - 每个领域只用一个关键词，减少API请求
const categories = {
    ai: { name: '人工智能', keyword: 'machine-learning' },
    web: { name: 'Web 开发', keyword: 'web' },
    mobile: { name: '移动开发', keyword: 'mobile' },
    devops: { name: 'DevOps', keyword: 'devops' },
    data: { name: '数据科学', keyword: 'data-science' },
    security: { name: '安全', keyword: 'security' },
    game: { name: '游戏开发', keyword: 'game' },
    all: { name: '全部', keyword: '' }
};

function fetch(url) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const req = https.get({
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Accept': 'application/vnd.github.v3+json'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.message && json.message.includes('rate limit')) {
                        reject(new Error('API 限制，请稍后再试或配置 GitHub Token'));
                    } else {
                        resolve(json);
                    }
                } catch (e) {
                    reject(new Error('JSON 解析失败'));
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(30000, () => {
            req.destroy();
            reject(new Error('请求超时'));
        });
    });
}

async function fetchCategory(keyword, type = 'top') {
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let query;
    if (keyword) {
        query = type === 'top'
            ? `topic:${keyword} pushed:${today}`
            : `topic:${keyword} created:>${weekAgo} stars:>50`;
    } else {
        // 全部领域
        query = type === 'top'
            ? `stars:>10000 pushed:${today}`
            : `stars:>1000 created:>${weekAgo}`;
    }

    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=10`;

    try {
        const data = await fetch(url);
        return (data.items || []).map(repo => ({
            owner: repo.owner.login,
            name: repo.name,
            description: repo.description,
            url: repo.html_url,
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            language: repo.language
        }));
    } catch (e) {
        console.error(`    失败: ${e.message}`);
        return [];
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log(`\n========== GitHub 趋势抓取 ==========`);
    console.log(`时间: ${new Date().toLocaleString('zh-CN')}`);
    console.log(`提示: GitHub API 未认证限制 60次/小时\n`);

    const result = {
        timestamp: Date.now(),
        date: new Date().toISOString().split('T')[0],
        categories: {}
    };

    for (const [key, cat] of Object.entries(categories)) {
        console.log(`  获取 ${cat.name}...`);

        const topStars = await fetchCategory(cat.keyword, 'top');
        await sleep(2000); // 增加间隔避免限制

        const trending = await fetchCategory(cat.keyword, 'new');
        await sleep(2000);

        result.categories[key] = { topStars, trending };
        console.log(`    ✓ 最高星标: ${topStars.length}, 近期热门: ${trending.length}`);
    }

    // 保存数据
    fs.writeFileSync(DATA_FILE, JSON.stringify(result, null, 2));

    console.log(`\n✅ 数据已保存到 ${DATA_FILE}`);

    // 打印摘要
    for (const [key, cat] of Object.entries(categories)) {
        const data = result.categories[key];
        if (data && data.topStars.length > 0) {
            console.log(`\n${cat.name} Top 3:`);
            data.topStars.slice(0, 3).forEach((repo, i) => {
                console.log(`   ${i + 1}. ${repo.owner}/${repo.name} (${repo.stars.toLocaleString()} ⭐)`);
            });
        }
    }
}

main().catch(console.error);
