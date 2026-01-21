/**
 * ProJED 2.7 - Gantt Visual Clarity & UI Polish Build
 */

// 1. Firebase 初始化
const firebaseConfig = {
    apiKey: "AIzaSyCdafAboRXudgOqbjm-RK1uNJ13h9Yl44g",
    authDomain: "jed-s-project-management-tool.firebaseapp.com",
    projectId: "jed-s-project-management-tool",
    storageBucket: "jed-s-project-management-tool.firebasestorage.app",
    messagingSenderId: "793386863318",
    appId: "1:793386863318:web:e86812f7a7f048c7005777",
    measurementId: "G-5J9KECQ9HF"
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
        showCompletedCL: false
    },

    GRID_START: dayjs('2024-01-01'),
    BAR_HEIGHT: 45,

    async init() {
        console.log("🚀 [ProJED 2.7] 進階視覺版備份啟動...");
        this.Data.load();

        auth.onAuthStateChanged(user => {
            this.state.user = user;
            this.UI.updateAuthUI(user);
            if (user) this.Cloud.syncFromFirebase();
            else this.renderActiveView();
        });

        this.initEventListeners();
        this.UI.setupDateInputs();
        this.renderActiveView();
        if (window.lucide) lucide.createIcons();
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
                    // 兼容舊資料格式 (舊格式直接是陣列)
                    if (Array.isArray(parsed)) {
                        ProJED.state.lists = parsed;
                    } else {
                        ProJED.state.lists = parsed.lists || [];
                        ProJED.state.boardName = parsed.boardName || '專案看板';
                    }
                } catch (e) { }
            }
            if (!ProJED.state.lists || ProJED.state.lists.length === 0) {
                ProJED.state.lists = [{ id: 'l1', title: '預設計畫', startDate: '2026-01-01', endDate: '2026-02-01', cards: [], status: 'todo', ganttVisible: true }];
            }
        },
        save(pushHistory = true) {
            const dataToSave = {
                lists: ProJED.state.lists,
                boardName: ProJED.state.boardName
            };
            localStorage.setItem('projed_data', JSON.stringify(dataToSave));
            if (pushHistory) ProJED.History.push();
            if (ProJED.state.user) ProJED.Cloud.saveToFirebase();
            ProJED.renderActiveView();

            // 如果彈窗開著，強制刷新彈窗內容以避開引用斷裂問題
            if (ProJED.state.editingItem) {
                const { type, itemId, listId, cardId } = ProJED.state.editingItem;
                ProJED.Modal.refresh(type, itemId, listId, cardId);
            }
        },
        // 核心：路徑式查找，確保 ID 匹配不失敗
        toggleGanttVisibility(type, id, listId = null, cardId = null) {
            console.log(`[Visibility] 類型:${type}, ID:${id}, L:${listId}, C:${cardId}`);
            let target = null;

            if (type === 'list') {
                target = ProJED.state.lists.find(l => l.id === id);
            } else if (type === 'card') {
                const list = ProJED.state.lists.find(l => l.id === (listId || ""));
                if (list) target = list.cards.find(c => c.id === id);
            } else if (type === 'checklist') {
                const list = ProJED.state.lists.find(l => l.id === (listId || ""));
                const card = list?.cards.find(c => c.id === (cardId || ""));
                if (card) target = (card.checklists || []).find(cl => cl.id === id);
            }

            if (target) {
                target.ganttVisible = target.ganttVisible === false ? true : false;
                console.log(`✅ 已為 ${target.title || '項目'} 設定可見度為: ${target.ganttVisible}`);
                this.save();
            } else {
                console.warn("❌ 無法在數據庫中定位該項目。");
            }
        },
        // 新增：安全查找當前狀態中的項目，防止 Firebase 同步導致的引用失效
        findItem(type, itemId, listId = null, cardId = null) {
            if (type === 'list') {
                return ProJED.state.lists.find(l => l.id === itemId);
            } else if (type === 'card') {
                const list = ProJED.state.lists.find(l => l.id === (listId || ""));
                return list?.cards.find(c => c.id === itemId);
            } else if (type === 'checklist') {
                const list = ProJED.state.lists.find(l => l.id === (listId || ""));
                const card = list?.cards.find(c => c.id === (cardId || ""));
                return card?.checklists.find(cl => cl.id === itemId);
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
                        ProJED.state.lists = data.lists;
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

    UI: {
        switchView(view) {
            ProJED.state.currentView = view;
            document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
            document.getElementById('board-view').style.display = view === 'board' ? 'flex' : 'none';
            document.getElementById('calendar-view').style.display = view === 'calendar' ? 'block' : 'none';
            document.getElementById('gantt-view').style.display = view === 'gantt' ? 'flex' : 'none';
            ProJED.renderActiveView();
        },
        updateAuthUI(user) {
            const btn = document.getElementById('auth-btn');
            const profile = document.getElementById('user-profile');
            if (btn) btn.innerHTML = user ? '<i data-lucide="log-out"></i> 登出' : '<i data-lucide="log-in"></i> Google 登入';
            if (profile) profile.style.display = user ? 'block' : 'none';
            if (window.lucide) lucide.createIcons();
        },
        // 新增：日期輸入框自動跳轉與導航邏輯
        setupDateInputs() {
            document.querySelectorAll('.split-date-input').forEach(wrapper => {
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
                div.className = 'list-wrapper';
                div.dataset.id = list.id;
                const isHidden = list.ganttVisible === false;
                div.innerHTML = `
                    <div class="list-header" onclick="app.openEditModal('list', '${list.id}')" style="cursor:pointer;">
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
                    el.className = 'card';
                    el.dataset.id = card.id;
                    //讓整張卡片可點擊
                    el.setAttribute('onclick', `app.openEditModal('card', '${card.id}', '${list.id}')`);

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
        render() {
            const container = document.querySelector('.gantt-container');
            const mask = document.querySelector('.gantt-mask');
            if (!container || !mask) return;

            const mode = ProJED.state.ganttMode || 'Month';
            const oldScrollLeft = container.querySelector('.gantt-scroll-container')?.scrollLeft || 0;

            // 基礎寬度計算
            let colWidth = Math.floor(mask.getBoundingClientRect().width / 12);
            if (mode === 'Quarter') colWidth = Math.floor(mask.getBoundingClientRect().width / 12); // 修改為容納 12 格 (3年)
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
                                (c.checklists || []).forEach(cl => {
                                    const clStatus = cl.status || 'todo';
                                    if (cl.ganttVisible !== false && ProJED.state.statusFilters[clStatus]) {
                                        items.push({ ...cl, type: 'checklist', row: rowIdx++, listId: l.id, cardId: c.id, status: clStatus });
                                        checklistCount++;
                                    }
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
            let start = item.startDate;
            const end = item.endDate || dayjs().add(10, 'day').format('YYYY-MM-DD');
            if (!start) start = dayjs(end).subtract(3, 'day').format('YYYY-MM-DD');

            const startX = this.getX(start, colWidth);
            const endX = this.getX(end, colWidth);
            const width = Math.max(endX - startX, 20);

            // 校正：確保進度條的結束位置對齊 endX，解決短任務被強制最小寬度後超出截止日期的問題
            const barLeft = endX - width;

            const bar = document.createElement('div');
            const status = item.status || 'todo';
            const title = item.title || item.name || '項目';
            const displayStatus = (title.includes('答辯') && status === 'todo') ? 'unsure' : status;

            bar.className = `gantt-task-bar status-${displayStatus} ${item.type === 'list' ? 'is-list' : ''} ${item.type === 'checklist' ? 'is-checklist' : ''}`;
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
                bar.innerHTML = `${closeBtnHtml}<div class="fluid-label" style="position: absolute; left: 50%; transform: translateX(-50%); color: #ffffff !important; white-space: nowrap; font-weight: 600; pointer-events: none; text-shadow: 0 1px 2px rgba(0,0,0,0.2);">${text}</div>`;
            } else {
                const textColor = ProJED.UI.getStatusColor(displayStatus);
                bar.innerHTML = `${closeBtnHtml}<div style="position:absolute; left:100%; margin-left:8px; color:${textColor}; white-space:nowrap; font-weight:600; font-size:13px; pointer-events:none;">${text}</div>`;
                bar.style.overflow = 'visible';
            }

            bar.onclick = (e) => { e.stopPropagation(); ProJED.Modal.open(item.type, item.id, item.type === 'card' ? item.listId : (item.type === 'checklist' ? item.listId : null), item.type === 'checklist' ? item.cardId : null); };
            return bar;
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
        open(type, itemId, listId = null, cardId = null) {
            this.refresh(type, itemId, listId, cardId);
            document.getElementById('modal-overlay').style.display = 'flex';
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
                item = card?.checklists.find(cl => cl.id === itemId);
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
                this.renderChecklistItems(item.checklists || []);
            } else {
                clSection.style.display = 'none';
                if (notesSection) notesSection.style.display = 'none';
            }
        },
        renderChecklistItems(cls, openMenuIndex = -1) {
            const container = document.getElementById('checklist-items-container');
            container.innerHTML = '';
            const { listId, cardId } = ProJED.state.editingItem;

            cls.forEach((cl, index) => {
                const isCompleted = cl.status === 'completed';
                if (!ProJED.state.showCompletedCL && isCompleted) return;


                // Date & Overdue Logic
                let dateBadgeHtml = '';
                let isOverdue = false;
                let displayStatus = cl.status || 'todo';

                if (cl.endDate) {
                    const end = dayjs(cl.endDate);
                    if (end.isValid()) {
                        const today = dayjs().startOf('day');
                        // Fix: use startOf day comparisons
                        if (end.isBefore(today) && displayStatus !== 'completed') {
                            isOverdue = true;
                            displayStatus = 'delayed';
                        }

                        // 若是超過當年年度的話, 主動將年顯示出來
                        const dateText = end.format('YYYY/MM/DD');

                        dateBadgeHtml = `
                            <div class="cl-date-badge ${isOverdue ? 'overdue' : ''}">
                                <i data-lucide="clock" style="width:14px; height:14px;"></i>
                                <span>${dateText}</span>
                            </div>
                        `;
                    }
                }

                const row = document.createElement('div');
                row.className = `checklist-item-row ${isCompleted ? 'is-completed' : ''}`;
                const finalDisplayStatus = ((cl.title || cl.name || '').includes('答辯') && displayStatus === 'todo') ? 'unsure' : displayStatus;
                const isHidden = cl.ganttVisible === false;
                const isMenuOpen = index === openMenuIndex;

                row.innerHTML = `
                    <div class="cl-checkbox ${displayStatus === 'completed' ? 'checked' : ''}" onclick="app.toggleChecklistItemDone(${index})">
                        ${displayStatus === 'completed' ? '<i data-lucide="check" style="width:14px; height:14px;"></i>' : ''}
                    </div>
                    <div class="cl-main-row" style="display:flex; align-items:center; gap:8px; flex:1;">
                        <input type="text" class="cl-title-input status-${finalDisplayStatus}" value="${cl.title || cl.name || ''}" placeholder="待辦名稱" onchange="app.updateChecklistItem(${index}, 'title', this.value)">
                        
                        ${dateBadgeHtml}

                        <div style="position:relative">
                            <button class="cl-more-btn" onclick="app.toggleChecklistMenu(this)">
                                <i data-lucide="more-horizontal" style="width:16px; height:16px;"></i>
                            </button>
                            <div class="cl-item-popover ${isMenuOpen ? 'active' : ''}">
                                <div class="popover-section">
                                    <label>狀態</label>
                                    <div class="cl-status-picker">
                                        <div class="cl-status-dot todo ${displayStatus === 'todo' ? 'selected' : ''}" title="進行中" onclick="app.updateChecklistItem(${index}, 'status', 'todo')"></div>
                                        <div class="cl-status-dot delayed ${displayStatus === 'delayed' ? 'selected' : ''}" title="延遲" onclick="app.updateChecklistItem(${index}, 'status', 'delayed')"></div>
                                        <div class="cl-status-dot completed ${displayStatus === 'completed' ? 'selected' : ''}" title="完成" onclick="app.updateChecklistItem(${index}, 'status', 'completed')"></div>
                                        <div class="cl-status-dot unsure ${displayStatus === 'unsure' ? 'selected' : ''}" title="不確定" onclick="app.updateChecklistItem(${index}, 'status', 'unsure')"></div>
                                        <div class="cl-status-dot onhold ${displayStatus === 'onhold' ? 'selected' : ''}" title="暫緩" onclick="app.updateChecklistItem(${index}, 'status', 'onhold')"></div>
                                    </div>
                                </div>
                                <div class="popover-section">
                                    <label>時間範圍</label>
                                    <div class="cl-dates">
                                        <input type="date" value="${cl.startDate || ''}" min="1000-01-01" max="9999-12-31" onchange="app.updateChecklistItem(${index}, 'startDate', this.value)">
                                        <span style="color:#94a3b8">→</span>
                                        <input type="date" value="${cl.endDate || ''}" min="1000-01-01" max="9999-12-31" onchange="app.updateChecklistItem(${index}, 'endDate', this.value)">
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
                                <button class="cl-delete-full-btn" onclick="app.removeChecklistItemUI(${index})">
                                    <i data-lucide="trash-2" style="width:14px; height:14px;"></i> 刪除此項目
                                </button>
                            </div>
                        </div>
                    </div>`;
                container.appendChild(row);
            });
            if (window.lucide) lucide.createIcons();

            // Re-attach listener if menu is open
            if (openMenuIndex !== -1) {
                const rows = container.getElementsByClassName('checklist-item-row');
                if (rows[openMenuIndex]) {
                    const btn = rows[openMenuIndex].querySelector('.cl-more-btn');
                    const popover = rows[openMenuIndex].querySelector('.cl-item-popover');
                    if (btn && popover) {
                        const closeMenu = (e) => {
                            if (!popover.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
                                popover.classList.remove('active');
                                document.removeEventListener('click', closeMenu);
                            }
                        };
                        setTimeout(() => document.addEventListener('click', closeMenu), 0);
                    }
                }
            }
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
                ProJED.Data.save();
                this.close();
            } else {
                console.error("❌ 儲存失敗：找不到項目。");
                ProJED.UI.showToast("儲存失敗，請重試");
            }
        },
        delete() {
            if (!confirm('確定刪除？')) return;
            const { type, itemId, listId, cardId } = ProJED.state.editingItem;
            if (type === 'list') ProJED.state.lists = ProJED.state.lists.filter(l => l.id !== itemId);
            else if (type === 'card') { const l = ProJED.state.lists.find(l => l.id === listId); if (l) l.cards = l.cards.filter(c => c.id !== itemId); }
            else if (type === 'checklist') {
                const card = ProJED.state.lists.find(l => l.id === listId)?.cards.find(c => c.id === cardId);
                if (card) card.checklists = card.checklists.filter(cl => cl.id !== itemId);
            }
            ProJED.Data.save();
            this.close();
        },
        close() { ProJED.state.editingItem = null; document.getElementById('modal-overlay').style.display = 'none'; }
    },

    History: {
        push() { const s = JSON.parse(JSON.stringify(ProJED.state.lists)); ProJED.state.history.push(s); if (ProJED.state.history.length > 50) ProJED.state.history.shift(); },
        undo() { if (ProJED.state.history.length === 0) return; ProJED.state.lists = ProJED.state.history.pop(); ProJED.Data.save(false); }
    },

    renderActiveView() {
        if (this.state.currentView === 'board') this.Board.render();
        if (this.state.currentView === 'calendar') {
            const el = document.getElementById('calendar-el');
            if (el) {
                const evs = [];
                ProJED.state.lists.forEach(l => {
                    const lStatus = l.status || 'todo';
                    if (!ProJED.state.statusFilters[lStatus]) return;

                    const lDisplayStatus = (l.title && l.title.includes('答辯') && lStatus === 'todo') ? 'unsure' : lStatus;
                    evs.push({ title: l.title || '項目', start: l.startDate, end: dayjs(l.endDate).add(1, 'day').format('YYYY-MM-DD'), color: ProJED.UI.getStatusColor(lDisplayStatus) });
                    (l.cards || []).forEach(c => {
                        const cStatus = c.status || 'todo';
                        if (!ProJED.state.statusFilters[cStatus]) return;

                        const cDisplayStatus = (c.title && c.title.includes('答辯') && cStatus === 'todo') ? 'unsure' : cStatus;
                        evs.push({ title: c.title || '卡片', start: c.startDate, end: dayjs(c.endDate).add(1, 'day').format('YYYY-MM-DD'), color: ProJED.UI.getStatusColor(cDisplayStatus) });
                        (c.checklists || []).forEach(cl => {
                            const clStatus = cl.status || 'todo';
                            if (!ProJED.state.statusFilters[clStatus]) return;

                            const clDisplayStatus = ((cl.title || cl.name || '').includes('答辯') && clStatus === 'todo') ? 'unsure' : clStatus;
                            if (cl.endDate) evs.push({ title: cl.title || '待辦', start: cl.startDate || cl.endDate, end: dayjs(cl.endDate).add(1, 'day').format('YYYY-MM-DD'), color: ProJED.UI.getStatusColor(clDisplayStatus) });
                        });
                    });
                });
                new FullCalendar.Calendar(el, { initialView: 'dayGridMonth', locale: 'zh-tw', events: evs }).render();
            }
        }
        if (this.state.currentView === 'gantt') this.Gantt.render();
    },

    initEventListeners() {
        document.querySelectorAll('.nav-btn').forEach(btn => btn.onclick = () => { if (btn.dataset.view === 'gantt') ProJED.state.ganttInitialized = false; this.UI.switchView(btn.dataset.view); });
        const s = document.getElementById('modal-save'), d = document.getElementById('modal-delete'), o = document.getElementById('modal-overlay');
        if (s) s.onclick = () => this.Modal.save();
        if (d) d.onclick = () => this.Modal.delete();
        if (o) o.onmousedown = (e) => { if (e.target === o) this.Modal.close(); };

        document.querySelectorAll('.filter-controls input').forEach(input => input.onchange = (e) => { ProJED.state.ganttFilters[e.target.dataset.level] = e.target.checked; if (ProJED.state.currentView === 'gantt') ProJED.Gantt.render(); });

        window.onkeydown = (e) => {
            // ESC 關閉所有彈出層
            if (e.key === 'Escape') {
                if (ProJED.state.editingItem) this.Modal.close();
                document.querySelectorAll('.cl-item-popover').forEach(p => p.classList.remove('active'));
            }
            // Ctrl/Meta + Z 復原
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); this.History.undo(); }
        };
    }
};

window.app = {
    addNewList: () => ProJED.Board.addList(),
    addNewCard: (id) => ProJED.Board.addCard(id),
    openEditModal: (t, id, lId, cId) => ProJED.Modal.open(t, id, lId, cId),
    closeModal: () => ProJED.Modal.close(),
    toggleAuth: () => { if (ProJED.state.user) { if (confirm("登出？")) auth.signOut().then(() => location.reload()); } else { auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).then(() => ProJED.UI.showToast("已登入")); } },
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
    selectStatusUI: (el) => { document.querySelectorAll('.status-option').forEach(o => o.classList.remove('selected')); el.classList.add('selected'); document.getElementById('item-status').value = el.dataset.value; },
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
    toggleChecklistMenu: (btn) => {
        const popover = btn.nextElementSibling;
        const isActive = popover.classList.contains('active');
        document.querySelectorAll('.cl-item-popover').forEach(p => p.classList.remove('active'));
        if (!isActive) popover.classList.add('active');

        // 點擊外部關閉選單
        const closeMenu = (e) => {
            if (!popover.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
                popover.classList.remove('active');
                document.removeEventListener('click', closeMenu);
            }
        };
        if (!isActive) setTimeout(() => document.addEventListener('click', closeMenu), 0);
    },
    toggleChecklistItemDone: (index) => {
        const { type, itemId, listId, cardId } = ProJED.state.editingItem;
        const item = ProJED.Data.findItem(type, itemId, listId, cardId);
        if (item && item.checklists && item.checklists[index]) {
            const cl = item.checklists[index];
            cl.status = cl.status === 'completed' ? 'todo' : 'completed';
            ProJED.Modal.renderChecklistItems(item.checklists);
        }
    },
    addChecklistItemUI: () => {
        const { type, itemId, listId, cardId } = ProJED.state.editingItem;
        const item = ProJED.Data.findItem(type, itemId, listId, cardId);
        if (item) {
            if (!item.checklists) item.checklists = [];
            item.checklists.push({ id: 'cl' + Date.now(), title: '新待辦項', startDate: '', endDate: item.endDate, status: 'todo', ganttVisible: true });
            ProJED.Modal.renderChecklistItems(item.checklists);
        }
    },
    updateChecklistItem: (index, field, value) => {
        const { type, itemId, listId, cardId } = ProJED.state.editingItem;
        const item = ProJED.Data.findItem(type, itemId, listId, cardId);
        if (item && item.checklists && item.checklists[index]) {
            item.checklists[index][field] = value;
            if (['status', 'startDate', 'endDate', 'title'].includes(field)) {
                // If modifying date, keep the menu open
                const openIndex = (field === 'startDate' || field === 'endDate') ? index : -1;
                ProJED.Modal.renderChecklistItems(item.checklists, openIndex);
            }
        }
    },
    removeChecklistItemUI: (index) => {
        const { type, itemId, listId, cardId } = ProJED.state.editingItem;
        const item = ProJED.Data.findItem(type, itemId, listId, cardId);
        if (item && item.checklists) {
            item.checklists.splice(index, 1);
            ProJED.Modal.renderChecklistItems(item.checklists);
        }
    },
    toggleShowCompletedCL: () => {
        ProJED.state.showCompletedCL = !ProJED.state.showCompletedCL;
        const { type, itemId, listId, cardId } = ProJED.state.editingItem;
        const item = ProJED.Data.findItem(type, itemId, listId, cardId);
        if (item && item.checklists) {
            ProJED.Modal.renderChecklistItems(item.checklists);
        }
    }
};

window.onload = () => ProJED.init();
