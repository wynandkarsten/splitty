# Splitty

Bill and group-expense splitting. One Expo / React Native codebase for Android, iOS and web. Local-first: all data lives in SQLite on the device (IndexedDB-backed wa-sqlite on web). No account, no server, no tracking.

## Features
Groups and members, expenses with equal / exact / percent / shares splits, categories, per-expense currency, receipt photos, simplified settle-up, recorded payments, recurring expenses, CSV export, search.

## Install
- Android: https://tenkodigital.com/splitty/downloads/splitty.apk
- Web / iPhone: https://tenkodigital.com/splitty/ (iPhone: Safari, Share, Add to Home Screen)
- Privacy: https://tenkodigital.com/splitty/privacy.html

## Develop
    npm install
    npx tsc --noEmit && npx expo lint && npx jest
    npx expo start

## Build
- Web: `npm run build:web`, then publish `dist/` under `/splitty/`.
- Android (needs a full JDK 17+ and the Android SDK; from `android/`):
  `JAVA_HOME=<jdk> ANDROID_HOME=<sdk> ./gradlew --no-daemon --max-workers=2 -PreactNativeArchitectures=arm64-v8a assembleRelease bundleRelease`
- Release signing reads `~/.splitty-signing/keystore.properties`. Keep the keystore out of the repo and back it up.

## Store listing
See `store/LISTING.md` and the screenshots in `store/`.

`supabase/` holds an unused early backend scaffold.
