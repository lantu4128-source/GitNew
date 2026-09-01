#!/usr/bin/env node
/**
 * GitHub 趋势数据抓取脚本
 * 运行方式: node fetch_data.js
 * 支持环境变量 GITHUB_TOKEN 提升 API 限制到 5000次/小时
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const REQUEST_DELAY = GITHUB_TOKEN ? 1000 : 6500;

// 领域配置
const categories = {
    ai: { name: '人工智能', keyword: 'machine-learning' },
    web: { name: 'Web 开发', keyword: 'web' },
    mobile: { name: '移动开发', keyword: 'mobile' },
    devops: { name: 'DevOps', keyword: 'devops' },
    data: { name: '数据科学', keyword: 'data-science' },
    security: { name: '安全', keyword: 'security' },
    game: { name: '游戏开发', keyword: 'game' },
    education: { name: '教育', keyword: 'education', newMinStars: 5 },
    all: { name: '全部', keyword: '' }
};

function fetch(url) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const headers = {
            'User-Agent': 'GitHub-Trending-Tracker',
            'Accept': 'application/vnd.github.v3+json'
        };

        // 如果有 Token，添加认证头
        if (GITHUB_TOKEN) {
            headers['Authorization'] = `token ${GITHUB_TOKEN}`;
        }

        const req = https.get({
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            headers
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.message && json.message.includes('rate limit')) {
                        reject(new Error('API 限制'));
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

async function fetchCategory(keyword, type = 'top', newMinStars = 50) {
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let query;
    if (keyword) {
        query = type === 'top'
            ? `topic:${keyword} pushed:${today}`
            : `topic:${keyword} created:>${weekAgo} stars:>${newMinStars}`;
    } else {
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
    console.log(`认证: ${GITHUB_TOKEN ? '已配置 Token' : '未认证 (搜索 API 10次/分钟)'}\n`);

    const result = {
        timestamp: Date.now(),
        date: new Date().toISOString().split('T')[0],
        categories: {}
    };

    for (const [key, cat] of Object.entries(categories)) {
        console.log(`  获取 ${cat.name}...`);

        const topStars = await fetchCategory(cat.keyword, 'top');
        await sleep(REQUEST_DELAY);

        const trending = await fetchCategory(cat.keyword, 'new', cat.newMinStars);
        await sleep(REQUEST_DELAY);

        result.categories[key] = { topStars, trending };
        console.log(`    ✓ 最高星标: ${topStars.length}, 近期热门: ${trending.length}`);
    }

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
