import { isSupabaseConfigured, supabase } from './client';
import type { Json } from './database.types';

type DiagnosticStatus = 'pass' | 'fail';

type DiagnosticSession = {
  ok: boolean;
  configured: boolean;
  authenticated: boolean;
  user?: {
    id: string;
    email: string | null;
    expiresAt: number | null;
  };
};

type BrowserSmokeResult = {
  ok: boolean;
  smokeId: string;
  userId: string;
  tenantId: string;
  projectId: string;
  parentItemId: string;
  childItemId: string;
  dependencyId: string;
  readableItemCount: number;
  cleanupRequired: true;
};

type BrowserSmokeSummary = {
  status: DiagnosticStatus;
  message: string;
  result?: BrowserSmokeResult;
};

declare global {
  interface Window {
    ProJEDSupabaseDiagnostics?: {
      session: () => Promise<DiagnosticSession>;
      runSmoke: () => Promise<BrowserSmokeSummary>;
    };
  }
}

const diagnosticsEnabled = () =>
  import.meta.env.VITE_ENABLE_SUPABASE_DIAGNOSTICS === 'true';

const assertNoError = (label: string, error: { message: string } | null) => {
  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }
};

const smokeMetadata = (smokeId: string, userId: string): Json => ({
  p8_browser_oauth_e2e: true,
  smoke_id: smokeId,
  executed_at: new Date().toISOString(),
  user_id: userId,
});

const getSession = async () => {
  const { data, error } = await supabase.auth.getSession();
  assertNoError('auth.getSession', error);
  return data.session;
};

const readSession = async (): Promise<DiagnosticSession> => {
  if (!isSupabaseConfigured) {
    return { ok: false, configured: false, authenticated: false };
  }

  const session = await getSession();
  return {
    ok: Boolean(session?.user),
    configured: true,
    authenticated: Boolean(session?.user),
    user: session?.user
      ? {
          id: session.user.id,
          email: session.user.email ?? null,
          expiresAt: session.expires_at ?? null,
        }
      : undefined,
  };
};

const runSmoke = async (): Promise<BrowserSmokeSummary> => {
  if (!isSupabaseConfigured) {
    return {
      status: 'fail',
      message: 'Supabase is not configured for this browser build.',
    };
  }

  const session = await getSession();
  if (!session?.user) {
    return {
      status: 'fail',
      message: 'No authenticated Supabase session. Complete Google OAuth first.',
    };
  }

  const user = session.user;
  const smokeId = `p8-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const metadata = smokeMetadata(smokeId, user.id);

  try {
    const { error: profileError } = await supabase.from('profiles').upsert(
      {
        id: user.id,
        email: user.email ?? null,
      },
      { onConflict: 'id' }
    );
    assertNoError('profile upsert', profileError);

    const { data: tenant, error: tenantError } = await supabase.rpc('create_tenant_with_owner', {
      tenant_name: `P8 Browser OAuth Smoke ${smokeId}`,
    });
    assertNoError('create_tenant_with_owner', tenantError);
    if (!tenant) {
      throw new Error('create_tenant_with_owner returned no tenant.');
    }

    const { error: tenantMetadataError } = await supabase
      .from('tenants')
      .update({ metadata })
      .eq('id', tenant.id);
    assertNoError('tenant metadata update', tenantMetadataError);

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({
        tenant_id: tenant.id,
        name: `P8 Browser Smoke Board ${smokeId}`,
        sort_order: Date.now(),
        metadata,
      })
      .select()
      .single();
    assertNoError('project insert', projectError);
    if (!project) {
      throw new Error('project insert returned no project.');
    }

    const { data: parentItem, error: parentError } = await supabase
      .from('wbs_items')
      .insert({
        tenant_id: tenant.id,
        project_id: project.id,
        title: 'P8 Browser Parent',
        status: 'todo',
        item_type: 'group',
        sort_order: 1,
        metadata,
      })
      .select()
      .single();
    assertNoError('parent WBS insert', parentError);
    if (!parentItem) {
      throw new Error('parent WBS insert returned no item.');
    }

    const { data: childItem, error: childError } = await supabase
      .from('wbs_items')
      .insert({
        tenant_id: tenant.id,
        project_id: project.id,
        parent_id: parentItem.id,
        title: 'P8 Browser Child',
        status: 'in_progress',
        item_type: 'task',
        sort_order: 2,
        metadata,
      })
      .select()
      .single();
    assertNoError('child WBS insert', childError);
    if (!childItem) {
      throw new Error('child WBS insert returned no item.');
    }

    const { data: dependency, error: dependencyError } = await supabase
      .from('wbs_dependencies')
      .insert({
        tenant_id: tenant.id,
        project_id: project.id,
        from_item_id: parentItem.id,
        from_side: 'end',
        to_item_id: childItem.id,
        to_side: 'start',
        offset_days: 0,
      })
      .select()
      .single();
    assertNoError('dependency insert', dependencyError);
    if (!dependency) {
      throw new Error('dependency insert returned no dependency.');
    }

    const { data: readableItems, error: readableItemsError } = await supabase
      .from('wbs_items')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('project_id', project.id);
    assertNoError('WBS readback', readableItemsError);

    return {
      status: 'pass',
      message: 'Browser OAuth smoke completed. Run the P8 cleanup script with service role credentials.',
      result: {
        ok: true,
        smokeId,
        userId: user.id,
        tenantId: tenant.id,
        projectId: project.id,
        parentItemId: parentItem.id,
        childItemId: childItem.id,
        dependencyId: dependency.id,
        readableItemCount: readableItems?.length ?? 0,
        cleanupRequired: true,
      },
    };
  } catch (error) {
    return {
      status: 'fail',
      message: error instanceof Error ? error.message : String(error),
    };
  }
};

export const installSupabaseBrowserDiagnostics = () => {
  if (!diagnosticsEnabled()) {
    return;
  }

  window.ProJEDSupabaseDiagnostics = {
    session: readSession,
    runSmoke,
  };

  console.info('[ProJED] Supabase browser diagnostics enabled.');
};
