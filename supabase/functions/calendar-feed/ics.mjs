/* global TextEncoder, URLSearchParams */

export const FEED_TASK_LIMIT = 1000;
export const ICS_LINE_OCTET_LIMIT = 75;

const encoder = new TextEncoder();

export const utf8Length = (value) => encoder.encode(value).length;

export const addDays = (isoDate, days) => {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export const toIcsDate = (isoDate) => isoDate.replaceAll("-", "");

export const foldLine = (line) => {
  if (utf8Length(line) <= ICS_LINE_OCTET_LIMIT) return line;

  const chunks = [];
  let current = "";
  let currentOctets = 0;

  for (const char of Array.from(line)) {
    const charOctets = utf8Length(char);
    const limit = chunks.length === 0 ? ICS_LINE_OCTET_LIMIT : ICS_LINE_OCTET_LIMIT - 1;

    if (current && currentOctets + charOctets > limit) {
      chunks.push(current);
      current = char;
      currentOctets = charOctets;
    } else {
      current += char;
      currentOctets += charOctets;
    }
  }

  if (current) chunks.push(current);
  return chunks.map((chunk, index) => (index === 0 ? chunk : ` ${chunk}`)).join("\r\n");
};

export const escapeIcsText = (value) =>
  value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replace(/\r?\n/g, "\\n");

export const icsLine = (name, value) => foldLine(`${name}:${escapeIcsText(value)}`);

export const rawIcsLine = (name, value) => foldLine(`${name}:${value}`);

export const buildTaskUrl = (item, appBaseUrl) => {
  const baseUrl = appBaseUrl?.replace(/\/+$/, "");
  if (!baseUrl) return "";

  const metadata = item.metadata ?? {};
  const wsId = typeof metadata.firebaseWorkspaceId === "string" ? metadata.firebaseWorkspaceId : item.tenant_id;
  const boardId = typeof metadata.firebaseBoardId === "string" ? metadata.firebaseBoardId : item.project_id;
  const itemId = item.legacy_node_id ?? item.id;
  const params = new URLSearchParams({
    modal: "tasknode",
    wsId,
    boardId,
    itemId,
  });
  return `${baseUrl}/?${params.toString()}`;
};

export const buildDescription = (item, projectName, assigneeLabel, taskUrl) => {
  const lines = [
    item.description ?? "",
    "",
    `看板: ${projectName}`,
    `負責人: ${assigneeLabel}`,
    `狀態: ${item.status}`,
  ].filter((line, index) => index !== 0 || line.trim().length > 0);
  if (taskUrl) lines.push(`ProJED: ${taskUrl}`);
  return lines.join("\n");
};

export const toIcsTimestamp = (date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

export const buildCalendarFeedIcs = ({
  subscription,
  items = [],
  dateTypes = [],
  dateTypesByProjectId = new Map(),
  tenantNameById = new Map(),
  projectNameById = new Map(),
  assigneeProfileById = new Map(),
  assigneeProfile = null,
  assigneeUserId,
  appBaseUrl = "",
  taskLimitReached = false,
  now = new Date(),
}) => {
  const getAssigneeLabel = (item) => {
    if (!item.assignee_id) return "未指派";
    const itemProfile = assigneeProfileById.get(item.assignee_id);
    return itemProfile?.display_name
      || itemProfile?.email
      || (item.assignee_id === assigneeUserId
        ? assigneeProfile?.display_name || assigneeProfile?.email
        : "")
      || item.assignee_id.slice(0, 8);
  };
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ProJED//Custom Calendar Subscription//ZH-TW",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    icsLine("X-WR-CALNAME", subscription.name),
    "X-WR-TIMEZONE:Asia/Taipei",
  ];

  if (taskLimitReached) {
    lines.push(icsLine("X-PROJED-WARNING", `Feed task limit reached: ${FEED_TASK_LIMIT}`));
  }

  const nowStamp = toIcsTimestamp(now);
  for (const item of items) {
    const activeDateTypes = new Set(dateTypesByProjectId.get(item.project_id) ?? dateTypes);
    const workspaceName = tenantNameById.get(item.tenant_id) ?? "ProJED";
    const projectName = projectNameById.get(item.project_id) ?? "";
    const taskUrl = buildTaskUrl(item, appBaseUrl);
    const assigneeLabel = getAssigneeLabel(item);
    const description = buildDescription(item, projectName, assigneeLabel, taskUrl);
    const eventSpecs = [
      activeDateTypes.has("start_date") && item.start_date
        ? { type: "start_date", date: item.start_date, label: "開始" }
        : null,
      activeDateTypes.has("due_date") && item.end_date
        ? { type: "due_date", date: item.end_date, label: "到期" }
        : null,
    ].filter(Boolean);

    for (const eventSpec of eventSpecs) {
      lines.push("BEGIN:VEVENT");
      lines.push(rawIcsLine("UID", `${item.id}-${eventSpec.type}-${subscription.id}@projed`));
      lines.push(rawIcsLine("X-PROJED-TASK-ID", item.id));
      lines.push(rawIcsLine("X-PROJED-BOARD-ID", item.project_id));
      lines.push(rawIcsLine("X-PROJED-DATE-TYPE", eventSpec.type));
      lines.push(`DTSTAMP:${nowStamp}`);
      lines.push(`DTSTART;VALUE=DATE:${toIcsDate(eventSpec.date)}`);
      lines.push(`DTEND;VALUE=DATE:${toIcsDate(addDays(eventSpec.date, 1))}`);
      lines.push(icsLine("SUMMARY", `[${eventSpec.label}] ${workspaceName} - ${item.title}`));
      lines.push(icsLine("DESCRIPTION", description));
      if (taskUrl) lines.push(icsLine("URL", taskUrl));
      lines.push("END:VEVENT");
    }
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
};
