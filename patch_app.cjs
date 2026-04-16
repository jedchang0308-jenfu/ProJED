const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const anchor = `  // ===== 看板切換時清理無效依賴 =====`;

const validationLogic = `  // ===== 快取狀態安全檢查 (Hydration Validation) =====
  useEffect(() => {
    if (workspaces.length === 0 || !activeWorkspaceId) return;

    const wsExists = workspaces.find(w => w.id === activeWorkspaceId);
    if (!wsExists) {
        console.warn('[Cache] Active workspace not found, resetting...');
        useBoardStore.getState().setActiveWorkspace(null);
        useBoardStore.getState().setActiveBoard(null);
        useBoardStore.getState().setView('home');
        return;
    }

    if (activeBoardId) {
        const boardExists = wsExists.boards.find(b => b.id === activeBoardId);
        if (!boardExists) {
            console.warn('[Cache] Active board not found, resetting...');
            useBoardStore.getState().setActiveBoard(null);
            useBoardStore.getState().setView('home');
        }
    }
  }, [workspaces, activeWorkspaceId, activeBoardId]);

`;

content = content.replace(anchor, validationLogic + anchor);
fs.writeFileSync(filePath, content, 'utf8');
console.log('App.tsx patched specifically for Cache Validation!');
