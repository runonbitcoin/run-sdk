# Forked version

This is a fork of [run-sdk](https://github.com/runonbitcoin/run-sdk).

# RUN SDK - 0.6.41 beta

[![tests](https://github.com/runonbitcoin/run/workflows/tests/badge.svg)](https://github.com/runonbitcoin/run/actions) [![codecov](https://codecov.io/gh/runonbitcoin/run/branch/master/graph/badge.svg?token=VPXTBV9CQP)](https://codecov.io/gh/runonbitcoin/run)

**Note: This project is no longer supported. The repository exists for reference only.**

RUN is a token protocol to build whatever you dream up. A world of interactive apps and tokens.

To give it a go, visit https://run.network for tutorials and docs.

## Installation

Run `npm install` to install node dependencies.

Then run `npm run build` to build the browser and node libraries.

## Community

Join us in our Discord, Run Nation: https://run.network/discord. Here you'll meet other developers using Run, hear about cool projects launching, and know right away when there are new announcements.

## Getting Help

Post what's on your mind in the "ask-for-help" channel in the Run Nation Discord.

## Commands

- `npm run lint` - Lint and automatically fix errors
- `npm run build` - Build outputs
- `npm run test` - Test library quickly
- `npm run test:node` - Test the minified node build
- `npm run test:browser` - Test the minified browser build (Chrome default)
- `npm run test:cover` - Collect code coverage
- `npm run test test/plugins/local-purse.js` - Run just the purse tests

## Configuring the tests

Various environment variables may be used to configure the tests:

| Name              | Description                                     | Possible Values                                | Default     |
|-------------------|-------------------------------------------------|------------------------------------------------|-------------|
| `NETWORK`         | Network to test on                              | `mock`, `main`, `test`, `stn`                  | `mock`      |
| `BROWSER`         | Browser used for testing                        | `chrome`, `firefox`, `safari`, `MicrosoftEdge` | `chrome`    |
| `STRESS`          | Whether to run the stress tests                 | `true`, `false`                                | `false`     |
| `PURSE_[network]` | Purse key used on a specific network            | your string privkey                            | `undefined` |
| `API`             | Blockchain API when not using the mock network  | `run`, `whatsonchain`                          | `undefined` |
| `APIKEY_[api]`    | API key used with a specific blockchain API     | your string api key                            | `undefined` |
| `LOGGER`          | Whether to log internal messages to the console | `true`, `false`                                | `false`     |

### Examples

- `env BROWSER=safari npm run test:browser` - Test the browser build on Safari
- `env STRESS=1 npm run test` - Test library with stress tests
- `env NETWORK=test env PURSE=<funded_private_key> npm run test` - Run all tests on testnet

### .env file

For ease of use, you may also store these variables in a `.env` file where the tests are run. Here's a sample:

```
BROWSER=safari
PURSE_MAIN=<your priate key>
PURSE_TEST=<your private key>
APIKEY_WHATSONCHAIN=<your api key>
```