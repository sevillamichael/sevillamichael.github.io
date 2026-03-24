# Michael Sevilla Resume

Static resume site with a lightweight Playwright + TypeScript automation setup.

## Resume

This repository contains the live resume site.

For a quick local preview:

```powershell
start index.html
```

The site itself is plain HTML and CSS and does not require a build step.

## Playwright

This project also includes a small Playwright + TypeScript test suite used to validate the resume site and showcase UI automation.

### Install dependencies

```powershell
npm install
npx playwright install chromium
```

### Run the tests

```powershell
npm run test:e2e
```

### Open the HTML report

```powershell
npm run report:e2e
```

The tests run directly against the local static files.
