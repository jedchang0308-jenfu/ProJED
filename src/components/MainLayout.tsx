// @ts-nocheck
import React from 'react';
import { useEffect } from 'react';
import { Menu, Layout, ChevronRight, ListChecks, Columns, LineChart, CalendarDays, Undo2, Redo2, Sparkles } from 'lucide-react';
import useBoardStore from '../store/useBoardStore';
import useUndoStore from '../store/useUndoStore';
import useRagStore from '../store/useRagStore';
import Sidebar from './Sidebar';
import { GlobalContextMenu } from './GlobalContextMenu';
import RagSidebar from './Rag/RagSidebar';
import { compactIconButtonClass } from './ui/compactTokens';
import { ModeSwitcher } from './ui/ModeSwitcher';

const MainLayout = ({ children }) => {
    const {
        currentView, getActiveBoard, getActiveWorkspace, updateBoardTitle,
        setView, isSidebarOpen, setSidebarOpen, dependencySelection
    } = useBoardStore();
    
    const isSelectingMode = !!dependencySelection;

    // ── Undo / Redo 狀態 ──
    const { undo, redo, canUndo, canRedo, undoStack, redoStack } = useUndoStore();
    const lastUndoLabel = undoStack.length > 0 ? undoStack[undoStack.length - 1].label : '';
    const lastRedoLabel = redoStack.length > 0 ? redoStack[redoStack.length - 1].label : '';

    // ── RAG UI 狀態 ──
    const { isOpen: isRagOpen, togglePanel: toggleRagPanel } = useRagStore();

    // 全域鍵盤快捷鍵：Ctrl+Z (上一步) / Ctrl+Shift+Z 或 Ctrl+Y (下一步)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isMac = navigator.platform.toLowerCase().includes('mac');
            const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
            // 如果用戶正在輸入框內輸入，不觸發快捷鍵
            const target = e.target as HTMLElement;
            const isEditable = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
            if (isEditable) return;

            if (ctrlOrCmd && !e.shiftKey && e.key === 'z') {
                e.preventDefault();
                if (canUndo()) undo();
            } else if (ctrlOrCmd && (e.shiftKey && e.key === 'z' || e.key === 'y')) {
                e.preventDefault();
                if (canRedo()) redo();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo, canUndo, canRedo]);

    const activeBoard = getActiveBoard();
    const activeWorkspace = getActiveWorkspace();
    const isBoardWorkspaceView = ['list', 'board', 'gantt', 'calendar'].includes(currentView);
    const modeSwitcherOptions = [
        { value: 'list', label: '清單', icon: <ListChecks size={13} /> },
        { value: 'board', label: '看板', icon: <Columns size={13} /> },
        { value: 'gantt', label: '甘特圖', icon: <LineChart size={13} /> },
        { value: 'calendar', label: '月曆', icon: <CalendarDays size={13} /> },
    ] as const;

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

                        {(currentView === 'settings' || currentView === 'calendar_subscriptions') && (
                            <>
                                <ChevronRight size={14} className="text-slate-300" />
                                <span className="text-slate-700 font-bold">設定</span>
                                {currentView === 'calendar_subscriptions' && (
                                    <>
                                        <ChevronRight size={14} className="text-slate-300" />
                                        <span className="text-slate-500 font-bold">行事曆訂閱</span>
                                    </>
                                )}
                            </>
                        )}

                        {currentView === 'recycle_bin' && (
                            <>
                                <ChevronRight size={14} className="text-slate-300" />
                                <span className="text-slate-700 font-bold">資源回收桶</span>
                            </>
                        )}

                        {isBoardWorkspaceView && activeWorkspace && activeBoard && (
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

                                <div className="flex items-center gap-[8px] ml-[10px] pl-[10px] border-l border-slate-200">
                                    <ModeSwitcher
                                        value={currentView}
                                        options={modeSwitcherOptions}
                                        onChange={setView}
                                        disabled={isSelectingMode}
                                        disabledTitle="選取模式中無法切換視圖"
                                    />

                                    {/* ── Undo / Redo 按鈕組 ── */}
                                    <div className="flex items-center gap-px ml-0 pl-[8px] border-l border-slate-200">
                                        {/* 上一步按鈕 */}
                                        <button
                                            id="btn-undo"
                                            onClick={undo}
                                            disabled={!canUndo()}
                                            title={canUndo() ? `上一步：${lastUndoLabel}\u000aCtrl+Z` : '沒有可撤銷的操作'}
                                            className={canUndo() ? compactIconButtonClass() : `${compactIconButtonClass()} text-slate-300 cursor-not-allowed`}
                                        >
                                            <Undo2 size={15} />
                                        </button>
                                        {/* 下一步按鈕 */}
                                        <button
                                            id="btn-redo"
                                            onClick={redo}
                                            disabled={!canRedo()}
                                            title={canRedo() ? `下一步：${lastRedoLabel}\u000aCtrl+Shift+Z` : '沒有可重做的操作'}
                                            className={canRedo() ? compactIconButtonClass() : `${compactIconButtonClass()} text-slate-300 cursor-not-allowed`}
                                        >
                                            <Redo2 size={15} />
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

                {/* ── 智慧助理控制區 ── */}
                <div className="flex items-center gap-1 sm:gap-2">
                    <button
                        onClick={toggleRagPanel}
                        className={`btn-outline flex h-7 items-center gap-1.5 px-2 text-xs transition-all sm:h-8 sm:px-3 sm:text-sm ${
                            isRagOpen ? 'border-blue-400 text-blue-600 bg-blue-50' : 'hover:border-blue-400 hover:text-blue-600'
                        }`}
                        title="專案智慧助理（搜尋知識庫）"
                    >
                        <Sparkles size={14} className={isRagOpen ? 'text-blue-500' : 'text-slate-400'} />
                        <span className="hidden lg:inline">智慧助理</span>
                    </button>
                </div>
            </nav>

            {/* Main Container */}
            <div className="flex flex-1 overflow-hidden">
                <Sidebar isOpen={isSidebarOpen} toggle={() => setSidebarOpen(!isSidebarOpen)} />

                <main className="flex-1 flex flex-col min-w-0 h-full relative">
                    {children}
                </main>

                <RagSidebar />
            </div>

            {/* 全域右鍵/長按選單 — 所有視圖共用 */}
            <GlobalContextMenu />
        </div>
    );
};

export default MainLayout;
