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
const DAY_MS = 24 * 60 * 60 * 1000;

const EDUCATION_TOPIC_SIGNALS = new Set([
    'curriculum', 'learn', 'learning', 'learn-to-code', 'teaching',
    'teacher', 'teachers', 'student', 'students', 'student-tools',
    'classroom', 'classroom-tools', 'course', 'courses', 'tutorial',
    'tutorials', 'book', 'books', 'book-series', 'study', 'study-tools',
    'edtech', 'elearning', 'e-learning', 'lms', 'school', 'university',
    'pedagogy', 'flashcard', 'flashcards', 'quiz', 'quizzes', 'educational',
    'educational-project', 'training-materials', 'certification', 'practice',
    'interactive-learning', 'learning-by-doing', 'teaching-tool', 'kids',
    'field-guide', 'textbook'
]);

const EDUCATION_TEXT_PATTERN =
    /\b(education|educational|learn|learning|teach|teaching|teacher|student|classroom|course|curriculum|tutorial|textbook|study|training|practice|quiz|flashcard|school|university)\b/gi;

// 领域配置
const categories = {
    ai: { name: '人工智能', keyword: 'machine-learning' },
    web: { name: 'Web 开发', keyword: 'web' },
    mobile: { name: '移动开发', keyword: 'mobile' },
    devops: { name: 'DevOps', keyword: 'devops' },
    data: { name: '数据科学', keyword: 'data-science' },
    security: { name: '安全', keyword: 'security' },
    game: { name: '游戏开发', keyword: 'game' },
    education: {
        name: '教育',
        keyword: 'education',
        topMinStars: 5000,
        newMinStars: 50,
        recentDays: 30,
        strictEducation: true
    },
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

function isEducationRepository(repo) {
    const topics = (repo.topics || []).map(topic => topic.toLowerCase());
    const hasEducationTopic = topics.includes('education');
    const hasSupportingTopic = topics.some(topic => EDUCATION_TOPIC_SIGNALS.has(topic));
    const text = `${repo.name || ''} ${repo.description || ''}`;
    const textSignals = new Set(
        (text.match(EDUCATION_TEXT_PATTERN) || []).map(signal => signal.toLowerCase())
    );

    return hasEducationTopic && (hasSupportingTopic || textSignals.size >= 2);
}

async function fetchCategory(category, type = 'top') {
    const today = new Date().toISOString().split('T')[0];
    const recentDays = category.recentDays || 7;
    const recentDate = new Date(Date.now() - recentDays * DAY_MS).toISOString().split('T')[0];
    const keyword = category.keyword;

    let query;
    if (keyword) {
        if (type === 'top' && category.topMinStars) {
            query = `topic:${keyword} stars:>${category.topMinStars}`;
        } else {
            query = type === 'top'
                ? `topic:${keyword} pushed:${today}`
                : `topic:${keyword} created:>${recentDate} stars:>${category.newMinStars || 50}`;
        }
    } else {
        query = type === 'top'
            ? `stars:>10000 pushed:${today}`
            : `stars:>1000 created:>${recentDate}`;
    }

    const perPage = category.strictEducation ? 100 : 10;
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${perPage}`;

    try {
        const data = await fetch(url);
        const repos = category.strictEducation
            ? (data.items || []).filter(isEducationRepository)
            : (data.items || []);

        return repos.slice(0, 10).map(repo => ({
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

        const topStars = await fetchCategory(cat, 'top');
        await sleep(REQUEST_DELAY);

        const trending = await fetchCategory(cat, 'new');
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
