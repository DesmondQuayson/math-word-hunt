// A real session for a synthetic STAGING account, as the cookies the site itself
// would set. The staging sign-in form allows 20 attempts per 15 minutes, so a
// long browser suite signs in through the form once per spec file and uses this
// for the rest. Node only; the values never leave this process and its browser.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export async function sessionCookies(url, key, email, password) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`staging-session-failed:${error?.message ?? "no session"}`);
  const jar = new Map();
  const server = createServerClient(url, key, {
    cookies: {
      getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const cookie of cookies) jar.set(cookie.name, cookie.value);
      }
    }
  });
  const set = await server.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  if (set.error) throw new Error(`staging-session-failed:${set.error.message}`);
  await new Promise((done) => setTimeout(done, 40));
  if (jar.size === 0) throw new Error("staging-session-failed:no cookies");
  return { cookies: [...jar.entries()].map(([name, value]) => ({ name, value })), accessToken: data.session.access_token, userId: data.session.user.id };
}
