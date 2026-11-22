# 10: Offline drafts and home-screen install

**What to build:** The app works with poor signal and installs to the home screen.

**Blocked by:** 04

**Status:** blocked

- [ ] A web app manifest with the Com-Install icon and name "Job Cards"; installs on iPhone (Add to Home Screen) and Android.
- [ ] A service worker caches the app shell so My Jobs and an open Job Card load with no signal.
- [ ] Edits made with no signal are kept on the phone (localStorage, wrapped in try/catch) and synced when back online, with a visible "Not saved – no signal" then "Saved".
- [ ] A new Job Card started with no signal is created on the server when back online.
- [ ] E2E with the browser offline and back online.
