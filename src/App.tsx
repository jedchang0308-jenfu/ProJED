/**
 * App.tsx — 應用程式根元件 (Firestore 版)
 * 設計意圖：
 * 1. AuthGate 確保使用者登入後才能使用主應用
 * 2. useFirestoreSync 建立即時監聽，遠端資料變動自動同步
 * 3. AppContent 負責舊版資料遷移檢查與視圖切換
 *
 * 遷移流程說明：
 * - 使用者登入後，立即檢查 localStorage 是否有舊版資料
 * - 若有，則觸發 migrateLocalStorageToFirestore
 * - 遷移完成後，由 onSnapshot 自動更新畫面，無須手動 reload
 * - 若無舊版資料，跳過遷移
 */
import { lazy, Suspense, useEffect, useRef } from 'react';
import useBoardStore from './store/useBoardStore';
import useAuthStore from './store/useAuthStore';
import { useMemberStore } from './store/useMemberStore';
import useRecordStore from './store/useRecordStore';
import useTaskZoneStore from './store/useTaskZoneStore';
import { useDataSync } from './hooks/useDataSync';
import { boardInviteService, dataBackend } from './services/dataBackend';
import { migrateLocalStorageToFirestore } from './utils/migration';
import AuthGate from './components/AuthGate';
import MainLayout from './components/MainLayout';
import { useCalendarStore } from './store/useCalendarStore';
import dayjs from 'dayjs';
import { supabaseWorkspaceService } from './services/supabase/projedService';
import HomeView from './components/HomeView';
// ListView 已由 WbsListView 取代，import 移除
// CardModal 已在 Phase B 移除，改為在清單視圖行內編輯
import GlobalDialog from './components/GlobalDialog';
import { AppInstallAssistant } from './components/AppInstallAssistant';
import { ToastContainer } from './components/ui/ToastContainer';
import { toast } from './store/useToastStore';
import { BOARD_INVITE_TOKEN_PARAM } from './utils/boardInviteToken';
import { seedLocalTestEnvironment } from './utils/localTestEnvironment';

const BoardView = lazy(() => import('./components/BoardView'));
const GanttView = lazy(() => import('./components/GanttView'));
const CalendarView = lazy(() => import('./components/CalendarView'));
const RecordsView = lazy(() => import('./components/Records/RecordsView'));
const SettingsView = lazy(() => import('./components/SettingsView'));
const RecycleBinView = lazy(() => import('./components/RecycleBinView'));
const MindMapView = lazy(() => import('./components/MindMap/MindMapView'));
const TaskZoneView = lazy(() => import('./components/TaskZoneView'));
const WbsListView = lazy(() =>
  import('./components/Wbs/WbsListView').then(module => ({ default: module.WbsListView })),
);

const formatBoardInviteAcceptError = (inviteError: unknown): string => {
  const message = inviteError instanceof Error ? inviteError.message : '';
  if (
    message.includes('此邀請屬於其他電子郵件地址') ||
    message.includes('board invite email does not match authenticated user')
  ) {
    return '此邀請只能由受邀電子郵件帳號接受。請先登出目前帳號，改用受邀信箱登入後，再重新開啟邀請連結。';
  }
  if (message.includes('board invite has expired') || message.includes('看板邀請已過期')) {
    return '此看板邀請已過期，請邀請人撤回後重新建立邀請連結。';
  }
  if (message.includes('board invite is no longer pending') || message.includes('已不在待處理狀態')) {
    return '此看板邀請已被接受、撤回或失效，請邀請人確認待處理邀請狀態。';
  }
  return message || '無法接受看板邀請。';
};

/**
 * AppContent — 主應用內容（已通過 AuthGate 認證）
 * 設計意圖：useFirestoreSync 必須在認證後的子元件中啟動，
 * 確保 user 一定存在。
 */
function AppContent() {
  const { currentView, workspaces, activeWorkspaceId, activeBoardId } = useBoardStore();
  const user = useAuthStore(s => s.user);
  const userId = user?.uid ?? null;
  const userEmail = user?.email ?? null;
  const userDisplayName = user?.displayName ?? null;
  const loadRecords = useRecordStore(s => s.loadRecords);
  const loadTaskZone = useTaskZoneStore(s => s.load);
  // 確保遷移只執行一次，不因 re-render 重複觸發
  const migrationDone = useRef(false);
  const processedInviteToken = useRef<string | null>(null);

  // 啟動目前資料後端的同步監聽
  useDataSync();

  useEffect(() => {
    if (!userId || !activeWorkspaceId || !activeBoardId) return;
    loadRecords(activeWorkspaceId, activeBoardId).catch(console.error);
  }, [activeBoardId, activeWorkspaceId, loadRecords, userId]);

  useEffect(() => {
    if (!userId) return;
    loadTaskZone().catch(console.error);
  }, [loadTaskZone, userId]);

  useEffect(() => {
    if (!userId || dataBackend !== 'local-test') return;

    const activeWorkspace = workspaces.find(workspace => workspace.id === activeWorkspaceId);
    const hasBrokenWorkspaceSelection = Boolean(activeWorkspaceId && !activeWorkspace);
    const hasBrokenBoardSelection = Boolean(
      activeBoardId && activeWorkspace && !activeWorkspace.boards.some(board => board.id === activeBoardId)
    );
    if (workspaces.length === 0 || hasBrokenWorkspaceSelection || hasBrokenBoardSelection) {
      seedLocalTestEnvironment();
    }
  }, [activeBoardId, activeWorkspaceId, userId, workspaces]);

  // 載入行政院人事日曆 (當年度與下年度)
  useEffect(() => {
    const currentYear = dayjs().year();
    useCalendarStore.getState().fetchYears([currentYear, currentYear + 1]);
  }, []);

  // ===== 舊版資料遷移 =====
  // 設計意圖：在登入後立即執行（不等 onSnapshot 結果），
  // 若 localStorage 有舊資料就寫入 Firestore，
  // onSnapshot 會自動接收新寫入的文件並更新畫面。
  useEffect(() => {
    if (!userId || migrationDone.current || dataBackend !== 'firebase') return;
    migrationDone.current = true;

    const hasLegacyStorage = localStorage.getItem('projed-storage') || localStorage.getItem('projed_data');
    if (!hasLegacyStorage) {
      console.log('[Migration] 無舊版資料，跳過遷移。');
      return;
    }

    console.log('[Migration] 偵測到 Local Storage 舊資料，開始遷移到 Firestore...');
    migrateLocalStorageToFirestore(userId).then((success) => {
      if (success) {
        console.log('[Migration] 遷移完成！onSnapshot 將自動更新畫面。');
        // 不需要 reload：onSnapshot 監聽到 Firestore 新資料後會自動更新 Store
      }
    });
  }, [userId]); // 只在 user 改變時重新評估

  useEffect(() => {
    if (!userId || processedInviteToken.current) return;

    const params = new URLSearchParams(window.location.search);
    const token = params.get(BOARD_INVITE_TOKEN_PARAM);
    if (!token) return;

    processedInviteToken.current = token;
    boardInviteService.accept({
      token,
      userId,
      email: userEmail,
      displayName: userDisplayName,
    }).then(async (invite) => {
      const store = useBoardStore.getState();
      if (dataBackend === 'supabase') {
        try {
          const nextWorkspaces = await supabaseWorkspaceService.list();
          store.setWorkspaces(nextWorkspaces);
        } catch (workspaceError) {
          console.warn('[BoardInvite] accepted but workspace reload failed:', workspaceError);
        }
      }
      store.setActiveWorkspace(invite.workspaceId);
      store.setActiveBoard(invite.boardId);
      store.setView('board');
      useMemberStore.getState().loadMembers(invite.workspaceId, invite.boardId).catch(console.error);

      params.delete(BOARD_INVITE_TOKEN_PARAM);
      const nextQuery = params.toString();
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`
      );
      toast.success('已接受看板邀請。');
    }).catch((inviteError) => {
      console.error('[BoardInvite] accept failed:', inviteError);
      toast.error(formatBoardInviteAcceptError(inviteError));
    });
  }, [userDisplayName, userEmail, userId]);

  // ===== 自動建立預設工作區（全新使用者）=====
  // 設計意圖：等待 onSnapshot 結果 3 秒後，若仍無任何工作區，
  // 表示為全新使用者，自動建立一個預設工作區。
  useEffect(() => {
    if (!userId) return;
    if (dataBackend === 'local-test') return;

    const hasLegacyData = localStorage.getItem('projed-storage') || localStorage.getItem('projed_data');
    const hasBoardInviteToken = new URLSearchParams(window.location.search).has(BOARD_INVITE_TOKEN_PARAM);
    // 若有遷移資料，等待遷移完成，不自動建立
    if (hasLegacyData) return;
    if (hasBoardInviteToken) return;

    const timer = setTimeout(() => {
      const currentWorkspaces = useBoardStore.getState().workspaces;
      if (currentWorkspaces.length === 0) {
        console.log('[Init] 全新使用者，自動建立預設工作區。');
        useBoardStore.getState().addWorkspace('我的工作區').catch((error) => {
          console.error('[Init] 自動建立預設工作區失敗:', error);
          toast.error(error instanceof Error ? error.message : '建立預設工作區失敗，請稍後再試。');
        });
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [userId]);

  // (Phase B 已移除 cleanBoardDependencies，無需空殼 useEffect)

  // ===== 網址參數解析 (Deep Linking 建立捷徑用) =====
  const hasProcessedDeepLink = useRef(false);

  useEffect(() => {
    if (!userId || hasProcessedDeepLink.current) return;
    const params = new URLSearchParams(window.location.search);
    const modalType = params.get('modal');
    if (!modalType) {
        hasProcessedDeepLink.current = true;
        return;
    }

    const wsId = params.get('wsId');
    const bId = params.get('boardId');
    const lId = params.get('listId');
    const iId = params.get('itemId');

    if (wsId && bId && iId) {
        // 必須等待 Firestore 第 1、2 層將工作區與看板確實載入完畢，才進行後續
        const ws = workspaces.find(w => w.id === wsId);
        const board = ws?.boards.find(b => b.id === bId);
        
        if (board) {
            hasProcessedDeepLink.current = true; // 標記已成功處理，不再重複執行

            // 1. 強制切換看板 (此舉會觸發 Firestore 第 3 層監聽器，開始下載此看板的清單/卡片)
            useBoardStore.getState().switchBoard(wsId, bId);
            
            // 2. 開啟 Modal (若卡片還沒抓到，畫面會短暫隱藏，等第 3 層資料到齊後無縫開窗)
            if (!useBoardStore.getState().editingItem) {
                useBoardStore.getState().openModal(modalType as any, iId, lId || '');
            }
        }
    }
  }, [userId, workspaces]);

  const renderContent = () => {
    switch (currentView) {
      case 'home':        return <HomeView />;
      case 'task_zone':   return <TaskZoneView />;
      case 'list':        return <WbsListView boardId={activeBoardId || ''} />; // 攔截原本的 ListView
      case 'mindmap':     return <MindMapView />;
      case 'board':       return <BoardView />;
      case 'gantt':       return <GanttView />;
      case 'calendar':    return <CalendarView />;
      case 'records':     return <RecordsView />;
      case 'calendar_subscriptions': return <SettingsView initialSection="calendar" />;
      case 'settings':    return <SettingsView />;
      case 'recycle_bin': return <RecycleBinView />;
      default:            return <HomeView />;
    }
  };

  return (
    <MainLayout>
      <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-slate-500">載入中...</div>}>
        {renderContent()}
      </Suspense>
      <GlobalDialog />
    </MainLayout>
  );
}

function App() {
  return (
    <>
      <AuthGate>
        <AppContent />
      </AuthGate>
      <AppInstallAssistant />
      <ToastContainer />
    </>
  );
}

export default App;
