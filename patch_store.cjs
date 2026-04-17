const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'store', 'useBoardStore.ts');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add storage keys and getters
const helperSearch = `// ===== 本機視圖持久化輔助函式 =====`;
const newHelpers = `// ===== 本機視圖與狀態持久化輔助函式 =====
const VIEW_STORAGE_KEY = 'projed-last-view';
const WS_STORAGE_KEY = 'projed-last-ws';
const BOARD_STORAGE_KEY = 'projed-last-board';
const MODAL_STORAGE_KEY = 'projed-last-modal';

const safeSetItem = (key, value) => {
    try {
        if (value === null || value === undefined) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
    } catch { /* ignore */ }
};

const getStoredView = () => {
    try {
        const stored = localStorage.getItem(VIEW_STORAGE_KEY);
        if (stored && ['list', 'board', 'gantt', 'calendar'].includes(stored)) {
            return stored as import('../types').ViewMode;
        }
    } catch { /* ignore */ }
    return 'home' as import('../types').ViewMode;
};

const getStoredId = (key) => {
    try { return localStorage.getItem(key) || null; } catch { return null; }
};

const getStoredModal = () => {
    try {
        if (typeof window !== 'undefined' && window.location.search.includes('modal=')) {
            // 如果網址有 Deep link，優先從網址讀取（放行給 App.tsx 處理），不要讀取快取的 modal
            return null;
        }
        const stored = localStorage.getItem(MODAL_STORAGE_KEY);
        if (stored) return JSON.parse(stored);
    } catch { /* ignore */ }
    return null;
};
`;

content = content.replace(/\/\/ ===== 本機視圖持久化輔助函式 =====[\s\S]*?const useBoardStore = create<BoardStore>\(\)\(/, newHelpers + '\nconst useBoardStore = create<BoardStore>()(');

// 2. Change initial state inside create()
content = content.replace(/activeWorkspaceId: null,/, `activeWorkspaceId: getStoredId(WS_STORAGE_KEY),`);
content = content.replace(/activeBoardId: null,/, `activeBoardId: getStoredId(BOARD_STORAGE_KEY),`);
content = content.replace(/editingItem: null,/, `editingItem: getStoredModal(),`);

// 3. Update activeWorkspace setter
const activeWSSearch = `setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),`;
const activeWSReplace = `setActiveWorkspace: (id) => {
            safeSetItem(WS_STORAGE_KEY, id);
            set({ activeWorkspaceId: id });
        },`;
content = content.replace(activeWSSearch, activeWSReplace);

// 4. Update activeBoard setter
const activeBoardSearch = `setActiveBoard: (id) => set({ activeBoardId: id }),`;
const activeBoardReplace = `setActiveBoard: (id) => {
            safeSetItem(BOARD_STORAGE_KEY, id);
            set({ activeBoardId: id });
        },`;
content = content.replace(activeBoardSearch, activeBoardReplace);

// 5. Update switchBoard
const switchBoardSearch = `switchBoard: (wsId, boardId) => {
            set({ activeWorkspaceId: wsId, activeBoardId: boardId, currentView: 'board' });
        },`;
const switchBoardReplace = `switchBoard: (wsId, boardId) => {
            safeSetItem(WS_STORAGE_KEY, wsId);
            safeSetItem(BOARD_STORAGE_KEY, boardId);
            safeSetItem(VIEW_STORAGE_KEY, 'board');
            set({ activeWorkspaceId: wsId, activeBoardId: boardId, currentView: 'board' });
        },`;
content = content.replace(switchBoardSearch, switchBoardReplace);

// 6. Update openModal
const openModalSearch = `openModal: (type, itemId, listId) => {
            const state = get();
            if (!state.activeWorkspaceId || !state.activeBoardId) return;
            set({
                editingItem: {
                    type,
                    itemId,
                    listId,
                    workspaceId: state.activeWorkspaceId,
                    boardId: state.activeBoardId
                }
            });
        },`;
const openModalReplace = `openModal: (type, itemId, listId) => {
            const state = get();
            if (!state.activeWorkspaceId || !state.activeBoardId) return;
            const newItem = {
                type,
                itemId,
                listId,
                workspaceId: state.activeWorkspaceId,
                boardId: state.activeBoardId
            };
            safeSetItem(MODAL_STORAGE_KEY, JSON.stringify(newItem));
            set({ editingItem: newItem });
        },`;
content = content.replace(openModalSearch, openModalReplace);

// 7. Update closeModal
const closeModalSearch = `closeModal: () => {
            set({ editingItem: null });
        },`;
const closeModalReplace = `closeModal: () => {
            safeSetItem(MODAL_STORAGE_KEY, null);
            set({ editingItem: null });
        },`;
content = content.replace(closeModalSearch, closeModalReplace);

fs.writeFileSync(filePath, content, 'utf8');
console.log('useBoardStore.ts patched successfully!');
