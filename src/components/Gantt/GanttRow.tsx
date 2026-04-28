import React from 'react';
import dayjs from 'dayjs';
import { getX, BAR_HEIGHT } from './utils';

interface GroupData {
    start: number;
    end: number;
    id: string;
    level: number;
    startDate?: string | null;
    endDate?: string | null;
}

interface GanttRowProps {
    groups: GroupData[];
    colWidth: number;
    mode: string;
    gridStart: dayjs.Dayjs;
}

const GanttRow: React.FC<GanttRowProps> = ({ groups, colWidth, mode, gridStart }) => {
    return (
        <div className="absolute inset-0 pointer-events-none z-0">
            {groups.map(g => {
                const start = g.startDate || g.endDate || dayjs().format('YYYY-MM-DD');
                const end = g.endDate || dayjs(start).add(7, 'day').format('YYYY-MM-DD');
                const x1 = getX(start, colWidth, mode, gridStart);
                const x2 = getX(dayjs(end).add(1, 'day'), colWidth, mode, gridStart);
                
                // Nested layout offset based on level
                const paddingLeftRight = Math.max(20 - g.level * 4, 8); 
                const paddingTopBottom = Math.max(4 - g.level * 2, 0);
                const width = Math.max(x2 - x1, 24) + paddingLeftRight * 2;
                
                // Style differences for alternating depth colors
                const bgColor = g.level === 0 ? 'bg-slate-100/40' : (g.level === 1 ? 'bg-slate-200/30' : 'bg-slate-50/20');
                const borderColor = g.level === 0 ? 'border-slate-300/50' : 'border-slate-200/50';

                return (
                    <div
                        key={g.id}
                        className={`absolute rounded-lg border ${bgColor} ${borderColor}`}
                        style={{
                            top: g.start * BAR_HEIGHT + paddingTopBottom,
                            height: (g.end - g.start + 1) * BAR_HEIGHT - (paddingTopBottom * 2),
                            left: x1 - paddingLeftRight,
                            width: width
                        }}
                    />
                );
            })}
        </div>
    );
};

export default GanttRow;

