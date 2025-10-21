const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

// Create a new team
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

    // Add team leader and members to team_members table
    const membersToAdd = [
      { team_id: team.id, user_id: team_leader_id, role: 'leader', status: 'active' },
      ...createdMembers
    ];

    const { error: membersError } = await supabase
      .from('team_members')
      .insert(membersToAdd);

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

    // Check if team exists and has space
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('max_members')
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

// Routes
router.post('/', createTeam);
router.get('/', getTeams);
router.get('/available-providers', getAvailableProviders);
router.get('/:id', getTeamById);
router.put('/:id', updateTeam);
router.delete('/:id', deleteTeam);
router.post('/:teamId/members', addTeamMember);
router.delete('/:teamId/members/:memberId', removeTeamMember);

module.exports = router;
