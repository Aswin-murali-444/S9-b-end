const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const { sendTeamCreationNotifications } = require('../services/notificationService');

// Create a new team with existing providers
const createTeamWithExistingProviders = async (req, res) => {
  try {
    const { 
      name, 
      description, 
      team_leader_id, // ID of existing provider to be team leader
      service_category_id, 
      service_id, 
      max_members = 10,
      team_member_ids = [] // Array of existing provider IDs
    } = req.body;

    if (!name || !team_leader_id) {
      return res.status(400).json({ error: 'Team name and team leader ID are required' });
    }

    // Verify team leader exists and is a service provider
    const { data: teamLeader, error: leaderError } = await supabase
      .from('users')
      .select(`
        id,
        email,
        role,
        status,
        user_profiles(first_name, last_name, phone),
        service_provider_details(specialization, service_category_id, service_id, status)
      `)
      .eq('id', team_leader_id)
      .eq('role', 'service_provider')
      .single();

    if (leaderError || !teamLeader) {
      return res.status(400).json({ error: 'Team leader not found or not a service provider' });
    }

    // Check if team leader is already part of another team
    const { data: existingLeaderTeam, error: leaderTeamError } = await supabase
      .from('team_members')
      .select('team_id, teams(name)')
      .eq('user_id', team_leader_id)
      .eq('status', 'active')
      .single();

    if (existingLeaderTeam) {
      return res.status(400).json({ 
        error: `Team leader is already part of team "${existingLeaderTeam.teams.name}". Service providers can only be part of one team at a time.` 
      });
    }

    // Verify all team members exist and are service providers
    if (team_member_ids.length > 0) {
      const { data: teamMembers, error: membersError } = await supabase
        .from('users')
        .select(`
          id,
          email,
          role,
          status,
          user_profiles(first_name, last_name, phone),
          service_provider_details(specialization, service_category_id, service_id, status)
        `)
        .in('id', team_member_ids)
        .eq('role', 'service_provider');

      if (membersError || !teamMembers || teamMembers.length !== team_member_ids.length) {
        return res.status(400).json({ error: 'One or more team members not found or not service providers' });
      }

      // Check if any team members are already part of other teams
      const { data: existingMemberTeams, error: memberTeamError } = await supabase
        .from('team_members')
        .select('user_id, teams(name)')
        .in('user_id', team_member_ids)
        .eq('status', 'active');

      if (existingMemberTeams && existingMemberTeams.length > 0) {
        const conflictingMembers = existingMemberTeams.map(member => member.teams.name).join(', ');
        return res.status(400).json({ 
          error: `One or more team members are already part of other teams (${conflictingMembers}). Service providers can only be part of one team at a time.` 
        });
      }
    }

    // Create the team
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .insert({
        name,
        description,
        team_leader_id,
        service_category_id: service_category_id || null,
        service_id: service_id || null,
        max_members,
        status: 'active'
      })
      .select()
      .single();

    if (teamError) {
      return res.status(500).json({ error: teamError.message });
    }

    // Add team members to team_members table
    // Ensure team leader is a member (DB trigger may or may not exist)
    const { error: leaderMemberError } = await supabase
      .from('team_members')
      .upsert(
        [{ team_id: team.id, user_id: team_leader_id, role: 'leader', status: 'active' }],
        { onConflict: 'team_id,user_id' }
      );

    if (leaderMemberError) {
      await supabase.from('teams').delete().eq('id', team.id);
      return res.status(500).json({ error: 'Failed to add team leader as member: ' + leaderMemberError.message });
    }

    const membersToAdd = team_member_ids
      .filter(memberId => memberId !== team_leader_id) // Filter out team leader to avoid duplicate
      .map(memberId => ({
        team_id: team.id,
        user_id: memberId,
        role: 'member',
        status: 'active'
      }));

    if (membersToAdd.length > 0) {
      const { error: membersError } = await supabase
        .from('team_members')
        .upsert(membersToAdd, { onConflict: 'team_id,user_id' });

      if (membersError) {
        // Clean up team if adding members fails
        await supabase.from('teams').delete().eq('id', team.id);
        return res.status(500).json({ error: 'Failed to add team members: ' + membersError.message });
      }
    }

    // Fetch the complete team data with members
    const { data: completeTeam, error: fetchError } = await supabase
      .from('teams')
      .select(`
        *,
        team_members(
          id,
          role,
          status,
          joined_at,
          user_id,
          users:user_id(
            id,
            email,
            user_profiles(first_name, last_name, phone)
          )
        ),
        team_leaders:team_leader_id(
          id,
          email,
          user_profiles(first_name, last_name, phone)
        ),
        service_categories(name),
        services(name)
      `)
      .eq('id', team.id)
      .single();

    if (fetchError) {
      return res.status(500).json({ error: 'Failed to fetch team data: ' + fetchError.message });
    }

    // Send notifications to all team members
    try {
      const teamMembersForNotification = [
        { user_id: team_leader_id, role: 'leader' },
        ...team_member_ids
          .filter(memberId => memberId !== team_leader_id)
          .map(memberId => ({ user_id: memberId, role: 'member' }))
      ];

      const notificationResults = await sendTeamCreationNotifications(
        teamMembersForNotification,
        {
          id: team.id,
          name: team.name,
          description: team.description,
          max_members: team.max_members,
          service_category: completeTeam.service_categories?.name || 'General',
          service_name: completeTeam.services?.name || 'Team Service'
        }
      );

      console.log('Team creation notifications sent:', notificationResults);
    } catch (notificationError) {
      console.error('Failed to send team creation notifications:', notificationError);
      // Don't fail the team creation if notifications fail
    }

    return res.status(201).json({
      message: 'Team created successfully',
      team: completeTeam,
      memberCount: 1 + membersToAdd.length
    });

  } catch (error) {
    console.error('Error creating team with existing providers:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Create a new team (original method for creating new accounts)
const createTeam = async (req, res) => {
  try {
    const { 
      name, 
      description, 
      team_leader_data, // Team leader's personal data for account creation
      service_category_id, 
      service_id, 
      max_members = 10,
      team_members_data = [] // Array of team member data objects
    } = req.body;

    if (!name || !team_leader_data) {
      return res.status(400).json({ error: 'Team name and team leader data are required' });
    }

    // Import the createServiceProvider function
    const { createServiceProvider } = require('../middleware/providerAdmin');

    // Create team leader account first
    let team_leader_id;
    try {
      // Create the team leader as a service provider
      const leaderResult = await new Promise((resolve, reject) => {
        const mockReq = {
          body: {
            ...team_leader_data,
            sendEmail: team_leader_data.sendEmail !== false // Default to true
          }
        };
        const mockRes = {
          status: (code) => ({
            json: (data) => {
              if (code >= 200 && code < 300) {
                resolve(data);
              } else {
                reject(new Error(data.error || 'Failed to create team leader'));
              }
            }
          })
        };
        
        createServiceProvider(mockReq, mockRes);
      });

      if (!leaderResult.user || !leaderResult.user.id) {
        return res.status(400).json({ error: 'Failed to create team leader account' });
      }

      team_leader_id = leaderResult.user.id;
    } catch (leaderError) {
      console.error('Error creating team leader:', leaderError);
      return res.status(400).json({ error: `Failed to create team leader: ${leaderError.message}` });
    }

    // Create the team
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .insert({
        name,
        description,
        team_leader_id,
        service_category_id: service_category_id || null,
        service_id: service_id || null,
        max_members,
        status: 'active'
      })
      .select()
      .single();

    if (teamError) {
      return res.status(500).json({ error: teamError.message });
    }

    // Create individual accounts for each team member
    const createdMembers = [];
    const memberErrors = [];

    for (const memberData of team_members_data) {
      try {
        const memberResult = await new Promise((resolve, reject) => {
          const mockReq = {
            body: {
              ...memberData,
              sendEmail: memberData.sendEmail !== false // Default to true
            }
          };
          const mockRes = {
            status: (code) => ({
              json: (data) => {
                if (code >= 200 && code < 300) {
                  resolve(data);
                } else {
                  reject(new Error(data.error || 'Failed to create team member'));
                }
              }
            })
          };
          
          createServiceProvider(mockReq, mockRes);
        });

        if (memberResult.user && memberResult.user.id) {
          createdMembers.push({
            team_id: team.id,
            user_id: memberResult.user.id,
            role: memberData.role || 'member',
            status: 'active'
          });
        }
      } catch (error) {
        memberErrors.push(`Failed to create member ${memberData.full_name}: ${error.message}`);
      }
    }

    // Add team leader and members to team_members table (robust even if DB trigger is missing)
    const membersToAdd = [
      { team_id: team.id, user_id: team_leader_id, role: 'leader', status: 'active' },
      ...createdMembers
    ];

    const { error: membersError } = await supabase
      .from('team_members')
      .upsert(membersToAdd, { onConflict: 'team_id,user_id' });

    if (membersError) {
      // Clean up created accounts if adding to team fails
      const userIdsToDelete = [team_leader_id, ...createdMembers.map(m => m.user_id)];
      await supabase.from('users').delete().in('id', userIdsToDelete);
      await supabase.from('teams').delete().eq('id', team.id);
      return res.status(500).json({ error: 'Failed to add team members: ' + membersError.message });
    }

    // Fetch the complete team data with members
    const { data: completeTeam, error: fetchError } = await supabase
      .from('teams')
      .select(`
        *,
        team_members(
          id,
          role,
          status,
          joined_at,
          user_id,
          users:user_id(
            id,
            email,
            user_profiles(first_name, last_name, phone)
          )
        ),
        service_categories(name),
        services(name, price)
      `)
      .eq('id', team.id)
      .single();

    if (fetchError) {
      return res.status(500).json({ error: 'Team created but failed to fetch details: ' + fetchError.message });
    }

    return res.status(201).json({
      message: 'Team created successfully',
      team: completeTeam,
      createdAccounts: {
        leader: { id: team_leader_id, email: team_leader_data.email },
        members: createdMembers.length,
        memberErrors: memberErrors.length > 0 ? memberErrors : null
      }
    });

  } catch (error) {
    console.error('Error creating team:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Get all teams with their members
const getTeams = async (req, res) => {
  try {
    const { category_id, status, include_inactive = false } = req.query;

    let query = supabase
      .from('teams')
      .select(`
        *,
        team_members(
          id,
          role,
          status,
          joined_at,
          user_id,
          users:user_id(
            id,
            email,
            user_profiles(first_name, last_name, phone)
          )
        ),
        service_categories(name),
        services(name, price),
        team_leaders:team_leader_id(
          id,
          email,
          user_profiles(first_name, last_name, phone)
        )
      `);

    // Apply filters
    if (category_id) {
      query = query.eq('service_category_id', category_id);
    }

    if (status) {
      query = query.eq('status', status);
    } else if (!include_inactive) {
      query = query.eq('status', 'active');
    }

    const { data: teams, error } = await query.order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ teams: teams || [] });

  } catch (error) {
    console.error('Error fetching teams:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Get a specific team by ID
const getTeamById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: team, error } = await supabase
      .from('teams')
      .select(`
        *,
        team_members(
          id,
          role,
          status,
          joined_at,
          user_id,
          users:user_id(
            id,
            email,
            user_profiles(first_name, last_name, phone)
          )
        ),
        service_categories(name),
        services(name, price),
        team_leaders:team_leader_id(
          id,
          email,
          user_profiles(first_name, last_name, phone)
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Team not found' });
      }
      return res.status(500).json({ error: error.message });
    }

    return res.json({ team });

  } catch (error) {
    console.error('Error fetching team:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Update team details
const updateTeam = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, service_category_id, service_id, max_members, status } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (service_category_id !== undefined) updateData.service_category_id = service_category_id;
    if (service_id !== undefined) updateData.service_id = service_id;
    if (max_members !== undefined) updateData.max_members = max_members;
    if (status !== undefined) updateData.status = status;

    const { data: team, error } = await supabase
      .from('teams')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Team not found' });
      }
      return res.status(500).json({ error: error.message });
    }

    return res.json({
      message: 'Team updated successfully',
      team
    });

  } catch (error) {
    console.error('Error updating team:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Add member to team
const addTeamMember = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { user_id, role = 'member' } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Check if user is a service provider
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', user_id)
      .eq('role', 'service_provider')
      .single();

    if (userError || !user) {
      return res.status(400).json({ error: 'Invalid user. Must be a service provider.' });
    }

    // Enforce: service providers can only be part of one active team at a time
    const { data: existingMembershipRows, error: membershipError } = await supabase
      .from('team_members')
      .select('team_id, teams(name)')
      .eq('user_id', user_id)
      .eq('status', 'active')
      .limit(1);

    if (membershipError) {
      return res.status(500).json({ error: membershipError.message });
    }

    const existingMembership = (existingMembershipRows || [])[0];
    if (existingMembership && existingMembership.team_id && existingMembership.team_id !== teamId) {
      return res.status(400).json({
        error: `User is already part of team "${existingMembership.teams?.name || existingMembership.team_id}". Service providers can only be part of one team at a time.`
      });
    }

    // Check if team exists and has space
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('id, max_members, team_leader_id')
      .eq('id', teamId)
      .single();

    if (teamError || !team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Check current member count
    const { count: currentCount } = await supabase
      .from('team_members')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('status', 'active');

    if (currentCount >= team.max_members) {
      return res.status(400).json({ error: 'Team has reached maximum capacity' });
    }

    // Prevent downgrading/overwriting leader role via member insert
    if (team.team_leader_id === user_id) {
      return res.status(400).json({ error: 'User is already the team leader and should already be in the team.' });
    }

    // Add member
    const { data: member, error: memberError } = await supabase
      .from('team_members')
      .insert({
        team_id: teamId,
        user_id,
        role,
        status: 'active'
      })
      .select()
      .single();

    if (memberError) {
      if (memberError.code === '23505') { // Unique constraint violation
        return res.status(400).json({ error: 'User is already a member of this team' });
      }
      return res.status(500).json({ error: memberError.message });
    }

    return res.status(201).json({
      message: 'Team member added successfully',
      member
    });

  } catch (error) {
    console.error('Error adding team member:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Remove member from team
const removeTeamMember = async (req, res) => {
  try {
    const { teamId, memberId } = req.params;

    // Check if it's the team leader
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('team_leader_id')
      .eq('id', teamId)
      .single();

    if (teamError) {
      return res.status(404).json({ error: 'Team not found' });
    }

    if (team.team_leader_id === memberId) {
      return res.status(400).json({ error: 'Cannot remove team leader. Transfer leadership first.' });
    }

    const { error: deleteError } = await supabase
      .from('team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('user_id', memberId);

    if (deleteError) {
      return res.status(500).json({ error: deleteError.message });
    }

    return res.json({ message: 'Team member removed successfully' });

  } catch (error) {
    console.error('Error removing team member:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Get available service providers for team creation
const getAvailableProviders = async (req, res) => {
  try {
    const { exclude_team_id } = req.query;

    let query = supabase
      .from('users')
      .select(`
        id,
        email,
        status,
        user_profiles(first_name, last_name, phone),
        service_provider_details(specialization, service_category_id, service_id)
      `)
      .eq('role', 'service_provider')
      .eq('status', 'active');

    // Exclude providers who are already in teams (if specified)
    if (exclude_team_id) {
      const { data: existingMembers } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('team_id', exclude_team_id);

      if (existingMembers && existingMembers.length > 0) {
        const excludeIds = existingMembers.map(m => m.user_id);
        query = query.not('id', 'in', `(${excludeIds.join(',')})`);
      }
    }

    const { data: providers, error } = await query.order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ providers: providers || [] });

  } catch (error) {
    console.error('Error fetching available providers:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Delete team
const deleteTeam = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if team has any active bookings
    const { data: activeBookings } = await supabase
      .from('team_assignments')
      .select('id')
      .eq('team_id', id)
      .in('assignment_status', ['pending', 'confirmed', 'in_progress']);

    if (activeBookings && activeBookings.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete team with active bookings. Please complete or cancel bookings first.' 
      });
    }

    // Delete team (cascade will handle team_members and team_assignments)
    const { error } = await supabase
      .from('teams')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ message: 'Team deleted successfully' });

  } catch (error) {
    console.error('Error deleting team:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Get team members for a specific provider
const getProviderTeamMembers = async (req, res) => {
  try {
    const { providerId } = req.params;

    // First, check if the provider is a team leader
    const { data: teamAsLeader, error: leaderError } = await supabase
      .from('teams')
      .select(`
        id,
        name,
        description,
        team_members(
          id,
          role,
          status,
          joined_at,
          user_id,
          users:user_id(
            id,
            email,
            user_profiles(first_name, last_name, phone),
            service_provider_details(specialization, service_category_id, service_id, status)
          )
        )
      `)
      .eq('team_leader_id', providerId)
      .eq('status', 'active')
      .single();

    if (leaderError && leaderError.code !== 'PGRST116') {
      return res.status(500).json({ error: leaderError.message });
    }

    // If provider is a team leader, return team members
    if (teamAsLeader) {
      const teamMembers = teamAsLeader.team_members?.map(member => ({
        id: member.id,
        user_id: member.user_id,
        role: member.role,
        status: member.status,
        joined_at: member.joined_at,
        first_name: member.users?.user_profiles?.first_name || '',
        last_name: member.users?.user_profiles?.last_name || '',
        email: member.users?.email || '',
        phone: member.users?.user_profiles?.phone || '',
        specialization: member.users?.service_provider_details?.specialization || '',
        service_category_id: member.users?.service_provider_details?.service_category_id,
        service_id: member.users?.service_provider_details?.service_id,
        provider_status: member.users?.service_provider_details?.status || 'active'
      })) || [];

      return res.json({
        success: true,
        data: {
          team_id: teamAsLeader.id,
          team_name: teamAsLeader.name,
          team_description: teamAsLeader.description,
          team_members: teamMembers,
          is_team_leader: true
        }
      });
    }

    // If not a team leader, check if provider is a team member
    const { data: teamMembership, error: memberError } = await supabase
      .from('team_members')
      .select(`
        id,
        role,
        status,
        joined_at,
        team_id,
        teams(
          id,
          name,
          description,
          team_leader_id,
          team_members(
            id,
            role,
            status,
            joined_at,
            user_id,
            users:user_id(
              id,
              email,
              user_profiles(first_name, last_name, phone),
              service_provider_details(specialization, service_category_id, service_id, status)
            )
          )
        )
      `)
      .eq('user_id', providerId)
      .eq('status', 'active')
      .single();

    if (memberError && memberError.code !== 'PGRST116') {
      return res.status(500).json({ error: memberError.message });
    }

    if (teamMembership) {
      const teamMembers = teamMembership.teams.team_members?.map(member => ({
        id: member.id,
        user_id: member.user_id,
        role: member.role,
        status: member.status,
        joined_at: member.joined_at,
        first_name: member.users?.user_profiles?.first_name || '',
        last_name: member.users?.user_profiles?.last_name || '',
        email: member.users?.email || '',
        phone: member.users?.user_profiles?.phone || '',
        specialization: member.users?.service_provider_details?.specialization || '',
        service_category_id: member.users?.service_provider_details?.service_category_id,
        service_id: member.users?.service_provider_details?.service_id,
        provider_status: member.users?.service_provider_details?.status || 'active'
      })) || [];

      return res.json({
        success: true,
        data: {
          team_id: teamMembership.teams.id,
          team_name: teamMembership.teams.name,
          team_description: teamMembership.teams.description,
          team_members: teamMembers,
          is_team_leader: teamMembership.teams.team_leader_id === providerId
        }
      });
    }

    // Provider is not part of any team
    return res.json({
      success: true,
      data: {
        team_id: null,
        team_name: null,
        team_description: null,
        team_members: [],
        is_team_leader: false
      }
    });

  } catch (error) {
    console.error('Error fetching provider team members:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Routes
router.post('/', createTeam);
router.post('/with-existing-providers', createTeamWithExistingProviders);
router.get('/', getTeams);
router.get('/available-providers', getAvailableProviders);
router.get('/provider/:providerId/team', getProviderTeamMembers);
router.get('/:id', getTeamById);
router.put('/:id', updateTeam);
router.delete('/:id', deleteTeam);
router.post('/:teamId/members', addTeamMember);
router.delete('/:teamId/members/:memberId', removeTeamMember);

module.exports = router;
