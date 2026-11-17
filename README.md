# Apple WebKit Security Research Lab

A defensive, reproducible JavaScriptCore/WebKit regression-testing workspace.

## Scope and safety

This repository tests standards-defined JavaScript buffer behavior in an isolated browser automation environment. It is **not** an exploit kit, does not target school MDM controls, and does not probe Apple's production services or other people's devices.

The initial suite covers:
- Resizable ArrayBuffer length and maximum-length invariants
- TypedArray/DataView behavior after buffer resize
- Detached ArrayBuffer behavior
- Structured-clone transfer detachment

A failing test is a regression lead, **not proof of a security vulnerability**. A security claim requires independent reproduction, a demonstrated confidentiality/integrity/availability impact, version/build details, and responsible disclosure.

## Run locally

Requirements: Node.js 20+.

```sh
npm ci
npx playwright install --with-deps webkit
npm test
```

## CI

GitHub Actions runs the suite in Playwright's WebKit browser on Ubuntu. This is a useful WebKit regression signal, but it is **not identical to Safari on iPadOS**. Confirm any relevant behavior on an authorized, non-managed Apple test device before making platform-specific claims.

## Evidence standard

For every failure, retain:
1. Exact test name and assertion.
2. Browser/runtime version and operating system.
3. Minimal non-destructive reproducer.
4. Whether the result is deterministic.
5. Affected security boundary and concrete impact, if any.

Do not include personal data, school management identifiers, private certificates, or account information in reports.
