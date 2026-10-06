import {
  resolveDesktopL1IndicatorRect,
  resolveDesktopL1OrderingTarget,
  type DesktopL1ColumnGeometry,
  type DesktopL1OrderingTarget,
} from './desktopL1DropPolicy';

// A finger covers a wider area than a mouse cursor. Keep the current side of
// a column midpoint until the touch crosses a visibly intentional threshold.
export const MOBILE_L1_MIDPOINT_HYSTERESIS_PX = 24;

export type MobileL1ColumnGeometry = DesktopL1ColumnGeometry;
export type MobileL1OrderingTarget = DesktopL1OrderingTarget;

export const resolveMobileL1OrderingTarget = ({
  pointerX,
  columns,
  previousTarget = null,
}: {
  pointerX: number;
  columns: MobileL1ColumnGeometry[];
  previousTarget?: MobileL1OrderingTarget | null;
}) => resolveDesktopL1OrderingTarget({
  pointerX,
  columns,
  previousTarget,
  hysteresisPx: MOBILE_L1_MIDPOINT_HYSTERESIS_PX,
});

export const resolveMobileL1IndicatorRect = resolveDesktopL1IndicatorRect;
