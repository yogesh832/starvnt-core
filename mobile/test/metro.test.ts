import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appRequire = createRequire(path.join(appRoot, 'index.ts'));
const { resolver } = appRequire('./metro.config.cjs');

test('hoisted dependencies resolve React and renderer entry points from the mobile app', () => {
  const context = {
    originModulePath: path.resolve(appRoot, '../node_modules/shared-dependency/index.js'),
    resolveRequest(context: any, moduleName: string) {
      return { type: 'sourceFile', filePath: createRequire(context.originModulePath).resolve(moduleName) };
    },
  };
  for (const name of ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom', 'react-dom/client']) {
    for (const platform of ['android', 'ios', 'web']) {
      assert.equal(resolver.resolveRequest(context, name, platform).filePath, appRequire.resolve(name));
    }
  }
});

test('mobile React resolution preserves the default resolver for other packages', () => {
  const context = {
    originModulePath: '/original/index.js',
    resolveRequest(received: any, name: string, platform: string) {
      assert.equal(received, context);
      return { name, platform };
    },
  };
  for (const name of ['react-native', '@react-navigation/native', 'react-dom-extra']) {
    assert.deepEqual(resolver.resolveRequest(context, name, 'android'), { name, platform: 'android' });
  }
});
