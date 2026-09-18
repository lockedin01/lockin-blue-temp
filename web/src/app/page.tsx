import { redirect } from 'next/navigation';

import { getSession, HOME_FOR_ROLE } from '@/lib/auth';

/**
 * The app has no public front door. It is strictly B2B — a worker arrives only
 * through an employer's invite — so `/` resolves the session and routes to the
 * landing screen for that role. The only real entries are /login and
 * /invite/[code]; there is no sign-up, here or anywhere.
 */
export default async function RootPage() {
  const session = await getSession();

  if (!session) redirect('/login');
  redirect(HOME_FOR_ROLE[session.role]);
}
