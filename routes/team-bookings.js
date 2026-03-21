const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const { sendTeamJobAssignedNotifications, sendTeamAssignedToCustomerNotification, notifyAdminsTeamAllAccepted, sendTeamAllAcceptedToCustomerNotification, notifyAdminsWorkerDeclined } = require('../services/notificationService');
const { sendTeamAssignedToCustomerEmail, sendTeamAllAcceptedToCustomerEmail, sendTeamAllAcceptedToAdminEmail, sendWorkerDeclinedToAdminEmail } = require('../services/emailService');

async function resolveUserId(idOrAuthUid) {
  if (!idOrAuthUid) return null;
  const { data: byId } = await supabase.from('users').select('id').eq('id', idOrAuthUid).maybeSingle();
  if (byId?.id) return byId.id;
  const { data: byAuth } = await supabase.from('users').select('id').eq('auth_user_id', idOrAuthUid).maybeSingle();
  return byAuth?.id || null;
}

// Assign team to a booking
const assignTeamToBooking = async (req, res) => {
  try {
    const { booking_id, team_id, assigned_member_ids, notes } = req.body;

    if (!booking_id || !team_id || !assigned_member_ids || !Array.isArray(assigned_member_ids)) {
      return res.status(400).json({ 
        error: 'booking_id, team_id, and assigned_member_ids array are required' 
      });
    }

    // Verify booking exists and get details for notifications (include user_id for customer)
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, user_id, service_id, category_id, booking_status, scheduled_date, scheduled_time, service_address')
      .eq('id', booking_id)
      .single();

    if (bookingError || !booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Verify team exists and is active (need name for notifications)
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('id, name, status, team_members(id, user_id, status)')
      .eq('id', team_id)
      .eq('status', 'active')
      .single();

    if (teamError || !team) {
      return res.status(404).json({ error: 'Team not found or inactive' });
    }

    // Get all active team member user IDs
    const teamMemberIds = team.team_members
      .filter(member => member.status === 'active')
      .map(member => member.user_id);

    if (!teamMemberIds.length) {
      return res.status(400).json({
        error: 'No active members in this team to assign'
      });
    }

    // Ensure assigned members are valid team members
    const invalidMembers = assigned_member_ids.filter(id => !teamMemberIds.includes(id));
    if (invalidMembers.length > 0) {
      return res.status(400).json({ 
        error: `Invalid team members: ${invalidMembers.join(', ')}` 
      });
    }

    // For GROUP services, always assign the full active team, even if only one member was
    // passed from the client. This ensures group jobs (like Pest Control) reach every
    // team member so they can all accept and coordinate.
    let finalAssignedMembers = assigned_member_ids;
    let serviceType = null;

    try {
      if (booking.service_id) {
        const { data: svc } = await supabase
          .from('services')
          .select('service_type')
          .eq('id', booking.service_id)
          .maybeSingle();
        serviceType = svc?.service_type || null;
      }
    } catch (e) {
      console.warn('Could not load service_type for booking when assigning team:', e.message);
    }

    if (serviceType === 'group') {
      // Override to use all active team members for true group jobs
      finalAssignedMembers = teamMemberIds;
    }

    // Before creating the team assignment, ensure none of the selected members
    // are unavailable due to their availability settings or approved/pending leave.
    try {
      const scheduledDate = booking.scheduled_date;
      const scheduledTime = booking.scheduled_time || null;
      const memberIdsToCheck = Array.isArray(finalAssignedMembers) ? finalAssignedMembers : [];
      const unavailableByUserId = {};

      if (scheduledDate && memberIdsToCheck.length > 0) {
        // 1) Check weekly availability from service_provider_details.availability
        try {
          const { data: spRows, error: spError } = await supabase
            .from('service_provider_details')
            .select('id, availability')
            .in('id', memberIdsToCheck);

          if (!spError && Array.isArray(spRows) && spRows.length > 0) {
            const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            let dayKey = null;
            try {
              const d = new Date(scheduledDate + 'T00:00:00');
              const idx = d.getDay();
              dayKey = dayNames[idx] || null;
            } catch (_) {
              dayKey = null;
            }

            if (dayKey) {
              const availabilityByProvider = spRows.reduce((acc, row) => {
                acc[row.id] = row.availability || {};
                return acc;
              }, {});

              for (const uid of memberIdsToCheck) {
                const avail = availabilityByProvider[uid];
                if (!avail || typeof avail !== 'object') {
                  // No availability configured – treat as available to avoid breaking older data
                  continue;
                }
                const daySchedule = avail[dayKey];
                if (!daySchedule) {
                  continue;
                }
                if (daySchedule.available === false) {
                  unavailableByUserId[uid] = {
                    user_id: uid,
                    reason: 'weekly_unavailable',
                    detail: `Marked unavailable on ${dayKey}`
                  };
                  continue;
                }
                if (
                  scheduledTime &&
                  daySchedule.start &&
                  daySchedule.end &&
                  typeof daySchedule.start === 'string' &&
                  typeof daySchedule.end === 'string'
                ) {
                  // Compare as HH:MM strings
                  const t = String(scheduledTime).slice(0, 5);
                  const start = String(daySchedule.start).slice(0, 5);
                  const end = String(daySchedule.end).slice(0, 5);
                  if (t < start || t > end) {
                    unavailableByUserId[uid] = {
                      user_id: uid,
                      reason: 'weekly_out_of_hours',
                      detail: `Booking time ${t} is outside working hours ${start}-${end}`
                    };
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn('Availability check failed when assigning team:', e.message || e);
        }

        // 2) Check explicit provider_time_off (leave) records that cover this date
        try {
          const { data: timeOffRows, error: timeOffError } = await supabase
            .from('provider_time_off')
            .select('provider_id, start_date, end_date, status')
            .in('provider_id', memberIdsToCheck)
            .neq('status', 'rejected')
            .neq('status', 'cancelled')
            .lte('start_date', scheduledDate)
            .gte('end_date', scheduledDate);

          if (!timeOffError && Array.isArray(timeOffRows) && timeOffRows.length > 0) {
            for (const row of timeOffRows) {
              const uid = row.provider_id;
              if (!uid) continue;
              const existing = unavailableByUserId[uid];
              const range =
                row.start_date === row.end_date
                  ? row.start_date
                  : `${row.start_date} to ${row.end_date}`;
              const detail = `On approved/pending leave for ${range}`;
              if (!existing) {
                unavailableByUserId[uid] = {
                  user_id: uid,
                  reason: 'time_off',
                  detail
                };
              } else if (existing && !existing.detail?.includes('leave')) {
                existing.detail = `${existing.detail}; ${detail}`;
              }
            }
          }
        } catch (e) {
          console.warn('Time-off check failed when assigning team:', e.message || e);
        }
      }

      const unavailableList = Object.values(unavailableByUserId);
      if (unavailableList.length > 0) {
        return res.status(400).json({
          error: 'Some team members are unavailable at the scheduled time. Please choose a different team, members, or time slot.',
          unavailable_members: unavailableList
        });
      }
    } catch (e) {
      console.warn('Non-fatal error while enforcing provider availability for team assignment:', e.message || e);
    }

    // Create team assignment
    const { data: assignment, error: assignmentError } = await supabase
      .from('team_assignments')
      .insert({
        booking_id,
        team_id,
        assigned_members: finalAssignedMembers,
        assignment_status: 'pending',
        notes: notes || null
      })
      .select()
      .single();

    if (assignmentError) {
      return res.status(500).json({ error: assignmentError.message });
    }

    // Update booking with team assignment info (assigned_provider_id must be users.id, not team_members.id)
    // Set booking_status to 'assigned' so workers see it and it no longer appears as "pending" for individual accept
    const primaryUserId = finalAssignedMembers[0];
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        assigned_provider_id: primaryUserId,
        provider_assigned_at: new Date().toISOString(),
        booking_status: 'assigned',
        preferred_provider_notes: notes ? `${notes}. Team: ${team.name}` : `Team assignment: ${team.name}`
      })
      .eq('id', booking_id);

    if (updateError) {
      console.warn('Failed to update booking with team assignment:', updateError);
    } else {
      // Optionally set team-specific columns if they exist (no-op if columns missing)
      await supabase
        .from('bookings')
        .update({ assigned_team_id: team_id, is_team_booking: true })
        .eq('id', booking_id);
    }

    // Create per-member acceptance rows (so each member can accept/decline)
    try {
      const { error: acceptErr } = await supabase
        .from('team_assignment_acceptances')
        .insert(finalAssignedMembers.map((user_id) => ({
          team_assignment_id: assignment.id,
          user_id,
          status: 'pending'
        })));
      if (acceptErr) {
        console.warn('Team assignment acceptances insert skipped (table may not exist):', acceptErr.message);
      }
    } catch (e) {
      console.warn('Team assignment acceptances skipped:', e.message);
    }

    // Notify all assigned team members about the new job (recipient_id must be users.id for notifications table)
    // Fetch full booking data from database to ensure we use real data
    let bookingData = null;
    try {
      const { data: fullBooking } = await supabase
        .from('bookings')
        .select('id, scheduled_date, scheduled_time, service_address, service_id, category_id')
        .eq('id', booking_id)
        .single();
      if (fullBooking) bookingData = fullBooking;
    } catch (e) {
      console.warn('Could not fetch full booking data for notification:', e.message);
      bookingData = booking; // fallback to what we have
    }

    // Get service name from database
    let serviceName = null;
    try {
      const serviceId = bookingData?.service_id || booking.service_id;
      if (serviceId) {
        const { data: svc } = await supabase
          .from('services')
          .select('name')
          .eq('id', serviceId)
          .single();
        serviceName = svc?.name || null;
      }
    } catch (_) {}

    try {
      const resolvedRecipientIds = [];
      for (const id of finalAssignedMembers || assigned_member_ids) {
        const resolved = await resolveUserId(id);
        if (resolved) resolvedRecipientIds.push(resolved);
        else resolvedRecipientIds.push(id); // fallback to raw id
      }
      const notifResults = await sendTeamJobAssignedNotifications(resolvedRecipientIds, {
        assignmentId: assignment.id,
        bookingId: booking_id,
        teamName: team.name,
        scheduled_date: bookingData?.scheduled_date || booking.scheduled_date,
        scheduled_time: bookingData?.scheduled_time || booking.scheduled_time,
        service_address: bookingData?.service_address || booking.service_address,
        service_name: serviceName
      });
      if (notifResults.some((r) => !r.success)) {
        console.warn('Some team job notifications failed:', notifResults.filter((r) => !r.success));
      }
    } catch (notifErr) {
      console.error('Failed to send team job notifications:', notifErr);
      // Do not fail the assign request
    }

    // Notify customer: in-app notification + email with worker details
    const customerUserId = booking.user_id;
    if (customerUserId) {
      let workerDetails = [];
      try {
        const { data: workerUsers } = await supabase
          .from('users')
          .select('id, email, user_profiles(first_name, last_name, phone)')
          .in('id', finalAssignedMembers);
        workerDetails = (workerUsers || []).map((u) => {
          const profile = Array.isArray(u.user_profiles) ? u.user_profiles[0] : u.user_profiles;
          const name = profile
            ? `${(profile.first_name || '').trim()} ${(profile.last_name || '').trim()}`.trim() || u.email || '—'
            : u.email || '—';
          return {
            name,
            phone: profile?.phone || null,
            email: u.email || null
          };
        });
      } catch (e) {
        console.warn('Could not fetch worker details for customer notification:', e.message);
      }

      try {
        await sendTeamAssignedToCustomerNotification(customerUserId, {
          bookingId: booking_id,
          teamName: team.name,
          serviceName: serviceName || null,
          scheduled_date: bookingData?.scheduled_date || booking.scheduled_date,
          scheduled_time: bookingData?.scheduled_time || booking.scheduled_time,
          service_address: bookingData?.service_address || booking.service_address,
          workers: workerDetails
        });
      } catch (notifErr) {
        console.warn('Failed to notify customer (in-app):', notifErr);
      }

      try {
        const { data: customerUser } = await supabase
          .from('users')
          .select('email, user_profiles(first_name, last_name)')
          .eq('id', customerUserId)
          .single();
        const customerEmail = customerUser?.email;
        if (customerEmail) {
          const custProfile = Array.isArray(customerUser?.user_profiles) ? customerUser.user_profiles[0] : customerUser?.user_profiles;
          const customerName = custProfile
            ? `${(custProfile.first_name || '').trim()} ${(custProfile.last_name || '').trim()}`.trim() || customerEmail
            : customerEmail;
          await sendTeamAssignedToCustomerEmail({
            to: customerEmail,
            customerName: customerName || 'Customer',
            serviceName: serviceName || 'Your service',
            scheduledDate: bookingData?.scheduled_date || booking.scheduled_date || 'TBD',
            scheduledTime: bookingData?.scheduled_time || booking.scheduled_time || '',
            address: bookingData?.service_address || booking.service_address || 'Address TBD',
            teamName: team.name || 'Team',
            workers: workerDetails
          });
        }
      } catch (emailErr) {
        console.warn('Failed to send team-assigned email to customer:', emailErr);
      }
    }

    return res.status(201).json({
      message: 'Team assigned to booking successfully',
      assignment
    });

  } catch (error) {
    console.error('Error assigning team to booking:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Respond to a team assignment (accept or decline) — for assigned members
const respondToTeamAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { accept, notes, user_id: bodyUserId } = req.body;
    const rawUserId = bodyUserId || req.headers['x-user-id'];

    if (rawUserId === undefined || rawUserId === null) {
      return res.status(400).json({ error: 'user_id is required (in body or x-user-id header)' });
    }
    if (typeof accept !== 'boolean') {
      return res.status(400).json({ error: 'accept (boolean) is required' });
    }

    const userId = await resolveUserId(rawUserId);
    if (!userId) {
      return res.status(400).json({ error: 'User not found. Ensure user_id is valid (users.id or auth UID).' });
    }

    const { data: assignment, error: assignErr } = await supabase
      .from('team_assignments')
      .select('id, booking_id, team_id, assigned_members, assignment_status')
      .eq('id', assignmentId)
      .single();

    if (assignErr || !assignment) {
      return res.status(404).json({ error: 'Team assignment not found' });
    }

    // Once a team assignment is no longer pending (e.g. cancelled after a decline,
    // or already confirmed/completed), other members must NOT be able to continue
    // responding from their dashboards.
    if (assignment.assignment_status !== 'pending') {
      return res.status(400).json({
        error: 'This team assignment is no longer active for responses. Please contact admin for a new assignment.'
      });
    }

    const memberIds = assignment.assigned_members || [];
    if (!memberIds.includes(userId)) {
      return res.status(403).json({ error: 'You are not assigned to this team job' });
    }

    const status = accept ? 'accepted' : 'declined';
    const now = new Date().toISOString();

    // Update or insert acceptance (table may have been created on assign)
    const { data: existing } = await supabase
      .from('team_assignment_acceptances')
      .select('id')
      .eq('team_assignment_id', assignmentId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      const { data: updated, error: updateErr } = await supabase
        .from('team_assignment_acceptances')
        .update({
          status,
          responded_at: now,
          notes: notes || null,
          updated_at: now
        })
        .eq('team_assignment_id', assignmentId)
        .eq('user_id', userId)
        .select()
        .single();
      if (updateErr) {
        return res.status(500).json({ error: updateErr.message });
      }
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from('team_assignment_acceptances')
        .insert({
          team_assignment_id: assignmentId,
          user_id: userId,
          status,
          responded_at: now,
          notes: notes || null
        })
        .select()
        .single();
      if (insertErr) {
        return res.status(500).json({ error: insertErr.message });
      }
    }

    // If worker declined, notify admin(s) and customer (in-app + email)
    if (!accept) {
      (async () => {
        try {
          let workerName = 'A team member';
          const { data: workerUser } = await supabase
            .from('users')
            .select('email, user_profiles(first_name, last_name)')
            .eq('id', userId)
            .single();
          const wp = Array.isArray(workerUser?.user_profiles) ? workerUser?.user_profiles[0] : workerUser?.user_profiles;
          workerName = wp ? `${(wp.first_name || '').trim()} ${(wp.last_name || '').trim()}`.trim() || workerUser?.email : workerUser?.email || workerName;

          const { data: bookingRow } = await supabase
            .from('bookings')
            .select('user_id, service_id, scheduled_date, scheduled_time')
            .eq('id', assignment.booking_id)
            .single();
          let serviceName = null;
          if (bookingRow?.service_id) {
            const { data: svc } = await supabase.from('services').select('name').eq('id', bookingRow.service_id).single();
            serviceName = svc?.name || null;
          }
          let teamName = null;
          if (assignment.team_id) {
            const { data: teamRow } = await supabase.from('teams').select('name').eq('id', assignment.team_id).single();
            teamName = teamRow?.name || null;
          }
          const payload = {
            bookingId: assignment.booking_id,
            teamName: teamName || 'Team',
            serviceName: serviceName || 'Service',
            scheduled_date: bookingRow?.scheduled_date || null,
            scheduled_time: bookingRow?.scheduled_time || null,
            workerName
          };

          let customerDisplayName = 'Customer';
          const customerUserId = bookingRow?.user_id;
          if (customerUserId) {
            const { data: u } = await supabase.from('users').select('email, user_profiles(first_name, last_name)').eq('id', customerUserId).single();
            const p = Array.isArray(u?.user_profiles) ? u?.user_profiles[0] : u?.user_profiles;
            customerDisplayName = p ? `${(p.first_name || '').trim()} ${(p.last_name || '').trim()}`.trim() || u?.email : u?.email || 'Customer';
          }

          await notifyAdminsWorkerDeclined({ ...payload, customerName: customerDisplayName });

          const { data: admins } = await supabase
            .from('users')
            .select('id, email, user_profiles(first_name, last_name)')
            .eq('role', 'admin')
            .eq('status', 'active');
          for (const admin of admins || []) {
            if (!admin.email) continue;
            const ap = Array.isArray(admin.user_profiles) ? admin.user_profiles[0] : admin.user_profiles;
            const adminName = ap ? `${(ap.first_name || '').trim()} ${(ap.last_name || '').trim()}`.trim() || admin.email : admin.email || 'Admin';
            await sendWorkerDeclinedToAdminEmail({
              to: admin.email,
              adminName,
              bookingId: assignment.booking_id,
              workerName: payload.workerName,
              serviceName: payload.serviceName,
              scheduledDate: payload.scheduled_date || 'TBD',
              scheduledTime: payload.scheduled_time || '',
              teamName: payload.teamName,
              customerName: customerDisplayName
            });
          }
        } catch (e) {
          console.error('Failed to send worker-declined notifications/emails:', e);
        }
      })();
    }

    // If accepted, check if all assigned members have accepted → set assignment to confirmed
    const { data: acceptances } = await supabase
      .from('team_assignment_acceptances')
      .select('user_id, status')
      .eq('team_assignment_id', assignmentId);

    const byUser = (acceptances || []).reduce((acc, row) => {
      acc[row.user_id] = row.status;
      return acc;
    }, {});

    const allAccepted =
      memberIds.length > 0 &&
      memberIds.every((id) => byUser[id] === 'accepted');
    const anyDeclined = memberIds.some((id) => byUser[id] === 'declined');

    // If ANY assigned member declined, the job must NOT remain "assigned".
    // Instead, we:
    // - mark the team assignment as cancelled (so admin can see it happened),
    // - clear the booking's assignment fields and set booking_status back to 'pending',
    // so admin can re-assign this booking to another team.
    if (anyDeclined) {
      try {
        // Mark assignment as cancelled for admin visibility / audit trail
        const declineNote = notes ? `Decline note: ${notes}` : null;
        const { error: cancelAssignErr } = await supabase
          .from('team_assignments')
          .update({
            assignment_status: 'cancelled',
            notes: declineNote
              ? `${declineNote}${assignment?.notes ? ` | Prev: ${assignment.notes}` : ''}`
              : assignment?.notes || null
          })
          .eq('id', assignmentId);

        if (cancelAssignErr) {
          console.warn('Failed to mark team assignment as cancelled after decline:', cancelAssignErr.message);
        }

        // Clear booking assignment fields (best-effort: some columns may not exist in all DBs)
        const bookingClearPayload = {
          booking_status: 'pending',
          assigned_provider_id: null,
          provider_assigned_at: null,
          provider_confirmed_at: null,
          // Team booking columns (added by enhanced-team-booking-integration.sql)
          assigned_team_id: null,
          team_assigned_at: null,
          is_team_booking: false
        };

        const { error: clearErr } = await supabase
          .from('bookings')
          .update(bookingClearPayload)
          .eq('id', assignment.booking_id);

        if (clearErr) {
          console.warn('Failed to clear booking assignment fields after decline:', clearErr.message);
        }
      } catch (e) {
        console.error('Failed to cancel assignment / unassign booking after decline:', e);
      }
    }

    if (allAccepted && assignment.assignment_status === 'pending') {
      await supabase
        .from('team_assignments')
        .update({
          assignment_status: 'confirmed',
          confirmed_at: now
        })
        .eq('id', assignmentId);

      // Notify admin(s) and customer (in-app + email) that all workers accepted
      (async () => {
        try {
          const summary = await getAcceptancesSummary(assignmentId);
          const workers = (summary.members || []).map((m) => ({ name: m.full_name || m.email || 'Worker' }));

          const { data: bookingRow } = await supabase
            .from('bookings')
            .select('user_id, service_id, scheduled_date, scheduled_time, service_address')
            .eq('id', assignment.booking_id)
            .single();
          let serviceName = null;
          if (bookingRow?.service_id) {
            const { data: svc } = await supabase.from('services').select('name').eq('id', bookingRow.service_id).single();
            serviceName = svc?.name || null;
          }
          let teamName = null;
          if (assignment.team_id) {
            const { data: teamRow } = await supabase.from('teams').select('name').eq('id', assignment.team_id).single();
            teamName = teamRow?.name || null;
          }
          const payload = {
            bookingId: assignment.booking_id,
            teamName,
            serviceName: serviceName || 'Service',
            scheduled_date: bookingRow?.scheduled_date || null,
            scheduled_time: bookingRow?.scheduled_time || null,
            workers
          };

          const customerUserId = bookingRow?.user_id;
          let customerDisplayName = 'Customer';
          if (customerUserId) {
            const { data: u } = await supabase.from('users').select('email, user_profiles(first_name, last_name)').eq('id', customerUserId).single();
            const p = Array.isArray(u?.user_profiles) ? u?.user_profiles[0] : u?.user_profiles;
            customerDisplayName = p ? `${(p.first_name || '').trim()} ${(p.last_name || '').trim()}`.trim() || u?.email : u?.email || 'Customer';
          }

          await notifyAdminsTeamAllAccepted({
            ...payload,
            customerName: customerDisplayName
          });

          if (customerUserId) {
            await sendTeamAllAcceptedToCustomerNotification(customerUserId, payload);

            const { data: customerUser } = await supabase
              .from('users')
              .select('email, user_profiles(first_name, last_name)')
              .eq('id', customerUserId)
              .single();
            const customerEmail = customerUser?.email;
            if (customerEmail) {
              await sendTeamAllAcceptedToCustomerEmail({
                to: customerEmail,
                customerName: customerDisplayName || 'Customer',
                serviceName: payload.serviceName,
                scheduledDate: payload.scheduled_date || 'TBD',
                scheduledTime: payload.scheduled_time || '',
                teamName: payload.teamName || 'Team',
                workers
              });
            }
          }

          const { data: admins } = await supabase
            .from('users')
            .select('id, email, user_profiles(first_name, last_name)')
            .eq('role', 'admin')
            .eq('status', 'active');
          for (const admin of admins || []) {
            if (!admin.email) continue;
            const p = Array.isArray(admin.user_profiles) ? admin.user_profiles[0] : admin.user_profiles;
            const adminName = p ? `${(p.first_name || '').trim()} ${(p.last_name || '').trim()}`.trim() || admin.email : admin.email || 'Admin';
            await sendTeamAllAcceptedToAdminEmail({
              to: admin.email,
              adminName,
              bookingId: assignment.booking_id,
              customerName: customerDisplayName,
              serviceName: payload.serviceName,
              scheduledDate: payload.scheduled_date || 'TBD',
              scheduledTime: payload.scheduled_time || '',
              teamName: payload.teamName || 'Team',
              workers
            });
          }
        } catch (e) {
          console.error('Failed to send team-all-accepted notifications/emails:', e);
        }
      })();
    }

    const summary = await getAcceptancesSummary(assignmentId);

    return res.json({
      message: accept ? 'You have accepted this team job.' : 'You have declined this team job.',
      accepted: accept,
      all_members_accepted: allAccepted,
      any_declined: anyDeclined,
      assignment_cleared: anyDeclined,
      acceptances: summary
    });
  } catch (error) {
    console.error('Error responding to team assignment:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Get acceptance status for a team assignment (for team members / leader)
// Now returns enriched member data so UI can show who has accepted / is pending.
async function getAcceptancesSummary(assignmentId) {
  // Fetch assignment with team so we can look up member profiles
  const { data: assignment } = await supabase
    .from('team_assignments')
    .select('assigned_members, team_id')
    .eq('id', assignmentId)
    .single();

  if (!assignment) {
    return { members: [], all_accepted: false };
  }

  // Per-member accept / decline rows
  const { data: rows } = await supabase
    .from('team_assignment_acceptances')
    .select('user_id, status, responded_at, notes')
    .eq('team_assignment_id', assignmentId);

  const byUser = (rows || []).reduce((acc, r) => {
    acc[r.user_id] = {
      status: r.status,
      responded_at: r.responded_at,
      notes: r.notes
    };
    return acc;
  }, {});

  // Try to enrich with team member / profile data so the frontend can show names
  let memberProfilesByUser = {};
  try {
    if (assignment.team_id && Array.isArray(assignment.assigned_members) && assignment.assigned_members.length > 0) {
      const { data: teamMembers, error: teamMembersError } = await supabase
        .from('team_members')
        .select(`
          user_id,
          role,
          users(
            id,
            email,
            user_profiles(first_name, last_name, phone)
          )
        `)
        .eq('team_id', assignment.team_id)
        .in('user_id', assignment.assigned_members);

      if (!teamMembersError && Array.isArray(teamMembers)) {
        memberProfilesByUser = teamMembers.reduce((acc, tm) => {
          const rawProfile = tm.users?.user_profiles;
          const profile = Array.isArray(rawProfile) ? rawProfile[0] : rawProfile;
          const fullName = profile
            ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
            : null;
          acc[tm.user_id] = {
            role: tm.role || null,
            email: tm.users?.email || null,
            full_name: fullName || tm.users?.email || null,
            phone: profile?.phone || null
          };
          return acc;
        }, {});
      } else if (teamMembersError) {
        console.warn('Failed to load team member profiles for assignment acceptances:', teamMembersError.message);
      }
    }
  } catch (e) {
    console.warn('Error enriching team assignment acceptances with member profiles:', e.message);
  }

  const members = (assignment.assigned_members || []).map((user_id) => {
    const acceptance = byUser[user_id] || {};
    const profile = memberProfilesByUser[user_id] || {};
    return {
      user_id,
      status: acceptance.status || 'pending',
      responded_at: acceptance.responded_at || null,
      notes: acceptance.notes || null,
      full_name: profile.full_name || null,
      email: profile.email || null,
      phone: profile.phone || null,
      role: profile.role || null
    };
  });

  const all_accepted = members.length > 0 && members.every((m) => m.status === 'accepted');
  return { members, all_accepted };
}

// Get team assignments where this user is assigned and has not yet responded (pending accept/decline)
const getMyPendingTeamResponses = async (req, res) => {
  try {
    const userId = req.params.userId ? await resolveUserId(req.params.userId) : null;
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    const { data: assignments } = await supabase
      .from('team_assignments')
      .select(`
        id,
        booking_id,
        team_id,
        assignment_status,
        assigned_at,
        assigned_members,
        notes,
        teams(id, name),
        bookings(scheduled_date, scheduled_time, service_address, service_id)
      `)
      .contains('assigned_members', [userId]);

    if (!assignments?.length) {
      return res.json({ pending: [] });
    }

    let acceptances = [];
    const { data: accData, error: accErr } = await supabase
      .from('team_assignment_acceptances')
      .select('team_assignment_id, user_id, status')
      .eq('user_id', userId)
      .in('team_assignment_id', assignments.map((a) => a.id));
    if (!accErr) {
      acceptances = accData || [];
    } else {
      // Table may not exist yet (run create-team-assignment-acceptances.sql)
      console.warn('team_assignment_acceptances query failed:', accErr.message);
    }

    const myStatusByAssignment = acceptances.reduce((acc, row) => {
      acc[row.team_assignment_id] = row.status;
      return acc;
    }, {});

    const pending = assignments
      // Exclude assignments that have been cancelled (e.g. after a member declined)
      .filter((a) => a.assignment_status !== 'cancelled')
      // Only show where THIS member has not yet responded
      .filter((a) => myStatusByAssignment[a.id] === 'pending' || myStatusByAssignment[a.id] === undefined)
      .map((a) => ({
        assignment_id: a.id,
        booking_id: a.booking_id,
        team_id: a.team_id,
        team_name: a.teams?.name,
        assignment_status: a.assignment_status,
        assigned_at: a.assigned_at,
        notes: a.notes,
        scheduled_date: a.bookings?.scheduled_date,
        scheduled_time: a.bookings?.scheduled_time,
        service_address: a.bookings?.service_address,
        service_id: a.bookings?.service_id
      }));

    return res.json({ pending });
  } catch (error) {
    console.error('Error fetching my pending team responses:', error);
    return res.status(500).json({ error: error.message });
  }
};

const getAssignmentAcceptances = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const summary = await getAcceptancesSummary(assignmentId);

    const { data: assignment } = await supabase
      .from('team_assignments')
      .select('id, booking_id, team_id, assignment_status')
      .eq('id', assignmentId)
      .single();

    if (!assignment) {
      return res.status(404).json({ error: 'Team assignment not found' });
    }

    return res.json({
      assignment_id: assignmentId,
      assignment_status: assignment.assignment_status,
      acceptances: summary.members,
      all_members_accepted: summary.all_accepted
    });
  } catch (error) {
    console.error('Error fetching assignment acceptances:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Get team assignments for a booking
const getBookingTeamAssignments = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const { data: assignments, error } = await supabase
      .from('team_assignments')
      .select(`
        *,
        teams(
          id,
          name,
          team_members(
            id,
            role,
            status,
            users(
              id,
              email,
              user_profiles(first_name, last_name, phone)
            )
          )
        )
      `)
      .eq('booking_id', bookingId);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ assignments: assignments || [] });

  } catch (error) {
    console.error('Error fetching booking team assignments:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Update team assignment status
const updateTeamAssignmentStatus = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { assignment_status, notes } = req.body;

    if (!assignment_status) {
      return res.status(400).json({ error: 'assignment_status is required' });
    }

    const validStatuses = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(assignment_status)) {
      return res.status(400).json({ 
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
      });
    }

    const updateData = { assignment_status };
    
    // Set timestamp based on status
    switch (assignment_status) {
      case 'confirmed':
        updateData.confirmed_at = new Date().toISOString();
        break;
      case 'in_progress':
        updateData.started_at = new Date().toISOString();
        break;
      case 'completed':
        updateData.completed_at = new Date().toISOString();
        break;
    }

    if (notes) {
      updateData.notes = notes;
    }

    const { data: assignment, error } = await supabase
      .from('team_assignments')
      .update(updateData)
      .eq('id', assignmentId)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({
      message: 'Team assignment status updated successfully',
      assignment
    });

  } catch (error) {
    console.error('Error updating team assignment status:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Get teams available for a specific service (or category).
// Optional: scheduled_date, scheduled_time, exclude_booking_id — when provided, marks members as occupied if they're already assigned to another booking at that time.
const getAvailableTeamsForService = async (req, res) => {
  try {
    const { serviceId, categoryId, scheduled_date, scheduled_time, exclude_booking_id } = req.query;

    if (!serviceId && !categoryId) {
      return res.status(400).json({ error: 'serviceId or categoryId is required' });
    }

    let query = supabase
      .from('teams')
      .select(`
        id,
        name,
        description,
        max_members,
        status,
        service_category_id,
        service_id,
        team_members(
          id,
          user_id,
          role,
          status,
          users(
            id,
            email,
            user_profiles(first_name, last_name, phone)
          )
        )
      `)
      .eq('status', 'active');

    if (serviceId && categoryId) {
      query = query.or(`service_id.eq.${serviceId},service_category_id.eq.${categoryId}`);
    } else if (serviceId) {
      query = query.eq('service_id', serviceId);
    } else {
      query = query.eq('service_category_id', categoryId);
    }

    const { data: teams, error } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Who is occupied at this date/time? (assigned to another booking at same slot)
    // Two-step: Supabase cannot filter on nested relation columns in one query.
    let occupiedUserIds = new Set();
    if (scheduled_date && scheduled_time) {
      let bookingsQuery = supabase
        .from('bookings')
        .select('id')
        .eq('scheduled_date', scheduled_date)
        .eq('scheduled_time', scheduled_time);
      if (exclude_booking_id) {
        bookingsQuery = bookingsQuery.neq('id', exclude_booking_id);
      }
      const { data: overlappingBookings } = await bookingsQuery;
      const overlappingIds = (overlappingBookings || []).map((b) => b.id).filter(Boolean);
      if (overlappingIds.length > 0) {
        const { data: occupiedAssignments } = await supabase
          .from('team_assignments')
          .select('assigned_members')
          .in('booking_id', overlappingIds);
        (occupiedAssignments || []).forEach((a) => {
          (a.assigned_members || []).forEach((uid) => occupiedUserIds.add(uid));
        });
      }
    }

    // Filter teams to only include those with available members; normalize user_id and set occupied
    const availableTeams = (teams || []).filter(team => {
      const activeMembers = (team.team_members || []).filter(m => m.status === 'active');
      return activeMembers.length > 0;
    }).map(team => {
      const members = (team.team_members || []).map(m => {
        const uid = m.user_id || m.users?.id;
        return {
          ...m,
          user_id: uid,
          occupied: uid ? occupiedUserIds.has(uid) : false
        };
      });
      return { ...team, team_members: members };
    });

    return res.json({ teams: availableTeams });

  } catch (error) {
    console.error('Error fetching available teams:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Get team assignment statistics
const getTeamAssignmentStats = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { period = '30' } = req.query; // days

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    // Get assignment statistics
    const { data: stats, error } = await supabase
      .from('team_assignments')
      .select('assignment_status, assigned_at')
      .eq('team_id', teamId)
      .gte('assigned_at', startDate.toISOString());

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Calculate statistics
    const totalAssignments = stats.length;
    const statusCounts = stats.reduce((acc, assignment) => {
      acc[assignment.assignment_status] = (acc[assignment.assignment_status] || 0) + 1;
      return acc;
    }, {});

    const completionRate = totalAssignments > 0 
      ? ((statusCounts.completed || 0) / totalAssignments * 100).toFixed(2)
      : 0;

    return res.json({
      team_id: teamId,
      period_days: parseInt(period),
      total_assignments: totalAssignments,
      status_breakdown: statusCounts,
      completion_rate: parseFloat(completionRate),
      average_completion_time: 'N/A' // Could be calculated from completed assignments
    });

  } catch (error) {
    console.error('Error fetching team assignment stats:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Get customer booking details with team information
const getCustomerBookingTeamDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Get bookings with team details using the view
    const { data: bookings, error } = await supabase
      .from('booking_team_details')
      .select('*')
      .eq('user_id', userId)
      .eq('internal_status', 'active')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Transform the data to include team information
    const transformedBookings = (bookings || []).map(booking => ({
      ...booking,
      is_team_booking: booking.is_team_booking || false,
      team_info: booking.is_team_booking ? {
        team_id: booking.team_id,
        team_name: booking.team_name,
        team_description: booking.team_description,
        team_size_required: booking.team_size_required,
        team_leader_name: booking.team_leader_first_name && booking.team_leader_last_name 
          ? `${booking.team_leader_first_name} ${booking.team_leader_last_name}` 
          : null,
        team_leader_phone: booking.team_leader_phone,
        team_leader_email: booking.team_leader_email,
        assignment_status: booking.assignment_status,
        team_assigned_at: booking.team_assignment_assigned_at,
        team_confirmed_at: booking.team_assignment_confirmed_at,
        team_started_at: booking.team_assignment_started_at,
        team_completed_at: booking.team_assignment_completed_at,
        team_notes: booking.team_assignment_notes
      } : null
    }));

    return res.json({ 
      bookings: transformedBookings,
      total_count: transformedBookings.length,
      team_bookings: transformedBookings.filter(b => b.is_team_booking).length
    });

  } catch (error) {
    console.error('Error fetching customer booking team details:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Routes
router.post('/assign', assignTeamToBooking);
router.get('/my-pending-responses/:userId', getMyPendingTeamResponses);
router.post('/assignment/:assignmentId/respond', respondToTeamAssignment);
router.get('/assignment/:assignmentId/acceptances', getAssignmentAcceptances);
router.get('/booking/:bookingId', getBookingTeamAssignments);
router.put('/assignment/:assignmentId/status', updateTeamAssignmentStatus);
router.get('/available', getAvailableTeamsForService);
router.get('/stats/:teamId', getTeamAssignmentStats);
router.get('/customer/:userId/bookings', getCustomerBookingTeamDetails);

module.exports = router;
