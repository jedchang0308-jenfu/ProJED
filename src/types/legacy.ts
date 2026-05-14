import type { TaskStatus } from './index';

/** @deprecated Legacy data shape kept only for import and migration. Use TaskNode instead. */
export interface LegacyChecklistItem {
  id: string;
  title?: string;
  text?: string;
  status?: TaskStatus;
  completed?: boolean;
  startDate?: string;
  endDate?: string;
  isArchived?: boolean;
  archivedAt?: number;
}

/** @deprecated Legacy data shape kept only for import and migration. Use TaskNode instead. */
export interface LegacyChecklist {
  id: string;
  title?: string;
  showCompleted?: boolean;
  items?: LegacyChecklistItem[];
  isArchived?: boolean;
  archivedAt?: number;
}

/** @deprecated Legacy data shape kept only for import and migration. Use TaskNode instead. */
export interface LegacyCard {
  id: string;
  title?: string;
  status?: TaskStatus;
  startDate?: string;
  endDate?: string;
  notes?: string;
  description?: string;
  checklists?: LegacyChecklist[];
  ganttVisible?: boolean;
  listId?: string;
  order?: number;
  createdAt?: number;
  isArchived?: boolean;
  archivedAt?: number;
}

/** @deprecated Legacy data shape kept only for import and migration. Use TaskNode instead. */
export interface LegacyList {
  id: string;
  title?: string;
  status?: TaskStatus;
  startDate?: string;
  endDate?: string;
  cards?: LegacyCard[];
  ganttVisible?: boolean;
  order?: number;
  createdAt?: number;
  isArchived?: boolean;
  archivedAt?: number;
}
