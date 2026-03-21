# Team job notification & acceptance – verification

## 1. Restart the backend

The new routes (`/team-bookings/my-pending-responses/:userId`, `/team-bookings/assignment/:id/respond`, etc.) are only loaded when the server starts. **Restart the backend** so it picks up the latest code:

```bash
# In S9-b-end directory
node index.js
# or: npm run dev
```

## 2. Run the SQL migration (if not done)

Create the `team_assignment_acceptances` table so accept/decline is stored:

- Open **Supabase Dashboard → SQL Editor** (or use your migration runner).
- Run the contents of **`create-team-assignment-acceptances.sql`**.

Without this table, notifications and “pending” list still work, but **Accept/Decline** will fail with a DB error.

## 3. Run the verification script

```bash
# From S9-b-end, with backend running
node test-team-job-flow.js
```

**Expected:**

- **GET my-pending-responses:** status **200**, body `{ "pending": [] }` (or `{ "pending": [ ... ] }` if you have pending team jobs).
- **GET assignment acceptances (fake ID):** status **404** (assignment not found).

If you see **404** on the first request, the backend running in your terminal is still an old process; restart it and run the script again.

## 4. Manual flow check

1. **Assign a team to a booking:**  
   `POST /team-bookings/assign` with `{ "booking_id", "team_id", "assigned_member_ids": ["user-uuid-1", "user-uuid-2"], "notes" }`.
2. **As a team member:** log in to the **Service Provider Dashboard** (frontend). You should see:
   - A **notification**: “New team job – action required”.
   - On **Overview** or **My Jobs**: section **“Team jobs – action required”** with **Accept** / **Decline**.
3. Click **Accept** or **Decline**; the card should disappear and a success toast appear.
4. When **all** assigned members have accepted, the team assignment status becomes **confirmed** (and booking can progress).

## 5. Frontend

- **API:** `getMyPendingTeamResponses(userId)`, `respondToTeamAssignment(assignmentId, userId, accept, notes)`.
- **Dashboard:** `ServiceProviderDashboard.jsx` loads pending team responses on mount and shows the “Team jobs – action required” block with Accept/Decline when `pendingTeamResponses.length > 0`.

If anything above fails, check backend logs and the browser network tab for the failing request and error message.
