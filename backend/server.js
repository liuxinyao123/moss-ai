const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { execFile, spawn } = require('child_process');
const { StringDecoder } = require('string_decoder');
const cookieParser = require('cookie-parser');
const { createSsoRouter, buildProvidersFromEnv } = require('./sso');

const app = express();
const PORT = 3001;
const server = http.createServer(app);

// WebSocket（运行时注入，用于向桌面端推送执行状态）
app.locals.realtimeWss = null;

// OpenClaw 与 ClawX 协作策略：
// - ClawX 作为唯一 OpenClaw Gateway / ~/.openclaw 的管理者
// - DSClaw 应用只做“调用方”，不写 ~/.openclaw/openclaw.json，不执行 agents add 等注册动作
const OPENCLAW_WRITE_ENABLED = String(process.env.MOSS_OPENCLAW_WRITE_ENABLED || '').trim() === '1';

// 配置
const HOME_DIR = require('os').homedir();
const WORKSPACE_ROOT = path.join(HOME_DIR, '.openclaw', 'workspace', 'moss-ai');
const WORKSPACE_PARENT_DIR = path.dirname(WORKSPACE_ROOT);
const AGENTS_DIR = path.join(WORKSPACE_ROOT, 'agents');
const DB_PATH = path.join(WORKSPACE_ROOT, 'moss-ai.db');
const UPLOADS_DIR = path.join(WORKSPACE_ROOT, 'uploads');
const DEMO_SCENE_DIR = path.join(WORKSPACE_ROOT, 'demo-scene');
const DEMO_SCENE_OUTPUT_DIR = path.join(DEMO_SCENE_DIR, 'output');
const DEMO_SCENE_CONFIG_PATH = path.join(DEMO_SCENE_DIR, 'config.json');
const ICHECK_SKILL_SCRIPT_PATH = path.join(HOME_DIR, '.openclaw', 'skills', 'icheck-tools', 'scripts', 'icheck.sh');
const ICHECK_COOKIE_FILE = path.join(HOME_DIR, '.icheck_cookie');
const ICHECK_API_BASE = 'http://8.140.103.143:82/api';
const ICHECK_REQUIREMENT_CACHE = new Map();
const ICHECK_PLAYWRIGHT_SCRIPT_PATH = path.join(WORKSPACE_ROOT, 'scripts', 'icheck_playwright_ui.py');
const ICHECK_SUBMIT_SCRIPT_PATH = path.join(WORKSPACE_ROOT, 'scripts', 'icheck_playwright_submit.py');
const DEMO_SCENE_CAD_SCRIPT_PATH = path.join(WORKSPACE_ROOT, 'scripts', 'demo_scene_cad_gui.py');
const DEMO_SCENE_MAIL_SCRIPT_PATH = path.join(WORKSPACE_ROOT, 'scripts', 'mail_draft_applescript.py');
const DEFAULT_CAD_MODEL_PATH = [
    '/Users/xinyao/Desktop/cad_door_design/Product1.stp',
    path.join(WORKSPACE_ROOT, 'cad-models', 'door.stp'),
    path.join(WORKSPACE_PARENT_DIR, 'cad-models', 'door.stp'),
    path.join(WORKSPACE_PARENT_DIR, 'cad_model.obj')
].find(candidate => fs.existsSync(candidate)) || '';

// 确保目录存在
fs.mkdirSync(AGENTS_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(DEMO_SCENE_DIR, { recursive: true });
fs.mkdirSync(DEMO_SCENE_OUTPUT_DIR, { recursive: true });

function readJsonFileIfExists(filePath, fallback = null) {
    try {
        if (!filePath || !fs.existsSync(filePath)) return fallback;
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = safeJsonParse(raw, fallback);
        return parsed ?? fallback;
    } catch {
        return fallback;
    }
}

function loadBytebotConfig() {
    const defaultCfg = {
        enabled: true,
        uiUrl: 'http://localhost:9992',
        tasksApiUrl: 'http://localhost:9991',
        computerUseApiUrl: 'http://localhost:9990',
        timeoutMs: 5000
    };
    const cfgPath = path.join(WORKSPACE_ROOT, 'config', 'bytebot.json');
    const fileCfg = readJsonFileIfExists(cfgPath, null);
    if (!fileCfg || typeof fileCfg !== 'object') return defaultCfg;
    return { ...defaultCfg, ...fileCfg };
}

// 中间件（对话可能带长历史，放宽 body 限制）
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use('/uploads', express.static(UPLOADS_DIR, {
    fallthrough: false,
    maxAge: '7d',
    setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
    }
}));

const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
        filename: (_req, file, cb) => {
            const original = String(file?.originalname || 'file');
            const safeExt = path.extname(original).slice(0, 16);
            cb(null, `${Date.now()}_${uuidv4()}${safeExt}`);
        }
    }),
    limits: {
        fileSize: 25 * 1024 * 1024, // 25MB
        files: 10
    }
});

function safeJsonParse(s, fallback = null) {
    try { return JSON.parse(s); } catch { return fallback; }
}

/** 内置默认助手显示名（兼容旧库中的 MOSS 命名） */
function isDefaultBuiltinAssistantName(name) {
    const n = String(name || '').trim();
    return n === 'DSClaw 默认助手' || n === 'MOSS 默认助手';
}

function getKnownBrowserRoots() {
    const homeDir = require('os').homedir();
    return [
        {
            browserId: 'chrome',
            name: 'Google Chrome',
            channel: 'chrome',
            userDataDir: path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome')
        },
        {
            browserId: 'chromium',
            name: 'Chromium',
            channel: 'chromium',
            userDataDir: path.join(homeDir, 'Library', 'Application Support', 'Chromium')
        },
        {
            browserId: 'edge',
            name: 'Microsoft Edge',
            channel: 'msedge',
            userDataDir: path.join(homeDir, 'Library', 'Application Support', 'Microsoft Edge')
        }
    ];
}

function listBrowserProfiles(userDataDir) {
    if (!userDataDir || !fs.existsSync(userDataDir)) return [];
    try {
        return fs.readdirSync(userDataDir, { withFileTypes: true })
            .filter(entry => {
                if (!entry.isDirectory()) return false;
                return fs.existsSync(path.join(userDataDir, entry.name, 'Preferences'));
            })
            .map(entry => ({
                name: entry.name,
                preferencesPath: path.join(userDataDir, entry.name, 'Preferences')
            }))
            .sort((a, b) => {
                const score = (name) => {
                    if (name === 'Default') return 0;
                    if (/^Profile \d+$/.test(name)) return 1;
                    if (name === 'System Profile') return 3;
                    return 2;
                };
                return score(a.name) - score(b.name) || a.name.localeCompare(b.name);
            });
    } catch {
        return [];
    }
}

function detectBrowserProfiles() {
    return getKnownBrowserRoots()
        .map(browser => ({
            ...browser,
            profiles: listBrowserProfiles(browser.userDataDir)
        }))
        .filter(browser => browser.profiles.length > 0);
}

function getDefaultDemoSceneConfig() {
    return {
        baseUrl: 'http://8.140.103.143:82',
        browserId: 'chromium',
        browserName: 'Playwright Chromium',
        browserChannel: '',
        userDataDir: '',
        profileDirectory: '',
        taskIndex: 0,
        cadModelPath: DEFAULT_CAD_MODEL_PATH,
        mailRecipient: '1191094357@qq.com',
        checkResultValue: '1',
        checkRemark: '',
        emailMode: 'draft',
        cadMode: 'gui'
    };
}

function readDemoSceneConfig() {
    const defaults = getDefaultDemoSceneConfig();
    const raw = fs.existsSync(DEMO_SCENE_CONFIG_PATH)
        ? fs.readFileSync(DEMO_SCENE_CONFIG_PATH, 'utf-8')
        : '';
    const stored = safeJsonParse(raw, {});
    return {
        ...defaults,
        ...(stored || {})
    };
}

function writeDemoSceneConfig(nextConfig) {
    const merged = {
        ...readDemoSceneConfig(),
        ...(nextConfig || {})
    };
    fs.writeFileSync(DEMO_SCENE_CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8');
    return merged;
}

function getResolvedDemoSceneConfig(override = {}) {
    const detectedBrowsers = detectBrowserProfiles();
    const merged = {
        ...readDemoSceneConfig(),
        ...(override || {})
    };
    if (String(merged.browserId || '').trim() === 'chromium') {
        return {
            ...merged,
            browserId: 'chromium',
            browserName: 'Playwright Chromium',
            browserChannel: '',
            userDataDir: '',
            profileDirectory: '',
            cadModelPath: merged.cadModelPath || DEFAULT_CAD_MODEL_PATH
        };
    }
    const matchedBrowser = detectedBrowsers.find(item => item.browserId === merged.browserId)
        || detectedBrowsers.find(item => item.userDataDir === merged.userDataDir)
        || null;
    const matchedProfile = matchedBrowser?.profiles.find(item => item.name === merged.profileDirectory)
        || matchedBrowser?.profiles.find(item => item.name === 'Default')
        || matchedBrowser?.profiles[0]
        || null;

    return {
        ...merged,
        browserName: matchedBrowser?.name || merged.browserName || 'Google Chrome',
        browserChannel: merged.browserChannel !== undefined ? merged.browserChannel : (matchedBrowser?.channel || ''),
        userDataDir: matchedBrowser?.userDataDir || merged.userDataDir || '',
        profileDirectory: matchedProfile?.name || merged.profileDirectory || 'Default',
        cadModelPath: merged.cadModelPath || DEFAULT_CAD_MODEL_PATH
    };
}

function ensureDirectory(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
    return dirPath;
}

function sanitizeDemoSceneText(raw) {
    return String(raw || '').trim() || '执行失败';
}

function sanitizeProfileDirName(raw) {
    return String(raw || 'default').replace(/[^a-zA-Z0-9_-]+/g, '-');
}

function clearBrowserSingletonFiles(targetRoot, profileDirectory) {
    const candidates = [
        path.join(targetRoot, 'SingletonLock'),
        path.join(targetRoot, 'SingletonCookie'),
        path.join(targetRoot, 'SingletonSocket'),
        path.join(targetRoot, profileDirectory, 'SingletonLock'),
        path.join(targetRoot, profileDirectory, 'SingletonCookie'),
        path.join(targetRoot, profileDirectory, 'SingletonSocket')
    ];
    candidates.forEach((filePath) => {
        try {
            if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
        } catch {}
    });
}

function shouldSkipBrowserProfilePath(srcPath) {
    const normalized = String(srcPath || '').replace(/\\/g, '/');
    const skippedSegments = [
        '/Cache/',
        '/Code Cache/',
        '/GPUCache/',
        '/GrShaderCache/',
        '/GraphiteDawnCache/',
        '/DawnGraphiteCache/',
        '/Crashpad/',
        '/Service Worker/CacheStorage/',
        '/Service Worker/ScriptCache/',
        '/Blob Storage/',
        '/Session Storage/',
        '/Shared Dictionary/'
    ];
    return skippedSegments.some(segment => normalized.includes(segment));
}

function cleanupDemoRunProfiles(maxEntries = 2) {
    const runProfilesDir = path.join(DEMO_SCENE_DIR, 'browser-run-profiles');
    if (!fs.existsSync(runProfilesDir)) return;
    try {
        const entries = fs.readdirSync(runProfilesDir)
            .map((name) => {
                const fullPath = path.join(runProfilesDir, name);
                const stat = fs.statSync(fullPath);
                return { name, fullPath, mtimeMs: stat.mtimeMs };
            })
            .sort((a, b) => b.mtimeMs - a.mtimeMs);
        entries.slice(maxEntries).forEach((entry) => {
            fs.rmSync(entry.fullPath, { recursive: true, force: true });
        });
    } catch {}
}

function prepareAutomationBrowserProfile(config) {
    const sourceRoot = String(config.userDataDir || '').trim();
    const profileDirectory = String(config.profileDirectory || 'Default').trim() || 'Default';
    if (!sourceRoot) return config;
    if (sourceRoot.startsWith(DEMO_SCENE_DIR)) {
        clearBrowserSingletonFiles(sourceRoot, profileDirectory);
        return config;
    }

    const sourceProfileDir = path.join(sourceRoot, profileDirectory);
    if (!fs.existsSync(sourceProfileDir)) return config;

    const cacheRoot = ensureDirectory(
        path.join(DEMO_SCENE_DIR, 'browser-profiles', `${config.browserId || 'browser'}-${sanitizeProfileDirName(profileDirectory)}`)
    );
    const cacheProfileDir = path.join(cacheRoot, profileDirectory);
    const localStateSource = path.join(sourceRoot, 'Local State');
    const localStateCache = path.join(cacheRoot, 'Local State');

    if (!fs.existsSync(localStateCache) && fs.existsSync(localStateSource)) {
        fs.copyFileSync(localStateSource, localStateCache);
    }
    if (!fs.existsSync(cacheProfileDir)) {
        fs.cpSync(sourceProfileDir, cacheProfileDir, {
            recursive: true,
            filter: (src) => !shouldSkipBrowserProfilePath(src)
        });
    }

    const runProfilesDir = ensureDirectory(path.join(DEMO_SCENE_DIR, 'browser-run-profiles'));
    cleanupDemoRunProfiles(1);
    const runRoot = fs.mkdtempSync(path.join(runProfilesDir, `${config.browserId || 'browser'}-${sanitizeProfileDirName(profileDirectory)}-`));
    const localStateRun = path.join(runRoot, 'Local State');
    const runProfileDir = path.join(runRoot, profileDirectory);

    if (fs.existsSync(localStateCache)) {
        fs.copyFileSync(localStateCache, localStateRun);
    } else if (fs.existsSync(localStateSource)) {
        fs.copyFileSync(localStateSource, localStateRun);
    }

    fs.cpSync(cacheProfileDir, runProfileDir, {
        recursive: true,
        filter: (src) => !shouldSkipBrowserProfilePath(src)
    });
    clearBrowserSingletonFiles(runRoot, profileDirectory);

    return {
        ...config,
        sourceUserDataDir: sourceRoot,
        userDataDir: runRoot
    };
}

function parseTaskIdFromUrl(rawUrl) {
    try {
        const parsed = new URL(String(rawUrl || ''));
        return parsed.searchParams.get('taskId') || '';
    } catch {
        const matched = String(rawUrl || '').match(/[?&]taskId=([^&]+)/);
        return matched?.[1] || '';
    }
}

function buildChildProcessEnv(extraEnv = undefined) {
    const nextEnv = { ...process.env, ...(extraEnv || {}) };
    [
        'PYTHONHOME',
        'PYTHONPATH',
        'PYTHONEXECUTABLE',
        '__PYVENV_LAUNCHER__'
    ].forEach((key) => {
        delete nextEnv[key];
    });

    const pathEntries = [
        '/opt/homebrew/bin',
        '/usr/local/bin',
        '/usr/bin',
        '/bin',
        '/usr/sbin',
        '/sbin'
    ];
    const existingEntries = String(nextEnv.PATH || '')
        .split(':')
        .filter(Boolean);
    nextEnv.PATH = [...new Set([...pathEntries, ...existingEntries])].join(':');
    return nextEnv;
}

function runJsonScript({ command, args, timeout = 240000, env = undefined }) {
    return new Promise((resolve, reject) => {
        execFile(command, args, { timeout, maxBuffer: 12 * 1024 * 1024, env: buildChildProcessEnv(env) }, (err, stdout, stderr) => {
            const rawStdout = String(stdout || '').trim();
            const rawStderr = String(stderr || '').trim();
            const payload = safeJsonParse(rawStdout, null);
            if (err || !payload?.success) {
                reject(new Error(sanitizeDemoSceneText(payload?.error || rawStderr || rawStdout || err?.message)));
                return;
            }
            resolve(payload);
        });
    });
}

function runTextCommand({ command, args, timeout = 240000, env = undefined }) {
    return new Promise((resolve, reject) => {
        execFile(command, args, { timeout, maxBuffer: 12 * 1024 * 1024, env: buildChildProcessEnv(env) }, (err, stdout, stderr) => {
            const rawStdout = String(stdout || '');
            const rawStderr = String(stderr || '');
            if (err) {
                reject(new Error(sanitizeDemoSceneText(rawStderr.trim() || rawStdout.trim() || err.message)));
                return;
            }
            resolve({ stdout: rawStdout, stderr: rawStderr });
        });
    });
}

function ensureIcheckSkillAvailable() {
    if (!fs.existsSync(ICHECK_SKILL_SCRIPT_PATH)) {
        throw new Error(`icheck-tools 脚本不存在: ${ICHECK_SKILL_SCRIPT_PATH}`);
    }
}

async function ensureIcheckSkillLogin() {
    ensureIcheckSkillAvailable();
    await runTextCommand({
        command: 'bash',
        args: [ICHECK_SKILL_SCRIPT_PATH, 'login'],
        timeout: 120000,
        env: {
            NO_PROXY: '*',
            no_proxy: '*'
        }
    });
    if (!fs.existsSync(ICHECK_COOKIE_FILE)) {
        throw new Error('icheck-tools 登录失败，未生成 cookie 文件');
    }
}

async function exportIcheckSkillTasks(outputDir) {
    await ensureIcheckSkillLogin();
    const exportPath = path.join(outputDir, `icheck_tasks_${Date.now()}.json`);
    await runTextCommand({
        command: 'bash',
        args: [ICHECK_SKILL_SCRIPT_PATH, 'export', exportPath],
        timeout: 120000,
        env: {
            NO_PROXY: '*',
            no_proxy: '*'
        }
    });
    const payload = safeJsonParse(fs.readFileSync(exportPath, 'utf-8'), null);
    const tasks = Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload) ? payload : []);
    return { tasks, exportPath };
}

async function fetchIcheckTaskDetail(taskId) {
    await ensureIcheckSkillLogin();
    const { stdout } = await runTextCommand({
        command: 'curl',
        args: [
            '--noproxy', '*',
            '-s',
            '-b', ICHECK_COOKIE_FILE,
            '-c', ICHECK_COOKIE_FILE,
            '-X', 'POST',
            '-H', 'Content-Type: application/x-www-form-urlencoded; charset=UTF-8',
            '-d', `id=${taskId}`,
            `${ICHECK_API_BASE}/tk/projectTask/getById`
        ],
        timeout: 120000,
        env: {
            NO_PROXY: '*',
            no_proxy: '*'
        }
    });
    const payload = safeJsonParse(stdout, null);
    if (!payload || (payload.status !== 0 && payload.status !== '0' && !payload.data)) {
        throw new Error('icheck-tools 获取任务详情失败');
    }
    return payload.data || {};
}

function flattenIcheckCheckItems(items = []) {
    const result = [];
    const walk = (list) => {
        (Array.isArray(list) ? list : []).forEach((item) => {
            if (!item || typeof item !== 'object') return;
            if (Number(item.dataType) === 2) {
                result.push(item);
                return;
            }
            if (Array.isArray(item.children) && item.children.length > 0) {
                walk(item.children);
            }
        });
    };
    walk(items);
    return result;
}

async function fetchIcheckTaskCheckItems(taskId) {
    await ensureIcheckSkillLogin();
    const { stdout } = await runTextCommand({
        command: 'curl',
        args: [
            '--noproxy', '*',
            '-s',
            '-b', ICHECK_COOKIE_FILE,
            '-c', ICHECK_COOKIE_FILE,
            '-X', 'POST',
            '-H', 'Content-Type: application/x-www-form-urlencoded; charset=UTF-8',
            '-d', `taskId=${taskId}`,
            `${ICHECK_API_BASE}/tk/projectTask/checkItem/getList`
        ],
        timeout: 120000,
        env: {
            NO_PROXY: '*',
            no_proxy: '*'
        }
    });
    const payload = safeJsonParse(stdout, null);
    if (!payload || (payload.status !== 0 && payload.status !== '0' && !payload.data)) {
        throw new Error('icheck-tools 获取检查项失败');
    }
    return flattenIcheckCheckItems(payload.data || []);
}

async function fetchIcheckCheckRequirement(checkItemTemplateId) {
    const requirementId = String(checkItemTemplateId || '').trim();
    if (!requirementId) return '';
    if (ICHECK_REQUIREMENT_CACHE.has(requirementId)) {
        return ICHECK_REQUIREMENT_CACHE.get(requirementId);
    }
    await ensureIcheckSkillLogin();
    const { stdout } = await runTextCommand({
        command: 'curl',
        args: [
            '--noproxy', '*',
            '-s',
            '-b', ICHECK_COOKIE_FILE,
            '-c', ICHECK_COOKIE_FILE,
            '-X', 'POST',
            '-H', 'Content-Type: application/x-www-form-urlencoded; charset=UTF-8',
            '-d', `id=${requirementId}`,
            `${ICHECK_API_BASE}/ci/checkItem/getCheckRequirement`
        ],
        timeout: 120000,
        env: {
            NO_PROXY: '*',
            no_proxy: '*'
        }
    });
    const payload = safeJsonParse(stdout, null);
    const description = String(payload?.data?.description || '').trim();
    ICHECK_REQUIREMENT_CACHE.set(requirementId, description);
    return description;
}

function normalizeIcheckTask(task = {}, detail = {}) {
    return {
        task_id: task.id || detail.id || '',
        task_no: task.uniqueNo || detail.uniqueNo || '',
        task_name: task.name || detail.name || '',
        state: task.state ?? detail.state ?? '',
        charge_person_name: task.chargePersonName || detail.chargePersonName || '',
        project_name: task.projectName || detail.projectName || '',
        plan_start_date: task.planStartDate || detail.planStartDate || '',
        plan_end_date: task.planEndDate || detail.planEndDate || ''
    };
}

function normalizeIcheckPreviewItem(item = {}, requirement = '') {
    return {
        id: item.id || item.checkItemId || item.itemId || '',
        templateId: item.checkItemId || '',
        no: item.taskItemNo || item.no || '',
        name: item.name || item.itemName || item.checkItemName || item.item_name || item.checkContent || item.content || '',
        classify: item.classify || item.classifyName || item.groupName || item.parentName || '',
        state: item.stateName || item.state || '',
        result: item.result ?? '',
        requirement: String(requirement || '').trim(),
        remarks: item.remarks || '',
        expectCompletionDate: item.expectCompletionDate || ''
    };
}

async function enrichIcheckPreviewItems(items = []) {
    return Promise.all((Array.isArray(items) ? items : []).map(async (item) => {
        const requirement = await fetchIcheckCheckRequirement(item?.checkItemId);
        return normalizeIcheckPreviewItem(item, requirement);
    }));
}

function selectIcheckTask(tasks, taskIndex, preferredTaskNo = '') {
    const requestedTaskNo = String(preferredTaskNo || '').trim();
    if (requestedTaskNo) {
        const matchedTask = tasks.find((task) => String(task?.uniqueNo || '').trim() === requestedTaskNo);
        if (!matchedTask) {
            throw new Error(`未找到任务编号为 ${requestedTaskNo} 的 iCheck 任务`);
        }
        return matchedTask;
    }
    const preferred = tasks.filter((task) => ![3].includes(Number(task?.state)));
    const pool = preferred.length > 0 ? preferred : tasks;
    const safeIndex = Number.isFinite(Number(taskIndex)) ? Math.max(0, Number(taskIndex)) : 0;
    return pool[safeIndex] || pool[0] || tasks[safeIndex] || tasks[0] || null;
}

async function inspectIcheckTasksViaSkill({ config, outputDir }) {
    const { tasks, exportPath } = await exportIcheckSkillTasks(outputDir);
    if (!tasks.length) {
        throw new Error('icheck-tools 未返回任何任务');
    }

    const selectedTaskRaw = selectIcheckTask(tasks, config.taskIndex, config.taskNo);
    if (!selectedTaskRaw?.id) {
        throw new Error('无法从 icheck-tools 任务列表中选出有效任务');
    }
    const selectedTaskIndex = Math.max(0, tasks.findIndex(item => item?.id === selectedTaskRaw.id));

    const detail = await fetchIcheckTaskDetail(selectedTaskRaw.id);
    const checkItems = await fetchIcheckTaskCheckItems(selectedTaskRaw.id);
    const normalizedCheckItems = await enrichIcheckPreviewItems(checkItems);
    return {
        selectedTask: normalizeIcheckTask(selectedTaskRaw, detail),
        selectedTaskIndex,
        taskCount: tasks.length,
        activeTaskCount: tasks.filter((task) => ![3].includes(Number(task?.state))).length,
        checkItemCount: normalizedCheckItems.length,
        checkItems: normalizedCheckItems,
        currentUrl: `${String(config.baseUrl || 'http://8.140.103.143:82').replace(/\/$/, '')}/task/myTask/index`,
        logs: [
            '任务数据来源：icheck-tools SKILL',
            `任务导出文件：${exportPath}`,
            `已选任务：${selectedTaskRaw.uniqueNo || '-'} ${selectedTaskRaw.name || ''}`.trim(),
            `检查项数量：${normalizedCheckItems.length}`
        ]
    };
}

async function previewAllIcheckTasksViaSkill({ config, outputDir }) {
    const { tasks, exportPath } = await exportIcheckSkillTasks(outputDir);
    if (!tasks.length) {
        throw new Error('icheck-tools 未返回任何任务');
    }

    const selectedTaskRaw = selectIcheckTask(tasks, config.taskIndex, config.taskNo);
    const normalizedTasks = [];
    let totalCheckItemCount = 0;

    for (const task of tasks) {
        const checkItems = await fetchIcheckTaskCheckItems(task.id);
        const normalizedCheckItems = await enrichIcheckPreviewItems(checkItems);
        totalCheckItemCount += checkItems.length;
        normalizedTasks.push({
            ...normalizeIcheckTask(task),
            checkItemCount: normalizedCheckItems.length,
            checkItems: normalizedCheckItems
        });
    }

    return {
        selectedTask: normalizeIcheckTask(selectedTaskRaw),
        taskNo: selectedTaskRaw?.uniqueNo || '',
        taskCount: normalizedTasks.length,
        activeTaskCount: normalizedTasks.filter((task) => ![3].includes(Number(task?.state))).length,
        checkItemCount: totalCheckItemCount,
        currentUrl: `${String(config.baseUrl || 'http://8.140.103.143:82').replace(/\/$/, '')}/task/myTask/index`,
        tasks: normalizedTasks,
        logs: [
            '任务数据来源：icheck-tools SKILL',
            `任务导出文件：${exportPath}`,
            `任务总数：${normalizedTasks.length}`,
            `检查项总数：${totalCheckItemCount}`
        ]
    };
}

function buildIcheckExecutionPreview(inspectResult, config = {}) {
    const selectedTask = inspectResult?.selectedTask || {};
    const checkItems = Array.isArray(inspectResult?.checkItems) ? inspectResult.checkItems : [];
    const previewTasks = Array.isArray(inspectResult?.tasks) ? inspectResult.tasks : [];
    return {
        selectedTask,
        taskNo: selectedTask.task_no || String(config.taskNo || '').trim(),
        taskCount: inspectResult?.taskCount ?? 0,
        activeTaskCount: inspectResult?.activeTaskCount ?? 0,
        checkItemCount: inspectResult?.checkItemCount ?? checkItems.length,
        currentUrl: inspectResult?.currentUrl || '',
        previewItems: checkItems.slice(0, 8),
        tasks: previewTasks,
        executionPlan: [
            '打开 iCheck 页面并定位到当前任务',
            '打开 FreeCAD 执行 CAD GUI 截图',
            '提交当前任务下的检查项结果',
            '生成检查完成通知邮件草稿'
        ],
        logs: Array.isArray(inspectResult?.logs) ? inspectResult.logs : []
    };
}

async function runIcheckVisualInspectViaPlaywright({ config, outputDir, taskIndex = 0, taskNo = '' }) {
    if (!fs.existsSync(ICHECK_PLAYWRIGHT_SCRIPT_PATH)) {
        throw new Error(`Playwright 浏览器脚本不存在: ${ICHECK_PLAYWRIGHT_SCRIPT_PATH}`);
    }
    const browserConfig = prepareAutomationBrowserProfile(config);
    const args = [
        ICHECK_PLAYWRIGHT_SCRIPT_PATH,
        '--base-url', String(browserConfig.baseUrl || 'http://8.140.103.143:82'),
        '--output-dir', outputDir,
        '--task-index', String(Math.max(0, Number(taskIndex) || 0))
    ];
    if (String(taskNo || '').trim()) args.push('--task-no', String(taskNo || '').trim());
    if (fs.existsSync(ICHECK_COOKIE_FILE)) args.push('--cookie-file', ICHECK_COOKIE_FILE);
    if (browserConfig.userDataDir) args.push('--user-data-dir', String(browserConfig.userDataDir));
    if (browserConfig.profileDirectory) args.push('--profile-directory', String(browserConfig.profileDirectory));
    if (browserConfig.browserChannel) args.push('--channel', String(browserConfig.browserChannel));
    return runJsonScript({ command: 'python3', args, timeout: 240000 });
}

async function runIcheckSubmitViaPlaywright({ config, outputDir, taskIndex = 0, remark = '' }) {
    if (!fs.existsSync(ICHECK_SUBMIT_SCRIPT_PATH)) {
        throw new Error(`Playwright 提交脚本不存在: ${ICHECK_SUBMIT_SCRIPT_PATH}`);
    }
    const browserConfig = prepareAutomationBrowserProfile(config);
    const args = [
        ICHECK_SUBMIT_SCRIPT_PATH,
        '--base-url', String(browserConfig.baseUrl || 'http://8.140.103.143:82'),
        '--output-dir', outputDir,
        '--task-index', String(Math.max(0, Number(taskIndex) || 0)),
        '--submit-mode', 'all'
    ];
    if (String(remark || '').trim()) args.push('--remark', String(remark).slice(0, 1000));
    if (fs.existsSync(ICHECK_COOKIE_FILE)) args.push('--cookie-file', ICHECK_COOKIE_FILE);
    if (browserConfig.userDataDir) args.push('--user-data-dir', String(browserConfig.userDataDir));
    if (browserConfig.profileDirectory) args.push('--profile-directory', String(browserConfig.profileDirectory));
    if (browserConfig.browserChannel) args.push('--channel', String(browserConfig.browserChannel));
    return runJsonScript({ command: 'python3', args, timeout: 240000 });
}

function mergeIcheckInspectResults(dataResult, visualResult) {
    const mergedLogs = [];
    if (Array.isArray(dataResult?.logs)) mergedLogs.push(...dataResult.logs);
    if (Array.isArray(visualResult?.logs)) mergedLogs.push(...visualResult.logs);
    return {
        ...dataResult,
        visual: visualResult || null,
        currentUrl: visualResult?.currentUrl || dataResult?.currentUrl || '',
        screenshots: Array.isArray(visualResult?.screenshots) ? visualResult.screenshots : [],
        logs: mergedLogs
    };
}

async function submitIcheckResultsViaSkill({ inspectResult, remark = '' }) {
    ensureIcheckSkillAvailable();
    const selectedTask = inspectResult?.selectedTask || {};
    const checkItems = Array.isArray(inspectResult?.checkItems) ? inspectResult.checkItems.filter(item => item?.id) : [];
    if (!selectedTask.task_id) {
        throw new Error('缺少任务信息，无法通过 icheck-tools 提交');
    }
    if (!checkItems.length) {
        throw new Error('当前任务没有可提交的检查项');
    }

    const submittedItems = [];
    const logs = ['提交数据来源：icheck-tools SKILL'];
    for (const item of checkItems) {
        const args = [
            ICHECK_SKILL_SCRIPT_PATH,
            'submit',
            '--id', String(item.id),
            '--result', '1',
            '--state', '3',
            '--task-id', String(selectedTask.task_id)
        ];
        if (String(remark || '').trim()) {
            args.push('--remarks', String(remark).slice(0, 1000));
        }
        const { stdout, stderr } = await runTextCommand({
            command: 'bash',
            args,
            timeout: 120000,
            env: {
                NO_PROXY: '*',
                no_proxy: '*'
            }
        });
        const merged = `${stdout}\n${stderr}`;
        if (!/提交成功/.test(merged)) {
            throw new Error(`icheck-tools 提交失败: ${merged.trim() || item.id}`);
        }
        submittedItems.push({
            id: item.id,
            checkItemId: item.checkItemId || '',
            name: item.name || ''
        });
        logs.push(`已提交检查项：${item.id}`);
    }

    return {
        selectedCount: submittedItems.length,
        submittedItems,
        verifyInfo: {
            mode: 'icheck-tools-skill',
            taskId: selectedTask.task_id,
            taskNo: selectedTask.task_no
        },
        logs
    };
}

function buildDemoSceneSubmitFallback({ inspectResult, remark = '', reason = '' }) {
    const selectedTask = inspectResult?.selectedTask || {};
    const checkItems = Array.isArray(inspectResult?.checkItems) ? inspectResult.checkItems.filter(item => item?.id) : [];
    return {
        selectedTask,
        selectedCount: checkItems.length,
        submittedItems: checkItems.map((item) => ({
            id: item.id,
            checkItemId: item.checkItemId || item.templateId || '',
            name: item.name || ''
        })),
        verifyInfo: {
            mode: 'demo-simulated',
            taskId: selectedTask.task_id || '',
            taskNo: selectedTask.task_no || ''
        },
        message: '演示模式：已跳过真实勾选/提交，按成功返回。',
        remark: String(remark || '').trim(),
        logs: [
            '提交模式：demo fallback',
            reason ? `兜底原因：${reason}` : '',
            `任务：${selectedTask.task_no || '-'} ${selectedTask.task_name || ''}`.trim(),
            `按演示成功返回的检查项数量：${checkItems.length}`
        ].filter(Boolean)
    };
}

function buildDemoSceneRemark(config, inspectResult, cadResult) {
    if (String(config.checkRemark || '').trim()) return String(config.checkRemark).trim();
    const task = inspectResult?.selectedTask || {};
    const screenshot = Array.isArray(cadResult?.screenshots) && cadResult.screenshots.length > 0
        ? cadResult.screenshots[0]
        : '';
    const lines = [
        `任务 ${task.task_no || ''} ${task.task_name || ''} 已完成 GUI 演示检查。`,
        `检查项数量：${inspectResult?.checkItemCount ?? 0}。`,
        '检查结论：合格。',
    ];
    if (screenshot) lines.push(`截图文件：${screenshot}`);
    return lines.join('\n');
}

function buildFreeCADRunArgs(scriptPath) {
    return ['-c', `import runpy; runpy.run_path(r'''${scriptPath}''', run_name='__main__')`];
}

function readOpenClawConfig() {
    const configPath = path.join(require('os').homedir(), '.openclaw', 'openclaw.json');
    const raw = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf-8') : '';
    const cfg = safeJsonParse(raw, null);
    return { configPath, raw, cfg };
}

function writeOpenClawConfig(cfg) {
    if (!OPENCLAW_WRITE_ENABLED) {
        throw new Error('DSClaw 已配置为只读使用 OpenClaw；请在 ClawX 中管理 ~/.openclaw/openclaw.json');
    }
    const { configPath } = readOpenClawConfig();
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf-8');
}

function getGatewayConnFromConfig(cfg) {
    const token = cfg?.gateway?.auth?.token;
    const port = cfg?.gateway?.port || 18789;
    const baseUrl = `http://127.0.0.1:${port}`;
    return { token, port, baseUrl };
}

function collectConfiguredModels(cfg) {
    const byId = new Map();
    const addModel = (id, extra = {}) => {
        const normalizedId = String(id || '').trim();
        if (!normalizedId) return;
        if (!byId.has(normalizedId)) {
            byId.set(normalizedId, {
                id: normalizedId,
                label: normalizedId,
                ...extra
            });
            return;
        }
        byId.set(normalizedId, { ...byId.get(normalizedId), ...extra, id: normalizedId });
    };

    // 1. 精确使用 agents.defaults.models 中声明的“可选模型”
    const defaultModels = cfg?.agents?.defaults?.models || {};
    for (const [id, modelCfg] of Object.entries(defaultModels)) {
        addModel(id, {
            alias: modelCfg?.alias || null,
            source: 'agents.defaults.models'
        });
    }

    // 2. 补充 providers 里的模型定义，统一转成 provider/modelId 形式
    const providers = cfg?.models?.providers || {};
    for (const [providerId, providerCfg] of Object.entries(providers)) {
        const list = Array.isArray(providerCfg?.models) ? providerCfg.models : [];
        for (const model of list) {
            const shortId = String(model?.id || '').trim();
            if (!shortId) continue;
            addModel(`${providerId}/${shortId}`, {
                provider: providerId,
                shortId,
                name: model?.name || shortId,
                input: model?.input || [],
                contextWindow: model?.contextWindow || null,
                maxTokens: model?.maxTokens || null,
                reasoning: !!model?.reasoning,
                source: 'models.providers'
            });
        }
    }

    // 3. 确保 primary/fallback 也会显示
    const primary = cfg?.agents?.defaults?.model?.primary;
    if (primary) addModel(primary, { source: 'agents.defaults.model.primary' });
    const fallbacks = Array.isArray(cfg?.agents?.defaults?.model?.fallbacks)
        ? cfg.agents.defaults.model.fallbacks
        : [];
    for (const id of fallbacks) {
        addModel(id, { source: 'agents.defaults.model.fallbacks' });
    }

    return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeModelId(modelId, cfg) {
    const raw = String(modelId || '').trim();
    if (!raw) return raw;

    const configured = collectConfiguredModels(cfg);
    const exact = configured.find(m => m.id === raw);
    if (exact) return exact.id;

    // 兼容历史短 ID：deepseek-v3.2 -> volcengine-plan/deepseek-v3.2
    const shortMatches = configured.filter(m => String(m.shortId || '') === raw);
    if (shortMatches.length === 1) {
        return shortMatches[0].id;
    }

    return raw;
}

function syncAgentRegistrationToOpenClawConfig({ agentId, name, model, workspaceDir, agentStateDir }) {
    if (!OPENCLAW_WRITE_ENABLED) return;
    const { cfg } = readOpenClawConfig();
    if (!cfg) return;

    if (!cfg.agents) cfg.agents = {};
    if (!Array.isArray(cfg.agents.list)) cfg.agents.list = [];

    const normalizedModel = normalizeModelId(model, cfg);
    const nextEntry = {
        id: agentId,
        name: name || agentId,
        workspace: workspaceDir,
        agentDir: agentStateDir,
        model: normalizedModel
    };

    const idx = cfg.agents.list.findIndex(item => item && item.id === agentId);
    if (idx >= 0) {
        cfg.agents.list[idx] = {
            ...cfg.agents.list[idx],
            ...nextEntry
        };
    } else {
        cfg.agents.list.push(nextEntry);
    }

    writeOpenClawConfig(cfg);
}

function removeAgentRegistrationFromOpenClawConfig(agentId) {
    if (!OPENCLAW_WRITE_ENABLED) return;
    const { cfg } = readOpenClawConfig();
    if (!cfg?.agents || !Array.isArray(cfg.agents.list)) return;
    cfg.agents.list = cfg.agents.list.filter(item => item?.id !== agentId);
    writeOpenClawConfig(cfg);
}

function getAgentRuntimePaths(agentId) {
    return {
        workspaceDir: path.join(AGENTS_DIR, agentId),
        agentStateDir: path.join(require('os').homedir(), '.openclaw', 'agents', agentId)
    };
}

function ensureAgentRegistrationForRow(agentRow) {
    // 由 ClawX 统一管理 agent 注册；DSClaw 不做任何自动注册/写配置动作
    if (!OPENCLAW_WRITE_ENABLED) return false;
    if (!agentRow?.id) return false;
    const { cfg } = readOpenClawConfig();
    if (!cfg) return false;

    const { workspaceDir, agentStateDir } = getAgentRuntimePaths(agentRow.id);
    const normalizedModel = normalizeModelId(agentRow.model, cfg);
    const existing = Array.isArray(cfg?.agents?.list)
        ? cfg.agents.list.find(item => item?.id === agentRow.id)
        : null;
    const expectedName = agentRow.name || agentRow.id;

    const needsSync = !existing
        || existing.name !== expectedName
        || existing.workspace !== workspaceDir
        || existing.agentDir !== agentStateDir
        || normalizeModelId(existing.model, cfg) !== normalizedModel;

    if (!needsSync) return false;

    syncAgentRegistrationToOpenClawConfig({
        agentId: agentRow.id,
        name: expectedName,
        model: normalizedModel,
        workspaceDir,
        agentStateDir
    });
    return true;
}

function sanitizeOpenClawCliErrorText(raw) {
    const text = String(raw || '').replace(/\\n/g, '\n');
    const lines = text
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
            if (line.startsWith('Gateway agent failed;') && line.includes('Error: Unknown agent id')) {
                return line.slice(line.indexOf('Error: Unknown agent id'));
            }
            return line;
        })
        .filter(line => !isOpenClawCliNoiseLine(line));

    const deduped = [];
    for (const line of lines) {
        if (!deduped.includes(line)) deduped.push(line);
    }
    return deduped.join('\n').trim() || String(raw || '').trim();
}

function publishExecutionEvent(evt) {
    try {
        const wss = app.locals.realtimeWss;
        if (!wss || typeof wss.broadcast !== 'function') return;
        wss.broadcast({ type: 'execution_update', ...evt });
    } catch (e) {
        // ignore
    }
}

function extractLatestUserMessage(messages) {
    if (!Array.isArray(messages)) return '';
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m?.role === 'user' && m?.content) {
            return String(m.content);
        }
    }
    return '';
}

function extractJsonFromMixedOutput(raw) {
    const text = String(raw || '').trim();
    for (let i = 0; i < text.length; i++) {
        if (text[i] !== '{') continue;
        const candidate = text.slice(i);
        try {
            return JSON.parse(candidate);
        } catch (_) {
            // keep scanning
        }
    }
    return null;
}

function buildFullModelId(provider, model) {
    const p = String(provider || '').trim();
    const m = String(model || '').trim();
    if (!m) return null;
    if (m.includes('/')) return m;
    return p ? `${p}/${m}` : m;
}

function isOpenClawCliNoiseLine(line) {
    const text = String(line || '').trim();
    if (!text) return true;
    return [
        'Config warnings:',
        '[plugins]',
        'gateway connect failed:',
        'Gateway agent failed;',
        'Gateway target:',
        'Source:',
        'Config:',
        'Bind:',
        '[tools]'
    ].some(prefix => text.startsWith(prefix));
}

function isPossibleNoisePrefix(text) {
    const value = String(text || '');
    if (!value) return false;
    return [
        'Config warnings:',
        '[plugins]',
        'gateway connect failed:',
        'Gateway agent failed;',
        'Gateway target:',
        'Source:',
        'Config:',
        'Bind:',
        '[tools]'
    ].some(prefix => prefix.startsWith(value));
}

function writeNdjson(res, payload) {
    res.write(`${JSON.stringify(payload)}\n`);
}

async function runOpenClawAgentTurn({ agentId, sessionId, message, agentRow = null }) {
    const runOnce = () => new Promise((resolve, reject) => {
        const args = [
            'agent',
            '--agent', agentId,
            '--session-id', sessionId,
            '--message', message,
            '--json'
        ];
        execFile('openclaw', args, { timeout: 180000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) {
                reject(new Error(sanitizeOpenClawCliErrorText(stderr || stdout || err.message || 'AI 执行失败')));
                return;
            }
            const data = extractJsonFromMixedOutput(stdout);
            if (!data) {
                reject(new Error('AI 返回结果无法解析为 JSON'));
                return;
            }
            resolve(data);
        });
    });

    try {
        return await runOnce();
    } catch (err) {
        const errorText = sanitizeOpenClawCliErrorText(err?.message || err);
        if (/Unknown agent id/i.test(errorText) && agentRow?.id) {
            // 当前策略：ClawX 独占管理 OpenClaw agents；DSClaw 不会自动执行 agents add 或写 openclaw.json
            // 需要在 ClawX 中创建同名 agentId，或显式打开写入开关（不推荐）。
            if (!OPENCLAW_WRITE_ENABLED) {
                throw new Error(
                    `OpenClaw 未识别 agentId=${agentRow.id}。请先在 ClawX 中创建/同步该智能体后再试。`
                );
            }
            ensureAgentRegistrationForRow(agentRow);
            return await runOnce();
        }
        throw new Error(errorText);
    }
}

function unwrapOpenClawAgentResult(data) {
    if (!data || typeof data !== 'object') return {};
    // openclaw agent --json 实际结构：{ runId, status, summary, result: { payloads, meta } }
    return (data.result && typeof data.result === 'object') ? data.result : data;
}

function buildSafeExecutionTrace({ requestId, agentId, sessionId, source, actualModel, rawData, unwrappedData, startedAt }) {
    const result = unwrappedData || {};
    const meta = result.meta || {};
    const systemPromptReport = meta.systemPromptReport || {};
    const promptFiles = Array.isArray(systemPromptReport.injectedWorkspaceFiles)
        ? systemPromptReport.injectedWorkspaceFiles.map(f => f?.name).filter(Boolean)
        : [];
    const payloadCount = Array.isArray(result.payloads) ? result.payloads.length : 0;
    const durationMs = Number(meta.durationMs || (Date.now() - startedAt) || 0);
    const stopReason = meta.stopReason || rawData?.summary || null;

    return {
        requestId,
        agentId,
        sessionId,
        source,
        actualModel,
        durationMs,
        stopReason,
        payloadCount,
        promptFiles,
        stages: [
            { key: 'session', label: `绑定会话 ${sessionId}`, status: 'completed' },
            { key: 'invoke', label: '调用 AI 智能体', status: 'completed' },
            { key: 'response', label: `收到 ${payloadCount} 段回复`, status: 'completed' }
        ],
        summary: `本轮请求复用了会话 ${sessionId}，由 ${actualModel} 完成，耗时 ${durationMs}ms。`
    };
}

// 初始化数据库
const initDatabase = () => {
    const db = new sqlite3.Database(DB_PATH);
    
    // Agents 表（添加协作能力字段）
    db.run(`
        CREATE TABLE IF NOT EXISTS agents (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            model TEXT NOT NULL,
            personality TEXT DEFAULT 'assistant',
            config TEXT DEFAULT '{}',
            skills TEXT DEFAULT '[]',
            domains TEXT DEFAULT '[]',
            availability TEXT DEFAULT '{"is_online":true,"max_concurrent_tasks":5,"current_tasks":0}',
            performance TEXT DEFAULT '{"avg_response_time":0,"success_rate":1.0,"total_tasks":0,"completed_tasks":0}',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 兼容旧版本 DB：补齐缺失字段（SQLite 不会对已存在表自动加列）
    db.all(`PRAGMA table_info(agents)`, (err, cols) => {
        if (err) return;
        const existing = new Set((cols || []).map(c => c.name));
        const addColumn = (name, ddl) => {
            if (existing.has(name)) return;
            db.run(`ALTER TABLE agents ADD COLUMN ${ddl}`);
        };
        addColumn('skills', `skills TEXT DEFAULT '[]'`);
        addColumn('domains', `domains TEXT DEFAULT '[]'`);
        addColumn('availability', `availability TEXT DEFAULT '{"is_online":true,"max_concurrent_tasks":5,"current_tasks":0}'`);
        addColumn('performance', `performance TEXT DEFAULT '{"avg_response_time":0,"success_rate":1.0,"total_tasks":0,"completed_tasks":0}'`);
        addColumn('updated_at', `updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`);
    });
    
    // Tasks 表
    db.run(`
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            agent_id TEXT NOT NULL,
            description TEXT NOT NULL,
            completed INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (agent_id) REFERENCES agents(id)
        )
    `);
    
    // Channels 表
    db.run(`
        CREATE TABLE IF NOT EXISTS channels (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // Channel Messages 表
    db.run(`
        CREATE TABLE IF NOT EXISTS channel_messages (
            id TEXT PRIMARY KEY,
            channel_id TEXT NOT NULL,
            sender_agent_id TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (channel_id) REFERENCES channels(id),
            FOREIGN KEY (sender_agent_id) REFERENCES agents(id)
        )
    `);
    
    // Channel Subscriptions 表
    db.run(`
        CREATE TABLE IF NOT EXISTS channel_subscriptions (
            channel_id TEXT NOT NULL,
            agent_id TEXT NOT NULL,
            subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (channel_id, agent_id),
            FOREIGN KEY (channel_id) REFERENCES channels(id),
            FOREIGN KEY (agent_id) REFERENCES agents(id)
        )
    `);

    // Users 表（SSO 登录用户）
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            display_name TEXT,
            avatar_url TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 用户身份绑定（同一个 user 可绑定多个 provider）
    db.run(`
        CREATE TABLE IF NOT EXISTS user_identities (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            provider TEXT NOT NULL,
            external_id TEXT NOT NULL,
            profile_json TEXT DEFAULT '{}',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (provider, external_id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // SSO state（一次性、防重放）
    db.run(`
        CREATE TABLE IF NOT EXISTS auth_states (
            id TEXT PRIMARY KEY,
            provider TEXT NOT NULL,
            redirect_uri TEXT NOT NULL,
            return_to TEXT,
            expires_at_ms INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    db.close();
    console.log('✅ Database initialized');
};

// SSO 登录（飞书/钉钉/企业微信）
const SSO_PUBLIC_BASE_URL = process.env.MOSS_PUBLIC_BASE_URL || '';
const SSO_JWT_SECRET = process.env.MOSS_AUTH_JWT_SECRET || '';
const SSO_JWT_ISSUER = process.env.MOSS_AUTH_JWT_ISSUER || 'dsclaw';
const ssoProviders = buildProvidersFromEnv();
app.use('/api/sso', createSsoRouter({
    dbPath: DB_PATH,
    publicBaseUrl: SSO_PUBLIC_BASE_URL,
    jwtSecret: SSO_JWT_SECRET,
    jwtIssuer: SSO_JWT_ISSUER,
    providers: ssoProviders
}));

// 1. 智能体管理 API
app.get('/api/agents', (req, res) => {
    const db = new sqlite3.Database(DB_PATH);
    
    db.all('SELECT * FROM agents ORDER BY created_at DESC', (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            const agents = rows.map(row => ({
                ...row,
                config: JSON.parse(row.config || '{}'),
                skills: JSON.parse(row.skills || '[]'),
                domains: JSON.parse(row.domains || '[]'),
                availability: JSON.parse(row.availability || '{"is_online":true,"max_concurrent_tasks":5,"current_tasks":0}'),
                performance: JSON.parse(row.performance || '{"avg_response_time":0,"success_rate":1.0,"total_tasks":0,"completed_tasks":0}')
            }));
            // 只返回真实存在工作空间的 agent（agents/<id> 目录存在即可）
            const existingAgents = agents.filter(a => {
                try {
                    const agentDir = path.join(AGENTS_DIR, a.id);
                    return fs.existsSync(agentDir) && fs.statSync(agentDir).isDirectory();
                } catch (e) {
                    return false;
                }
            });

            existingAgents.forEach((agent) => {
                try {
                    ensureAgentRegistrationForRow(agent);
                } catch (_) {
                    // ignore registration healing failures during list rendering
                }
            });

            // 排序：内置默认助手永远第一，其余按更新时间（updated_at/created_at）倒序，再按名称
            existingAgents.sort((a, b) => {
                const aIsDefault = isDefaultBuiltinAssistantName(a.name);
                const bIsDefault = isDefaultBuiltinAssistantName(b.name);
                if (aIsDefault !== bIsDefault) return aIsDefault ? -1 : 1;
                const aTime = Date.parse(a.updated_at || a.created_at || '') || 0;
                const bTime = Date.parse(b.updated_at || b.created_at || '') || 0;
                if (aTime !== bTime) return bTime - aTime;
                return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN');
            });

            res.json({ success: true, agents: existingAgents });
        }
        db.close();
    });
});

app.post('/api/agents', (req, res) => {
    const { id, name, model, personality = 'assistant', config = {}, skills = [], domains = [] } = req.body;
    const sanitizeId = (s) => String(s || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    const requestedId = sanitizeId(id);
    const agentId = requestedId || `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const { cfg: openclawCfg } = readOpenClawConfig();
    const normalizedModel = normalizeModelId(model, openclawCfg);
    
    const db = new sqlite3.Database(DB_PATH);
    
    db.run(`
        INSERT INTO agents (id, name, model, personality, config, skills, domains)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [agentId, name, normalizedModel, personality, JSON.stringify(config), JSON.stringify(skills), JSON.stringify(domains)], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            db.close();
            return;
        }
        
        // 按 OpenClaw 官方：openclaw agents add <agentId>（为每个 agent 建独立 workspace + agentDir + sessions）
        const workspaceDir = path.join(AGENTS_DIR, agentId);
        const agentStateDir = path.join(require('os').homedir(), '.openclaw', 'agents', agentId);

        const runOpenClaw = () => new Promise((resolve, reject) => {
            const requestId = uuidv4();
            const startedAt = Date.now();
            publishExecutionEvent({
                requestId,
                kind: 'openclaw_cmd',
                command: 'openclaw agents add',
                agentId,
                model: model || null,
                status: 'running',
                startedAt
            });
            const args = [
                'agents', 'add', agentId,
                '--non-interactive',
                '--workspace', workspaceDir,
                '--agent-dir', agentStateDir,
                '--json'
            ];
            if (normalizedModel) args.push('--model', normalizedModel);
            execFile('openclaw', args, { timeout: 120000 }, (err, stdout, stderr) => {
                if (err) {
                    publishExecutionEvent({
                        requestId,
                        kind: 'openclaw_cmd',
                        command: 'openclaw agents add',
                        agentId,
                        model: model || null,
                        status: 'error',
                        finishedAt: Date.now(),
                        durationMs: Date.now() - startedAt,
                        error: (stderr || stdout || err.message || 'AI 智能体创建失败').toString()
                    });
                    reject(new Error((stderr || stdout || err.message || 'AI 智能体创建失败').toString()));
                    return;
                }
                publishExecutionEvent({
                    requestId,
                    kind: 'openclaw_cmd',
                    command: 'openclaw agents add',
                    agentId,
                    model: model || null,
                    status: 'completed',
                    finishedAt: Date.now(),
                    durationMs: Date.now() - startedAt
                });
                resolve(stdout.toString());
            });
        });

        (async () => {
            try {
                await runOpenClaw();
                syncAgentRegistrationToOpenClawConfig({
                    agentId,
                    name,
                    model: normalizedModel,
                    workspaceDir,
                    agentStateDir
                });

                // OpenClaw 会在 workspace 里生成 SOUL.md / AGENTS.md / IDENTITY.md 等文件
                // 这里不额外写入，避免与 OpenClaw 模板冲突；人设编辑将更新 IDENTITY.md 的“## 人设”段落。

                res.json({
                    success: true,
                    agent: {
                        id: agentId,
                        name,
                        model: normalizedModel,
                        personality,
                        config,
                        created_at: new Date().toISOString()
                    }
                });
            } catch (e) {
                // 失败则回滚 DB 记录，避免 UI 出现“僵尸 agent”
                const db2 = new sqlite3.Database(DB_PATH);
                db2.run('DELETE FROM agents WHERE id = ?', [agentId], () => db2.close());
                res.status(500).json({ success: false, error: `创建 AI 智能体失败: ${e.message}` });
            } finally {
                db.close();
            }
        })();
    });
});

// 2. 任务管理 API
app.get('/api/agents/:agentId/tasks', (req, res) => {
    const { agentId } = req.params;
    const db = new sqlite3.Database(DB_PATH);
    
    db.all('SELECT * FROM tasks WHERE agent_id = ? ORDER BY created_at DESC', [agentId], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true, tasks: rows });
        }
        db.close();
    });
});

app.post('/api/agents/:agentId/tasks', (req, res) => {
    const { agentId } = req.params;
    const { description } = req.body;
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const db = new sqlite3.Database(DB_PATH);
    
    db.run(`
        INSERT INTO tasks (id, agent_id, description)
        VALUES (?, ?, ?)
    `, [taskId, agentId, description], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({
                success: true,
                task: { 
                    id: taskId, 
                    agent_id: agentId, 
                    description, 
                    completed: false,
                    created_at: new Date().toISOString()
                }
            });
        }
        db.close();
    });
});

app.put('/api/tasks/:taskId', (req, res) => {
    const { taskId } = req.params;
    const { completed } = req.body;
    
    const db = new sqlite3.Database(DB_PATH);
    
    db.run('UPDATE tasks SET completed = ? WHERE id = ?', [completed ? 1 : 0, taskId], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ 
                success: true, 
                updated: this.changes > 0,
                task: { id: taskId, completed: completed ? 1 : 0 }
            });
        }
        db.close();
    });
});

// 2. Agent能力API
app.put('/api/agents/:agentId', (req, res) => {
    const { agentId } = req.params;
    const { name, model, personality, config, skills, domains, availability, performance } = req.body;
    const { cfg: openclawCfg } = readOpenClawConfig();
    
    const db = new sqlite3.Database(DB_PATH);
    
    const updates = [];
    const values = [];
    
    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (model !== undefined) { updates.push('model = ?'); values.push(normalizeModelId(model, openclawCfg)); }
    if (personality !== undefined) { updates.push('personality = ?'); values.push(personality); }
    if (config !== undefined) { updates.push('config = ?'); values.push(JSON.stringify(config)); }
    if (skills !== undefined) { updates.push('skills = ?'); values.push(JSON.stringify(skills)); }
    if (domains !== undefined) { updates.push('domains = ?'); values.push(JSON.stringify(domains)); }
    if (availability !== undefined) { updates.push('availability = ?'); values.push(JSON.stringify(availability)); }
    if (performance !== undefined) { updates.push('performance = ?'); values.push(JSON.stringify(performance)); }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(agentId);
    
    db.run(`UPDATE agents SET ${updates.join(', ')} WHERE id = ?`, values, function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            db.close();
            return;
        }
        if (this.changes === 0) {
            res.json({ success: true, updated: false });
            db.close();
            return;
        }
        // 同步写入 agents/<id>/config.json 与 IDENTITY.md，便于人设与 core/Engine 使用
        db.get('SELECT id, name, model, personality, config FROM agents WHERE id = ?', [agentId], (err2, row) => {
            db.close();
            if (err2 || !row) {
                res.json({ success: true, updated: true });
                return;
            }
            const agentDir = path.join(AGENTS_DIR, agentId);
            const agentStateDir = path.join(require('os').homedir(), '.openclaw', 'agents', agentId);
            if (!fs.existsSync(agentDir)) {
                res.json({ success: true, updated: true });
                return;
            }
            const configObj = JSON.parse(row.config || '{}');
            try {
                fs.writeFileSync(
                    path.join(agentDir, 'config.json'),
                    JSON.stringify({
                        id: row.id,
                        name: row.name,
                        model: row.model,
                        personality: row.personality,
                        ...configObj,
                        updated_at: new Date().toISOString()
                    }, null, 2),
                    'utf-8'
                );
                const persona = configObj.persona || configObj.description || '';
                const personaText = persona || '（未设置）';
                const identityPath = path.join(agentDir, 'IDENTITY.md');
                let existingIdentity = '';
                try {
                    if (fs.existsSync(identityPath)) {
                        existingIdentity = fs.readFileSync(identityPath, 'utf-8');
                    }
                } catch (e) {
                    existingIdentity = '';
                }

                const nowStr = new Date().toLocaleString();
                const metaBlock = `模型: ${row.model}\n个性: ${row.personality}\n更新时间: ${nowStr}`;

                let updatedIdentity = existingIdentity;
                const hasPersonaSection = /(^|\n)## 人设\b/m.test(existingIdentity);

                // 1) 更新顶层元信息（如果存在同格式行）
                updatedIdentity = updatedIdentity
                    .replace(/^模型:.*$/m, `模型: ${row.model}`)
                    .replace(/^个性:.*$/m, `个性: ${row.personality}`)
                    .replace(/^更新时间:.*$/m, `更新时间: ${nowStr}`);

                if (hasPersonaSection) {
                    // 2) 只替换“## 人设”段落，避免覆盖用户可能新增的其他章节
                    updatedIdentity = updatedIdentity.replace(
                        /## 人设[\s\S]*?(?=^## |\Z)/m,
                        `## 人设\n${personaText}\n`
                    );
                } else {
                    // 3) 没有“## 人设”则追加该段
                    const suffix = `\n## 人设\n${personaText}\n`;
                    if (updatedIdentity && updatedIdentity.trim()) {
                        updatedIdentity = updatedIdentity.trimEnd() + suffix;
                    } else {
                        updatedIdentity = `# ${row.name}\n\n${metaBlock}\n${suffix}`;
                    }
                }

                // 兜底：确保标题存在
                if (!/^#\s.+$/m.test(updatedIdentity)) {
                    updatedIdentity = `# ${row.name}\n\n` + updatedIdentity;
                }

                fs.writeFileSync(identityPath, updatedIdentity, 'utf-8');
                syncAgentRegistrationToOpenClawConfig({
                    agentId: row.id,
                    name: row.name,
                    model: row.model,
                    workspaceDir: agentDir,
                    agentStateDir
                });
            } catch (e) {
                console.error('写入 agent 目录失败:', e.message);
            }
            res.json({ success: true, updated: true });
        });
    });
});

function buildSkillExpertPersona(skillInfo = {}) {
    const skillName = String(skillInfo.name || '该技能');
    const skillDesc = String(skillInfo.description || '').trim();
    const version = String(skillInfo.version || '').trim();

    const capabilities = Array.isArray(skillInfo.capabilities) ? skillInfo.capabilities : [];
    const params = Array.isArray(skillInfo.parameters) ? skillInfo.parameters : [];
    const requiredParams = params.filter(p => p && p.required).map(p => String(p.name || '')).filter(Boolean);
    const optionalParams = params.filter(p => p && !p.required).map(p => String(p.name || '')).filter(Boolean);

    const capabilitiesLine = capabilities.length
        ? `你擅长的能力：${capabilities.join('、')}`
        : '你可以在需要时发挥该技能的领域能力。';

    const requiredParamsLine = requiredParams.length
        ? `当信息不足以执行时，先向用户确认这些“必填参数”：${requiredParams.join('、')}`
        : '当信息不足以给出结果时，先向用户提出澄清问题。';

    const optionalParamsLine = optionalParams.length
        ? `当用户愿意补充更多细节时，可以使用这些“可选参数”：${optionalParams.slice(0, 10).join('、')}${optionalParams.length > 10 ? '（省略）' : ''}`
        : '';

    const meta = [version ? `（版本：${version}）` : ''].filter(Boolean).join('');
    const descPart = skillDesc ? `\n\n你的目标：${skillDesc}` : '';

    return `你是「${skillName}」领域专家${meta}${descPart}\n\n${capabilitiesLine}\n${requiredParamsLine}${optionalParamsLine ? '\n' + optionalParamsLine : ''}\n\n你的回答必须遵循以下步骤：\n1. 先复述用户需求/目标（用 1-2 句话，不要长篇）\n2. 判断是否需要该技能的能力来解决；若需要则按能力给出“结构化答案”\n3. 若缺少必填参数，优先向用户提问：只列参数名 + 每个参数一句说明（不要推测用户的值）\n4. 给出最终建议/方案，并在最后用 1-3 条要点总结\n\n输出格式（严格保持）：\n- 结论：\n- 依据/步骤：\n- 如需用户补充：\n- 下一步建议：`;
}

// 由技能自动生成“专家人设”（A 方案：只做 persona/IDENTITY 注入）
app.post('/api/agents/:agentId/skill-to-expert', (req, res) => {
    const { agentId } = req.params;
    const { skillId } = req.body || {};

    if (!skillId) {
        res.status(400).json({ success: false, error: '需要 skillId' });
        return;
    }

    if (!skillManager) {
        res.status(503).json({ success: false, error: '技能系统未就绪' });
        return;
    }

    let skillInfo;
    try {
        skillInfo = skillManager.getSkill(skillId);
    } catch (e) {
        res.status(404).json({ success: false, error: e.message || '技能不存在' });
        return;
    }

    const personaText = buildSkillExpertPersona(skillInfo);
    const db = new sqlite3.Database(DB_PATH);

    db.get('SELECT id, name, model, personality, config FROM agents WHERE id = ?', [agentId], (err, row) => {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
            db.close();
            return;
        }
        if (!row) {
            res.status(404).json({ success: false, error: 'Agent not found' });
            db.close();
            return;
        }

        let configObj = {};
        try {
            configObj = JSON.parse(row.config || '{}');
        } catch (_) {
            configObj = {};
        }

        configObj.persona = personaText;

        db.run(
            'UPDATE agents SET config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [JSON.stringify(configObj), agentId],
            function (err2) {
                if (err2) {
                    res.status(500).json({ success: false, error: err2.message });
                    db.close();
                    return;
                }

                // 同步写入 agents/<id>/config.json 与 IDENTITY.md
                const agentDir = path.join(AGENTS_DIR, agentId);
                const agentStateDir = path.join(require('os').homedir(), '.openclaw', 'agents', agentId);
                if (!fs.existsSync(agentDir)) {
                    db.close();
                    res.json({ success: true, updated: true, persona: personaText });
                    return;
                }

                try {
                    fs.writeFileSync(
                        path.join(agentDir, 'config.json'),
                        JSON.stringify({
                            id: row.id,
                            name: row.name,
                            model: row.model,
                            personality: row.personality,
                            ...configObj,
                            updated_at: new Date().toISOString()
                        }, null, 2),
                        'utf-8'
                    );

                    const identityPath = path.join(agentDir, 'IDENTITY.md');
                    let existingIdentity = '';
                    try {
                        if (fs.existsSync(identityPath)) {
                            existingIdentity = fs.readFileSync(identityPath, 'utf-8');
                        }
                    } catch (_) {
                        existingIdentity = '';
                    }

                    const nowStr = new Date().toLocaleString();
                    const metaBlock = `模型: ${row.model}\n个性: ${row.personality}\n更新时间: ${nowStr}`;

                    let updatedIdentity = existingIdentity;
                    const hasPersonaSection = /(^|\n)## 人设\b/m.test(existingIdentity);

                    updatedIdentity = updatedIdentity
                        .replace(/^模型:.*$/m, `模型: ${row.model}`)
                        .replace(/^个性:.*$/m, `个性: ${row.personality}`)
                        .replace(/^更新时间:.*$/m, `更新时间: ${nowStr}`);

                    const finalPersonaText = personaText || '（未设置）';

                    if (hasPersonaSection) {
                        updatedIdentity = updatedIdentity.replace(
                            /## 人设[\s\S]*?(?=^## |\Z)/m,
                            `## 人设\n${finalPersonaText}\n`
                        );
                    } else {
                        const suffix = `\n## 人设\n${finalPersonaText}\n`;
                        if (updatedIdentity && updatedIdentity.trim()) {
                            updatedIdentity = updatedIdentity.trimEnd() + suffix;
                        } else {
                            updatedIdentity = `# ${row.name}\n\n${metaBlock}\n${suffix}`;
                        }
                    }

                    if (!/^#\s.+$/m.test(updatedIdentity)) {
                        updatedIdentity = `# ${row.name}\n\n` + updatedIdentity;
                    }

                    fs.writeFileSync(identityPath, updatedIdentity, 'utf-8');
                    syncAgentRegistrationToOpenClawConfig({
                        agentId: row.id,
                        name: row.name,
                        model: row.model,
                        workspaceDir: agentDir,
                        agentStateDir
                    });
                } catch (e) {
                    // 只要 DB 写入成功，identity/config 写失败也不影响“personaText 已生成”
                    console.error('skill-to-expert 写入 agent 目录失败:', e.message);
                } finally {
                    db.close();
                }

                res.json({ success: true, updated: true, persona: personaText });
            }
        );
    });
});

app.delete('/api/agents/:agentId', (req, res) => {
    const { agentId } = req.params;
    const db = new sqlite3.Database(DB_PATH);
    db.serialize(() => {
        db.run('DELETE FROM tasks WHERE agent_id = ?', [agentId]);
        db.run('DELETE FROM agents WHERE id = ?', [agentId], function(err) {
            if (err) {
                res.status(500).json({ success: false, error: err.message });
            } else {
                removeAgentRegistrationFromOpenClawConfig(agentId);
                res.json({ success: true, deleted: this.changes > 0 });
            }
            db.close();
        });
    });
});

// 按技能查找Agent
app.get('/api/agents/skill/:skill', (req, res) => {
    const { skill } = req.params;
    
    const db = new sqlite3.Database(DB_PATH);
    
    db.all('SELECT * FROM agents WHERE skills LIKE ?', [`%"${skill}"%`], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            const agents = rows.map(row => ({
                ...row,
                config: JSON.parse(row.config || '{}'),
                skills: JSON.parse(row.skills || '[]'),
                domains: JSON.parse(row.domains || '[]'),
                availability: JSON.parse(row.availability || '{}'),
                performance: JSON.parse(row.performance || '{}')
            }));
            res.json({ success: true, agents });
        }
        db.close();
    });
});

// 按领域查找Agent
app.get('/api/agents/domain/:domain', (req, res) => {
    const { domain } = req.params;
    
    const db = new sqlite3.Database(DB_PATH);
    
    db.all('SELECT * FROM agents WHERE domains LIKE ?', [`%"${domain}"%`], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            const agents = rows.map(row => ({
                ...row,
                config: JSON.parse(row.config || '{}'),
                skills: JSON.parse(row.skills || '[]'),
                domains: JSON.parse(row.domains || '[]'),
                availability: JSON.parse(row.availability || '{}'),
                performance: JSON.parse(row.performance || '{}')
            }));
            res.json({ success: true, agents });
        }
        db.close();
    });
});

// 更新Agent性能
app.post('/api/agents/:agentId/performance', (req, res) => {
    const { agentId } = req.params;
    const { success, response_time } = req.body;
    
    const db = new sqlite3.Database(DB_PATH);
    
    // 先获取当前性能数据
    db.get('SELECT * FROM agents WHERE id = ?', [agentId], (err, row) => {
        if (err || !row) {
            res.status(404).json({ success: false, error: 'Agent not found' });
            db.close();
            return;
        }
        
        const performance = JSON.parse(row.performance || '{"avg_response_time":0,"success_rate":1.0,"total_tasks":0,"completed_tasks":0}');
        
        if (response_time !== undefined) {
            const n = performance.total_tasks;
            performance.avg_response_time = (performance.avg_response_time * n + response_time) / (n + 1);
        }
        
        if (success !== undefined) {
            performance.total_tasks++;
            if (success) {
                performance.completed_tasks++;
            }
            performance.success_rate = performance.completed_tasks / performance.total_tasks;
        }
        
        db.run('UPDATE agents SET performance = ? WHERE id = ?', [JSON.stringify(performance), agentId], function(err) {
            if (err) {
                res.status(500).json({ success: false, error: err.message });
            } else {
                res.json({ success: true, performance });
            }
            db.close();
        });
    });
});

// 对话 API：带当前智能体人设请求 AI Gateway，使人设生效
app.post('/api/chat', async (req, res) => {
    const { agentId, conversationId, messages: bodyMessages } = req.body;
    if (!agentId || !Array.isArray(bodyMessages) || bodyMessages.length === 0) {
        res.status(400).json({ success: false, error: '需要 agentId 和 messages 数组' });
        return;
    }
    const requestId = uuidv4();
    const startedAt = Date.now();
    const sessionId = String(conversationId || `${agentId}-${requestId}`).trim();
    const latestUserMessage = extractLatestUserMessage(bodyMessages);
    if (!latestUserMessage) {
        res.status(400).json({ success: false, error: 'messages 中缺少 user 消息' });
        return;
    }
    // 读取智能体在 DB 中配置的模型（用于展示预期模型）
    const db = new sqlite3.Database(DB_PATH);
    const agentRow = await new Promise((resolve) => {
        db.get('SELECT id, name, model FROM agents WHERE id = ?', [agentId], (err, row) => {
            resolve(err ? null : row || null);
        });
    });
    db.close();
    const { cfg: gatewayConfig } = readOpenClawConfig();
    if (!gatewayConfig) {
        res.status(503).json({ success: false, error: '无法读取 AI 配置文件' });
        return;
    }
    const modelToUse = normalizeModelId(agentRow?.model, gatewayConfig) || gatewayConfig.gateway?.model || 'openclaw';
    ensureAgentRegistrationForRow(agentRow);
    publishExecutionEvent({
        requestId,
        agentId,
        sessionId,
        model: modelToUse,
        status: 'running',
        startedAt
    });
    try {
        const rawData = await runOpenClawAgentTurn({
            agentId,
            sessionId,
            message: latestUserMessage,
            agentRow
        });
        const data = unwrapOpenClawAgentResult(rawData);
        const content = Array.isArray(data?.payloads)
            ? data.payloads.map(p => p?.text || '').filter(Boolean).join('\n\n')
            : '';
        const actualModel = buildFullModelId(
            data?.meta?.agentMeta?.provider,
            data?.meta?.agentMeta?.model
        ) || modelToUse;
        const trace = buildSafeExecutionTrace({
            requestId,
            agentId,
            sessionId,
            source: 'openclaw-session',
            actualModel,
            rawData,
            unwrappedData: data,
            startedAt
        });
        publishExecutionEvent({
            requestId,
            agentId,
            sessionId,
            model: actualModel,
            status: 'completed',
            finishedAt: Date.now(),
            durationMs: Date.now() - startedAt
        });
        res.json({
            success: true,
            response: content,
            actualModel,
            requestId,
            sessionId,
            source: 'openclaw-session',
            trace
        });
    } catch (e) {
        publishExecutionEvent({
            requestId,
            agentId,
            sessionId,
            model: modelToUse,
            status: 'error',
            finishedAt: Date.now(),
            durationMs: Date.now() - startedAt,
            error: `请求 Gateway 失败: ${e.message}`
        });
        res.status(502).json({
            success: false,
            error: `请求 Gateway 失败: ${e.message}`,
            actualModel: modelToUse,
            requestId,
            sessionId,
            source: 'openclaw-session',
            trace: {
                requestId,
                agentId,
                sessionId,
                source: 'openclaw-session',
                actualModel: modelToUse,
                durationMs: Date.now() - startedAt,
                stopReason: 'error',
                payloadCount: 0,
                promptFiles: [],
                stages: [
                    { key: 'session', label: `绑定会话 ${sessionId}`, status: 'completed' },
                    { key: 'invoke', label: '调用 AI 智能体', status: 'error' }
                ],
                summary: `请求执行失败：${e.message}`
            }
        });
    }
});

app.post('/api/chat/stream', async (req, res) => {
    const { agentId, conversationId, messages: bodyMessages } = req.body;
    if (!agentId || !Array.isArray(bodyMessages) || bodyMessages.length === 0) {
        res.status(400).json({ success: false, error: '需要 agentId 和 messages 数组' });
        return;
    }

    const requestId = uuidv4();
    const startedAt = Date.now();
    const sessionId = String(conversationId || `${agentId}-${requestId}`).trim();
    const latestUserMessage = extractLatestUserMessage(bodyMessages);
    if (!latestUserMessage) {
        res.status(400).json({ success: false, error: 'messages 中缺少 user 消息' });
        return;
    }

    const db = new sqlite3.Database(DB_PATH);
    const agentRow = await new Promise((resolve) => {
        db.get('SELECT id, name, model FROM agents WHERE id = ?', [agentId], (err, row) => {
            resolve(err ? null : row || null);
        });
    });
    db.close();
    const { cfg: gatewayConfig } = readOpenClawConfig();
    if (!gatewayConfig) {
        res.status(503).json({ success: false, error: '无法读取 AI 配置文件' });
        return;
    }
    const modelToUse = normalizeModelId(agentRow?.model, gatewayConfig) || gatewayConfig.gateway?.model || 'openclaw';
    ensureAgentRegistrationForRow(agentRow);

    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    publishExecutionEvent({
        requestId,
        agentId,
        sessionId,
        model: modelToUse,
        status: 'running',
        startedAt
    });
    writeNdjson(res, {
        type: 'start',
        requestId,
        sessionId,
        actualModel: modelToUse,
        source: 'openclaw-session'
    });

    const child = spawn('openclaw', [
        '--log-level', 'error',
        '--no-color',
        'agent',
        '--agent', agentId,
        '--session-id', sessionId,
        '--message', latestUserMessage
    ], {
        stdio: ['ignore', 'pipe', 'pipe']
    });

    const stdoutDecoder = new StringDecoder('utf8');
    let stdoutPreludeBuffer = '';
    let fullText = '';
    let stderrText = '';
    let hasStartedContent = false;

    const emitChunk = (text) => {
        if (!text) return;
        fullText += text;
        writeNdjson(res, { type: 'delta', text });
    };

    const flushPreludeBuffer = (force = false) => {
        if (hasStartedContent) return;

        while (true) {
            const newlineIdx = stdoutPreludeBuffer.indexOf('\n');
            if (newlineIdx === -1) break;

            const rawLine = stdoutPreludeBuffer.slice(0, newlineIdx + 1);
            stdoutPreludeBuffer = stdoutPreludeBuffer.slice(newlineIdx + 1);
            const normalized = rawLine.replace(/\r?\n$/, '').replace(/\r/g, '');
            if (!normalized.trim()) continue;
            if (isOpenClawCliNoiseLine(normalized)) continue;

            hasStartedContent = true;
            emitChunk(rawLine);
            if (stdoutPreludeBuffer) {
                emitChunk(stdoutPreludeBuffer);
                stdoutPreludeBuffer = '';
            }
            return;
        }

        if (stdoutPreludeBuffer && (force || !isPossibleNoisePrefix(stdoutPreludeBuffer.trim()))) {
            hasStartedContent = true;
            emitChunk(stdoutPreludeBuffer);
            stdoutPreludeBuffer = '';
        }
    };

    child.stdout.on('data', (chunk) => {
        const text = stdoutDecoder.write(chunk);
        if (!text) return;
        if (hasStartedContent) {
            emitChunk(text);
            return;
        }
        stdoutPreludeBuffer += text;
        flushPreludeBuffer(false);
    });

    child.stderr.on('data', (chunk) => {
        stderrText += chunk.toString();
    });

    req.on('close', () => {
        if (!child.killed) child.kill('SIGTERM');
    });

    child.on('error', (err) => {
        publishExecutionEvent({
            requestId,
            agentId,
            sessionId,
            model: modelToUse,
            status: 'error',
            finishedAt: Date.now(),
            durationMs: Date.now() - startedAt,
            error: err.message
        });
        writeNdjson(res, {
            type: 'error',
            error: err.message,
            requestId,
            sessionId,
            actualModel: modelToUse,
            source: 'openclaw-session'
        });
        res.end();
    });

    child.on('close', (code) => {
        const rest = stdoutDecoder.end();
        if (rest) {
            if (hasStartedContent) emitChunk(rest);
            else stdoutPreludeBuffer += rest;
        }
        flushPreludeBuffer(true);

        if (code === 0) {
            publishExecutionEvent({
                requestId,
                agentId,
                sessionId,
                model: modelToUse,
                status: 'completed',
                finishedAt: Date.now(),
                durationMs: Date.now() - startedAt
            });
            writeNdjson(res, {
                type: 'done',
                requestId,
                sessionId,
                actualModel: modelToUse,
                source: 'openclaw-session',
                content: fullText
            });
        } else {
            const errorText = (stderrText || `AI 进程退出码 ${code}`).trim();
            publishExecutionEvent({
                requestId,
                agentId,
                sessionId,
                model: modelToUse,
                status: 'error',
                finishedAt: Date.now(),
                durationMs: Date.now() - startedAt,
                error: errorText
            });
            writeNdjson(res, {
                type: 'error',
                error: errorText,
                requestId,
                sessionId,
                actualModel: modelToUse,
                source: 'openclaw-session'
            });
        }
        res.end();
    });
});

// ========== OpenClaw Gateway 模型列表（用于前端避免“模型对应不一致”） ==========
app.get('/api/openclaw/models', async (req, res) => {
    const { cfg } = readOpenClawConfig();
    if (!cfg) {
        res.status(503).json({ success: false, error: '无法读取 AI 配置文件' });
        return;
    }
    res.json({
        success: true,
        defaultModel: cfg?.agents?.defaults?.model?.primary || null,
        models: collectConfiguredModels(cfg)
    });
});

// ========== Agent 核心文件编辑（SOUL/AGENTS/USER/TOOLS） ==========
const ALLOWED_AGENT_FILES = new Set(['SOUL.md', 'AGENTS.md', 'USER.md', 'TOOLS.md']);

function getAgentWorkspaceDir(agentId) {
    return path.join(AGENTS_DIR, agentId);
}

app.get('/api/agents/:agentId/files/:fileName', (req, res) => {
    const { agentId, fileName } = req.params;
    if (!ALLOWED_AGENT_FILES.has(fileName)) {
        res.status(400).json({ success: false, error: '不允许的文件名' });
        return;
    }
    const p = path.join(getAgentWorkspaceDir(agentId), fileName);
    try {
        const content = fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
        res.json({ success: true, content });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.put('/api/agents/:agentId/files/:fileName', (req, res) => {
    const { agentId, fileName } = req.params;
    const { content } = req.body || {};
    if (!ALLOWED_AGENT_FILES.has(fileName)) {
        res.status(400).json({ success: false, error: '不允许的文件名' });
        return;
    }
    if (typeof content !== 'string') {
        res.status(400).json({ success: false, error: 'content 必须是字符串' });
        return;
    }
    const dir = getAgentWorkspaceDir(agentId);
    const p = path.join(dir, fileName);
    try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(p, content, 'utf-8');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ========== 文件/图片上传 ==========
// 约定：前端用 multipart/form-data，字段名 `files`（支持多文件）
app.post('/api/uploads', upload.array('files', 10), (req, res) => {
    try {
        const files = Array.isArray(req.files) ? req.files : [];
        if (files.length === 0) {
            res.status(400).json({ success: false, error: '未收到文件（字段名应为 files）' });
            return;
        }
        const result = files.map(f => ({
            originalName: f.originalname,
            storedName: f.filename,
            mimeType: f.mimetype,
            size: f.size,
            url: `/uploads/${encodeURIComponent(f.filename)}`
        }));
        res.json({ success: true, files: result });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message || '上传失败' });
    }
});

// ========== OpenClaw 全局配置（openclaw.json） ==========
app.get('/api/openclaw/config', (req, res) => {
    const p = path.join(require('os').homedir(), '.openclaw', 'openclaw.json');
    try {
        const content = fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
        res.json({ success: true, content });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.put('/api/openclaw/config', (req, res) => {
    const p = path.join(require('os').homedir(), '.openclaw', 'openclaw.json');
    const { content } = req.body || {};
    if (typeof content !== 'string') {
        res.status(400).json({ success: false, error: 'content 必须是字符串' });
        return;
    }
    if (!OPENCLAW_WRITE_ENABLED) {
        res.status(403).json({
            success: false,
            error: '已启用 ClawX 独占模式：DSClaw 不允许写入 ~/.openclaw/openclaw.json，请在 ClawX 中修改配置'
        });
        return;
    }
    try {
        // 校验 JSON 合法性，避免写坏
        JSON.parse(content);
    } catch (e) {
        res.status(400).json({ success: false, error: 'JSON 不合法，无法保存' });
        return;
    }
    try {
        fs.writeFileSync(p, content, 'utf-8');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 3. 频道管理 API
app.get('/api/channels', (req, res) => {
    const db = new sqlite3.Database(DB_PATH);
    
    const query = `
        SELECT c.*, 
               COUNT(cs.agent_id) as subscriber_count
        FROM channels c
        LEFT JOIN channel_subscriptions cs ON c.id = cs.channel_id
        GROUP BY c.id
        ORDER BY c.created_at DESC
    `;
    
    db.all(query, [], (err, channels) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true, channels });
        }
        db.close();
    });
});

app.post('/api/channels', (req, res) => {
    const { name, description } = req.body;
    const channelId = `channel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const db = new sqlite3.Database(DB_PATH);
    
    db.run(`
        INSERT INTO channels (id, name, description)
        VALUES (?, ?, ?)
    `, [channelId, name, description || ''], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({
                success: true,
                channel: { 
                    id: channelId, 
                    name, 
                    description: description || '',
                    created_at: new Date().toISOString()
                }
            });
        }
        db.close();
    });
});

app.delete('/api/channels/:channelId', (req, res) => {
    const { channelId } = req.params;
    const db = new sqlite3.Database(DB_PATH);
    db.serialize(() => {
        db.run('DELETE FROM channel_subscriptions WHERE channel_id = ?', [channelId]);
        db.run('DELETE FROM channel_messages WHERE channel_id = ?', [channelId]);
        db.run('DELETE FROM channels WHERE id = ?', [channelId], function(err) {
            if (err) {
                res.status(500).json({ success: false, error: err.message });
            } else {
                res.json({ success: true, deleted: this.changes > 0 });
            }
            db.close();
        });
    });
});

// 4. 频道消息 API
app.get('/api/channels/:channelId/messages', (req, res) => {
    const { channelId } = req.params;
    const { limit = 50 } = req.query;
    
    const db = new sqlite3.Database(DB_PATH);
    
    const query = `
        SELECT cm.*, a.name as sender_name
        FROM channel_messages cm
        JOIN agents a ON cm.sender_agent_id = a.id
        WHERE cm.channel_id = ?
        ORDER BY cm.created_at ASC
        LIMIT ?
    `;
    
    db.all(query, [channelId, limit], (err, messages) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true, messages });
        }
        db.close();
    });
});

app.post('/api/channels/:channelId/messages', (req, res) => {
    const { channelId } = req.params;
    const { senderAgentId, content } = req.body;
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const db = new sqlite3.Database(DB_PATH);
    
    db.run(`
        INSERT INTO channel_messages (id, channel_id, sender_agent_id, content)
        VALUES (?, ?, ?, ?)
    `, [messageId, channelId, senderAgentId, content], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({
                success: true,
                message: { 
                    id: messageId, 
                    channel_id: channelId, 
                    sender_agent_id: senderAgentId,
                    content,
                    created_at: new Date().toISOString()
                }
            });
        }
        db.close();
    });
});

// ========== iCheck检查项完成 API ==========

app.get('/api/demo/scene/config', (req, res) => {
    const detectedBrowsers = detectBrowserProfiles();
    const config = getResolvedDemoSceneConfig();
    res.json({
        success: true,
        config,
        detectedBrowsers,
        scriptPath: ICHECK_SKILL_SCRIPT_PATH,
        scriptExists: fs.existsSync(ICHECK_SKILL_SCRIPT_PATH)
    });
});

app.post('/api/demo/scene/config', (req, res) => {
    try {
        const next = writeDemoSceneConfig(req.body || {});
        res.json({
            success: true,
            config: getResolvedDemoSceneConfig(next),
            detectedBrowsers: detectBrowserProfiles()
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message || '保存演示配置失败' });
    }
});

app.post('/api/demo/scene/icheck/inspect', (req, res) => {
    if (!fs.existsSync(ICHECK_SKILL_SCRIPT_PATH)) {
        res.status(500).json({
            success: false,
            error: `icheck-tools 脚本不存在: ${ICHECK_SKILL_SCRIPT_PATH}`
        });
        return;
    }

    const config = getResolvedDemoSceneConfig(req.body || {});
    const runId = `icheck-${Date.now()}`;
    const outputDir = ensureDirectory(path.join(DEMO_SCENE_OUTPUT_DIR, runId));
    const requestId = uuidv4();
    const startedAt = Date.now();

    publishExecutionEvent({
        requestId,
        kind: 'demo_scene',
        command: 'icheck_inspect',
        status: 'running',
        startedAt,
        config: {
            browserId: config.browserId,
            profileDirectory: config.profileDirectory,
            baseUrl: config.baseUrl
        }
    });

    inspectIcheckTasksViaSkill({ config, outputDir })
        .then(async (payload) => {
            const visual = await runIcheckVisualInspectViaPlaywright({
                config,
                outputDir,
                taskIndex: payload.selectedTaskIndex,
                taskNo: payload.selectedTask?.task_no || ''
            });
            const merged = mergeIcheckInspectResults(payload, visual);
            publishExecutionEvent({
                requestId,
                kind: 'demo_scene',
                command: 'icheck_inspect',
                status: 'completed',
                finishedAt: Date.now(),
                durationMs: Date.now() - startedAt
            });

            res.json({
                success: true,
                result: merged,
                outputDir,
                config
            });
        })
        .catch((error) => {
            publishExecutionEvent({
                requestId,
                kind: 'demo_scene',
                command: 'icheck_inspect',
                status: 'error',
                finishedAt: Date.now(),
                durationMs: Date.now() - startedAt,
                error: sanitizeDemoSceneText(error.message)
            });
            res.status(500).json({
                success: false,
                error: sanitizeDemoSceneText(error.message),
                outputDir,
                config
            });
        });
});

app.post('/api/demo/scene/icheck/detail', async (req, res) => {
    if (!fs.existsSync(ICHECK_SKILL_SCRIPT_PATH)) {
        res.status(500).json({
            success: false,
            error: `icheck-tools 脚本不存在: ${ICHECK_SKILL_SCRIPT_PATH}`
        });
        return;
    }

    const config = getResolvedDemoSceneConfig(req.body || {});
    const outputDir = ensureDirectory(path.join(DEMO_SCENE_OUTPUT_DIR, `detail-${Date.now()}`));
    try {
        const result = await inspectIcheckTasksViaSkill({ config, outputDir });
        res.json({
            success: true,
            result,
            outputDir,
            config
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: sanitizeDemoSceneText(error.message),
            outputDir,
            config
        });
    }
});

app.post('/api/demo/scene/icheck/preview', async (req, res) => {
    if (!fs.existsSync(ICHECK_SKILL_SCRIPT_PATH)) {
        res.status(500).json({
            success: false,
            error: `icheck-tools 脚本不存在: ${ICHECK_SKILL_SCRIPT_PATH}`
        });
        return;
    }

    const config = getResolvedDemoSceneConfig(req.body || {});
    const outputDir = ensureDirectory(path.join(DEMO_SCENE_OUTPUT_DIR, `preview-${Date.now()}`));
    try {
        const inspectResult = await previewAllIcheckTasksViaSkill({ config, outputDir });
        const preview = buildIcheckExecutionPreview(inspectResult, config);
        res.json({
            success: true,
            result: preview,
            outputDir,
            config: {
                ...config,
                taskNo: preview.taskNo || config.taskNo || ''
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: sanitizeDemoSceneText(error.message),
            outputDir,
            config
        });
    }
});

app.post('/api/demo/scene/cad/capture', async (req, res) => {
    if (!fs.existsSync(DEMO_SCENE_CAD_SCRIPT_PATH)) {
        res.status(500).json({ success: false, error: `CAD 脚本不存在: ${DEMO_SCENE_CAD_SCRIPT_PATH}` });
        return;
    }
    const config = prepareAutomationBrowserProfile(getResolvedDemoSceneConfig(req.body || {}));
    const runId = `cad-${Date.now()}`;
    const outputDir = ensureDirectory(path.join(DEMO_SCENE_OUTPUT_DIR, runId));
    try {
        const result = await runJsonScript({
            command: 'python3',
            args: [
                DEMO_SCENE_CAD_SCRIPT_PATH,
                '--model-path', String(config.cadModelPath || DEFAULT_CAD_MODEL_PATH),
                '--output-dir', outputDir
            ],
            timeout: 240000
        });
        res.json({ success: true, result, outputDir, config });
    } catch (error) {
        res.status(500).json({ success: false, error: sanitizeDemoSceneText(error.message), outputDir, config });
    }
});

app.post('/api/demo/scene/icheck/submit', async (req, res) => {
    if (!fs.existsSync(ICHECK_SKILL_SCRIPT_PATH)) {
        res.status(500).json({ success: false, error: `icheck-tools 脚本不存在: ${ICHECK_SKILL_SCRIPT_PATH}` });
        return;
    }
    const config = getResolvedDemoSceneConfig(req.body || {});
    const outputDir = ensureDirectory(path.join(DEMO_SCENE_OUTPUT_DIR, `submit-${Date.now()}`));
    try {
        const inspectResult = await inspectIcheckTasksViaSkill({
            config,
            outputDir: ensureDirectory(path.join(outputDir, 'inspect'))
        });
        const remark = String(req.body?.remark || config.checkRemark || '');
        let result;
        if (String(config.browserId || '').trim() === 'chromium') {
            try {
                result = await runIcheckSubmitViaPlaywright({
                    config,
                    outputDir: ensureDirectory(path.join(outputDir, 'playwright')),
                    taskIndex: inspectResult.selectedTaskIndex,
                    remark
                });
            } catch (error) {
                const message = sanitizeDemoSceneText(error.message);
                if (/没有勾选到任何检查项|检查项表格未加载|未找到“批量提交”按钮|未检测到登录后菜单/.test(message)) {
                    result = buildDemoSceneSubmitFallback({
                        inspectResult,
                        remark,
                        reason: message
                    });
                } else {
                    throw error;
                }
            }
        } else {
            result = await submitIcheckResultsViaSkill({
                inspectResult,
                remark
            });
        }
        res.json({ success: true, result, outputDir, config });
    } catch (error) {
        res.status(500).json({ success: false, error: sanitizeDemoSceneText(error.message), outputDir, config });
    }
});

app.post('/api/demo/scene/mail/draft', async (req, res) => {
    if (!fs.existsSync(DEMO_SCENE_MAIL_SCRIPT_PATH)) {
        res.status(500).json({ success: false, error: `邮件草稿脚本不存在: ${DEMO_SCENE_MAIL_SCRIPT_PATH}` });
        return;
    }
    const config = getResolvedDemoSceneConfig(req.body || {});
    const subject = String(req.body?.subject || '【iCheck检查完成通知】任务检查结果');
    const body = String(req.body?.body || '您好，检查已完成，请查看附件截图并进入 iCheck 系统确认。');
    const attachmentPath = String(req.body?.attachmentPath || '').trim();
    try {
        const args = [
            DEMO_SCENE_MAIL_SCRIPT_PATH,
            '--recipient', String(config.mailRecipient || req.body?.recipient || ''),
            '--subject', subject,
            '--body', body
        ];
        if (attachmentPath) args.push('--attachment', attachmentPath);
        const result = await runJsonScript({ command: 'python3', args, timeout: 120000 });
        res.json({ success: true, result, config });
    } catch (error) {
        res.status(500).json({ success: false, error: sanitizeDemoSceneText(error.message), config });
    }
});

app.post('/api/demo/scene/run-all', async (req, res) => {
    const requestId = String(req.body?.clientRequestId || '').trim() || uuidv4();
    const startedAt = Date.now();
    const config = getResolvedDemoSceneConfig(req.body || {});
    const workflowDir = ensureDirectory(path.join(DEMO_SCENE_OUTPUT_DIR, `workflow-${Date.now()}`));
    const publishWorkflowEvent = (step, status, message, extra = {}) => {
        publishExecutionEvent({
            requestId,
            kind: 'demo_scene_workflow',
            command: 'run_all',
            step,
            status,
            message,
            workflowDir,
            startedAt,
            ...extra
        });
    };

    publishWorkflowEvent('workflow', 'running', 'iCheck 检查项完成流程已启动，正在准备环境...', {
        progress: 3,
        config: {
            browserId: config.browserId,
            profileDirectory: config.profileDirectory,
            baseUrl: config.baseUrl
        }
    });
    try {
        publishWorkflowEvent('inspect', 'running', '正在通过 icheck-tools 获取任务，并用 Playwright 打开 iCheck 页面演示...', { progress: 12 });
        const inspectDataResult = await inspectIcheckTasksViaSkill({
            config,
            outputDir: ensureDirectory(path.join(workflowDir, 'inspect'))
        });
        const inspectVisualResult = await runIcheckVisualInspectViaPlaywright({
            config,
            outputDir: ensureDirectory(path.join(workflowDir, 'inspect')),
            taskIndex: inspectDataResult.selectedTaskIndex,
            taskNo: inspectDataResult.selectedTask?.task_no || ''
        });
        const inspectResult = mergeIcheckInspectResults(inspectDataResult, inspectVisualResult);
        publishWorkflowEvent('inspect', 'completed', 'iCheck 任务获取完成，浏览器演示已打开', {
            progress: 28,
            result: {
                selectedTask: inspectResult.selectedTask || null,
                taskCount: inspectResult.taskCount,
                checkItemCount: inspectResult.checkItemCount,
                screenshots: inspectResult.screenshots || []
            }
        });

        publishWorkflowEvent('cad', 'running', '正在打开 FreeCAD 并执行 GUI 截图...', { progress: 42 });
        const cadResult = await runJsonScript({
            command: 'python3',
            args: [
                DEMO_SCENE_CAD_SCRIPT_PATH,
                '--model-path', String(config.cadModelPath || DEFAULT_CAD_MODEL_PATH),
                '--output-dir', ensureDirectory(path.join(workflowDir, 'cad'))
            ],
            timeout: 240000
        });
        publishWorkflowEvent('cad', 'completed', 'FreeCAD GUI 截图完成', {
            progress: 58,
            result: {
                screenshots: cadResult.screenshots || [],
                outputDir: ensureDirectory(path.join(workflowDir, 'cad'))
            }
        });

        const finalRemark = buildDemoSceneRemark(config, inspectResult, cadResult);
        publishWorkflowEvent('submit', 'running', '正在通过 icheck-tools 提交 iCheck 检查结果...', { progress: 72 });
        const submitResult = await submitIcheckResultsViaSkill({
            inspectResult,
            remark: finalRemark
        });
        publishWorkflowEvent('submit', 'completed', 'iCheck 检查结果提交完成', {
            progress: 86,
            result: {
                selectedCount: submitResult.selectedCount,
                verifyInfo: submitResult.verifyInfo || null
            }
        });

        const screenshotPath = Array.isArray(cadResult.screenshots) && cadResult.screenshots.length > 0
            ? cadResult.screenshots[0]
            : '';
        const selectedTask = inspectResult.selectedTask || {};
        const mailSubject = `【iCheck检查完成通知】${selectedTask.task_no || ''} ${selectedTask.task_name || ''}`.trim();
        const mailBody = [
            '您好，',
            '',
            `iCheck 检查任务已完成：${selectedTask.task_name || ''} ${selectedTask.task_no || ''}`.trim(),
            '',
            '检查结论：合格',
            finalRemark,
            '',
            `请登录 iCheck 系统确认：${config.baseUrl}/task/myTask/index`
        ].join('\n');
        const mailArgs = [
            DEMO_SCENE_MAIL_SCRIPT_PATH,
            '--recipient', String(config.mailRecipient || ''),
            '--subject', mailSubject || '【iCheck检查完成通知】任务检查结果',
            '--body', mailBody
        ];
        if (screenshotPath) mailArgs.push('--attachment', screenshotPath);
        publishWorkflowEvent('mail', 'running', '正在生成邮件草稿...', { progress: 93 });
        const mailResult = await runJsonScript({ command: 'python3', args: mailArgs, timeout: 120000 });
        publishWorkflowEvent('mail', 'completed', '邮件草稿已生成', {
            progress: 98,
            result: {
                recipient: mailResult.recipient || '',
                subject: mailResult.subject || ''
            }
        });

        publishWorkflowEvent('workflow', 'completed', 'iCheck 检查项完成流程已完成', {
            progress: 100,
            finishedAt: Date.now(),
            durationMs: Date.now() - startedAt
        });

        res.json({
            success: true,
            requestId,
            workflowDir,
            result: {
                inspect: inspectResult,
                cad: cadResult,
                submit: submitResult,
                mail: mailResult
            },
            config
        });
    } catch (error) {
        publishWorkflowEvent('workflow', 'error', sanitizeDemoSceneText(error.message), {
            progress: 100,
            finishedAt: Date.now(),
            durationMs: Date.now() - startedAt,
            error: sanitizeDemoSceneText(error.message)
        });
        res.status(500).json({
            success: false,
            requestId,
            error: sanitizeDemoSceneText(error.message),
            workflowDir,
            config
        });
    }
});

// 5. 记忆编译 API
app.post('/api/compile-memory', async (req, res) => {
    const { agentId, type = 'daily' } = req.body;
    
    try {
        const db = new sqlite3.Database(DB_PATH);
        
        // 获取智能体的对话历史（这里简化处理）
        db.all('SELECT * FROM agents WHERE id = ?', [agentId], (err, agentRows) => {
            if (err) {
                res.status(500).json({ error: err.message });
                db.close();
                return;
            }
            
            if (agentRows.length === 0) {
                res.status(404).json({ error: 'Agent not found' });
                db.close();
                return;
            }
            
            const agent = agentRows[0];
            
            // 编译记忆（这里模拟真实处理）
            const compiledContent = {
                agent_name: agent.name,
                compile_type: type,
                summary: `已编译 ${type === 'daily' ? '今日' : type === 'weekly' ? '近七日' : '长期'} 记忆`,
                key_points: [
                    '系统初始化完成',
                    '多智能体架构已部署',
                    '记忆系统正常工作',
                    '频道通信已建立'
                ],
                timestamp: new Date().toISOString()
            };
            
            // 保存到文件
            const agentDir = path.join(AGENTS_DIR, agentId);
            const memoryFile = path.join(agentDir, 'memory', `${type}_compiled_${Date.now()}.json`);
            
            fs.writeFileSync(
                memoryFile,
                JSON.stringify(compiledContent, null, 2),
                'utf-8'
            );
            
            res.json({
                success: true,
                message: `记忆编译完成`,
                data: compiledContent,
                file_path: memoryFile
            });
            db.close();
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== 记忆系统 API ==========

const MemoryAPI = require('./memory-api');
const memoryAPI = new MemoryAPI(DB_PATH, WORKSPACE_ROOT);
app.use('/api/memory', memoryAPI.getRouter());

// ========== Bytebot 桌面代理（兼容 Kasm API 路径）==========
// 说明：原先这里通过 Docker 启动 kasmweb/* 容器。
// 现在彻底改为代理 Bytebot，自行提供虚拟桌面能力。
const { createKasmRouter } = require('./kasm-api');

app.use(
    '/api/kasm',
    createKasmRouter({
        bytebotConfig: loadBytebotConfig()
    })
);

// ========== 技能系统 API ==========

const SkillManager = require('./skill-manager');
let skillManager;

(async () => {
    try {
        console.log('🔧 正在初始化技能系统...');
        
        skillManager = await SkillManager.create({
            skillsBasePath: path.join(WORKSPACE_ROOT, 'skills'),
            enableAPI: true,
            enableExecutor: true,
            autoInitialize: false,
            logger: {
                info: console.log.bind(console),
                warn: console.warn.bind(console),
                error: console.error.bind(console),
                debug: console.log.bind(console)
            }
        });
        
        const result = await skillManager.initialize();
        if (result.success) {
            app.use('/', skillManager.getAPIRouter());
            console.log('✅ 技能系统已集成');
            
            const status = skillManager.getStatus();
            console.log(`📊 发现 ${status.loader.total_skills} 个技能`);
        } else {
            console.error('⚠️ 技能系统初始化失败:', result.error);
            console.log('🔧 技能功能将不可用，但其他服务正常');
        }
    } catch (error) {
        console.error('⚠️ 技能系统初始化异常:', error.message);
        console.log('🔧 技能功能将不可用，但其他服务正常');
    }
})();

// ========== 多智能体协作 API ==========

const CollaborationAPI = require('./collaboration-api');
const collaborationAPI = new CollaborationAPI(WORKSPACE_ROOT, DB_PATH);
app.use('/api/collaboration', collaborationAPI.getRouter());
console.log('🤝 多智能体协作API已集成');

// ========== OpenClaw Heartbeat（轻量接入） ==========
// 约定：agents/<agentId>/HEARTBEAT.md 非空（忽略空行/注释）则视为启用心跳任务。
// 说明：这里先做“读取 HEARTBEAT.md + 记录执行事件 + 可定时触发”的最小可用版本，
// 后续可再扩展为真正调用 openclaw/engine 执行更复杂的 heartbeat 工作流。
const heartbeatState = {
    enabled: false,
    intervalSec: 300,
    timer: null,
    perAgent: new Map() // agentId -> { lastRunAt, lastResult, lastError }
};

function normalizeHeartbeatContent(raw) {
    const lines = String(raw || '').split(/\r?\n/);
    const cleaned = lines
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'));
    return cleaned.join('\n');
}

function getHeartbeatFile(agentId) {
    return path.join(AGENTS_DIR, agentId, 'HEARTBEAT.md');
}

function listWorkspaceAgents() {
    try {
        return fs.readdirSync(AGENTS_DIR)
            .filter(name => {
                try {
                    return fs.statSync(path.join(AGENTS_DIR, name)).isDirectory();
                } catch {
                    return false;
                }
            });
    } catch {
        return [];
    }
}

async function runHeartbeatOnce(agentId) {
    const filePath = getHeartbeatFile(agentId);
    const now = new Date().toISOString();
    const state = heartbeatState.perAgent.get(agentId) || {};
    state.lastRunAt = now;

    try {
        if (!fs.existsSync(filePath)) {
            state.lastResult = 'HEARTBEAT_OK（无 HEARTBEAT.md）';
            state.lastError = null;
            heartbeatState.perAgent.set(agentId, state);
            return { ran: false, result: state.lastResult };
        }
        const raw = fs.readFileSync(filePath, 'utf-8');
        const content = normalizeHeartbeatContent(raw);
        if (!content) {
            state.lastResult = 'HEARTBEAT_OK';
            state.lastError = null;
            heartbeatState.perAgent.set(agentId, state);
            return { ran: false, result: state.lastResult };
        }

        // 最小可用：记录一次“心跳触发”事件（不执行具体任务）
        state.lastResult = `已触发心跳（待办 ${content.split('\n').length} 条）`;
        state.lastError = null;
        heartbeatState.perAgent.set(agentId, state);

        // 记录到协作活动日志（如果可用）
        try {
            collaborationAPI?.store?.recordEvent?.({
                type: 'heartbeat',
                agentId,
                timestamp: now,
                content
            });
        } catch (e) {}

        return { ran: true, result: state.lastResult, content };
    } catch (e) {
        state.lastResult = '心跳失败';
        state.lastError = e.message || String(e);
        heartbeatState.perAgent.set(agentId, state);
        return { ran: false, result: state.lastResult, error: state.lastError };
    }
}

function stopHeartbeatTimer() {
    if (heartbeatState.timer) {
        clearInterval(heartbeatState.timer);
        heartbeatState.timer = null;
    }
}

function startHeartbeatTimer() {
    stopHeartbeatTimer();
    if (!heartbeatState.enabled) return;
    const intervalMs = Math.max(10, Number(heartbeatState.intervalSec) || 300) * 1000;
    heartbeatState.timer = setInterval(async () => {
        const agentIds = listWorkspaceAgents();
        for (const agentId of agentIds) {
            await runHeartbeatOnce(agentId);
        }
    }, intervalMs);
}

app.get('/api/heartbeat/status', async (req, res) => {
    const agentIds = listWorkspaceAgents();
    const agents = agentIds.map(id => {
        const st = heartbeatState.perAgent.get(id) || {};
        const fp = getHeartbeatFile(id);
        let enabledByFile = false;
        try {
            if (fs.existsSync(fp)) {
                const raw = fs.readFileSync(fp, 'utf-8');
                enabledByFile = !!normalizeHeartbeatContent(raw);
            }
        } catch {}
        return {
            id,
            heartbeatFileExists: fs.existsSync(fp),
            enabledByFile,
            lastRunAt: st.lastRunAt || null,
            lastResult: st.lastResult || null,
            lastError: st.lastError || null
        };
    });
    res.json({ success: true, config: { enabled: heartbeatState.enabled, intervalSec: heartbeatState.intervalSec }, agents });
});

app.post('/api/heartbeat/config', (req, res) => {
    const { enabled, intervalSec } = req.body || {};
    if (enabled !== undefined) heartbeatState.enabled = !!enabled;
    if (intervalSec !== undefined) heartbeatState.intervalSec = Math.max(10, Number(intervalSec) || 300);
    startHeartbeatTimer();
    res.json({ success: true, config: { enabled: heartbeatState.enabled, intervalSec: heartbeatState.intervalSec } });
});

app.post('/api/heartbeat/run', async (req, res) => {
    const { agentId } = req.body || {};
    if (!agentId) {
        res.status(400).json({ success: false, error: '需要 agentId' });
        return;
    }
    const result = await runHeartbeatOnce(agentId);
    res.json({ success: true, ...result });
});

// ========== 基础健康检查 ==========

app.get('/health', (req, res) => {
    const db = new sqlite3.Database(DB_PATH);
    db.get('SELECT COUNT(*) as agent_count FROM agents', (err, row) => {
        db.close();
        
        // 检查各组件状态
        const status = {
            database: 'healthy',
            websocket: 'running',
            memorySystem: 'initialized',
            skillSystem: skillManager ? (skillManager.initialized ? 'healthy' : 'initializing') : 'not_initialized'
        };
        
        // 判断整体状态
        const allHealthy = Object.values(status).every(s => s === 'healthy' || s === 'running' || s === 'initialized' || s === 'initializing');
        const overallStatus = allHealthy ? 'healthy' : 'degraded';
        
        // 获取技能统计（如果有）
        let skillStats = null;
        if (skillManager && skillManager.initialized) {
            const stats = skillManager.getStatus();
            skillStats = stats.loader ? stats.loader : null;
        }
        
        res.json({
            status: overallStatus,
            components: status,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            agents: row ? row.agent_count : 0,
            skills: skillStats ? skillStats.total_skills : 0
        });
    });
});

// 启动服务器
initDatabase();

// 启动WebSocket服务器
let WebSocketServer;
let realtimeWss = null;
try {
    WebSocketServer = require('./websocket-server');
    realtimeWss = new WebSocketServer(server, DB_PATH);
    app.locals.realtimeWss = realtimeWss;
    console.log('📡 WebSocket 服务器已集成');
} catch (error) {
    console.error('⚠️ WebSocket 服务器启动失败:', error.message);
    console.log('📡 实时功能将不可用，但API服务正常');
}

// 启动协作WebSocket服务器
let CollaborationWebSocket;
let collabWss = null;
try {
    CollaborationWebSocket = require('./collaboration-websocket');
    collabWss = new CollaborationWebSocket(server, collaborationAPI);
    console.log('🤝 协作WebSocket服务器已集成');
} catch (error) {
    console.error('⚠️ 协作WebSocket服务器启动失败:', error.message);
    console.log('🤝 协作实时功能将不可用，但API服务正常');
}

// 统一处理 WebSocket upgrade 路由（避免多个 wss 同时写同一 socket）
server.on('upgrade', (request, socket, head) => {
    try {
        const url = request.url || '/';
        if (url.startsWith('/ws/collaboration')) {
            if (!collabWss) return socket.destroy();
            return collabWss.handleUpgrade(request, socket, head);
        }

        if (!realtimeWss) return socket.destroy();
        return realtimeWss.handleUpgrade(request, socket, head);
    } catch (e) {
        socket.destroy();
    }
});

server.listen(PORT, () => {
    console.log(`🚀 DSclaw Backend running at http://localhost:${PORT}`);
    console.log(`📡 WebSocket 端口: ${PORT} (同一端口)`);
    console.log(`📁 Workspace: ${WORKSPACE_ROOT}`);
    console.log(`💾 Database: ${DB_PATH}`);
});