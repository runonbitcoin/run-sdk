/**
 * source.js
 *
 * Functionality related to processing raw source code
 */

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

// Regexes to capture what is in between brackets
const FUNCTION_INSIDE_REGEX = /^\s*function\s+[a-zA-Z0-9$_]+\s*\(.*?{(.*)}\s*$/s
const CLASS_INSIDE_REGEX = /^\s*class\s+[a-zA-Z0-9$_]+\s*{(.*)}\s*$/s
const CHILD_INSIDE_REGEX = /^\s*class\s+[a-zA-Z0-9$_]+\s+extends\s+[a-zA-Z0-9$_]+\s*{(.*)}\s*$/s

// Regexes to extract the names of code
const FUNCTION_NAME_REGEX = /^(function\s+)([a-zA-Z0-9$_]+)(\s*)\((.*)$/s
const CLASS_NAME_REGEX = /^(class\s+)([a-zA-Z0-9$_]+)(\s*){(.*)$/s
const CHILD_NAME_REGEX = /^(class\s+)([a-zA-Z0-9$_]+)(\s*)extends(.*)$/s

// Regex to match class extension syntax
const CLASS_EXTENSION = /^\s*class\s+[a-zA-Z0-9_$]+\s+extends\s+[a-zA-Z0-9_.$]+\s*{/s

// Regex to match a class method in Safari
const SAFARI_METHOD = /^([a-zA-Z0-9_$]+)\s*\(/s

// Strip coverage from the source code
const UNCOVER_REGEX = /(cov_[a-zA-Z0-9]+\(\).[a-zA-Z0-9\[\]]+\+\+,?)/g // eslint-disable-line

// ------------------------------------------------------------------------------------------------
// _sandbox
// ------------------------------------------------------------------------------------------------

/**
 * Transforms class or function source code that is safe to be evaluted in a sandbox.
 *
 * For classes, if T is a class that extends another class, we make sure the parent class name in
 * the extends expression is the actual name of the parent class, because sometimes the code will
 * be "class X extends SomeLibrary.Y" and what is deployed should be "class X extends Y", or an
 * obfuscator will change the variable name.
 *
 * For functions, Safari sometimes ignores the "function" keyword when printing method calls. We
 * add that back in so that we always can parse the code.
 *
 * Lastly, this may still return slightly different results in different environments, usually
 * related to line returns and whitespace. Functionally though, according to the spec, the code
 * should be the same.
 */
function _sandbox (src, T) {
  const Parent = Object.getPrototypeOf(T)

  if (Parent.prototype) {
    return src.replace(CLASS_EXTENSION, `class ${T.name} extends ${Parent.name} {`)
  }

  const safariMethodMatch = src.match(SAFARI_METHOD)
  if (safariMethodMatch && safariMethodMatch[1] !== 'function') return `function ${src}`

  return src
}

// ------------------------------------------------------------------------------------------------
// _anonymize
// ------------------------------------------------------------------------------------------------

/**
 * Strip out the class or function name from source code
 */
function _anonymize (src) {
  const functionMatches = src.match(FUNCTION_NAME_REGEX)
  if (functionMatches) return `${functionMatches[1]}${functionMatches[3]}(${functionMatches[4]}`

  const classMatches = src.match(CLASS_NAME_REGEX)
  if (classMatches) return `${classMatches[1]}${classMatches[3]}{${classMatches[4]}`

  const childMatches = src.match(CHILD_NAME_REGEX)
  if (childMatches) return `${childMatches[1]}${childMatches[3]}extends${childMatches[4]}`

  throw new Error(`Bad source code: ${src}`)
}

// ------------------------------------------------------------------------------------------------
// _deanonymize
// ------------------------------------------------------------------------------------------------

/**
 * Adds back in the class or function name to anonymized source code
 */
function _deanonymize (src, name) {
  // Code that is excluded for code coverage should not be anonymized. Breaks.
  if (require('./sandbox')._cover.includes(name)) return src

  const functionMatches = src.match(/^(function\s)(.*)/s)
  if (functionMatches) return `${functionMatches[1]}${name}${functionMatches[2]}`

  const classMatches = src.match(/^(class\s)(.*)/s)
  if (classMatches) return `${classMatches[1]}${name}${classMatches[2]}`

  throw new Error(`Bad source code: ${src}`)
}

// ------------------------------------------------------------------------------------------------
// _uncover
// ------------------------------------------------------------------------------------------------

function _uncover (src) {
  return process.env.COVER ? src.replace(UNCOVER_REGEX, '') : src
}

// ------------------------------------------------------------------------------------------------
// _check
// ------------------------------------------------------------------------------------------------

/**
 * Checks that some source code can be executed by Run
 */
function _check (src) {
  const match =
    src.match(FUNCTION_INSIDE_REGEX) ||
    src.match(CLASS_INSIDE_REGEX) ||
    src.match(CHILD_INSIDE_REGEX)
  if (!match) throw new Error(`Bad source code: ${src}`)

  let inside = match[1]

  const replaceAll = (string, search, replace) => string.split(search).join(replace)

  // Strip comments out of the inside code
  inside = replaceAll(inside, /\/\/.*?([\n\r])/s, '\n')
  inside = replaceAll(inside, /\/\*.*?\*\//s, '')

  // Strip strings out too
  inside = replaceAll(inside, /(?:`(?:(?:\\`)|[^`])*?`)|(?:"(?:(?:\\")|[^"])*?")|(?:'(?:(?:\\')|[^'])*?')/s, '\'\'')

  // Check that there are not multiple classes or functions like "class A{};class B{}"
  // We can do this by getting the inside of the brackets "};classB{" and then check that
  // there are always matching brackets, ignoring all comments and strings.
  let brackets = 0
  for (let i = 0; i < inside.length; i++) {
    if (inside[i] === '{') brackets++
    if (inside[i] === '}') brackets--
    if (brackets < 0) {
      throw new Error(`Multiple definitions not permitted: ${src}`)
    }
  }
}

// ------------------------------------------------------------------------------------------------

module.exports = { _sandbox, _anonymize, _deanonymize, _uncover, _check }
