const testEdgeFunction = async () => {
  const endpoint = 'http://127.0.0.1:54321/functions/v1/match_project_knowledge';

  // We test the 400 and 401 paths because a full E2E requires a valid JWT and Supabase running.
  // This verifies the function boots and handles errors properly.

  console.log('Test 1: Missing Authorization');
  const res1 = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'test' })
  });

  if (res1.status !== 401) {
    console.error(`❌ Test 1 failed. Expected 401, got ${res1.status}`);
    process.exit(1);
  }
  const data1 = await res1.json();
  if (data1.error?.code !== 'UNAUTHORIZED') {
    console.error('❌ Test 1 failed. Expected UNAUTHORIZED code');
    process.exit(1);
  }
  console.log('✅ Test 1 passed');

  console.log('Test 2: Bad Request (Invalid Tenant UUID)');
  const res2 = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer fake-token'
    },
    body: JSON.stringify({ tenantId: 'invalid-uuid', query: 'test' })
  });

  if (res2.status !== 400) {
    console.error(`❌ Test 2 failed. Expected 400, got ${res2.status}`);
    process.exit(1);
  }
  const data2 = await res2.json();
  if (data2.error?.code !== 'BAD_REQUEST') {
    console.error('❌ Test 2 failed. Expected BAD_REQUEST code');
    process.exit(1);
  }
  console.log('✅ Test 2 passed');

  console.log('✅ Edge function smoke tests passed (Error paths verified)');
};

testEdgeFunction().catch(console.error);
