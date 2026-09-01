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
const ONLY_CATEGORY = process.env.ONLY_CATEGORY || '';
const REQUEST_DELAY = GITHUB_TOKEN ? 1000 : 8000;
const DAY_MS = 24 * 60 * 60 * 1000;
const previousData = loadPreviousData();
const previousRepoStars = buildPreviousRepoStars(previousData);

const EDUCATION_TOPIC_SIGNALS = new Set([
    'curriculum', 'learn-to-code', 'teaching', 'teacher', 'teachers',
    'student', 'students', 'student-tools', 'classroom', 'classroom-tools',
    'course', 'courses', 'books', 'book-series', 'study-tools', 'edtech',
    'elearning', 'e-learning', 'lms', 'school', 'university', 'pedagogy',
    'flashcard', 'flashcards', 'quiz', 'quizzes', 'educational',
    'educational-project', 'training-materials', 'certification', 'practice',
    'interactive-learning', 'learning-by-doing', 'teaching-tool', 'kids',
    'field-guide', 'textbook'
]);

const EDUCATION_TEXT_PATTERN =
    /\b(education|educational|learn|learning|teach|teaching|teacher|student|classroom|course|curriculum|tutorial|textbook|study|training|practice|quiz|flashcard|school|university|interactive classroom|learning platform)\b/gi;

const CATEGORY_TEXT_SIGNALS = {
    llm: /\b(llm|large language model|language model|foundation model|transformer|inference|fine[- ]tuning)\b/i,
    agent: /\b(agent|agents|agentic|multi[- ]agent|autonomous|tool[- ]use|orchestrat|workflow)\b/i,
    vibe: /\b(vibe coding|ai[- ]assisted coding|ai coding|code generation|coding agent|copilot)\b/i,
    k12: /\b(k[- ]?12|kindergarten|elementary|primary school|middle school|high school|secondary school|preschool|幼儿园|小学|初中|高中|中学)\w*/i,
    media: /\b(film|cinema|video|animation|movie|short film|storyboard|screenplay|text[- ]to[- ]video|image[- ]to[- ]video)\b/i
};

const AGENT_TOPIC_SIGNALS = new Set([
    'ai-agent', 'agentic', 'multi-agent', 'autonomous-agent',
    'agent-framework', 'agent-platform', 'agentic-workflow', 'tool-use'
]);

const AGENT_EDUCATION_TOPIC_SIGNALS = new Set([
    'education', 'educational', 'edtech', 'classroom', 'classroom-tools',
    'course', 'courses', 'curriculum', 'teacher', 'teachers', 'student',
    'students', 'tutor', 'tutoring', 'study-tools', 'quiz', 'quizzes',
    'exam', 'exams', 'learning-platform', 'interactive-learning',
    'teaching-tool', 'pedagogy'
]);

const AGENT_EDUCATION_SCENE_PATTERN =
    /\b(education|educational|edtech|classroom|course|curriculum|tutor|tutoring|teacher|teachers|student|students|school|university|learner|study coach|exam|quiz|lesson|pedagogy|instructional|learning platform|personalized learning|adaptive learning|interactive learning)\b/i;

const AGENT_EDUCATION_EXCLUSION_PATTERN =
    /\b(not a (?:kids[- ]?ai|education) product|fictional university|political propaganda|video generation|reinforcement learning|machine learning agents toolkit)\b/i;

const MEDIA_AI_SIGNALS =
    /\b(ai|artificial intelligence|generative ai|diffusion|text[- ]to[- ]video|image[- ]to[- ]video|video generation|digital human|avatar|talking face)\b/i;

// 领域配置。每个专题使用独立的 GitHub 搜索表达式和最低星标门槛。
const categories = {
    llm: {
        name: '大模型',
        query: 'topic:llm',
        topMinStars: 1000,
        newMinStars: 50,
        recentDays: 30,
        signal: 'llm'
    },
    agent: {
        name: 'AI Agent',
        query: '"multi-agent"',
        topMinStars: 500,
        newMinStars: 30,
        recentDays: 30,
        signal: 'agent'
    },
    agentEducation: {
        name: 'Agent+教育',
        queries: [
            '"multi-agent" education',
            '"multi-agent" classroom',
            '"multi-agent" learning',
            '"educational agent"',
            'agent tutor',
            'agent course',
            'agent exam',
            'agent student',
            'agent school',
            '"AI tutor"'
        ],
        topMinStars: 20,
        newMinStars: 1,
        recentDays: 30,
        fusion: 'agentEducation'
    },
    vibe: {
        name: 'Vibe Coding',
        query: '"vibe coding"',
        topMinStars: 50,
        newMinStars: 10,
        recentDays: 30,
        signal: 'vibe'
    },
    education: {
        name: '教育',
        query: 'education OR classroom OR curriculum OR "learning platform"',
        topMinStars: 5000,
        newMinStars: 50,
        recentDays: 30,
        strictEducation: true
    },
    k12: {
        name: 'K12',
        query: 'k12 OR "k-12" OR "high school" OR "elementary school" OR kindergarten',
        topMinStars: 100,
        newMinStars: 5,
        recentDays: 30,
        signal: 'k12'
    },
    media: {
        name: 'AI 影视/视频',
        query: '"video generation" OR "text to video" OR "image to video" OR film OR animation',
        topMinStars: 500,
        newMinStars: 20,
        recentDays: 30,
        signal: 'media'
    },
    all: { name: '全部', query: '' }
};

function loadPreviousData() {
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
        return null;
    }
}

function buildPreviousRepoStars(data) {
    const stars = new Map();
    for (const category of Object.values(data?.categories || {})) {
        for (const repo of [...(category.topStars || []), ...(category.trending || [])]) {
            stars.set(`${repo.owner}/${repo.name}`, repo.stars);
        }
    }
    return stars;
}

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

    return (hasEducationTopic && hasSupportingTopic) || textSignals.size >= 2;
}

function isAgentEducationRepository(repo) {
    const topics = (repo.topics || []).map(topic => topic.toLowerCase());
    const shortText = `${repo.name || ''} ${(repo.description || '').slice(0, 600)}`;
    const agentMatch = CATEGORY_TEXT_SIGNALS.agent.test(shortText) ||
        topics.some(topic => AGENT_TOPIC_SIGNALS.has(topic));
    const educationSceneMatch = AGENT_EDUCATION_SCENE_PATTERN.test(shortText) ||
        topics.some(topic => AGENT_EDUCATION_TOPIC_SIGNALS.has(topic));

    return agentMatch && educationSceneMatch &&
        !AGENT_EDUCATION_EXCLUSION_PATTERN.test(shortText);
}

function matchesCategory(repo, category) {
    if (category.fusion === 'agentEducation') {
        return isAgentEducationRepository(repo);
    }

    if (category.strictEducation) return isEducationRepository(repo);
    if (!category.signal) return true;

    const topics = (repo.topics || []).map(topic => topic.toLowerCase());
    const topicText = topics.join(' ');
    const text = `${repo.name || ''} ${repo.description || ''}`;
    const searchableText = `${topicText} ${text}`;

    if (category.signal === 'agent') {
        return CATEGORY_TEXT_SIGNALS.agent.test(text) ||
            topics.some(topic => AGENT_TOPIC_SIGNALS.has(topic));
    }

    if (category.signal === 'k12') {
        const name = repo.name || '';
        const description = repo.description || '';
        return CATEGORY_TEXT_SIGNALS.k12.test(name) ||
            (description.length <= 500 && CATEGORY_TEXT_SIGNALS.k12.test(description));
    }

    if (category.signal === 'media') {
        return CATEGORY_TEXT_SIGNALS.media.test(searchableText) &&
            MEDIA_AI_SIGNALS.test(text);
    }

    return CATEGORY_TEXT_SIGNALS[category.signal].test(searchableText);
}

function getTrendMetrics(repo) {
    const fullName = `${repo.owner.login}/${repo.name}`;
    const ageDays = Math.max(1, (Date.now() - new Date(repo.created_at).getTime()) / DAY_MS);
    const previousStars = previousRepoStars.get(fullName);
    const previousTimestamp = previousData?.timestamp;
    const snapshotDays = previousTimestamp
        ? Math.max(1, (Date.now() - previousTimestamp) / DAY_MS)
        : ageDays;
    const growthPerDay = previousStars !== undefined
        ? Math.max(0, repo.stargazers_count - previousStars) / snapshotDays
        : repo.stargazers_count / ageDays;

    return {
        growthPerDay,
        trendScore: Math.sqrt((repo.stargazers_count + 1) * (growthPerDay + 1))
    };
}

async function fetchCategory(category, type = 'top') {
    const recentDays = category.recentDays || 7;
    const recentDate = new Date(Date.now() - recentDays * DAY_MS).toISOString().split('T')[0];
    const queryBases = category.queries || [category.query];
    const reposByName = new Map();

    for (const [index, queryBase] of queryBases.entries()) {
        let query;
        if (queryBase) {
            if (type === 'top' && category.topMinStars) {
                query = `${queryBase} stars:>${category.topMinStars}`;
            } else {
                query = type === 'top'
                    ? `${queryBase} pushed:${new Date().toISOString().split('T')[0]}`
                    : `${queryBase} created:>${recentDate} stars:>${category.newMinStars || 50}`;
            }
        } else {
            query = type === 'top'
                ? 'stars:>10000 pushed:' + new Date().toISOString().split('T')[0]
                : `stars:>1000 created:>${recentDate}`;
        }

        const perPage = queryBase ? 100 : 10;
        const sort = type === 'new' ? 'updated' : 'stars';
        const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=${sort}&order=desc&per_page=${perPage}`;

        try {
            const data = await fetch(url);
            for (const repo of data.items || []) {
                if (!matchesCategory(repo, category)) continue;
                reposByName.set(`${repo.owner.login}/${repo.name}`, {
                    repo,
                    trend: getTrendMetrics(repo)
                });
            }
        } catch (e) {
            console.error(`    失败: ${e.message}`);
        }

        if (index < queryBases.length - 1) await sleep(REQUEST_DELAY);
    }

    const repos = [...reposByName.values()];
    repos.sort(type === 'new'
        ? (a, b) => b.trend.trendScore - a.trend.trendScore
        : (a, b) => b.repo.stargazers_count - a.repo.stargazers_count);

    return repos.slice(0, 10).map(({ repo, trend }) => ({
            owner: repo.owner.login,
            name: repo.name,
            description: repo.description,
            url: repo.html_url,
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            language: repo.language,
            createdAt: repo.created_at,
            updatedAt: repo.pushed_at,
            starGrowthPerDay: trend.growthPerDay
    }));
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
        categories: ONLY_CATEGORY ? { ...(previousData?.categories || {}) } : {}
    };

    const categoryEntries = ONLY_CATEGORY
        ? Object.entries(categories).filter(([key]) => key === ONLY_CATEGORY)
        : Object.entries(categories);

    if (ONLY_CATEGORY && categoryEntries.length === 0) {
        throw new Error(`未知分类: ${ONLY_CATEGORY}`);
    }

    for (const [key, cat] of categoryEntries) {
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
    for (const [key, cat] of categoryEntries) {
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
