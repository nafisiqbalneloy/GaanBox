# Contributing to GaanBox

Thanks for helping! GaanBox is intentionally small: no build step and no npm dependencies.

## Setup

You need Node 22 or newer.

```sh
git clone https://github.com/nafisiqbalneloy/GaanBox.git
cd GaanBox
npm start        # http://localhost:3000
npm test         # runs the test suite
```

## Making a change

1. Open an issue (or pick an open one) so the idea is written down.
2. Create a branch such as `feature/short-name`.
3. Keep the change small and add or update tests in `test/`.
4. Run `npm test` and check it passes.
5. Open a pull request that says `Closes #<issue>`.

## Style

- Front end: plain ES modules in `src/`, no frameworks.
- Server: CommonJS in `server/`, built-in Node modules only.
- Escape or build DOM nodes with the `el()` helper instead of inserting raw HTML.
- Keep new UI keyboard-accessible and readable in both light and dark themes.
