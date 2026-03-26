/**
 * 設計意圖：將舊版 localStorage 資料（projed_data 格式）
 * 遷移至新版 Zustand persist 格式（projed-storage）。
 * 確保使用者從舊版升級時不會遺失資料。
 */
import type { Workspace, StatusFilters } from '../types';

/** Zustand persist 儲存格式 */
interface PersistedState {
    state: {
        workspaces: Workspace[];
        activeWorkspaceId: string | null;
        activeBoardId: string | null;
        currentView: string;
        statusFilters: StatusFilters;
    };
    version: number;
}

/** 舊版資料格式（從 localStorage 讀取的原始結構） */
interface LegacyData {
    workspaces?: Workspace[];
    activeWorkspaceId?: string | null;
    activeBoardId?: string | null;
}

/**
 * 從舊版 localStorage 格式遷移至新版 Zustand persist 格式。
 * @returns 遷移後的 state 物件，若無舊資料或遷移失敗則回傳 null
 */
export const migrateLegacyData = (): PersistedState['state'] | null => {
    const legacyRaw = localStorage.getItem('projed_data');
    if (!legacyRaw) return null;

    try {
        const legacyData: LegacyData = JSON.parse(legacyRaw);

        const newState: PersistedState = {
            state: {
                workspaces: legacyData.workspaces || [],
                activeWorkspaceId: legacyData.activeWorkspaceId || null,
                activeBoardId: legacyData.activeBoardId || null,
                currentView: 'home',
                statusFilters: {
                    todo: true,
                    delayed: true,
                    completed: true,
                    unsure: true,
                    onhold: true,
                }
            },
            version: 0
        };

        // 儲存至新的 key
        localStorage.setItem('projed-storage', JSON.stringify(newState));
        console.log("✅ Data successfully migrated from legacy storage.");

        return newState.state;
    } catch (e) {
        console.error("❌ Migration failed:", e);
        return null;
    }
};
