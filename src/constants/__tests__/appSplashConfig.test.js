const appConfig = require('../../../app.json');

function getSplashConfig() {
  const splashPlugin = appConfig.expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen');
  return splashPlugin[1];
}

describe('native splash config', () => {
  it('uses the branded native splash composition', () => {
    expect(getSplashConfig()).toMatchObject({
      image: './assets/kondor-native-splash.png',
      imageWidth: 320,
      resizeMode: 'contain',
      backgroundColor: '#000000',
    });
    expect(appConfig.expo.android.adaptiveIcon.backgroundColor).toBe('#000000');
  });
});
