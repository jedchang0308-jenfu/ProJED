import type { PwaInstallPlatform } from '../../services/pwaInstallService';

export function entryInstallInstructions(platform: PwaInstallPlatform): string[] {
  switch (platform) {
    case 'ios-safari': return ['用 Safari 開啟新網址。', '點「分享」→「加入主畫面」→「新增」。'];
    case 'embedded': return ['請先用 Safari、Chrome 或 Edge 開啟新網址。', '再依畫面說明，把程式加到主畫面或桌面。'];
    case 'android-installable':
    case 'android-browser': return ['用 Chrome 開啟新網址。', '點「⋮」→「安裝並建立捷徑」→「安裝」。'];
    case 'standalone': return ['原來的桌面圖示不會自動更新。', '請先用瀏覽器開啟新網址，安裝後再從新圖示開啟。'];
    case 'unsupported': return ['請用 Safari、Chrome 或 Edge 開啟新網址，再依畫面安裝程式。'];
    default: return ['點「安裝 ProJED」，再依瀏覽器提示完成安裝。'];
  }
}
