// @ts-nocheck
import React from 'react';
import { Layout as LayoutIcon, NotebookText, Plus, SendHorizontal, Trash2, Trello } from 'lucide-react';
import useBoardStore from '../store/useBoardStore';
import useDialogStore from '../store/useDialogStore';
import useTaskZoneStore from '../store/useTaskZoneStore';
import { toast } from '../store/useToastStore';

const HomeView = () => {
    const { workspaces, addBoard, removeBoard, switchBoard, setView } = useBoardStore();
    const createTask = useTaskZoneStore(state => state.createTask);
    const taskZoneCount = useTaskZoneStore(state => state.getUnplacedCount());
    const [quickTaskTitle, setQuickTaskTitle] = React.useState('');

    const handleCreateBoard = async (event, workspaceId) => {
        event.preventDefault();
        const name = await useDialogStore.getState().showPrompt('請輸入新看板名稱：', '新專案');
        if (name && name.trim()) {
            addBoard(workspaceId, name.trim());
        }
    };

    const handleQuickTaskSubmit = async (event) => {
        event.preventDefault();
        const title = quickTaskTitle.trim();
        if (!title) return;
        try {
            await createTask({ title });
            setQuickTaskTitle('');
            toast.success('已建立任務，留在待歸位。');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : '快速建立任務失敗。');
        }
    };

    return (
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="max-w-6xl mx-auto space-y-8">
                <header className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="rounded-lg bg-primary-light p-2">
                            <Trello className="h-6 w-6 text-primary" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="truncate text-2xl font-bold text-slate-800">工作區總覽</h2>
                            <p className="mt-1 text-sm text-slate-500">
                                依工作區管理看板，保持團隊、部門與專案範圍清楚。
                            </p>
                        </div>
                    </div>
                </header>

                <section className="overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-emerald-50 p-4 shadow-sm sm:p-5" data-home-task-zone-entry="true">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                            <div className="rounded-xl bg-white p-2 text-primary shadow-sm">
                                <NotebookText size={22} />
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-lg font-bold text-slate-900">任務專區</h3>
                                <p className="mt-1 text-sm text-slate-600">
                                    先把事情建立成任務，還沒決定歸屬時留在待歸位；之後拖到看板定位。
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setView('task_zone')}
                                    className="mt-2 text-xs font-bold text-primary hover:text-primary-dark"
                                >
                                    查看 {taskZoneCount} 筆待歸位任務
                                </button>
                            </div>
                        </div>
                        <form onSubmit={handleQuickTaskSubmit} className="flex min-w-0 flex-1 gap-2">
                            <input
                                value={quickTaskTitle}
                                onChange={(event) => setQuickTaskTitle(event.target.value)}
                                placeholder="快速建立任務..."
                                className="min-w-0 flex-1 rounded-xl border border-blue-100 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                                data-home-task-zone-input="true"
                            />
                            <button
                                type="submit"
                                disabled={!quickTaskTitle.trim()}
                                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                                <SendHorizontal size={15} />
                                建立
                            </button>
                        </form>
                    </div>
                </section>

                {workspaces.length === 0 ? (
                    <section className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
                        尚未建立工作區。系統會為新使用者建立「我的工作區」，也可以從左側工作區選單新增。
                    </section>
                ) : (
                    <div className="space-y-8">
                        {workspaces.map((workspace) => (
                            <section key={workspace.id} className="space-y-3" data-home-workspace-section="true">
                                <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-2">
                                    <div className="min-w-0">
                                        <h3 className="truncate text-base font-bold text-slate-800">{workspace.title}</h3>
                                        <p className="text-xs text-slate-400">{workspace.boards.length} 個看板</p>
                                    </div>
                                    <button
                                        onClick={(event) => handleCreateBoard(event, workspace.id)}
                                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 transition-colors hover:border-primary hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                                    >
                                        <Plus size={16} />
                                        建立看板
                                    </button>
                                </div>

                                {workspace.boards.length === 0 ? (
                                    <button
                                        onClick={(event) => handleCreateBoard(event, workspace.id)}
                                        className="flex h-28 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 bg-white text-slate-400 transition-all hover:border-primary hover:bg-slate-50 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                                        data-empty-workspace-create-board="true"
                                    >
                                        <Plus size={24} />
                                        <span className="text-sm font-bold">建立看板</span>
                                    </button>
                                ) : (
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                        {workspace.boards.map((board) => (
                                            <div key={board.id} className="group relative">
                                                <button
                                                    onClick={() => switchBoard(workspace.id, board.id)}
                                                    className="h-28 w-full overflow-hidden rounded-lg border border-slate-200 bg-white p-4 text-left transition-all hover:border-primary hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
                                                >
                                                    <div className="relative z-10">
                                                        <h4 className="font-bold text-slate-800 transition-colors group-hover:text-primary">
                                                            {board.title}
                                                        </h4>
                                                        <p className="mt-1 text-xs font-medium text-slate-400">{workspace.title}</p>
                                                    </div>
                                                    <div className="absolute right-0 top-0 p-4 opacity-5 transition-opacity group-hover:opacity-10">
                                                        <LayoutIcon size={48} />
                                                    </div>
                                                    <div className="absolute inset-x-0 bottom-0 h-1 translate-y-full bg-primary transition-transform group-hover:translate-y-0" />
                                                </button>
                                                <button
                                                    onClick={async (event) => {
                                                        event.stopPropagation();
                                                        const confirmed = await useDialogStore.getState().showConfirm(`確定要刪除看板「${board.title}」嗎？您可以隨時使用 Ctrl+Z 復原。`);
                                                        if (confirmed) {
                                                            removeBoard(workspace.id, board.id);
                                                        }
                                                    }}
                                                    className="absolute right-2 top-2 z-20 rounded-lg border border-slate-100 bg-white p-1.5 text-slate-300 opacity-0 shadow-sm transition-all hover:border-red-100 hover:text-red-500 group-hover:opacity-100"
                                                    title="刪除看板"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default HomeView;
