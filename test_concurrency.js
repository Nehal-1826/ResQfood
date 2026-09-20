// test_concurrency.js
// No node-fetch needed for Node.js v18+

async function runStressTest() {
  const API_URL = 'http://localhost:3000/api';
  
  console.log('🔍 Fetching available requests...');
  let requestId;
  try {
    const res = await fetch(`${API_URL}/deliveries/volunteer/available`);
    const data = await res.json();
    if (!data.success || !data.data || data.data.length === 0) {
      console.error('❌ No available requests found to test with.');
      return;
    }
    requestId = data.data[0].request_id;
    console.log(`✅ Found Request ID: ${requestId}`);
  } catch (err) {
    console.error('❌ Failed to connect to server:', err.message);
    return;
  }

  const volunteers = [1, 2, 3]; 
  console.log('🚀 Starting Stress Test: Concurrent Delivery Acceptance');
  
  const tasks = volunteers.map(async (vId) => {
    try {
      console.log(`Volunteer ${vId} attempting to accept request ${requestId}...`);
      const response = await fetch(`${API_URL}/deliveries/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId, volunteer_id: vId })
      });
      const data = await response.json();
      console.log(`Volunteer ${vId} result:`, data);
      return { vId, data };
    } catch (err) {
      console.error(`Volunteer ${vId} error:`, err.message);
      return { vId, error: err.message };
    }
  });

  const results = await Promise.all(tasks);
  
  const successes = results.filter(r => r.data && r.data.success);
  const conflicts = results.filter(r => r.data && r.data.success === false);

  console.log('\n--- Stress Test Summary ---');
  console.log(`Total Attempts: ${volunteers.length}`);
  console.log(`Successful Acceptances: ${successes.length} (Should be 1)`);
  console.log(`Conflicts Handled: ${conflicts.length} (Should be ${volunteers.length - 1})`);

  if (successes.length === 1) {
    console.log('✅ PASS: Transactional integrity maintained. Only one volunteer won.');
  } else {
    console.error('❌ FAIL: Transactional integrity broken! Multiple successes or zero successes.');
  }
}

runStressTest();
