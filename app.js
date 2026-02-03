/**
 * ProJED 2.7 - Gantt Visual Clarity & UI Polish Build
 */

// 1. Firebase 初始化
const firebaseConfig = {
    apiKey: "AIzaSyBWsUrkyzlYZqBGeeQ7XEVqbN-k-0gvvb0",
    authDomain: "projed-cc78d.firebaseapp.com",
    projectId: "projed-cc78d",
    storageBucket: "projed-cc78d.firebasestorage.app",
    messagingSenderId: "967362299895",
    appId: "1:967362299895:web:64fd89a26d8f37751410f2",
    measurementId: "G-79J8PQK5SK"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

const ProJED = {
    state: {
        lists: [],
        currentView: 'board',
        ganttMode: 'Month',
        user: null,
        editingItem: null, // { type, itemId, listId, cardId }
        history: [],
        ganttFilters: {
            list: true,
            card: true,
            checklist: true
        },
        statusFilters: {
            todo: true,
            delayed: true,
            completed: true,
            unsure: true,
            onhold: true
        },
        ganttInitialized: false,
        boardName: '專案看板',
        showCompletedCL: false,
        activeChecklistIndex: -1,
        activeChecklistGroupId: null, // 新增：用於識別當前開啟選單的容器 ID
        activeChecklistStartDepIdx: -1,
        activeChecklistEndDepIdx: -1,
        redoStack: []
    },

    GRID_START: dayjs('2024-01-01'),
    BAR_HEIGHT: 45,

    async init() {
        console.log("🚀 [ProJED 2.7] 進階視覺版備份啟動...");
        this.Data.load();

        // 嘗試初始化 Google API
        this.Google.init();

        auth.onAuthStateChanged(async user => {
            this.state.user = user;
            this.UI.updateAuthUI(user);
            if (user) {
                this.Cloud.syncFromFirebase();
            } else {
                this.renderActiveView();
            }
        });

        this.initEventListeners();
        this.UI.setupDateInputs();
        this.renderActiveView();

        // 處理 Deep Link
        this.handleUrlParams();

        if (window.lucide) lucide.createIcons();
    },

    // 新增：處理網址參數以支援 Deep Link
    handleUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const itemId = urlParams.get('itemId');
        if (itemId) {
            console.log("🔗 偵測到 Deep Link，正在尋找項目:", itemId);
            // 延遲一點點確保資料已載入
            setTimeout(() => {
                const item = this.Data.findItemDeep(itemId);
                if (item) {
                    this.Modal.open(item.type, item.id, item.listId, item.cardId);
                }
            }, 1000);
        }
    },


    Data: {
        load() {
            let saved = localStorage.getItem('projed_data');
            // Migration: Check for old name if new name not found
            if (!saved) {
                const oldSaved = localStorage.getItem('vibeflow_data');
                if (oldSaved) {
                    saved = oldSaved;
                    localStorage.setItem('projed_data', oldSaved);
                    console.log("Found legacy VibeFlow data, migrated to ProJED.");
                }
            }
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    let lists = [];
                    // 兼容舊資料格式 (舊格式直接是陣列)
                    if (Array.isArray(parsed)) {
                        lists = parsed;
                    } else {
                        lists = parsed.lists || [];
                        ProJED.state.boardName = parsed.boardName || '專案看板';
                    }

                    lists = this.migrate(lists);
                    ProJED.state.lists = lists;
                } catch (e) { }
            }
            if (!ProJED.state.lists || ProJED.state.lists.length === 0) {
                ProJED.state.lists = [{ id: 'l1', title: '預設計畫', startDate: '2026-01-01', endDate: '2026-02-01', cards: [], status: 'todo', ganttVisible: true }];
            }
        },
        migrate(lists) {
            if (!Array.isArray(lists)) return lists;
            lists.forEach(l => {
                (l.cards || []).forEach(c => {
                    const hasOld = Array.isArray(c.checklists) && c.checklists.length > 0;
                    const hasNew = Array.isArray(c.checklistContainers) && c.checklistContainers.length > 0;

                    if (hasOld && !hasNew) {
                        console.log(`📦 [Data.migrate] 正在遷移卡片 [${c.title || c.name || '未命名'}] 的待辦項目...`);
                        c.checklistContainers = [{
                            id: 'cc_' + Date.now() + Math.random().toString(36).substr(2, 5),
                            title: '待辦清單',
                            items: [...c.checklists]
                        }];
                        delete c.checklists;
                    }
                });
            });
            return lists;
        },
        save(pushHistory = true) {
            const dataToSave = {
                lists: ProJED.state.lists,
                boardName: ProJED.state.boardName
            };
            localStorage.setItem('projed_data', JSON.stringify(dataToSave));
            if (pushHistory) ProJED.History.push();

            // 在保存前重新計算日期
            ProJED.Data.recalculateAllDates();

            if (ProJED.state.user) ProJED.Cloud.saveToFirebase();

            // 即時單點同步：如果有正在編輯的項目，且只有該項目被修改，我們只同步它
            if (ProJED.Google.accessToken && ProJED.state.editingItem) {
                const { type, itemId, listId, cardId } = ProJED.state.editingItem;
                const item = this.findItem(type, itemId, listId, cardId);
                // 使用 setTimeout 讓同步在背景執行，不卡頓 UI
                if (item) setTimeout(() => ProJED.Google.syncItem(item), 100);
            }

            ProJED.renderActiveView();

            // 如果彈窗開著，強制刷新彈窗內容以避開引用斷裂問題
            if (ProJED.state.editingItem) {
                const { type, itemId, listId, cardId } = ProJED.state.editingItem;
                ProJED.Modal.refresh(type, itemId, listId, cardId);
            }
        },
        // 核心：路徑式查找，確保 ID 匹配不失敗
        toggleGanttVisibility(type, id, listId = null, cardId = null) {
            const item = this.findItem(type, id, listId, cardId);
            if (item) {
                item.ganttVisible = (item.ganttVisible === undefined) ? false : !item.ganttVisible;
                this.save();
                ProJED.renderActiveView(); // Re-render to reflect changes
            }
        },

        // -------------------------------------------------------------------------
        //  Selection Mode Logic
        // -------------------------------------------------------------------------
        SelectionMode: {
            active: false,
            targetType: null, // 'start' or 'end' or checklist dep types
            callback: null,

            enter(targetType, callback) {
                this.active = true;
                this.targetType = targetType;
                this.callback = callback;

                document.body.classList.add('is-picking-dependency');
                ProJED.Modal.hideForSelection();

                // Show toast instruction
                ProJED.UI.showToast("請點選畫面上的卡片、列表或甘特圖條...");
            },

            exit() {
                this.active = false;
                this.targetType = null;
                this.callback = null;
                document.body.classList.remove('is-picking-dependency');
                ProJED.Modal.showFromSelection();
            },

            handleClick(e) {
                if (!this.active) return;

                // Find closest candidate
                const candidate = e.target.closest('.selection-candidate');
                if (candidate) {
                    e.preventDefault();
                    e.stopPropagation();

                    const id = candidate.dataset.id;
                    // Optional: Validate if ID is valid (not self, etc)
                    if (this.callback) this.callback(id);

                    this.exit();
                } else if (e.target.closest('#selection-cancel-btn')) {
                    this.exit();
                }
            }
        },
        // 新增：獲取所有可作為依存目標的項目
        getAllSelectableItems(excludeId = null) {
            const items = [];
            ProJED.state.lists.forEach(l => {
                const prefix = l.id === excludeId ? '⭐ (自己) ' : '';
                items.push({ id: l.id, title: `${prefix}[列表] ${l.title}`, startDate: l.startDate, endDate: l.endDate });
                (l.cards || []).forEach(c => {
                    const cPrefix = c.id === excludeId ? '⭐ (自己) ' : '';
                    items.push({ id: c.id, title: `${cPrefix}[卡片] ${c.title}`, startDate: c.startDate, endDate: c.endDate });
                    (c.checklistContainers || []).forEach(cc => {
                        (cc.items || []).forEach(cl => {
                            const clPrefix = cl.id === excludeId ? '⭐ (自己) ' : '';
                            items.push({ id: cl.id, title: `${clPrefix}[待辦] ${cl.title || cl.name}`, startDate: cl.startDate, endDate: cl.endDate });
                        });
                    });
                });
            });
            // 排序：將 (自己) 置頂
            return items.sort((a, b) => {
                if (a.title.includes('(自己)')) return -1;
                if (b.title.includes('(自己)')) return 1;
                return 0;
            });
        },
        // 新增：重新計算所有依存日期
        recalculateAllDates() {
            console.log("🔄 正在重新計算依存日期...");
            const MAX_ITERATIONS = 5; // 避免循環依賴導致死循環
            let changed = true;
            let iterations = 0;

            // 建立 ID 對應項目的快速查找 Map
            const buildItemMap = () => {
                const map = new Map();
                ProJED.state.lists.forEach(l => {
                    map.set(l.id, l);
                    (l.cards || []).forEach(c => {
                        map.set(c.id, c);
                        (c.checklistContainers || []).forEach(cc => {
                            (cc.items || []).forEach(cl => {
                                map.set(cl.id, cl);
                            });
                        });
                    });
                });
                return map;
            };

            while (changed && iterations < MAX_ITERATIONS) {
                changed = false;
                iterations++;
                const itemMap = buildItemMap();

                itemMap.forEach((item, id) => {
                    // 起始日依存
                    if (item.startDependency && item.startDependency.targetId) {
                        const target = itemMap.get(item.startDependency.targetId);
                        if (target) {
                            const targetDate = item.startDependency.type === 'start' ? target.startDate : target.endDate;
                            if (targetDate) {
                                const newDate = dayjs(targetDate).add(item.startDependency.offset || 0, 'day').format('YYYY-MM-DD');
                                if (item.startDate !== newDate) {
                                    item.startDate = newDate;
                                    changed = true;
                                }
                            }
                        }
                    }
                    // 到期日依存
                    if (item.endDependency && item.endDependency.targetId) {
                        const target = itemMap.get(item.endDependency.targetId);
                        if (target) {
                            const targetDate = item.endDependency.type === 'start' ? target.startDate : target.endDate;
                            if (targetDate) {
                                const newDate = dayjs(targetDate).add(item.endDependency.offset || 0, 'day').format('YYYY-MM-DD');
                                if (item.endDate !== newDate) {
                                    item.endDate = newDate;
                                    changed = true;
                                }
                            }
                        }
                    }
                });
            }
            if (iterations >= MAX_ITERATIONS) console.warn("⚠️ 偵測到可能的循環依賴，已停止計算。");
        },
        // 新增：安全查找當前狀態中的項目，防止 Firebase 同步導致的引用失效
        findItem(type, itemId, listId = null, cardId = null, containerId = null) {
            if (type === 'list') {
                return ProJED.state.lists.find(l => l.id === itemId);
            } else if (type === 'card') {
                const list = ProJED.state.lists.find(l => l.id === (listId || ""));
                return list?.cards.find(c => c.id === itemId);
            } else if (type === 'checklist') {
                const list = ProJED.state.lists.find(l => l.id === (listId || ""));
                const card = list?.cards.find(c => c.id === (cardId || ""));
                if (containerId) {
                    const container = card?.checklistContainers?.find(cc => cc.id === containerId);
                    return container?.items.find(cl => cl.id === itemId);
                }
                // 如果沒給 containerId，進行深度搜索
                for (const cc of (card?.checklistContainers || [])) {
                    const item = cc.items.find(cl => cl.id === itemId);
                    if (item) return item;
                }
            }
            return null;
        },
        // 新增：深度查找項目（支援所有類型）
        findItemDeep(id) {
            for (const l of ProJED.state.lists) {
                if (l.id === id) return { ...l, type: 'list' };
                for (const c of (l.cards || [])) {
                    if (c.id === id) return { ...c, type: 'card', listId: l.id };
                    for (const cc of (c.checklistContainers || [])) {
                        for (const cl of (cc.items || [])) {
                            if (cl.id === id) return { ...cl, type: 'checklist', listId: l.id, cardId: c.id, containerId: cc.id };
                        }
                    }
                }
            }
            return null;
        }
    },



    Cloud: {
        async saveToFirebase() {
            if (!ProJED.state.user) return;
            await db.collection('user_projects').doc(ProJED.state.user.uid).set({
                lists: ProJED.state.lists,
                boardName: ProJED.state.boardName || '專案看板',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        },
        async syncFromFirebase() {
            if (!ProJED.state.user) return;
            db.collection('user_projects').doc(ProJED.state.user.uid).onSnapshot(doc => {
                if (doc.exists) {
                    const data = doc.data();
                    const currentData = { lists: ProJED.state.lists, boardName: ProJED.state.boardName };
                    const incomingData = { lists: data.lists, boardName: data.boardName || '專案看板' };

                    if (JSON.stringify(currentData) !== JSON.stringify(incomingData)) {
                        ProJED.state.lists = ProJED.Data.migrate(data.lists);
                        ProJED.state.boardName = data.boardName || '專案看板';
                        ProJED.renderActiveView();
                        // 同時刷新彈窗
                        if (ProJED.state.editingItem) {
                            const { type, itemId, listId, cardId } = ProJED.state.editingItem;
                            ProJED.Modal.refresh(type, itemId, listId, cardId);
                        }
                    }
                }
            });
        }
    },

    // -------------------------------------------------------------------------
    //  Google Calendar Sync Module (New)
    // -------------------------------------------------------------------------
    Google: {
        CLIENT_ID: '347833826273-0iua3bitkn60aeok9js56vt95799bf2l.apps.googleusercontent.com', // 請替換成您的 Client ID
        apiKey: firebaseConfig.apiKey,
        DISCOVERY_DOCS: ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"],
        SCOPES: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar',

        tokenClient: null,
        accessToken: null,
        calendarId: null, // "ProJED Tasks" 行事曆的 ID

        async init() {
            console.log("🛠️ 初始化 Google 授權工具...");

            // 從本地載入已存儲的權杖
            const savedToken = localStorage.getItem('google_access_token');
            const expiry = localStorage.getItem('google_token_expiry');
            if (savedToken && expiry && Date.now() < parseInt(expiry)) {
                this.accessToken = savedToken;
                console.log("♻️ 已從本地載入有效的 Google 權杖");
            }

            // 1. 初始化 GSI (身分驗證/授權彈窗模組)
            try {
                if (window.google && google.accounts && google.accounts.oauth2) {
                    this.tokenClient = google.accounts.oauth2.initTokenClient({
                        client_id: this.CLIENT_ID,
                        scope: this.SCOPES,
                        callback: (resp) => {
                            if (resp.error) {
                                console.error("GSI 授權錯誤:", resp);
                                ProJED.UI.showToast("授權失敗: " + (resp.error_description || resp.error));
                                return;
                            }
                            console.log("🔑 已取得存取權杖 (Access Token)");
                            this.accessToken = resp.access_token;

                            // 儲存權杖與過期時間 (通常為一小時，我們存 3600 秒)
                            const expiresAt = Date.now() + (resp.expires_in || 3600) * 1000;
                            localStorage.setItem('google_access_token', resp.access_token);
                            localStorage.setItem('google_token_expiry', expiresAt.toString());

                            ProJED.UI.showToast("Google 日曆授權成功");
                            this.syncAll(true);
                        },
                    });
                    console.log("✅ OAuth 授權工具已就緒");
                }
            } catch (gsiErr) {
                console.error("❌ GSI 授權工具初始化失敗:", gsiErr);
            }

            // 2. 初始化 GAPI (僅載入基礎框架)
            try {
                await new Promise(resolve => gapi.load('client', resolve));
                console.log("✅ Google GAPI 框架載入完成");
            } catch (err) {
                console.error("❌ Google GAPI 載入失敗:", err);
            }
        },

        async requestToken() {
            if (!this.tokenClient) {
                console.log("嘗試重新初始化 Google API...");
                await this.init();
            }
            if (this.tokenClient) {
                // 移除 prompt: 'consent'，讓瀏覽器嘗試自動授與權限（如果已登入過）
                this.tokenClient.requestAccessToken({ prompt: '' });
            } else {
                ProJED.UI.showToast("Google API 初始化尚未完成，請稍候再試");
            }
        },

        // 新增：直接使用 Fetch 呼叫 Google Calendar REST API
        async apiCall(endpoint, method = 'GET', body = null) {
            const url = `https://www.googleapis.com/calendar/v3${endpoint}`;
            const options = {
                method,
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            };
            if (body) options.body = JSON.stringify(body);
            const resp = await fetch(url, options);
            if (!resp.ok) {
                const err = await resp.json();
                throw err;
            }
            return await resp.json();
        },

        async getOrCreateCalendar() {
            if (this.calendarId) return this.calendarId;

            try {
                // 尋找名稱為 "ProJED Tasks" 的日曆
                const listResp = await this.apiCall('/users/me/calendarList');
                const existing = listResp.items.find(c => c.summary === 'ProJED Tasks');
                if (existing) {
                    this.calendarId = existing.id;
                    return this.calendarId;
                }

                // 若不存在則建立
                const newCal = await this.apiCall('/calendars', 'POST', { summary: 'ProJED Tasks' });
                this.calendarId = newCal.id;
                return this.calendarId;
            } catch (err) {
                console.error("無法取得/建立日曆:", err);
                throw err;
            }
        },

        async syncAll(showToast = false) {
            if (!this.accessToken) {
                if (showToast) ProJED.UI.showToast("請先點擊『Google 登入』或重新授權");
                return;
            }

            try {
                if (showToast) ProJED.UI.showToast("同步中...");
                const calId = await this.getOrCreateCalendar();

                // 1. 抓取目前 Google 日曆上的所有事件
                console.log("📥 正在從 Google 日曆讀取事件...");
                const eventsResp = await this.apiCall(`/calendars/${encodeURIComponent(calId)}/events?maxResults=2500`);
                const googleEvents = eventsResp.items || [];
                console.log(`✅ 讀取到 ${googleEvents.length} 個 Google 日曆事件`);

                const googleEventMap = new Map();
                googleEvents.forEach(e => {
                    if (e.description && e.description.includes('PROJED_ID:')) {
                        const parts = e.description.split('PROJED_ID:');
                        if (parts.length > 1) {
                            const id = parts[1].trim();
                            googleEventMap.set(id, e); // 儲存整個事件物件以便比對
                        }
                    }
                });

                // 2. 遍歷 ProJED 所有具備日期的項目
                const projedItems = [];
                ProJED.state.lists.forEach(l => {
                    if (l.startDate || l.endDate) projedItems.push({ ...l, type: 'list' });
                    (l.cards || []).forEach(c => {
                        if (c.startDate || c.endDate) projedItems.push({ ...c, type: 'card' });
                        (c.checklistContainers || []).forEach(cc => {
                            (cc.items || []).forEach(cl => {
                                if (cl.startDate || cl.endDate) projedItems.push({ ...cl, type: 'checklist' });
                            });
                        });
                    });
                });

                console.log(`📋 ProJED 共有 ${projedItems.length} 個項目需要同步`);

                const syncedIds = new Set();
                let updatedCount = 0, skippedCount = 0, createdCount = 0;

                for (const item of projedItems) {
                    const eventData = this.formatItemToEvent(item);
                    const existingEvent = googleEventMap.get(item.id);

                    if (existingEvent) {
                        // 智慧比對：檢查是否需要更新
                        const needsUpdate =
                            existingEvent.summary !== eventData.summary ||
                            existingEvent.description.trim() !== eventData.description.trim() || // 簡單去除空白比對
                            existingEvent.start.date !== eventData.start.date ||
                            existingEvent.end.date !== eventData.end.date ||
                            (existingEvent.colorId || '1') !== (eventData.colorId || '1'); // 預設顏色處理

                        if (needsUpdate) {
                            try {
                                console.log(`🔄 [差異更新] 事件 [${item.title}] 有變動，正在同步...`);
                                await this.apiCall(`/calendars/${encodeURIComponent(calId)}/events/${existingEvent.id}`, 'PUT', eventData);
                                updatedCount++;
                            } catch (e) {
                                console.error(`❌ 更新失敗 [${item.title}]:`, e);
                            }
                        } else {
                            // console.log(`⏭️ [跳過] 事件 [${item.title}] 無變動`);
                            skippedCount++;
                        }
                        syncedIds.add(item.id);
                    } else {
                        // 新增邏輯
                        try {
                            console.log(`➕ 新增事件 [${item.title}]: ${eventData.start.date}`);
                            await this.apiCall(`/calendars/${encodeURIComponent(calId)}/events`, 'POST', eventData);
                            createdCount++;
                        } catch (e) {
                            console.error(`❌ 新增失敗 [${item.title}]:`, e);
                        }
                        syncedIds.add(item.id);
                    }
                }
                console.log(`📊 同步摘要: 新增 ${createdCount}, 更新 ${updatedCount}, 跳過 ${skippedCount}`);

                // 3. 處理刪除
                for (const [projedId, gEvent] of googleEventMap.entries()) {
                    if (!syncedIds.has(projedId)) {
                        try {
                            console.log(`🗑️ 刪除 Google 多餘事件 (ID: ${gEvent.id})`);
                            await this.apiCall(`/calendars/${encodeURIComponent(calId)}/events/${gEvent.id}`, 'DELETE');
                        } catch (e) { console.warn("刪除失敗", e); }
                    }
                }

                if (showToast) ProJED.UI.showToast(`同步完成 (更新 ${updatedCount} 筆)`);
            } catch (err) {
                console.error("同步失敗:", err);
                if (showToast) ProJED.UI.showToast("同步失敗，請重新登入授權");
            }
        },

        formatItemToEvent(item) {
            const targetDate = item.endDate || item.startDate; // 優先使用結束時間點，作為唯一的同步點
            const baseUrl = window.location.origin + window.location.pathname;
            const deepLink = `${baseUrl}?itemId=${item.id}`;

            return {
                summary: `[${this.getTypeLabel(item.type)}] ${item.title || item.name || '無標題'}`,
                description: `${item.notes || ''}\n\n---\n🔗 在 ProJED 查看: ${deepLink}\nPROJED_ID: ${item.id}`,
                start: { date: targetDate },
                end: { date: dayjs(targetDate).add(1, 'day').format('YYYY-MM-DD') },
                colorId: this.getStatusColorId(item.status)
            };
        },

        getTypeLabel(type) {
            if (type === 'list') return '列表';
            if (type === 'card') return '卡片';
            return '待辦';
        },

        getStatusColorId(status) {
            const map = { todo: '1', delayed: '4', completed: '10', unsure: '5', onhold: '8' };
            return map[status] || '1';
        },

        async syncItem(item) {
            if (!this.accessToken) return;
            // 檢查是否具有時間屬性，沒有就不必同步
            if (!item.startDate && !item.endDate) return;

            console.log(`⚡ [即時同步] 正在背景更新: ${item.title}`);
            try {
                const calId = await this.getOrCreateCalendar();
                const eventData = this.formatItemToEvent(item);

                // 為了單點更新，我们需要先找到對應的 Google Event ID
                // 這裡稍微取巧：先讀取所有事件 (因為 Google API 沒有直接用 description 搜尋的功能)
                // 但為了效能，我們可以只讀取最近的，或是如果能儲存 Google Event ID 到本地庫會更好
                // 目前先維持讀取全部，但因為只有一筆寫入，速度還可以接受
                // *優化*：未來可以在 item 裡多存一個 googleEventId 欄位，就不用每次都 search

                const eventsResp = await this.apiCall(`/calendars/${encodeURIComponent(calId)}/events?maxResults=2500`);
                const googleEvents = eventsResp.items || [];
                const existingEvent = googleEvents.find(e => e.description && e.description.includes(`PROJED_ID: ${item.id}`));

                if (existingEvent) {
                    if (
                        existingEvent.summary !== eventData.summary ||
                        existingEvent.start.date !== eventData.start.date ||
                        existingEvent.end.date !== eventData.end.date
                    ) {
                        await this.apiCall(`/calendars/${encodeURIComponent(calId)}/events/${existingEvent.id}`, 'PUT', eventData);
                        console.log(`✅ [即時同步] 更新成功`);
                    }
                } else {
                    await this.apiCall(`/calendars/${encodeURIComponent(calId)}/events`, 'POST', eventData);
                    console.log(`✅ [即時同步] 新增成功`);
                }
            } catch (err) {
                console.error("❌ [即時同步] 失敗:", err);
            }
        },

        async clearAll() {
            if (!this.accessToken) {
                ProJED.UI.showToast("請先登入 Google 帳號");
                return;
            }
            if (!confirm("這將移除 Google 日曆上的『ProJED Tasks』日曆，確定嗎？")) return;
            try {
                const calId = await this.getOrCreateCalendar();
                await this.apiCall(`/calendars/${encodeURIComponent(calId)}`, 'DELETE');
                this.calendarId = null;
                ProJED.UI.showToast("日曆已移除");
            } catch (err) {
                console.error(err);
                ProJED.UI.showToast("移除失敗");
            }
        }
    },


    UI: {
        switchView(view) {
            ProJED.state.currentView = view;
            document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
            document.getElementById('board-view').style.display = view === 'board' ? 'flex' : 'none';

            document.getElementById('gantt-view').style.display = view === 'gantt' ? 'flex' : 'none';
            ProJED.renderActiveView();
        },
        updateAuthUI(user) {
            const btn = document.getElementById('auth-btn');
            const profile = document.getElementById('user-profile');
            const avatar = document.getElementById('user-avatar');
            const initials = document.getElementById('user-initials');

            if (btn) {
                btn.style.display = user ? 'none' : 'flex';
                btn.innerHTML = '<i data-lucide="log-in"></i> <span>Google 登入</span>';
            }

            if (profile) {
                profile.style.display = user ? 'flex' : 'none';
                if (user) {
                    if (user.photoURL) {
                        avatar.src = user.photoURL;
                        avatar.style.display = 'block';
                        initials.style.display = 'none';
                    } else {
                        avatar.style.display = 'none';
                        initials.style.display = 'flex';
                        initials.innerText = (user.displayName || user.email || 'U').charAt(0).toUpperCase();
                    }
                    profile.title = `${user.displayName || '使用者'} (${user.email}) - 點選以登出`;
                }
            }
            if (window.lucide) lucide.createIcons();
        },
        // 新增：日期輸入框自動跳轉與導航邏輯
        setupDateInputs(container = document) {
            container.querySelectorAll('.split-date-input').forEach(wrapper => {
                if (wrapper.dataset.dateInputsInitialized) return; // 避免重複綁定
                wrapper.dataset.dateInputsInitialized = "true";

                const inputs = wrapper.querySelectorAll('input.date-part');
                inputs.forEach((input, index) => {
                    // 輸入時自動跳轉
                    input.addEventListener('input', (e) => {
                        const val = e.target.value.replace(/\D/g, ''); // 只允許數字
                        e.target.value = val;

                        // 當輸入長度達到限制，且不是最後一個欄位時，跳到下一個
                        if (val.length === input.maxLength) {
                            if (index < inputs.length - 1) {
                                inputs[index + 1].focus();
                            }
                        }
                    });

                    // 新增：失去焦點時嘗試同步日期並儲存
                    input.addEventListener('blur', () => {
                        if (wrapper.id === 'start-date-wrapper' || wrapper.id === 'end-date-wrapper') {
                            app.syncModalDates();
                        } else if (wrapper.dataset.clIdx !== undefined) {
                            // 待辦項目的日期
                            app.syncChecklistDates(parseInt(wrapper.dataset.clIdx));
                        }
                    });

                    // 鍵盤導航 (方向鍵與 Backspace)
                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'ArrowRight') {
                            // 如果游標在最後或是空值，且不是最後一個欄位，跳到下一個
                            if ((input.selectionStart === input.value.length || input.value === '') && index < inputs.length - 1) {
                                e.preventDefault();
                                inputs[index + 1].focus();
                            }
                        } else if (e.key === 'ArrowLeft') {
                            // 如果游標在最前或是空值，且不是第一個欄位，跳到上一個
                            if ((input.selectionStart === 0 || input.value === '') && index > 0) {
                                e.preventDefault();
                                inputs[index - 1].focus();
                            }
                        } else if (e.key === 'Backspace') {
                            // 如果欄位為空，按 Backspace 跳回上一個並刪除最後一個字
                            if (input.value === '' && index > 0) {
                                e.preventDefault();
                                const prev = inputs[index - 1];
                                prev.focus();
                                // 可選：是否刪除上一個欄位的最後一個字？通常這是順暢體驗的一部分
                                // prev.value = prev.value.slice(0, -1); 
                            }
                        }
                    });
                });
            });
        },

        // 新增：日期校驗與自動修正 (防呆) - 接收日期字串
        validateAndFixDate(dateString, label) {
            let val = dateString.trim().replace(/\s/g, '').replace(/\//g, '-');
            if (!val || val === '--') return ""; // 空值或只有分隔符

            // 先檢查是否所有部分都有填寫 (簡單檢查長度)
            const parts = val.split('-');
            if (parts.length !== 3 || parts.some(p => !p)) {
                if (val.length > 2) {
                    alert(`${label}：格式不完整，請填寫完整 YYYY/MM/DD`);
                    return false;
                }
                return "";
            }

            // 先檢查日期是否超出該月天數（在 dayjs 驗證之前）
            const y = parseInt(parts[0]);
            const m = parseInt(parts[1]);
            let dNum = parseInt(parts[2]);

            if (!isNaN(y) && !isNaN(m) && !isNaN(dNum)) {
                if (m >= 1 && m <= 12) {
                    const lastDayDate = dayjs(`${y}-${m}-01`).endOf('month');
                    const lastDay = lastDayDate.date();
                    if (dNum > lastDay) {
                        const suggested = lastDayDate.format('YYYY/MM/DD');
                        if (confirm(`${label} (${dateString}) 並不存在，是否幫你存入該月最接近的可行日期 ${suggested}？`)) {
                            return lastDayDate.format('YYYY-MM-DD');
                        } else {
                            return false;
                        }
                    }
                }
            }

            // 再用 dayjs 驗證格式
            const d = dayjs(val, ['YYYY-MM-DD', 'YYYY-M-D'], true);
            if (d.isValid()) return d.format('YYYY-MM-DD');

            alert(`${label}：這日期並不存在或格式有誤 (${dateString})。請使用 YYYY/MM/DD 格式`);
            return false;
        },
        showToast(msg) {
            const t = document.getElementById('toast');
            if (t) { t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000); }
        },
        getStatusColor(status) {
            const colors = { todo: '#64748b', delayed: '#f97316', completed: '#10b981', unsure: '#a855f7', onhold: '#cbd5e1' };
            return colors[status] || '#64748b';
        }
    },

    Board: {
        render() {
            const container = document.getElementById('list-container');
            if (!container) return;
            // 更新看板標題
            const titleEl = document.getElementById('board-title');
            if (titleEl && titleEl.innerText !== ProJED.state.boardName) {
                titleEl.innerText = ProJED.state.boardName;
            }
            container.innerHTML = '';
            ProJED.state.lists.forEach(list => {
                const status = list.status || 'todo';
                if (!ProJED.state.statusFilters[status]) return; // 過濾列表

                const div = document.createElement('div');
                div.className = 'list-wrapper selection-candidate';
                div.dataset.id = list.id;
                div.dataset.type = 'list';
                const isHidden = list.ganttVisible === false;
                div.innerHTML = `
                    <div class="list-header" onclick="if(!ProJED.Data.SelectionMode.active) app.openEditModal('list', '${list.id}')" style="cursor:pointer;">
                        <h3 class="status-${status}">${list.title || '新列表'}</h3>
                        <div class="visibility-toggle ${isHidden ? 'hidden-in-gantt' : ''}" 
                             onclick="event.stopPropagation(); app.toggleGanttVisibility('list', '${list.id}')" 
                             style="cursor:pointer; z-index:100;">
                            <i data-lucide="${isHidden ? 'eye-off' : 'eye'}"></i>
                        </div>
                    </div>
                    <div class="card-container" id="cards-${list.id}"></div>
                    <button class="add-card-btn" onclick="app.addNewCard('${list.id}')">+ 新增卡片</button>`;
                const area = div.querySelector('.card-container');
                (list.cards || []).forEach(card => {
                    const cStatus = card.status || 'todo';
                    if (!ProJED.state.statusFilters[cStatus]) return; // 過濾卡片

                    const el = document.createElement('div');
                    el.className = 'card selection-candidate';
                    el.dataset.id = card.id;
                    el.dataset.type = 'card';
                    //讓整張卡片可點擊
                    el.setAttribute('onclick', `if(!ProJED.Data.SelectionMode.active) app.openEditModal('card', '${card.id}', '${list.id}')`);

                    const isCardHidden = card.ganttVisible === false;
                    const displayStatus = (card.title && card.title.includes('答辯') && cStatus === 'todo') ? 'unsure' : cStatus;
                    el.innerHTML = `
                        <div class="card-title-container">
                            <div class="card-title status-${displayStatus}">${card.title || '新卡片'}</div>
                            <div class="visibility-toggle ${isCardHidden ? 'hidden-in-gantt' : ''}" 
                                 onclick="event.stopPropagation(); app.toggleGanttVisibility('card', '${card.id}', '${list.id}')"
                                 style="cursor:pointer; z-index:100;">
                                <i data-lucide="${isCardHidden ? 'eye-off' : 'eye'}"></i>
                            </div>
                        </div>`;
                    area.appendChild(el);
                });
                container.appendChild(div);
            });

            // 在列表最後方加上「新增列表」按鈕
            const addListBtnWrapper = document.createElement('div');
            addListBtnWrapper.className = 'add-list-wrapper';
            addListBtnWrapper.innerHTML = `
                <button class="add-list-btn-main" onclick="app.addNewList()">
                    <i data-lucide="plus"></i> <span>新增列表</span>
                </button>
            `;
            container.appendChild(addListBtnWrapper);

            if (window.lucide) lucide.createIcons();
            this.initSortable();
        },
        initSortable() {
            const listContainer = document.getElementById('list-container');
            if (!listContainer) return;

            // 銷毀舊實例 (如果存在)
            if (this.listSortable) this.listSortable.destroy();
            this.cardSortables = this.cardSortables || [];
            this.cardSortables.forEach(s => s.destroy());
            this.cardSortables = [];

            // 1. 列表拖拽
            // 1. 列表拖拽
            this.listSortable = Sortable.create(listContainer, {
                animation: 150,
                handle: '.list-header',
                forceFallback: true, // 提升相容性
                fallbackOnBody: true, // 確保拖曳元素座標正確
                fallbackTolerance: 5, // 移動超過 5px 才算拖曳，避免誤觸
                onEnd: () => this.syncStateFromDOM()
            });

            // 2. 卡片拖拽 (跨列表)
            document.querySelectorAll('.card-container').forEach(el => {
                const s = Sortable.create(el, {
                    group: 'shared-cards',
                    animation: 150,
                    forceFallback: true,
                    fallbackOnBody: true, // 確保拖曳元素座標正確
                    fallbackTolerance: 5, // 移動超過 5px 才算拖曳，避免誤觸
                    onEnd: () => this.syncStateFromDOM()
                });
                this.cardSortables.push(s);
            });

            // 3. 待辦清單拖拽
            const clContainer = document.getElementById('checklist-items-container');
            if (clContainer) {
                if (this.checklistSortable) this.checklistSortable.destroy();
                this.checklistSortable = Sortable.create(clContainer, {
                    group: 'shared-checklists', // 支援跨容器 (雖然目前主要在 Modal)
                    animation: 150,
                    handle: '.cl-drag-handle', // 透過標題旁的把手拖動
                    forceFallback: true,
                    fallbackOnBody: true,
                    fallbackTolerance: 5,
                    onEnd: () => {
                        const { listId, cardId } = ProJED.state.editingItem || {};
                        if (!listId || !cardId) return;
                        const card = ProJED.state.lists.find(l => l.id === listId)?.cards.find(c => c.id === cardId);
                        if (card) {
                            const newOrderIds = Array.from(clContainer.children).map(el => el.dataset.id);
                            const itemMap = new Map(card.checklists.map(cl => [cl.id, cl]));
                            card.checklists = newOrderIds.map(id => itemMap.get(id)).filter(Boolean);
                            ProJED.Data.save(true);
                        }
                    }
                });
            }
        },
        syncStateFromDOM() {
            const cardMap = new Map();
            ProJED.state.lists.forEach(l => l.cards.forEach(c => cardMap.set(c.id, c)));
            const listMap = new Map();
            ProJED.state.lists.forEach(l => listMap.set(l.id, l));

            const newLists = [];
            document.querySelectorAll('.list-wrapper').forEach(listEl => {
                const lid = listEl.dataset.id;
                const list = listMap.get(lid);
                if (list) {
                    const newCards = [];
                    listEl.querySelectorAll('.card').forEach(cardEl => {
                        const cid = cardEl.dataset.id;
                        const card = cardMap.get(cid);
                        if (card) newCards.push(card);
                    });
                    list.cards = newCards;
                    newLists.push(list);
                }
            });
            ProJED.state.lists = newLists;
            ProJED.Data.save(true);
        },
        addList() {
            const id = 'l' + Date.now();
            ProJED.state.lists.push({ id, title: '新列表', startDate: dayjs().format('YYYY-MM-DD'), endDate: dayjs().add(1, 'month').format('YYYY-MM-DD'), cards: [], status: 'todo', ganttVisible: true });
            ProJED.Data.save();
        },
        addCard(listId) {
            const list = ProJED.state.lists.find(l => l.id === listId);
            if (!list) return;
            const id = 'c' + Date.now();
            list.cards.push({ id, title: '新卡片', startDate: dayjs().format('YYYY-MM-DD'), endDate: dayjs().add(1, 'week').format('YYYY-MM-DD'), status: 'todo', ganttVisible: true, checklists: [] });
            ProJED.Data.save();
        }
    },

    Gantt: {
        getDateFromX(x, colWidth) {
            const mode = ProJED.state.ganttMode || 'Month';
            const units = x / colWidth;

            let monthsToAdd = units;
            if (mode === 'Quarter') monthsToAdd = units * 3;
            if (mode === 'Year') monthsToAdd = units * 12;

            // 提高解析度至 1/4 格為單位 (0.25 單位)
            const qUnits = Math.round(monthsToAdd * 4);
            const fullMonths = Math.floor(qUnits / 4);
            const extraQ = qUnits % 4; // 0, 1, 2, 3 (代表 0, 0.25, 0.5, 0.75)

            const baseMonth = ProJED.GRID_START.add(fullMonths, 'month');
            if (extraQ === 0) return baseMonth.format('YYYY-MM-DD');

            const daysInMonth = baseMonth.daysInMonth();
            const extraDays = Math.round((extraQ / 4) * daysInMonth);
            return baseMonth.add(extraDays, 'day').format('YYYY-MM-DD');
        },

        render() {
            const container = document.querySelector('.gantt-container');
            const mask = document.querySelector('.gantt-mask');
            if (!container || !mask) return;

            const mode = ProJED.state.ganttMode || 'Month';
            const oldScrollLeft = container.querySelector('.gantt-scroll-container')?.scrollLeft || 0;

            // 基礎寬度計算
            let colWidth = Math.floor(mask.getBoundingClientRect().width / 12);
            if (mode === 'Quarter') colWidth = Math.floor(mask.getBoundingClientRect().width / 12);
            if (mode === 'Year') colWidth = Math.floor(mask.getBoundingClientRect().width / 5);

            container.style.setProperty('--col-width', `${colWidth}px`);
            container.innerHTML = '';

            const scrollArea = document.createElement('div');
            scrollArea.className = 'gantt-scroll-container';
            scrollArea.style.cssText = "position: relative; width: 100%; height: 100%; overflow: auto; background: #fff;";
            container.appendChild(scrollArea);

            const header = this.createHeader(colWidth);
            scrollArea.appendChild(header);

            const gridLayer = document.createElement('div');
            gridLayer.className = 'gantt-grid-layer';

            let totalUnits = 60; // Units based on mode
            if (mode === 'Quarter') totalUnits = 24; // 24 quarters = 6 years
            if (mode === 'Year') totalUnits = 10; // 10 years

            gridLayer.style.width = `${totalUnits * colWidth}px`;
            scrollArea.appendChild(gridLayer);

            let rowIdx = 0;
            const items = [];
            const groups = [];

            ProJED.state.lists.forEach(l => {
                const listStartRow = rowIdx;
                let listDisplayed = false;

                // 預先計算列表的條狀圖範圍 (為了背景對齊)
                let lEnd = l.endDate || dayjs().add(10, 'day').format('YYYY-MM-DD');
                let lStart = l.startDate || dayjs(lEnd).subtract(3, 'day').format('YYYY-MM-DD');
                const listX1 = this.getX(lStart, colWidth);
                const listX2 = this.getX(lEnd, colWidth);

                const status = l.status || 'todo';
                if (ProJED.state.ganttFilters.list && l.ganttVisible !== false && ProJED.state.statusFilters[status]) {
                    items.push({ ...l, type: 'list', row: rowIdx++, status });
                    listDisplayed = true;
                }

                if (ProJED.state.ganttFilters.card) {
                    (l.cards || []).forEach(c => {
                        const cStatus = c.status || 'todo';
                        if (c.ganttVisible !== false && ProJED.state.statusFilters[cStatus]) {
                            const cardStartRow = rowIdx;
                            // 預先計算卡片的條狀圖範圍
                            let cEnd = c.endDate || dayjs().add(10, 'day').format('YYYY-MM-DD');
                            let cStart = c.startDate || dayjs(cEnd).subtract(3, 'day').format('YYYY-MM-DD');
                            const cardX1 = this.getX(cStart, colWidth);
                            const cardX2 = this.getX(cEnd, colWidth);

                            items.push({ ...c, type: 'card', row: rowIdx++, listId: l.id, status: cStatus });
                            listDisplayed = true;

                            let checklistCount = 0;
                            if (ProJED.state.ganttFilters.checklist) {
                                (c.checklistContainers || []).forEach(cc => {
                                    (cc.items || []).forEach(cl => {
                                        const clStatus = cl.status || 'todo';
                                        if (cl.ganttVisible !== false && ProJED.state.statusFilters[clStatus]) {
                                            items.push({ ...cl, type: 'checklist', row: rowIdx++, listId: l.id, cardId: c.id, containerId: cc.id, status: clStatus });
                                            checklistCount++;
                                        }
                                    });
                                });
                            }
                            // 如果卡片有子項，背景塊對齊卡片條狀圖
                            if (checklistCount > 0) {
                                groups.push({
                                    type: 'card',
                                    start: cardStartRow,
                                    count: rowIdx - cardStartRow,
                                    left: cardX1,
                                    width: Math.max(cardX2 - cardX1, 20)
                                });
                            }
                        }
                    });
                }

                // 如果列表有顯示內容且未被完全隱藏，背景塊對齊列表條狀圖
                if (listDisplayed && rowIdx > listStartRow) {
                    groups.push({
                        type: 'list',
                        start: listStartRow,
                        count: rowIdx - listStartRow,
                        left: listX1,
                        width: Math.max(listX2 - listX1, 20)
                    });
                }
            });

            gridLayer.style.height = `${rowIdx * ProJED.BAR_HEIGHT + 100}px`;

            // 新增：繪製依存連線層 (SVG)
            const depSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            depSvg.setAttribute("class", "gantt-dep-svg");
            depSvg.style.width = gridLayer.style.width;
            depSvg.style.height = gridLayer.style.height;

            // 定義箭頭
            const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
            defs.innerHTML = `
                <marker id="dep-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" />
                </marker>
            `;
            depSvg.appendChild(defs);
            gridLayer.appendChild(depSvg);

            // 建立坐標查找表
            const itemCoords = new Map();
            items.forEach(item => {
                const isMilestone = !item.startDate && item.endDate;
                const end = item.endDate || dayjs().add(10, 'day').format('YYYY-MM-DD');
                let start = item.startDate;
                if (!start) start = isMilestone ? end : dayjs(end).subtract(3, 'day').format('YYYY-MM-DD');

                itemCoords.set(item.id, {
                    row: item.row,
                    startX: this.getX(start, colWidth),
                    endX: this.getX(end, colWidth),
                    isMilestone: isMilestone
                });
            });

            // 繪製連線
            items.forEach(item => {
                const drawDep = (dep, isStartDep) => {
                    if (!dep || !dep.targetId || dep.targetId === item.id) return;
                    const target = itemCoords.get(dep.targetId);
                    const current = itemCoords.get(item.id);
                    if (!target || !current) return;

                    const tx = (target.isMilestone && dep.type === 'end') ? (target.endX - 7) : (dep.type === 'start' ? target.startX : target.endX);
                    const ty = target.row * ProJED.BAR_HEIGHT + ProJED.BAR_HEIGHT / 2;
                    const cx = (current.isMilestone && !isStartDep) ? (current.endX - 7) : (isStartDep ? current.startX : current.endX);
                    const cy = current.row * ProJED.BAR_HEIGHT + ProJED.BAR_HEIGHT / 2;

                    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                    path.setAttribute("class", "gantt-dep-path");
                    path.setAttribute("marker-end", "url(#dep-arrow)");

                    // 繪製折線路徑 (Orthogonal Path)
                    const midX = tx + (cx - tx) / 2;
                    // 如果水平距離太短，則給一點弧度或直接連線
                    if (Math.abs(cx - tx) < 20) {
                        path.setAttribute("d", `M ${tx} ${ty} L ${cx} ${cy}`);
                    } else {
                        path.setAttribute("d", `M ${tx} ${ty} L ${midX} ${ty} L ${midX} ${cy} L ${cx} ${cy}`);
                    }
                    depSvg.appendChild(path);
                };

                drawDep(item.startDependency, true);
                drawDep(item.endDependency, false);
            });

            // 繪製背景塊
            groups.forEach(g => {
                const bg = document.createElement('div');
                bg.className = g.type === 'list' ? 'gantt-list-group-bg' : 'gantt-card-group-bg';
                bg.style.top = `${g.start * ProJED.BAR_HEIGHT + 2}px`; // 稍微微調頂部
                bg.style.height = `${g.count * ProJED.BAR_HEIGHT - 4}px`;
                bg.style.left = `${g.left}px`;
                bg.style.width = `${g.width}px`;
                gridLayer.appendChild(bg);
            });

            // 再繪製任務條
            items.forEach(item => {
                const bar = this.createTaskBar(item, colWidth);
                gridLayer.appendChild(bar);
            });

            this.drawNowLine(header, gridLayer, colWidth);
            scrollArea.addEventListener('scroll', () => this.syncFluidLabels(scrollArea));

            if (!ProJED.state.ganttInitialized) {
                setTimeout(() => {
                    const todayX = this.getX(dayjs(), colWidth);
                    scrollArea.scrollLeft = Math.max(0, todayX - (scrollArea.clientWidth / 2));
                    this.syncFluidLabels(scrollArea);
                    ProJED.state.ganttInitialized = true;
                }, 50);
            } else {
                // 恢復先前的捲軸位置，避免編輯後畫面跳轉
                scrollArea.scrollLeft = oldScrollLeft;
                this.syncFluidLabels(scrollArea);
            }
        },

        getX(date, colWidth) {
            if (!date) return 0;
            const d = dayjs(date);
            if (!d.isValid()) return 0;
            const mode = ProJED.state.ganttMode || 'Month';
            const mDiff = d.diff(ProJED.GRID_START, 'month', true);
            if (isNaN(mDiff)) return 0;
            if (mode === 'Quarter') return (mDiff / 3) * colWidth;
            if (mode === 'Year') return (mDiff / 12) * colWidth;
            return mDiff * colWidth;
        },

        createHeader(colWidth) {
            const mode = ProJED.state.ganttMode || 'Month';
            const wrap = document.createElement('div');
            wrap.className = 'gantt-header-sticky';
            wrap.style.cssText = `position:sticky; top:0; z-index:100; background:#fff; height:75px; border-bottom:1px solid #e2e8f0; display:flex; flex-direction:column; min-width:max-content;`;

            const yearRow = document.createElement('div');
            yearRow.style.cssText = `display:flex; height:35px; border-bottom:1px solid #f1f5f9; background: #f8fafc;`;

            const unitRow = document.createElement('div');
            unitRow.style.cssText = `display:flex; height:40px;`;

            if (mode === 'Month') {
                let currentYear = -1;
                for (let i = 0; i < 60; i++) {
                    const curr = ProJED.GRID_START.add(i, 'month');
                    if (curr.year() !== currentYear) {
                        currentYear = curr.year();
                        const yearBox = document.createElement('div');
                        yearBox.style.cssText = `display:flex; align-items:center; justify-content:center; font-weight:700; color:#1e293b; font-size:13px; border-right:2px solid #e2e8f0; flex-shrink:0;`;
                        const monthsInYear = Math.min(12 - curr.month(), 60 - i);
                        yearBox.style.width = `${monthsInYear * colWidth}px`;
                        yearBox.innerHTML = `<span>${currentYear} 年</span>`;
                        yearRow.appendChild(yearBox);
                    }
                    const mBox = document.createElement('div');
                    mBox.style.cssText = `min-width:${colWidth}px; width:${colWidth}px; height:40px; border-right:1px solid #f1f5f9; display:flex; align-items:center; justify-content:center; color:#64748b; font-size:12px; font-weight:500; flex-shrink:0;`;
                    mBox.innerHTML = `${curr.month() + 1}月`;
                    unitRow.appendChild(mBox);
                }
            } else if (mode === 'Quarter') {
                let currentYear = -1;
                for (let i = 0; i < 24; i++) {
                    const curr = ProJED.GRID_START.add(i * 3, 'month');
                    if (curr.year() !== currentYear) {
                        currentYear = curr.year();
                        const yearBox = document.createElement('div');
                        yearBox.style.cssText = `display:flex; align-items:center; justify-content:center; font-weight:700; color:#1e293b; font-size:13px; border-right:2px solid #e2e8f0; flex-shrink:0;`;
                        const qRemaining = 24 - i;
                        const currMonth = curr.month(); // 0, 3, 6, 9
                        const qInCurrYear = Math.min(4 - Math.floor(currMonth / 3), qRemaining);
                        yearBox.style.width = `${qInCurrYear * colWidth}px`;
                        yearBox.innerHTML = `<span>${currentYear} 年</span>`;
                        yearRow.appendChild(yearBox);
                    }
                    const qBox = document.createElement('div');
                    qBox.style.cssText = `min-width:${colWidth}px; width:${colWidth}px; height:40px; border-right:1px solid #f1f5f9; display:flex; align-items:center; justify-content:center; color:#64748b; font-size:12px; font-weight:500; flex-shrink:0;`;
                    const q = Math.floor(curr.month() / 3) + 1;
                    qBox.innerHTML = `第 ${q} 季`;
                    unitRow.appendChild(qBox);
                }
            } else if (mode === 'Year') {
                yearRow.style.display = 'none';
                wrap.style.height = '40px';
                for (let i = 0; i < 10; i++) {
                    const curr = ProJED.GRID_START.add(i, 'year');
                    const yBox = document.createElement('div');
                    yBox.style.cssText = `min-width:${colWidth}px; width:${colWidth}px; height:40px; border-right:1px solid #f1f5f9; display:flex; align-items:center; justify-content:center; color:#64748b; font-size:12px; font-weight:500; flex-shrink:0;`;
                    yBox.innerHTML = `${curr.year()} 年`;
                    unitRow.appendChild(yBox);
                }
            }
            wrap.appendChild(yearRow);
            wrap.appendChild(unitRow);
            return wrap;
        },

        createTaskBar(item, colWidth) {
            const isMilestone = !item.startDate && item.endDate;
            let start = item.startDate;
            const end = item.endDate || dayjs().add(10, 'day').format('YYYY-MM-DD');
            if (!start) start = isMilestone ? end : dayjs(end).subtract(3, 'day').format('YYYY-MM-DD');

            const startX = this.getX(start, colWidth);
            const endX = this.getX(end, colWidth);
            const width = isMilestone ? 14 : Math.max(endX - startX, 20);

            // 校正：確保進度條的結束位置對齊 endX，解決短任務被強制最小寬度後超出截止日期的問題
            const barLeft = endX - width;

            const bar = document.createElement('div');
            const status = item.status || 'todo';
            const title = item.title || item.name || '項目';
            const displayStatus = (title.includes('答辯') && status === 'todo') ? 'unsure' : status;

            bar.className = `gantt-task-bar selection-candidate status-${displayStatus} ${item.type === 'list' ? 'is-list' : ''} ${item.type === 'checklist' ? 'is-checklist' : ''} ${isMilestone ? 'is-milestone' : ''}`;
            bar.dataset.id = item.id; // Ensure ID is present for selection
            bar.dataset.type = item.type;
            bar.dataset.left = barLeft;
            bar.dataset.width = width;
            bar.style.left = `${barLeft}px`;

            let barH = 30;
            if (item.type === 'list') barH = 36;
            if (item.type === 'checklist') barH = 24;

            bar.style.top = `${item.row * ProJED.BAR_HEIGHT + (ProJED.BAR_HEIGHT - barH) / 2}px`;
            bar.style.width = `${width}px`;
            bar.style.height = `${barH}px`;
            bar.style.overflow = 'hidden';

            const text = (item.type === 'list' ? '📁 ' : '') + title;
            const estimatedTextWidth = text.length * 14 + 30;

            const closeBtnHtml = `<div class="gantt-close-btn" title="從甘特圖中隱藏" onclick="event.stopPropagation(); app.toggleGanttVisibility('${item.type}', '${item.id}', '${item.listId || ''}', '${item.cardId || ''}')">×</div>`;

            if (width > estimatedTextWidth) {
                bar.classList.add('has-fluid-label');
                bar.innerHTML = `${closeBtnHtml}
                    <div class="handle handle-left"></div>
                    <div class="fluid-label" style="position: absolute; left: 50%; transform: translateX(-50%); color: #ffffff !important; white-space: nowrap; font-weight: 600; pointer-events: none; text-shadow: 0 1px 2px rgba(0,0,0,0.2);">${text}</div>
                    <div class="handle handle-right"></div>`;
            } else {
                const textColor = ProJED.UI.getStatusColor(displayStatus);
                bar.innerHTML = `${closeBtnHtml}
                    <div class="handle handle-left"></div>
                    <div style="position:absolute; left:100%; margin-left:8px; color:${textColor}; white-space:nowrap; font-weight:600; font-size:13px; pointer-events:none;">${text}</div>
                    <div class="handle handle-right"></div>`;
                bar.style.overflow = 'visible';
            }

            bar.onmousedown = (e) => {
                if (e.target.classList.contains('gantt-close-btn')) return;
                this.initDrag(e, bar, item, colWidth);
            };

            bar.onclick = (e) => {
                if (this.dragged) { this.dragged = false; return; }
                e.stopPropagation();
                ProJED.Modal.open(item.type, item.id, item.type === 'card' ? item.listId : (item.type === 'checklist' ? item.listId : null), item.type === 'checklist' ? item.cardId : null);
            };
            return bar;
        },

        initDrag(e, bar, item, colWidth) {
            e.preventDefault();
            e.stopPropagation();
            const container = document.querySelector('.gantt-grid-layer');
            const startX = e.pageX;
            const initialLeft = parseFloat(bar.style.left);
            const initialWidth = parseFloat(bar.style.width);
            const isResizeLeft = e.target.classList.contains('handle-left');
            const isResizeRight = e.target.classList.contains('handle-right');
            const isMove = !isResizeLeft && !isResizeRight;

            this.dragged = false;
            let currentLeft = initialLeft;
            let currentWidth = initialWidth;
            let hasStartedDragging = false;
            const DRAG_THRESHOLD = 4; // 只有移動過 4 像素才算拖拽

            // 獲取所有其他進度條的對位點 (起始與結束)
            const snapPoints = [];
            container.querySelectorAll('.gantt-task-bar').forEach(other => {
                if (other === bar || other.dataset.row === bar.dataset.row) return; // 略過同一行
                const left = parseFloat(other.style.left);
                const right = left + parseFloat(other.style.width);
                snapPoints.push(left, right);
            });

            const guide = document.createElement('div');
            guide.className = 'snap-guide';
            guide.style.display = 'none';
            container.appendChild(guide);

            const onMouseMove = (moveE) => {
                const deltaX = moveE.pageX - startX;

                if (!hasStartedDragging) {
                    if (Math.abs(deltaX) > DRAG_THRESHOLD) {
                        hasStartedDragging = true;
                        this.dragged = true;
                    } else {
                        return;
                    }
                }

                bar.classList.add('is-dragging');

                let targetX = 0;
                if (isResizeLeft) {
                    targetX = initialLeft + deltaX;
                    currentWidth = initialWidth - deltaX;
                    if (currentWidth < 20) {
                        currentWidth = 20;
                        targetX = initialLeft + initialWidth - 20;
                    }
                    currentLeft = targetX;
                } else if (isResizeRight) {
                    currentLeft = initialLeft;
                    currentWidth = initialWidth + deltaX;
                    targetX = currentLeft + currentWidth;
                    if (currentWidth < 20) currentWidth = 20;
                } else {
                    currentLeft = initialLeft + deltaX;
                    targetX = currentLeft; // 對位點通常看左端
                }

                // 輕微磁吸功能 (Snap)
                const SNAP_THRESHOLD = 10;
                let snapped = false;
                for (let sp of snapPoints) {
                    if (Math.abs(targetX - sp) < SNAP_THRESHOLD) {
                        const snapDelta = sp - targetX;
                        if (isResizeLeft) {
                            currentLeft = targetX + snapDelta;
                            currentWidth -= snapDelta;
                        } else if (isResizeRight) {
                            currentWidth += snapDelta;
                        } else {
                            currentLeft += snapDelta;
                        }
                        guide.style.left = `${sp}px`;
                        guide.style.display = 'block';
                        snapped = true;
                        break;
                    }
                }
                if (!snapped) guide.style.display = 'none';

                // 應用 1/4 格磁吸 (Grid Snap)
                const gridStep = colWidth / 4;
                currentLeft = Math.round(currentLeft / gridStep) * gridStep;
                currentWidth = Math.max(Math.round(currentWidth / gridStep) * gridStep, gridStep); // 最小寬度為 1/4 格

                bar.style.left = `${currentLeft}px`;
                bar.style.width = `${currentWidth}px`;
            };

            const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                bar.classList.remove('is-dragging');
                guide.remove();

                if (hasStartedDragging) {
                    const newStart = this.getDateFromX(currentLeft, colWidth);
                    const newEnd = this.getDateFromX(currentLeft + currentWidth, colWidth);

                    const targetItem = ProJED.Data.findItem(item.type, item.id, item.listId, item.cardId);
                    if (targetItem) {
                        targetItem.startDate = newStart;
                        targetItem.endDate = newEnd;
                        ProJED.Data.save();
                        ProJED.UI.showToast(`已調整時間: ${newStart} ~ ${newEnd}`);
                    }
                    setTimeout(() => { this.dragged = false; }, 80);
                } else {
                    this.dragged = false;
                }
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        },

        syncFluidLabels(scrollArea) {
            const sLeft = scrollArea.scrollLeft, sWidth = scrollArea.clientWidth, sRight = sLeft + sWidth;
            scrollArea.querySelectorAll('.has-fluid-label').forEach(bar => {
                const barLeft = parseFloat(bar.dataset.left), barWidth = parseFloat(bar.dataset.width), barRight = barLeft + barWidth, label = bar.querySelector('.fluid-label');
                if (!label) return;
                const visibleStart = Math.max(barLeft, sLeft), visibleEnd = Math.min(barRight, sRight), visibleWidth = visibleEnd - visibleStart;
                if (visibleWidth > 40) {
                    label.style.left = `${((visibleStart + visibleEnd) / 2) - barLeft}px`;
                } else {
                    label.style.left = `50%`;
                }
            });
        },

        drawNowLine(header, gridLayer, colWidth) {
            const x = this.getX(dayjs(), colWidth);
            const line = document.createElement('div');
            line.className = 'gantt-now-marker'; line.style.left = `${x}px`;
            gridLayer.appendChild(line);
            const bubble = document.createElement('div');
            bubble.style.cssText = `position:absolute; top:-25px; left:${x}px; transform:translateX(-50%); background:#ef4444; color:#fff; padding:2px 8px; border-radius:12px; font-size:10px; font-weight:bold; z-index:200; white-space:nowrap; pointer-events:none; box-shadow: 0 2px 5px rgba(0,0,0,0.2);`;
            bubble.innerHTML = dayjs().format('MM/DD');
            header.appendChild(bubble);
        }
    },

    Modal: {
        saved: false,
        open(type, itemId, listId = null, cardId = null) {
            this.refresh(type, itemId, listId, cardId);
            document.getElementById('modal-overlay').style.display = 'flex';
        },
        hideForSelection() {
            document.getElementById('modal-overlay').style.display = 'none';
            // Add a cancel button banner
            let banner = document.getElementById('selection-banner');
            if (!banner) {
                banner = document.createElement('div');
                banner.id = 'selection-banner';
                banner.className = 'selection-mode-banner';
                banner.innerHTML = `<span><i data-lucide="mouse-pointer-2"></i> 選擇模式：請點選目標</span><button id="selection-cancel-btn" class="action-btn-outline" style="border:1px solid #fff; color:#fff; margin-left:10px;">取消 (ESC)</button>`;
                document.body.appendChild(banner);
                if (window.lucide) lucide.createIcons();
            }
            banner.style.display = 'flex';
        },
        showFromSelection() {
            document.getElementById('modal-overlay').style.display = 'flex';
            const banner = document.getElementById('selection-banner');
            if (banner) banner.style.display = 'none';
        },
        refresh(type, itemId, listId = null, cardId = null) {
            let item = null;
            if (type === 'list') {
                item = ProJED.state.lists.find(l => l.id === itemId);
            } else if (type === 'card') {
                item = ProJED.state.lists.find(l => l.id === listId)?.cards.find(c => c.id === itemId);
                cardId = itemId;
            } else if (type === 'checklist') {
                const card = ProJED.state.lists.find(l => l.id === listId)?.cards.find(c => c.id === cardId);
                for (const cc of (card?.checklistContainers || [])) {
                    item = cc.items.find(cl => cl.id === itemId);
                    if (item) break;
                }
            }

            if (!item) return;

            // 即時補強測試：如果開啟卡片時發現有舊待辦但沒新容器，現場遷移
            if (type === 'card' && Array.isArray(item.checklists) && item.checklists.length > 0) {
                if (!Array.isArray(item.checklistContainers) || item.checklistContainers.length === 0) {
                    console.log("🛠️ [Modal.refresh] 偵測到未遷移項目，執行即時修復...");
                    item.checklistContainers = [{
                        id: 'cc_hotfix_' + Date.now(),
                        title: '待辦清單',
                        items: [...item.checklists]
                    }];
                    delete item.checklists;
                    ProJED.Data.save(false); // 靜默存檔不進歷史
                }
            }

            if (!item) return;
            // 儲存資訊，但不依賴傳入的 item 引用，因為它可能隨後被覆寫
            ProJED.state.editingItem = { type, itemId, listId, cardId };

            document.getElementById('modal-title').textContent = type === 'list' ? '列表詳情' : (type === 'card' ? '卡片詳情' : '待辦項目詳情');
            document.getElementById('item-title').value = item.title || item.name || '';

            // 確保日期格式符合展示要求 (YYYY/MM/DD)
            // 填充日期至分離式輸入框
            const populateDate = (wrapperId, dateStr) => {
                const wrapper = document.getElementById(wrapperId);
                if (!wrapper) return;
                const d = (dateStr && dayjs(dateStr).isValid()) ? dayjs(dateStr) : null;

                wrapper.querySelector('.year').value = d ? d.format('YYYY') : '';
                wrapper.querySelector('.month').value = d ? d.format('MM') : '';
                wrapper.querySelector('.day').value = d ? d.format('DD') : '';
            };

            populateDate('start-date-wrapper', item.startDate);
            populateDate('end-date-wrapper', item.endDate);

            document.getElementById('item-status').value = item.status || 'todo';
            document.querySelectorAll('.status-option').forEach(opt => opt.classList.toggle('selected', opt.dataset.value === (item.status || 'todo')));

            // Load Notes
            document.getElementById('item-notes').value = item.notes || '';

            // Set Checkbox State
            const cb = document.getElementById('show-cl-completed');
            if (cb) cb.checked = ProJED.state.showCompletedCL;

            const clSection = document.getElementById('checklist-manager-section');
            const notesSection = document.getElementById('card-notes-section');
            if (type === 'card') {
                clSection.style.display = 'block';
                if (notesSection) notesSection.style.display = 'block';
                this.renderChecklistContainers(item.checklistContainers || []);
            } else {
                clSection.style.display = 'none';
                if (notesSection) notesSection.style.display = 'none';
            }

            // --- 填充依存設定 ---
            const selectableItems = ProJED.Data.getAllSelectableItems(itemId);
            const populateDepSelect = (selectId, currentVal) => {
                const select = document.getElementById(selectId);
                if (!select) return;
                select.innerHTML = '<option value="">(無依存)</option>';
                selectableItems.forEach(si => {
                    const opt = document.createElement('option');
                    opt.value = si.id;
                    opt.textContent = si.title;
                    if (si.id === currentVal) opt.selected = true;
                    select.appendChild(opt);
                });
            };

            populateDepSelect('start-dep-target', item.startDependency?.targetId);
            populateDepSelect('end-dep-target', item.endDependency?.targetId);

            document.getElementById('start-dep-type').value = item.startDependency?.type || 'start';
            document.getElementById('start-dep-offset').value = item.startDependency?.offset || 0;
            document.getElementById('end-dep-type').value = item.endDependency?.type || 'start';
            document.getElementById('end-dep-offset').value = item.endDependency?.offset || 0;

            // 根據是否有依存來切換 UI 顯示
            const startDepUI = document.getElementById('start-dep-ui');
            const endDepUI = document.getElementById('end-dep-ui');
            const startToggle = document.querySelector('.dep-toggle-btn[onclick*="start"]');
            const endToggle = document.querySelector('.dep-toggle-btn[onclick*="end"]');

            if (item.startDependency?.targetId) {
                if (startDepUI) startDepUI.style.display = 'block';
                if (startToggle) startToggle.classList.add('active');
            } else {
                if (startDepUI) startDepUI.style.display = 'none';
                if (startToggle) startToggle.classList.remove('active');
            }

            if (item.endDependency?.targetId) {
                if (endDepUI) endDepUI.style.display = 'block';
                if (endToggle) endToggle.classList.add('active');
            } else {
                if (endDepUI) endDepUI.style.display = 'none';
                if (endToggle) endToggle.classList.remove('active');
            }
        },
        renderChecklistContainers(containers = []) {
            const wrapper = document.getElementById('checklist-containers-wrapper');
            if (!wrapper) return;
            wrapper.innerHTML = '';

            const { listId, cardId } = ProJED.state.editingItem;

            containers.forEach((container, cIdx) => {
                const containerEl = document.createElement('div');
                containerEl.className = 'checklist-container';
                containerEl.style.marginBottom = '2rem';
                containerEl.innerHTML = `
                    <div class="checklist-container-header" style="display:flex; align-items:center; gap:8px; margin-bottom:12px; background: var(--bg-secondary); padding: 8px; border-radius: 8px;">
                        <i data-lucide="list" style="width:18px; height:18px; color:var(--text-muted);"></i>
                        <input type="text" class="cl-container-title-input" value="${container.title || '待辦清單'}" 
                            style="background:transparent; border:none; font-size:16px; font-weight:600; color:var(--text); flex:1; padding:4px;"
                            onchange="app.updateChecklistContainer(${cIdx}, 'title', this.value)">
                        <button class="action-btn-outline" style="padding:4px; border:none;" onclick="app.removeChecklistContainerUI(${cIdx})" title="刪除此清單">
                            <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
                        </button>
                    </div>
                    <div class="checklist-items-container" id="cl-items-${container.id}">
                        <!-- Items will be rendered here -->
                    </div>
                    <button class="add-cl-item-btn" onclick="app.addChecklistItemUI(${cIdx})" 
                        style="margin-left: 12px; margin-top: 8px; background: transparent; border: 1px dashed var(--border); color: var(--text-muted); padding: 6px 16px; border-radius: 6px; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                        <i data-lucide="plus" style="width:14px; height:14px;"></i>
                        新增項目
                    </button>
                `;
                wrapper.appendChild(containerEl);
                this.renderChecklistItems(container.items || [], container.id, cIdx);
            });
            if (window.lucide) lucide.createIcons();
        },
        renderChecklistItems(items, containerId, cIdx) {
            const containerEl = document.getElementById(`cl-items-${containerId}`);
            if (!containerEl) return;
            containerEl.innerHTML = '';

            const { listId, cardId } = ProJED.state.editingItem;
            const openMenuIndex = ProJED.state.activeChecklistIndex;
            const openStartIdx = ProJED.state.activeChecklistStartDepIdx;
            const openEndIdx = ProJED.state.activeChecklistEndDepIdx;
            const activeGroupId = ProJED.state.activeChecklistGroupId;

            items.forEach((cl, index) => {
                const isCompleted = cl.status === 'completed';
                if (!ProJED.state.showCompletedCL && isCompleted) return;

                let dateBadgeHtml = '';
                let isOverdue = false;
                let displayStatus = cl.status || 'todo';

                if (cl.endDate) {
                    const end = dayjs(cl.endDate);
                    if (end.isValid()) {
                        const today = dayjs().startOf('day');
                        if (end.isBefore(today) && displayStatus !== 'completed') {
                            isOverdue = true;
                            displayStatus = 'delayed';
                        }
                        const dateText = end.format('YYYY/MM/DD');
                        dateBadgeHtml = `
                            <div class="cl-date-badge ${isOverdue ? 'overdue' : ''}">
                                <i data-lucide="clock" style="width:14px; height:14px;"></i>
                                <span>${dateText}</span>
                            </div>
                        `;
                    }
                }

                const itemRow = document.createElement('div');
                itemRow.className = `checklist-item-row ${isCompleted ? 'is-completed' : ''}`;
                itemRow.dataset.id = cl.id;

                const finalDisplayStatus = ((cl.title || cl.name || '').includes('答辯') && displayStatus === 'todo') ? 'unsure' : displayStatus;
                const isHidden = cl.ganttVisible === false;
                const isMenuOpen = (index === openMenuIndex && containerId === activeGroupId);
                const startDepVisible = (cl.startDependency?.targetId || (index === openStartIdx && containerId === activeGroupId));
                const endDepVisible = (cl.endDependency?.targetId || (index === openEndIdx && containerId === activeGroupId));

                itemRow.innerHTML = `
                    <div class="cl-checkbox ${displayStatus === 'completed' ? 'checked' : ''}" onclick="app.toggleChecklistItemDone(${cIdx}, ${index})">
                        ${displayStatus === 'completed' ? '<i data-lucide="check" style="width:14px; height:14px;"></i>' : ''}
                    </div>
                    <div class="cl-main-row" style="display:flex; align-items:center; gap:8px; flex:1;">
                        <input type="text" class="cl-title-input status-${finalDisplayStatus}" value="${cl.title || cl.name || ''}" placeholder="待辦名稱" onchange="app.updateChecklistItem(${cIdx}, ${index}, 'title', this.value)">
                        ${dateBadgeHtml}
                        <div style="position:relative">
                            <button class="cl-more-btn" onclick="app.toggleChecklistMenu(this, ${cIdx}, ${index}, '${containerId}')">
                                <i data-lucide="more-horizontal" style="width:16px; height:16px;"></i>
                            </button>
                            <div class="cl-item-popover ${isMenuOpen ? 'active' : ''}">
                                <div class="popover-section">
                                    <label>狀態</label>
                                    <div class="cl-status-picker">
                                        <div class="cl-status-dot todo ${displayStatus === 'todo' ? 'selected' : ''}" title="進行中" onclick="app.updateChecklistItem(${cIdx}, ${index}, 'status', 'todo')"></div>
                                        <div class="cl-status-dot delayed ${displayStatus === 'delayed' ? 'selected' : ''}" title="延遲" onclick="app.updateChecklistItem(${cIdx}, ${index}, 'status', 'delayed')"></div>
                                        <div class="cl-status-dot completed ${displayStatus === 'completed' ? 'selected' : ''}" title="完成" onclick="app.updateChecklistItem(${cIdx}, ${index}, 'status', 'completed')"></div>
                                        <div class="cl-status-dot unsure ${displayStatus === 'unsure' ? 'selected' : ''}" title="不確定" onclick="app.updateChecklistItem(${cIdx}, ${index}, 'status', 'unsure')"></div>
                                        <div class="cl-status-dot onhold ${displayStatus === 'onhold' ? 'selected' : ''}" title="暫緩" onclick="app.updateChecklistItem(${cIdx}, ${index}, 'status', 'onhold')"></div>
                                    </div>
                                </div>
                                <div class="popover-section">
                                    <label>時間範圍</label>
                                    <div class="cl-dates">
                                        <div class="cl-date-field">
                                            <div style="font-size:11px; color:#64748b; margin-bottom:4px;">起始日</div>
                                            <div class="date-input-with-dep">
                                                ${(() => {
                        const d = (cl.startDate && dayjs(cl.startDate).isValid()) ? dayjs(cl.startDate) : null;
                        return `
                                                        <div class="split-date-input" data-cl-cidx="${cIdx}" data-cl-idx="${index}" data-cl-target="start" style="flex:1;">
                                                            <input type="text" class="date-part year" placeholder="YYYY" maxlength="4" value="${d ? d.format('YYYY') : ''}">
                                                            <span class="sep">/</span>
                                                            <input type="text" class="date-part month" placeholder="MM" maxlength="2" value="${d ? d.format('MM') : ''}">
                                                            <span class="sep">/</span>
                                                            <input type="text" class="date-part day" placeholder="DD" maxlength="2" value="${d ? d.format('DD') : ''}">
                                                        </div>
                                                    `;
                    })()}
                                                <button type="button" class="dep-toggle-btn ${startDepVisible ? 'active' : ''}" 
                                                        onclick="app.toggleChecklistDepUI('start', ${cIdx}, ${index}, event)" 
                                                        title="設定時間依存">
                                                    <i data-lucide="link" style="width:14px; height:14px;"></i>
                                                </button>
                                            </div>
                                            <div class="dependency-settings" style="display: ${startDepVisible ? 'block' : 'none'}; margin-top:8px;">
                                                <div style="margin-bottom:6px;">
                                                    <select style="width:100%; font-size:12px; height:30px; border-radius:6px; border:1px solid #e2e8f0;" onchange="app.updateChecklistItemDep(${cIdx}, ${index}, 'start', 'targetId', this.value)">
                                                        <option value="">(無)</option>
                                                        ${ProJED.Data.getAllSelectableItems(cl.id).map(si => `<option value="${si.id}" ${si.id === cl.startDependency?.targetId ? 'selected' : ''}>${si.title}</option>`).join('')}
                                                    </select>
                                                </div>
                                                <div style="display:flex; align-items:center; gap:6px;">
                                                    <button type="button" class="action-btn-outline" 
                                                            style="padding:0; width:30px; height:30px; display:flex; align-items:center; justify-content:center; flex-shrink:0;"
                                                            onclick="app.startPickingForChecklist(${cIdx}, ${index}, 'start')" title="從看板中選取">
                                                        <i data-lucide="mouse-pointer-2" style="width:12px; height:12px;"></i>
                                                    </button>
                                                    <select style="font-size:11px; height:30px; border-radius:6px; border:1px solid #e2e8f0; flex:1; min-width:0;" onchange="app.updateChecklistItemDep(${cIdx}, ${index}, 'start', 'type', this.value)">
                                                        <option value="start" ${cl.startDependency?.type === 'start' ? 'selected' : ''}>起始</option>
                                                        <option value="end" ${cl.startDependency?.type === 'end' ? 'selected' : ''}>結束</option>
                                                    </select>
                                                    <input type="number" style="width:45px; font-size:11px; height:30px; border-radius:6px; border:1px solid #e2e8f0; text-align:center;" value="${cl.startDependency?.offset || 0}" onchange="app.updateChecklistItemDep(${cIdx}, ${index}, 'start', 'offset', parseInt(this.value))">
                                                    <span style="font-size:11px; color:#64748b;">天</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="cl-date-field">
                                            <div style="font-size:11px; color:#64748b; margin-bottom:4px;">到期日</div>
                                            <div class="date-input-with-dep">
                                                ${(() => {
                        const d = (cl.endDate && dayjs(cl.endDate).isValid()) ? dayjs(cl.endDate) : null;
                        return `
                                                        <div class="split-date-input" data-cl-cidx="${cIdx}" data-cl-idx="${index}" data-cl-target="end" style="flex:1;">
                                                            <input type="text" class="date-part year" placeholder="YYYY" maxlength="4" value="${d ? d.format('YYYY') : ''}">
                                                            <span class="sep">/</span>
                                                            <input type="text" class="date-part month" placeholder="MM" maxlength="2" value="${d ? d.format('MM') : ''}">
                                                            <span class="sep">/</span>
                                                            <input type="text" class="date-part day" placeholder="DD" maxlength="2" value="${d ? d.format('DD') : ''}">
                                                        </div>
                                                    `;
                    })()}
                                                <button type="button" class="dep-toggle-btn ${endDepVisible ? 'active' : ''}" 
                                                        onclick="app.toggleChecklistDepUI('end', ${cIdx}, ${index}, event)" 
                                                        title="設定時間依存">
                                                    <i data-lucide="link" style="width:14px; height:14px;"></i>
                                                </button>
                                            </div>
                                            <div class="dependency-settings" style="display: ${endDepVisible ? 'block' : 'none'}; margin-top:8px;">
                                                <div style="margin-bottom:6px;">
                                                    <select style="width:100%; font-size:12px; height:30px; border-radius:6px; border:1px solid #e2e8f0;" onchange="app.updateChecklistItemDep(${cIdx}, ${index}, 'end', 'targetId', this.value)">
                                                        <option value="">(無)</option>
                                                        ${ProJED.Data.getAllSelectableItems(cl.id).map(si => `<option value="${si.id}" ${si.id === cl.startDependency?.targetId ? 'selected' : ''}>${si.title}</option>`).join('')}
                                                    </select>
                                                </div>
                                                <div style="display:flex; align-items:center; gap:6px;">
                                                    <button type="button" class="action-btn-outline" 
                                                            style="padding:0; width:30px; height:30px; display:flex; align-items:center; justify-content:center; flex-shrink:0;"
                                                            onclick="app.startPickingForChecklist(${cIdx}, ${index}, 'end')" title="從看板中選取">
                                                        <i data-lucide="mouse-pointer-2" style="width:12px; height:12px;"></i>
                                                    </button>
                                                    <select style="font-size:11px; height:30px; border-radius:6px; border:1px solid #e2e8f0; flex:1; min-width:0;" onchange="app.updateChecklistItemDep(${cIdx}, ${index}, 'end', 'type', this.value)">
                                                        <option value="start" ${cl.endDependency?.type === 'start' ? 'selected' : ''}>起始</option>
                                                        <option value="end" ${cl.endDependency?.type === 'end' ? 'selected' : ''}>結束</option>
                                                    </select>
                                                    <input type="number" style="width:45px; font-size:11px; height:30px; border-radius:6px; border:1px solid #e2e8f0; text-align:center;" value="${cl.endDependency?.offset || 0}" onchange="app.updateChecklistItemDep(${cIdx}, ${index}, 'end', 'offset', parseInt(this.value))">
                                                    <span style="font-size:11px; color:#64748b;">天</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="popover-section">
                                     <button class="action-btn-outline" 
                                              style="width:100%; justify-content:center; margin-bottom:8px;"
                                              onclick="app.toggleGanttVisibility('checklist', '${cl.id}', '${listId}', '${cardId}')">
                                          <i data-lucide="${isHidden ? 'eye-off' : 'eye'}"></i>
                                          <span>${isHidden ? '在庫存中顯示' : '在庫存中隱藏'}</span>
                                       </button>
                                 </div>
                                 <div class="cl-popover-footer">
                                     <button class="delete-btn" onclick="app.removeChecklistItemUI(${cIdx}, ${index}, event)">
                                         <i data-lucide="trash-2"></i> 刪除
                                     </button>
                                 </div>
                            </div>
                        </div>
                    </div>
                `;
                containerEl.appendChild(itemRow);
            });
            if (window.lucide) lucide.createIcons();
            ProJED.UI.setupDateInputs(containerEl);
        },


        save() {
            const { type, itemId, listId, cardId } = ProJED.state.editingItem;
            // 重新查找當前狀態中的項目，確保不更新舊引用
            const item = ProJED.Data.findItem(type, itemId, listId, cardId);

            if (item) {
                // 從分離式輸入框讀取日期
                const getDateStr = (wrapperId) => {
                    const w = document.getElementById(wrapperId);
                    if (!w) return "";
                    const y = w.querySelector('.year').value.trim();
                    const m = w.querySelector('.month').value.trim();
                    const d = w.querySelector('.day').value.trim();
                    if (!y && !m && !d) return ""; // 全空
                    return `${y}-${m}-${d}`;
                };

                const rawStart = getDateStr('start-date-wrapper');
                const rawEnd = getDateStr('end-date-wrapper');

                const validatedStart = ProJED.UI.validateAndFixDate(rawStart, "起始日");
                if (validatedStart === false) return;

                const validatedEnd = ProJED.UI.validateAndFixDate(rawEnd, "到期日");
                if (validatedEnd === false) return;

                // 到期日為必填
                if (!validatedEnd) {
                    alert("到期日是必填項目");
                    return;
                }

                item.title = document.getElementById('item-title').value;
                item.notes = document.getElementById('item-notes').value;
                item.startDate = validatedStart;
                item.endDate = validatedEnd;
                item.status = document.getElementById('item-status').value;

                // 儲存依存設定
                const startTarget = document.getElementById('start-dep-target').value;
                if (startTarget) {
                    item.startDependency = {
                        targetId: startTarget,
                        type: document.getElementById('start-dep-type').value,
                        offset: parseInt(document.getElementById('start-dep-offset').value) || 0
                    };
                } else {
                    delete item.startDependency;
                }

                const endTarget = document.getElementById('end-dep-target').value;
                if (endTarget) {
                    item.endDependency = {
                        targetId: endTarget,
                        type: document.getElementById('end-dep-type').value,
                        offset: parseInt(document.getElementById('end-dep-offset').value) || 0
                    };
                } else {
                    delete item.endDependency;
                }
                ProJED.Data.save();
            }
        },

        syncModalDates() {
            const { type, itemId, listId, cardId } = ProJED.state.editingItem;
            const item = ProJED.Data.findItem(type, itemId, listId, cardId);
            if (!item) return;

            const getDateStr = (wrapperId) => {
                const w = document.getElementById(wrapperId);
                if (!w) return "";
                const y = w.querySelector('.year').value.trim();
                const m = w.querySelector('.month').value.trim();
                const d = w.querySelector('.day').value.trim();
                if (!y && !m && !d) return "";
                return `${y}-${m}-${d}`;
            };

            const rawStart = getDateStr('start-date-wrapper');
            const rawEnd = getDateStr('end-date-wrapper');

            if (rawStart) {
                const vStart = ProJED.UI.validateAndFixDate(rawStart, "起始日");
                if (vStart !== false) item.startDate = vStart;
            } else {
                item.startDate = "";
            }

            if (rawEnd) {
                const vEnd = ProJED.UI.validateAndFixDate(rawEnd, "到期日");
                if (vEnd !== false) item.endDate = vEnd;
            } else {
                item.endDate = "";
            }

            ProJED.Data.save();
            // 同時重新渲染，確保日期顯示正確 (例如自動修正後的日期)
            this.refresh(type, itemId, listId, cardId);
        },

        save() {
            // 這個 function 已經不再由按鈕觸發，但保留邏輯或直接移除
            // 在「方案一」中，我們改用即時同步
            this.close();
        },
        delete() {
            if (!confirm('確定刪除？')) return;
            const { type, itemId, listId, cardId } = ProJED.state.editingItem;
            if (type === 'list') ProJED.state.lists = ProJED.state.lists.filter(l => l.id !== itemId);
            else if (type === 'card') { const l = ProJED.state.lists.find(l => l.id === listId); if (l) l.cards = l.cards.filter(c => c.id !== itemId); }
            else if (type === 'checklist') {
                const card = ProJED.state.lists.find(l => l.id === listId)?.cards.find(c => c.id === cardId);
                if (card) {
                    (card.checklistContainers || []).forEach(cc => {
                        cc.items = cc.items.filter(cl => cl.id !== itemId);
                    });
                }
            }
            ProJED.Data.save();
            this.saved = true;
            this.close();
        },
        close() {
            this.saved = false;
            ProJED.state.editingItem = null;
            ProJED.state.activeChecklistIndex = -1;
            ProJED.state.activeChecklistGroupId = null;
            ProJED.state.activeChecklistStartDepIdx = -1;
            ProJED.state.activeChecklistEndDepIdx = -1;
            document.getElementById('modal-overlay').style.display = 'none';
        }
    },

    History: {
        push() {
            const s = JSON.parse(JSON.stringify(ProJED.state.lists));
            ProJED.state.history.push(s);
            if (ProJED.state.history.length > 50) ProJED.state.history.shift();
            ProJED.state.redoStack = [];
        },
        undo() {
            if (ProJED.state.history.length === 0) return;
            const currentState = JSON.parse(JSON.stringify(ProJED.state.lists));
            ProJED.state.redoStack.push(currentState);
            ProJED.state.lists = ProJED.state.history.pop();
            ProJED.Data.save(false);
        },
        redo() {
            if (ProJED.state.redoStack.length === 0) return;
            const nextState = ProJED.state.redoStack.pop();
            const currentState = JSON.parse(JSON.stringify(ProJED.state.lists));
            ProJED.state.history.push(currentState);
            ProJED.state.lists = nextState;
            ProJED.Data.save(false);
        }
    },

    renderActiveView() {
        if (this.state.currentView === 'board') this.Board.render();

        if (this.state.currentView === 'gantt') this.Gantt.render();
    },

    initEventListeners() {
        document.querySelectorAll('.nav-btn').forEach(btn => btn.onclick = () => { if (btn.dataset.view === 'gantt') ProJED.state.ganttInitialized = false; this.UI.switchView(btn.dataset.view); });
        const d = document.getElementById('modal-delete');
        if (d) d.onclick = () => this.Modal.delete();
        // 移除點擊外部關閉的功能，防止誤觸導致資料遺失 (配合手動儲存邏輯)
        // if (o) o.onmousedown = (e) => { if (e.target === o) this.Modal.close(); };

        document.querySelectorAll('.filter-controls input').forEach(input => input.onchange = (e) => { ProJED.state.ganttFilters[e.target.dataset.level] = e.target.checked; if (ProJED.state.currentView === 'gantt') ProJED.Gantt.render(); });

        window.onkeydown = (e) => {
            // ESC 關閉所有彈出層
            if (e.key === 'Escape') {
                if (ProJED.state.editingItem) this.Modal.close();
                document.querySelectorAll('.cl-item-popover').forEach(p => p.classList.remove('active'));
            }
            // Ctrl/Meta + Z 復原
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); this.History.undo(); }
            // Ctrl/Meta + Y 取消復原
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); this.History.redo(); }
        };

        // Global click for selection mode
        document.addEventListener('click', (e) => {
            if (ProJED.Data.SelectionMode && ProJED.Data.SelectionMode.active) {
                ProJED.Data.SelectionMode.handleClick(e);
            }
        }, true);
    }
};

window.app = {
    addNewList: () => ProJED.Board.addList(),
    addNewCard: (id) => ProJED.Board.addCard(id),
    openEditModal: (t, id, lId, cId) => ProJED.Modal.open(t, id, lId, cId),
    closeModal: () => ProJED.Modal.close(),
    toggleDepUI: (target) => {
        const ui = document.getElementById(`${target}-dep-ui`);
        const btn = document.querySelector(`.dep-toggle-btn[onclick*="${target}"]`);
        if (ui.style.display === 'none') {
            ui.style.display = 'block';
            btn.classList.add('active');
        } else {
            ui.style.display = 'none';
            btn.classList.remove('active');
            // 清空目標，代表取消依存
            document.getElementById(`${target}-dep-target`).value = "";
        }
    },
    toggleAuth: () => {
        if (ProJED.state.user) {
            if (confirm("登出？")) auth.signOut().then(() => location.reload());
        } else {
            const provider = new firebase.auth.GoogleAuthProvider();
            // 同時請求日曆權限
            provider.addScope('https://www.googleapis.com/auth/calendar.events');
            provider.addScope('https://www.googleapis.com/auth/calendar');

            auth.signInWithPopup(provider).then((result) => {
                ProJED.Google.accessToken = result.credential.accessToken;
                ProJED.UI.showToast("已登入並成功連結 Google 帳號");
                // 觸發同步
                ProJED.Google.syncAll(true);
            }).catch(err => {
                console.error("登入失敗:", err);
                ProJED.UI.showToast("登入失敗");
            });
        }
    },
    updateBoardName: (name) => {
        if (name.trim() === '') name = '專案看板';
        ProJED.state.boardName = name;
        ProJED.Data.save();
    },
    exportData: () => {
        const boardName = ProJED.state.boardName || 'ProJED';
        const timestamp = dayjs().format('YYYYMMDD_HHmmss');
        const filename = `${boardName}_${timestamp}.json`;
        const blob = new Blob([JSON.stringify(ProJED.state.lists, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
    },
    importData: (input) => { const f = input.files[0]; if (!f) return; const reader = new FileReader(); reader.onload = (e) => { try { ProJED.state.lists = JSON.parse(e.target.result); ProJED.Data.save(); } catch (err) { alert('格式錯誤'); } }; reader.readAsText(f); },
    updateItemField: (field, value) => {
        const { type, itemId, listId, cardId } = ProJED.state.editingItem || {};
        if (!type) return;
        const item = ProJED.Data.findItem(type, itemId, listId, cardId);
        if (!item) return;

        if (field === 'startDependency' || field === 'endDependency') {
            if (!item[field]) item[field] = { type: 'start', offset: 0 };
            Object.assign(item[field], value);
            if (!item[field].targetId) delete item[field];
        } else {
            item[field] = value;
        }
        ProJED.Data.save();
    },
    syncModalDates: () => ProJED.Modal.syncModalDates(),
    syncChecklistDates: (cIdx, index) => {
        const { listId, cardId } = ProJED.state.editingItem;
        const card = ProJED.state.lists.find(l => l.id === listId)?.cards.find(c => c.id === cardId);
        if (!card || !card.checklistContainers[cIdx]?.items[index]) return;

        const cl = card.checklistContainers[cIdx].items[index];
        // 查找對應的 row。因為現在有多個容器，我們需要精確查找
        const containerItemsEl = document.getElementById(`cl-items-${card.checklistContainers[cIdx].id}`);
        const row = containerItemsEl?.querySelectorAll('.checklist-item-row')[index];
        if (!row) return;

        const getClDate = (target) => {
            const w = row.querySelector(`.split-date-input[data-cl-target="${target}"]`);
            if (!w) return "";
            const y = w.querySelector('.year').value.trim();
            const m = w.querySelector('.month').value.trim();
            const d = w.querySelector('.day').value.trim();
            if (!y && !m && !d) return "";
            return `${y}-${m}-${d}`;
        };

        const clStart = getClDate('start');
        const clEnd = getClDate('end');

        if (clStart) {
            const vStart = ProJED.UI.validateAndFixDate(clStart, `待辦起始日`);
            if (vStart !== false) cl.startDate = vStart;
        } else {
            cl.startDate = "";
        }

        if (clEnd) {
            const vEnd = ProJED.UI.validateAndFixDate(clEnd, `待辦到期日`);
            if (vEnd !== false) cl.endDate = vEnd;
        } else {
            cl.endDate = "";
        }
        ProJED.Data.save();
        ProJED.Modal.renderChecklistContainers(card.checklistContainers);
    },
    selectStatusUI: (el) => {
        document.querySelectorAll('.status-option').forEach(o => o.classList.remove('selected'));
        el.classList.add('selected');
        const status = el.dataset.value;
        document.getElementById('item-status').value = status;
        app.updateItemField('status', status);
    },
    toggleGanttVisibility: (t, id, lId, cId) => ProJED.Data.toggleGanttVisibility(t, id, lId, cId),
    toggleStatusFilter: (el) => { ProJED.state.statusFilters[el.dataset.status] = el.checked; ProJED.renderActiveView(); },
    setGanttMode: (mode) => {
        ProJED.state.ganttMode = mode;
        ProJED.state.ganttInitialized = false;
        ProJED.Gantt.render();
        // 更新按鈕狀態
        document.querySelectorAll('.gantt-view-modes button').forEach(btn => {
            const btnText = btn.textContent.trim();
            const targetText = mode === 'Month' ? '月' : (mode === 'Quarter' ? '季' : '年');
            btn.classList.toggle('active', btnText === targetText);
        });
    },
    toggleChecklistMenu: (btn, cIdx, index, containerId) => {
        const popover = btn.nextElementSibling;
        const isActive = popover.classList.contains('active');

        document.querySelectorAll('.cl-item-popover').forEach(p => p.classList.remove('active'));

        if (!isActive) {
            popover.classList.add('active');
            ProJED.state.activeChecklistIndex = index;
            ProJED.state.activeChecklistGroupId = containerId;
        } else {
            ProJED.state.activeChecklistIndex = -1;
            ProJED.state.activeChecklistGroupId = null;
        }

        const closeMenu = (e) => {
            if (!e.target.closest('.cl-item-popover') && !e.target.closest('.cl-more-btn')) {
                popover.classList.remove('active');
                if (ProJED.state.activeChecklistIndex === index && ProJED.state.activeChecklistGroupId === containerId) {
                    ProJED.state.activeChecklistIndex = -1;
                    ProJED.state.activeChecklistGroupId = null;
                    ProJED.state.activeChecklistStartDepIdx = -1;
                    ProJED.state.activeChecklistEndDepIdx = -1;
                }
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    },

    startPicking: (inputId) => {
        ProJED.Data.SelectionMode.enter('general', (pickedId) => {
            const select = document.getElementById(inputId);
            if (select) {
                if (pickedId === ProJED.state.editingItem.itemId) {
                    alert("不能依賴自己！");
                    return;
                }
                // Ensure option exists, if not, add it temporarily (though refreshing usually handles it)
                // But simply setting value works if option exists.
                // getAllSelectableItems logic ensures it's in the list unless it's self.
                select.value = pickedId;
                // If the value didn't change because it wasn't there, we might need to add it.
                if (select.value !== pickedId) {
                    // Maybe it's a checklist item that wasn't included?
                    // TODO: Check if getAllSelectableItems includes checklist items. 
                    // Assuming yes for now.
                }
                select.dispatchEvent(new Event('change'));
            }
        });
    },

    startPickingForChecklist: (cIdx, index, depType) => {
        ProJED.Data.SelectionMode.enter('checklist', (pickedId) => {
            app.updateChecklistItemDep(cIdx, index, depType, 'targetId', pickedId);
        });
    },

    updateChecklistItemDep: (cIdx, index, depType, field, value) => {
        const { listId, cardId } = ProJED.state.editingItem;
        const card = ProJED.state.lists.find(l => l.id === listId)?.cards.find(c => c.id === cardId);
        if (!card || !card.checklistContainers[cIdx]?.items[index]) return;

        const cl = card.checklistContainers[cIdx].items[index];
        const key = depType + 'Dependency';
        if (!cl[key]) cl[key] = { type: 'start', offset: 0 };

        if (field === 'targetId') cl[key].targetId = value;
        if (field === 'type') cl[key].type = value;
        if (field === 'offset') cl[key].offset = parseInt(value) || 0;

        if (!cl[key].targetId) delete cl[key];

        ProJED.Data.save();
        ProJED.Modal.renderChecklistContainers(card.checklistContainers);
    },

    toggleChecklistDepUI: (target, cIdx, index, event) => {
        if (event) event.stopPropagation();
        const key = target === 'start' ? 'activeChecklistStartDepIdx' : 'activeChecklistEndDepIdx';
        const { listId, cardId } = ProJED.state.editingItem;
        const card = ProJED.state.lists.find(l => l.id === listId)?.cards.find(c => c.id === cardId);
        const containerId = card?.checklistContainers[cIdx]?.id;

        if (ProJED.state[key] === index && ProJED.state.activeChecklistGroupId === containerId) {
            ProJED.state[key] = -1;
        } else {
            ProJED.state[key] = index;
            ProJED.state.activeChecklistGroupId = containerId;
        }

        if (card) {
            ProJED.Modal.renderChecklistContainers(card.checklistContainers);
        }
    },

    toggleChecklistItemDone: (cIdx, index) => {
        const { listId, cardId } = ProJED.state.editingItem;
        const card = ProJED.state.lists.find(l => l.id === listId)?.cards.find(c => c.id === cardId);
        if (card && card.checklistContainers[cIdx]?.items[index]) {
            const cl = card.checklistContainers[cIdx].items[index];
            cl.status = cl.status === 'completed' ? 'todo' : 'completed';
            ProJED.Data.save();
            ProJED.Modal.renderChecklistContainers(card.checklistContainers);
        }
    },

    removeChecklistItemUI: (cIdx, index, event) => {
        if (event) event.stopPropagation();
        if (!confirm('確定刪除此待辦項目？')) return;
        const { listId, cardId } = ProJED.state.editingItem;
        const card = ProJED.state.lists.find(l => l.id === listId)?.cards.find(c => c.id === cardId);
        if (card && card.checklistContainers[cIdx]) {
            card.checklistContainers[cIdx].items.splice(index, 1);
            ProJED.Data.save();
            ProJED.Modal.renderChecklistContainers(card.checklistContainers);
        }
    },

    toggleShowCompletedCL: () => {
        ProJED.state.showCompletedCL = !ProJED.state.showCompletedCL;
        const { listId, cardId } = ProJED.state.editingItem;
        const card = ProJED.state.lists.find(l => l.id === listId)?.cards.find(c => c.id === cardId);
        if (card) {
            ProJED.Modal.renderChecklistContainers(card.checklistContainers);
        }
    },

    addChecklistItemUI: (cIdx) => {
        const { listId, cardId } = ProJED.state.editingItem;
        const card = ProJED.state.lists.find(l => l.id === listId)?.cards.find(c => c.id === cardId);
        if (card && card.checklistContainers[cIdx]) {
            if (!card.checklistContainers[cIdx].items) card.checklistContainers[cIdx].items = [];
            card.checklistContainers[cIdx].items.push({ id: 'cl_' + Date.now(), title: '', status: 'todo' });
            ProJED.Data.save();
            ProJED.Modal.renderChecklistContainers(card.checklistContainers);
        }
    },

    closeChecklistMenu: (btn, index, event) => {
        if (event) event.stopPropagation();
        const popover = btn.closest('.cl-item-popover');
        if (popover) {
            popover.classList.remove('active');
            ProJED.state.activeChecklistIndex = -1;
            ProJED.state.activeChecklistStartDepIdx = -1;
            ProJED.state.activeChecklistEndDepIdx = -1;
        }
    },

    updateChecklistItem: (cIdx, index, field, value) => {
        const { listId, cardId } = ProJED.state.editingItem;
        const card = ProJED.state.lists.find(l => l.id === listId)?.cards.find(c => c.id === cardId);
        if (card && card.checklistContainers[cIdx]?.items[index]) {
            card.checklistContainers[cIdx].items[index][field] = value;
            ProJED.Data.save();
            if (field === 'status') {
                ProJED.Modal.renderChecklistContainers(card.checklistContainers);
            }
        }
    },
    addChecklistContainerUI: () => {
        const { listId, cardId } = ProJED.state.editingItem;
        const card = ProJED.state.lists.find(l => l.id === listId)?.cards.find(c => c.id === cardId);
        if (card) {
            if (!card.checklistContainers) card.checklistContainers = [];
            card.checklistContainers.push({
                id: 'cc_' + Date.now(),
                title: '待辦清單',
                items: []
            });
            ProJED.Data.save();
            ProJED.Modal.renderChecklistContainers(card.checklistContainers);
        }
    },
    updateChecklistContainer: (cIdx, field, value) => {
        const { listId, cardId } = ProJED.state.editingItem;
        const card = ProJED.state.lists.find(l => l.id === listId)?.cards.find(c => c.id === cardId);
        if (card && card.checklistContainers[cIdx]) {
            card.checklistContainers[cIdx][field] = value;
            ProJED.Data.save();
        }
    },
    removeChecklistContainerUI: (cIdx) => {
        if (!confirm('確定刪除整個清單？其下所有項目也將被刪除。')) return;
        const { listId, cardId } = ProJED.state.editingItem;
        const card = ProJED.state.lists.find(l => l.id === listId)?.cards.find(c => c.id === cardId);
        if (card && card.checklistContainers[cIdx]) {
            card.checklistContainers.splice(cIdx, 1);
            ProJED.Data.save();
            ProJED.Modal.renderChecklistContainers(card.checklistContainers);
        }
    },

    syncWithGoogleCalendar: () => {
        const expiry = localStorage.getItem('google_token_expiry');
        const isTokenValid = ProJED.Google.accessToken && expiry && Date.now() < parseInt(expiry);

        if (!isTokenValid) {
            console.log("權杖失效或不存在，要求新權杖...");
            ProJED.Google.requestToken();
        } else {
            console.log("使用現有的有效權杖進行同步");
            ProJED.Google.syncAll(true);
        }
    },
    cleanupGoogleCalendar: () => { ProJED.Google.clearAll(); },
    undo: () => ProJED.History.undo(),
    redo: () => ProJED.History.redo()
};


window.onload = () => ProJED.init();
