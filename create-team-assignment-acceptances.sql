-- Team assignment acceptances: each assigned member can accept or decline the job
-- Run this in Supabase SQL editor or via your migration runner

CREATE TABLE IF NOT EXISTS public.team_assignment_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_assignment_id UUID NOT NULL REFERENCES public.team_assignments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  responded_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_assignment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_assignment_acceptances_assignment ON public.team_assignment_acceptances(team_assignment_id);
CREATE INDEX IF NOT EXISTS idx_team_assignment_acceptances_user ON public.team_assignment_acceptances(user_id);
CREATE INDEX IF NOT EXISTS idx_team_assignment_acceptances_status ON public.team_assignment_acceptances(status);

COMMENT ON TABLE public.team_assignment_acceptances IS 'Per-member accept/decline for team job assignments';
