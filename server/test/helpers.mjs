/**
 * Signing in, for tests that need an account. Every /api route belongs to a
 * user now, so a test that wants to place a call has to be somebody.
 */
export async function signUp(base, {
  email = `test-${process.pid}-${Math.round(Date.now() % 1e6)}@example.com`,
  password = 'a long enough password',
  name = 'Rui',
  ownerPhone = '+15005550001',
} = {}) {
  const res = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`could not register a test account: ${body?.error}`)

  if (name && ownerPhone) {
    await fetch(`${base}/api/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${body.token}` },
      body: JSON.stringify({ ownerName: name, ownerPhone }),
    })
  }
  return { token: body.token, user: body.user, headers: authHeaders(body.token) }
}

export const authHeaders = (token) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
})
