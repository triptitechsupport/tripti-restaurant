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
app without a new install. Inside the app:

- Printing (kitchen tickets, receipts, barcode labels) goes through Android
  printing. For the Epson TM-T20III install "Epson iPrint" or the Epson
  print service plugin on the device.
- Exports (DEP7, CSV) are saved to `Downloads/Tripti`.
- Camera (barcode scanning) and microphone (staff calls) ask for permission
  the first time.
- The screen stays on; logins are not included in phone backups.
- Without internet, an offline page with "Try again" is shown.

## Get the APK

Every build is published here (also shown with a QR code in the admin
dashboard under "Staff app" and on `/staff-login`):

https://github.com/triptitechsupport/tripti-restaurant/releases/download/staff-app-latest/tripti-staff.apk

Open it on the phone or tablet and allow "install unknown apps" once.

The screens come from the website, so the app itself rarely needs an update.

## Smooth updates (optional, once)

Without a fixed signing key, each build is signed differently and Android
asks you to uninstall the old app first. To avoid that, add two repository
secrets (GitHub → Settings → Secrets and variables → Actions):

- `ANDROID_KEYSTORE_B64`: the keystore file, base64 encoded
- `ANDROID_KEYSTORE_PASSWORD`: its password (key alias `tripti`)

Create the keystore once with
`keytool -genkeypair -keystore tripti.jks -storetype PKCS12 -alias tripti -keyalg RSA -keysize 2048 -validity 10000`
and keep a backup of it; the same key is needed for the Play Store later.

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
