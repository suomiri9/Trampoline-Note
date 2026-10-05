# Trampoline Note iOS app

A native iOS shell (Capacitor) around the live web app at https://trampolinenote.com.
Every feature works as on the web, and web deploys reach the app without an App Store update.
Only the offline fallback page (`www/offline.html`) ships inside the app.

## Build (needs a Mac with Xcode)

```bash
pnpm install                                  # from the repo root
pnpm --filter @workspace/ios-app run sync     # copy config into ios/
pnpm --filter @workspace/ios-app run open     # open in Xcode, then press Run
```

Publishing to the App Store or TestFlight needs an Apple Developer account.
The app URL lives in `capacitor.config.ts`; run `sync` again after changing it.
App icon and launch screen live in `ios/App/App/Assets.xcassets`.
