# 03: New Job Card

**What to build:** An Engineer starts a Job Card: the paper card's layout on a phone, with Reg lookup, new Vehicle and Customer, any number of Parts Used, saved as they type.

**Blocked by:** 01

**Status:** blocked

- [ ] My Jobs → New Job Card opens a Draft with today's date, owned by the signed-in Engineer.
- [ ] Typing a Reg suggests existing Vehicles (normalised match: `ab12 cde` finds `AB12CDE`); choosing one fills in the Customer.
- [ ] An unknown Reg offers "Add new vehicle AB12 CDE" with a Customer picker that can also add a new Customer (name, phone, email).
- [ ] Fields: Date, Reg, Customer, Mileage (whole number), Work Carried Out (lined, grows), Parts Used (quantity, part, part number / notes), six rows to start and "Add another row".
- [ ] Changes save to the server within 2 seconds of typing stopping, with a visible "Saved" / "Saving…" / "Not saved – no signal" state.
- [ ] Reg is stored normalised and shown with the usual space everywhere.
- [ ] An Engineer can't create a Job Card for another Engineer (the server ignores any engineer id sent).
- [ ] E2E on desktop and phone-sized screens.
