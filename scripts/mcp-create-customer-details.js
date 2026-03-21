const { supabase } = require('../lib/supabase');

async function run() {
  const sql = `
CREATE TABLE IF NOT EXISTS public.customer_details (
  id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  preferred_services text[] DEFAULT '{}'::text[],
  emergency_contact_name text DEFAULT '',
  emergency_contact_phone text DEFAULT '',
  special_requirements text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.customer_details
  ADD COLUMN IF NOT EXISTS preferred_services text[] DEFAULT '{}'::text[];
ALTER TABLE public.customer_details
  ADD COLUMN IF NOT EXISTS emergency_contact_name text DEFAULT '';
ALTER TABLE public.customer_details
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text DEFAULT '';
ALTER TABLE public.customer_details
  ADD COLUMN IF NOT EXISTS special_requirements text DEFAULT '';
ALTER TABLE public.customer_details
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.customer_details
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.customer_details
SET preferred_services = '{}'::text[]
WHERE preferred_services IS NULL;

INSERT INTO public.customer_details (id, preferred_services, emergency_contact_name, emergency_contact_phone, special_requirements)
SELECT u.id, '{}'::text[], '', '', ''
FROM public.users u
LEFT JOIN public.customer_details cd ON cd.id = u.id
WHERE u.role = 'customer' AND cd.id IS NULL;
`;

  const { data, error } = await supabase.rpc('mcp_execute_sql', {
    p_sql: sql
  });

  if (error) {
    console.error('RPC error:', error.message);
    process.exit(1);
  }

  console.log('MCP SQL response:', JSON.stringify(data, null, 2));
}

run().catch((e) => {
  console.error('Unhandled error:', e?.message || e);
  process.exit(1);
});

