# ClearFlow Mobile App Shells

ClearFlow now has Capacitor app shells for Android and iOS.

## Commands

```bash
npm run mobile:sync
npm run mobile:open:android
npm run mobile:open:ios
```

## Current Status

- Android shell exists in `android/`.
- iOS shell exists in `ios/`.
- Web assets are copied from `dist/`.
- App ID is `site.clearflow.app`.
- App name is `ClearFlow`.

## Store Readiness Checklist

- Replace generated icons and splash assets with final ClearFlow branding.
- Test Google sign-in, Plaid Link, uploads, camera/file selection, and deep links on device.
- Prepare privacy policy, terms, support URL, app screenshots, and reviewer demo credentials.
- Use careful financial wording: ClearFlow tracks, prepares, administers, and routes records; live payments or financial execution occur only through connected and authorized third-party providers or financial institutions.
- Build Android from Android Studio.
- Build iOS from Xcode on macOS.

## Notes

Android can be worked from this Windows machine with Android Studio installed.
iOS requires macOS/Xcode for final simulator/device builds and App Store upload.
