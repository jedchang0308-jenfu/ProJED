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

export type CalendarHolidayMap = Record<string, boolean>;

/**
 * 以前一年度相同月日的例外（平日放假／週末補班）預估目標年度。
 * 只複製相對於標準週休二日的例外，避免把去年的所有週末誤套到新年度。
 */
export const projectCalendarYearFromPrevious = (
    holidays: CalendarHolidayMap,
    sourceYear: number,
    targetYear: number,
): CalendarHolidayMap => Object.entries(holidays).reduce<CalendarHolidayMap>((projected, [dateStr, isHoliday]) => {
    if (!dateStr.startsWith(String(sourceYear)) || !/^\d{8}$/.test(dateStr)) return projected;

    const sourceDate = dayjs(`${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`);
    if (!sourceDate.isValid() || sourceDate.format('YYYYMMDD') !== dateStr) return projected;

    const dayOfWeek = sourceDate.day();
    const isStandardWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    if (isHoliday !== isStandardWeekend) {
        projected[`${targetYear}${dateStr.slice(4)}`] = isHoliday;
    }

    return projected;
}, {});

export const useCalendarStore = create<CalendarState>((set, get) => ({
    holidays: {},
    loadedYears: [],
    
    fetchYears: async (years: number[]) => {
        const { loadedYears, holidays } = get();
        const currentYear = dayjs().year();
        const requestedYears = [...new Set(years.filter(Number.isInteger))];
        const yearsToResolve = new Set(
            requestedYears.filter(year => !loadedYears.includes(year)),
        );

        // 若直接要求未來年度，先補齊今年到目標年度之間的預估基準。
        requestedYears.forEach(year => {
            if (year <= currentYear) return;
            for (let sourceYear = currentYear; sourceYear < year; sourceYear += 1) {
                if (!loadedYears.includes(sourceYear)) yearsToResolve.add(sourceYear);
            }
        });

        if (yearsToResolve.size === 0) return;

        const newHolidays = { ...holidays };
        const resolvedYears = new Set(loadedYears);

        const applyFallback = (year: number, expectedFutureProjection: boolean) => {
            const sourceYear = year - 1;
            const projected = projectCalendarYearFromPrevious(newHolidays, sourceYear, year);
            if (Object.keys(projected).length === 0) {
                console.warn(`[Calendar] ${year} 年無官方資料，且缺少 ${sourceYear} 年基準；暫以週休二日估算。`);
                return false;
            }

            Object.assign(newHolidays, projected);
            if (expectedFutureProjection) {
                console.info(`[Calendar] ${year} 年官方資料尚未提供，先以 ${sourceYear} 年行事曆預估。`);
            } else {
                console.warn(`[Calendar] ${year} 年官方資料讀取失敗，先以 ${sourceYear} 年行事曆預估。`);
            }
            return true;
        };

        // 必須依年度循序處理，確保下一年度投影時，前一年度資料已經可用。
        for (const year of [...yearsToResolve].sort((left, right) => left - right)) {
            if (resolvedYears.has(year)) continue;

            try {
                // 使用 ruyut/TaiwanCalendar 的 CDN 資料
                const res = await fetch(`https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/${year}.json`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                const data: CalendarDay[] = await res.json();
                if (!Array.isArray(data) || data.length === 0) {
                    throw new Error('Calendar payload is empty');
                }
                data.forEach(day => {
                    newHolidays[day.date] = day.isHoliday;
                });
                resolvedYears.add(year);
            } catch {
                if (applyFallback(year, year > currentYear)) resolvedYears.add(year);
            }
        }

        set(state => ({
            holidays: { ...state.holidays, ...newHolidays },
            loadedYears: [...new Set([...state.loadedYears, ...resolvedYears])],
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
