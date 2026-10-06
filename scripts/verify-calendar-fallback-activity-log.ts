import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import dayjs from 'dayjs';
import {
  projectCalendarYearFromPrevious,
  useCalendarStore,
} from '../src/store/useCalendarStore';
import { persistTaskCreationBeforeActivity } from '../src/utils/taskCreationPersistence';

const findDate = (year: number, isWeekend: boolean) => {
  let date = dayjs(`${year}-01-01`);
  while ((date.day() === 0 || date.day() === 6) !== isWeekend) {
    date = date.add(1, 'day');
  }
  return date;
};

const verifyCalendarProjection = async () => {
  const currentYear = dayjs().year();
  const targetYear = currentYear + 1;
  const weekdayHoliday = findDate(currentYear, false);
  const weekendWorkingDay = findDate(currentYear, true);
  const sourceData = [
    {
      date: weekdayHoliday.format('YYYYMMDD'),
      week: String(weekdayHoliday.day()),
      isHoliday: true,
      description: '測試平日假日',
    },
    {
      date: weekendWorkingDay.format('YYYYMMDD'),
      week: String(weekendWorkingDay.day()),
      isHoliday: false,
      description: '測試週末補班',
    },
  ];
  const fetchedYears: number[] = [];
  const infoMessages: string[] = [];
  const warningMessages: string[] = [];
  const originalFetch = globalThis.fetch;
  const originalInfo = console.info;
  const originalWarn = console.warn;

  globalThis.fetch = (async (input: string | URL | Request) => {
    const match = String(input).match(/\/(\d{4})\.json$/);
    assert.ok(match, `unexpected calendar URL: ${String(input)}`);
    const fetchedYear = Number(match[1]);
    fetchedYears.push(fetchedYear);
    if (fetchedYear === targetYear) {
      return new Response(null, { status: 404 });
    }
    return new Response(JSON.stringify(sourceData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  console.info = (...args: unknown[]) => infoMessages.push(args.join(' '));
  console.warn = (...args: unknown[]) => warningMessages.push(args.join(' '));

  try {
    useCalendarStore.setState({ holidays: {}, loadedYears: [] });
    await useCalendarStore.getState().fetchYears([targetYear]);

    const state = useCalendarStore.getState();
    const projectedWeekdayHoliday = `${targetYear}${weekdayHoliday.format('MMDD')}`;
    const projectedWeekendWorkingDay = `${targetYear}${weekendWorkingDay.format('MMDD')}`;

    assert.deepEqual(
      fetchedYears,
      [currentYear, targetYear],
      'future-year request must load the current-year baseline before trying the official target year',
    );
    assert.equal(state.holidays[projectedWeekdayHoliday], true, 'weekday holiday should be projected');
    assert.equal(state.holidays[projectedWeekendWorkingDay], false, 'weekend working day should be projected');
    assert.ok(state.loadedYears.includes(currentYear), 'current-year baseline should be marked as loaded');
    assert.ok(state.loadedYears.includes(targetYear), 'projected future year should be marked as loaded');
    assert.ok(infoMessages.some(message => message.includes(`${targetYear} 年官方資料尚未提供`)));
    assert.equal(warningMessages.length, 0, 'expected future projection must not be reported as a warning');

    const directProjection = projectCalendarYearFromPrevious(
      {
        [weekdayHoliday.format('YYYYMMDD')]: true,
        [weekendWorkingDay.format('YYYYMMDD')]: false,
      },
      currentYear,
      targetYear,
    );
    assert.deepEqual(directProjection, {
      [projectedWeekdayHoliday]: true,
      [projectedWeekendWorkingDay]: false,
    });
  } finally {
    globalThis.fetch = originalFetch;
    console.info = originalInfo;
    console.warn = originalWarn;
    useCalendarStore.setState({ holidays: {}, loadedYears: [] });
  }
};

const verifyActivityPersistenceOrder = async () => {
  const sequence: string[] = [];
  let releasePersistence: (() => void) | undefined;
  const persistenceGate = new Promise<void>(resolve => {
    releasePersistence = resolve;
  });

  const execution = persistTaskCreationBeforeActivity(
    async () => {
      sequence.push('persist:start');
      await persistenceGate;
      sequence.push('persist:done');
    },
    () => {
      sequence.push('activity');
    },
  );

  await Promise.resolve();
  assert.deepEqual(sequence, ['persist:start'], 'activity must wait until task persistence completes');
  assert.ok(releasePersistence);
  releasePersistence();
  await execution;
  assert.deepEqual(sequence, ['persist:start', 'persist:done', 'activity']);

  let loggedAfterFailure = false;
  await assert.rejects(
    persistTaskCreationBeforeActivity(
      async () => { throw new Error('persistence failed'); },
      () => { loggedAfterFailure = true; },
    ),
    /persistence failed/,
  );
  assert.equal(loggedAfterFailure, false, 'failed persistence must not create an orphan activity entry');

  const storePath = fileURLToPath(new URL('../src/store/useWbsStore.ts', import.meta.url));
  const storeSource = await readFile(storePath, 'utf8');
  assert.match(storeSource, /persistTaskCreationBeforeActivity\s*\(/);
  assert.doesNotMatch(
    storeSource,
    /nodeService\.create\([^;]+\.catch\(console\.error\);\s*\n\s*}\s*\n\s*\n\s*if \(!isUnplacedTask\) \{\s*\n\s*logTaskActivity/s,
    'wbs store must not log task creation before persistence resolves',
  );
};

await verifyCalendarProjection();
await verifyActivityPersistenceOrder();

console.log('PASS calendar fallback and task activity persistence regressions');
