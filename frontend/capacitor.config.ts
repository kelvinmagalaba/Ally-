import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gasapp.delivery',
  appName: 'Gas Delivery',
  webDir: 'dist',

  // The compiled web app is bundled into the APK, so the WebView loads
  // assets from the file:// scheme inside the app. We only need the
  // server config below if you want hot-reload during development on a
  // physical device. Leave it commented out for production builds.
  //
  // server: {
  //   url: 'http://192.168.x.x:8080',  // your laptop's LAN IP + Vite port
  //   cleartext: true,
  // },

  android: {
    // Required so the WebView can call your http:// LAN backend during
    // dev. For production with a deployed https backend, you can remove
    // this line for stricter security.
    allowMixedContent: true,
  },

  plugins: {
    Geolocation: {
      // No special config needed — the @capacitor/geolocation plugin
      // adds ACCESS_FINE_LOCATION + ACCESS_COARSE_LOCATION permissions
      // to AndroidManifest.xml automatically when you run `cap sync`.
    },
  },
};

export default config;
