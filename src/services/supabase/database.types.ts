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
export type DocumentSourceType =
  | 'wbs_item'
  | 'task'
  | 'project_note'
  | 'meeting_note'
  | 'risk'
  | 'decision'
  | 'uploaded_file'
  | 'comment'
  | 'manual';
export type RagVisibility = 'tenant' | 'project' | 'private';
export type RagSyncStatus = 'pending' | 'running' | 'synced' | 'failed' | 'deleted';

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

export interface Database {
  public: {
    Tables: {
      profiles: Table<ProfileRow>;
      tenants: Table<TenantRow>;
      tenant_members: Table<TenantMemberRow>;
      projects: Table<ProjectRow>;
      wbs_items: Table<WbsItemRow>;
      wbs_dependencies: Table<WbsDependencyRow>;
      documents: Table<DocumentRow>;
      document_versions: Table<DocumentVersionRow>;
      document_chunks: Table<DocumentChunkRow>;
      document_embeddings: Table<DocumentEmbeddingRow>;
      rag_sync_jobs: Table<RagSyncJobRow>;
      external_rag_objects: Table<ExternalRagObjectRow>;
    };
    Views: Record<string, never>;
    Functions: {
      create_tenant_with_owner: {
        Args: { tenant_name: string };
        Returns: TenantRow;
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
    };
    Enums: {
      tenant_role: TenantRole;
      member_status: MemberStatus;
      task_status: TaskStatus;
      wbs_item_type: WbsItemType;
      dependency_side: DependencySide;
      document_source_type: DocumentSourceType;
      rag_visibility: RagVisibility;
      rag_sync_status: RagSyncStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
