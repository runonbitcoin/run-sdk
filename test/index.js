/**
 * index.js
 *
 * Master list of test modules
 */

require('./protocol')
require('./run')

require('./extra/asm')
require('./extra/b')
require('./extra/base58')
require('./extra/expect')
require('./extra/group')
require('./extra/hex')
require('./extra/nft')
require('./extra/sha256')
require('./extra/token10')
require('./extra/token20')
require('./extra/tx')
require('./extra/txo')

require('./kernel/admin')
require('./kernel/api')
require('./kernel/auth')
require('./kernel/berry')
require('./kernel/bindings')
require('./kernel/blockchain')
require('./kernel/bsv')
require('./kernel/build')
require('./kernel/cache')
require('./kernel/call')
require('./kernel/caller')
require('./kernel/capture')
require('./kernel/code')
require('./kernel/common-lock')
require('./kernel/creation')
require('./kernel/creation-set')
require('./kernel/deep')
require('./kernel/deploy')
require('./kernel/deps')
require('./kernel/destroy')
require('./kernel/determinism')
require('./kernel/dynamic')
require('./kernel/editor')
require('./kernel/environment')
require('./kernel/error')
require('./kernel/interactive')
require('./kernel/invalid')
require('./kernel/jig')
require('./kernel/json')
require('./kernel/load')
require('./kernel/lock')
require('./kernel/log')
require('./kernel/membrane')
require('./kernel/metadata')
require('./kernel/misc')
require('./kernel/native')
require('./kernel/owner')
require('./kernel/owner-api')
require('./kernel/private')
require('./kernel/proxy2')
require('./kernel/publish')
require('./kernel/purse')
require('./kernel/queue')
require('./kernel/realm')
require('./kernel/recreate')
require('./kernel/recreate-sync')
require('./kernel/replay')
require('./kernel/reserved')
require('./kernel/rules')
require('./kernel/sandbox')
require('./kernel/satoshis')
require('./kernel/sealed')
require('./kernel/sidekick')
require('./kernel/snapshot')
require('./kernel/source')
require('./kernel/stress')
require('./kernel/sync')
require('./kernel/timeout')
require('./kernel/transaction')
require('./kernel/trust')
require('./kernel/unify')
require('./kernel/upgrade')
require('./kernel/upgradable')
require('./kernel/version')

require('./plugins/blockchain-wrapper')
require('./plugins/browser-cache')
require('./plugins/cache-wrapper')
require('./plugins/disk-cache')
require('./plugins/indexeddb-cache')
require('./plugins/inventory')
require('./plugins/local-cache')
require('./plugins/local-owner')
require('./plugins/local-purse')
require('./plugins/mockchain')
require('./plugins/node-cache')
require('./plugins/pay-server')
require('./plugins/purse-wrapper')
require('./plugins/recent-broadcasts')
require('./plugins/request')
require('./plugins/run-connect')
require('./plugins/run-db')
require('./plugins/state-filter')
require('./plugins/state-server')
require('./plugins/viewer')
require('./plugins/whatsonchain')
