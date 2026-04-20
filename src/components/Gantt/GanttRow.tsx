import React from 'react';
import dayjs from 'dayjs';
import { getX, BAR_HEIGHT } from './utils';

interface GroupData {
    start: number;
    end: number;
    id: string;
    startDate?: string | null;
    endDate?: string | null;
}

interface GanttRowProps {
    groups: {
        lists: GroupData[];
        cards: GroupData[];
    };
    colWidth: number;
    mode: string;
    gridStart: dayjs.Dayjs;
}

const GanttRow: React.FC<GanttRowProps> = ({ groups, colWidth, mode, gridStart }) => {
    return (
        <div className="absolute inset-0 pointer-events-none z-0">
            {groups.lists.map(lg => {
                const start = lg.startDate || lg.endDate || dayjs().format('YYYY-MM-DD');
                const end = lg.endDate || dayjs(start).add(7, 'day').format('YYYY-MM-DD');
                const x1 = getX(start, colWidth, mode, gridStart);
                const x2 = getX(dayjs(end).add(1, 'day'), colWidth, mode, gridStart);
                const width = Math.max(x2 - x1, 24) + 20; // Extra padding

                return (
                    <div
                        key={lg.id}
                        className="absolute bg-slate-100/40 rounded-lg border border-slate-300/50"
                        style={{
                            top: lg.start * BAR_HEIGHT + 2,
                            height: (lg.end - lg.start + 1) * BAR_HEIGHT - 4,
                            left: x1 - 10,
                            width: width
                        }}
                    />
                );
            })}
            {groups.cards.map(cg => {
                const start = cg.startDate || cg.endDate || dayjs().format('YYYY-MM-DD');
                const end = cg.endDate || dayjs(start).add(7, 'day').format('YYYY-MM-DD');
                const x1 = getX(start, colWidth, mode, gridStart);
                const x2 = getX(dayjs(end).add(1, 'day'), colWidth, mode, gridStart);
                const width = Math.max(x2 - x1, 24) + 12; // Extra padding

                return (
                    <div
                        key={cg.id}
                        className="absolute bg-slate-200/30 rounded-lg border border-slate-200/50"
                        style={{
                            top: cg.start * BAR_HEIGHT + 4,
                            height: (cg.end - cg.start + 1) * BAR_HEIGHT - 8,
                            left: x1 - 6,
                            width: width
                        }}
                    />
                );
            })}
        </div>
    );
};

export default GanttRow;
