/**
 * Utility to migrate data from legacy localStorage (projed_data) 
 * to the new Zustand persisted state (projed-storage).
 */
export const migrateLegacyData = () => {
    const legacyRaw = localStorage.getItem('projed_data');
    if (!legacyRaw) return null;

    try {
        const legacyData = JSON.parse(legacyRaw);

        // Check if it's already in the structure we expect or needs conversion
        // In the legacy app, it was { workspaces, activeWorkspaceId, activeBoardId }
        // Zustand persist wraps state in a { state, version } object.

        const newState = {
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

        // Save to the new key
        localStorage.setItem('projed-storage', JSON.stringify(newState));
        console.log("✅ Data successfully migrated from legacy storage.");

        // Optional: Keep the legacy data for safety but maybe rename it
        // localStorage.setItem('projed_data_backup', legacyRaw);
        // localStorage.removeItem('projed_data');

        return newState.state;
    } catch (e) {
        console.error("❌ Migration failed:", e);
        return null;
    }
};
