const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://zbscbvrklkntlbtefkgw.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpic2NidnJrbGtudGxidGVma2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwODgzOTIsImV4cCI6MjA2ODY2NDM5Mn0.EJbPGMn7kXFgj5IahA2GIiEcA3dTDCbgj9cF09rcsuY';

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('🔍 Querying Team Members Table...\n');

async function queryTeamMembers() {
  try {
    // Query team members with user and team details
    const { data: teamMembers, error } = await supabase
      .from('team_members')
      .select(`
        id,
        team_id,
        user_id,
        role,
        status,
        joined_at,
        teams (
          id,
          name,
          team_leader_id,
          status
        ),
        users (
          id,
          email,
          role,
          status,
          user_profiles (
            first_name,
            last_name,
            phone
          )
        )
      `)
      .order('joined_at', { ascending: false });

    if (error) {
      console.error('❌ Error querying team_members:', error);
      return;
    }

    if (!teamMembers || teamMembers.length === 0) {
      console.log('📭 No team members found in the table.');
      return;
    }

    console.log(`✅ Found ${teamMembers.length} team member record(s):\n`);
    console.log('═'.repeat(100));

    teamMembers.forEach((tm, index) => {
      const user = tm.users;
      const team = tm.teams;
      const profile = user?.user_profiles?.[0] || {};
      const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'N/A';
      const isLeader = team?.team_leader_id === tm.user_id;

      console.log(`\n${index + 1}. Team Member Record:`);
      console.log(`   ┌─ Team Member ID: ${tm.id}`);
      console.log(`   ├─ Team: ${team?.name || 'N/A'} (ID: ${tm.team_id})`);
      console.log(`   ├─ User ID: ${tm.user_id}`);
      console.log(`   ├─ Email: ${user?.email || 'N/A'}`);
      console.log(`   ├─ Name: ${fullName}`);
      console.log(`   ├─ Phone: ${profile.phone || 'N/A'}`);
      console.log(`   ├─ User Role: ${user?.role || 'N/A'}`);
      console.log(`   ├─ User Status: ${user?.status || 'N/A'}`);
      console.log(`   ├─ Member Role: ${tm.role || 'N/A'} ${isLeader ? '(Team Leader)' : ''}`);
      console.log(`   ├─ Member Status: ${tm.status || 'N/A'}`);
      console.log(`   └─ Joined At: ${tm.joined_at ? new Date(tm.joined_at).toLocaleString() : 'N/A'}`);
    });

    console.log('\n' + '═'.repeat(100));

    // Summary by team
    console.log('\n📊 Summary by Team:');
    const teamSummary = {};
    teamMembers.forEach(tm => {
      const teamName = tm.teams?.name || 'Unknown Team';
      if (!teamSummary[teamName]) {
        teamSummary[teamName] = {
          total: 0,
          active: 0,
          inactive: 0,
          leaders: 0,
          members: 0
        };
      }
      teamSummary[teamName].total++;
      if (tm.status === 'active') teamSummary[teamName].active++;
      if (tm.status === 'inactive') teamSummary[teamName].inactive++;
      if (tm.role === 'leader' || tm.teams?.team_leader_id === tm.user_id) {
        teamSummary[teamName].leaders++;
      } else {
        teamSummary[teamName].members++;
      }
    });

    Object.entries(teamSummary).forEach(([teamName, stats]) => {
      console.log(`\n   ${teamName}:`);
      console.log(`   ├─ Total Members: ${stats.total}`);
      console.log(`   ├─ Active: ${stats.active}`);
      console.log(`   ├─ Inactive: ${stats.inactive}`);
      console.log(`   ├─ Leaders: ${stats.leaders}`);
      console.log(`   └─ Regular Members: ${stats.members}`);
    });

    // Unique users summary
    const uniqueUserIds = new Set(teamMembers.map(tm => tm.user_id));
    console.log(`\n👥 Total Unique Users in Team Members: ${uniqueUserIds.size}`);

  } catch (err) {
    console.error('❌ Unexpected error:', err);
  }
}

queryTeamMembers();
