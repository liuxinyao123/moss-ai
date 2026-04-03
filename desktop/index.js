// DSClaw 桌面应用 — 默认连接 ClawX 主路线 API（仓库根目录 npm start → backend/server.js）
const BACKEND_URL = 'http://127.0.0.1:3001';
const COLLAB_API_BASE = 'http://127.0.0.1:3001/api/collaboration';
const AGENTS_API_BASE = 'http://127.0.0.1:3001/api/agents';

class DSClawApp {
    constructor() {
        this.currentAgentId = null;
        this.currentAgent = null;
        this.agents = [];
        this.channels = [];
        this.tasks = [];
        this.skills = [];
        this.skillsLoaded = false;
        this._skillsQuery = '';
        this.conversations = {};
        this.currentConversationId = null;
        
        // WebSocket 客户端
        this.wsClient = null;
        this.onlineAgents = new Map();
        this.realTimeMessages = new Map(); // channelId -> messages
        
        // 协作系统
        this.collabStats = null;
        this.collabAgents = {};
        this.collabTasks = [];
        this.collabMessages = [];
        this.collabDelegations = [];
        this.collabWebSocket = null;
        this.collabEvents = [];

        // Heartbeat（OpenClaw 轻量接入）
        this.heartbeat = { config: { enabled: false, intervalSec: 300 }, agents: [] };
        this.demoSceneConfig = null;
        this.demoSceneDetectedBrowsers = [];
        this.demoSceneLastInspect = null;
        this.demoSceneLastQueryTaskNo = null;
        this.demoSceneLastCad = null;
        this.demoSceneLastWorkflow = null;
        this.demoScenePendingApproval = null;
        this.demoSceneRunRequestId = null;
        this.demoSceneIsRunning = false;
        this.demoSceneWindowHiddenForCad = false;
        this.demoSceneChatConversationId = 'demo_scene_chat';
        this.demoSceneLastWorkflowEventKey = '';
        this.mainContentMode = 'chat';
        this.demoSceneFixedConfig = {
            baseUrl: 'http://8.140.103.143:82',
            userDataDir: '/Users/xinyao/Library/Application Support/Google/Chrome',
            profileDirectory: 'Default',
            taskIndex: 0,
            browserMode: 'real',
            cadModelPath: '/Users/xinyao/Desktop/cad_door_design/Product1.stp',
            mailRecipient: '1191094357@qq.com',
            checkRemark: ''
        };
        this.demoSceneWorkflowProgress = {
            percent: 0,
            statusText: '等待开始',
            steps: []
        };

        // OpenClaw models（严格以 openclaw.json 为准）
        this.gatewayModels = null; // [{id, ...}]
        this.defaultGatewayModel = null;
        this.lastRuntimeModel = null;
        this.lastExecutionTrace = null;
        this.themeStorageKey = 'dsclaw_theme_config_v1';
        this.legacyThemeStorageKey = 'dclaw_theme_config_v1';
        this.conversationStorageKey = 'dsclaw_conversations';
        this.legacyConversationStorageKey = 'dclaw_conversations';

        // 输入区附件（上传后预览，发送时自动拼接 Markdown）
        this.pendingUploads = []; // [{ originalName, storedName, mimeType, size, url }]
        this.kasm = {
            lastUrl: null
        };
        this.themeDefaults = {
            bgPrimary: '#07111a',
            bgSecondary: '#0d1824',
            bgTertiary: '#142233',
            bgElevated: '#18283d',
            textPrimary: '#eef4ff',
            textSecondary: '#a6b7cb',
            accent: '#66e3c4',
            accentHover: '#8cf0d7',
            accentStrong: '#24c89f',
            danger: '#ff6b7f'
        };
        this.themeConfig = { ...this.themeDefaults };
        this.themeModalBackup = { ...this.themeDefaults };
        this.themePresets = [
            {
                id: 'ocean-mint',
                name: 'Ocean Mint',
                vars: { ...this.themeDefaults }
            },
            {
                id: 'violet-signal',
                name: 'Violet Signal',
                vars: {
                    bgPrimary: '#0b0d1c',
                    bgSecondary: '#15172a',
                    bgTertiary: '#1e2340',
                    bgElevated: '#252d50',
                    textPrimary: '#f3f3ff',
                    textSecondary: '#b9b5dc',
                    accent: '#9b87f5',
                    accentHover: '#c1b5ff',
                    accentStrong: '#7a5cff',
                    danger: '#ff6b8d'
                }
            },
            {
                id: 'graphite-amber',
                name: 'Graphite Amber',
                vars: {
                    bgPrimary: '#111111',
                    bgSecondary: '#1a1a1a',
                    bgTertiary: '#242424',
                    bgElevated: '#2c2c2c',
                    textPrimary: '#f7f3eb',
                    textSecondary: '#c1b59d',
                    accent: '#f5b942',
                    accentHover: '#ffd37a',
                    accentStrong: '#e89a13',
                    danger: '#ff7a5c'
                }
            },
            {
                id: 'forest-terminal',
                name: 'Forest Terminal',
                vars: {
                    bgPrimary: '#08110c',
                    bgSecondary: '#0d1b13',
                    bgTertiary: '#16271e',
                    bgElevated: '#1d3328',
                    textPrimary: '#e9fff2',
                    textSecondary: '#9bc2a7',
                    accent: '#56dd8b',
                    accentHover: '#89f1b0',
                    accentStrong: '#28ba62',
                    danger: '#ff7262'
                }
            }
        ];
    }
    
    async init() {
        console.log('🚀 DSclaw 初始化...');
        this.initializeThemeConfig();
        
        // 绑定事件
        this.bindEvents();
        this.initPaneResizers();
        
        // 加载数据
        await this.loadAgents();
        await this.loadChannels();

        // 加载 Gateway 模型列表（用于创建/编辑智能体的模型下拉）
        await this.loadGatewayModels();
        
        // 如果没有智能体，创建默认的
        if (this.agents.length === 0) {
            await this.createDefaultAgent();
        }
        
        // 如果没有频道，创建默认的
        if (this.channels.length === 0) {
            await this.createDefaultChannel();
        }
        
        // 加载对话
        this.loadConversations();
        
        // 初始化WebSocket
        this.initWebSocket();
        
        // 初始化协作系统
        this.initCollaboration();
        
        // 更新UI
        this.updateUI();

        this.initDarkSelects();
        this.initKasm();
        this.initLayoutTweaks();
        
        console.log('✅ DSclaw 初始化完成');
    }

    initLayoutTweaks() {
        document.getElementById('main-toolbar-focus-chat-btn')?.addEventListener('click', () => {
            this.mainContentMode = 'chat';
            this.updateUI();
        });
        document.getElementById('main-toolbar-focus-kasm-btn')?.addEventListener('click', () => {
            this.mainContentMode = 'kasm';
            this.updateUI();
            this.switchTab('kasm');
        });
    }

    initKasm() {
        const statusEl = document.getElementById('kasm-status-text');
        const workbenchStatusEl = document.getElementById('kasm-workbench-status');
        const webview = document.getElementById('kasm-webview');
        const setStatus = (text) => {
            if (statusEl) statusEl.textContent = text;
            if (workbenchStatusEl) workbenchStatusEl.textContent = text;
        };

        const ensureAgent = () => {
            if (!this.currentAgentId) {
                this.showToast('请先选择智能体', 'error');
                return false;
            }
            return true;
        };

        let kasmLoadAttempts = 0;
        const loadUrl = (url) => {
            if (!webview) return;
            this.kasm.lastUrl = url;
            kasmLoadAttempts = 0;
            setStatus(url ? `已连接: ${url}` : '未启动');
            if (!url) {
                webview.src = 'about:blank';
                return;
            }

            // Keep credentials in URL so noVNC static assets can be fetched with auth as well.
            webview.src = url;
        };

        const start = async (type) => {
            if (!ensureAgent()) return;
            const agentId = this.currentAgentId;
            const endpoint =
                type === 'chrome'
                    ? `${BACKEND_URL}/api/kasm/${encodeURIComponent(agentId)}/chrome/start`
                    : `${BACKEND_URL}/api/kasm/${encodeURIComponent(agentId)}/desktop/start`;
            try {
                setStatus('启动中...');
                const res = await fetch(endpoint, { method: 'POST' });
                const data = await res.json();
                if (!data.success) {
                    throw new Error(data.error || '启动失败');
                }
                const url = data?.data?.connectionUrl;
                if (!url) {
                    throw new Error('后端未返回 connectionUrl');
                }
                loadUrl(url);
                this.setMainContentMode('kasm');
                this.showToast('Kasm 已启动', 'success');
            } catch (e) {
                console.error(e);
                setStatus('启动失败');
                this.showToast(e.message || 'Kasm 启动失败', 'error');
            }
        };

        const stop = async () => {
            if (!ensureAgent()) return;
            const agentId = this.currentAgentId;
            try {
                setStatus('停止中...');
                const res = await fetch(`${BACKEND_URL}/api/kasm/${encodeURIComponent(agentId)}/stop`, { method: 'POST' });
                const data = await res.json();
                if (!data.success) throw new Error(data.error || '停止失败');
                loadUrl(null);
                this.showToast('Kasm 已停止', 'success');
            } catch (e) {
                console.error(e);
                setStatus('停止失败');
                this.showToast(e.message || 'Kasm 停止失败', 'error');
            }
        };

        const reload = async () => {
            if (!ensureAgent()) return;
            const agentId = this.currentAgentId;
            try {
                const res = await fetch(`${BACKEND_URL}/api/kasm/${encodeURIComponent(agentId)}/status`);
                const data = await res.json();
                if (!data.success) throw new Error(data.error || '获取状态失败');
                const chromeUrl = data?.data?.chrome?.connectionUrl;
                const desktopUrl = data?.data?.desktop?.connectionUrl;
                loadUrl(desktopUrl || chromeUrl || null);
                if (desktopUrl || chromeUrl) {
                    this.setMainContentMode('kasm');
                }
                if (!desktopUrl && !chromeUrl) {
                    this.showToast('当前智能体未启动 Kasm', 'info');
                }
            } catch (e) {
                console.error(e);
                this.showToast(e.message || '刷新失败', 'error');
            }
        };

        document.getElementById('kasm-start-chrome-btn')?.addEventListener('click', () => start('chrome'));
        document.getElementById('kasm-start-desktop-btn')?.addEventListener('click', () => start('desktop'));
        document.getElementById('kasm-stop-btn')?.addEventListener('click', stop);
        document.getElementById('kasm-reload-btn')?.addEventListener('click', reload);
        document.getElementById('kasm-workbench-reload-btn')?.addEventListener('click', reload);

        if (webview) {
            webview.addEventListener('did-start-loading', () => setStatus('加载中...'));
            webview.addEventListener('did-finish-load', () => {
                kasmLoadAttempts = 0;
                if (webview.src && webview.src !== 'about:blank') setStatus('已加载');
            });
            webview.addEventListener('did-fail-load', (e) => {
                // -324 ERR_EMPTY_RESPONSE, -102 ERR_CONNECTION_REFUSED (container still starting)
                const retryable =
                    e.errorCode === -324 || e.errorCode === -102;
                const target = this.kasm.lastUrl;
                if (retryable && target && kasmLoadAttempts < 12) {
                    kasmLoadAttempts += 1;
                    const delay = Math.min(1500 + kasmLoadAttempts * 400, 8000);
                    setStatus(`会话 UI 尚在启动，重试 ${kasmLoadAttempts}/12（${delay}ms）…`);
                    setTimeout(() => {
                        if (webview && this.kasm.lastUrl === target) webview.src = target;
                    }, delay);
                    return;
                }
                setStatus(
                    e.errorDescription
                        ? `加载失败: ${e.errorDescription}`
                        : `加载失败 (code ${e.errorCode})`
                );
            });
        }
    }

    initPaneResizers() {
        const left = document.querySelector('.sidebar-left');
        const chat = document.querySelector('.chat-main');
        const sLeft = document.getElementById('splitter-left');
        if (!left || !chat || !sLeft) return;

        const key = 'moss.desktop.panes.v1';
        const minLeft = 180;
        const minChat = 520;
        const splitterW = 6;

        const applyWidth = (el, px) => {
            el.style.width = `${px}px`;
            el.style.flex = `0 0 ${px}px`;
        };
        const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
        const getTotalW = () => document.body.getBoundingClientRect().width;
        const getW = (el) => Math.round(el.getBoundingClientRect().width);

        const normalizeWidths = () => {
            const total = getTotalW();
            let lW = getW(left);
            const maxLeft = total - minChat - splitterW;
            applyWidth(left, clamp(lW, minLeft, Math.max(minLeft, maxLeft)));
        };

        try {
            const saved = JSON.parse(localStorage.getItem(key) || 'null');
            if (saved && typeof saved.left === 'number') applyWidth(left, clamp(saved.left, minLeft, 520));
        } catch {}
        // DOMContentLoaded 时布局/字体可能还没稳定，做几次兜底校准，避免全屏/还原窗口时中间面板被挤爆
        const scheduleNormalize = () => {
            normalizeWidths();
            requestAnimationFrame(() => {
                normalizeWidths();
                requestAnimationFrame(normalizeWidths);
            });
            setTimeout(normalizeWidths, 60);
            setTimeout(normalizeWidths, 220);
        };
        scheduleNormalize();

        let dragging = null;
        const startDrag = (which) => (e) => {
            e.preventDefault();
            dragging = which;
            document.body.classList.add('resizing');
        };
        const stopDrag = () => {
            if (!dragging) return;
            dragging = null;
            document.body.classList.remove('resizing');
            normalizeWidths();
            try {
                localStorage.setItem(key, JSON.stringify({ left: getW(left) }));
            } catch {}
        };
        const onMove = (e) => {
            if (!dragging) return;
            const total = getTotalW();
            const lW = getW(left);

            if (dragging === 'left') {
                const maxLeft = total - minChat - splitterW;
                const next = clamp(e.clientX, minLeft, maxLeft);
                applyWidth(left, next);
            }
        };

        sLeft.addEventListener('mousedown', startDrag('left'));
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', stopDrag);
        window.addEventListener('blur', stopDrag);
        window.addEventListener('resize', scheduleNormalize);
        document.addEventListener('fullscreenchange', scheduleNormalize);
        document.addEventListener('webkitfullscreenchange', scheduleNormalize);
    }
    
    async loadGatewayModels() {
        try {
            const res = await fetch(`${BACKEND_URL}/api/openclaw/models`);
            const raw = await res.text();
            let data;
            try { data = JSON.parse(raw); } catch { data = null; }
            if (!data?.success) return;
            const models = Array.isArray(data.models) ? data.models : [];
            this.defaultGatewayModel = data.defaultModel || null;
            this.gatewayModels = models;
            this.applyGatewayModelsToSelects(models, this.defaultGatewayModel);
        } catch (e) {
            // ignore：保留占位选项
        }
    }

    ensureModelOption(selectEl, modelId, label = null) {
        if (!selectEl || !modelId) return;
        const normalized = String(modelId).trim();
        if (!normalized) return;
        const exists = Array.from(selectEl.options).some(opt => opt.value === normalized);
        if (exists) return;
        const opt = document.createElement('option');
        opt.value = normalized;
        opt.textContent = label || normalized;
        selectEl.appendChild(opt);
    }

    applyGatewayModelsToSelects(models, defaultModel = null) {
        const normalizedModels = models
            .map(m => {
                const id = String(m?.id || m?.model || m?.name || '').trim();
                if (!id) return null;
                return {
                    id,
                    label: String(m?.label || m?.alias || m?.name || id)
                };
            })
            .filter(Boolean);
        if (normalizedModels.length === 0) return;

        const selects = [
            document.getElementById('agent-model'),
            document.getElementById('edit-persona-model')
        ].filter(Boolean);

        for (const sel of selects) {
            const prev = sel.value;
            sel.innerHTML = '';
            for (const model of normalizedModels) {
                const opt = document.createElement('option');
                opt.value = model.id;
                // 显示精确模型 ID，保持与 openclaw.json 一致
                opt.textContent = model.id;
                if (model.label && model.label !== model.id) {
                    opt.title = model.label;
                }
                sel.appendChild(opt);
            }
            if (prev && normalizedModels.some(model => model.id === prev)) {
                sel.value = prev;
            } else if (prev) {
                this.ensureModelOption(sel, prev, `[未在 AI 配置中声明] ${prev}`);
                sel.value = prev;
            } else if (defaultModel && normalizedModels.some(model => model.id === defaultModel)) {
                sel.value = defaultModel;
            }
            this.refreshDarkSelectFromNative(sel);
        }
    }

    /** 将带 form-input 的 select 换成深色自定义下拉，避免系统原生浅色菜单 */
    initDarkSelects() {
        document.querySelectorAll('select.form-input').forEach((sel) => {
            this.enhanceSelectWithDarkDropdown(sel);
        });
        if (!this._darkSelectEscapeBound) {
            this._darkSelectEscapeBound = true;
            document.addEventListener('keydown', (e) => {
                if (e.key !== 'Escape' || !this._openDarkSelectClose) return;
                this._openDarkSelectClose();
                this._openDarkSelectClose = null;
            });
        }
    }

    refreshDarkSelectFromNative(selectEl) {
        if (!selectEl) return;
        const wrap = selectEl.closest('.dark-select-wrap');
        const fn = wrap && wrap._darkSelectSync;
        if (typeof fn === 'function') fn();
    }

    enhanceSelectWithDarkDropdown(select) {
        if (!select || select.dataset.darkSelectEnhanced === '1') return;
        select.dataset.darkSelectEnhanced = '1';

        const wrap = document.createElement('div');
        wrap.className = 'dark-select-wrap';
        select.parentNode.insertBefore(wrap, select);
        wrap.appendChild(select);

        select.classList.remove('form-input');
        select.classList.add('dark-select-native');

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'dark-select-trigger form-input';
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');
        const labelSpan = document.createElement('span');
        labelSpan.className = 'dark-select-label';
        const chevron = document.createElement('span');
        chevron.className = 'dark-select-chevron';
        chevron.setAttribute('aria-hidden', 'true');
        chevron.textContent = '▾';
        trigger.appendChild(labelSpan);
        trigger.appendChild(chevron);
        wrap.insertBefore(trigger, select);

        const panel = document.createElement('div');
        panel.className = 'dark-select-panel';
        panel.setAttribute('role', 'listbox');
        panel.hidden = true;
        wrap.appendChild(panel);

        const positionPanel = () => {
            const r = trigger.getBoundingClientRect();
            const gap = 4;
            panel.style.top = `${Math.round(r.bottom + gap)}px`;
            panel.style.left = `${Math.round(r.left)}px`;
            panel.style.width = `${Math.round(r.width)}px`;
        };

        const rebuildPanelOptions = () => {
            panel.innerHTML = '';
            const selIdx = select.selectedIndex;
            for (let i = 0; i < select.options.length; i++) {
                const opt = select.options[i];
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'dark-select-option';
                btn.setAttribute('role', 'option');
                btn.setAttribute('aria-selected', opt.selected ? 'true' : 'false');
                btn.dataset.value = opt.value;
                btn.textContent = opt.textContent || opt.value;
                if (i === selIdx) btn.classList.add('is-selected');
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    select.value = opt.value;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    updateTrigger();
                    close();
                });
                panel.appendChild(btn);
            }
        };

        const updateTrigger = () => {
            const idx = select.selectedIndex;
            const opt = idx >= 0 ? select.options[idx] : null;
            const t = opt && opt.textContent ? opt.textContent.trim() : '';
            labelSpan.textContent = t || select.value || '请选择';
        };

        const close = () => {
            if (this._openDarkSelectClose === close) {
                this._openDarkSelectClose = null;
            }
            if (this._openDarkSelectWrap === wrap) {
                this._openDarkSelectWrap = null;
            }
            wrap.classList.remove('open');
            trigger.setAttribute('aria-expanded', 'false');
            panel.hidden = true;
            if (wrap._outsideHandler) {
                document.removeEventListener('mousedown', wrap._outsideHandler, true);
                wrap._outsideHandler = null;
            }
            if (wrap._repositionHandler) {
                window.removeEventListener('resize', wrap._repositionHandler);
                document.removeEventListener('scroll', wrap._repositionHandler, true);
                wrap._repositionHandler = null;
            }
            if (panel.parentNode === document.body) {
                wrap.appendChild(panel);
            }
        };

        const open = () => {
            if (this._openDarkSelectWrap && this._openDarkSelectWrap !== wrap) {
                const prevClose = this._openDarkSelectWrap._darkSelectClose;
                if (typeof prevClose === 'function') prevClose();
            }
            rebuildPanelOptions();
            positionPanel();
            document.body.appendChild(panel);
            panel.hidden = false;
            wrap.classList.add('open');
            trigger.setAttribute('aria-expanded', 'true');
            this._openDarkSelectWrap = wrap;
            this._openDarkSelectClose = close;

            const onOutside = (e) => {
                if (!wrap.contains(e.target) && !panel.contains(e.target)) {
                    close();
                }
            };
            wrap._outsideHandler = onOutside;
            document.addEventListener('mousedown', onOutside, true);

            const onReposition = () => {
                if (wrap.classList.contains('open')) positionPanel();
            };
            wrap._repositionHandler = onReposition;
            window.addEventListener('resize', onReposition);
            document.addEventListener('scroll', onReposition, true);
        };

        wrap._darkSelectClose = close;
        wrap._darkSelectSync = () => {
            rebuildPanelOptions();
            updateTrigger();
        };

        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (wrap.classList.contains('open')) {
                close();
            } else {
                open();
            }
        });

        const mo = new MutationObserver(() => {
            updateTrigger();
            if (wrap.classList.contains('open')) rebuildPanelOptions();
        });
        mo.observe(select, { childList: true, subtree: true });

        select.addEventListener('change', () => {
            updateTrigger();
            if (wrap.classList.contains('open')) rebuildPanelOptions();
        });

        updateTrigger();
    }

    // ========== 数据加载 ==========
    
    async loadAgents() {
        try {
            const response = await fetch(`${BACKEND_URL}/api/agents`);
            const data = await response.json();
            
            if (data.success) {
                this.agents = data.agents;
                
                // 如果没有当前智能体，选择第一个
                if (!this.currentAgentId && this.agents.length > 0) {
                    this.currentAgentId = this.agents[0].id;
                    this.currentAgent = this.agents[0];
                    await this.loadTasks();
                }
                
                this.renderAgents();
            }
        } catch (error) {
            console.error('加载智能体失败:', error);
            this.showToast('无法连接到后端服务', 'error');
        }
    }
    
    async loadChannels() {
        try {
            const response = await fetch(`${BACKEND_URL}/api/channels`);
            const data = await response.json();
            
            if (data.success) {
                this.channels = data.channels;
                this.renderChannels();
            }
        } catch (error) {
            console.error('加载频道失败:', error);
        }
    }
    
    async loadTasks() {
        if (!this.currentAgentId) return;
        
        try {
            const response = await fetch(`${BACKEND_URL}/api/agents/${this.currentAgentId}/tasks`);
            const data = await response.json();
            
            if (data.success) {
                this.tasks = data.tasks;
                this.renderTasks();
            }
        } catch (error) {
            console.error('加载任务失败:', error);
        }
    }

    // ========== 技能列表（来自 OpenClaw/Skill System） ==========
    async loadSkills({ force = false } = {}) {
        if (this.skillsLoaded && !force) return;
        try {
            const res = await fetch(`${BACKEND_URL}/api/skills`);
            const data = await res.json();
            const skills = Array.isArray(data?.skills) ? data.skills : [];
            const query = (this._skillsQuery || '').toLowerCase();
            this.skills = query
                ? skills.filter(s => {
                    const name = String(s?.name || '').toLowerCase();
                    const desc = String(s?.description || '').toLowerCase();
                    const id = String(s?.id || '').toLowerCase();
                    return name.includes(query) || desc.includes(query) || id.includes(query);
                })
                : skills;
            this.skillsLoaded = true;
            this.renderSkills();
        } catch (e) {
            console.error('加载技能失败:', e);
            this.showToast('后端未运行或技能系统不可用', 'error');
        }
    }

    renderSkills() {
        const container = document.getElementById('skills-list');
        if (!container) return;
        container.innerHTML = '';

        if (!this.skills || this.skills.length === 0) {
            container.innerHTML = '<div class="skills-empty">暂无技能，请确保后端技能系统已启动</div>';
            return;
        }

        this.skills.forEach(skill => {
            const card = document.createElement('div');
            card.className = 'skill-card';
            const meta = [`v${skill.version}`, skill.author].filter(Boolean).join(' · ');
            card.innerHTML = `
                <div class="skill-header">
                    <div class="skill-title">
                        <div class="skill-name">${skill.name}</div>
                        <div class="skill-meta">${meta}</div>
                    </div>
                    <div class="skill-actions">
                        <button class="skill-btn" type="button" data-skill-to-expert="${skill.id}">转专家</button>
                        <button class="skill-btn" type="button" data-skill-help="${skill.id}">帮助</button>
                    </div>
                </div>
                <div class="skill-desc">${skill.description || '无描述'}</div>
            `;
            container.appendChild(card);
        });
    }

    async openSkillHelp(skillId) {
        try {
            const titleEl = document.getElementById('skill-help-title');
            const contentEl = document.getElementById('skill-help-content');
            if (titleEl) titleEl.textContent = '技能帮助';
            const skill = (this.skills || []).find(s => s.id === skillId) || null;
            if (contentEl) {
                contentEl.textContent = skill
                    ? JSON.stringify(skill, null, 2)
                    : '未找到技能信息（请刷新技能列表）';
            }
            if (skill && titleEl) titleEl.textContent = `技能帮助 - ${skill.name || skillId}`;
            this.openModal('skill-help-modal');
        } catch (e) {
            console.error('获取技能帮助失败:', e);
            this.showToast('获取技能帮助失败', 'error');
        }
    }

    async applySkillToExpert(skillId) {
        if (!this.currentAgentId) {
            this.showToast('请先选择智能体', 'error');
            return;
        }

        try {
            const res = await fetch(`${BACKEND_URL}/api/agents/${encodeURIComponent(this.currentAgentId)}/skill-to-expert`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ skillId })
            });

            const data = await res.json().catch(() => null);
            if (!data?.success) {
                this.showToast(data?.error || '转专家失败', 'error');
                return;
            }

            await this.loadAgents();
            this.currentAgent = this.agents.find(a => a.id === this.currentAgentId) || this.currentAgent;
            this.updateCurrentAgentInfo();
            const skillName = (this.skills || []).find(s => s.id === skillId)?.name || skillId;
            this.showToast(`已切换为「${skillName}」专家风格`, 'success');
        } catch (e) {
            console.error('转专家失败:', e);
            this.showToast('转专家失败', 'error');
        }
    }
    
    loadConversations() {
        const saved = localStorage.getItem(this.conversationStorageKey) || localStorage.getItem(this.legacyConversationStorageKey);
        if (saved) {
            try {
                this.conversations = JSON.parse(saved);
                localStorage.setItem(this.conversationStorageKey, saved);
            } catch (e) {
                console.error('解析对话历史失败，重置为空', e);
                this.conversations = {};
            }
        }
        
        this.renderConversations();
        this.updateSessionBadge();
    }
    
    saveConversations() {
        localStorage.setItem(this.conversationStorageKey, JSON.stringify(this.conversations));
    }
    
    // ========== WebSocket 实时通信 ==========
    
    initWebSocket() {
        if (!window.WebSocketClient) {
            console.warn('WebSocket 客户端未加载，实时功能不可用');
            return;
        }
        
        this.wsClient = new WebSocketClient();
        
        // 监听事件
        this.wsClient.on('connected', () => {
            console.log('📡 实时连接已建立');
            this.showToast('实时连接已建立', 'success');
            this.updateConnectionBadge(true);
            
            // 认证当前智能体
            if (this.currentAgentId) {
                this.wsClient.sendAuth(this.currentAgentId);
            }
        });
        
        this.wsClient.on('auth_success', (data) => {
            console.log(`✅ 实时认证成功: ${data.agentId}`);
            this.showToast('实时功能已激活', 'success');
        });
        
        this.wsClient.on('channel_message', (message) => {
            console.log(`📨 实时消息: ${message.content}`);
            
            // 显示实时消息通知
            this.showRealtimeNotification(message);
            
            // 如果是当前订阅的频道，更新消息列表
            if (this.subscribedChannels.has(message.channelId)) {
                this.updateChannelMessages(message.channelId, message);
            }
        });
        
        this.wsClient.on('agent_online', (data) => {
            console.log(`🟢 智能体在线: ${data.agentId}`);
            this.onlineAgents.set(data.agentId, {
                online: true,
                lastSeen: Date.now()
            });
            
            // 更新在线状态显示
            this.updateOnlineStatus();
        });
        
        this.wsClient.on('agent_offline', (data) => {
            console.log(`🔴 智能体离线: ${data.agentId}`);
            this.onlineAgents.delete(data.agentId);
            
            // 更新在线状态显示
            this.updateOnlineStatus();
        });
        
        this.wsClient.on('error', (error) => {
            console.error('WebSocket 错误:', error);
            this.updateConnectionBadge(false);
            this.showToast(`实时连接错误: ${error.error || error.message}`, 'error');
        });

        // 监听执行状态（来自后端 /api/chat 的广播）
        this.wsClient.on('execution_update', (evt) => {
            const st = evt.status || 'unknown';
            if (st === 'running') {
                this.addCollabEvent?.(`⚡ 执行开始 ${evt.agentId || ''} (${evt.model || ''})`);
            } else if (st === 'completed') {
                this.addCollabEvent?.(`✅ 执行完成 ${evt.agentId || ''} (${evt.durationMs || 0}ms)`);
            } else if (st === 'error') {
                this.addCollabEvent?.(`❌ 执行失败 ${evt.agentId || ''}: ${evt.error || 'unknown error'}`);
            } else {
                this.addCollabEvent?.(`ℹ️ 执行状态 ${st} ${evt.agentId || ''}`);
            }
            this.handleDemoSceneExecutionUpdate(evt);
        });
        
        // 连接
        this.wsClient.connect();
        
        // 开始心跳
        this.wsClient.startHeartbeat();
    }
    
    showRealtimeNotification(message) {
        if (this.currentConversationId) {
            const conv = this.conversations[this.currentConversationId];
            if (conv) {
                this.addMessageToUI('assistant', `
# 📡 实时频道消息

**频道**: #${message.channelId}
**发送者**: ${message.senderAgentId || '未知'}
**时间**: ${new Date(message.timestamp).toLocaleString()}

**内容**: ${message.content}

*当前频道已自动更新*
                `);
            }
        }
    }
    
    updateOnlineStatus() {
        // 在界面上显示在线状态
        const agentsList = document.getElementById('sidebar-agents-list');
        if (agentsList) {
            agentsList.querySelectorAll('.agent-card').forEach(card => {
                const agentId = card.dataset.id;
                const statusBadge = card.querySelector('.agent-status');
                
                if (statusBadge && this.onlineAgents.has(agentId)) {
                    statusBadge.textContent = '在线';
                    statusBadge.className = 'agent-status online';
                }
            });
        }
    }
    
    updateChannelMessages(channelId, message) {
        if (!this.realTimeMessages.has(channelId)) {
            this.realTimeMessages.set(channelId, []);
        }
        
        const messages = this.realTimeMessages.get(channelId);
        messages.push(message);
        
        // 保持最近50条消息
        if (messages.length > 50) {
            messages.shift();
        }
        
        // 触发UI更新
        this.triggerChannelUpdate(channelId);
    }
    
    triggerChannelUpdate(channelId) {
        // 如果有监听器，触发更新
        const event = new CustomEvent('channel_update', {
            detail: { channelId, messages: this.realTimeMessages.get(channelId) }
        });
        document.dispatchEvent(event);
    }
    
    subscribeChannel(channelId) {
        if (this.wsClient && this.wsClient.isConnected) {
            return this.wsClient.subscribeChannel(channelId);
        }
        return false;
    }
    
    sendChannelMessage(channelId, content) {
        if (this.wsClient && this.wsClient.isConnected) {
            return this.wsClient.sendChannelMessage(channelId, content);
        }
        return false;
    }
    
    // ========== 创建默认数据 ==========
    
    async createDefaultAgent() {
        try {
            const defaultModel = this.defaultGatewayModel || 'volcengine-plan/doubao-seed-code';
            const response = await fetch(`${BACKEND_URL}/api/agents`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'DSClaw 默认助手',
                    model: defaultModel,
                    personality: 'assistant',
                    config: {
                        description: '默认的 DSClaw 助手',
                        capabilities: ['对话', '任务管理', '记忆编译']
                    }
                })
            });
            
            const data = await response.json();
            if (data.success) {
                this.currentAgentId = data.agent.id;
                this.currentAgent = data.agent;
                await this.loadAgents();
                this.showToast('默认智能体创建成功', 'success');
            }
        } catch (error) {
            console.error('创建默认智能体失败:', error);
        }
    }
    
    async createDefaultChannel() {
        try {
            const response = await fetch(`${BACKEND_URL}/api/channels`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: '主频道',
                    description: '默认讨论频道'
                })
            });
            
            if (response.ok) {
                await this.loadChannels();
            }
        } catch (error) {
            console.error('创建默认频道失败:', error);
        }
    }
    
    // ========== 智能体操作 ==========
    
    async createAgent(name, model, personality, agentId = null) {
        try {
            const response = await fetch(`${BACKEND_URL}/api/agents`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: agentId, name, model, personality })
            });

            const raw = await response.text();
            let data = null;
            try {
                data = raw ? JSON.parse(raw) : null;
            } catch (e) {
                throw new Error(`创建接口返回异常 (${response.status})`);
            }

            if (data.success) {
                this.showToast(`智能体 "${name}" 创建成功`, 'success');
                await this.loadAgents();
                this.closeModal('create-agent-modal');
                return data.agent;
            }

            throw new Error(data?.error || `创建失败 (${response.status})`);
        } catch (error) {
            console.error('创建智能体失败:', error);
            this.showToast(error?.message || '创建失败，请检查后端服务', 'error');
        }
        return null;
    }
    
    async switchAgent(agentId) {
        const agent = this.agents.find(a => a.id === agentId);
        if (!agent) return;
        
        this.currentAgentId = agentId;
        this.currentAgent = agent;
        
        // WebSocket 重新认证
        if (this.wsClient && this.wsClient.isConnected) {
            this.wsClient.sendAuth(agentId);
        }
        
        await this.loadTasks();
        this.updateCurrentAgentInfo();
        // 避免跨智能体复用同一对话历史导致“人设串台”
        this.createConversation(agentId);
        this.addMessageToConversation('assistant', `# ✅ 已切换智能体\n\n**智能体**: ${agent.name}\n**模型**: ${agent.model}\n\n请在此新对话中继续提问，以确保人设与上下文一致。`);
        this.lastRuntimeModel = null;
        this.updateRuntimeModelBadge();
        this.updateTracePanel(null);
        this.showToast(`已切换到: ${agent.name}`, 'success');
    }
    
    openEditPersonaModal(agent) {
        this._editingAgent = agent;
        document.getElementById('edit-persona-agent-id').value = agent.id;
        document.getElementById('edit-persona-name').value = agent.name || '';
        document.getElementById('edit-persona-personality').value = agent.personality || 'assistant';
        const modelEl = document.getElementById('edit-persona-model');
        if (modelEl) {
            const nextModel = agent.model || this.defaultGatewayModel || 'volcengine-plan/doubao-seed-code';
            this.ensureModelOption(modelEl, nextModel, `[未在 AI 配置中声明] ${nextModel}`);
            modelEl.value = nextModel;
        }
        document.getElementById('edit-persona-text').value = (agent.config && (agent.config.persona || agent.config.description)) || '';
        this.refreshDarkSelectFromNative(document.getElementById('edit-persona-personality'));
        this.refreshDarkSelectFromNative(document.getElementById('edit-persona-model'));
        this.openModal('edit-persona-modal');
    }

    async openAgentFileEditor(fileName) {
        const agentId = document.getElementById('edit-persona-agent-id')?.value;
        if (!agentId) return;
        try {
            const res = await fetch(`${BACKEND_URL}/api/agents/${encodeURIComponent(agentId)}/files/${encodeURIComponent(fileName)}`);
            const data = await res.json();
            if (!data.success) {
                this.showToast(data.error || '加载文件失败', 'error');
                return;
            }
            document.getElementById('agent-file-agent-id').value = agentId;
            document.getElementById('agent-file-name').value = fileName;
            document.getElementById('agent-file-title').textContent = `编辑 ${fileName}`;
            document.getElementById('agent-file-content').value = data.content || '';
            this.openModal('agent-file-modal');
        } catch (e) {
            this.showToast('加载文件失败，请检查后端', 'error');
        }
    }

    async saveAgentFile() {
        const agentId = document.getElementById('agent-file-agent-id')?.value;
        const fileName = document.getElementById('agent-file-name')?.value;
        const content = document.getElementById('agent-file-content')?.value ?? '';
        if (!agentId || !fileName) return;
        try {
            const res = await fetch(`${BACKEND_URL}/api/agents/${encodeURIComponent(agentId)}/files/${encodeURIComponent(fileName)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });
            const data = await res.json();
            if (data.success) {
                this.closeModal('agent-file-modal');
                this.showToast(`${fileName} 已保存`, 'success');
            } else {
                this.showToast(data.error || '保存失败', 'error');
            }
        } catch (e) {
            this.showToast('保存失败，请检查后端', 'error');
        }
    }

    async openOpenClawConfig() {
        try {
            const res = await fetch(`${BACKEND_URL}/api/openclaw/config`);
            const data = await res.json();
            if (!data.success) {
                this.showToast(data.error || '加载 AI 配置失败', 'error');
                return;
            }
            document.getElementById('openclaw-config-content').value = data.content || '';
            this.openModal('openclaw-config-modal');
        } catch (e) {
            this.showToast('加载 AI 配置失败，请检查后端', 'error');
        }
    }

    async saveOpenClawConfig() {
        const content = document.getElementById('openclaw-config-content')?.value ?? '';
        try {
            const res = await fetch(`${BACKEND_URL}/api/openclaw/config`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });
            const data = await res.json();
            if (data.success) {
                this.closeModal('openclaw-config-modal');
                this.showToast('AI 配置已保存', 'success');
            } else {
                this.showToast(data.error || '保存失败', 'error');
            }
        } catch (e) {
            this.showToast('保存失败，请检查后端', 'error');
        }
    }
    
    async saveEditPersona() {
        const agentId = document.getElementById('edit-persona-agent-id').value;
        const name = document.getElementById('edit-persona-name').value.trim();
        const personality = document.getElementById('edit-persona-personality').value;
        const model = document.getElementById('edit-persona-model')?.value;
        const persona = document.getElementById('edit-persona-text').value.trim();
        
        if (!agentId) return;
        
        const agent = this.agents.find(a => a.id === agentId);
        const config = agent && agent.config ? { ...agent.config } : {};
        config.persona = persona;
        if (persona && !config.description) config.description = persona.substring(0, 100);
        
        try {
            const body = { personality, config };
            if (name) body.name = name;
            if (model) body.model = model;
            
            const response = await fetch(`${BACKEND_URL}/api/agents/${agentId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await response.json();
            if (data.success) {
                await this.loadAgents();
                if (this.currentAgentId === agentId) {
                    this.currentAgent = this.agents.find(a => a.id === agentId);
                    this.updateCurrentAgentInfo();
                }
                this.closeModal('edit-persona-modal');
                this.showToast('人设已保存', 'success');
            } else {
                this.showToast(data.error || '保存失败', 'error');
            }
        } catch (error) {
            console.error('保存人设失败:', error);
            this.showToast('保存失败，请检查后端服务', 'error');
        }
    }
    
    // ========== 任务操作 ==========
    
    async createTask(description) {
        if (!this.currentAgentId) return;
        
        try {
            const response = await fetch(`${BACKEND_URL}/api/agents/${this.currentAgentId}/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description })
            });
            
            const data = await response.json();
            if (data.success) {
                await this.loadTasks();
                this.showToast('任务创建成功', 'success');
            }
        } catch (error) {
            console.error('创建任务失败:', error);
        }
    }
    
    async toggleTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;
        
        const newStatus = !task.completed;
        
        try {
            const response = await fetch(`${BACKEND_URL}/api/tasks/${taskId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completed: newStatus })
            });
            
            if (response.ok) {
                await this.loadTasks();
            }
        } catch (error) {
            console.error('更新任务失败:', error);
        }
    }
    
    // ========== 频道操作 ==========
    
    async createChannel(name, description) {
        try {
            const response = await fetch(`${BACKEND_URL}/api/channels`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, description })
            });
            
            const data = await response.json();
            if (data.success) {
                this.showToast(`频道 "${name}" 创建成功`, 'success');
                await this.loadChannels();
                this.closeModal('create-channel-modal');
                return data.channel;
            }
        } catch (error) {
            console.error('创建频道失败:', error);
            this.showToast('创建失败', 'error');
        }
        return null;
    }
    
    async sendChannelMessage(channelId, content) {
        if (!this.currentAgentId) return;
        
        try {
            const response = await fetch(`${BACKEND_URL}/api/channels/${channelId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    senderAgentId: this.currentAgentId,
                    content
                })
            });
            
            if (response.ok) {
                this.showToast('消息已发送到频道', 'success');
            }
        } catch (error) {
            console.error('发送频道消息失败:', error);
        }
    }
    
    // ========== 记忆编译 ==========
    
    async compileMemory(type) {
        if (!this.currentAgentId) return;
        
        try {
            const response = await fetch(`${BACKEND_URL}/api/compile-memory`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    agentId: this.currentAgentId,
                    type
                })
            });
            
            const data = await response.json();
            if (data.success) {
                this.showToast('记忆编译完成', 'success');
                
                // 显示编译结果
                this.addMessage('assistant', `
# 🐬 记忆编译报告

**类型**: ${type === 'daily' ? '今日记忆' : type === 'weekly' ? '近七日记忆' : '长期记忆'}
**智能体**: ${this.currentAgent.name}
**完成时间**: ${new Date().toLocaleString()}

**摘要**:
- 智能体运行状态: ✅ 正常
- 记忆文件已保存: ${data.data.file_path}
- 关键记忆点: ${data.data.key_points.join(', ')}
                `);
                
                this.closeModal('compile-memory-modal');
            }
        } catch (error) {
            console.error('编译记忆失败:', error);
            this.showToast('编译失败', 'error');
        }
    }
    
    // ========== 对话管理 ==========
    
    createConversation(prefix = null) {
        const agentId = prefix || this.currentAgentId || null;
        const now = new Date().toISOString();
        const id = (agentId ? `${agentId}_` : '') + Date.now().toString();
        this.conversations[id] = {
            id,
            agentId,
            title: `新对话 (${new Date().toLocaleTimeString()})`,
            messages: [],
            createdAt: now,
            updatedAt: now
        };
        
        this.saveConversations();
        this.renderConversations();
        this.switchConversation(id);
        this.lastRuntimeModel = null;
        this.updateRuntimeModelBadge();
        this.updateTracePanel(null);
        this.updateSessionBadge();
    }

    isDemoSceneConversation(conversationId = this.currentConversationId) {
        const conv = conversationId ? this.conversations[conversationId] : null;
        return Boolean(conv?.type === 'demo_scene');
    }

    ensureDemoSceneConversation() {
        const now = new Date().toISOString();
        const existing = this.conversations[this.demoSceneChatConversationId];
        if (existing) {
            existing.type = 'demo_scene';
            existing.fixedTitle = 'iCheck检查项完成';
            existing.title = 'iCheck检查项完成';
            existing.agentId = this.currentAgentId || existing.agentId || null;
            this.saveConversations();
            this.renderConversations();
            return existing;
        }

        this.conversations[this.demoSceneChatConversationId] = {
            id: this.demoSceneChatConversationId,
            agentId: this.currentAgentId || null,
            type: 'demo_scene',
            fixedTitle: 'iCheck检查项完成',
            title: 'iCheck检查项完成',
            messages: [],
            createdAt: now,
            updatedAt: now
        };
        this.saveConversations();
        this.renderConversations();
        return this.conversations[this.demoSceneChatConversationId];
    }

    appendMessageToConversationById(conversationId, role, content, options = {}) {
        if (!conversationId) return;
        const conv = this.conversations[conversationId];
        if (!conv) return;
        const createdAt = options.createdAt || new Date().toISOString();
        conv.messages.push({ role, content, createdAt });
        conv.title = conv.fixedTitle || this.generateConversationTitle(conv.messages);
        conv.updatedAt = createdAt;
        this.saveConversations();
        this.renderConversations();
        if (options.appendToUI !== false && this.currentConversationId === conversationId) {
            this.addMessageToUI(role, content, createdAt);
        }
    }

    openDemoSceneChat(autoRun = true) {
        const conv = this.ensureDemoSceneConversation();
        this.switchConversation(conv.id);
        this.setMainContentMode('chat');
        this.updateRuntimeModelBadge({ model: null, source: 'demo-scene', state: 'ready' });
        const input = document.getElementById('chat-input');
        if (input) {
            input.placeholder = '例如：获取检查项 / 开始任务 / 确认 / 取消';
        }
        this.renderDemoSceneRunButton();

        if (conv.messages.length === 0) {
            this.appendMessageToConversationById(conv.id, 'assistant', [
                '# iCheck检查项完成',
                '',
                '这个会话专门用来执行 iCheck 检查项流程。',
                '',
                '你可以这样和我说：',
                '- 获取 iCheck 的检查项',
                '- 开始任务',
                '- 模拟浏览器开始 TK110677 任务',
                '- 确认',
                '- 取消',
                '',
                '我会先回检查项，再推进任务；到提交和发送前会停下确认。'
            ].join('\n'));
        }

        if (autoRun) {
            this.appendMessageToConversationById(conv.id, 'assistant', '先发“获取 iCheck 的检查项”。');
        }
    }

    async runDemoSceneAllFromChat(triggerMessage, options = {}) {
        const { addUserMessage = false } = options;
        const conv = this.ensureDemoSceneConversation();
        this.switchConversation(conv.id);
        this.setMainContentMode('chat');

        if (this.demoSceneIsRunning) {
            if (addUserMessage) {
                this.appendMessageToConversationById(conv.id, 'user', triggerMessage);
            }
            this.appendMessageToConversationById(conv.id, 'assistant', '当前流程还在执行中，等这一轮完成后你再发一次，我就重新跑。');
            return;
        }

        if (addUserMessage) {
            this.appendMessageToConversationById(conv.id, 'user', triggerMessage);
        }

        const normalizedMessage = String(triggerMessage || '').trim();
        const intent = this.parseDemoSceneIntent(normalizedMessage);
        if (this.demoScenePendingApproval && this.isDemoSceneCancelMessage(normalizedMessage)) {
            const pendingTask = this.demoScenePendingApproval?.selectedTask || {};
            const pendingType = this.demoScenePendingApproval?.type || 'action';
            this.clearDemoScenePendingApproval();
            this.updateDemoSceneProgressStatus('已取消当前待确认动作', 0);
            this.appendMessageToConversationById(
                conv.id,
                'assistant',
                `已取消本次${pendingType === 'mail' ? '邮件草稿生成' : '提交'}：${pendingTask.task_name || '-'} (${pendingTask.task_no || '-'})`
            );
            return;
        }

        if (this.demoScenePendingApproval && this.isDemoSceneConfirmMessage(normalizedMessage)) {
            if (this.demoScenePendingApproval.type === 'submit') {
                await this.executeDemoSceneSubmitFromChat(conv, this.demoScenePendingApproval);
                return;
            }
            if (this.demoScenePendingApproval.type === 'mail') {
                await this.executeDemoSceneMailFromChat(conv, this.demoScenePendingApproval);
                return;
            }
        }

        if (intent.action === 'query') {
            await this.previewDemoSceneWorkflowFromChat(conv, {
                taskNo: intent.taskNo || '',
                allTasks: Boolean(intent.allTasks),
                browserMode: intent.simulateBrowser ? 'simulated' : 'real'
            });
            return;
        }

        if (intent.action === 'start') {
            await this.executeDemoSceneWorkflowFromChat(conv, {
                ...this.demoSceneLastInspect,
                browserMode: intent.simulateBrowser ? 'simulated' : (this.demoSceneFixedConfig.browserMode || 'real'),
                selectedTask: {
                    ...(this.demoSceneLastInspect?.selectedTask || {}),
                    task_no: intent.taskNo || this.demoSceneLastQueryTaskNo || this.demoSceneLastInspect?.selectedTask?.task_no || '',
                    task_name: this.demoSceneLastInspect?.selectedTask?.task_name || ''
                }
            });
            return;
        }

        this.appendMessageToConversationById(conv.id, 'assistant', '你可以直接说：查 TK110673 检查项、开始 TK110673 任务，或模拟浏览器开始 TK110673。');
    }

    isDemoSceneQueryMessage(message) {
        const text = String(message || '').trim();
        if (!text) return false;
        return /(获取|查看|查询|列出).*(icheck|iCheck|检查项|任务)|^(检查项|任务列表)$/.test(text);
    }

    isDemoSceneStartMessage(message) {
        const normalized = String(message || '').replace(/\s+/g, '').toLowerCase();
        if (!normalized) return false;
        return [
            '开始任务',
            '运行任务',
            '启动任务',
            '开始',
            '运行'
        ].includes(normalized);
    }

    isDemoSceneConfirmMessage(message) {
        const normalized = String(message || '').replace(/\s+/g, '').toLowerCase();
        if (!normalized) return false;
        return [
            '确认',
            '确认执行',
            '继续',
            '继续执行',
            '确认提交',
            '提交',
            '确认发送',
            '发送',
            'ok',
            'yes'
        ].includes(normalized);
    }

    isDemoSceneCancelMessage(message) {
        const normalized = String(message || '').replace(/\s+/g, '').toLowerCase();
        if (!normalized) return false;
        return ['取消', '取消执行', '不要执行', '停止'].includes(normalized);
    }

    parseDemoSceneIntent(message) {
        const text = String(message || '').trim();
        const compact = text.replace(/\s+/g, '');
        const taskNoMatch = compact.match(/TK\d+/i);
        const taskNo = taskNoMatch ? taskNoMatch[0].toUpperCase() : '';
        const allTasks = /(全部|所有)/.test(text);
        const simulateBrowser = /(模拟浏览器|浏览器模拟|模拟模式|模拟一下)/.test(text);
        if (this.isDemoSceneConfirmMessage(text)) {
            return { action: 'confirm', taskNo, allTasks: false, simulateBrowser };
        }
        if (this.isDemoSceneCancelMessage(text)) {
            return { action: 'cancel', taskNo, allTasks: false, simulateBrowser };
        }
        const wantsCheckItems = /(检查项|任务项|明细)/.test(text);
        const wantsStart = /(开始|执行|运行|启动|完成|做掉|处理)/.test(text);
        const wantsQuery = /(获取|查看|查询|列出|看看|看下)/.test(text) || wantsCheckItems;
        if (wantsCheckItems || allTasks || wantsQuery) {
            return { action: 'query', taskNo, allTasks, simulateBrowser };
        }
        if (wantsStart) {
            return { action: 'start', taskNo, allTasks: false, simulateBrowser };
        }
        return { action: 'unknown', taskNo, allTasks: false, simulateBrowser };
    }

    setDemoScenePendingApproval(preview) {
        this.demoScenePendingApproval = preview || null;
        this.renderDemoSceneRunButton();
    }

    clearDemoScenePendingApproval() {
        this.setDemoScenePendingApproval(null);
    }

    renderDemoSceneRunButton() {
        const runBtn = document.getElementById('demo-scene-run-all-btn');
        if (!runBtn) return;
        runBtn.disabled = this.demoSceneIsRunning;
        if (this.demoSceneIsRunning) {
            runBtn.textContent = '处理中...';
            return;
        }
        if (this.demoScenePendingApproval?.type === 'submit') {
            runBtn.textContent = '确认提交';
            return;
        }
        if (this.demoScenePendingApproval?.type === 'mail') {
            runBtn.textContent = '确认发送';
            return;
        }
        runBtn.textContent = this.demoSceneLastInspect?.selectedTask ? '开始任务' : '获取检查项';
    }

    formatDemoScenePreviewMessage(preview, options = {}) {
        const taskNo = String(options.taskNo || '').trim().toUpperCase();
        const allTasks = Boolean(options.allTasks);
        const allPreviewTasks = Array.isArray(preview?.tasks) ? preview.tasks : [];
        const tasks = taskNo
            ? allPreviewTasks.filter((task) => String(task?.task_no || '').trim().toUpperCase() === taskNo)
            : (allTasks ? allPreviewTasks : allPreviewTasks);
        const summaryCheckItemCount = taskNo
            ? tasks.reduce((sum, task) => sum + (Number(task?.checkItemCount) || 0), 0)
            : (preview?.checkItemCount ?? 0);
        const lines = [
            '# iCheck 检查项结果',
            '',
            `任务数：${tasks.length || 0}`,
            `检查项数量：${summaryCheckItemCount}`
        ];
        if (tasks.length > 0) {
            lines.push('', '任务列表：');
            tasks.forEach((task, index) => {
                lines.push(`${index + 1}. ${task.task_name || '-'} (${task.task_no || '-'}) / ${task.checkItemCount ?? 0}项`);
                const items = Array.isArray(task.checkItems) ? task.checkItems : [];
                items.slice(0, 6).forEach((item) => {
                    const name = item.name || item.no || item.id || '-';
                    lines.push(`- ${item.no ? `${item.no} ` : ''}${item.classify ? `[${item.classify}] ` : ''}${name}`);
                    lines.push(`  要求：${item.requirement || '无'}`);
                });
                if (items.length > 6) {
                    lines.push(`- ... 还有 ${items.length - 6} 项`);
                }
            });
        }
        if (taskNo && tasks.length === 0) {
            lines.push('', `没找到任务 ${taskNo}`);
        }
        lines.push('', '继续就回“开始任务”。');
        return lines.join('\n');
    }

    async previewDemoSceneWorkflowFromChat(conv, options = {}) {
        const taskNo = String(options.taskNo || '').trim().toUpperCase();
        const allTasks = Boolean(options.allTasks);
        const browserMode = options.browserMode === 'simulated' ? 'simulated' : 'real';
        this.demoSceneRunRequestId = null;
        this.demoSceneLastWorkflowEventKey = '';
        this.resetDemoSceneWorkflowProgress('正在获取 iCheck 任务预览...');
        this.updateDemoSceneProgressStatus('正在获取 iCheck 任务预览...', 8);
        this.setDemoSceneRunning(true);
        this.clearDemoScenePendingApproval();
        this.demoSceneLastQueryTaskNo = allTasks ? '' : taskNo;
        this.appendMessageToConversationById(conv.id, 'assistant', taskNo ? `收到，正在获取 ${taskNo} 的检查项。` : '收到，正在获取检查项。');

        try {
            this.demoSceneConfig = { ...this.demoSceneFixedConfig, browserMode };
            const res = await fetch(`${BACKEND_URL}/api/demo/scene/icheck/preview`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...this.getDemoSceneFormPayload(),
                    browserMode,
                    ...(taskNo ? { taskNo } : {})
                })
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || '任务预览失败');
            this.demoSceneLastInspect = data.result || null;
            this.updateDemoSceneProgressStatus('已获取检查项结果', 20);
            this.appendMessageToConversationById(conv.id, 'assistant', this.formatDemoScenePreviewMessage(data.result || {}, { taskNo, allTasks }));
            this.showToast('iCheck 任务预览已生成', 'success');
        } catch (error) {
            this.clearDemoScenePendingApproval();
            this.updateDemoSceneProgressStatus(error.message || '任务预览失败', 100);
            this.appendMessageToConversationById(conv.id, 'assistant', `# 预览失败\n\n${error.message || '任务预览失败'}`);
            this.showToast(error.message || '任务预览失败', 'error');
        } finally {
            this.setDemoSceneRunning(false);
        }
    }

    async executeDemoSceneWorkflowFromChat(conv, preview) {
        let currentPreview = preview || this.demoSceneLastInspect || null;
        if (!currentPreview?.selectedTask?.task_no) {
            const fallbackTaskNo = this.demoSceneLastQueryTaskNo || '';
            this.appendMessageToConversationById(conv.id, 'assistant', fallbackTaskNo ? `还没有任务上下文，我先查 ${fallbackTaskNo}。` : '还没有任务上下文，请先说任务号。');
            if (!fallbackTaskNo) return;
            await this.previewDemoSceneWorkflowFromChat(conv, { taskNo: fallbackTaskNo });
            currentPreview = this.demoSceneLastInspect || null;
        }
        const selectedTask = currentPreview?.selectedTask || {};
        const browserMode = preview?.browserMode === 'simulated' ? 'simulated' : (this.demoSceneFixedConfig.browserMode || 'real');
        if (!selectedTask.task_no) {
            this.appendMessageToConversationById(conv.id, 'assistant', '还没有可执行的任务，请先说任务号。');
            return;
        }

        this.demoSceneRunRequestId = null;
        this.demoSceneWindowHiddenForCad = false;
        this.demoSceneLastWorkflowEventKey = '';
        this.resetDemoSceneWorkflowProgress('正在启动任务...');
        this.updateDemoSceneProgressStatus('正在启动任务...', 2);
        this.setDemoSceneRunning(true);
        this.appendMessageToConversationById(conv.id, 'assistant', [
            `开始任务：${selectedTask.task_name || '-'} (${selectedTask.task_no || '-'})`,
            browserMode === 'simulated' ? '浏览器步骤将使用模拟模式。' : '到提交和发送前我会先问你。'
        ].join('\n'));

        try {
            this.demoSceneConfig = { ...this.demoSceneFixedConfig, browserMode };
            const inspectEndpoint = browserMode === 'simulated'
                ? `${BACKEND_URL}/api/demo/scene/icheck/detail`
                : `${BACKEND_URL}/api/demo/scene/icheck/inspect`;
            const inspectRunningText = browserMode === 'simulated'
                ? '正在通过接口获取任务详情...'
                : '正在打开浏览器并定位任务...';
            const inspectDoneText = browserMode === 'simulated'
                ? '任务详情已获取'
                : '任务详情已获取，浏览器已定位到任务';
            const inspectTitle = browserMode === 'simulated'
                ? '已获取任务详情'
                : '已获取任务详情并打开浏览器';
            this.updateDemoSceneStep('inspect', 'running', inspectRunningText);
            this.updateDemoSceneProgressStatus(inspectRunningText, 18);
            this.appendMessageToConversationById(conv.id, 'assistant', inspectRunningText);
            const inspectRes = await fetch(inspectEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...this.getDemoSceneFormPayload(),
                    taskNo: selectedTask.task_no || ''
                })
            });
            const inspectData = await inspectRes.json();
            if (!inspectData.success) throw new Error(inspectData.error || '获取任务详情失败');
            this.demoSceneLastInspect = inspectData.result || null;
            this.updateDemoSceneStep('inspect', 'completed', inspectDoneText);
            this.updateDemoSceneProgressStatus(inspectDoneText, 36);
            this.appendMessageToConversationById(
                conv.id,
                'assistant',
                this.formatDemoSceneLines(inspectData.result || {}, inspectTitle)
            );

            if (browserMode === 'simulated') {
                this.updateDemoSceneProgressStatus('浏览器步骤按模拟模式完成', 44);
                this.appendMessageToConversationById(conv.id, 'assistant', [
                    '浏览器步骤：模拟',
                    `已模拟打开 iCheck 任务页并定位到 ${selectedTask.task_no || '-'}。`
                ].join('\n'));
            }

            this.updateDemoSceneStep('cad', 'running', '正在执行 FreeCAD GUI 截图...');
            this.updateDemoSceneProgressStatus('正在执行 FreeCAD GUI 截图...', 52);
            this.appendMessageToConversationById(conv.id, 'assistant', '正在执行 CAD 截图...');
            await this.hideWindowForCadStep();
            const cadRes = await fetch(`${BACKEND_URL}/api/demo/scene/cad/capture`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.getDemoSceneFormPayload())
            });
            const cadData = await cadRes.json();
            if (!cadData.success) throw new Error(cadData.error || 'CAD 截图失败');
            this.demoSceneLastCad = cadData.result || null;
            this.updateDemoSceneStep('cad', 'completed', 'FreeCAD GUI 截图已完成');
            this.updateDemoSceneProgressStatus('已到提交前，等待确认', 68);
            this.appendMessageToConversationById(
                conv.id,
                'assistant',
                this.formatDemoSceneLines(cadData.result || {}, 'CAD 截图完成')
            );
            this.setDemoScenePendingApproval({
                type: 'submit',
                selectedTask,
                inspectResult: this.demoSceneLastInspect,
                cadResult: this.demoSceneLastCad
            });
            this.appendMessageToConversationById(conv.id, 'assistant', [
                '要提交吗？',
                `任务：${selectedTask.task_name || '-'} (${selectedTask.task_no || '-'})`,
                '回复“确认”或“取消”。'
            ].join('\n'));
            this.showToast('已到提交前', 'success');
        } catch (error) {
            await this.restoreWindowAfterCadStep();
            this.updateDemoSceneProgressStatus(error.message || '任务执行失败', 100);
            this.appendMessageToConversationById(conv.id, 'assistant', `# 任务失败\n\n${error.message || '任务执行失败'}`);
            this.showToast(error.message || '任务执行失败', 'error');
        } finally {
            await this.restoreWindowAfterCadStep();
            this.setDemoSceneRunning(false);
        }
    }

    async executeDemoSceneSubmitFromChat(conv, approval) {
        const selectedTask = approval?.selectedTask || this.demoSceneLastInspect?.selectedTask || {};
        this.setDemoSceneRunning(true);
        this.clearDemoScenePendingApproval();
        this.updateDemoSceneStep('submit', 'running', '正在提交 iCheck 检查结果...');
        this.updateDemoSceneProgressStatus('正在提交 iCheck 检查结果...', 80);
        this.appendMessageToConversationById(conv.id, 'assistant', `收到确认，正在提交任务 ${selectedTask.task_no || '-'} 的检查结果...`);
        try {
            const res = await fetch(`${BACKEND_URL}/api/demo/scene/icheck/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...this.getDemoSceneFormPayload(),
                    taskNo: selectedTask.task_no || '',
                    remark: this.buildDemoSceneRemarkText(approval?.inspectResult || this.demoSceneLastInspect, approval?.cadResult || this.demoSceneLastCad)
                })
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || '提交失败');
            this.updateDemoSceneStep('submit', 'completed', 'iCheck 检查结果已提交');
            this.updateDemoSceneProgressStatus('提交完成，等待邮件草稿确认', 88);
            this.appendMessageToConversationById(
                conv.id,
                'assistant',
                this.formatDemoSceneLines(data.result || {}, '提交完成：iCheck 检查结果已提交')
            );
            this.setDemoScenePendingApproval({
                type: 'mail',
                selectedTask,
                inspectResult: this.demoSceneLastInspect,
                cadResult: this.demoSceneLastCad,
                submitResult: data.result || null
            });
            this.appendMessageToConversationById(conv.id, 'assistant', '要生成邮件草稿吗？回复“确认”或“取消”。');
            this.showToast('提交完成，等待邮件确认', 'success');
        } catch (error) {
            this.setDemoScenePendingApproval(approval || null);
            this.updateDemoSceneStep('submit', 'error', error.message || '提交失败');
            this.updateDemoSceneProgressStatus(error.message || '提交失败', 100);
            this.appendMessageToConversationById(conv.id, 'assistant', `# 提交失败\n\n${error.message || '提交失败'}`);
            this.showToast(error.message || '提交失败', 'error');
        } finally {
            this.setDemoSceneRunning(false);
        }
    }

    async executeDemoSceneMailFromChat(conv, approval) {
        const selectedTask = approval?.selectedTask || this.demoSceneLastInspect?.selectedTask || {};
        const screenshot = approval?.cadResult?.screenshots?.[0] || this.demoSceneLastCad?.screenshots?.[0] || '';
        const subject = `【iCheck检查完成通知】${[selectedTask.task_no, selectedTask.task_name].filter(Boolean).join(' ') || '任务检查结果'}`;
        const body = [
            '您好，',
            '',
            `iCheck 检查任务已完成：${[selectedTask.task_name, selectedTask.task_no].filter(Boolean).join(' ')}`.trim(),
            this.getDemoSceneFormPayload().checkRemark || '检查结论：合格',
            '',
            `请登录 iCheck 系统确认：${this.getDemoSceneFormPayload().baseUrl || BACKEND_URL}/task/myTask/index`
        ].join('\n');
        this.setDemoSceneRunning(true);
        this.clearDemoScenePendingApproval();
        this.updateDemoSceneStep('mail', 'running', '正在生成邮件草稿...');
        this.updateDemoSceneProgressStatus('正在生成邮件草稿...', 94);
        this.appendMessageToConversationById(conv.id, 'assistant', '收到确认，正在生成邮件草稿...');
        try {
            const res = await fetch(`${BACKEND_URL}/api/demo/scene/mail/draft`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...this.getDemoSceneFormPayload(),
                    subject,
                    body,
                    attachmentPath: screenshot
                })
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || '生成邮件草稿失败');
            this.updateDemoSceneStep('mail', 'completed', '邮件草稿已生成');
            this.updateDemoSceneProgressStatus('本轮任务已完成', 100);
            this.appendMessageToConversationById(conv.id, 'assistant', [
                '# 本轮任务已完成',
                '',
                `任务：${selectedTask.task_name || '-'} (${selectedTask.task_no || '-'})`,
                `邮件收件人：${data.result?.recipient || '-'}`,
                `邮件主题：${data.result?.subject || '-'}`
            ].join('\n'));
            this.showToast('邮件草稿已生成', 'success');
        } catch (error) {
            this.setDemoScenePendingApproval(approval || null);
            this.updateDemoSceneStep('mail', 'error', error.message || '生成邮件草稿失败');
            this.updateDemoSceneProgressStatus(error.message || '生成邮件草稿失败', 100);
            this.appendMessageToConversationById(conv.id, 'assistant', `# 邮件草稿生成失败\n\n${error.message || '生成邮件草稿失败'}`);
            this.showToast(error.message || '生成邮件草稿失败', 'error');
        } finally {
            this.setDemoSceneRunning(false);
        }
    }
    
    switchConversation(conversationId) {
        const conv = this.conversations[conversationId];
        if (!conv) return;
        this.setMainContentMode('chat');
        // 若切到的对话属于其它智能体，则自动同步当前智能体，避免“上下文串台”
        if (conv.agentId && this.currentAgentId !== conv.agentId) {
            this.currentAgentId = conv.agentId;
            this.currentAgent = this.agents.find(a => a.id === conv.agentId) || this.currentAgent;
            this.updateCurrentAgentInfo();
            // 确保左侧 tab 仍在对话
            this.switchTab('conversations');
        }
        this.currentConversationId = conversationId;
        document.getElementById('current-chat-title').textContent = conv.title;
        const input = document.getElementById('chat-input');
        if (input) {
            input.placeholder = this.isDemoSceneConversation(conversationId)
                ? '例如：获取检查项 / 开始任务 / 确认 / 取消'
                : '给当前智能体发送消息...';
        }
        this.lastRuntimeModel = null;
        this.updateRuntimeModelBadge();
        this.updateTracePanel(null);
        this.updateSessionBadge();
        this.renderMessages();
    }

    deleteConversation(conversationId) {
        if (!this.conversations[conversationId]) return;
        const deletedAgentId = this.conversations[conversationId]?.agentId || null;
        delete this.conversations[conversationId];
        if (this.currentConversationId === conversationId) {
            const remaining = Object.keys(this.conversations).filter(id => {
                const c = this.conversations[id];
                if (!deletedAgentId) return !c?.agentId;
                return c?.agentId === deletedAgentId;
            });
            if (remaining.length > 0) {
                this.currentConversationId = remaining[0];
                this.switchConversation(remaining[0]);
            } else {
                this.currentConversationId = null;
                document.getElementById('current-chat-title').textContent = '新对话';
                this.updateTracePanel(null);
                this.updateSessionBadge();
                this.renderMessages();
            }
        }
        this.saveConversations();
        this.renderConversations();
        this.renderMessages();
        this.showToast('对话已删除', 'success');
        this.updateSessionBadge();
    }

    clearConversationMessages(conversationId, { silent = false } = {}) {
        const conv = this.conversations[conversationId];
        if (!conv) return false;
        conv.messages = [];
        conv.updatedAt = new Date().toISOString();
        if (!conv.fixedTitle) {
            conv.title = '新对话';
        }
        this.saveConversations();
        this.renderConversations();
        if (this.currentConversationId === conversationId) {
            this.renderMessages();
            this.updateSessionBadge();
            this.updateTracePanel(null);
        }
        if (!silent) {
            this.showToast('当前对话已清空', 'success');
        }
        return true;
    }

    clearVisibleConversationMessages() {
        const currentAgentId = this.currentAgentId || null;
        const visibleIds = Object.keys(this.conversations).filter((id) => {
            const conv = this.conversations[id];
            if (!currentAgentId) return true;
            return (conv?.agentId || null) === currentAgentId;
        });
        if (visibleIds.length === 0) return 0;
        visibleIds.forEach((id) => this.clearConversationMessages(id, { silent: true }));
        this.renderMessages();
        this.updateSessionBadge();
        this.showToast(`已清空 ${visibleIds.length} 个对话`, 'success');
        return visibleIds.length;
    }
    
    addMessageToConversation(role, content, options = {}) {
        if (!this.currentConversationId) {
            this.createConversation();
        }
        this.appendMessageToConversationById(this.currentConversationId, role, content, options);
    }
    
    generateConversationTitle(messages) {
        const userMessages = messages.filter(m => m.role === 'user');
        if (userMessages.length > 0) {
            const firstMessage = userMessages[0].content;
            return firstMessage.length > 30 
                ? firstMessage.substring(0, 30) + '...' 
                : firstMessage;
        }
        return '新对话';
    }

    getAssistantAvatarLabel() {
        const raw = String(this.currentAgent?.name || 'AI').trim();
        if (!raw) return 'AI';
        if (/[\u4e00-\u9fff]/.test(raw)) {
            return raw.slice(0, 2);
        }
        const compact = raw.replace(/[^a-zA-Z0-9]+/g, ' ').trim();
        if (!compact) return raw.slice(0, 2).toUpperCase();
        const parts = compact.split(/\s+/).filter(Boolean);
        return parts.slice(0, 2).map(p => p[0]).join('').toUpperCase();
    }

    getMessageAuthor(role) {
        if (role === 'user') return '你';
        if (role === 'channel') return '频道';
        return this.currentAgent?.name || 'DSClaw';
    }

    formatMessageTime(value = null) {
        const date = value ? new Date(value) : new Date();
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    formatConversationTime(value = null) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const diffMs = Date.now() - date.getTime();
        const minute = 60 * 1000;
        const hour = 60 * minute;
        const day = 24 * hour;
        if (diffMs < hour) {
            const mins = Math.max(1, Math.round(diffMs / minute));
            return `${mins} 分钟前`;
        }
        if (diffMs < day) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
    }

    formatRuntimeSourceLabel(source = null) {
        const value = String(source || '').trim();
        if (!value) return '';
        if (value === 'openclaw-session') return 'AI 会话';
        if (value === 'electron-openclaw-session') return '本地 AI 会话';
        return value.replace(/openclaw/ig, 'AI');
    }

    getConversationPreview(conv) {
        if (!conv || !Array.isArray(conv.messages) || conv.messages.length === 0) {
            return '新会话已创建，开始第一条消息吧。';
        }
        const last = conv.messages[conv.messages.length - 1];
        const prefix = last.role === 'user'
            ? '你'
            : last.role === 'assistant'
                ? (this.currentAgent?.name || 'AI')
                : '系统';
        return `${prefix}: ${String(last.content || '').replace(/\s+/g, ' ').trim() || '空消息'}`;
    }

    updateConnectionBadge(connected = false) {
        const el = document.getElementById('current-connection-status');
        if (!el) return;
        el.classList.remove('online', 'offline');
        if (connected) {
            el.classList.add('online');
            el.textContent = '实时已连接';
        } else {
            el.classList.add('offline');
            el.textContent = '实时未连接';
        }
    }

    updateSessionBadge() {
        const el = document.getElementById('current-session-chip');
        if (!el) return;
        if (!this.currentConversationId) {
            el.textContent = '会话: 未选择';
            return;
        }
        const id = String(this.currentConversationId);
        el.textContent = `会话: ${id.length > 28 ? id.slice(0, 28) + '...' : id}`;
    }

    initializeThemeConfig() {
        this.renderThemePresets();
        this.loadThemeConfig();
        this.fillThemeConfigForm(this.themeConfig);
        this.highlightThemePreset(this.matchThemePreset(this.themeConfig));
    }

    hexToRgba(hex, alpha = 1) {
        const value = String(hex || '').trim();
        const normalized = value.startsWith('#') ? value.slice(1) : value;
        if (!/^[0-9a-fA-F]{3,8}$/.test(normalized)) return value || '';

        if (normalized.length === 3) {
            const [r, g, b] = normalized.split('');
            return `rgba(${parseInt(r + r, 16)}, ${parseInt(g + g, 16)}, ${parseInt(b + b, 16)}, ${alpha})`;
        }

        if (normalized.length >= 6) {
            const r = parseInt(normalized.slice(0, 2), 16);
            const g = parseInt(normalized.slice(2, 4), 16);
            const b = parseInt(normalized.slice(4, 6), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }

        return value;
    }

    hexToRgbComponents(hex) {
        const value = String(hex || '').trim();
        const normalized = value.startsWith('#') ? value.slice(1) : value;
        if (!/^[0-9a-fA-F]{3,8}$/.test(normalized)) return '';
        if (normalized.length === 3) {
            const [r, g, b] = normalized.split('');
            return `${parseInt(r + r, 16)}, ${parseInt(g + g, 16)}, ${parseInt(b + b, 16)}`;
        }
        if (normalized.length >= 6) {
            const r = parseInt(normalized.slice(0, 2), 16);
            const g = parseInt(normalized.slice(2, 4), 16);
            const b = parseInt(normalized.slice(4, 6), 16);
            return `${r}, ${g}, ${b}`;
        }
        return '';
    }

    applyThemeConfig(vars = {}) {
        const root = document.documentElement;
        const merged = { ...this.themeDefaults, ...vars };
        const mapping = {
            bgPrimary: '--bg-primary',
            bgSecondary: '--bg-secondary',
            bgTertiary: '--bg-tertiary',
            bgElevated: '--bg-elevated',
            textPrimary: '--text-primary',
            textSecondary: '--text-secondary',
            accent: '--accent',
            accentHover: '--accent-hover',
            accentStrong: '--accent-strong',
            danger: '--danger'
        };
        Object.entries(mapping).forEach(([key, cssVar]) => {
            root.style.setProperty(cssVar, merged[key]);
        });
        root.style.setProperty('--accent-rgb', this.hexToRgbComponents(merged.accent));
        root.style.setProperty('--accent-hover-rgb', this.hexToRgbComponents(merged.accentHover || merged.accent));
        root.style.setProperty('--accent-strong-rgb', this.hexToRgbComponents(merged.accentStrong || merged.accentHover || merged.accent));
        root.style.setProperty('--danger-rgb', this.hexToRgbComponents(merged.danger));
        root.style.setProperty('--scrollbar-track', this.hexToRgba(merged.bgPrimary, 0.82));
        root.style.setProperty('--scrollbar-thumb', this.hexToRgba(merged.accent, 0.56));
        root.style.setProperty('--scrollbar-thumb-hover', this.hexToRgba(merged.accentHover || merged.accent, 0.76));
        root.style.setProperty('--scrollbar-thumb-active', this.hexToRgba(merged.accentStrong || merged.accentHover || merged.accent, 0.9));
        this.themeConfig = merged;
    }

    loadThemeConfig() {
        try {
            const raw = localStorage.getItem(this.themeStorageKey) || localStorage.getItem(this.legacyThemeStorageKey) || 'null';
            let saved = null;
            try {
                saved = JSON.parse(raw);
            } catch {
                saved = null;
            }
            // 过滤掉无效的空值
            const filtered = saved && typeof saved === 'object'
                ? Object.fromEntries(Object.entries(saved).filter(([_, v]) => v != null && v !== ''))
                : null;
            this.themeConfig = { ...this.themeDefaults, ...(filtered || {}) };
            if (saved && !filtered) {
                // 如果保存的值是无效的，清理掉
                localStorage.removeItem(this.themeStorageKey);
            } else if (saved) {
                localStorage.setItem(this.themeStorageKey, JSON.stringify(filtered));
            }
        } catch {
            this.themeConfig = { ...this.themeDefaults };
        }
        this.applyThemeConfig(this.themeConfig);
    }

    getThemeInputMap() {
        return {
            bgPrimary: document.getElementById('theme-bg-primary'),
            bgSecondary: document.getElementById('theme-bg-secondary'),
            bgTertiary: document.getElementById('theme-bg-tertiary'),
            bgElevated: document.getElementById('theme-bg-elevated'),
            textPrimary: document.getElementById('theme-text-primary'),
            textSecondary: document.getElementById('theme-text-secondary'),
            accent: document.getElementById('theme-accent'),
            accentHover: document.getElementById('theme-accent-hover'),
            accentStrong: document.getElementById('theme-accent-strong'),
            danger: document.getElementById('theme-danger')
        };
    }

    fillThemeConfigForm(vars = {}) {
        const inputs = this.getThemeInputMap();
        Object.entries(inputs).forEach(([key, input]) => {
            if (input) input.value = vars[key] || this.themeDefaults[key];
        });
    }

    readThemeConfigForm() {
        const inputs = this.getThemeInputMap();
        const next = {};
        Object.entries(inputs).forEach(([key, input]) => {
            if (input) next[key] = input.value;
        });
        return { ...this.themeDefaults, ...next };
    }

    matchThemePreset(vars = {}) {
        const merged = { ...this.themeDefaults, ...vars };
        const matched = this.themePresets.find((preset) =>
            Object.entries(preset.vars).every(([key, value]) => merged[key] === value)
        );
        return matched?.id || null;
    }

    highlightThemePreset(presetId = null) {
        document.querySelectorAll('.theme-preset-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.presetId === presetId);
        });
    }

    renderThemePresets() {
        const grid = document.getElementById('theme-preset-grid');
        if (!grid) return;
        grid.innerHTML = this.themePresets.map((preset) => `
            <button class="theme-preset-btn" type="button" data-preset-id="${preset.id}">
                <span class="theme-preset-name">${preset.name}</span>
                <span class="theme-preset-swatches">
                    <span class="theme-swatch" style="background:${preset.vars.bgPrimary}"></span>
                    <span class="theme-swatch" style="background:${preset.vars.bgSecondary}"></span>
                    <span class="theme-swatch" style="background:${preset.vars.accent}"></span>
                    <span class="theme-swatch" style="background:${preset.vars.accentHover}"></span>
                </span>
            </button>
        `).join('');
        grid.querySelectorAll('.theme-preset-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const preset = this.themePresets.find(item => item.id === btn.dataset.presetId);
                if (!preset) return;
                this.fillThemeConfigForm(preset.vars);
                this.applyThemeConfig(preset.vars);
                this.highlightThemePreset(preset.id);
            });
        });
    }

    openThemeConfig() {
        this.themeModalBackup = { ...this.themeConfig };
        this.fillThemeConfigForm(this.themeConfig);
        this.highlightThemePreset(this.matchThemePreset(this.themeConfig));
        this.openModal('theme-config-modal');
    }

    previewThemeConfig() {
        const vars = this.readThemeConfigForm();
        this.applyThemeConfig(vars);
        this.highlightThemePreset(this.matchThemePreset(vars));
    }

    saveThemeConfig() {
        const vars = this.readThemeConfigForm();
        this.applyThemeConfig(vars);
        if (this.matchThemePreset(vars) === 'ocean-mint' && Object.entries(this.themeDefaults).every(([key, value]) => vars[key] === value)) {
            localStorage.removeItem(this.themeStorageKey);
        } else {
            localStorage.setItem(this.themeStorageKey, JSON.stringify(vars));
        }
        this.themeModalBackup = { ...vars };
        this.closeModal('theme-config-modal');
        this.showToast('主题已保存', 'success');
    }

    resetThemeConfig() {
        this.themeConfig = { ...this.themeDefaults };
        this.fillThemeConfigForm(this.themeDefaults);
        this.applyThemeConfig(this.themeDefaults);
        this.highlightThemePreset(this.matchThemePreset(this.themeDefaults));
    }

    cancelThemeConfig() {
        this.applyThemeConfig(this.themeModalBackup || this.themeDefaults);
        this.fillThemeConfigForm(this.themeModalBackup || this.themeDefaults);
        this.highlightThemePreset(this.matchThemePreset(this.themeModalBackup || this.themeDefaults));
        this.closeModal('theme-config-modal');
    }

    updateRuntimeModelBadge({ model = null, source = null, state = 'idle' } = {}) {
        const el = document.getElementById('current-runtime-model');
        if (!el) return;
        el.classList.remove('pending', 'error');

        if (state === 'pending') {
            el.classList.add('pending');
            el.textContent = `本次请求模型: 请求中 (${model || this.currentAgent?.model || '未知'})`;
            return;
        }

        if (state === 'error') {
            el.classList.add('error');
            el.textContent = `本次请求模型: ${model || '未知'}${source ? ` · ${this.formatRuntimeSourceLabel(source)}` : ''} · 失败`;
            return;
        }

        if (model) {
            this.lastRuntimeModel = { model, source };
            el.textContent = `本次请求模型: ${model}${source ? ` · ${this.formatRuntimeSourceLabel(source)}` : ''}`;
            return;
        }

        el.textContent = '本次请求模型: 未发起';
    }

    updateTracePanel(trace = null) {
        const panel = document.getElementById('trace-panel');
        const summaryEl = document.getElementById('trace-summary');
        const metaEl = document.getElementById('trace-meta');
        const stagesEl = document.getElementById('trace-stages');
        const filesEl = document.getElementById('trace-files');
        if (!panel || !summaryEl || !metaEl || !stagesEl || !filesEl) return;

        // 先隐藏执行轨迹面板；保留数据结构与调用点，后续需要时可快速恢复
        panel.classList.add('hidden');
        panel.style.display = 'none';
        this.lastExecutionTrace = trace || null;
        summaryEl.textContent = '暂无执行信息';
        metaEl.innerHTML = '';
        stagesEl.innerHTML = '';
        filesEl.textContent = '';
        return;

        if (!trace) {
            this.lastExecutionTrace = null;
            panel.classList.add('hidden');
            summaryEl.textContent = '暂无执行信息';
            metaEl.innerHTML = '';
            stagesEl.innerHTML = '';
            filesEl.textContent = '';
            return;
        }

        this.lastExecutionTrace = trace;
        panel.classList.remove('hidden');
        summaryEl.textContent = trace.summary || 'AI 正在处理本轮请求。';

        const metaLines = [
            ['会话', trace.sessionId || '-'],
            ['来源', this.formatRuntimeSourceLabel(trace.source) || '-'],
            ['模型', trace.actualModel || '-'],
            ['耗时', trace.durationMs != null ? `${trace.durationMs}ms` : '-'],
            ['停止原因', trace.stopReason || '-'],
            ['回复段数', trace.payloadCount != null ? String(trace.payloadCount) : '-']
        ];
        metaEl.innerHTML = metaLines
            .map(([k, v]) => `<div><strong>${k}:</strong> ${v}</div>`)
            .join('');

        stagesEl.innerHTML = (trace.stages || [])
            .map(stage => {
                const prefix = stage.status === 'error' ? '❌' : stage.status === 'pending' ? '⏳' : '✅';
                return `<div class="trace-stage">${prefix} ${stage.label}</div>`;
            })
            .join('');

        const promptFiles = Array.isArray(trace.promptFiles) ? trace.promptFiles : [];
        filesEl.textContent = promptFiles.length > 0
            ? `本轮注入上下文文件: ${promptFiles.join(', ')}`
            : '';
    }

    createStreamingAssistantMessage() {
        const container = document.getElementById('chat-messages');
        const div = document.createElement('div');
        div.className = 'message message-assistant';

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = this.getAssistantAvatarLabel();

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        const metaDiv = document.createElement('div');
        metaDiv.className = 'message-meta-row';
        metaDiv.innerHTML = `
            <span class="message-author">${this.getMessageAuthor('assistant')}</span>
            <span class="message-time">${this.formatMessageTime()}</span>
        `;

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble streaming-waiting';

        const waitWrap = document.createElement('div');
        waitWrap.className = 'stream-wait';
        const waitTitle = document.createElement('div');
        waitTitle.className = 'stream-wait-title';
        waitTitle.textContent = '正在等待模型响应';
        const waitElapsed = document.createElement('div');
        waitElapsed.className = 'stream-wait-elapsed';
        waitElapsed.textContent = '0.0s';
        const waitSubtitle = document.createElement('div');
        waitSubtitle.className = 'stream-wait-subtitle';
        waitSubtitle.textContent = '消息已发送到 AI，收到首段内容后会立即开始显示。';
        const waitHeader = document.createElement('div');
        waitHeader.className = 'stream-wait-header';
        waitHeader.appendChild(waitTitle);
        waitHeader.appendChild(waitElapsed);
        const waitProgress = document.createElement('div');
        waitProgress.className = 'stream-wait-progress';
        waitProgress.innerHTML = `
            <span class="stream-wait-dot"></span>
            <span class="stream-wait-dot"></span>
            <span class="stream-wait-dot"></span>
        `;
        const waitMeta = document.createElement('div');
        waitMeta.className = 'stream-wait-meta';
        waitMeta.innerHTML = `
            <span class="stream-wait-chip">会话已绑定</span>
            <span class="stream-wait-chip">流式已开启</span>
        `;
        waitWrap.appendChild(waitHeader);
        waitWrap.appendChild(waitSubtitle);
        waitWrap.appendChild(waitProgress);
        waitWrap.appendChild(waitMeta);
        bubble.appendChild(waitWrap);

        const mdDiv = document.createElement('div');
        mdDiv.className = 'md-content';
        mdDiv.textContent = '';
        mdDiv.style.display = 'none';
        bubble.appendChild(mdDiv);

        contentDiv.appendChild(metaDiv);
        contentDiv.appendChild(bubble);
        div.appendChild(avatar);
        div.appendChild(contentDiv);
        container.appendChild(div);
        this.scrollToBottom();

        let displayedText = '';
        let targetText = '';
        let flushTimer = null;
        let waitTimer = null;
        let hasStartedContent = false;
        const startedAt = Date.now();
        const updateWaitState = () => {
            const elapsedSec = (Date.now() - startedAt) / 1000;
            waitElapsed.textContent = `${elapsedSec.toFixed(1)}s`;
            if (elapsedSec >= 12) {
                waitTitle.textContent = '响应较慢，仍在等待输出';
                waitSubtitle.textContent = '连接仍然保持中。上游模型有时会在准备完整首段后再开始连续输出。';
            } else if (elapsedSec >= 5) {
                waitTitle.textContent = '模型正在组织回复';
                waitSubtitle.textContent = '请求已成功发出，正在等待首段正文返回。';
            } else {
                waitTitle.textContent = '正在等待模型响应';
                waitSubtitle.textContent = '消息已发送到 AI，收到首段内容后会立即开始显示。';
            }
        };
        updateWaitState();
        waitTimer = window.setInterval(updateWaitState, 250);

        const enterContentMode = () => {
            if (hasStartedContent) return;
            hasStartedContent = true;
            if (waitTimer != null) {
                window.clearInterval(waitTimer);
                waitTimer = null;
            }
            waitWrap.remove();
            bubble.classList.remove('streaming-waiting');
            mdDiv.style.display = '';
        };
        const flushDisplayedText = () => {
            if (displayedText === targetText) {
                flushTimer = null;
                return;
            }
            const remaining = targetText.length - displayedText.length;
            const step = Math.max(1, Math.min(24, Math.ceil(remaining / 12)));
            displayedText = targetText.slice(0, displayedText.length + step);
            mdDiv.textContent = displayedText;
            this.scrollToBottom();
            flushTimer = window.setTimeout(flushDisplayedText, 16);
        };

        return {
            setText: (text) => {
                targetText = text || '';
                if (targetText && !hasStartedContent) {
                    enterContentMode();
                }
                if (flushTimer == null) {
                    flushDisplayedText();
                }
            },
            finalize: (text) => {
                if (flushTimer != null) {
                    window.clearTimeout(flushTimer);
                    flushTimer = null;
                }
                if (text && !hasStartedContent) {
                    enterContentMode();
                } else if (waitTimer != null) {
                    window.clearInterval(waitTimer);
                    waitTimer = null;
                }
                displayedText = text || '';
                targetText = displayedText;
                try {
                    mdDiv.innerHTML = marked.parse(displayedText);
                    setTimeout(() => {
                        mdDiv.querySelectorAll('pre code').forEach((block) => {
                            hljs.highlightElement(block);
                        });
                    }, 10);
                } catch {
                    mdDiv.textContent = displayedText;
                }
                this.scrollToBottom();
            },
            remove: () => {
                if (flushTimer != null) {
                    window.clearTimeout(flushTimer);
                }
                if (waitTimer != null) {
                    window.clearInterval(waitTimer);
                }
                div.remove();
            },
            setPendingDetail: (label, subtitle = null) => {
                waitTitle.textContent = label || waitTitle.textContent;
                if (subtitle) waitSubtitle.textContent = subtitle;
            }
        };
    }

    async sendToAIStream(message, onDelta = null) {
        if (!this.currentAgentId) {
            return null;
        }
        const conv = this.currentConversationId ? this.conversations[this.currentConversationId] : null;
        if (conv && conv.agentId && conv.agentId !== this.currentAgentId) {
            return null;
        }

        const messages = conv && conv.messages.length > 0
            ? conv.messages.map(m => ({ role: m.role, content: m.content }))
            : [{ role: 'user', content: message }];
        const conversationId = this.currentConversationId || null;

        const res = await fetch(`${BACKEND_URL}/api/chat/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                agentId: this.currentAgentId,
                conversationId,
                messages
            })
        });
        if (!res.ok || !res.body) {
            throw new Error(`stream ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let content = '';
        let meta = {
            actualModel: this.currentAgent?.model || null,
            source: 'openclaw-session',
            sessionId: conversationId,
            ok: true
        };

        const pendingTrace = {
            sessionId: conversationId || '-',
            source: 'openclaw-session',
            actualModel: this.currentAgent?.model || null,
            durationMs: null,
            stopReason: null,
            payloadCount: null,
            promptFiles: [],
            stages: [
                { key: 'session', label: `绑定会话 ${conversationId || '-'}`, status: 'completed' },
                { key: 'invoke', label: '调用 AI 智能体', status: 'pending' }
            ],
            summary: '正在调用 AI，请稍候...'
        };
        this.updateTracePanel(pendingTrace);

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                const text = line.trim();
                if (!text) continue;
                let evt;
                try {
                    evt = JSON.parse(text);
                } catch {
                    continue;
                }
                if (evt.type === 'start') {
                    meta.actualModel = evt.actualModel || meta.actualModel;
                    meta.source = evt.source || meta.source;
                    meta.sessionId = evt.sessionId || meta.sessionId;
                    this.updateRuntimeModelBadge({
                        model: meta.actualModel,
                        source: meta.source,
                        state: 'pending'
                    });
                    this.updateTracePanel({
                        ...pendingTrace,
                        sessionId: meta.sessionId || pendingTrace.sessionId,
                        actualModel: meta.actualModel || pendingTrace.actualModel
                    });
                } else if (evt.type === 'delta') {
                    content += evt.text || '';
                    if (typeof onDelta === 'function') onDelta(content);
                } else if (evt.type === 'done') {
                    content = evt.content != null ? evt.content : content;
                    if (typeof onDelta === 'function') onDelta(content);
                    meta.actualModel = evt.actualModel || meta.actualModel;
                    meta.source = evt.source || meta.source;
                    meta.sessionId = evt.sessionId || meta.sessionId;
                    meta.ok = true;
                    this.updateTracePanel(null);
                } else if (evt.type === 'error') {
                    meta.actualModel = evt.actualModel || meta.actualModel;
                    meta.source = evt.source || meta.source;
                    meta.sessionId = evt.sessionId || meta.sessionId;
                    meta.ok = false;
                    throw new Error(evt.error || 'stream error');
                }
            }
        }

        return {
            content,
            actualModel: meta.actualModel,
            source: meta.source,
            sessionId: meta.sessionId,
            trace: null,
            ok: meta.ok
        };
    }
    
    // ========== AI 交互 ==========
    
    async sendToAI(message) {
        if (!this.currentAgentId) {
            return {
                content: `# ⚠️ 请先选择一个智能体\n\n在左侧列表点击一个智能体后再发送消息。`,
                actualModel: null,
                source: null,
                trace: null,
                ok: false
            };
        }
        const conv = this.currentConversationId ? this.conversations[this.currentConversationId] : null;
        // 防止“当前智能体”和“当前对话”不一致导致串台
        if (conv && conv.agentId && conv.agentId !== this.currentAgentId) {
            this.createConversation(this.currentAgentId);
            return {
                content: `# ⚠️ 已自动为当前智能体创建新对话\n\n检测到你选中的对话属于 **${conv.agentId}**，但当前智能体是 **${this.currentAgentId}**。为避免上下文混用，我已为当前智能体新建对话，请重新发送刚才的问题。`,
                actualModel: this.currentAgent?.model || null,
                source: null,
                trace: null,
                ok: false
            };
        }
        const messages = conv && conv.messages.length > 0
            ? conv.messages.map(m => ({ role: m.role, content: m.content }))
            : [{ role: 'user', content: message }];
        const conversationId = this.currentConversationId || null;

        // 优先走后端 /api/chat，会注入当前智能体人设（identity.md）
        try {
            const res = await fetch(`${BACKEND_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    agentId: this.currentAgentId,
                    conversationId,
                    messages
                })
            });
            const raw = await res.text();
            let data;
            try {
                data = JSON.parse(raw);
            } catch (parseErr) {
                return {
                    content: `# ❌ 响应解析失败\n\n可能因响应过长或网络中断导致。请重试或缩短问题长度。\n\n**当前智能体**: ${this.currentAgent?.name || '未知'}`,
                    actualModel: this.currentAgent?.model || null,
                    source: 'backend',
                    trace: null,
                    ok: false
                };
            }
            if (data.success && data.response != null) {
                return {
                    content: data.response,
                    actualModel: data.actualModel || this.currentAgent?.model || null,
                    source: data.source || 'openclaw-session',
                    sessionId: data.sessionId || conversationId,
                    trace: data.trace || null,
                    ok: true
                };
            }
            if (res.status === 502 || res.status === 503) {
                return {
                    content: `# ❌ AI 服务不可用\n\n${data.error || 'Gateway 未配置或未启动'}\n\n**当前智能体**: ${this.currentAgent?.name || '未知'} (${this.currentAgent?.model || '未知'})`,
                    actualModel: data.actualModel || this.currentAgent?.model || null,
                    source: data.source || 'openclaw-session',
                    sessionId: data.sessionId || conversationId,
                    trace: data.trace || null,
                    ok: false
                };
            }
        } catch (e) {
            return {
                content: `# ❌ 连接错误\n\n${e.message || '请确保 DSclaw 后端正在运行 (端口 3001)。'}\n\n**当前智能体**: ${this.currentAgent?.name || '未知'} (${this.currentAgent?.model || '未知'})`,
                actualModel: this.currentAgent?.model || null,
                source: 'backend',
                trace: null,
                ok: false
            };
        }

        // 降级：Electron 直连 Gateway（无人设）
        if (window.electronAPI && window.electronAPI.sendToAI) {
            try {
                const result = await window.electronAPI.sendToAI({
                    messages,
                    model: this.currentAgent?.model,
                    agentId: this.currentAgentId,
                    conversationId
                });
                if (result.success) {
                    return {
                        content: result.response,
                        actualModel: result.actualModel || this.currentAgent?.model || null,
                        source: result.source || 'electron-openclaw-session',
                        sessionId: result.sessionId || conversationId,
                        trace: result.trace || null,
                        ok: true
                    };
                }
                return {
                    content: `# ❌ AI 响应错误\n\n${result.error}\n\n**当前智能体**: ${this.currentAgent?.name || '未知'} (${this.currentAgent?.model || '未知'})`,
                    actualModel: result.actualModel || this.currentAgent?.model || null,
                    source: result.source || 'electron-openclaw-session',
                    sessionId: result.sessionId || conversationId,
                    trace: result.trace || null,
                    ok: false
                };
            } catch (e) {
                return {
                    content: `# ❌ AI Gateway 连接错误\n\n${e.message}\n\n请确保 AI Gateway 服务正在运行。`,
                    actualModel: this.currentAgent?.model || null,
                    source: 'electron-openclaw-session',
                    sessionId: conversationId,
                    trace: null,
                    ok: false
                };
            }
        }
        return {
            content: `# 🤖 模拟 AI 响应\n\n**当前智能体**: ${this.currentAgent?.name || 'DSClaw'} (${this.currentAgent?.model || 'deepseek-v3.2'})\n\n**问题**: ${message}\n\n**回答**: 请启动后端 (端口 3001) 或配置 Electron 以使用真实 AI 与人设。`,
            actualModel: this.currentAgent?.model || null,
            source: 'mock',
            sessionId: conversationId,
            trace: null,
            ok: false
        };
    }
    
    async sendMessage() {
        const input = document.getElementById('chat-input');
        const sendBtn = document.getElementById('btn-send');
        const baseMessage = input.value.trim();
        const attachmentsMd = (this.pendingUploads || [])
            .map(item => this.buildUploadedFileMarkdown(item))
            .filter(Boolean)
            .join('\n');
        const message = [baseMessage, attachmentsMd].filter(Boolean).join('\n');
        
        if (!message) return;
        
        // 清空输入 + 清空待发送附件
        input.value = '';
        if (sendBtn) sendBtn.disabled = true;
        this.pendingUploads = [];
        this.renderAttachmentPreview();

        if (this.isDemoSceneConversation()) {
            try {
                await this.runDemoSceneAllFromChat(message, { addUserMessage: true });
            } finally {
                if (sendBtn) sendBtn.disabled = !input.value.trim();
            }
            return;
        }
        
        // 添加用户消息
        this.addMessageToConversation('user', message);
        
        this.updateRuntimeModelBadge({
            model: this.currentAgent?.model || null,
            source: 'pending',
            state: 'pending'
        });
        
        let response;
        let streamingBubble = null;
        try {
            streamingBubble = this.createStreamingAssistantMessage();
            streamingBubble.setPendingDetail(
                '正在建立会话',
                '请求已发出，正在等待 AI 返回首段内容。'
            );
            response = await this.sendToAIStream(message, (partial) => {
                if (streamingBubble) streamingBubble.setText(partial || '');
            });
        } catch (streamErr) {
            if (streamingBubble) streamingBubble.remove();
            this.showTyping();
            response = await this.sendToAI(message);
        }
        
        // 隐藏正在输入
        this.hideTyping();
        
        // 添加 AI 响应
        if (streamingBubble && response?.ok) {
            streamingBubble.finalize(response.content || '');
            this.addMessageToConversation('assistant', response.content, { appendToUI: false });
        } else {
            if (streamingBubble) streamingBubble.remove();
            this.addMessageToConversation('assistant', response.content);
        }
        this.updateRuntimeModelBadge({
            model: response.actualModel || this.currentAgent?.model || null,
            source: response.source || null,
            state: response.ok ? 'ready' : 'error'
        });
        this.updateTracePanel(response.trace || null);
        if (sendBtn) sendBtn.disabled = !input.value.trim();
    }

    isImageFile(file) {
        const type = String(file?.type || '').toLowerCase();
        return type.startsWith('image/');
    }

    buildUploadedFileMarkdown(fileItem) {
        const name = String(fileItem?.originalName || fileItem?.storedName || 'file');
        const url = `${BACKEND_URL}${String(fileItem?.url || '')}`;
        const mime = String(fileItem?.mimeType || '').toLowerCase();
        const isImage = mime.startsWith('image/');
        return isImage ? `![${name}](${url})` : `[${name}](${url})`;
    }

    formatBytes(bytes) {
        const n = Number(bytes) || 0;
        if (n <= 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        const idx = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
        const v = n / Math.pow(1024, idx);
        return `${v >= 10 || idx === 0 ? v.toFixed(0) : v.toFixed(1)} ${units[idx]}`;
    }

    renderAttachmentPreview() {
        const wrap = document.getElementById('attachment-preview');
        const grid = document.getElementById('attachment-preview-grid');
        const count = document.getElementById('attachment-preview-count');
        if (!wrap || !grid || !count) return;

        const items = Array.isArray(this.pendingUploads) ? this.pendingUploads : [];
        count.textContent = String(items.length);
        wrap.classList.toggle('active', items.length > 0);

        grid.innerHTML = items.map((item, idx) => {
            const name = String(item?.originalName || item?.storedName || 'file');
            const mime = String(item?.mimeType || '').toLowerCase();
            const isImage = mime.startsWith('image/');
            const url = `${BACKEND_URL}${String(item?.url || '')}`;
            const size = this.formatBytes(item?.size);
            const thumb = isImage
                ? `<img src="${url}" alt="${name}" />`
                : 'FILE';
            return `
                <div class="attachment-chip" data-attachment-open="${idx}" title="点击预览/打开">
                    <div class="attachment-thumb">${thumb}</div>
                    <div class="attachment-meta">
                        <div class="attachment-name">${name}</div>
                        <div class="attachment-sub">${mime || 'application/octet-stream'} · ${size}</div>
                    </div>
                    <button class="attachment-remove" type="button" data-attachment-remove="${idx}" title="移除">×</button>
                </div>
            `;
        }).join('');
    }

    async uploadFiles(fileList) {
        const files = Array.from(fileList || []).filter(Boolean);
        if (files.length === 0) return [];
        const form = new FormData();
        files.forEach(f => form.append('files', f, f.name));

        const res = await fetch(`${BACKEND_URL}/api/uploads`, {
            method: 'POST',
            body: form
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.success) {
            throw new Error(data?.error || `上传失败 (${res.status})`);
        }
        return Array.isArray(data.files) ? data.files : [];
    }
    
    // ========== UI 渲染 ==========
    
    renderAgents() {
        const list = document.getElementById('agents-list');
        const sidebarList = document.getElementById('sidebar-agents-list');
        const isMain = (el) => el && el.id === 'agents-list';

        const render = (container) => {
            container.innerHTML = '';
            if (isMain(container) && this.agents.length === 0) {
                container.innerHTML = '<div class="agents-empty">暂无智能体，点击上方「+ 新建」创建</div>';
                return;
            }
            this.agents.forEach(agent => {
                const card = document.createElement('div');
                card.className = `agent-card ${agent.id === this.currentAgentId ? 'active' : ''}`;
                card.dataset.id = agent.id;
                const delBtn = isMain(container)
                    ? `<button class="agent-delete-btn" type="button" title="删除智能体" data-id="${agent.id}">×</button>`
                    : '';
                card.innerHTML = `
                    <div class="agent-header">
                        <div class="agent-header-left">
                            <div class="agent-name">${agent.name}</div>
                            <div class="agent-model">${agent.model}</div>
                        </div>
                        <div class="agent-header-actions">
                            <button class="agent-edit-btn" type="button" title="编辑人设" data-id="${agent.id}">编辑</button>
                            ${delBtn}
                        </div>
                    </div>
                    <div class="agent-status online">在线</div>
                `;
                card.onclick = (e) => {
                    if (e.target.closest('.agent-edit-btn')) {
                        e.stopPropagation();
                        this.openEditPersonaModal(agent);
                    } else if (e.target.closest('.agent-delete-btn')) {
                        e.stopPropagation();
                        this.deleteAgent(agent.id);
                    } else {
                        this.switchAgent(agent.id);
                    }
                };
                container.appendChild(card);
            });
        };

        render(list);
        render(sidebarList);
    }

    async deleteAgent(agentId) {
        if (!confirm('确定要删除该智能体吗？')) return;
        try {
            const res = await fetch(`${API_BASE}/api/agents/${agentId}`, { method: 'DELETE' });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || '删除失败');
            if (this.currentAgentId === agentId) {
                const rest = this.agents.filter(a => a.id !== agentId);
                this.currentAgentId = rest.length ? rest[0].id : null;
                this.currentAgent = rest.length ? rest[0] : null;
                if (!this.currentAgentId) this.createConversation('default');
                else this.createConversation(this.currentAgentId);
                this.updateCurrentAgentInfo();
            }
            await this.loadAgents();
            this.currentAgent = this.agents.find(a => a.id === this.currentAgentId) || null;
            this.updateCurrentAgentInfo();
        } catch (e) {
            this.showToast(e.message || '删除失败');
        }
    }
    
    renderChannels() {
        const list = document.getElementById('channels-list');
        const sidebarList = document.getElementById('sidebar-channels-list');
        const isMain = (el) => el && el.id === 'channels-list';

        const render = (container) => {
            container.innerHTML = '';
            if (!isMain(container)) {
                const demoCard = document.createElement('div');
                demoCard.className = 'channel-card demo-entry';
                demoCard.innerHTML = `
                    <div class="channel-header">
                        <div class="channel-name">iCheck检查项完成</div>
                        <div class="channel-header-right">
                            <span class="demo-entry-badge">REAL</span>
                        </div>
                    </div>
                    <div class="channel-desc">先查检查项，再在聊天里推进任务；到提交和发送前会停下来问你</div>
                `;
                demoCard.onclick = () => this.openDemoSceneChat(false);
                container.appendChild(demoCard);
            }
            if (isMain(container) && this.channels.length === 0) {
                container.innerHTML = '<div class="channels-empty">暂无频道，点击上方「+ 新建」创建</div>';
                return;
            }
            this.channels.forEach(channel => {
                const card = document.createElement('div');
                card.className = 'channel-card';
                card.dataset.id = channel.id;
                const delBtn = isMain(container)
                    ? `<button class="channel-delete-btn" type="button" title="删除频道" data-id="${channel.id}">×</button>`
                    : '';
                card.innerHTML = `
                    <div class="channel-header">
                        <div class="channel-name"># ${channel.name}</div>
                        <div class="channel-header-right">
                            <span class="channel-count">${channel.subscriber_count || 0}</span>
                            ${delBtn}
                        </div>
                    </div>
                    <div class="channel-desc">${channel.description || '无描述'}</div>
                `;
                card.onclick = (e) => {
                    if (e.target.closest('.channel-delete-btn')) {
                        e.stopPropagation();
                        this.deleteChannel(channel.id);
                    } else {
                        this.showChannelInfo(channel.id);
                    }
                };
                container.appendChild(card);
            });
        };

        render(list);
        render(sidebarList);
    }

    appendDemoSceneLog(message, replace = false) {
        const logEl = document.getElementById('demo-scene-log');
        if (!logEl) return;
        logEl.textContent = replace ? String(message || '') : `${logEl.textContent}\n${String(message || '')}`.trim();
        logEl.scrollTop = logEl.scrollHeight;
    }

    setMainContentMode(mode = 'chat') {
        this.mainContentMode = mode === 'demoScene' ? 'demoScene' : mode === 'kasm' ? 'kasm' : 'chat';
        const demoPage = document.getElementById('demo-scene-page');
        const kasmWorkbench = document.getElementById('kasm-workbench');
        const contentSurface = document.querySelector('.content-surface');
        const chatMessages = document.getElementById('chat-messages');
        const chatInput = document.querySelector('.chat-input-container');
        const tracePanel = document.getElementById('trace-panel');
        const titleEl = document.getElementById('current-chat-title');
        const sessionEl = document.getElementById('current-session-chip');
        const runtimeEl = document.getElementById('current-runtime-model');

        if (this.mainContentMode === 'demoScene') {
            if (contentSurface) contentSurface.classList.remove('kasm-focus');
            if (demoPage) demoPage.classList.add('active');
            if (chatMessages) chatMessages.style.display = 'none';
            if (chatInput) chatInput.style.display = 'none';
            if (tracePanel) tracePanel.style.display = 'none';
            if (titleEl) titleEl.textContent = 'iCheck检查项完成';
            if (sessionEl) sessionEl.textContent = '快捷入口: 演示流程';
            if (runtimeEl) runtimeEl.textContent = '固定演示流程';
            return;
        }

        if (this.mainContentMode === 'kasm') {
            if (contentSurface) contentSurface.classList.add('kasm-focus');
            if (demoPage) demoPage.classList.remove('active');
            if (kasmWorkbench) kasmWorkbench.classList.add('active');
            if (chatMessages) chatMessages.style.display = 'none';
            if (chatInput) chatInput.style.display = 'none';
            if (tracePanel) tracePanel.style.display = 'none';
            if (titleEl) titleEl.textContent = 'Kasm 内嵌会话';
            if (sessionEl) sessionEl.textContent = '工作台: Kasm';
            if (runtimeEl) runtimeEl.textContent = 'Docker Kasm Workspace';
            return;
        }

        if (contentSurface) contentSurface.classList.remove('kasm-focus');
        if (demoPage) demoPage.classList.remove('active');
        if (kasmWorkbench) kasmWorkbench.classList.remove('active');
        if (chatMessages) chatMessages.style.display = '';
        if (chatInput) chatInput.style.display = '';
        if (tracePanel && !tracePanel.classList.contains('hidden')) {
            tracePanel.style.display = '';
        }
    }

    createDemoSceneWorkflowSteps() {
        return [
            { key: 'inspect', title: '1. iCheck 任务采集', status: 'pending', message: '等待开始' },
            { key: 'cad', title: '2. FreeCAD GUI 截图', status: 'pending', message: '等待开始' },
            { key: 'submit', title: '3. iCheck 结果提交', status: 'pending', message: '等待开始' },
            { key: 'mail', title: '4. 邮件草稿生成', status: 'pending', message: '等待开始' }
        ];
    }

    resetDemoSceneWorkflowProgress(statusText = '等待开始') {
        this.demoSceneWorkflowProgress = {
            percent: 0,
            statusText,
            steps: this.createDemoSceneWorkflowSteps()
        };
        this.renderDemoSceneWorkflowProgress();
    }

    getDemoSceneStepBadgeText(status) {
        if (status === 'running') return '执行中';
        if (status === 'completed') return '已完成';
        if (status === 'error') return '失败';
        return '未开始';
    }

    renderDemoSceneWorkflowProgress() {
        const progress = this.demoSceneWorkflowProgress || { percent: 0, statusText: '等待开始', steps: [] };
        const textEl = document.getElementById('demo-scene-progress-text');
        const percentEl = document.getElementById('demo-scene-progress-percent');
        const barEl = document.getElementById('demo-scene-progress-bar-fill');
        const listEl = document.getElementById('demo-scene-step-list');
        if (textEl) textEl.textContent = progress.statusText || '等待开始';
        if (percentEl) percentEl.textContent = `${Math.max(0, Math.min(100, Number(progress.percent) || 0))}%`;
        if (barEl) barEl.style.width = `${Math.max(0, Math.min(100, Number(progress.percent) || 0))}%`;
        if (listEl) {
            listEl.innerHTML = (progress.steps || []).map(step => `
                <div class="demo-scene-step is-${step.status || 'pending'}">
                    <div class="demo-scene-step-top">
                        <div class="demo-scene-step-title">${step.title}</div>
                        <div class="demo-scene-step-badge">${this.getDemoSceneStepBadgeText(step.status)}</div>
                    </div>
                    <div class="demo-scene-step-message">${step.message || '等待开始'}</div>
                </div>
            `).join('');
        }
    }

    setDemoSceneRunning(isRunning) {
        this.demoSceneIsRunning = Boolean(isRunning);
        this.renderDemoSceneRunButton();
    }

    updateDemoSceneProgressStatus(statusText, percent = null) {
        if (!this.demoSceneWorkflowProgress) this.resetDemoSceneWorkflowProgress();
        this.demoSceneWorkflowProgress.statusText = statusText || this.demoSceneWorkflowProgress.statusText;
        if (percent !== null && percent !== undefined) {
            this.demoSceneWorkflowProgress.percent = Math.max(0, Math.min(100, Number(percent) || 0));
        }
        this.renderDemoSceneWorkflowProgress();
    }

    updateDemoSceneStep(stepKey, status, message = '') {
        if (!this.demoSceneWorkflowProgress) this.resetDemoSceneWorkflowProgress();
        const steps = Array.isArray(this.demoSceneWorkflowProgress.steps) ? this.demoSceneWorkflowProgress.steps : [];
        const step = steps.find(item => item.key === stepKey);
        if (!step) return;
        step.status = status || step.status;
        if (message) step.message = message;
        this.renderDemoSceneWorkflowProgress();
    }

    async setDemoSceneWindowState(action) {
        if (!window.electronAPI?.setDemoSceneWindowState) return;
        try {
            const result = await window.electronAPI.setDemoSceneWindowState(action);
            if (!result?.success) {
                console.warn('切换演示窗口状态失败:', result?.error || action);
            }
        } catch (error) {
            console.warn('切换演示窗口状态失败:', error);
        }
    }

    async hideWindowForCadStep() {
        if (this.demoSceneWindowHiddenForCad) return;
        this.demoSceneWindowHiddenForCad = true;
        await this.setDemoSceneWindowState('hide-for-cad');
    }

    async restoreWindowAfterCadStep() {
        if (!this.demoSceneWindowHiddenForCad) return;
        this.demoSceneWindowHiddenForCad = false;
        await this.setDemoSceneWindowState('restore-after-cad');
    }

    handleDemoSceneExecutionUpdate(evt) {
        if (evt?.kind !== 'demo_scene_workflow') return;
        if (!evt?.requestId) return;
        if (this.demoSceneRunRequestId && evt.requestId !== this.demoSceneRunRequestId) return;
        if (!this.demoSceneRunRequestId) this.demoSceneRunRequestId = evt.requestId;

        if (evt.message) {
            const ts = new Date().toLocaleTimeString();
            this.appendDemoSceneLog(`[${ts}] ${evt.message}`);
            const eventKey = `${evt.requestId}:${evt.step || 'workflow'}:${evt.status || 'unknown'}:${evt.message}`;
            if (eventKey !== this.demoSceneLastWorkflowEventKey && this.conversations[this.demoSceneChatConversationId]) {
                this.demoSceneLastWorkflowEventKey = eventKey;
                this.appendMessageToConversationById(
                    this.demoSceneChatConversationId,
                    'assistant',
                    `**${evt.step === 'workflow' ? '流程' : evt.step || '步骤'}**：${evt.message}`
                );
            }
        }

        if (evt.step && evt.step !== 'workflow') {
            this.updateDemoSceneStep(evt.step, evt.status || 'pending', evt.message || '');
        }

        if (evt.step === 'cad' && evt.status === 'running') {
            this.hideWindowForCadStep();
        }
        if (evt.step === 'cad' && (evt.status === 'completed' || evt.status === 'error')) {
            this.restoreWindowAfterCadStep();
        }

        if (evt.step === 'workflow') {
            this.updateDemoSceneProgressStatus(evt.message || '正在执行 iCheck 检查项完成流程...', evt.progress);
        } else if (evt.message || evt.progress !== undefined) {
            this.updateDemoSceneProgressStatus(
                evt.message || this.demoSceneWorkflowProgress?.statusText || '正在执行 iCheck 检查项完成流程...',
                evt.progress
            );
        }

        if (evt.status === 'running') {
            this.setDemoSceneRunning(true);
        }

        if (evt.status === 'error') {
            this.restoreWindowAfterCadStep();
            if (evt.step && evt.step !== 'workflow') {
                this.updateDemoSceneStep(evt.step, 'error', evt.error || evt.message || '执行失败');
            }
            this.updateDemoSceneProgressStatus(evt.error || evt.message || '完整流程执行失败', evt.progress ?? 100);
            this.setDemoSceneRunning(false);
        }

        if (evt.step === 'workflow' && evt.status === 'completed') {
            this.restoreWindowAfterCadStep();
            this.updateDemoSceneProgressStatus(evt.message || 'iCheck 检查项完成流程已完成', evt.progress ?? 100);
            this.setDemoSceneRunning(false);
        }
    }

    getDemoSceneFormPayload() {
        return { ...this.demoSceneFixedConfig };
    }

    buildDemoSceneRemarkText(inspectResult, cadResult) {
        if (this.getDemoSceneFormPayload().checkRemark) {
            return this.getDemoSceneFormPayload().checkRemark;
        }
        const task = inspectResult?.selectedTask || {};
        const screenshot = cadResult?.screenshots?.[0] || '';
        const lines = [
            `任务 ${task.task_no || ''} ${task.task_name || ''} 已完成 GUI 演示检查。`.trim(),
            `检查项数量：${inspectResult?.checkItemCount ?? 0}。`,
            '检查结论：合格。'
        ];
        if (screenshot) lines.push(`截图文件：${screenshot}`);
        return lines.join('\n');
    }

    formatDemoSceneLines(result, title) {
        const lines = [title];
        if (result?.message) lines.push(result.message);
        if (result?.selectedTask) {
            lines.push(`当前任务: ${result.selectedTask.task_name || '-'} (${result.selectedTask.task_no || '-'})`);
        }
        if (result?.taskCount !== undefined) lines.push(`任务总数: ${result.taskCount}`);
        if (result?.checkItemCount !== undefined) lines.push(`检查项数量: ${result.checkItemCount}`);
        if (Array.isArray(result?.checkItems) && result.checkItems.length > 0) {
            lines.push('', '检查项:');
            result.checkItems.slice(0, 6).forEach((item) => {
                const name = item.name || item.taskItemNo || item.id || '-';
                lines.push(`- ${item.taskItemNo ? `${item.taskItemNo} ` : ''}${name}`);
                lines.push(`  要求：${item.requirement || '无'}`);
            });
            if (result.checkItems.length > 6) {
                lines.push(`- ... 还有 ${result.checkItems.length - 6} 项`);
            }
        }
        if (result?.currentUrl) lines.push(`当前页面: ${result.currentUrl}`);
        if (Array.isArray(result?.screenshots) && result.screenshots.length > 0) {
            lines.push('', '截图文件:');
            result.screenshots.forEach(item => lines.push(item));
        }
        return lines.join('\n');
    }

    async saveDemoSceneConfig() {
        this.demoSceneConfig = { ...this.demoSceneFixedConfig };
        return { success: true, config: this.demoSceneConfig };
    }

    async openDemoSceneModal() {
        this.openDemoSceneChat(false);
    }

    async runDemoSceneInspect() {
        this.appendDemoSceneLog('正在试跑 iCheck 任务采集，请留意浏览器窗口...', true);
        try {
            await this.saveDemoSceneConfig();
            const res = await fetch(`${BACKEND_URL}/api/demo/scene/icheck/inspect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.getDemoSceneFormPayload())
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || '试跑失败');

            const result = data.result || {};
            this.demoSceneLastInspect = result;
            this.appendDemoSceneLog(this.formatDemoSceneLines(result, 'iCheck 任务采集完成'), true);
            this.showToast('iCheck 任务采集试跑完成', 'success');
        } catch (error) {
            this.appendDemoSceneLog(error.message || '试跑失败', true);
            this.showToast(error.message || '试跑失败', 'error');
        }
    }

    async runDemoSceneCadCapture() {
        this.appendDemoSceneLog('正在打开 FreeCAD 并执行 GUI 截图...', true);
        try {
            await this.saveDemoSceneConfig();
            const res = await fetch(`${BACKEND_URL}/api/demo/scene/cad/capture`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.getDemoSceneFormPayload())
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'CAD 截图失败');
            this.demoSceneLastCad = data.result || null;
            this.appendDemoSceneLog(this.formatDemoSceneLines(data.result || {}, 'FreeCAD GUI 截图完成'), true);
            this.showToast('FreeCAD GUI 截图完成', 'success');
        } catch (error) {
            this.appendDemoSceneLog(error.message || 'CAD 截图失败', true);
            this.showToast(error.message || 'CAD 截图失败', 'error');
        }
    }

    async runDemoSceneSubmit() {
        this.appendDemoSceneLog('正在提交 iCheck 检查结果...', true);
        try {
            await this.saveDemoSceneConfig();
            const payload = {
                ...this.getDemoSceneFormPayload(),
                taskNo: this.demoSceneLastInspect?.selectedTask?.task_no || '',
                taskDetailUrl: this.demoSceneLastInspect?.currentUrl || '',
                remark: this.buildDemoSceneRemarkText(this.demoSceneLastInspect, this.demoSceneLastCad)
            };
            const res = await fetch(`${BACKEND_URL}/api/demo/scene/icheck/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || '提交失败');
            this.appendDemoSceneLog(this.formatDemoSceneLines(data.result || {}, 'iCheck 结果提交完成'), true);
            this.showToast('iCheck 结果提交完成', 'success');
        } catch (error) {
            this.appendDemoSceneLog(error.message || '提交失败', true);
            this.showToast(error.message || '提交失败', 'error');
        }
    }

    async runDemoSceneMailDraft() {
        this.appendDemoSceneLog('正在生成 Mail 草稿...', true);
        try {
            await this.saveDemoSceneConfig();
            const task = this.demoSceneLastInspect?.selectedTask || {};
            const screenshot = this.demoSceneLastCad?.screenshots?.[0] || '';
            const subject = `【iCheck检查完成通知】${[task.task_no, task.task_name].filter(Boolean).join(' ') || '任务检查结果'}`;
            const body = [
                '您好，',
                '',
                `iCheck 检查任务已完成：${[task.task_name, task.task_no].filter(Boolean).join(' ')}`.trim(),
                this.getDemoSceneFormPayload().checkRemark || '检查结论：合格',
                '',
                `请登录 iCheck 系统确认：${this.getDemoSceneFormPayload().baseUrl || BACKEND_URL}/task/myTask/index`
            ].join('\n');
            const res = await fetch(`${BACKEND_URL}/api/demo/scene/mail/draft`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...this.getDemoSceneFormPayload(),
                    subject,
                    body,
                    attachmentPath: screenshot
                })
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || '生成邮件草稿失败');
            this.appendDemoSceneLog(`Mail 草稿已生成\n收件人: ${data.result?.recipient || '-'}\n主题: ${data.result?.subject || '-'}`, true);
            this.showToast('Mail 草稿已生成', 'success');
        } catch (error) {
            this.appendDemoSceneLog(error.message || '生成邮件草稿失败', true);
            this.showToast(error.message || '生成邮件草稿失败', 'error');
        }
    }

    async runDemoSceneAll() {
        const triggerMessage = this.demoScenePendingApproval
            ? '确认'
            : (this.demoSceneLastInspect?.selectedTask ? '开始任务' : '获取 iCheck 的检查项');
        await this.runDemoSceneAllFromChat(triggerMessage, { addUserMessage: false });
    }

    async deleteChannel(channelId) {
        if (!confirm('确定要删除该频道吗？')) return;
        try {
            const res = await fetch(`${API_BASE}/api/channels/${channelId}`, { method: 'DELETE' });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || '删除失败');
            await this.loadChannels();
        } catch (e) {
            this.showToast(e.message || '删除失败');
        }
    }
    
    renderTasks() {
        const container = document.getElementById('tasks-list');
        container.innerHTML = '';
        
        this.tasks.forEach(task => {
            const item = document.createElement('div');
            item.className = `task-item ${task.completed ? 'done' : ''}`;
            item.dataset.id = task.id;
            item.innerHTML = `
                <div class="task-check" onclick="window.app.toggleTask('${task.id}')"></div>
                <div class="task-text">${task.description}</div>
            `;
            container.appendChild(item);
        });
    }
    
    renderConversations() {
        const list = document.getElementById('conversation-list');
        list.innerHTML = '';
        const currentAgentId = this.currentAgentId || null;
        const visibleIds = Object.keys(this.conversations).filter(id => {
            const conv = this.conversations[id];
            if (!currentAgentId) return true;
            return (conv?.agentId || null) === currentAgentId;
        });

        const sortedIds = visibleIds.sort((a, b) => {
            const tA = this.conversations[a]?.updatedAt || this.conversations[a]?.createdAt || a;
            const tB = this.conversations[b]?.updatedAt || this.conversations[b]?.createdAt || b;
            return tB > tA ? 1 : tB < tA ? -1 : 0;
        });
        
        if (sortedIds.length === 0) {
            list.innerHTML = '<div class="conversation-empty">当前智能体暂无对话，点击上方「+ 新对话」开始</div>';
            return;
        }
        
        sortedIds.forEach(id => {
            const conv = this.conversations[id];
            if (!conv) return;
            const item = document.createElement('div');
            item.className = 'conversation-item' + (id === this.currentConversationId ? ' active' : '');
            item.dataset.id = id;
            const preview = this.getConversationPreview(conv);
            const when = this.formatConversationTime(conv.updatedAt || conv.createdAt);
            item.innerHTML = `
                <div class="conversation-item-body">
                    <div class="conversation-item-meta">
                        <span class="conversation-item-title">${conv.title || '未命名对话'}</span>
                        <span class="conversation-item-time">${when}</span>
                    </div>
                    <div class="conversation-item-preview">${preview}</div>
                </div>
                <button class="conversation-item-delete" type="button" title="删除对话" data-id="${id}">×</button>
            `;
            item.onclick = (e) => {
                if (e.target.closest('.conversation-item-delete')) return;
                this.switchConversation(id);
            };
            item.querySelector('.conversation-item-delete').onclick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.deleteConversation(id);
            };
            list.appendChild(item);
        });
    }
    
    renderMessages() {
        const container = document.getElementById('chat-messages');
        container.innerHTML = '';
        
        if (!this.currentConversationId || !this.conversations[this.currentConversationId]) {
            return;
        }
        
        const conv = this.conversations[this.currentConversationId];
        
        if (conv.messages.length === 0) {
            // 显示欢迎信息
            this.addMessageToUI('assistant', `# 👋 你好！我是 ${this.currentAgent?.name || 'DSClaw'}\n\n**模型**: ${this.currentAgent?.model || 'deepseek-v3.2'}\n**当前时间**: ${new Date().toLocaleString()}\n\n我是一个功能完整的 AI 助手，支持多智能体、频道通信、记忆编译等功能。`);
        } else {
            conv.messages.forEach(msg => {
                this.addMessageToUI(msg.role, msg.content, msg.createdAt || null);
            });
        }
        
        this.scrollToBottom();
    }
    
    addMessageToUI(role, content, createdAt = null) {
        const container = document.getElementById('chat-messages');
        const div = document.createElement('div');
        div.className = `message message-${role}`;
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = role === 'user' ? '你' : this.getAssistantAvatarLabel();
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        const metaDiv = document.createElement('div');
        metaDiv.className = 'message-meta-row';
        metaDiv.innerHTML = `
            <span class="message-author">${this.getMessageAuthor(role)}</span>
            <span class="message-time">${this.formatMessageTime(createdAt)}</span>
        `;
        
        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        
        if (role === 'assistant') {
            try {
                const html = marked.parse(content);
                const mdDiv = document.createElement('div');
                mdDiv.className = 'md-content';
                mdDiv.innerHTML = html;
                bubble.appendChild(mdDiv);
                
                // 代码高亮
                setTimeout(() => {
                    mdDiv.querySelectorAll('pre code').forEach((block) => {
                        hljs.highlightElement(block);
                    });
                }, 10);
            } catch (e) {
                console.error('Markdown parsing error:', e);
                bubble.textContent = content;
            }
        } else {
            bubble.textContent = content;
        }
        
        contentDiv.appendChild(metaDiv);
        contentDiv.appendChild(bubble);
        div.appendChild(avatar);
        div.appendChild(contentDiv);
        container.appendChild(div);
    }
    
    updateCurrentAgentInfo() {
        if (this.currentAgent) {
            const displayName = this.currentAgent.name || this.currentAgent.id || '未命名';
            const nameEl = document.getElementById('current-agent-name');
            if (nameEl) nameEl.textContent = displayName;
            const chatAgentNameEl = document.getElementById('current-chat-agent-name');
            if (chatAgentNameEl) {
                chatAgentNameEl.textContent = `当前智能体 · ${displayName}`;
            }
            const chatAgentBadgeEl = document.getElementById('current-chat-agent-badge');
            if (chatAgentBadgeEl) {
                chatAgentBadgeEl.textContent = `智能体: ${displayName}`;
            }
            const modelEl = document.getElementById('current-agent-model');
            if (modelEl) modelEl.textContent = this.currentAgent.model;
            if (!this.lastRuntimeModel) {
                this.updateRuntimeModelBadge();
            }
        } else {
            const chatAgentNameEl = document.getElementById('current-chat-agent-name');
            if (chatAgentNameEl) {
                chatAgentNameEl.textContent = '当前智能体 · 未选择';
            }
            const chatAgentBadgeEl = document.getElementById('current-chat-agent-badge');
            if (chatAgentBadgeEl) {
                chatAgentBadgeEl.textContent = '智能体: 未选择';
            }
        }
    }
    
    updateUI() {
        this.updateCurrentAgentInfo();
        this.updateConnectionBadge(false);
        this.updateSessionBadge();
    }
    
    // ========== 事件绑定 ==========
    
    bindEvents() {
        // 对话按钮
        document.getElementById('new-chat-btn')?.addEventListener('click', () => this.createConversation());
        document.getElementById('new-conversation-in-tab-btn')?.addEventListener('click', () => this.createConversation());
        document.getElementById('clear-current-conversation-btn')?.addEventListener('click', () => {
            if (!this.currentConversationId) {
                this.showToast('当前没有可清空的对话', 'info');
                return;
            }
            if (!confirm('确定清空当前对话吗？')) return;
            this.clearConversationMessages(this.currentConversationId);
        });
        document.getElementById('clear-conversations-in-tab-btn')?.addEventListener('click', () => {
            if (!confirm('确定清空当前智能体下的全部对话吗？')) return;
            const cleared = this.clearVisibleConversationMessages();
            if (!cleared) {
                this.showToast('当前没有可清空的对话', 'info');
            }
        });
        document.getElementById('workspace-settings-btn')?.addEventListener('click', () => this.openModal('workspace-settings-modal'));
        
        // 智能体按钮
        document.getElementById('create-agent-btn')?.addEventListener('click', () => this.openModal('create-agent-modal'));
        document.getElementById('agents-tab-new-btn')?.addEventListener('click', () => this.openModal('create-agent-modal'));
        document.getElementById('channels-tab-new-btn')?.addEventListener('click', () => this.openModal('create-channel-modal'));
        document.getElementById('collab-refresh-all-btn')?.addEventListener('click', () => this.refreshCollabAll());
        document.getElementById('save-agent-btn')?.addEventListener('click', async () => {
            const name = document.getElementById('agent-name').value;
            const agentId = document.getElementById('agent-id')?.value?.trim();
            const model = document.getElementById('agent-model').value;
            const personality = document.getElementById('agent-personality').value;
            
            if (!name.trim()) {
                this.showToast('请输入智能体名称', 'error');
                return;
            }
            
            await this.createAgent(name, model, personality, agentId || null);
        });
        
        // 编辑人设
        document.getElementById('close-edit-persona-modal')?.addEventListener('click', () => this.closeModal('edit-persona-modal'));
        document.getElementById('cancel-edit-persona-btn')?.addEventListener('click', () => this.closeModal('edit-persona-modal'));
        document.getElementById('save-edit-persona-btn')?.addEventListener('click', () => this.saveEditPersona());
        
        // 频道按钮
        document.getElementById('create-channel-btn')?.addEventListener('click', () => this.openModal('create-channel-modal'));
        document.getElementById('save-channel-btn')?.addEventListener('click', async () => {
            const name = document.getElementById('channel-name').value;
            const desc = document.getElementById('channel-desc').value;
            
            if (!name.trim()) {
                this.showToast('请输入频道名称', 'error');
                return;
            }
            
            await this.createChannel(name, desc);
        });
        
        // 记忆编译
        document.getElementById('save-memory-btn')?.addEventListener('click', async () => {
            const type = document.getElementById('compile-daily').checked ? 'daily' :
                        document.getElementById('compile-weekly').checked ? 'weekly' : 'longterm';
            await this.compileMemory(type);
        });

        // openclaw.json
        document.getElementById('openclaw-config-btn')?.addEventListener('click', () => this.openOpenClawConfig());
        document.getElementById('close-openclaw-config-modal')?.addEventListener('click', () => this.closeModal('openclaw-config-modal'));
        document.getElementById('cancel-openclaw-config-btn')?.addEventListener('click', () => this.closeModal('openclaw-config-modal'));
        document.getElementById('save-openclaw-config-btn')?.addEventListener('click', () => this.saveOpenClawConfig());
        document.getElementById('close-theme-config-modal')?.addEventListener('click', () => this.cancelThemeConfig());
        document.getElementById('cancel-theme-config-btn')?.addEventListener('click', () => this.cancelThemeConfig());
        document.getElementById('save-theme-config-btn')?.addEventListener('click', () => this.saveThemeConfig());
        document.getElementById('reset-theme-btn')?.addEventListener('click', () => this.resetThemeConfig());
        Object.values(this.getThemeInputMap()).forEach((input) => {
            input?.addEventListener('input', () => this.previewThemeConfig());
        });
        document.getElementById('close-workspace-settings-modal')?.addEventListener('click', () => this.closeModal('workspace-settings-modal'));
        document.getElementById('close-workspace-settings-btn')?.addEventListener('click', () => this.closeModal('workspace-settings-modal'));
        document.getElementById('demo-scene-run-inspect-btn')?.addEventListener('click', async () => this.runDemoSceneInspect());
        document.getElementById('demo-scene-run-cad-btn')?.addEventListener('click', async () => this.runDemoSceneCadCapture());
        document.getElementById('demo-scene-run-submit-btn')?.addEventListener('click', async () => this.runDemoSceneSubmit());
        document.getElementById('demo-scene-run-mail-btn')?.addEventListener('click', async () => this.runDemoSceneMailDraft());
        document.getElementById('demo-scene-run-all-btn')?.addEventListener('click', async () => this.runDemoSceneAll());
        document.getElementById('settings-theme-btn')?.addEventListener('click', () => {
            this.closeModal('workspace-settings-modal');
            this.openThemeConfig();
        });
        document.getElementById('settings-new-agent-btn')?.addEventListener('click', () => {
            this.closeModal('workspace-settings-modal');
            this.openModal('create-agent-modal');
        });
        document.getElementById('settings-new-channel-btn')?.addEventListener('click', () => {
            this.closeModal('workspace-settings-modal');
            this.openModal('create-channel-modal');
        });
        document.getElementById('settings-memory-btn')?.addEventListener('click', () => {
            this.closeModal('workspace-settings-modal');
            this.openModal('compile-memory-modal');
        });
        document.getElementById('settings-openclaw-btn')?.addEventListener('click', () => {
            this.closeModal('workspace-settings-modal');
            this.openOpenClawConfig();
        });

        // Agent 核心文件编辑入口（在“编辑智能体人设”弹窗内）
        document.getElementById('edit-file-soul-btn')?.addEventListener('click', () => this.openAgentFileEditor('SOUL.md'));
        document.getElementById('edit-file-agents-btn')?.addEventListener('click', () => this.openAgentFileEditor('AGENTS.md'));
        document.getElementById('edit-file-user-btn')?.addEventListener('click', () => this.openAgentFileEditor('USER.md'));
        document.getElementById('edit-file-tools-btn')?.addEventListener('click', () => this.openAgentFileEditor('TOOLS.md'));

        // Agent 文件编辑器弹窗
        document.getElementById('close-agent-file-modal')?.addEventListener('click', () => this.closeModal('agent-file-modal'));
        document.getElementById('cancel-agent-file-btn')?.addEventListener('click', () => this.closeModal('agent-file-modal'));
        document.getElementById('save-agent-file-btn')?.addEventListener('click', () => this.saveAgentFile());
        
        // 模态框关闭
        document.querySelectorAll('.modal-close, .btn-secondary').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (e.currentTarget?.id === 'reset-theme-btn') return;
                const modal = e.target.closest('.modal');
                if (!modal) return;
                if (modal.id === 'theme-config-modal') {
                    this.cancelThemeConfig();
                    return;
                }
                this.closeModal(modal.id);
            });
        });
        
        // 选项卡
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.target.dataset.tab;
                this.switchTab(tab);
            });
        });

        // 技能：搜索与刷新
        const skillsSearch = document.getElementById('skills-search');
        const skillsRefresh = document.getElementById('skills-refresh-btn');
        if (skillsSearch) {
            skillsSearch.addEventListener('input', () => {
                this._skillsQuery = skillsSearch.value.trim();
                this.skillsLoaded = false;
                const isActive = document.getElementById('skills-tab')?.classList.contains('active');
                if (isActive) this.loadSkills({ force: true });
            });
        }
        if (skillsRefresh) {
            skillsRefresh.addEventListener('click', () => {
                this.skillsLoaded = false;
                this.loadSkills({ force: true });
            });
        }

        // 技能：帮助按钮（事件代理）
        const skillsList = document.getElementById('skills-list');
        if (skillsList) {
            skillsList.addEventListener('click', (e) => {
                const expertBtn = e.target.closest('[data-skill-to-expert]');
                if (expertBtn) {
                    const skillId = expertBtn.getAttribute('data-skill-to-expert');
                    if (skillId) this.applySkillToExpert(skillId);
                    return;
                }

                const btn = e.target.closest('[data-skill-help]');
                if (!btn) return;
                const skillId = btn.getAttribute('data-skill-help');
                if (skillId) this.openSkillHelp(skillId);
            });
        }

        // 技能帮助模态框关闭
        const closeHelpX = document.getElementById('close-skill-help-modal');
        const closeHelpBtn = document.getElementById('close-skill-help-btn');
        if (closeHelpX) closeHelpX.addEventListener('click', () => this.closeModal('skill-help-modal'));
        if (closeHelpBtn) closeHelpBtn.addEventListener('click', () => this.closeModal('skill-help-modal'));
        
        // 聊天输入
        const input = document.getElementById('chat-input');
        const sendBtn = document.getElementById('btn-send');
        const attachBtn = document.getElementById('btn-attach');
        const fileInput = document.getElementById('file-input');
        const attachmentPreviewGrid = document.getElementById('attachment-preview-grid');
        
        input.addEventListener('input', () => {
            sendBtn.disabled = !input.value.trim();
            input.style.height = 'auto';
            input.style.height = input.scrollHeight + 'px';
        });
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        sendBtn.addEventListener('click', () => this.sendMessage());

        if (attachBtn && fileInput) {
            attachBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', async () => {
                const selected = fileInput.files;
                if (!selected || selected.length === 0) return;
                attachBtn.disabled = true;
                try {
                    const uploaded = await this.uploadFiles(selected);
                    this.pendingUploads = (this.pendingUploads || []).concat(uploaded);
                    this.renderAttachmentPreview();
                    this.showToast(`已上传 ${uploaded.length} 个文件`);
                } catch (e) {
                    this.showToast(e.message || '上传失败');
                } finally {
                    attachBtn.disabled = false;
                    fileInput.value = '';
                }
            });
        }

        if (attachmentPreviewGrid) {
            attachmentPreviewGrid.addEventListener('click', (e) => {
                const removeBtn = e.target.closest('[data-attachment-remove]');
                if (removeBtn) {
                    const idx = Number(removeBtn.getAttribute('data-attachment-remove'));
                    if (Number.isFinite(idx) && idx >= 0) {
                        this.pendingUploads = (this.pendingUploads || []).filter((_it, i) => i !== idx);
                        this.renderAttachmentPreview();
                    }
                    return;
                }
                const openEl = e.target.closest('[data-attachment-open]');
                if (!openEl) return;
                const idx = Number(openEl.getAttribute('data-attachment-open'));
                const item = (this.pendingUploads || [])[idx];
                if (!item?.url) return;
                const url = `${BACKEND_URL}${String(item.url)}`;
                window.open(url, '_blank', 'noopener');
            });
        }

        this.renderAttachmentPreview();
    }
    
    // ========== 工具函数 ==========
    
    openModal(modalId) {
        document.getElementById(modalId).classList.add('active');
    }
    
    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
    }
    
    switchTab(tab) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.toggle('active', panel.id === `${tab}-tab`);
        });

        if (tab === 'skills') {
            this.loadSkills();
        }
        if (tab === 'collaboration') {
            this.refreshCollabAll();
        }
        if (tab === 'kasm') {
            this.setMainContentMode('kasm');
        } else if (this.mainContentMode === 'kasm') {
            this.setMainContentMode('chat');
        }
    }
    
    showTyping() {
        const container = document.getElementById('chat-messages');
        const typingDiv = document.createElement('div');
        typingDiv.className = 'typing-indicator';
        typingDiv.id = 'typing-indicator';
        typingDiv.innerHTML = `
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <span>${this.currentAgent?.name || 'DSClaw'} 正在思考...</span>
        `;
        container.appendChild(typingDiv);
        this.scrollToBottom();
    }
    
    hideTyping() {
        const typing = document.getElementById('typing-indicator');
        if (typing) typing.remove();
    }
    
    // ========== 协作系统 ==========
    
    async initCollaboration() {
        console.log('🤝 初始化协作系统...');
        
        // 连接协作WebSocket
        this.initCollabWebSocket();
        
        // 加载协作数据
        await this.loadCollabStats();
        await this.loadCollabAgents();
        await this.loadCollabTasks();
        await this.loadCollabDelegations();
        
        // 渲染协作面板
        this.renderCollabPanel();
        
        console.log('✅ 协作系统初始化完成');
    }

    async refreshCollabAll() {
        await this.loadCollabStats();
        await this.loadCollabAgents();
        await this.loadCollabTasks();
        await this.loadCollabDelegations();
        await this.loadHeartbeatStatus();
        this.renderCollabPanel();
    }

    async loadHeartbeatStatus() {
        try {
            const res = await fetch(`${BACKEND_URL}/api/heartbeat/status`);
            const data = await res.json();
            if (data.success) {
                this.heartbeat = { config: data.config || { enabled: false, intervalSec: 300 }, agents: data.agents || [] };
                this.renderCollabPanel();
            }
        } catch (e) {
            // ignore
        }
    }

    async saveHeartbeatConfig(next) {
        try {
            const res = await fetch(`${BACKEND_URL}/api/heartbeat/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(next)
            });
            const data = await res.json();
            if (data.success) {
                this.heartbeat.config = data.config;
                this.showToast('心跳配置已保存', 'success');
                await this.loadHeartbeatStatus();
            } else {
                this.showToast(data.error || '保存失败', 'error');
            }
        } catch (e) {
            this.showToast('保存失败，请检查后端', 'error');
        }
    }

    async runHeartbeatNow(agentId) {
        try {
            const res = await fetch(`${BACKEND_URL}/api/heartbeat/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agentId })
            });
            const data = await res.json();
            if (data.success) {
                this.showToast(data.result || '已触发心跳', 'success');
                await this.loadHeartbeatStatus();
            } else {
                this.showToast(data.error || '触发失败', 'error');
            }
        } catch (e) {
            this.showToast('触发失败，请检查后端', 'error');
        }
    }
    
    initCollabWebSocket() {
        try {
            this.collabWebSocket = new WebSocket('ws://localhost:3001/ws/collaboration');
            
            this.collabWebSocket.onopen = () => {
                this.addCollabEvent('✅ 协作WebSocket已连接');
                // 订阅所有事件
                this.collabWebSocket.send(JSON.stringify({ type: 'subscribe', events: ['*'] }));
            };
            
            this.collabWebSocket.onmessage = (event) => {
                try {
                    // 检查是否为空数据
                    if (!event.data || event.data.trim() === '') {
                        console.warn('收到空消息，忽略');
                        return;
                    }
                    
                    const data = JSON.parse(event.data);
                    this.addCollabEvent(`📨 [${data.type}]`);
                    
                    // 自动刷新数据
                    if (data.type === 'task_progress') {
                        this.loadCollabStats();
                        this.loadCollabTasks();
                    }
                } catch (e) {
                    console.error('协作消息解析失败:', e);
                    console.error('消息内容:', event.data);
                }
            };
            
            this.collabWebSocket.onerror = (error) => {
                this.addCollabEvent('❌ 协作WebSocket错误');
            };
            
            this.collabWebSocket.onclose = () => {
                this.addCollabEvent('🔌 协作WebSocket已断开');
                // 5秒后重连
                setTimeout(() => this.initCollabWebSocket(), 5000);
            };
        } catch (error) {
            console.error('协作WebSocket初始化失败:', error);
        }
    }
    
    async loadCollabStats() {
        try {
            const response = await fetch(`${COLLAB_API_BASE}/stats`);
            const data = await response.json();
            
            if (data.success) {
                this.collabStats = data.stats;
                this.renderCollabPanel();
            }
        } catch (error) {
            console.error('加载协作统计失败:', error);
        }
    }
    
    async loadCollabAgents() {
        try {
            const response = await fetch(`${COLLAB_API_BASE}/abilities`);
            const data = await response.json();
            
            if (data.success) {
                this.collabAgents = data.abilities;
                this.renderCollabPanel();
            }
        } catch (error) {
            console.error('加载协作Agent失败:', error);
        }
    }
    
    async loadCollabTasks() {
        try {
            const response = await fetch(`${COLLAB_API_BASE}/tasks?limit=10`);
            const data = await response.json();
            
            if (data.success) {
                this.collabTasks = data.tasks;
                this.renderCollabPanel();
            }
        } catch (error) {
            console.error('加载协作任务失败:', error);
        }
    }
    
    async loadCollabDelegations() {
        try {
            const response = await fetch(`${COLLAB_API_BASE}/delegate/history?limit=10`);
            const data = await response.json();
            
            if (data.success) {
                this.collabDelegations = data.history;
                this.renderCollabPanel();
            }
        } catch (error) {
            console.error('加载委托历史失败:', error);
        }
    }
    
    renderCollabPanel() {
        const panel = document.getElementById('collaboration-panel');
        if (!panel) return;
        
        // 统计卡片
        const statsHTML = `
            <div class="collab-section">
                <div class="collab-section-title">
                    📊 系统统计
                    <button class="collab-btn" onclick="window.app.loadCollabStats()">刷新</button>
                </div>
                <div class="collab-stats">
                    <div class="collab-stat-card">
                        <div class="collab-stat-value">${this.collabStats?.abilities?.total_agents || 0}</div>
                        <div class="collab-stat-label">Agent总数</div>
                    </div>
                    <div class="collab-stat-card">
                        <div class="collab-stat-value">${this.collabStats?.abilities?.online_agents || 0}</div>
                        <div class="collab-stat-label">在线Agent</div>
                    </div>
                    <div class="collab-stat-card">
                        <div class="collab-stat-value">${this.collabStats?.tasks?.total_tasks || 0}</div>
                        <div class="collab-stat-label">任务总数</div>
                    </div>
                    <div class="collab-stat-card">
                        <div class="collab-stat-value">${this.collabStats?.delegation?.total_delegations || 0}</div>
                        <div class="collab-stat-label">委托历史</div>
                    </div>
                </div>
            </div>
        `;

        const hb = this.heartbeat || { config: { enabled: false, intervalSec: 300 }, agents: [] };
        const heartbeatHTML = `
            <div class="collab-section">
                <div class="collab-section-title">
                    💓 Heartbeat
                    <button class="collab-btn" onclick="window.app.loadHeartbeatStatus()">刷新</button>
                </div>
                <div style="display:flex; gap:8px; align-items:center; margin-bottom:10px; flex-wrap:wrap;">
                    <label style="display:flex; align-items:center; gap:6px; font-size:0.85rem; color:var(--text-secondary);">
                        <input type="checkbox" id="hb-enabled" ${hb.config?.enabled ? 'checked' : ''} />
                        启用
                    </label>
                    <label style="display:flex; align-items:center; gap:6px; font-size:0.85rem; color:var(--text-secondary);">
                        间隔(秒)
                        <input id="hb-interval" type="number" min="10" value="${hb.config?.intervalSec ?? 300}" style="width:90px; padding:6px 8px; border:1px solid var(--border-color); border-radius:6px;" />
                    </label>
                    <button class="collab-btn primary" onclick="
                        window.app.saveHeartbeatConfig({
                            enabled: document.getElementById('hb-enabled').checked,
                            intervalSec: Number(document.getElementById('hb-interval').value || 300)
                        })
                    ">保存</button>
                </div>
                <div class="collab-agent-list">
                    ${(hb.agents || []).map(a => `
                        <div class="collab-agent-card">
                            <div class="collab-agent-header">
                                <span class="collab-agent-name">🤖 ${a.id}</span>
                                <span class="collab-agent-status ${a.enabledByFile ? 'online' : 'offline'}">
                                    ${a.enabledByFile ? '已配置' : '未配置'}
                                </span>
                            </div>
                            <div class="collab-agent-meta">
                                <div>上次: ${a.lastRunAt ? new Date(a.lastRunAt).toLocaleString() : '-'}</div>
                                <div>结果: ${a.lastError ? `❌ ${a.lastError}` : (a.lastResult || '-')}</div>
                            </div>
                            <div style="margin-top:8px; display:flex; justify-content:flex-end;">
                                <button class="collab-btn" onclick="window.app.runHeartbeatNow('${a.id}')">触发一次</button>
                            </div>
                        </div>
                    `).join('') || `<div style="color:var(--text-tertiary); font-size:0.85rem; padding:6px 0;">暂无可用 Agent</div>`}
                </div>
            </div>
        `;
        
        // Agent列表
        const agentsHTML = Object.entries(this.collabAgents).length > 0 ? `
            <div class="collab-section">
                <div class="collab-section-title">
                    👥 Agent能力
                    <button class="collab-btn primary" onclick="window.app.showToast('功能开发中...', 'info')">+ 添加</button>
                </div>
                <div class="collab-agent-list">
                    ${Object.entries(this.collabAgents).map(([agentId, ability]) => `
                        <div class="collab-agent-card">
                            <div class="collab-agent-header">
                                <span class="collab-agent-name">
                                    🤖 ${agentId}
                                </span>
                                <span class="collab-agent-status ${ability.availability?.is_online ? 'online' : 'offline'}">
                                    ${ability.availability?.is_online ? '在线' : '离线'}
                                </span>
                            </div>
                            <div class="collab-tags">
                                ${ability.skills?.map(skill => `<span class="collab-tag">${skill}</span>`).join('') || ''}
                                ${ability.domains?.map(domain => `<span class="collab-tag">${domain}</span>`).join('') || ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : '<div class="collab-section"><p style="text-align:center;color:#666;padding:20px;">暂无Agent</p></div>';
        
        // 任务列表
        const tasksHTML = this.collabTasks.length > 0 ? `
            <div class="collab-section">
                <div class="collab-section-title">
                    📋 协作任务
                    <button class="collab-btn primary" onclick="window.app.showToast('功能开发中...', 'info')">+ 创建</button>
                </div>
                <div class="collab-task-list">
                    ${this.collabTasks.map(task => `
                        <div class="collab-task-card">
                            <div class="collab-task-header">
                                <span class="collab-task-name">${task.name}</span>
                                <span class="collab-task-status ${task.status}">${task.status}</span>
                            </div>
                            <div style="font-size:0.8rem;color:#666;margin-bottom:6px;">
                                ${task.description?.substring(0, 50) || '无描述'}${task.description?.length > 50 ? '...' : ''}
                            </div>
                            <div class="collab-progress">
                                <div class="collab-progress-bar" style="width: ${task.progress?.percentage || 0}%"></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : '<div class="collab-section"><p style="text-align:center;color:#666;padding:20px;">暂无任务</p></div>';
        
        // 委托历史
        const delegationsHTML = this.collabDelegations.length > 0 ? `
            <div class="collab-section">
                <div class="collab-section-title">🎯 委托历史</div>
                <div style="max-height:150px;overflow-y:auto;">
                    ${this.collabDelegations.slice(0, 5).map(item => `
                        <div style="font-size:0.75rem;padding:4px 0;border-bottom:1px solid #dcdad8;color:#666;">
                            ${item.initiatorId} → ${item.targetAgentId}
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : '<div class="collab-section"><p style="text-align:center;color:#666;padding:20px;">暂无委托记录</p></div>';
        
        // 事件日志
        const eventLogHTML = `
            <div class="collab-section">
                <div class="collab-section-title">
                    📝 实时事件
                    <button class="collab-btn" onclick="window.app.collabEvents=[];window.app.renderCollabPanel()">清空</button>
                </div>
                <div class="collab-event-log">
                    ${this.collabEvents.slice(-20).reverse().map(event => `
                        <div class="collab-event-entry">
                            <span class="collab-event-time">${new Date().toLocaleTimeString()}</span>
                            <span class="collab-event-content">${event}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        
        panel.innerHTML = statsHTML + heartbeatHTML + agentsHTML + tasksHTML + delegationsHTML + eventLogHTML;
    }
    
    addCollabEvent(text) {
        this.collabEvents.push(text);
        
        // 只保留最近100条
        if (this.collabEvents.length > 100) {
            this.collabEvents = this.collabEvents.slice(-100);
        }
        
        // 更新UI
        this.renderCollabPanel();
    }
    
    scrollToBottom() {
        const container = document.getElementById('chat-messages');
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 100);
    }
    
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#f44336' : type === 'success' ? '#4caf50' : '#2196f3'};
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            z-index: 1000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
    
    showChannelInfo(channelId) {
        const channel = this.channels.find(c => c.id === channelId);
        if (!channel) return;
        this.setMainContentMode('chat');
        this.addMessageToConversation('assistant', `
# 📡 频道信息

**名称**: #${channel.name}
**描述**: ${channel.description || '无描述'}
**订阅数**: ${channel.subscriber_count || 0}

*使用 \`/channel ${channelId} <消息>\` 发送消息到该频道*
        `);
    }

    // ========== Desk 功能 ==========
    
    bindDeskEvents() {
        const refreshBtn = document.getElementById('desk-refresh-btn');
        const uploadArea = document.getElementById('desk-upload-area');
        
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadDeskFiles());
        }
        
        if (uploadArea) {
            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadArea.classList.add('drag-over');
            });
            
            uploadArea.addEventListener('dragleave', () => {
                uploadArea.classList.remove('drag-over');
            });
            
            uploadArea.addEventListener('drop', async (e) => {
                e.preventDefault();
                uploadArea.classList.remove('drag-over');
                
                const files = Array.from(e.dataTransfer.files);
                if (files.length === 0) return;
                
                await this.uploadDeskFiles(files);
                this.loadDeskFiles();
            });
            
            uploadArea.addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.multiple = true;
                input.onchange = async () => {
                    const files = Array.from(input.files);
                    if (files.length === 0) return;
                    await this.uploadDeskFiles(files);
                    this.loadDeskFiles();
                };
                input.click();
            });
        }
        
        // 切换tab时刷新
        document.querySelector('.tab-btn[data-tab="desk"]')?.addEventListener('click', () => {
            this.loadDeskFiles();
        });
    }
    
    async getCurrentDeskAgent() {
        if (!this.currentAgentId) return null;
        const agent = this.agents.find(a => a.id === this.currentAgentId);
        return agent;
    }
    
    async loadDeskFiles(subpath = '') {
        const agent = await this.getCurrentDeskAgent();
        if (!agent) {
            document.getElementById('desk-empty').style.display = 'block';
            document.getElementById('desk-files-container').style.display = 'none';
            return;
        }
        
        document.getElementById('desk-empty').style.display = 'none';
        document.getElementById('desk-files-container').style.display = 'block';
        
        try {
            const res = await fetch(`${BACKEND_URL}/api/desk/${this.currentAgentId}/list?path=${encodeURIComponent(subpath)}`);
            const data = await res.json();
            
            if (!data.success) {
                this.showToast(data.error || '加载Desk文件失败', 'error');
                return;
            }
            
            this.deskCurrentPath = subpath;
            this.renderDeskBreadcrumb(subpath);
            this.renderDeskFiles(data.files || []);
        } catch (error) {
            this.showToast('加载Desk失败', 'error');
            console.error(error);
        }
    }
    
    renderDeskBreadcrumb(currentPath) {
        const container = document.getElementById('desk-path-breadcrumb');
        if (!container) return;
        
        const parts = currentPath.split('/').filter(Boolean);
        let html = `<span class="desk-breadcrumb-item desk-breadcrumb-root" data-path="">${this.currentAgent.name} / </span>`;
        let accumulated = '';
        
        parts.forEach((part, index) => {
            accumulated = accumulated ? `${accumulated}/${part}` : part;
            const isLast = index === parts.length - 1;
            if (isLast) {
                html += `<span class="desk-breadcrumb-sep">/</span> <span class="desk-breadcrumb-item">${part}</span>`;
            } else {
                html += `<span class="desk-breadcrumb-sep">/</span> <span class="desk-breadcrumb-item" data-path="${accumulated}">${part}</span>`;
            }
        });
        
        container.innerHTML = html;
        
        // 绑定点击事件
        container.querySelectorAll('.desk-breadcrumb-item[data-path]').forEach(el => {
            el.addEventListener('click', () => {
                this.loadDeskFiles(el.dataset.path || '');
            });
        });
    }
    
    getFileIcon(type, name) {
        if (type?.startsWith('image/')) return '🖼️';
        if (type?.startsWith('text/')) return '📄';
        if (type?.includes('javascript') || type?.includes('json')) return '📜';
        if (type?.includes('pdf')) return '📕';
        if (type?.includes('zip') || type?.includes('rar') || type?.includes('tar')) return '📦';
        if (type?.startsWith('video/')) return '🎬';
        if (type?.startsWith('audio/')) return '🔊';
        if (name.endsWith('.md')) return '📝';
        if (name.endsWith('.js') || name.endsWith('.ts') || name.endsWith('.jsx') || name.endsWith('.tsx')) return '⚙️';
        if (name.endsWith('.html') || name.endsWith('.css')) return '🌐';
        return '📄';
    }
    
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    renderDeskFiles(files) {
        const container = document.getElementById('desk-files-grid');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (files.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-tertiary);font-size:0.9rem;">这个文件夹还是空的，可以拖放文件进来</div>';
            return;
        }
        
        files.sort((a, b) => {
            // 文件夹优先
            if (a.isDirectory !== b.isDirectory) {
                return a.isDirectory ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });
        
        files.forEach(file => {
            const card = document.createElement('div');
            card.className = 'desk-file-card';
            const icon = this.getFileIcon(file.type, file.name);
            const size = file.isDirectory ? '' : this.formatBytes(file.size);
            
            card.innerHTML = `
                <div class="desk-file-icon">${icon}</div>
                <div class="desk-file-name">${file.name}</div>
                <div class="desk-file-meta">
                    <span>${file.isDirectory ? '文件夹' : size}</span>
                    <span>${file.isDirectory ? '' : ''}</span>
                </div>
            `;
            
            card.addEventListener('click', () => {
                if (file.isDirectory) {
                    const newPath = this.deskCurrentPath ? `${this.deskCurrentPath}/${file.name}` : file.name;
                    this.loadDeskFiles(newPath);
                } else {
                    // 打开文件
                    this.openDeskFile(file);
                }
            });
            
            container.appendChild(card);
        });
    }
    
    async uploadDeskFiles(files) {
        const agent = await this.getCurrentDeskAgent();
        if (!agent) {
            this.showToast('请先选择一个智能体', 'error');
            return;
        }
        
        const formData = new FormData();
        files.forEach(file => {
            formData.append('files', file);
        });
        
        const subpath = this.deskCurrentPath || '';
        const url = `${BACKEND_URL}/api/desk/${this.currentAgentId}/upload?path=${encodeURIComponent(subpath)}`;
        
        try {
            const res = await fetch(url, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            
            if (data.success) {
                this.showToast(`已上传 ${data.uploaded} 个文件`, 'success');
            } else {
                this.showToast(data.error || '上传失败', 'error');
            }
        } catch (error) {
            this.showToast('上传失败', 'error');
            console.error(error);
        }
    }
    
    openDeskFile(file) {
        const url = `${BACKEND_URL}/api/desk/${this.currentAgentId}/download?path=${encodeURIComponent(this.deskCurrentPath ? `${this.deskCurrentPath}/${file.name}` : file.name)}`;
        window.open(url, '_blank', 'noopener');
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    window.app = new DSClawApp();
    window.app.init();
});