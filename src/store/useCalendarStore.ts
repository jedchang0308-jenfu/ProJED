import { create } from 'zustand';
import dayjs from 'dayjs';

interface CalendarDay {
    date: string; // '20240101'
    week: string;
    isHoliday: boolean;
    description: string;
}

interface CalendarState {
    holidays: Record<string, boolean>; // e.g. "20240101": true
    loadedYears: number[];
    fetchYears: (years: number[]) => Promise<void>;
    isHoliday: (dateStr: string) => boolean; // 支援 "YYYY-MM-DD" 與 "YYYYMMDD"
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
    holidays: {},
    loadedYears: [],
    
    fetchYears: async (years: number[]) => {
        const { loadedYears, holidays } = get();
        const yearsToFetch = years.filter(y => !loadedYears.includes(y));
        if (yearsToFetch.length === 0) return;

        const newHolidays = { ...holidays };
        
        await Promise.all(yearsToFetch.map(async (year) => {
            try {
                // 使用 ruyut/TaiwanCalendar 的 CDN 資料
                const res = await fetch(`https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/${year}.json`);
                if (res.ok) {
                    const data: CalendarDay[] = await res.json();
                    data.forEach(d => {
                        newHolidays[d.date] = d.isHoliday;
                    });
                } else {
                    throw new Error("HTTP 404");
                }
            } catch (error) {
                console.warn(`[Calendar] 尚未取得 ${year} 年人事局行事曆資料，啟用前一年度預估模式 (Fallback)。`);
                // Fallback 預估模式：參考 year-1 的國定假日來推算
                Object.entries(newHolidays).forEach(([dateStr, isHol]) => {
                    if (dateStr.startsWith(String(year - 1))) {
                        const d = dayjs(dateStr); // dateStr: "YYYYMMDD"
                        const dayOfWeek = d.day();
                        const nextYearDateStr = String(year) + dateStr.slice(4);
                        
                        // 1. 若去年此日是「平日」但放假 (即國定假日、連假)
                        if (isHol && dayOfWeek !== 0 && dayOfWeek !== 6) {
                            newHolidays[nextYearDateStr] = true;
                        }
                        // 2. 若去年此日是「假日」但不放假 (即補班日)
                        else if (!isHol && (dayOfWeek === 0 || dayOfWeek === 6)) {
                            newHolidays[nextYearDateStr] = false;
                        }
                    }
                });
            }
        }));

        set(state => ({
            holidays: newHolidays,
            loadedYears: [...state.loadedYears, ...yearsToFetch]
        }));
    },
    
    isHoliday: (dateStr: string) => {
        const str = dateStr.replace(/-/g, '');
        const { holidays } = get();
        
        // 如果有下載到該年度的行事曆資料，以資料為準（完美解決補班日與國定假期）
        if (typeof holidays[str] === 'boolean') {
            return holidays[str];
        }
        
        // Fallback: 如果資料尚未非同步載入，或該年份無資料，退回標準週休二日邏輯
        const dayOfWeek = dayjs(dateStr).day();
        return dayOfWeek === 0 || dayOfWeek === 6;
    }
}));
