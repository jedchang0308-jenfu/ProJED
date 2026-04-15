const fs = require('fs');
let c = fs.readFileSync('src/components/CardModal.tsx', 'utf8');

const regex = /if \(isAndroid && isStandalone\) \{[\s\S]*?\} else if \(navigator\.share\)/;
const replacement = `if (isAndroid) {
            // Android: Chrome 可以正常使用「加到主畫面」因為我們移除了 PWA manifest
            // 直接複製網址並提示
            try {
                await navigator.clipboard.writeText(shareUrl);
                useDialogStore.getState().showConfirm(
                    '【建立桌面捷徑】\\n\\n' +
                    '✅ 任務連結已為您複製！\\n\\n' +
                    '👉 請在手機 Chrome 瀏覽器中貼上並開啟此連結，\\n' +
                    '然後點擊右上角「⋮」選單，選擇「加到主畫面」即可建立桌面捷徑。'
                );
            } catch {
                useDialogStore.getState().showConfirm('請複製網址並在 Chrome 中開啟，隨後從選單選擇「加到主畫面」建立捷徑。');
            }
        } else if (navigator.share)`;

c = c.replace(regex, replacement);
fs.writeFileSync('src/components/CardModal.tsx', c, 'utf8');
console.log('CardModal.tsx updated for non-PWA fallback.');
