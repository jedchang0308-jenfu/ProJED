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
                }
            } catch (error) {
                console.error(`Failed to fetch Taiwan calendar for ${year}`, error);
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
