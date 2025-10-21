const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

// Assign team to a booking
const assignTeamToBooking = async (req, res) => {
  try {
    const { booking_id, team_id, assigned_member_ids, notes } = req.body;

    if (!booking_id || !team_id || !assigned_member_ids || !Array.isArray(assigned_member_ids)) {
      return res.status(400).json({ 
        error: 'booking_id, team_id, and assigned_member_ids array are required' 
      });
    }

    // Verify booking exists
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, service_id, category_id, booking_status')
      .eq('id', booking_id)
      .single();

    if (bookingError || !booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Verify team exists and is active
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('id, status, team_members(id, user_id, status)')
      .eq('id', team_id)
      .eq('status', 'active')
      .single();

    if (teamError || !team) {
      return res.status(404).json({ error: 'Team not found or inactive' });
    }

    // Verify all assigned members are part of the team and active
    const teamMemberIds = team.team_members
      .filter(member => member.status === 'active')
      .map(member => member.user_id);

    const invalidMembers = assigned_member_ids.filter(id => !teamMemberIds.includes(id));
    if (invalidMembers.length > 0) {
      return res.status(400).json({ 
        error: `Invalid team members: ${invalidMembers.join(', ')}` 
      });
    }

    // Create team assignment
    const { data: assignment, error: assignmentError } = await supabase
      .from('team_assignments')
      .insert({
        booking_id,
        team_id,
        assigned_members: assigned_member_ids,
        assignment_status: 'pending',
        notes: notes || null
      })
      .select()
      .single();

    if (assignmentError) {
      return res.status(500).json({ error: assignmentError.message });
    }

    // Update booking with team assignment info
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        assigned_provider_id: team.team_members.find(m => m.user_id === assigned_member_ids[0])?.id, // Assign first member as primary
        provider_assigned_at: new Date().toISOString(),
        preferred_provider_notes: `Team assignment: ${team.name}`
      })
      .eq('id', booking_id);

    if (updateError) {
      console.warn('Failed to update booking with team assignment:', updateError);
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

// Get teams available for a specific service
const getAvailableTeamsForService = async (req, res) => {
  try {
    const { serviceId, categoryId } = req.query;

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

    if (serviceId) {
      query = query.eq('service_id', serviceId);
    } else if (categoryId) {
      query = query.eq('service_category_id', categoryId);
    }

    const { data: teams, error } = await supabase
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
          role,
          status,
          users(
            id,
            email,
            user_profiles(first_name, last_name, phone)
          )
        )
      `)
      .eq('status', 'active')
      .or(`service_id.eq.${serviceId},service_category_id.eq.${categoryId}`);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Filter teams to only include those with available members
    const availableTeams = (teams || []).filter(team => {
      const activeMembers = team.team_members.filter(member => member.status === 'active');
      return activeMembers.length > 0;
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

// Routes
router.post('/assign', assignTeamToBooking);
router.get('/booking/:bookingId', getBookingTeamAssignments);
router.put('/assignment/:assignmentId/status', updateTeamAssignmentStatus);
router.get('/available', getAvailableTeamsForService);
router.get('/stats/:teamId', getTeamAssignmentStats);

module.exports = router;
