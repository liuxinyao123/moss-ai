const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();

function nowMs() {
    return Date.now();
}

function safeJsonParse(s, fallback = null) {
    try { return JSON.parse(s); } catch { return fallback; }
}

function getBaseUrl(req, configuredPublicBaseUrl) {
    const cfg = String(configuredPublicBaseUrl || '').trim();
    if (cfg) return cfg.replace(/\/+$/, '');
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
    const host = String(req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim();
    return `${proto}://${host}`.replace(/\/+$/, '');
}

function createJwt({ secret, issuer, user }) {
    if (!secret) throw new Error('缺少 MOSS_AUTH_JWT_SECRET');
    const payload = {
        sub: user.id,
        name: user.display_name || null
    };
    return jwt.sign(payload, secret, { expiresIn: '7d', issuer });
}

function dbGet(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => err ? reject(err) : resolve(row || null));
    });
}

function dbRun(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) return reject(err);
            resolve({ changes: this.changes, lastID: this.lastID });
        });
    });
}

async function ensureUserByIdentity({ db, provider, externalId, profile }) {
    const identity = await dbGet(
        db,
        `SELECT user_id FROM user_identities WHERE provider = ? AND external_id = ?`,
        [provider, externalId]
    );

    const displayName = String(profile?.name || profile?.display_name || profile?.nick || '').trim() || null;
    const avatarUrl = String(profile?.avatar_url || profile?.avatarUrl || profile?.avatar || '').trim() || null;

    if (identity?.user_id) {
        await dbRun(
            db,
            `UPDATE users SET display_name = COALESCE(?, display_name), avatar_url = COALESCE(?, avatar_url), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [displayName, avatarUrl, identity.user_id]
        );
        const user = await dbGet(db, `SELECT * FROM users WHERE id = ?`, [identity.user_id]);
        return user;
    }

    const userId = uuidv4();
    await dbRun(
        db,
        `INSERT INTO users (id, display_name, avatar_url) VALUES (?, ?, ?)`,
        [userId, displayName, avatarUrl]
    );
    await dbRun(
        db,
        `INSERT INTO user_identities (id, user_id, provider, external_id, profile_json) VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), userId, provider, externalId, JSON.stringify(profile || {})]
    );
    const user = await dbGet(db, `SELECT * FROM users WHERE id = ?`, [userId]);
    return user;
}

function createSsoRouter({ dbPath, publicBaseUrl, jwtSecret, jwtIssuer = 'dsclaw', providers }) {
    const router = express.Router();

    router.get('/health', (_req, res) => {
        res.json({ success: true, providers: Object.keys(providers || {}) });
    });

    router.get('/:provider/start', async (req, res) => {
        try {
            const provider = String(req.params.provider || '').trim();
            const cfg = providers?.[provider];
            if (!cfg) return res.status(404).json({ success: false, error: '未知 provider' });

            const baseUrl = getBaseUrl(req, publicBaseUrl);
            const redirectUri = `${baseUrl}/api/sso/${provider}/callback`;
            const state = uuidv4();
            const returnTo = String(req.query.returnTo || '').trim() || null;
            const createdAt = nowMs();
            const expiresAt = createdAt + 10 * 60 * 1000;

            const db = new sqlite3.Database(dbPath);
            await dbRun(
                db,
                `INSERT INTO auth_states (id, provider, redirect_uri, return_to, expires_at_ms) VALUES (?, ?, ?, ?, ?)`,
                [state, provider, redirectUri, returnTo, expiresAt]
            );
            db.close();

            const authUrl = cfg.buildAuthUrl({ redirectUri, state });
            res.json({ success: true, provider, state, redirectUri, authUrl });
        } catch (e) {
            res.status(500).json({ success: false, error: String(e?.message || e) });
        }
    });

    router.get('/:provider/callback', async (req, res) => {
        const provider = String(req.params.provider || '').trim();
        const cfg = providers?.[provider];
        if (!cfg) return res.status(404).send('未知 provider');

        try {
            const { code, state, authCode, error } = req.query || {};
            const actualCode = String(code || authCode || '').trim();
            const actualState = String(state || '').trim();
            const actualError = String(error || '').trim();

            if (actualError) return res.status(400).send(`授权失败：${actualError}`);
            if (!actualCode) return res.status(400).send('缺少 code');
            if (!actualState) return res.status(400).send('缺少 state');

            const db = new sqlite3.Database(dbPath);
            const st = await dbGet(db, `SELECT * FROM auth_states WHERE id = ? AND provider = ?`, [actualState, provider]);
            if (!st) {
                db.close();
                return res.status(400).send('state 不存在或已过期');
            }
            if (Number(st.expires_at_ms || 0) < nowMs()) {
                await dbRun(db, `DELETE FROM auth_states WHERE id = ?`, [actualState]);
                db.close();
                return res.status(400).send('state 已过期');
            }

            // state 一次性使用
            await dbRun(db, `DELETE FROM auth_states WHERE id = ?`, [actualState]);

            const baseUrl = getBaseUrl(req, publicBaseUrl);
            const redirectUri = st.redirect_uri || `${baseUrl}/api/sso/${provider}/callback`;

            const exchanged = await cfg.exchangeCode({ code: actualCode, redirectUri });
            const profile = await cfg.fetchUserProfile({ exchanged });

            const externalId = String(profile?.external_id || profile?.open_id || profile?.openId || profile?.union_id || profile?.unionId || profile?.userid || profile?.userId || '').trim();
            if (!externalId) {
                db.close();
                return res.status(500).send('无法解析用户唯一标识');
            }

            const user = await ensureUserByIdentity({ db, provider, externalId, profile });
            db.close();

            const token = createJwt({ secret: jwtSecret, issuer: jwtIssuer, user });
            const responseBody = { success: true, provider, token, user: { id: user.id, display_name: user.display_name, avatar_url: user.avatar_url } };

            const accept = String(req.headers.accept || '');
            if (accept.includes('application/json')) {
                return res.json(responseBody);
            }

            const returnTo = String(st.return_to || '').trim();
            const safeReturnTo = returnTo && /^https?:\/\//i.test(returnTo) ? returnTo : '';

            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.send(`<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>SSO 登录成功</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;padding:24px;">
  <h3>SSO 登录成功</h3>
  <p>你可以关闭此窗口返回应用。</p>
  <script>
    (function(){
      try {
        var payload = ${JSON.stringify(responseBody)};
        if (window.opener && window.opener.postMessage) {
          window.opener.postMessage({ type: 'moss_sso', payload: payload }, '*');
        }
        if (${JSON.stringify(safeReturnTo)}) {
          window.location.replace(${JSON.stringify(safeReturnTo)});
          return;
        }
        window.close();
      } catch (e) {}
    })();
  </script>
</body>
</html>`);
        } catch (e) {
            res.status(500).send(`登录回调失败：${String(e?.message || e)}`);
        }
    });

    return router;
}

function buildProvidersFromEnv() {
    const feishu = {
        enabled: Boolean(process.env.FEISHU_CLIENT_ID && process.env.FEISHU_CLIENT_SECRET),
        buildAuthUrl: ({ redirectUri, state }) => {
            const clientId = String(process.env.FEISHU_CLIENT_ID || '').trim();
            const scope = encodeURIComponent(String(process.env.FEISHU_SCOPE || 'auth:user.id:read user_profile offline_access').trim());
            const ru = encodeURIComponent(redirectUri);
            const st = encodeURIComponent(state);
            return `https://accounts.feishu.cn/open-apis/authen/v1/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${ru}&state=${st}&scope=${scope}`;
        },
        exchangeCode: async ({ code, redirectUri }) => {
            const client_id = String(process.env.FEISHU_CLIENT_ID || '').trim();
            const client_secret = String(process.env.FEISHU_CLIENT_SECRET || '').trim();
            const resp = await axios.post(
                'https://open.feishu.cn/open-apis/authen/v2/oauth/token',
                { grant_type: 'authorization_code', client_id, client_secret, code: String(code), redirect_uri: redirectUri },
                { timeout: 10000, headers: { 'Content-Type': 'application/json' } }
            );
            return resp.data;
        },
        fetchUserProfile: async ({ exchanged }) => {
            const token = exchanged?.access_token;
            if (!token) throw new Error('飞书：缺少 access_token');
            const resp = await axios.get('https://open.feishu.cn/open-apis/authen/v1/user_info', {
                timeout: 10000,
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = resp.data || {};
            const user = data?.data || data;
            return {
                external_id: user?.open_id || user?.union_id || user?.user_id || null,
                open_id: user?.open_id || null,
                union_id: user?.union_id || null,
                user_id: user?.user_id || null,
                name: user?.name || user?.en_name || null,
                avatar_url: user?.avatar_url || user?.avatar_big || user?.avatar_middle || user?.avatar_thumb || null,
                tenant_key: user?.tenant_key || null,
                raw: user
            };
        }
    };

    const dingtalk = {
        enabled: Boolean(process.env.DINGTALK_CLIENT_ID && process.env.DINGTALK_CLIENT_SECRET),
        buildAuthUrl: ({ redirectUri, state }) => {
            const clientId = String(process.env.DINGTALK_CLIENT_ID || '').trim();
            const scope = encodeURIComponent(String(process.env.DINGTALK_SCOPE || 'openid').trim());
            const ru = encodeURIComponent(redirectUri);
            const st = encodeURIComponent(state);
            return `https://login.dingtalk.com/oauth2/auth?redirect_uri=${ru}&response_type=code&client_id=${encodeURIComponent(clientId)}&scope=${scope}&state=${st}&prompt=consent`;
        },
        exchangeCode: async ({ code }) => {
            const clientId = String(process.env.DINGTALK_CLIENT_ID || '').trim();
            const clientSecret = String(process.env.DINGTALK_CLIENT_SECRET || '').trim();
            const resp = await axios.post(
                'https://api.dingtalk.com/v1.0/oauth2/userAccessToken',
                { clientId, clientSecret, code: String(code), grantType: 'authorization_code' },
                { timeout: 10000, headers: { 'Content-Type': 'application/json' } }
            );
            return resp.data;
        },
        fetchUserProfile: async ({ exchanged }) => {
            const accessToken = exchanged?.accessToken || exchanged?.access_token;
            if (!accessToken) throw new Error('钉钉：缺少 accessToken');
            const resp = await axios.get('https://api.dingtalk.com/v1.0/contact/users/me', {
                timeout: 10000,
                headers: { 'x-acs-dingtalk-access-token': accessToken }
            });
            const user = resp.data || {};
            return {
                external_id: user?.unionId || user?.openId || null,
                unionId: user?.unionId || null,
                openId: user?.openId || null,
                name: user?.nick || user?.name || null,
                avatarUrl: user?.avatarUrl || null,
                mobile: user?.mobile || null,
                raw: user
            };
        }
    };

    const wecom = {
        enabled: Boolean(process.env.WECOM_CORP_ID && process.env.WECOM_AGENT_ID && process.env.WECOM_CORP_SECRET),
        buildAuthUrl: ({ redirectUri, state }) => {
            const corpId = String(process.env.WECOM_CORP_ID || '').trim();
            const agentId = String(process.env.WECOM_AGENT_ID || '').trim();
            const ru = encodeURIComponent(redirectUri);
            const st = encodeURIComponent(state);
            return `https://open.work.weixin.qq.com/wwopen/sso/qrConnect?appid=${encodeURIComponent(corpId)}&agentid=${encodeURIComponent(agentId)}&redirect_uri=${ru}&state=${st}&lang=zh`;
        },
        exchangeCode: async ({ code }) => {
            const corpId = String(process.env.WECOM_CORP_ID || '').trim();
            const secret = String(process.env.WECOM_CORP_SECRET || '').trim();
            const tokenResp = await axios.get('https://qyapi.weixin.qq.com/cgi-bin/gettoken', {
                timeout: 10000,
                params: { corpid: corpId, corpsecret: secret }
            });
            const accessToken = tokenResp.data?.access_token;
            if (!accessToken) throw new Error(`企业微信：获取 access_token 失败：${JSON.stringify(tokenResp.data || {})}`);
            const userInfoResp = await axios.get('https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo', {
                timeout: 10000,
                params: { access_token: accessToken, code: String(code) }
            });
            return { corpAccessToken: accessToken, userInfo: userInfoResp.data || {} };
        },
        fetchUserProfile: async ({ exchanged }) => {
            const corpAccessToken = exchanged?.corpAccessToken;
            const userInfo = exchanged?.userInfo || {};
            const userId = userInfo?.UserId || userInfo?.userid || null;
            const openId = userInfo?.OpenId || userInfo?.openid || null;
            if (!corpAccessToken) throw new Error('企业微信：缺少 corpAccessToken');

            if (userId) {
                const detailResp = await axios.get('https://qyapi.weixin.qq.com/cgi-bin/user/get', {
                    timeout: 10000,
                    params: { access_token: corpAccessToken, userid: userId }
                });
                const u = detailResp.data || {};
                return {
                    external_id: userId,
                    userid: userId,
                    openid: openId,
                    name: u?.name || null,
                    avatar: u?.avatar || null,
                    mobile: u?.mobile || null,
                    email: u?.email || null,
                    raw: { userInfo, detail: u }
                };
            }

            if (openId) {
                return {
                    external_id: openId,
                    openid: openId,
                    name: null,
                    raw: { userInfo }
                };
            }

            throw new Error(`企业微信：无法从 getuserinfo 解析 UserId/OpenId：${JSON.stringify(userInfo)}`);
        }
    };

    const providers = {};
    if (feishu.enabled) providers.feishu = feishu;
    if (dingtalk.enabled) providers.dingtalk = dingtalk;
    if (wecom.enabled) providers.wecom = wecom;
    return providers;
}

module.exports = {
    createSsoRouter,
    buildProvidersFromEnv
};

