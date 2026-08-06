import dayjs from 'dayjs';
import { COMPACT_DIMENSIONS } from '../ui/compactTokens';

export const getX = (date: dayjs.Dayjs | string | null | undefined, colWidth: number, mode: string, gridStart: dayjs.Dayjs) => {
    if (!date) return 0;
    const d = dayjs(date);
    if (!d.isValid()) return 0;

    if (mode === 'Day') {
        const dDiff = d.diff(gridStart, 'day', true);
        return dDiff * colWidth;
    }

    const totalMonths = d.diff(gridStart, 'month');
    const startOfMonth = gridStart.add(totalMonths, 'month');
    const daysInMonth = startOfMonth.daysInMonth();
    const daysPassed = d.diff(startOfMonth, 'day');

    const mDiff = totalMonths + (daysPassed / daysInMonth);

    if (mode === 'Quarter') return (mDiff / 3) * colWidth;
    if (mode === 'Year') return (mDiff / 12) * colWidth;
    return mDiff * colWidth;
};

export const getDateFromX = (x: number, colWidth: number, mode: string, gridStart: dayjs.Dayjs) => {
    if (mode === 'Day') {
        const days = x / colWidth;
        return gridStart.add(days, 'day').format('YYYY-MM-DD');
    }

    let mDiff = x / colWidth;
    if (mode === 'Quarter') mDiff *= 3;
    if (mode === 'Year') mDiff *= 12;

    const totalMonths = Math.floor(mDiff);
    const fraction = mDiff - totalMonths;

    const startOfMonth = gridStart.add(totalMonths, 'month');
    const daysInMonth = startOfMonth.daysInMonth();
    // Snapping: inherently snaps to nearest integer day
    const daysPassed = Math.round(fraction * daysInMonth);

    return startOfMonth.add(daysPassed, 'day').format('YYYY-MM-DD');
};

export const getColWidth = (mode: string) => {
    if (mode === 'Day') return 60;
    if (mode === 'Quarter') return 250;
    if (mode === 'Year') return 600;
    return 160; // Month
};

export const getDependencyLabel = (index: number) => {
    let label = '';
    let num = index;
    while (num >= 0) {
        label = String.fromCharCode(97 + (num % 26)) + label;
        num = Math.floor(num / 26) - 1;
    }
    return label;
};

// 狀態對應的靜態 Color Map
export const GANTT_COLOR_MAP: Record<string, Record<string, string>> = {
    todo: {
        list: 'bg-status-todo brightness-75 saturate-150 text-white',
        card: 'bg-white border-2 border-status-todo text-status-todo font-extrabold',
        checklist: 'bg-white border border-status-todo/30 text-status-todo'
    },
    in_progress: {
        list: 'bg-blue-500 text-white',
        card: 'bg-blue-50 border-2 border-blue-400 text-blue-700 font-extrabold',
        checklist: 'bg-blue-50 border border-blue-300 text-blue-700'
    },
    delayed: {
        list: 'bg-slate-600 text-white',
        card: 'bg-white border-2 border-slate-500 text-slate-700 font-extrabold',
        checklist: 'bg-white border border-slate-300 text-slate-600'
    },
    completed: {
        list: 'bg-slate-200 text-slate-500',
        card: 'bg-white border-2 border-slate-300 text-slate-400 font-extrabold',
        checklist: 'bg-white border border-slate-200 text-slate-400'
    },
    unsure: {
        list: 'bg-slate-600 text-white',
        card: 'bg-white border-2 border-slate-500 text-slate-700 font-extrabold',
        checklist: 'bg-white border border-slate-300 text-slate-600'
    },
    onhold: {
        list: 'bg-slate-200 text-slate-500',
        card: 'bg-white border-2 border-slate-300 text-slate-400 font-extrabold',
        checklist: 'bg-white border border-slate-200 text-slate-400'
    }
};

export const BAR_HEIGHT = COMPACT_DIMENSIONS.taskRowHeight;
