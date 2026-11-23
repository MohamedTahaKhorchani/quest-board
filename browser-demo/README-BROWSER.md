# Self-contained browser demo edition

Separate adaptation approved 23 November 2026. Original app UI/assets are retained; state is fictional/sample and saved only in the visitor’s browser. Reset demo restores sample state. No live backend, actual accounts, databases or private runtime data are connected.

Build: `npm run build:browser`. Serve `dist/` with a static web server.

Committed frontend from local QuestBoard candidate only, independently copied; original checkout and team backend remain unchanged. Explicit hosted-demo build enables sample adapters, fictional role selection and local storage. No real login, password, authorization or shared persistence. Sample image attachment supports trying proof without sharing personal files. Proof media previews are temporary and may be unavailable after reload. Full-team acceptance is not implied. Tests: `npx vitest run src/browser src/dates.test.js src/questTime.test.js src/navigation.test.js --maxWorkers=2`.
