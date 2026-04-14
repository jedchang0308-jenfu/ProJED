const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'CardModal.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 找到舊函式的起點和終點
const START_MARKER = '    const handlePinToHome = async () => {';
const END_MARKER = '    // \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500';

const startIdx = content.indexOf(START_MARKER);
// 找到函式結束（下一個 // ──────── 區塊）
const endIdx = content.indexOf(END_MARKER, startIdx);

if (startIdx === -1 || endIdx === -1) {
  console.error('Markers not found!');
  console.log('startIdx:', startIdx, 'endIdx:', endIdx);
  process.exit(1);
}

const before = content.slice(0, startIdx);
const after = content.slice(endIdx);

const newFn = `    const handlePinToHome = async () => {
        if (!editingItem) return;
        setIsMenuOpen(false);

        // URL is already updated to deep-link by the useEffect above
        const shareUrl = window.location.href;

        // Get task name for share title
        const ws = useBoardStore.getState().workspaces.find(w => w.id === editingItem.workspaceId);
        const board = ws?.boards.find(b => b.id === editingItem.boardId);
        const { type, itemId, listId } = editingItem;
        let taskTitle = 'ProJED';
        if (type === 'card') {
            const list = board?.lists.find(l => l.id === listId);
            const card = list?.cards.find(c => c.id === itemId);
            if (card?.title) taskTitle = card.title;
        } else if (type === 'list') {
            const list = board?.lists.find(l => l.id === itemId);
            if (list?.title) taskTitle = list.title;
        }

        // Detect environment
        const isAndroid = /android/i.test(navigator.userAgent);
        const isStandalone =
            window.matchMedia('(display-mode: standalone)').matches ||
            (navigator as any).standalone === true;

        if (isAndroid && isStandalone) {
            // Android PWA standalone mode:
            // Android Share Sheet does NOT include "Add to Home Screen".
            // Solution: open URL in Chrome browser tab so user can use Chrome menu.
            window.open(shareUrl, '_blank');
            useDialogStore.getState().showConfirm(
                '\u3010\u5efa\u7acb\u684c\u9762\u6377\u5f91 Android\u3011\\n\\n' +
                '\u5df2\u5728 Chrome \u4e2d\u958b\u555f\u6b64\u4efb\u52d9\uff01\\n\\n\u8acb\u4f9d\u4ee5\u4e0b\u6b65\u9a5f\u5efa\u7acb\u6377\u5f91\uff1a\\n' +
                '1\ufe0f\u20e3 \u5207\u63db\u5230\u525b\u958b\u555f\u7684 Chrome \u6a19\u7c64\\n' +
                '2\ufe0f\u20e3 \u9ede\u53f3\u4e0a\u89d2\u300c\u2039\uff1a\u203a\u300d\u9078\u55ae\\n' +
                '3\ufe0f\u20e3 \u9078\u300c\u52a0\u5230\u4e3b\u756b\u9762\u300d\u2192\u300c\u65b0\u589e\u300d\\n\\n' +
                '\u5b8c\u6210\uff01\u4e4b\u5f8c\u5c31\u80fd\u5f9e\u684c\u9762\u76f4\u63a5\u958b\u555f\u6b64\u4efb\u52d9\u3002'
            );
        } else if (navigator.share) {
            // iOS PWA (share sheet includes "Add to Home Screen")
            // or any browser supporting Web Share API
            try {
                await navigator.share({
                    title: 'ProJED \u2014 ' + taskTitle,
                    url: shareUrl,
                });
            } catch (err) {
                if ((err as Error).name !== 'AbortError') {
                    console.error('[PWA] share failed:', err);
                }
            }
        } else {
            // Desktop browser: copy link to clipboard
            try {
                await navigator.clipboard.writeText(shareUrl);
                useDialogStore.getState().showConfirm(
                    '\u3010\u5efa\u7acb\u684c\u9762\u6377\u5f91\u3011\\n\\n' +
                    '\u2705 \u6b64\u4efb\u52d9\u7684\u9023\u7d50\u5df2\u8907\u88fd\uff01\\n' +
                    '\u5728\u624b\u6a5f\u4e0a\u7528 Chrome \u8cbc\u4e0a\u958b\u555f\uff0c\u518d\u9ede\u300c\u2039\uff1a\u203a\u300d\u2192\u300c\u52a0\u5230\u4e3b\u756b\u9762\u300d\u5373\u53ef\u3002'
                );
            } catch {
                useDialogStore.getState().showConfirm(
                    '\u3010\u5efa\u7acb\u684c\u9762\u6377\u5f91\u3011\\n\\n\u8acb\u8907\u88fd\u7db2\u5740\u5217\u7684\u7db2\u5740\uff0c\u5728\u624b\u6a5f Chrome \u958b\u555f\u5f8c\u9ede\u300c\u52a0\u5230\u4e3b\u756b\u9762\u300d\u5efa\u7acb\u6377\u5f91\u3002'
                );
            }
        }
    };
`;

const newContent = before + newFn + after;
fs.writeFileSync(filePath, newContent, 'utf8');
console.log('CardModal.tsx patched successfully!');
