// Shared by Node and the isolated TEST browser. Never return tokens or email.
export async function inspectTestActor(client, alias, expectedEmail, accessToken) {
  const actor = { alias, authenticated: false, profile: false, activeMembershipCount: 0, workbenchRowCount: 0, ready: false };
  const fail = reason => ({ actor: { ...actor, reason }, accountId: null });
  try {
    const { data, error } = await client.auth.getUser(accessToken);
    if (error || !data.user?.id) return fail('network-user-verification-failed');
    if (data.user.email?.toLowerCase() !== expectedEmail.toLowerCase()) return fail('unexpected-test-account');
    actor.authenticated = true;
    const accountId = data.user.id;
    const [profile, memberships, workbench] = await Promise.all([
      client.from('profiles').select('id').eq('id', accountId).limit(1),
      client.from('tenant_members').select('tenant_id').eq('user_id', accountId).eq('status', 'active'),
      client.from('task_workbench_unplaced_items').select('id').eq('owner_id', accountId).limit(1),
    ]);
    if (profile.error || memberships.error || workbench.error) return fail('ordinary-session-readback-failed');
    actor.profile = Boolean(profile.data?.length);
    actor.activeMembershipCount = memberships.data?.length ?? 0;
    actor.workbenchRowCount = workbench.data?.length ?? 0;
    const latest = await client.auth.getSession();
    if (latest.error || latest.data.session?.user?.id !== accountId
      || latest.data.session?.access_token !== accessToken) return fail('session-changed-during-readback');
    actor.ready = actor.profile && actor.activeMembershipCount > 0 && actor.workbenchRowCount > 0;
    if (!actor.ready) actor.reason = 'test-fixture-incomplete';
    return { actor, accountId };
  } catch { return fail('ordinary-session-probe-failed'); }
}
