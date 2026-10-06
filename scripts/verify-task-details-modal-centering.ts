import {
  clampTaskDetailsModalSize,
  getTaskDetailsModalDefaultSize,
  getTaskDetailsModalMaximumSize,
  getTaskDetailsModalMinimumSize,
  TASK_DETAILS_MODAL_MAX_DESKTOP_WIDTH,
} from '../src/components/taskDetailsModalSizing';

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const almostEqual = (actual: number, expected: number) => Math.abs(actual - expected) < 0.01;

const wideViewport = { width: 1920, height: 839 };
const wideMaximum = getTaskDetailsModalMaximumSize(wideViewport);
const wideDefault = getTaskDetailsModalDefaultSize(wideViewport);
const clampedLegacySize = clampTaskDetailsModalSize({ width: 1900, height: 900 }, wideViewport);

assert(wideMaximum.width === TASK_DETAILS_MODAL_MAX_DESKTOP_WIDTH, 'wide desktop maximum should stop at 1280px');
assert(wideDefault.width === TASK_DETAILS_MODAL_MAX_DESKTOP_WIDTH, 'wide desktop default should remain centered at the readable maximum');
assert(clampedLegacySize.width === TASK_DETAILS_MODAL_MAX_DESKTOP_WIDTH, 'legacy oversized saved width should be clamped');
assert(almostEqual(clampedLegacySize.height, wideViewport.height * 0.9), 'legacy oversized saved height should stay inside the viewport');

const desktopViewport = { width: 1440, height: 900 };
const desktopDefault = getTaskDetailsModalDefaultSize(desktopViewport);
assert(almostEqual(desktopDefault.width, desktopViewport.width * 0.78), 'standard desktop should keep the 78vw default');
assert(desktopDefault.width <= getTaskDetailsModalMaximumSize(desktopViewport).width, 'desktop default should not exceed its maximum');

const laptopViewport = { width: 1024, height: 768 };
const laptopMinimum = getTaskDetailsModalMinimumSize(laptopViewport);
const laptopMaximum = getTaskDetailsModalMaximumSize(laptopViewport);
assert(almostEqual(laptopMinimum.width, laptopMaximum.width), 'laptop minimum must not win over the viewport maximum');

const phoneViewport = { width: 390, height: 844 };
const phoneMinimum = getTaskDetailsModalMinimumSize(phoneViewport);
const phoneMaximum = getTaskDetailsModalMaximumSize(phoneViewport);
assert(phoneMinimum.width <= phoneMaximum.width, 'phone sizing must remain internally valid before responsive CSS applies');

console.log(JSON.stringify({
  verifier: 'task details modal centering and viewport clamp',
  result: 'PASS',
  checks: 9,
  evidence: {
    wideMaximum,
    wideDefault,
    clampedLegacySize,
    desktopDefault,
    laptopMinimum,
    laptopMaximum,
    phoneMinimum,
    phoneMaximum,
  },
}, null, 2));
