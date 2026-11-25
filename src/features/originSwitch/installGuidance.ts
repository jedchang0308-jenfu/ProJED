import type { PwaInstallPlatform } from '../../services/pwaInstallService';

export function entryInstallInstructions(platform: PwaInstallPlatform): string[] {
  switch (platform) {
    case 'ios-safari': return ['在 Safari 開啟新網址。', '點「分享」→「加入主畫面」→「新增」。'];
    case 'embedded': return ['先以 Safari、Chrome 或 Edge 開啟新網址。', '再依該瀏覽器的安裝選單加入主畫面。'];
    case 'android-installable':
    case 'android-browser': return ['在 Chrome 開啟新網址。', '點「⋮」→「安裝應用程式」或「加入主畫面」。'];
    case 'standalone': return ['舊圖示不會自動改成新網址。', '先在瀏覽器開啟新網址，安裝後從新圖示開啟。'];
    case 'unsupported': return ['以 Safari、Chrome 或 Edge 開啟新網址，再更新書籤或安裝。'];
    default: return ['在新網址使用網址列的安裝圖示，或瀏覽器的「安裝應用程式」選單。'];
  }
}
