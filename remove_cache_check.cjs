const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Remove the validation block
const searchPhraseStart = `// ===== 快取狀態安全檢查 (Hydration Validation) =====`;
const searchPhraseEnd = `  // ===== 看板切換時清理無效依賴 =====`;

const startIndex = content.indexOf(searchPhraseStart);
const endIndex = content.indexOf(searchPhraseEnd);

if (startIndex !== -1 && endIndex !== -1) {
    const newContent = content.substring(0, startIndex) + content.substring(endIndex);
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log('Cache Validation removed from App.tsx');
} else {
    console.log('Could not find the target section.');
}
