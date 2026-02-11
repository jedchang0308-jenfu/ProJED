import React, { useState, useEffect } from 'react';
import { Menu, Layout, Undo2, Redo2, Download, Upload, RefreshCw, LogIn, ChevronRight, Columns, LineChart } from 'lucide-react';
import useBoardStore from '../store/useBoardStore';
import Sidebar from './Sidebar';

const MainLayout = ({ children }) => {
    const {
        currentView, getActiveBoard, getActiveWorkspace, updateBoardTitle,
        setView, isSidebarOpen, setSidebarOpen,
        undo, redo, past, future
    } = useBoardStore();

    const activeBoard = getActiveBoard();
    const activeWorkspace = getActiveWorkspace();

    // Keyboard Shortcuts for Undo/Redo
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'z') {
                    if (e.shiftKey) {
                        redo();
                    } else {
                        undo();
                    }
                } else if (e.key === 'y') {
                    redo();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo]);

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

                <div className="flex items-center gap-1 sm:gap-2">
                    {/* History Controls */}
                    <div className="hidden md:flex items-center gap-1 mr-2 pr-2 border-r border-slate-200">
                        <button
                            onClick={undo}
                            disabled={past.length === 0}
                            className={`p-1.5 rounded transition-colors ${past.length === 0 ? 'text-slate-200 cursor-not-allowed' : 'text-slate-500 hover:bg-slate-100'}`}
                            title="復原 (Ctrl+Z)"
                        >
                            <Undo2 size={16} />
                        </button>
                        <button
                            onClick={redo}
                            disabled={future.length === 0}
                            className={`p-1.5 rounded transition-colors ${future.length === 0 ? 'text-slate-200 cursor-not-allowed' : 'text-slate-500 hover:bg-slate-100'}`}
                            title="重做 (Ctrl+Y / Ctrl+Shift+Z)"
                        >
                            <Redo2 size={16} />
                        </button>
                    </div>

                    <button className="btn-outline px-2 h-7 text-xs sm:text-sm sm:h-8 sm:px-3 hidden sm:flex">
                        <RefreshCw size={14} />
                        <span className="hidden lg:inline">同步 Google 日曆</span>
                    </button>

                    <button className="btn-primary px-2 h-7 text-xs sm:text-sm sm:h-8 sm:px-3">
                        <LogIn size={14} />
                        <span className="hidden sm:inline">Google 登入</span>
                    </button>
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
