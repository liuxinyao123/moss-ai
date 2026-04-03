const { contextBridge, ipcRenderer } = require('electron');

// 安全地暴露 API 到渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
    // payload 支持：
    // - string: 兼容旧调用（仅 user message）
    // - { message?: string, messages?: Array<{role, content}>, model?: string }
    sendToAI: (payload) => ipcRenderer.invoke('send-to-ai', payload),
    readGatewayToken: () => ipcRenderer.invoke('read-gateway-token'),
    setDemoSceneWindowState: (action) => ipcRenderer.invoke('set-demo-scene-window-state', action),
    
    // 通知主进程
    onWindowReady: () => ipcRenderer.send('window-ready'),
    onWindowError: (error) => ipcRenderer.send('window-error', error)
});

console.log('📡 DSclaw Preload script loaded');
