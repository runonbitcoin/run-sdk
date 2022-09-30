/**
 * webpack.config.js
 *
 * All the settings to build variants using webpack
 */

require('dotenv').config()
const webpack = require('webpack')
const TerserPlugin = require('terser-webpack-plugin')
const path = require('path')
const fs = require('fs-extra')
const { execSync } = require('child_process')
const glob = require('glob')
const pkg = require('./package')

// ------------------------------------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------------------------------------

const entry = path.join(__dirname, 'lib')
const dist = path.join(__dirname, 'dist/')
const nodemodules = path.join(__dirname, 'node_modules/')
const name = pkg.name.split('/').pop()
const library = require(entry).name
const version = new webpack.DefinePlugin({ VERSION: JSON.stringify(pkg.version) })
const browserVariant = new webpack.DefinePlugin({ VARIANT: JSON.stringify('browser') })
const nodeVariant = new webpack.DefinePlugin({ VARIANT: JSON.stringify('node') })

// ------------------------------------------------------------------------------------------------
// Initialization
// ------------------------------------------------------------------------------------------------

// Create dist folder
if (!fs.existsSync(dist)) fs.mkdirSync(dist)

// Copy the browser build of the bsv library
if (!fs.existsSync('./dist/bsv.browser.min.js')) {
  execSync('npm explore bsv -- npm run build-bsv')
  fs.copyFileSync(require.resolve('bsv/bsv.min.js'), './dist/bsv.browser.min.js')
}

// ------------------------------------------------------------------------------------------------
// Terser options
// ------------------------------------------------------------------------------------------------

// Reserved variables, usually for sandboxing reasons
const reservedNames = [
  // Kernel classes
  'Jig', 'JigDeps', 'Berry', 'BerryDeps', 'Code', 'CodeDeps', 'Creation', 'CreationDeps', 'CommonLock',
  // Extras
  'asm', 'B', 'Base58', 'expect', 'Group', 'Hex', 'NFT', 'sha256', 'Token', 'Tx', 'txo',
  // Plugins
  'BrowserCache', 'DiskCache', 'IndexedDBCache', 'Inventory', 'LocalCache', 'LocalOwner', 'LocalPurse',
  'LocalState', 'Mockchain', 'NodeCache', 'PayServer', 'RunConnect', 'RunDB',
  'StateServer', 'Viewer', 'WhatsOnChain',
  // Wrappers
  'BlockchainWrapper', 'CacheWrapper', 'OwnerWrapper', 'PurseWrapper', 'StateWrapper',
  // Errors
  'ArgumentError', 'ClientModeError', 'InternalError', 'NotImplementedError', 'RequestError',
  'TimeoutError', 'TrustError', 'ExecutionError'
]

// Reserved words that should not be mangled in minified builds
const reservedProperties = [
  // These come from node_modules. Best to be safe.
  '_read', '_lengthRetrievers', '_obj', '__methods',
  // These are bsv library properties that we use and should not be mangled
  '_hash', '_getHash', '_getInputAmount', '_estimateFee', '_getOutputAmount',
  '_hashPrevouts', '_hashSequence', '_hashOutputsAll', '_fee'
]

// The mangled names are cached in a special name-cache file. We use this file in the tests
// to access mangled names as if they were not mangled. We also cache this file ourselves
// so that we can reuse the same mangled names for every build.
const nameCachePath = path.join(dist, 'name-cache.json')
let lastNameCacheJson = fs.existsSync(nameCachePath) ? fs.readFileSync(nameCachePath).toString('utf8') : '{}'
const nameCache = JSON.parse(lastNameCacheJson)

// If the name cache doesn't exist, clear the existing terser cache. Otherwise, it never gets built.
if (!fs.existsSync(nameCachePath)) {
  fs.removeSync(path.join(nodemodules, '.cache'))
}

// Plugin to save the name cache if it differs from the last known name cache
class SaveNameCachePlugin {
  apply (compiler) {
    compiler.hooks.done.tap(SaveNameCachePlugin.name, () => {
      const newNameCacheJson = JSON.stringify(nameCache)
      if (newNameCacheJson !== lastNameCacheJson) {
        lastNameCacheJson = newNameCacheJson
        fs.writeFileSync(nameCachePath, newNameCacheJson)
      }
    })
  }
}

// Plugin to wait for the name cache file to be saved
class WaitForNameCachePlugin {
  apply (compiler) {
    compiler.hooks.run.tapAsync(WaitForNameCachePlugin.name, async (compiler, callback) => {
      const start = new Date()
      const timeout = 30000
      while (!fs.existsSync(nameCachePath)) {
        if (new Date() - start > timeout) throw new Error('Name cache never built!')
        await new Promise((resolve, reject) => setTimeout(resolve, 100))
      }
      callback()
    })
  }
}

// Run library terser settings
const terserPluginConfig = {
  // The nameCache requires parallel to be off
  parallel: false,
  // We don't cache, because otherwise the name cache is lost
  // cache: false,
  terserOptions: {
    ecma: 2015,
    nameCache,
    mangle: {
      reserved: reservedNames,
      // All private properties (methods, variables) that the end user is not expected to interact
      // with should be prefixed with _. The terser will mangle these properties. We will make
      // specific exceptions where it is problematic.
      properties: {
        regex: /^_.*$/,
        reserved: reservedProperties
      }
    }
  },
  // Leave license comments intact
  extractComments: false
}

// ------------------------------------------------------------------------------------------------
// Browser Minified
// ------------------------------------------------------------------------------------------------

const browserMin = {
  entry,
  output: {
    filename: `${name}.browser.min.js`,
    path: dist,
    library,
    libraryTarget: 'umd'
  },
  resolve: {
    mainFields: ['browser', 'main', 'module'],
    extensions: ['.js', '.mjs', '.wasm', '.json']
  },
  externals: {
    bsv: 'bsv'
  },
  optimization: {
    minimizer: [
      new TerserPlugin(terserPluginConfig)
    ]
  },
  plugins: [version, browserVariant, new SaveNameCachePlugin()],
  stats: 'errors-only'
}

// ------------------------------------------------------------------------------------------------
// Node Minified
// ------------------------------------------------------------------------------------------------

const nodeMin = {
  ...browserMin,
  target: 'node',
  output: {
    filename: `${name}.node.min.js`,
    path: dist,
    libraryTarget: 'commonjs2'
  },
  resolve: {
    mainFields: ['main', 'module'],
    extensions: ['.js', '.mjs', '.wasm', '.json']
  },
  plugins: [version, nodeVariant, new SaveNameCachePlugin()]
}

// ------------------------------------------------------------------------------------------------
// Browser Original
// ------------------------------------------------------------------------------------------------

const browser = {
  ...browserMin,
  output: {
    filename: `${name}.browser.js`,
    path: dist,
    library
  },
  plugins: [version, browserVariant],
  optimization: { minimize: false }
}

// ------------------------------------------------------------------------------------------------
// Node Original
// ------------------------------------------------------------------------------------------------

const node = {
  ...nodeMin,
  output: {
    filename: `${name}.node.js`,
    path: dist,
    libraryTarget: 'commonjs2'
  },
  plugins: [version, nodeVariant],
  optimization: { minimize: false }
}

// ------------------------------------------------------------------------------------------------
// Browser Tests
// ------------------------------------------------------------------------------------------------

const patterns = process.env.SPECS ? JSON.parse(process.env.SPECS) : ['test']
const paths = new Set()
patterns.forEach(x => glob.sync(x).forEach(y => paths.add(y)))
const entries = Array.from(paths).map(x => path.join(process.cwd(), x))
if (!entries.length) throw new Error(`No test files found: ${patterns}`)

const browserTests = {
  target: 'web',
  entry: entries,
  output: { filename: `${name}.browser.tests.js`, path: dist },
  node: { fs: 'empty' },
  externals: { mocha: 'mocha.Mocha', chai: 'chai', jsdom: 'jsdom', bsv: 'bsv', target: library },
  optimization: { minimize: false },
  plugins: [new WaitForNameCachePlugin(), new webpack.EnvironmentPlugin(process.env), browserVariant],
  stats: 'errors-only'
}

// ------------------------------------------------------------------------------------------------

module.exports = [browserMin, nodeMin, browser, node, browserTests]
