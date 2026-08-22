// The cooldown on asking for another verification call.
//
// Every one of those calls dials a real phone and is billed, and the screen puts
// "ring me again" a tap away from the code — so an impatient person on a slow
// network can put three calls out for one verification. The decision is a pure
// function so it can be checked without Twilio: the route around it only turns
// a number of seconds into a 429.
process.env.PUBLIC_HOST = 'cooldown-test.example.com'
process.env.TWILIO_ACCOUNT_SID = 'AC00000000000000000000000000000000'
process.env.TWILIO_AUTH_TOKEN = '00000000000000000000000000000000'
process.env.TWILIO_FROM_NUMBER = '+15005550006'
process.env.PROFILE_FILE = `C:/dev-tools/cooldown-test-${process.pid}.json`
process.env.DB_FILE = ':memory:'
process.env.CALLER_ID_VERIFY_COOLDOWN = '90'

const { verifyCooldownRemaining } = await import('../src/twilio/callerId.js')
const accounts = await import('../src/accounts.js')

const checks = []
const check = (label, ok) => checks.push([label, ok])

const NOW = 1_700_000_000_000
const at = (msAgo) => ({ callerIdLastCallAt: NOW - msAgo })

// --- the plain arithmetic ---------------------------------------------------
check('a fresh account may call straight away', verifyCooldownRemaining({}, NOW) === 0)
check('so may one whose last call is unknown', verifyCooldownRemaining(null, NOW) === 0)
check('just called: the full window remains', verifyCooldownRemaining(at(0), NOW) === 90)
check('a second in: 89 left', verifyCooldownRemaining(at(1_000), NOW) === 89)
check('half way: 45 left', verifyCooldownRemaining(at(45_000), NOW) === 45)
// Rounded up, never down: reporting 0 while the gate is still shut would send
// the app back for a call the server is about to refuse.
check('a fraction of a second still counts', verifyCooldownRemaining(at(89_400), NOW) === 1)
check('exactly at the boundary is allowed', verifyCooldownRemaining(at(90_000), NOW) === 0)
check('past it is allowed', verifyCooldownRemaining(at(120_000), NOW) === 0)

// A clock that went backwards — NTP, a restored backup — must not lock someone
// out for hours.
check('a timestamp in the future does not strand anyone',
  verifyCooldownRemaining({ callerIdLastCallAt: NOW + 3_600_000 }, NOW) <= 90)

// --- the record it reads ----------------------------------------------------
// saveCallerIdAttempt is the path a placed call goes through, and the cooldown
// depends on it writing a timestamp that outlives the attempt it belongs to.
const { user } = await accounts.registerWithEmail(`cooldown${process.pid}@example.com`, 'longenough1', 'Cooldown')

check('a new account is not in cooldown', verifyCooldownRemaining(accounts.getUser(user.id)) === 0)

accounts.saveCallerIdAttempt(user.id, { code: '123456', callSid: 'CA1' })
const placed = accounts.getUser(user.id)
check('placing a call stamps the last-call time', placed.callerIdLastCallAt > 0)
check('and the cooldown sees it', verifyCooldownRemaining(placed) > 0)

// The attempt is cleared the moment its call resolves. This is the case the
// cooldown exists for: the call is over, the record of it is gone, and another
// one must still not go out yet.
accounts.clearCallerIdAttempt(user.id)
const cleared = accounts.getUser(user.id)
check('clearing the attempt does not clear the cooldown',
  !cleared.callerIdAttempt && verifyCooldownRemaining(cleared) > 0)

// Changing the number wipes the verification, but the call that was already
// placed still happened and was still billed.
accounts.saveUserProfile(user.id, { name: 'Cooldown', ownerPhone: '+447700900123' })
check('changing the number does not hand back a free call',
  verifyCooldownRemaining(accounts.getUser(user.id)) > 0)

console.log('=== checks ===')
let bad = 0
for (const [label, ok] of checks) {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`)
}
console.log(bad === 0 ? '\nRESULT: the cooldown holds' : `\nRESULT: ${bad} check(s) failed`)
process.exit(bad === 0 ? 0 : 1)
