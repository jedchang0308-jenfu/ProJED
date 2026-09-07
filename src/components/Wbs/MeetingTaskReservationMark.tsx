import React from 'react';

type MeetingTaskReservationMarkProps = {
  value?: number | null;
  className?: string;
};

export const MeetingTaskReservationMark: React.FC<MeetingTaskReservationMarkProps> = ({ value, className = '' }) => {
  if (value === null || value === undefined) return null;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full bg-[#f6cd03] px-1 py-px text-[12px] font-semibold leading-none tabular-nums text-black ${className}`}
      aria-label={`預約數字 ${value}`}
      data-meeting-task-reservation-mark="true"
      data-meeting-task-reservation-value={value}
      data-meeting-task-reservation-token="true"
    >
      {value}
    </span>
  );
};

export default MeetingTaskReservationMark;
