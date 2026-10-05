# Trampoline Note iOS app

A native iOS app (Capacitor) that ships the web app's screens
(`artifacts/trampoline`) on the device and talks to the hosted API at
https://trampolinenote.com. Screens open instantly and work without signal;
data still lives on the server.

Because the screens are inside the app, a design change reaches iPhone users
only after you build and submit a new version to the App Store.

## Build (needs a Mac with Xcode)

```bash
pnpm install                                  # from the repo root
pnpm --filter @workspace/ios-app run build    # build the screens + copy into ios/
pnpm --filter @workspace/ios-app run open     # open in Xcode, then press Run
```

Publishing to the App Store or TestFlight needs an Apple Developer account.
App icon and launch screen live in `ios/App/App/Assets.xcassets`.

## How it connects

- Requests from the app come from `capacitor://localhost`; the API allows that
  origin (`api-server/src/app-client.ts`).
- iOS blocks cross-site cookies, so sign-in returns a session token that the
  app sends as `Authorization: Bearer …` (`trampoline/src/lib/native-app.ts`).
- The API's server must be deployed with these changes before the app can sign in.
