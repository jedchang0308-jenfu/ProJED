const fs = require('fs');
const path = require('path');

const filePathStore = path.join(__dirname, 'src', 'store', 'useBoardStore.ts');
let contentStore = fs.readFileSync(filePathStore, 'utf8');

// Fix getStoredId to reject "null" strings
contentStore = contentStore.replace(
    `const getStoredId = (key) => {
    try { return localStorage.getItem(key) || null; } catch { return null; }
};`,
    `const getStoredId = (key) => {
    try { 
        const val = localStorage.getItem(key);
        if (val === 'null' || val === 'undefined') return null;
        return val || null; 
    } catch { return null; }
};`
);

// Fix getStoredModal to reject "null" strings
contentStore = contentStore.replace(
    `const getStoredModal = () => {
    try {
        if (typeof window !== 'undefined' && window.location.search.includes('modal=')) {
            // 如果網址有 Deep link，優先從網址讀取（放行給 App.tsx 處理），不要讀取快取的 modal
            return null;
        }
        const stored = localStorage.getItem(MODAL_STORAGE_KEY);
        if (stored) return JSON.parse(stored);
    } catch { /* ignore */ }
    return null;
};`,
    `const getStoredModal = () => {
    try {
        if (typeof window !== 'undefined' && window.location.search.includes('modal=')) {
            return null;
        }
        const stored = localStorage.getItem(MODAL_STORAGE_KEY);
        if (!stored || stored === 'null' || stored === 'undefined') return null;
        return JSON.parse(stored);
    } catch { return null; }
};`
);

fs.writeFileSync(filePathStore, contentStore, 'utf8');
console.log('useBoardStore.ts fixed string nulls.');

const filePathApp = path.join(__dirname, 'src', 'App.tsx');
let contentApp = fs.readFileSync(filePathApp, 'utf8');

// Fix App.tsx deep link handling to clear leftover incomplete itemId
const searchApp = `    const modalType = params.get('modal');
    if (!modalType) {
        hasProcessedDeepLink.current = true;
        return;
    }`;
const replaceApp = `    const modalType = params.get('modal');
    if (!modalType) {
        hasProcessedDeepLink.current = true;
        // 如果發現無效的遺跡連結（只有 itemId，沒有完整資訊），清理掉網址列以免混淆
        if (params.has('itemId') && !params.has('boardId')) {
             const newUrl = new URL(window.location.href);
             newUrl.searchParams.delete('itemId');
             window.history.replaceState(null, '', newUrl.pathname);
        }
        return;
    }`;

contentApp = contentApp.replace(searchApp, replaceApp);
fs.writeFileSync(filePathApp, contentApp, 'utf8');
console.log('App.tsx fixed incomplete deep link.');
