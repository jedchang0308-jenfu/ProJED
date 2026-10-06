export interface TaskDetailsModalSize {
  width: number;
  height: number;
}

export interface TaskDetailsModalViewport {
  width: number;
  height: number;
}

export const TASK_DETAILS_MODAL_MAX_DESKTOP_WIDTH = 1280;

const WIDTH_VIEWPORT_RATIO = 0.94;
const HEIGHT_VIEWPORT_RATIO = 0.9;
const DEFAULT_WIDTH_RATIO = 0.78;
const DEFAULT_HEIGHT_RATIO = 0.84;
const MIN_DESKTOP_WIDTH = 1040;
const MIN_DESKTOP_HEIGHT = 680;

export const getTaskDetailsModalMaximumSize = (
  viewport: TaskDetailsModalViewport,
): TaskDetailsModalSize => ({
  width: Math.min(viewport.width * WIDTH_VIEWPORT_RATIO, TASK_DETAILS_MODAL_MAX_DESKTOP_WIDTH),
  height: viewport.height * HEIGHT_VIEWPORT_RATIO,
});

export const getTaskDetailsModalMinimumSize = (
  viewport: TaskDetailsModalViewport,
): TaskDetailsModalSize => {
  const maximum = getTaskDetailsModalMaximumSize(viewport);
  return {
    width: Math.min(MIN_DESKTOP_WIDTH, maximum.width),
    height: Math.min(MIN_DESKTOP_HEIGHT, maximum.height),
  };
};

export const getTaskDetailsModalDefaultSize = (
  viewport: TaskDetailsModalViewport,
): TaskDetailsModalSize => {
  const minimum = getTaskDetailsModalMinimumSize(viewport);
  const maximum = getTaskDetailsModalMaximumSize(viewport);
  return {
    width: Math.min(Math.max(viewport.width * DEFAULT_WIDTH_RATIO, minimum.width), maximum.width),
    height: Math.min(Math.max(viewport.height * DEFAULT_HEIGHT_RATIO, minimum.height), maximum.height),
  };
};

export const clampTaskDetailsModalSize = (
  size: TaskDetailsModalSize,
  viewport: TaskDetailsModalViewport,
): TaskDetailsModalSize => {
  const minimum = getTaskDetailsModalMinimumSize(viewport);
  const maximum = getTaskDetailsModalMaximumSize(viewport);
  return {
    width: Math.min(Math.max(size.width, minimum.width), maximum.width),
    height: Math.min(Math.max(size.height, minimum.height), maximum.height),
  };
};
