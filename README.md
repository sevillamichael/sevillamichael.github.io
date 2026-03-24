# Michael Sevilla Resume

Static resume site with a lightweight Playwright + TypeScript automation setup.

## Run the site locally

Open the page directly:

```powershell
start index.html
```

Or use a small local server:

```powershell
python -m http.server 4173
```

Then open `http://127.0.0.1:4173`.

## Run the Playwright tests

Install dependencies first:

```powershell
npm install
npx playwright install chromium
```

Run the suite:

```powershell
npm run test:e2e
```

Open the HTML report:

```powershell
npm run report:e2e
```

## What is covered

- hero content and profile links
- presence of core resume sections
- expected experience entries
- external link validation
- basic mobile readability for experience rows
