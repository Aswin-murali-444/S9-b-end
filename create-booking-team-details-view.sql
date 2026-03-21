-- Create booking_team_details view for customer dashboard
-- This view provides comprehensive booking information with team details

CREATE OR REPLACE VIEW booking_team_details AS
SELECT 
  b.id,
  b.user_id,
  b.service_id,
  b.category_id,
  b.scheduled_date,
  b.scheduled_time,
  b.duration_minutes,
  b.service_address,
  b.service_city,
  b.service_state,
  b.service_country,
  b.service_postal_code,
  b.service_location_latitude,
  b.service_location_longitude,
  b.service_location_accuracy_m,
  b.contact_phone,
  b.contact_email,
  b.emergency_contact_name,
  b.emergency_contact_phone,
  b.special_instructions,
  b.additional_requirements,
  b.preferred_provider_notes,
  b.base_price,
  b.service_fee,
  b.tax_amount,
  b.total_amount,
  b.offer_applied,
  b.offer_discount_amount,
  b.payment_method,
  b.payment_status,
  b.payment_transaction_id,
  b.payment_gateway_response,
  b.booking_status,
  b.assigned_provider_id,
  b.provider_assigned_at,
  b.provider_confirmed_at,
  b.created_at,
  b.updated_at,
  b.confirmed_at,
  b.started_at,
  b.completed_at,
  b.cancelled_at,
  b.customer_rating,
  b.customer_feedback,
  b.provider_rating,
  b.provider_feedback,
  b.feedback_submitted_at,
  b.admin_notes,
  b.internal_status,
  b.priority_level,
  b.booking_source,
  b.ip_address,
  b.user_agent,
  b.referral_source,
  b.assigned_team_id,
  b.team_assigned_at,
  b.is_team_booking,
  b.team_size_required,
  -- Team assignment info
  t.id as team_id,
  t.name as team_name,
  t.description as team_description,
  ta.assignment_status,
  ta.assigned_members,
  ta.assigned_at as team_assignment_assigned_at,
  ta.confirmed_at as team_assignment_confirmed_at,
  ta.started_at as team_assignment_started_at,
  ta.completed_at as team_assignment_completed_at,
  ta.notes as team_assignment_notes,
  -- Team leader info
  tl.email as team_leader_email,
  tl_profile.first_name as team_leader_first_name,
  tl_profile.last_name as team_leader_last_name,
  tl_profile.phone as team_leader_phone,
  -- Service info
  sc.name as service_category_name,
  s.name as service_name
FROM bookings b
LEFT JOIN team_assignments ta ON b.id = ta.booking_id
LEFT JOIN teams t ON ta.team_id = t.id
LEFT JOIN users tl ON t.team_leader_id = tl.id
LEFT JOIN user_profiles tl_profile ON tl.id = tl_profile.id
LEFT JOIN service_categories sc ON b.category_id = sc.id
LEFT JOIN services s ON b.service_id = s.id;

-- Grant permissions for the view
GRANT SELECT ON booking_team_details TO authenticated;
GRANT SELECT ON booking_team_details TO anon;






