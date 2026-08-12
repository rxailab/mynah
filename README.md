# Mynah

An assistant that makes phone calls for you. Say what needs doing in one
sentence — book the table, move the appointment, chase the parcel — and it
dials, talks it through in English or Chinese, and hands the call back to you
the moment a human needs to hear from a human.

Three parts, one product:

| | |
|---|---|
| [`server/`](server) | Node. Places the call through Twilio, runs the agent on the line, holds the accounts, the credits and the history. |
| [`android/`](android) | Kotlin and Compose. |
| [`ios/`](ios) | Swift and SwiftUI. |

The two apps are the same product, not two products: the same screens, the same
copy — [translated once and generated for iOS from the Android
resources](ios/tools/strings_from_android.py) — and the same icons, drawn from
one set of path data. Where they differ it is because the platform left no
choice, and each of those places is listed in [ios/README.md](ios/README.md) and
commented where it happens.

## Running it

```bash
cd server && npm install && cp .env.example .env   # then fill it in
npm start                                          # needs a public https host
npm test
```

`.env.example` documents every variable and what breaks without it. Nothing in
it is optional-by-accident: a missing Twilio account means no calls, a missing
mail provider means the app hides "forgot password" rather than offering a link
whose code has nowhere to go.

Deploying is [one script](server/deploy/README.md) onto a single small instance
behind a Cloudflare tunnel — no inbound port but SSH.

```bash
android/gradlew installDebug     # Android
ios/build.sh                     # iOS, or open ios/Mynah.xcodeproj
ios/run-device.sh                # iOS, on a plugged-in iPhone
```

## What is deliberately not here

`server/.env` and `server/data/` — the credentials and the call history,
transcripts included. Neither belongs in a repository, and both are ignored in
two places so that stays true whichever directory you run git from.
