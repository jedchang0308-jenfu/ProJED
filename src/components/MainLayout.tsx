import { useState, useEffect } from 'react';
import { Menu, Layout, RefreshCw, ChevronRight, Columns, LineChart, CalendarDays, Loader2, Unplug } from 'lucide-react';
import useBoardStore from '../store/useBoardStore';
import useCalendarSyncStore from '../store/useCalendarSyncStore';
import Sidebar from './Sidebar';

/**
 * getRelativeTime — 將時間戳轉為相對時間（如「3 分鐘前」）
 * 設計意圖：同步按鈕旁顯示上次同步時間，增加使用者信心
 */
function getRelativeTime(timestamp: number | null): string {
    if (!timestamp) return '';
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 60) return '剛剛';
    if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`;
    return `${Math.floor(diff / 86400)} 天前`;
}

const MainLayout = ({ children }) => {
    const {
        currentView, getActiveBoard, getActiveWorkspace, updateBoardTitle,
        setView, isSidebarOpen, setSidebarOpen
    } = useBoardStore();

    // ── Google Calendar 同步狀態 ──
    const {
        isConnected, isSyncing, lastSyncAt, error,
        connect, disconnect, syncAll
    } = useCalendarSyncStore();

    // 同步相對時間（每 30 秒更新）
    const [relativeTime, setRelativeTime] = useState(getRelativeTime(lastSyncAt));
    useEffect(() => {
        setRelativeTime(getRelativeTime(lastSyncAt));
        const timer = setInterval(() => setRelativeTime(getRelativeTime(lastSyncAt)), 30000);
        return () => clearInterval(timer);
    }, [lastSyncAt]);

    const activeBoard = getActiveBoard();
    const activeWorkspace = getActiveWorkspace();

    /**
     * handleSyncClick — 同步按鈕點擊處理
     * 設計意圖：
     * - 未連接 → 觸發 OAuth 授權
     * - 已連接 → 觸發全量同步
     * - 同步中 → 不做任何事（按鈕已 disabled）
     */
    const handleSyncClick = async () => {
        if (isSyncing) return;
        if (!isConnected) {
            connect();
        } else {
            const result = await syncAll();
            if (result) {
                console.log(`📊 同步結果: 新增 ${result.created}, 更新 ${result.updated}, 刪除 ${result.deleted}, 跳過 ${result.skipped}`);
            }
        }
    };

    return (
        <div className="flex flex-col h-screen bg-slate-50 text-slate-800">
            {/* Navbar */}
            <nav className="h-10 bg-white border-b border-slate-200 flex items-center justify-between px-4 shadow-sm z-40 shrink-0">
                <div className="flex items-center gap-2 overflow-hidden">
                    <button
                        onClick={() => setSidebarOpen(!isSidebarOpen)}
                        className="p-1 hover:bg-slate-100 rounded text-slate-500 mr-2 border border-slate-200"
                    >
                        <Menu size={18} />
                    </button>

                    <div className="flex items-center gap-2 text-sm font-medium">
                        <Layout className="text-primary w-5 h-5" />
                        <span className="text-slate-700 font-bold hidden sm:inline">ProJED</span>

                        {currentView !== 'home' && activeWorkspace && (
                            <>
                                <ChevronRight size={14} className="text-slate-300" />
                                <span className="text-slate-400 whitespace-nowrap">{activeWorkspace.title}</span>
                                <ChevronRight size={14} className="text-slate-300" />
                                <h1
                                    contentEditable
                                    suppressContentEditableWarning
                                    onBlur={(e) => updateBoardTitle(activeWorkspace.id, activeBoard.id, e.target.innerText)}
                                    className="text-slate-800 font-bold px-2 py-0.5 rounded hover:bg-slate-100 focus:bg-white focus:outline-primary cursor-text truncate max-w-[150px] sm:max-w-[300px]"
                                >
                                    {activeBoard?.title}
                                </h1>

                                <div className="flex items-center gap-2 ml-4 pl-4 border-l border-slate-200">
                                    <div className="bg-slate-100 p-0.5 rounded-lg flex gap-0.5 shadow-inner">
                                        <button
                                            onClick={() => setView('board')}
                                            className={`p-1 px-2.5 rounded-md text-[10px] sm:text-xs font-bold flex items-center gap-1.5 transition-all ${currentView === 'board' ? 'bg-white text-primary shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                        >
                                            <Columns size={13} />
                                            <span className="hidden md:inline">看板</span>
                                        </button>
                                        <button
                                            onClick={() => setView('gantt')}
                                            className={`p-1 px-2.5 rounded-md text-[10px] sm:text-xs font-bold flex items-center gap-1.5 transition-all ${currentView === 'gantt' ? 'bg-white text-primary shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                        >
                                            <LineChart size={13} />
                                            <span className="hidden md:inline">甘特圖</span>
                                        </button>
                                        <button
                                            onClick={() => setView('calendar')}
                                            className={`p-1 px-2.5 rounded-md text-[10px] sm:text-xs font-bold flex items-center gap-1.5 transition-all ${currentView === 'calendar' ? 'bg-white text-primary shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                        >
                                            <CalendarDays size={13} />
                                            <span className="hidden md:inline">月曆</span>
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                        {currentView === 'home' && (
                            <>
                                <ChevronRight size={14} className="text-slate-300" />
                                <span className="text-slate-700 font-bold">專案總覽</span>
                            </>
                        )}
                    </div>
                </div>

                {/* ── Google Calendar 同步控制區 ── */}
                <div className="flex items-center gap-1 sm:gap-2">
                    {/* 同步按鈕：三種狀態（未連接 / 已連接 / 同步中） */}
                    <button
                        onClick={handleSyncClick}
                        disabled={isSyncing}
                        className={`btn-outline px-2 h-7 text-xs sm:text-sm sm:h-8 sm:px-3 hidden sm:flex items-center gap-1.5 transition-all ${
                            isSyncing
                                ? 'opacity-60 cursor-not-allowed'
                                : isConnected
                                    ? 'hover:border-green-400 hover:text-green-600'
                                    : 'hover:border-primary hover:text-primary'
                        }`}
                        title={
                            isSyncing
                                ? '同步中...'
                                : isConnected
                                    ? `點擊同步 | 上次: ${relativeTime || '尚未同步'}`
                                    : '點擊連接 Google Calendar'
                        }
                    >
                        {/* 圖示：同步中旋轉、已連接勾勾、未連接一般 */}
                        {isSyncing ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : isConnected ? (
                            <RefreshCw size={14} className="text-green-500" />
                        ) : (
                            <RefreshCw size={14} />
                        )}

                        {/* 文字標籤 */}
                        <span className="hidden lg:inline">
                            {isSyncing
                                ? '同步中...'
                                : isConnected
                                    ? '同步 Google 日曆'
                                    : '連接 Google 日曆'
                            }
                        </span>

                        {/* 已連接狀態：顯示上次同步時間小圓點 */}
                        {isConnected && !isSyncing && (
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                        )}
                    </button>

                    {/* 已連接時：顯示斷開連接的按鈕（小圖示） */}
                    {isConnected && (
                        <button
                            onClick={disconnect}
                            className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded text-slate-400 transition-all hidden sm:block"
                            title="斷開 Google Calendar 連接"
                        >
                            <Unplug size={14} />
                        </button>
                    )}

                    {/* 同步錯誤提示 */}
                    {error && (
                        <span className="text-[10px] text-red-500 max-w-[120px] truncate hidden lg:inline" title={error}>
                            ⚠️ {error}
                        </span>
                    )}
                </div>
            </nav>

            {/* Main Container */}
            <div className="flex flex-1 overflow-hidden">
                <Sidebar isOpen={isSidebarOpen} toggle={() => setSidebarOpen(!isSidebarOpen)} />

                <main className="flex-1 flex flex-col min-w-0 h-full">
                    {children}
                </main>
            </div>
        </div>
    );
};

export default MainLayout;
