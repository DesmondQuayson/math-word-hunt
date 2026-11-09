export function sessionCookies(
  url: string,
  key: string,
  email: string,
  password: string
): Promise<{ cookies: { name: string; value: string }[]; accessToken: string; userId: string }>;
