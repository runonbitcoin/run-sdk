/**
 * action.js
 *
 * Defines and records actions that happened on creations
 */

const { _prepareArgs } = require('./membrane')
const { _BINDINGS, _location } = require('./bindings')
const { _assert, _text, _parent, _hasOwnProperty, _defined } = require('./misc')
const { _deepVisit, _deepClone } = require('./deep')
const { NotImplementedError } = require('./error')
const { _sudo } = require('./admin')
const Log = require('./log')
const Proxy2 = require('./proxy2')

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

const TAG = 'Action'

// ------------------------------------------------------------------------------------------------
// _Action
// ------------------------------------------------------------------------------------------------

/**
 * Base class for all actions stored in the record
 *
 * If an action has a creation, then it will be spent when callers are signed.
 */
class _Action {
  constructor (creation) {
    this._creation = creation
  }

  // Friendly string for logging
  toString () { return `${this.constructor.name}` }

  // Name of the opcode in the exec part of the metadata
  op () { throw new NotImplementedError() }

  // The unserialized data that will be encoded for this particular action
  data () { throw new NotImplementedError() }
}

// ------------------------------------------------------------------------------------------------
// _DeployAction
// ------------------------------------------------------------------------------------------------

class _DeployAction extends _Action {
  constructor () {
    super(null)
    this._srcList = []
    this._propsList = []
  }

  toString () {
    const count = this._srcList.length
    return `Deploy (count: ${count})`
  }

  op () {
    return 'DEPLOY'
  }

  data () {
    _assert(this._srcList.length === this._propsList.length)
    const data = []
    for (let i = 0; i < this._srcList.length; i++) {
      const src = this._srcList[i]
      const props = this._propsList[i]
      data.push(src)
      data.push(props)
    }
    return data
  }
}

// ------------------------------------------------------------------------------------------------
// _UpgradeAction
// ------------------------------------------------------------------------------------------------

class _UpgradeAction extends _Action {
  constructor (C, src, props) {
    super(C)
    this._src = src
    this._props = props
  }

  toString () {
    return `Upgrade ${_text(this._creation)}`
  }

  op () {
    return 'UPGRADE'
  }

  data () {
    const data = []
    data.push(this._creation)
    data.push(this._src)
    data.push(this._props)
    return data
  }
}

// ------------------------------------------------------------------------------------------------
// _CallAction
// ------------------------------------------------------------------------------------------------

class _CallAction extends _Action {
  constructor (creation, method, args) {
    super(creation)
    this._method = method
    this._args = args
  }

  toString () {
    return `Call ${_text(this._creation)} ${this._method}`
  }

  op () {
    return 'CALL'
  }

  data () {
    const data = []
    data.push(this._creation)
    data.push(this._method)
    data.push(this._args)
    return data
  }
}

// ------------------------------------------------------------------------------------------------
// _NewAction
// ------------------------------------------------------------------------------------------------

class _NewAction extends _Action {
  constructor (classJig, jig, args) {
    super(jig)
    this._classJig = classJig
    this._args = args
  }

  toString () {
    return `New ${_text(this._creation)}`
  }

  op () {
    return 'NEW'
  }

  data () {
    const params = []
    params.push(this._classJig)
    params.push(this._args)
    return params
  }
}

// ------------------------------------------------------------------------------------------------
// _deploy
// ------------------------------------------------------------------------------------------------

function _deploy (creations) {
  const Code = require('./code')
  const Record = require('./record')
  const CURRENT_RECORD = Record._CURRENT_RECORD

  _assert(creations.length)
  _assert(creations.every(C => C instanceof Code))

  if (Log._debugOn) Log._debug(TAG, 'Deploy', creations.map(C => _text(C)).join(', '))

  CURRENT_RECORD._capture(() => {
    // Add deploy code to the CREATE set
    creations.forEach(C => CURRENT_RECORD._create(C))

    // Add parent classes to the AUTH set
    creations.forEach(C => authParents(C, 'deploy'))

    // Each new deploy is also unbound
    creations.forEach(C => CURRENT_RECORD._unbind(C))

    // Create the deploy action
    const action = new _DeployAction()

    for (const C of creations) {
      // Object.assign() will only copy owned class props, not parent props. This is good.
      const src = C.toString()
      const props = _sudo(() => _deepClone(Object.assign({}, C)))

      // Add all creation properties as reads
      addReadRefs(props)

      // Remove bindings from the props because they won't be deployed
      _BINDINGS.forEach(x => delete props[x])

      // Presets should also never be present on code creations
      _assert(!props.presets)

      action._srcList.push(src)
      action._propsList.push(props)
    }

    // Add the action as a top-level action
    CURRENT_RECORD._action(action)
  })
}

// ------------------------------------------------------------------------------------------------
// _upgrade
// ------------------------------------------------------------------------------------------------

function _upgrade (C, snapshot) {
  const Code = require('./code')
  const Record = require('./record')
  const CURRENT_RECORD = Record._CURRENT_RECORD

  _assert(C instanceof Code)

  if (Log._debugOn) Log._debug(TAG, 'Upgrade', _text(C))

  // If already destroyed, then we can't upgrade
  const destroyed = _defined(_location(_sudo(() => C.location))._vdel)
  if (destroyed) throw new Error('Cannot upgrade destroyed jig')

  CURRENT_RECORD._capture(() => {
    authParents(C, 'upgrade')

    // Create the deploy action
    const src = C.toString()
    const props = _sudo(() => _deepClone(Object.assign({}, C)))

    // Add all code properties as reads
    addReadRefs(props)

    // Remove bindings from the props because they won't be deployed
    _BINDINGS.forEach(x => delete props[x])

    // Presets should also never be present on code jigs
    _assert(!props.presets)

    const action = new _UpgradeAction(C, src, props)

    // Spend the code jig being updated
    CURRENT_RECORD._update(C, snapshot)

    // Add the action as a top-level action
    CURRENT_RECORD._action(action)
  })
}

// ------------------------------------------------------------------------------------------------
// _destroy
// ------------------------------------------------------------------------------------------------

function _destroy (creation) {
  const Record = require('./record')
  const Code = require('./code')
  const Jig = require('./jig')
  const CURRENT_RECORD = Record._CURRENT_RECORD

  _assert(creation instanceof Code || creation instanceof Jig)

  if (Log._infoOn) Log._info(TAG, 'Destroy', _text(creation))

  // If already destroyed, then nothing to do
  const destroyed = _defined(_location(_sudo(() => creation.location))._vdel)
  if (destroyed) return

  CURRENT_RECORD._capture(() => {
    CURRENT_RECORD._delete(creation)

    // Only add the action if there is not already an action in progress
    const top = !CURRENT_RECORD._stack.length
    if (top) {
      const action = new _CallAction(creation, 'destroy', [])
      CURRENT_RECORD._action(action)
    }
  })
}

// ------------------------------------------------------------------------------------------------
// _auth
// ------------------------------------------------------------------------------------------------

function _auth (creation) {
  const Record = require('./record')
  const CURRENT_RECORD = Record._CURRENT_RECORD
  const Code = require('./code')
  const Jig = require('./jig')

  _assert(creation instanceof Code || creation instanceof Jig)

  if (Log._infoOn) Log._info(TAG, 'Auth', _text(creation))

  // If already destroyed, then we can't auth
  const destroyed = _defined(_location(_sudo(() => creation.location))._vdel)
  if (destroyed) throw new Error('Cannot auth destroyed jigs')

  CURRENT_RECORD._capture(() => {
    CURRENT_RECORD._auth(creation)

    // Only add the action if there is not already an action in progress
    const top = !CURRENT_RECORD._stack.length
    if (top) {
      const action = new _CallAction(creation, 'auth', [])
      CURRENT_RECORD._action(action)
    }
  })
}

// ------------------------------------------------------------------------------------------------
// _call
// ------------------------------------------------------------------------------------------------

function _call (creation, method, args, f, recorded = true) {
  const Record = require('./record')
  const CURRENT_RECORD = Record._CURRENT_RECORD

  if (Log._infoOn) Log._info(TAG, 'Call', _text(creation), method)

  CURRENT_RECORD._capture(() => {
    // Add creation args as references
    addReadRefs(args)

    // Add the creation to the stack before diving in
    CURRENT_RECORD._push(creation)
    f()
    CURRENT_RECORD._pop()

    // Submit the action if there's nothing left
    const top = !CURRENT_RECORD._stack.length
    if (top && recorded) {
      const action = new _CallAction(creation, method, args)
      CURRENT_RECORD._action(action)
    }
  })
}

// ------------------------------------------------------------------------------------------------
// _new
// ------------------------------------------------------------------------------------------------

function _new (classJig, jig, args, unbound) {
  const Jig = require('./jig')
  const Record = require('./record')
  const CURRENT_RECORD = Record._CURRENT_RECORD

  if (Log._infoOn) Log._info(TAG, 'New', _text(classJig))

  CURRENT_RECORD._capture(() => {
    // Read all classes in the chain since they were part of the creation
    let T = classJig
    while (T !== Jig) {
      CURRENT_RECORD._read(T)
      T = Object.getPrototypeOf(T)
    }

    // Prepare args, deploying code in the process
    const preparedArgs = _prepareArgs(jig, args)

    // Add jig args as references. If the jig has an init method, then this isn't necessary,
    // but because native code isn't recordable this is needed when there isn't an init method.
    addReadRefs(preparedArgs)

    // Record the create of the new jig
    CURRENT_RECORD._create(jig)

    // Call the init method with a jig on the stack so that we don't create a CALL action
    const ret = jig.init(...preparedArgs)
    if (typeof ret !== 'undefined') throw new Error('init must not return a value')

    // After calling init, the creation is usually unbound. The one exception is if the
    // creator jig was bound then we have an initial authorizer.
    if (unbound) CURRENT_RECORD._unbind(jig)

    // Disable this jig from calling ever init again
    Proxy2._getHandler(jig)._rules._disabledMethods.push('init')

    // Record the action if we're at the top of the stack
    const top = !CURRENT_RECORD._stack.length
    if (top) {
      const action = new _NewAction(classJig, jig, preparedArgs)
      CURRENT_RECORD._action(action)
    }
  })
}

// ------------------------------------------------------------------------------------------------
// _pluck
// ------------------------------------------------------------------------------------------------

function _pluck (berryClass, berry, args) {
  const Berry = require('./berry')
  const Record = require('./record')
  const CURRENT_RECORD = Record._CURRENT_RECORD

  if (Log._infoOn) Log._info(TAG, 'Pluck', _text(berryClass))

  // Even though we use the current record to capture reads and check that they are allowed, we
  // don't allow and actions and will roll it back at the end.
  CURRENT_RECORD._autopublish = false

  CURRENT_RECORD._capture(() => {
    // Read all classes in the chain since they were part of the creation
    let T = berryClass
    while (T !== Berry) {
      CURRENT_RECORD._read(T)
      T = Object.getPrototypeOf(T)
    }

    // Prepare args, deploying code in the process
    const preparedArgs = _prepareArgs(berry, args)

    // Add args as references. If the berry has an init method, then this isn't necessary,
    // but because native code isn't recordable this is needed when there isn't an init method.
    addReadRefs(preparedArgs)

    // Call the init method. We manually push/pop because berries are like sidekicks and passthrough.
    const ret = berry.init(...preparedArgs)
    if (typeof ret !== 'undefined') throw new Error('init must not return a value')

    // Disable this berry from calling ever init again
    Proxy2._getHandler(berry)._rules._disabledMethods.push('init')
  })

  if (CURRENT_RECORD._actions.length) throw new Error('Not actions allowed during pluck')

  CURRENT_RECORD._rollback()
}

// ------------------------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------------------------

function authParents (C, method) {
  const Editor = require('./editor')
  const Record = require('./record')
  const CURRENT_RECORD = Record._CURRENT_RECORD

  const Parent = _parent(C)
  if (!Parent) return

  // Parents up the chain must all approve. This allows modding hierarchies where a company
  // allows other companies to extend their base class but still not create children that might
  // break instanceof checks.
  authParents(Parent, method)

  const parentEditor = Editor._get(Parent)
  if (parentEditor._native) return

  const parentSealed = _hasOwnProperty(Parent, 'sealed') ? Parent.sealed : 'owner'
  switch (parentSealed) {
    case 'owner':
      if (!CURRENT_RECORD._creates._has(Parent)) {
        CURRENT_RECORD._auth(Parent)
      }
      break
    case true:
      throw new Error(`Cannot ${method}: ${_text(Parent)} is sealed`)
    case false:
      break
    default:
      throw new Error(`Invalid sealed option: ${parentSealed}`)
  }
}

// ------------------------------------------------------------------------------------------------

function addReadRefs (obj) {
  const Creation = require('./creation')
  const Record = require('./record')
  const CURRENT_RECORD = Record._CURRENT_RECORD

  _sudo(() => _deepVisit(obj, x => {
    if (x instanceof Creation) {
      CURRENT_RECORD._read(x)

      // Only add top-level refs. Do not traverse deeply because they
      // are not part of the recorded state in the args.
      return false
    }
  }))
}

// ------------------------------------------------------------------------------------------------

module.exports = {
  _Action,
  _DeployAction,
  _UpgradeAction,
  _CallAction,
  _NewAction,
  _deploy,
  _upgrade,
  _destroy,
  _auth,
  _call,
  _new,
  _pluck
}
