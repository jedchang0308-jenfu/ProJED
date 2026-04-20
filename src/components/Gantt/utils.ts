import dayjs from 'dayjs';

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
    delayed: {
        list: 'bg-status-delayed brightness-75 saturate-150 text-white',
        card: 'bg-white border-2 border-status-delayed text-status-delayed font-extrabold',
        checklist: 'bg-white border border-status-delayed/30 text-status-delayed'
    },
    completed: {
        list: 'bg-status-completed brightness-75 saturate-150 text-white',
        card: 'bg-white border-2 border-status-completed text-status-completed font-extrabold',
        checklist: 'bg-white border border-status-completed/30 text-status-completed'
    },
    unsure: {
        list: 'bg-status-unsure brightness-75 saturate-150 text-white',
        card: 'bg-white border-2 border-status-unsure text-status-unsure font-extrabold',
        checklist: 'bg-white border border-status-unsure/30 text-status-unsure'
    },
    onhold: {
        list: 'bg-status-onhold brightness-75 saturate-150 text-white',
        card: 'bg-white border-2 border-status-onhold text-status-onhold font-extrabold',
        checklist: 'bg-white border border-status-onhold/30 text-status-onhold'
    }
};

export const BAR_HEIGHT = 28;
