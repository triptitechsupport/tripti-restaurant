# Tripti Staff (Android)

One Android app for all staff. It opens the staff sign-in of the website
(`/staff-login`); after signing in, each person lands on their own screen:

| Login list (admin creates it) | Opens |
| --- | --- |
| Admin | Admin dashboard |
| Waiter | Service screen |
| Cashier | Service screen with Receipts |
| Kitchen / Kitchen manager | Kitchen display |
| Stock manager | Stock dashboard |
| Auditor | Receipts and DEP7 export, view only |

The app shows the live website screens, so every website update reaches the
app without a new install. Printing goes through Android printing, and
exports are saved to `Downloads/Tripti`.

## Get the APK

GitHub → Actions → "Android staff app" → latest run → Artifacts →
`tripti-staff-apk`. Unzip it and install `app-debug.apk` on the phone or
tablet (allow "install unknown apps" once).

## Change the server

Edit `server.url` in `capacitor.config.json` (now `https://www.triptistore.in/staff-login`).

## Build on your own PC

Needs Node 22, Java 21 and Android Studio (SDK 36).

```
cd android-app
npm ci
npm run apk        # APK: android/app/build/outputs/apk/debug/app-debug.apk
```

Or `npx cap open android` to open it in Android Studio.

## Test the app mode in a browser

Open any page with `?app=1` (for example `/staff-login?app=1`); `?app=0` turns it off.
