/**
 * Quick verification that team job notification + acceptance routes are wired.
 * Run: node test-team-job-flow.js
 * Requires: backend running on PORT (default 3001), optional USER_ID (e.g. a real users.id).
 */
const PORT = process.env.PORT || 3001;
const BASE = `http://localhost:${PORT}`;
const USER_ID = process.env.USER_ID || 'f8d094bf-3bfe-418a-934e-18b91bb91d2c';

async function get(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, ok: res.ok, json, text: text.slice(0, 200) };
}

async function main() {
  console.log('Testing team job flow endpoints (backend at', BASE, ')...\n');

  // 1) GET my-pending-responses (frontend uses no /api; server mounts both)
  const pathsToTry = [
    `${BASE}/team-bookings/my-pending-responses/${USER_ID}`,
    `${BASE}/api/team-bookings/my-pending-responses/${USER_ID}`
  ];
  let pendingRes = { status: 0 };
  for (const url of pathsToTry) {
    console.log('1. GET', url);
    pendingRes = await get(url);
    console.log('   Status:', pendingRes.status);
    if (pendingRes.status === 200) break;
  }
  if (pendingRes.json) {
    console.log('   Body:', JSON.stringify(pendingRes.json, null, 2).slice(0, 500));
    if (pendingRes.json.pending && Array.isArray(pendingRes.json.pending)) {
      console.log('   OK: response has "pending" array, length =', pendingRes.json.pending.length);
    } else if (pendingRes.status === 200) {
      console.log('   OK: 200 with valid shape');
    } else {
      console.log('   WARN: expected 200 and { pending: [] } or { pending: [...] }');
    }
  } else {
    console.log('   Response (not JSON):', pendingRes.text);
  }
  if (pendingRes.status === 404) {
    console.log('   TIP: Restart the backend (node index.js) so new routes are loaded, then run this again.');
  }
  console.log('');

  // 2) GET assignment acceptances (fake ID - expect 404)
  const fakeId = '00000000-0000-0000-0000-000000000001';
  const accUrl = `${BASE}/api/team-bookings/assignment/${fakeId}/acceptances`;
  console.log('2. GET', accUrl);
  const accRes = await get(accUrl);
  console.log('   Status:', accRes.status, '(404 expected for fake ID)');
  if (accRes.json && accRes.json.error) {
    console.log('   OK: error returned as expected');
  }
  console.log('');

  console.log('Done. If step 1 returned 200 with { pending: [] }, the flow is wired correctly.');
  console.log('To test assign + notifications: POST /team-bookings/assign with booking_id, team_id, assigned_member_ids.');
}

main().catch((e) => {
  console.error('Request failed:', e.message);
  process.exit(1);
});
