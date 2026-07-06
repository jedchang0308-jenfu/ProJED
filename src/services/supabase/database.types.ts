import type { TaskFilterState } from '../../features/taskFilters';

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type TenantRole = 'owner' | 'admin' | 'project_manager' | 'member' | 'viewer';
export type MemberStatus = 'active' | 'invited' | 'suspended';
export type TaskStatus = 'todo' | 'in_progress' | 'delayed' | 'completed' | 'unsure' | 'onhold';
export type WbsItemType = 'group' | 'milestone' | 'task';
export type DependencySide = 'start' | 'end';
export type BoardInviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';
export type DocumentSourceType =
  | 'wbs_item'
  | 'task'
  | 'project_note'
  | 'meeting_note'
  | 'work_log'
  | 'risk'
  | 'decision'
  | 'uploaded_file'
  | 'comment'
  | 'manual';
export type RagVisibility = 'tenant' | 'project' | 'private';
export type RagSyncStatus = 'pending' | 'running' | 'synced' | 'failed' | 'deleted';
export type KnowledgeRecordType = 'meeting' | 'work_log';
export type KnowledgeRecordStatus = 'draft' | 'published' | 'archived';
export type RecordTaskLinkRole = 'main' | 'related' | 'decision' | 'blocker' | 'follow_up';
export type CalendarSubscriptionDateType = 'start_date' | 'due_date';
export type CalendarSubscriptionScopeType = 'board' | 'workspace' | 'custom';
export type CalendarSubscriptionV2ScopeType = 'all_accessible_boards_snapshot';
export type CalendarSubscriptionAssigneeFilter =
  | { type: 'me' }
  | { type: 'user'; user_id: string }
  | { type: 'selected'; user_ids: string[]; include_unassigned?: boolean };
export type CalendarSubscriptionBoardFilterOverride = Partial<TaskFilterState> & {
  enabled?: boolean;
};
export type CalendarSubscriptionFilters = {
  version?: 1 | 2;
  workspace_ids: string[];
  project_ids?: string[];
  scope_type?: CalendarSubscriptionScopeType;
  assignee: CalendarSubscriptionAssigneeFilter;
  date_types: CalendarSubscriptionDateType[];
  v2_scope_type?: CalendarSubscriptionV2ScopeType;
  global_filter?: TaskFilterState;
  board_overrides?: Record<string, CalendarSubscriptionBoardFilterOverride>;
};

type Table<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  external_auth_provider: string | null;
  external_auth_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TenantRow = {
  id: string;
  name: string;
  legacy_workspace_id: string | null;
  owner_id: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type TenantMemberRow = {
  tenant_id: string;
  user_id: string;
  role: TenantRole;
  status: MemberStatus;
  created_at: string;
  updated_at: string;
};

export type ProjectRow = {
  id: string;
  tenant_id: string;
  name: string;
  legacy_board_id: string | null;
  sort_order: number;
  metadata: Json;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectMemberRow = {
  project_id: string;
  tenant_id: string;
  user_id: string;
  role: TenantRole;
  created_at: string;
  updated_at: string;
};

export type BoardRolePermissionRow = {
  tenant_id: string;
  project_id: string;
  role: TenantRole;
  capabilities: string[];
  created_at: string;
  updated_at: string;
};

export type BoardInviteRow = {
  id: string;
  tenant_id: string;
  project_id: string;
  email: string;
  invited_by: string | null;
  status: BoardInviteStatus;
  default_role: TenantRole;
  token_hash: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WbsItemRow = {
  id: string;
  tenant_id: string;
  project_id: string;
  parent_id: string | null;
  legacy_node_id: string | null;
  code: string | null;
  title: string;
  description: string | null;
  detail_notes: Json;
  status: TaskStatus;
  assignee_id: string | null;
  collaborator_ids: string[];
  start_date: string | null;
  end_date: string | null;
  is_duration_locked: boolean;
  item_type: WbsItemType;
  kanban_stage_id: string | null;
  sort_order: number;
  depth: number;
  path: string[];
  is_archived: boolean;
  metadata: Json;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskTagRow = {
  id: string;
  tenant_id: string;
  legacy_tag_id: string | null;
  name: string;
  color: string;
  sort_order: number;
  metadata: Json;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type WbsItemTagRow = {
  tenant_id: string;
  project_id: string;
  item_id: string;
  tag_id: string;
  created_at: string;
};

export type WbsDependencyRow = {
  id: string;
  tenant_id: string;
  project_id: string;
  from_item_id: string;
  from_side: DependencySide;
  to_item_id: string;
  to_side: DependencySide;
  offset_days: number;
  legacy_dependency_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ActivityEventRow = {
  id: string;
  tenant_id: string;
  project_id: string | null;
  actor_id: string | null;
  event_type: string;
  entity_table: string | null;
  entity_id: string | null;
  payload: Json;
  created_at: string;
};

export type AuditLogRow = {
  id: string;
  tenant_id: string | null;
  actor_id: string | null;
  action: string;
  entity_table: string | null;
  entity_id: string | null;
  before_data: Json | null;
  after_data: Json | null;
  created_at: string;
};

export type DocumentRow = {
  id: string;
  tenant_id: string;
  project_id: string | null;
  source_type: DocumentSourceType;
  source_table: string | null;
  source_id: string | null;
  title: string;
  content_hash: string | null;
  visibility: RagVisibility;
  rag_enabled: boolean;
  metadata: Json;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type KnowledgeRecordRow = {
  id: string;
  tenant_id: string;
  project_id: string;
  legacy_record_id: string | null;
  record_type: KnowledgeRecordType;
  title: string;
  content: string;
  participants_text: string | null;
  occurred_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  recorded_by: string | null;
  status: KnowledgeRecordStatus;
  visibility: RagVisibility;
  rag_enabled: boolean;
  source_document_id: string | null;
  metadata: Json;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type RecordTaskLinkRow = {
  id: string;
  tenant_id: string;
  project_id: string;
  record_id: string;
  item_id: string;
  role: RecordTaskLinkRole;
  created_by: string | null;
  created_at: string;
};

export type DocumentVersionRow = {
  id: string;
  tenant_id: string;
  document_id: string;
  version: number;
  content: string;
  content_hash: string;
  metadata: Json;
  created_at: string;
};

export type DocumentChunkRow = {
  id: string;
  tenant_id: string;
  document_id: string;
  document_version_id: string | null;
  chunk_index: number;
  content: string;
  token_count: number | null;
  metadata: Json;
  created_at: string;
};

export type DocumentEmbeddingRow = {
  id: string;
  tenant_id: string;
  chunk_id: string;
  provider: string;
  model: string;
  dimensions: number;
  embedding: string;
  content_hash: string | null;
  created_at: string;
};

export type RagSyncJobRow = {
  id: string;
  tenant_id: string;
  provider: string;
  target_store_id: string | null;
  source_document_id: string | null;
  status: RagSyncStatus;
  last_synced_at: string | null;
  error: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type ExternalRagObjectRow = {
  id: string;
  tenant_id: string;
  provider: string;
  document_id: string;
  external_object_id: string;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type CalendarSubscriptionRow = {
  id: string;
  owner_user_id: string;
  name: string;
  token_hash: string;
  filters_json: Json;
  is_active: boolean;
  expires_at: string | null;
  last_accessed_at: string | null;
  created_at: string;
  updated_at: string;
};

export interface Database {
  public: {
    Tables: {
      profiles: Table<ProfileRow>;
      tenants: Table<TenantRow>;
      tenant_members: Table<TenantMemberRow>;
      projects: Table<ProjectRow>;
      project_members: Table<ProjectMemberRow>;
      board_role_permissions: Table<BoardRolePermissionRow>;
      board_invites: Table<BoardInviteRow>;
      wbs_items: Table<WbsItemRow>;
      task_tags: Table<TaskTagRow>;
      wbs_item_tags: Table<WbsItemTagRow>;
      wbs_dependencies: Table<WbsDependencyRow>;
      activity_events: Table<ActivityEventRow>;
      audit_logs: Table<AuditLogRow>;
      documents: Table<DocumentRow>;
      knowledge_records: Table<KnowledgeRecordRow>;
      record_task_links: Table<RecordTaskLinkRow>;
      document_versions: Table<DocumentVersionRow>;
      document_chunks: Table<DocumentChunkRow>;
      document_embeddings: Table<DocumentEmbeddingRow>;
      rag_sync_jobs: Table<RagSyncJobRow>;
      external_rag_objects: Table<ExternalRagObjectRow>;
      calendar_subscriptions: Table<CalendarSubscriptionRow>;
    };
    Views: Record<string, never>;
    Functions: {
      create_tenant_with_owner: {
        Args: { tenant_name: string };
        Returns: TenantRow;
      };
      delete_workspace: {
        Args: { target_tenant_id: string };
        Returns: void;
      };
      accept_board_invite: {
        Args: { invite_token_hash: string };
        Returns: BoardInviteRow;
      };
      match_project_knowledge: {
        Args: {
          target_tenant_id: string;
          target_project_id: string | null;
          query_embedding: string;
          match_threshold?: number;
          match_count?: number;
        };
        Returns: Array<{
          chunk_id: string;
          document_id: string;
          title: string;
          content: string;
          similarity: number;
          metadata: Json;
        }>;
      };
      calendar_subscription_filter_allowed: {
        Args: { filters: Json };
        Returns: boolean;
      };
      log_activity_event: {
        Args: {
          target_tenant_id: string;
          target_project_id: string | null;
          activity_event_type: string;
          activity_entity_table: string;
          activity_entity_id: string | null;
          activity_payload?: Json;
        };
        Returns: string;
      };
      log_audit_event: {
        Args: {
          target_tenant_id: string;
          target_project_id: string | null;
          audit_action: string;
          audit_entity_table: string;
          audit_entity_id: string | null;
          audit_before_data?: Json | null;
          audit_after_data?: Json | null;
        };
        Returns: string;
      };
    };
    Enums: {
      tenant_role: TenantRole;
      member_status: MemberStatus;
      task_status: TaskStatus;
      wbs_item_type: WbsItemType;
      dependency_side: DependencySide;
      board_invite_status: BoardInviteStatus;
      document_source_type: DocumentSourceType;
      rag_visibility: RagVisibility;
      rag_sync_status: RagSyncStatus;
      knowledge_record_type: KnowledgeRecordType;
      knowledge_record_status: KnowledgeRecordStatus;
      record_task_link_role: RecordTaskLinkRole;
    };
    CompositeTypes: Record<string, never>;
  };
}
