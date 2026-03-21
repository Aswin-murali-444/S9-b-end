-- Query to see all users in the team_members table
-- This query shows team member details with user information and team details

SELECT 
    tm.id AS team_member_id,
    tm.team_id,
    t.name AS team_name,
    tm.user_id,
    u.email AS user_email,
    u.role AS user_role,
    u.status AS user_status,
    CONCAT(COALESCE(up.first_name, ''), ' ', COALESCE(up.last_name, '')) AS user_full_name,
    up.phone AS user_phone,
    tm.role AS member_role,
    tm.status AS member_status,
    tm.joined_at,
    t.team_leader_id,
    CASE 
        WHEN t.team_leader_id = tm.user_id THEN 'Yes' 
        ELSE 'No' 
    END AS is_team_leader
FROM 
    team_members tm
    INNER JOIN teams t ON tm.team_id = t.id
    INNER JOIN users u ON tm.user_id = u.id
    LEFT JOIN user_profiles up ON u.id = up.user_id
ORDER BY 
    t.name ASC,
    tm.joined_at DESC;

-- Summary: Count of team members per team
SELECT 
    t.name AS team_name,
    COUNT(tm.id) AS total_members,
    COUNT(CASE WHEN tm.status = 'active' THEN 1 END) AS active_members,
    COUNT(CASE WHEN tm.status = 'inactive' THEN 1 END) AS inactive_members,
    COUNT(CASE WHEN tm.role = 'leader' THEN 1 END) AS leaders,
    COUNT(CASE WHEN tm.role = 'member' THEN 1 END) AS regular_members
FROM 
    teams t
    LEFT JOIN team_members tm ON t.id = tm.team_id
GROUP BY 
    t.id, t.name
ORDER BY 
    t.name ASC;

-- List all unique users who are team members (regardless of which team)
SELECT DISTINCT
    u.id AS user_id,
    u.email,
    u.role,
    u.status,
    CONCAT(COALESCE(up.first_name, ''), ' ', COALESCE(up.last_name, '')) AS full_name,
    up.phone,
    COUNT(DISTINCT tm.team_id) AS number_of_teams,
    STRING_AGG(DISTINCT t.name, ', ') AS team_names
FROM 
    users u
    INNER JOIN team_members tm ON u.id = tm.user_id
    INNER JOIN teams t ON tm.team_id = t.id
    LEFT JOIN user_profiles up ON u.id = up.user_id
GROUP BY 
    u.id, u.email, u.role, u.status, up.first_name, up.last_name, up.phone
ORDER BY 
    u.email ASC;
