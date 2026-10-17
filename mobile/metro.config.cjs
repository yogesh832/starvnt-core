const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const appEntry = path.join(__dirname, 'index.ts');

// The Vite workspace uses React 18. Every mobile import, including imports
// inside hoisted dependencies, must resolve this app's React 19 installation.
// React/React DOM are JS packages; Metro owns their resolution rather than
// native autolinking (see expo.autolinking.exclude in package.json).
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const isReact = ['react', 'react-dom'].some(
    name => moduleName === name || moduleName.startsWith(`${name}/`),
  );
  return context.resolveRequest(
    isReact ? { ...context, originModulePath: appEntry } : context,
    moduleName,
    platform,
  );
};

module.exports = config;
