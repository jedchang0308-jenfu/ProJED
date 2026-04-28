import React from 'react';
import dayjs from 'dayjs';
import { getX } from './utils';

interface GanttHeaderProps {
    mode: string;
    gridStart: dayjs.Dayjs;
    totalUnits: number;
    colWidth: number;
}

export const GanttHeader: React.FC<GanttHeaderProps> = ({ mode, gridStart, totalUnits, colWidth }) => {
    const renderHeader = () => {
        const headerItems = [];
        const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

        for (let i = 0; i < totalUnits; i++) {
            let label = "";
            let subLabel = "";
            if (mode === 'Day') {
                const d = gridStart.add(i, 'day');
                label = d.format('M/D');
                subLabel = weekDays[d.day()];
            } else if (mode === 'Month') {
                const d = gridStart.add(i, 'month');
                label = d.format('YYYY');
                subLabel = d.format('M月');
            } else if (mode === 'Quarter') {
                const d = gridStart.add(i * 3, 'month');
                label = d.format('YYYY');
                subLabel = `Q${Math.floor(d.month() / 3) + 1}`;
            } else {
                const d = gridStart.add(i, 'year');
                label = d.format('YYYY');
            }

            headerItems.push(
                <div key={i} className="flex-shrink-0 border-r border-slate-700 flex flex-col items-center justify-center bg-slate-800" style={{ width: colWidth }}>
                    <span className="text-[10px] font-bold text-slate-200">{label}</span>
                    <span className="text-xs font-bold text-slate-100">{subLabel}</span>
                </div>
            );
        }
        return headerItems;
    };

    return (
        <div className="sticky top-0 flex h-10 bg-slate-800 border-b-2 border-slate-900" style={{ zIndex: 100 }}>
            {renderHeader()}
        </div>
    );
};

export const GanttGrid: React.FC<GanttHeaderProps> = ({ mode, gridStart, totalUnits, colWidth }) => {
    const renderGrid = () => {
        const gridElements = [];
        let unitDuration: dayjs.ManipulateType = 'month';
        if (mode === 'Day') unitDuration = 'day';
        else if (mode === 'Year') unitDuration = 'year';
        else if (mode === 'Quarter') unitDuration = ('quarter' as any);

        const endDate = gridStart.add(totalUnits, unitDuration).endOf('day');

        for (let i = 0; i < totalUnits; i++) {
            let minorLines = null;
            if (mode === 'Month') {
                const startOfMonth = gridStart.add(i, 'month');
                let curr = startOfMonth;
                let monthLines = [];
                while (curr.month() === startOfMonth.month()) {
                    if (curr.day() === 1 && curr.date() > 1) { 
                        const fraction = (curr.date() - 1) / startOfMonth.daysInMonth();
                        monthLines.push(
                            <div key={`ml-${curr.date()}`} className="absolute top-0 bottom-0 border-r border-slate-50 border-dashed" style={{ left: `${fraction * 100}%` }} />
                        );
                    }
                    curr = curr.add(1, 'day');
                }
                minorLines = <div className="absolute inset-0 pointer-events-none">{monthLines}</div>;
            } else if (mode === 'Quarter') {
                const startOfQ = gridStart.add(i * 3, 'month');
                minorLines = (
                    <div className="absolute inset-0 pointer-events-none">
                        {[1, 2].map(mOffset => {
                            const mDate = startOfQ.add(mOffset, 'month');
                            const qX = getX(startOfQ, colWidth, mode, gridStart);
                            const mX = getX(mDate, colWidth, mode, gridStart);
                            const fraction = (mX - qX) / colWidth;
                            return <div key={`mq-${mOffset}`} className="absolute top-0 bottom-0 border-r border-slate-50" style={{ left: `${fraction * 100}%` }} />;
                        })}
                    </div>
                );
            } else if (mode === 'Year') {
                const startOfYear = gridStart.add(i, 'year');
                minorLines = (
                    <div className="absolute inset-0 pointer-events-none">
                        {[3, 6, 9].map(mOffset => {
                            const qDate = startOfYear.add(mOffset, 'month');
                            const yX = getX(startOfYear, colWidth, mode, gridStart);
                            const qX = getX(qDate, colWidth, mode, gridStart);
                            const fraction = (qX - yX) / colWidth;
                            return <div key={`my-${mOffset}`} className="absolute top-0 bottom-0 border-r border-slate-100/50" style={{ left: `${fraction * 100}%` }} />;
                        })}
                    </div>
                );
            }

            gridElements.push(
                <div
                    key={`grid-line-${i}`}
                    className="absolute top-0 bottom-0 border-r border-slate-100"
                    style={{ left: i * colWidth, width: colWidth }}
                >
                    {minorLines}
                </div>
            );
        }

        if (mode === 'Month' || mode === 'Day') {
            let currentDay = gridStart.startOf('day');
            while (currentDay.isBefore(endDate)) {
                const dayOfWeek = currentDay.day(); 
                if (dayOfWeek === 0 || dayOfWeek === 6) { 
                    gridElements.push(
                        <div
                            key={`weekend-${currentDay.format('YYYY-MM-DD')}`}
                            className="absolute top-0 bottom-0 bg-slate-50/50"
                            style={{
                                left: getX(currentDay, colWidth, mode, gridStart),
                                width: getX(currentDay.add(1, 'day'), colWidth, mode, gridStart) - getX(currentDay, colWidth, mode, gridStart)
                            }}
                        />
                    );
                }
                currentDay = currentDay.add(1, 'day');
            }
        }

        return gridElements;
    };

    return (
        <>
            <div className="absolute inset-0 pointer-events-none" style={{ backgroundSize: `${colWidth}px 100%`, backgroundImage: 'linear-gradient(to right, #f1f5f9 1px, transparent 1px)' }}></div>
            {renderGrid()}
            
            {/* Now Line */}
            <div
                className="absolute top-0 bottom-0 w-px bg-red-400/50 z-10 pointer-events-none"
                style={{ left: getX(dayjs(), colWidth, mode, gridStart) }}
            >
                <div className="sticky top-[42px] bg-red-500 text-white text-[9px] font-black w-5 h-5 flex items-center justify-center rounded-full transform -translate-x-1/2 shadow-sm border border-white">今</div>
            </div>
        </>
    );
};

export default GanttHeader; // keep for backward compat
