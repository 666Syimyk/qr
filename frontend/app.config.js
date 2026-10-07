/** @type {import('expo/config').ExpoConfig} */
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    // GitHub Pages is hosted beneath /qr; Render serves from the domain root.
    baseUrl: process.env.EXPO_BASE_URL ?? config.experiments?.baseUrl ?? "/qr",
  },
});
