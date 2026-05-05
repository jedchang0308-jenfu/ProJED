"""
修復 useWbsStore.ts 介面段落中的亂碼問題，
並補齊 removeNode 的孤兒依賴清理邏輯。
"""
import re

with open('src/store/useWbsStore.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# ============================
# Step 1: 修復介面區塊（91-101 行）
# 將亂碼的 Unicode escape 字串替換成正確的繁體中文
# ============================
# 找到有問題的 getDependencyMarkers 和 getNodeLockStatus 宣告區塊
# 用正則匹配這段（因為行尾字元和 unicode 序列都可能不一致）
bad_interface_pattern = re.compile(
    r'  /\*\*\r?\n'
    r'   \* (?:\\u8a08\\u7b97\\u6240\\u6709\\u4f9d\\u8cf4\\u7684\\u6a19\\u7c64 Map\\uff08\\u6392\\u5e8f\\u7a69\\u5b9a\\uff09|計算所有依賴的標籤 Map（排序穩定）)\r?\n'
    r'   \* (?:\\u8a2d\\u8a08\\u610f\\u5716\\uff1a\\u7d71\\u4e00\\u6a19\\u7c64\\u7b97\\u6cd5\\uff0c\\u78ba\\u4fdd ListView \\u8207 GanttView \\u986f\\u793a\\u4e00\\u81f4\\u7684\\u5b57\\u6bcd\\u6a19\\u7c64|統一標籤算法，確保 ListView 與 GanttView 顯示一致的字母標籤)\r?\n'
    r'   \*/\r?\n'
    r"  getDependencyMarkers: \(\) => Record<string, Array<\{ id: string; label: string; role: [^;]+; isSelf\?: boolean; offset\?: number \}>>;\r?\n"
    r'\r?\n'
    r'  /\*\*\r?\n'
    r'   \* (?:\\u53d6\\u5f97\\u7bc0\\u9ede\\u7684\\u65e5\\u671f\\u9396\\u5b9a\\u72c0\\u614b\\uff08\\u662f\\u5426\\u88ab\\u4f9d\\u8cf4\\u95dc\\u4fc2\\u9396\\u5b9a\\uff09|取得節點的日期鎖定狀態（是否被依賴關係鎖定）)\r?\n'
    r'   \* (?:\\u8a2d\\u8a08\\u610f\\u5716\\uff1a\\u53ea\\u6709\\u300c\\u88ab\\u52d5\\u8ddf\\u96a8\\u7aef\\u300d\(toId\) \\u7684\\u65e5\\u671f\\u624d\\u88ab\\u9396\\u5b9a\\uff0c\\u4e3b\\u52d5\\u9a45\\u52d5\\u7aef\\u4e0d\\u9396\\u5b9a|只有「被動跟隨端」\(toId\) 的日期才被鎖定，主動驅動端不鎖定)\r?\n'
    r'   \*/\r?\n'
    r'  getNodeLockStatus: \(nodeId: string\) => \{ startLocked: boolean; endLocked: boolean; moveLocked: boolean \};',
    re.DOTALL
)

good_interface = (
    '  /**\n'
    '   * 計算所有依賴的標籤 Map（排序穩定）\n'
    '   * 設計意圖：統一標籤算法，確保 ListView 與 GanttView 顯示一致的字母標籤\n'
    '   */\n'
    "  getDependencyMarkers: () => Record<string, Array<{ id: string; label: string; role: 'active' | 'passive'; isSelf?: boolean; offset?: number }>>;\n"
    '\n'
    '  /**\n'
    '   * 取得節點的日期鎖定狀態（是否被依賴關係鎖定）\n'
    '   * 設計意圖：只有「被動跟隨端」(toId) 的日期才被鎖定，主動驅動端不鎖定\n'
    '   */\n'
    '  getNodeLockStatus: (nodeId: string) => { startLocked: boolean; endLocked: boolean; moveLocked: boolean };'
)

if bad_interface_pattern.search(content):
    content = bad_interface_pattern.sub(good_interface, content)
    print('[OK] Step 1: 介面宣告修復完成')
else:
    print('[SKIP] Step 1: 未找到需要修復的介面區塊（可能已是正確格式）')

# ============================
# Step 2: 修復 removeNode（B3 孤兒依賴清理）
# ============================
old_removeNode = (
    '  removeNode: (id) => {\n'
    '    // 實作軟刪除\n'
    '    get().updateNode(id, { isArchived: true });\n'
    '  },'
)

new_removeNode = (
    '  removeNode: (id) => {\n'
    '    // B3 修復：先清理所有關聯的孤兒依賴，再軟刪除\n'
    '    // 設計意圖：避免被刪除節點的依賴殘留，導致 _applyDependencySchedule 嘗試推動已封存節點\n'
    '    const state = get();\n'
    '    const orphanDeps = state.dependencies.filter(\n'
    '      dep => dep.fromId === id || dep.toId === id\n'
    '    );\n'
    '    orphanDeps.forEach(dep => get().removeDependency(dep.id));\n'
    '    get().updateNode(id, { isArchived: true });\n'
    '  },'
)

if old_removeNode in content:
    content = content.replace(old_removeNode, new_removeNode, 1)
    print('[OK] Step 2: removeNode B3 修復完成')
else:
    print('[SKIP] Step 2: 未找到 removeNode 原始內容（可能已修復）')

with open('src/store/useWbsStore.ts', 'w', encoding='utf-8', newline='') as f:
    f.write(content)

print('[DONE] 檔案已儲存')
