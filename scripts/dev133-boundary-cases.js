/* eslint-disable */
async group => {
  const m = await import('/src/features/quickTaskCapture/model.ts');
  const o = await import('/src/features/quickTaskCapture/outbox.ts');
  const rows = [];
  const check = (name, passed) => rows.push({ case: name, status: passed ? 'PASS' : 'FAIL' });
  const rejected = async action => { try { await action(); return false; } catch { return true; } };
  const waitFor = async predicate => {
    const deadline=Date.now()+5000;
    while(!await predicate()){if(Date.now()>deadline)throw Error('FIXTURE_WAIT_TIMEOUT');await new Promise(resolve=>setTimeout(resolve,5));}
  };
  const make = (accountId = 'actor-a', title = 'boundary fixture') => ({ schemaVersion: 1, captureId: m.createQuickCaptureId(), accountId, title, workspaceHint: null, clientCreatedAt: Date.now(), updatedAt: Date.now(), state: accountId ? 'pending' : 'awaiting_auth', attemptCount: 0, nextAttemptAt: null, lastErrorCode: null, leaseId: null, leaseExpiresAt: null, claimIntent: null });
  const hash = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), b => b.toString(16).padStart(2, '0')).join('');
  const receipt = async r => ({ status: 'committed', captureId: r.captureId, ownerId: r.accountId, titleHash: await hash(r.title), committedAt: Date.now(), created: true });
  const raw = async (action, stores = [m.QUICK_CAPTURE_STORE], mode = 'readwrite') => {
    const db = await new Promise((resolve, reject) => { const q = indexedDB.open(m.QUICK_CAPTURE_DB, 2); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); });
    try { return await new Promise((resolve, reject) => { const tx = db.transaction(stores, mode); action(tx); tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(Error('FIXTURE_TX_ABORT')); }); } finally { db.close(); }
  };
  const context = (accountId = 'actor-a', revision = 1) => ({ key: 'current', projectRef: 'fhisnnufoeulxqrchldf', accountId, displayLabel: 'fixture', verifiedAt: Date.now(), revision, bindingAllowed: Boolean(accountId), barrierAt: null });
  if (group === 'model') {
    const r = make(), valid = await receipt(r);
    check('N03-uuid-and-500-codepoints', /^task_workbench_unplaced_[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(r.captureId) && m.isQuickTitleValid('😀'.repeat(500)) && !m.isQuickTitleValid('😀'.repeat(501)) && m.normalizeQuickTitle('\u200bx\u200b') === '\u200bx\u200b');
    check('N08-receipt-created-required', !m.isQuickCaptureReceipt({ ...valid, created: undefined }, r));
    check('N08-receipt-safe-integer', !m.isQuickCaptureReceipt({ ...valid, committedAt: 1.5 }, r) && !m.isQuickCaptureReceipt({ ...valid, committedAt: Number.MAX_SAFE_INTEGER + 1 }, r));
    check('N04-408-429-retryable', [408, 429, 500, 503].every(status => m.classifyQuickSyncError({ status }) === 'failed_retryable'));
    check('N08-invalid-receipt-permanent', m.classifyQuickSyncError({ code: 'INVALID_RECEIPT' }) === 'failed_permanent' && m.classifyQuickSyncError({ code: '23503' }) === 'failed_permanent');
    check('N05-auth-vs-network', m.classifyQuickSyncError({ status: 401 }) === 'failed_auth' && m.classifyQuickSyncError(new TypeError('Failed to fetch')) === 'failed_retryable');
    check('N08-ACL-denial-is-permanent-not-relogin',m.classifyQuickSyncError({status:403,code:'42501'})==='failed_permanent');
  }
  if (group === 'storage') {
    const r = make(); await o.commitQuickCapture(r);
    check('N03-same-ID-readback-retry', !await rejected(() => o.commitQuickCapture(r)) && (await o.getQuickCapture(r.captureId)).title === r.title);
    check('N03-no-capture-owner-or-title-rewrite', await rejected(() => o.updateQuickCapture(r.captureId, { accountId: 'actor-b' })) && await rejected(() => o.updateQuickCapture(r.captureId, { title: 'changed' })) && (await o.getQuickCapture(r.captureId)).accountId === 'actor-a');
    await o.saveQuickAuthContext(context());
    await o.saveQuickAuthContext({ ...context(null, 2), barrierAt: Date.now() }, 1);
    const raced = make();
    check('N03-logout-context-CAS', await rejected(() => o.commitQuickCapture(raced, { revision: 1, projectRef: context().projectRef, accountId: 'actor-a' })) && !await o.getQuickCapture(raced.captureId));
    const duplicate = make(); await o.commitQuickCapture(duplicate);
    const leases = await Promise.all([o.acquireQuickCaptureLease(duplicate.captureId, 'actor-a'), o.acquireQuickCaptureLease(duplicate.captureId, 'actor-a')]);
    check('N08-two-tab-lease-single-winner', leases.filter(Boolean).length === 1);
    const active = leases.find(Boolean), wrong = { ...await receipt(active), titleHash: '0'.repeat(64) };
    await o.finishQuickCaptureLease(active.captureId, active.leaseId, 'synced', null, 0, wrong);
    check('N08-raw-receipt-hash-gate', (await o.getQuickCapture(active.captureId)).state !== 'synced');
    const delayed = make(); await o.commitQuickCapture(delayed); const first = await o.acquireQuickCaptureLease(delayed.captureId, 'actor-a');
    await raw(tx => tx.objectStore(m.QUICK_CAPTURE_STORE).put({ ...first, leaseExpiresAt: Date.now() - 1 }));
    const second = await o.acquireQuickCaptureLease(delayed.captureId, 'actor-a');
    check('N07-late-old-lease-rejected', await o.finishQuickCaptureLease(first.captureId, first.leaseId, 'synced', null, 0, await receipt(first)) === null && (await o.getQuickCapture(first.captureId)).leaseId === second.leaseId);
    const retry = make(); await o.commitQuickCapture(retry);
    for (let i = 0; i < 8; i++) { const lease = await o.acquireQuickCaptureLease(retry.captureId, 'actor-a'); await o.finishQuickCaptureLease(retry.captureId, lease.leaseId, 'failed_retryable'); if(i < 7) await raw(tx => { const s=tx.objectStore(m.QUICK_CAPTURE_STORE), q=s.get(retry.captureId); q.onsuccess=()=>s.put({...q.result,nextAttemptAt:Date.now()-1}); }); }
    const exhausted = await o.getQuickCapture(retry.captureId);
    check('N04-eight-attempts-stop-and-explicit-retry', exhausted.attemptCount === 8 && exhausted.lastErrorCode === 'AUTO_RETRY_EXHAUSTED' && await o.acquireQuickCaptureLease(retry.captureId, 'actor-a') === null && (await o.retryQuickCapture(retry.captureId, 'actor-a')).attemptCount === 0);
    const good = make(); await o.commitQuickCapture(good); const lease = await o.acquireQuickCaptureLease(good.captureId, good.accountId); const proof = await receipt(good);
    await o.finishQuickCaptureLease(good.captureId, lease.leaseId, 'synced', null, 0, proof);
    const stored = await o.getQuickCapture(good.captureId);
    check('N08-receipt-and-synced-atomic', stored.state === 'synced' && stored.receipt.titleHash === proof.titleHash && !stored.leaseId);
    check('N04-retry-cannot-regress-synced', await o.retryQuickCapture(good.captureId, good.accountId) === null && (await o.getQuickCapture(good.captureId)).state === 'synced');
  }
  if (group === 'claim') {
    await o.saveQuickAuthContext(context());
    const r = make(null); await o.commitQuickCapture(r); await o.putClaimIntent(r.captureId, 'nonce', Date.now()+10000);
    await o.saveQuickAuthContext(context('actor-b', 2), 1);
    check('N06-auth-context-claim-CAS', await o.bindQuickCaptureClaim(r.captureId, 'actor-a', 'nonce', { revision: 1, projectRef: context().projectRef }) === null && (await o.getQuickCapture(r.captureId)).accountId === null);
    const expired = make(null); await o.commitQuickCapture(expired); await o.putClaimIntent(expired.captureId, 'expired', Date.now()-1);
    check('N06-expired-nonce-preserves-record', await o.bindQuickCaptureClaim(expired.captureId, 'actor-b', 'expired', { revision: 2, projectRef: context().projectRef }) === null && (await o.getQuickCapture(expired.captureId)).title === expired.title);
    await o.putClaimIntent(r.captureId, 'valid', Date.now()+10000);
    const claims = await Promise.all([o.bindQuickCaptureClaim(r.captureId, 'actor-b', 'valid', { revision: 2, projectRef: context().projectRef }), o.bindQuickCaptureClaim(r.captureId, 'actor-b', 'valid', { revision: 2, projectRef: context().projectRef })]);
    check('N06-multi-tab-single-claim-and-no-replay', claims.filter(Boolean).length === 1 && await o.bindQuickCaptureClaim(r.captureId, 'actor-b', 'valid', { revision: 2, projectRef: context().projectRef }) === null);
  }
  if (group === 'cleanup') {
    await o.getQuickAuthContext();
    const day = 86400000, now = Date.now();
    const fixtures = [];
    for (const [label, state, days] of [['old-valid','synced',8],['young','synced',6],['legacy','synced',8],['future','synced',-8],['corrupt','synced',8],['unbound','awaiting_auth',40],['pending','pending',40],['failed','failed_permanent',40]]) {
      const r = { ...make(label === 'unbound' ? null : 'actor-a', label), state, updatedAt: now-days*day };
      if(state === 'synced' && label !== 'legacy') r.receipt = await receipt(r);
      if(label === 'corrupt') r.updatedAt = -10;
      fixtures.push(r);
    }
    await raw(tx => fixtures.forEach(r => tx.objectStore(m.QUICK_CAPTURE_STORE).put(r)));
    const removed = await o.removeExpiredQuickCaptures(now);
    check('N09-seven-day-cleanup-only-valid', removed === 1 && !await o.getQuickCapture(fixtures[0].captureId) && (await Promise.all(fixtures.slice(1).map(r=>o.getQuickCapture(r.captureId)))).every(Boolean));
    const race = {...make(),state:'synced',updatedAt:now-8*day}; race.receipt=await receipt(race); await raw(tx=>tx.objectStore(m.QUICK_CAPTURE_STORE).put(race));
    const original = crypto.subtle.digest.bind(crypto.subtle); let changed=false;
    crypto.subtle.digest = async (...args) => { const value=await original(...args); if(!changed){changed=true; await raw(tx=>tx.objectStore(m.QUICK_CAPTURE_STORE).put({...race,title:'concurrent mutation'}));} return value; };
    await o.removeExpiredQuickCaptures(now); crypto.subtle.digest=original;
    check('N09-cleanup-rechecks-whole-record', Boolean(await o.getQuickCapture(race.captureId)));
    const aborted={...make(),state:'synced',updatedAt:now-8*day}; aborted.receipt=await receipt(aborted); await raw(tx=>tx.objectStore(m.QUICK_CAPTURE_STORE).put(aborted));
    const originalDelete=IDBCursor.prototype.delete;
    IDBCursor.prototype.delete=function(){const r=originalDelete.call(this),tx=this.source.transaction;queueMicrotask(()=>tx.abort());return r;};
    const failed=await rejected(()=>o.removeExpiredQuickCaptures(now)); IDBCursor.prototype.delete=originalDelete;
    check('N09-cleanup-abort-keeps-record-and-reopen-retries', failed && Boolean(await o.getQuickCapture(aborted.captureId)) && await o.removeExpiredQuickCaptures(now)===1);
  }
  if (group === 'auth' || group === 'sync') {
    const client=(await import('/src/services/supabase/client.ts')).supabase;
    const a=await import('/src/features/quickTaskCapture/auth.ts');
    const token = sid => 'e30.'+btoa(JSON.stringify({session_id:sid})) + '.fixture';
    let session={ user:{id:'actor-a'}, access_token:token('session-a') }, userError=null;
    client.auth.getSession=async()=>({data:{session},error:null});
    client.auth.getUser=async()=>({data:{user:userError?null:{id:session?.user.id,email:'fixture'}},error:userError});
    client.auth.signOut=async()=>({error:new Error('injected logout failure')});
    client.auth.signInWithOAuth=async()=>({error:null});
    let current=await a.loadQuickSession(); current=(await a.verifyQuickSessionState(current)).snapshot;
    if(group === 'auth') {
      userError={status:401,code:'bad_jwt'};
      check('N05-401-distinguished-from-outage', (await a.verifyQuickSessionState(current)).status === 'unauthenticated' && !await a.getQuickBindingContext());
      userError=null; await a.startQuickGoogleSignIn(location.href); session={user:{id:'actor-a'},access_token:token('new-a')}; current=await a.loadQuickSession(); await a.verifyQuickSessionState(current);
      let resolveLogout; client.auth.signOut=()=>new Promise(resolve=>{resolveLogout=resolve;});
      const loggingOut=a.signOutQuickSession().catch(()=>null); await new Promise(resolve=>setTimeout(resolve,25));
      check('N07-local-epoch-barrier-before-network', a.getQuickAuthSnapshot() === null && !await a.getQuickBindingContext());
      resolveLogout({error:new Error('injected failure')}); await loggingOut;
      const residual=await a.loadQuickSession(); const after=residual?await a.verifyQuickSessionState(residual):{status:'unauthenticated'};
      check('N07-residual-session-cannot-clear-logout', after.status !== 'verified' && !await a.getQuickBindingContext());
      await a.startQuickGoogleSignIn(location.href); session={user:{id:'actor-a'},access_token:token('relogin-a')}; current=await a.loadQuickSession();
      check('N07-fresh-ordinary-login-restores', (await a.verifyQuickSessionState(current)).status === 'verified');
      const savedOwner=make(); await o.commitQuickCapture(savedOwner);
      client.auth.getSession=async()=>({data:{session:null},error:{status:400,code:'refresh_token_not_found'}});
      check('N05-invalid-refresh-clears-binding-preserves-task',await a.loadQuickSession()===null && !await a.getQuickBindingContext() && (await o.getQuickCapture(savedOwner.captureId)).accountId===savedOwner.accountId);
      client.auth.getSession=async()=>({data:{session},error:null});
      await a.startQuickGoogleSignIn(location.href);session={user:{id:'actor-a'},access_token:token('after-refresh-a')};current=await a.loadQuickSession();await a.verifyQuickSessionState(current);
      session=null;
      check('N05-missing-SDK-session-stops-old-binding',await a.loadQuickSession()===null && !await a.getQuickBindingContext());
      await a.startQuickGoogleSignIn(location.href);session={user:{id:'actor-a'},access_token:token('final-check-a')};current=await a.loadQuickSession();await a.verifyQuickSessionState(current);
      let sessionChecks=0;client.auth.getSession=async()=>++sessionChecks===2?{data:{session:null},error:{status:401}}:{data:{session},error:null};
      check('N05-final-refresh-failure-clears-binding',(await a.verifyQuickSessionState(current)).status==='unauthenticated' && !await a.getQuickBindingContext());
      client.auth.getSession=async()=>({data:{session},error:null});
      await a.startQuickGoogleSignIn(location.href);session={user:{id:'actor-a'},access_token:token('restored-final-a')};current=await a.loadQuickSession();await a.verifyQuickSessionState(current);
      session={user:{id:'actor-b'},access_token:token('session-b')}; userError={status:503}; current=await a.loadQuickSession();
      await a.verifyQuickSessionState(current);
      check('N05-switch-before-verification-invalidates-old-binding', !await a.getQuickBindingContext());
      const originalTimer=window.setTimeout;
      window.setTimeout=(fn,ms,...args)=>originalTimer(fn,ms>14000&&ms<=15000?30:ms,...args);
      client.auth.getUser=async()=>{await new Promise(resolve=>originalTimer(resolve,60));return {data:{user:{id:'actor-b',email:'fixture'}},error:null};};
      const timeout=await a.verifyQuickSessionState(current); await new Promise(resolve=>originalTimer(resolve,80)); window.setTimeout=originalTimer;
      check('N05-auth-timeout-discards-late-verification',timeout.status==='unreachable' && !await a.getQuickBindingContext());
      client.auth.getUser=async()=>({data:{user:{id:session?.user.id,email:'fixture'}},error:null});
      await a.startQuickGoogleSignIn(location.href);
      session={user:{id:'actor-a'},access_token:token('race-a')};
      current=await a.loadQuickSession();
      check('N05-race-fixture-restores-actor-a',(await a.verifyQuickSessionState(current)).status==='verified');
      let authHandler=null; client.auth.onAuthStateChange=handler=>{authHandler=handler;return {data:{subscription:{unsubscribe:()=>undefined}}};};
      const delivered=[]; const subscription=await a.subscribeQuickAuth(snapshot=>delivered.push(snapshot?.accountId??null));
      const staleASession={user:{id:'actor-a'},access_token:token('race-a-late')};
      const currentBSession={user:{id:'actor-b'},access_token:token('race-b-current')};
      let resolveStaleA; let reads=0;
      client.auth.getSession=()=>++reads===1?new Promise(resolve=>{resolveStaleA=resolve;}):Promise.resolve({data:{session:currentBSession},error:null});
      authHandler('SIGNED_IN',staleASession);
      await waitFor(()=>reads===1);
      authHandler('SIGNED_IN',currentBSession);
      await waitFor(()=>delivered.includes('actor-b'));
      resolveStaleA({data:{session:staleASession},error:null});
      await new Promise(resolve=>originalTimer(resolve,15));
      const racedContext=await o.getQuickAuthContext();
      check('N05-late-session-a-cannot-replace-b-or-deliver-a',a.getQuickAuthSnapshot()?.accountId==='actor-b'&&delivered.at(-1)==='actor-b'&&!delivered.slice(delivered.lastIndexOf('actor-b')+1).includes('actor-a')&&racedContext.accountId===null&&!racedContext.bindingAllowed&&!await a.getQuickBindingContext());
      session=currentBSession;
      current=await a.loadQuickSession();
      check('N05-race-fixture-verifies-actor-b',(await a.verifyQuickSessionState(current)).status==='verified');
      const boundBeforeLateNull=await o.getQuickAuthContext();
      let resolveStaleNull; reads=0;
      client.auth.getSession=()=>++reads===1?new Promise(resolve=>{resolveStaleNull=resolve;}):Promise.resolve({data:{session:currentBSession},error:null});
      const staleNull=a.loadQuickSession();
      await waitFor(()=>reads===1);
      authHandler('SIGNED_IN',currentBSession);
      await waitFor(()=>reads>=2&&delivered.at(-1)==='actor-b');
      resolveStaleNull({data:{session:null},error:null});
      const staleNullResult=await staleNull;
      await new Promise(resolve=>originalTimer(resolve,15));
      const boundAfterLateNull=await o.getQuickAuthContext();
      check('N05-late-null-cannot-clear-b-binding',staleNullResult?.accountId==='actor-b'&&a.getQuickAuthSnapshot()?.accountId==='actor-b'&&boundAfterLateNull.bindingAllowed&&boundAfterLateNull.accountId==='actor-b'&&boundAfterLateNull.revision===boundBeforeLateNull.revision);
      client.auth.getSession=async()=>({data:{session:{user:{id:'actor-a'},access_token:token('wrong-owner')}},error:null});
      check('N05-binding-requires-current-sdk-session',!await a.getQuickBindingContext());
      client.auth.getSession=async()=>({data:{session:null},error:{status:503}});
      check('N05-network-outage-retains-last-verified-binding',Boolean(await a.getQuickBindingContext()));
      client.auth.getSession=async()=>({data:{session:{user:{id:'actor-a'},access_token:token('wrong-with-error')}},error:{status:503}});
      check('N05-error-with-other-sdk-owner-never-binds-b',!await a.getQuickBindingContext());

      // The old verifier must not process an auth failure after a newer epoch wins.
      for(const lateError of [null,{status:401}]) {
        client.auth.getSession=async()=>({data:{session},error:null});
        current=await a.loadQuickSession();await a.verifyQuickSessionState(current);
        let resolveOldVerify;
        client.auth.getSession=()=>new Promise(resolve=>{resolveOldVerify=resolve;});
        const oldVerification=a.verifyQuickSessionState(current);
        await waitFor(()=>Boolean(resolveOldVerify));
        session={user:{id:'actor-b'},access_token:token('newer-b-'+Boolean(lateError))};
        client.auth.getSession=async()=>({data:{session},error:null});
        authHandler('SIGNED_IN',session);
        await waitFor(()=>a.getQuickSessionLoadState()==='authenticated'&&a.getQuickAuthSnapshot()?.accessToken===session.access_token);
        const newer=await a.verifyQuickSessionState(a.getQuickAuthSnapshot());
        const before=await o.getQuickAuthContext();
        resolveOldVerify({data:{session:null},error:lateError});
        const late=await oldVerification, after=await o.getQuickAuthContext();
        check('N05-stale-verifier-'+(lateError?'401':'null')+'-cannot-stop-new-session',newer.status==='verified'&&late.status==='stale'&&a.getQuickAuthSnapshot()?.accessToken===session.access_token&&after.bindingAllowed&&after.revision===before.revision);
      }

      // Change epoch in the IDB request success event, before the guarded write.
      const nativeGet=IDBObjectStore.prototype.get;
      const nativePut=IDBObjectStore.prototype.put;
      let staleWrites=0, switched=false;
      IDBObjectStore.prototype.put=function(value,...args){if(this.name===m.QUICK_AUTH_CONTEXT_STORE&&value.bindingAllowed)staleWrites++;return nativePut.call(this,value,...args);};
      IDBObjectStore.prototype.get=function(...args){
        const request=nativeGet.apply(this,args);
        if(this.name===m.QUICK_AUTH_CONTEXT_STORE&&this.transaction.mode==='readwrite'&&!switched){
          request.addEventListener('success',()=>{switched=true;session={user:{id:'actor-b'},access_token:token('idb-switch-b')};authHandler('SIGNED_IN',session);});
        }
        return request;
      };
      const staleSave=await a.verifyQuickSessionState(a.getQuickAuthSnapshot());
      IDBObjectStore.prototype.get=nativeGet;IDBObjectStore.prototype.put=nativePut;
      check('N05-context-save-rechecks-epoch-inside-idb',switched&&staleSave.status==='stale'&&staleWrites===0);
      await waitFor(()=>a.getQuickSessionLoadState()==='authenticated');
      await a.verifyQuickSessionState(a.getQuickAuthSnapshot());

      let barrierWrites=0;switched=false;
      IDBObjectStore.prototype.put=function(value,...args){if(this.name===m.QUICK_AUTH_CONTEXT_STORE&&value.barrierAt)barrierWrites++;return nativePut.call(this,value,...args);};
      IDBObjectStore.prototype.get=function(...args){
        const request=nativeGet.apply(this,args);
        if(this.name===m.QUICK_AUTH_CONTEXT_STORE&&this.transaction.mode==='readwrite'&&!switched){
          request.addEventListener('success',()=>{switched=true;session={user:{id:'actor-b'},access_token:token('signed-out-switch-b')};authHandler('SIGNED_IN',session);});
        }
        return request;
      };
      // Explicit new login intent allows the new session after local stop.
      authHandler('SIGNED_OUT',null);
      await a.startQuickGoogleSignIn(location.href);
      await waitFor(()=>switched&&a.getQuickSessionLoadState()==='authenticated');
      IDBObjectStore.prototype.get=nativeGet;IDBObjectStore.prototype.put=nativePut;
      check('N07-stale-signed-out-barrier-cannot-stop-new-session',barrierWrites===0&&(await a.verifyQuickSessionState(a.getQuickAuthSnapshot())).status==='verified');

      const legacyBarrier=await o.getQuickAuthContext();
      await o.saveQuickAuthContext({...legacyBarrier,revision:legacyBarrier.revision+1,accountId:null,bindingAllowed:false,verifiedAt:null,barrierAt:Date.now(),sessionId:null},legacyBarrier.revision);
      await a.startQuickGoogleSignIn(location.href);
      check('N07-legacy-barrier-rejects-residual-session-after-login-intent',await a.loadQuickSession()===null);
      session={user:{id:'actor-b'},access_token:token('legacy-new-login')};
      const freshLegacy=await a.loadQuickSession();
      check('N07-legacy-barrier-allows-distinct-new-login',(await a.verifyQuickSessionState(freshLegacy)).status==='verified');
      client.auth.getSession=async()=>({data:{session:null},error:{status:401}});
      const invalidBinding=await a.getQuickBindingContext(), invalidContext=await o.getQuickAuthContext();
      client.auth.getSession=async()=>({data:{session},error:{status:503}});
      check('N05-helper-401-persists-barrier-before-outage-fallback',!invalidBinding&&Boolean(invalidContext.barrierAt)&&!invalidContext.bindingAllowed&&!await a.getQuickBindingContext());
      client.auth.getSession=async()=>({data:{session},error:null});
      await a.startQuickGoogleSignIn(location.href);session={user:{id:'actor-b'},access_token:token('capture-guard-b')};
      current=await a.loadQuickSession();await a.verifyQuickSessionState(current);
      const captureGuard=make('actor-b','guarded commit');
      const captureContext=await a.getQuickBindingContext();
      let guardChanged=false;
      IDBObjectStore.prototype.get=function(...args){const request=nativeGet.apply(this,args);if(this.name===m.QUICK_CAPTURE_STORE&&this.transaction.mode==='readwrite')request.addEventListener('success',()=>{guardChanged=true;authHandler('SIGNED_IN',{user:{id:'actor-a'},access_token:token('capture-switch-a')});});return request;};
      const captureStopped=await rejected(()=>o.commitQuickCapture(captureGuard,captureContext.revision,()=>a.isQuickBindingContextCurrent(captureContext)));
      IDBObjectStore.prototype.get=nativeGet;
      check('N03-capture-commit-rechecks-epoch-inside-idb',guardChanged&&captureStopped&&!await o.getQuickCapture(captureGuard.captureId));
      await waitFor(()=>a.getQuickSessionLoadState()==='authenticated');
      client.auth.getSession=async()=>({data:{session:null},error:{status:503}});
      await a.loadQuickSession();
      authHandler('SIGNED_OUT',null);
      check('N07-signed-out-after-outage-is-unauthenticated',a.getQuickSessionLoadState()==='unauthenticated'&&a.getQuickAuthSnapshot()===null);
      subscription.unsubscribe();
      await waitFor(async()=>Boolean((await o.getQuickAuthContext())?.barrierAt));
      const finalBarrier=await o.getQuickAuthContext();
      check('N07-unsubscribe-preserves-already-received-logout-barrier',!finalBarrier.bindingAllowed&&Boolean(finalBarrier.barrierAt));
    } else {
      const sync=await import('/src/features/quickTaskCapture/sync.ts');
      const records=[make(),make()]; for(const r of records) await o.commitQuickCapture(r);
      let requests=0; window.fetch=async()=>{requests++;return new Response(JSON.stringify({code:'QT_AUTH_REQUIRED'}),{status:401});};
      await sync.flushQuickTaskOutbox(current);
    const states=await Promise.all(records.map(async r=>(await o.getQuickCapture(r.captureId)).state));
    check('N05-first-auth-failure-stops-batch', requests === 1 && states.filter(s=>s==='pending').length===1 && states.filter(s=>s==='failed_auth').length===1);
    const typed=make('actor-a','typed workspace recovery'); await o.commitQuickCapture(typed);
    // The batch still contains another capture; count only this recovery target.
    const typedRequests=[];
    window.fetch=async(_url,options)=>{
      const body=JSON.parse(options.body);
      if(body.p_capture_id===typed.captureId) typedRequests.push(body);
      return new Response(JSON.stringify({code:'P0001',message:'QT_NO_AVAILABLE_WORKSPACE'}),{status:400,headers:{'content-type':'application/json'}});
    };
    await sync.flushQuickTaskOutbox(current);
    const failedTyped=await o.getQuickCapture(typed.captureId);
    check('N08-P0001-preserves-typed-workspace-code-and-original-capture',failedTyped.state==='failed_permanent'&&failedTyped.lastErrorCode==='QT_NO_AVAILABLE_WORKSPACE'&&failedTyped.captureId===typed.captureId&&failedTyped.accountId==='actor-a'&&failedTyped.title===typed.title&&!failedTyped.receipt);
    await o.retryQuickCapture(typed.captureId,'actor-a');
    window.fetch=async(_url,options)=>{
      const body=JSON.parse(options.body);
      if(body.p_capture_id===typed.captureId) typedRequests.push(body);
      return new Response(JSON.stringify(await receipt({...typed,captureId:body.p_capture_id,accountId:'actor-a'})),{status:200,headers:{'content-type':'application/json'}});
    };
    await sync.flushQuickTaskOutbox(current);
    const recoveredTyped=await o.getQuickCapture(typed.captureId);
    check('N08-typed-workspace-recovery-reuses-original-ID-owner-title',recoveredTyped.state==='synced'&&recoveredTyped.captureId===typed.captureId&&recoveredTyped.accountId==='actor-a'&&recoveredTyped.title===typed.title&&recoveredTyped.receipt?.captureId===typed.captureId&&recoveredTyped.receipt?.ownerId==='actor-a'&&typedRequests.length===2&&typedRequests.every(body=>body.p_capture_id===typed.captureId&&body.p_title===typed.title&&body.p_workspace_hint===null));
    const old={...make(),state:'synced',receipt:null}; await o.commitQuickCapture(old);
      window.fetch=async(_url,opts)=>{const body=JSON.parse(opts.body); const r=(await o.getQuickCapture(body.p_capture_id));return new Response(JSON.stringify({...await receipt(r),created:false}),{status:200});};
      await sync.flushQuickTaskOutbox(current);
      const restored=await o.getQuickCapture(old.captureId);
      check('N09-legacy-synced-replayed-before-cleanup', restored.state === 'synced' && Boolean(restored.receipt));
      const saved=await o.getQuickAuthContext(); await o.saveQuickAuthContext({...saved,revision:saved.revision+1,bindingAllowed:false,accountId:null,barrierAt:Date.now()},saved.revision);
      const stopped=make(); await o.commitQuickCapture(stopped); requests=0; window.fetch=async()=>{requests++;throw Error('must not dispatch');};
      await sync.flushQuickTaskOutbox(current);
      check('N07-other-tab-barrier-stops-stale-dispatch',requests===0 && (await o.getQuickCapture(stopped.captureId)).state==='pending');
    }
  }
  if(group === 'offline-auth-null' || group === 'offline-auth-401') {
    await o.saveQuickAuthContext(context('actor-a'),null);
    const client=(await import('/src/services/supabase/client.ts')).supabase;
    const a=await import('/src/features/quickTaskCapture/auth.ts');
    client.auth.getSession=async()=>({data:{session:null},error:{status:503}});
    await a.loadQuickSession();
    const offlineBinding=await a.getQuickBindingContext();
    client.auth.getSession=async()=>({data:{session:null},error:group==='offline-auth-401'?{status:401}:null});
    const failedBinding=await a.getQuickBindingContext(), barrier=await o.getQuickAuthContext();
    client.auth.getSession=async()=>({data:{session:{user:{id:'actor-a'},access_token:'e30.'+btoa(JSON.stringify({session_id:'residual-a'}))+'.fixture'}},error:{status:503}});
    await a.loadQuickSession();
    check('N05-'+group+'-cannot-revive-offline-owner',offlineBinding?.accountId==='actor-a'&&!failedBinding&&Boolean(barrier.barrierAt)&&!barrier.bindingAllowed&&!await a.getQuickBindingContext());
  }
  if(group === 'upgrade-abort') {
    const original=indexedDB.open.bind(indexedDB);
    const db=await new Promise((resolve,reject)=>{const q=original(m.QUICK_CAPTURE_DB,1);q.onupgradeneeded=()=>q.result.createObjectStore(m.QUICK_CAPTURE_STORE,{keyPath:'captureId'});q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
    const r=make(); await new Promise((resolve,reject)=>{const tx=db.transaction(m.QUICK_CAPTURE_STORE,'readwrite');tx.objectStore(m.QUICK_CAPTURE_STORE).put(r);tx.oncomplete=resolve;tx.onerror=reject;});db.close();
    indexedDB.open=(...args)=>{const q=original(...args);q.addEventListener('upgradeneeded',()=>queueMicrotask(()=>q.transaction.abort()));return q;};
    const aborted=await rejected(()=>o.getQuickCapture(r.captureId)); indexedDB.open=original;
    const unchanged=await new Promise((resolve,reject)=>{const q=original(m.QUICK_CAPTURE_DB);q.onsuccess=()=>{const value=q.result.version===1&&!q.result.objectStoreNames.contains(m.QUICK_AUTH_CONTEXT_STORE);q.result.close();resolve(value);};q.onerror=()=>reject(q.error);});
    check('N10-aborted-upgrade-keeps-v1-and-retries-v2',aborted&&unchanged&&(await o.getQuickCapture(r.captureId)).captureId===r.captureId);
  }
  if(group === 'legacy') {
    localStorage.setItem('projed.quick-task.oauth-session.v1',JSON.stringify({accountId:'actor-a',accessToken:'retired-fixture-token',refreshToken:'retired-fixture-refresh'}));
    const client=(await import('/src/services/supabase/client.ts')).supabase;
    const a=await import('/src/features/quickTaskCapture/auth.ts');
    const snapshot=await a.loadQuickSession();
    check('N10-retired-OAuth-cache-never-authorizes-binding',snapshot===null&&!await a.getQuickBindingContext());
    const r=make(null); await o.commitQuickCapture(r);
    client.auth.signInWithOAuth=async()=>({error:null}); await a.startQuickGoogleSignIn(location.href);
    history.replaceState(null,'','?error=access_denied');
    check('N05-callback-error-keeps-unbound-and-cancels-intent',await rejected(()=>a.completeQuickOAuthCallback())&&!sessionStorage.getItem('projed-quick-sdk-login-intent')&&(await o.getQuickCapture(r.captureId)).accountId===null);
  }
  if(group === 'context') {
    const first=await Promise.allSettled([o.saveQuickAuthContext(context('actor-a'),null),o.saveQuickAuthContext(context('actor-b'),null)]);
    check('N03-first-context-creation-CAS-single-winner',first.filter(r=>r.status==='fulfilled').length===1);
    await o.saveQuickAuthContext({...context('actor-a',3),verifiedAt:null});
    const a=await import('/src/features/quickTaskCapture/auth.ts');
    check('N03-corrupt-context-never-guesses-offline-owner',!await a.getQuickBindingContext());
    await o.saveQuickAuthContext({...context('actor-a',4),projectRef:'different-project'});
    check('N10-project-drift-never-authorizes-offline-binding',!await a.getQuickBindingContext());
  }
  if(group === 'upgrade') {
    let old=await new Promise((resolve,reject)=>{const q=indexedDB.open(m.QUICK_CAPTURE_DB,1); q.onupgradeneeded=()=>q.result.createObjectStore(m.QUICK_CAPTURE_STORE,{keyPath:'captureId'});q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
    const r=make(); await new Promise((resolve,reject)=>{const tx=old.transaction(m.QUICK_CAPTURE_STORE,'readwrite');tx.objectStore(m.QUICK_CAPTURE_STORE).put(r);tx.oncomplete=resolve;tx.onerror=reject;});
    const blocked=await Promise.race([o.getQuickCapture(r.captureId).then(()=>false,()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),2000))]);
    check('N10-blocked-upgrade-surfaces-error', blocked); old.close(); await new Promise(resolve=>setTimeout(resolve,100));
    check('N10-v1-to-v2-preserves-owner-ID', (await o.getQuickCapture(r.captureId)).accountId === r.accountId);
  }
  return rows;
}
