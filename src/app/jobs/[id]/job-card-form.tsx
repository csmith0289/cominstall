"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CustomerChoice } from "@/customers";
import { MAX_MILEAGE_DIGITS, MAX_PART_ROWS, STARTING_PART_ROWS, type JobCardChanges, type JobCardView, type PartRow } from "@/job-cards/rules";
import type { VehicleChoice } from "@/vehicles";
import { displayReg, normaliseReg } from "@/vehicles/reg";
import { addNewCustomer, addNewVehicle, findVehicles, latestJobCard, saveJobCardChanges, searchCustomers } from "../actions";

// Saves this long after typing stops (the ticket allows 2 seconds).
const SAVE_AFTER_MS = 800;
// While there's no signal, tries again this often (and as soon as the phone says it's back online).
const RETRY_AFTER_MS = 4000;
const LOOKUP_AFTER_MS = 200;

type SaveState = { kind: "saved" } | { kind: "saving" } | { kind: "offline" } | { kind: "error"; message: string };

const emptyRow = (): PartRow => ({ quantity: "", part: "", partNumberOrNotes: "" });
const padRows = (rows: PartRow[]) => [...rows, ...Array.from({ length: Math.max(0, STARTING_PART_ROWS - rows.length) }, emptyRow)];

type Card = {
  status: JobCardView["status"];
  jobDate: string;
  vehicle: { id: string; reg: string } | null;
  customer: { id: string; name: string } | null;
  mileage: string;
  workCarriedOut: string;
  parts: PartRow[];
};

const cardFrom = (view: JobCardView): Card => ({
  status: view.status,
  jobDate: view.jobDate,
  vehicle: view.vehicle,
  customer: view.customer,
  mileage: view.mileage === null ? "" : String(view.mileage),
  workCarriedOut: view.workCarriedOut,
  parts: padRows(view.parts),
});

// Only the fields that were edited. The Customer isn't sent: the server takes it from the Vehicle.
function changesFrom(patch: Partial<Card>): JobCardChanges {
  const changes: JobCardChanges = {};
  if (patch.jobDate !== undefined) changes.jobDate = patch.jobDate;
  if (patch.vehicle !== undefined) changes.vehicleId = patch.vehicle?.id ?? null;
  if (patch.mileage !== undefined) changes.mileage = patch.mileage === "" ? null : Number(patch.mileage);
  if (patch.workCarriedOut !== undefined) changes.workCarriedOut = patch.workCarriedOut;
  if (patch.parts !== undefined) changes.parts = patch.parts;
  return changes;
}

// Sends the fields edited since the last save shortly after each change, one save at a time, and keeps trying while
// there's no signal. Fields not edited here are never sent, so they can't overwrite newer work saved elsewhere.
function useAutosave(id: string) {
  const [state, setState] = useState<SaveState>({ kind: "saved" });
  const pending = useRef<JobCardChanges>({});
  const saving = useRef(false);
  // Goes up with every edit, so a reload from the server can tell whether the Engineer typed while it was on its way.
  const edits = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hasPending = () => Object.keys(pending.current).length > 0;

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (saving.current || !hasPending()) return;
    saving.current = true;
    const sending = pending.current;
    pending.current = {};
    let retryAfter = 0;
    try {
      const result = await saveJobCardChanges(id, sending);
      if ("error" in result) setState({ kind: "error", message: result.error });
      else if (!hasPending()) setState({ kind: "saved" });
    } catch {
      // Anything edited since takes priority over what didn't go.
      pending.current = { ...sending, ...pending.current };
      retryAfter = RETRY_AFTER_MS;
      setState({ kind: "offline" });
    } finally {
      saving.current = false;
    }
    if (hasPending()) timer.current = setTimeout(() => void flush(), retryAfter || SAVE_AFTER_MS);
  }, [id]);

  const changed = useCallback(
    (changes: JobCardChanges) => {
      pending.current = { ...pending.current, ...changes };
      edits.current += 1;
      setState((current) => (current.kind === "offline" ? current : { kind: "saving" }));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_AFTER_MS);
    },
    [flush],
  );

  useEffect(() => {
    const online = () => void flush();
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("online", online);
      clearTimeout(timer.current);
    };
  }, [flush]);

  const idle = useCallback(() => !saving.current && !hasPending(), []);
  const editCount = useCallback(() => edits.current, []);
  return { state, changed, idle, editCount };
}

function SaveStatus({ state }: { state: SaveState }) {
  const text = { saved: "Saved", saving: "Saving…", offline: "Not saved – no signal", error: "" }[state.kind];
  return (
    <p role="status" className={`save-state save-${state.kind}`}>
      {state.kind === "error" ? `Not saved – ${state.message}` : text}
    </p>
  );
}

export function JobCardForm({ card: initial }: { card: JobCardView }) {
  const [card, setCardState] = useState<Card>(() => cardFrom(initial));
  // The card as of the latest change, even before React has re-rendered: two changes in quick succession (choosing
  // a Vehicle as the Engineer moves on to Mileage) must build on each other, not on the same older render.
  const latest = useRef(card);
  const setCard = (next: Card) => {
    latest.current = next;
    setCardState(next);
  };
  const { state, changed, idle, editCount } = useAutosave(initial.id);
  const locked = card.status === "complete";
  // Changes when the Vehicle is replaced by a newer copy from the server, so the Reg field starts again from it.
  const [regRevision, setRegRevision] = useState(0);

  const update = (patch: Partial<Card>) => {
    setCard({ ...latest.current, ...patch });
    changed(changesFrom(patch));
  };

  // The page may have come from the browser's or the router's cache (Back, Forward), or sat in a tab while the card
  // was changed in another one. Catch up with the latest saved copy, unless the Engineer has edits on the way.
  useEffect(() => {
    const catchUp = async () => {
      if (!idle()) return;
      const before = editCount();
      let fresh: JobCardView | null;
      try {
        fresh = await latestJobCard(initial.id);
      } catch {
        return;
      }
      if (!fresh || !idle() || editCount() !== before) return;
      const next = cardFrom(fresh);
      if (next.vehicle?.id !== latest.current.vehicle?.id) setRegRevision((revision) => revision + 1);
      setCard(next);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void catchUp();
    };
    void catchUp();
    window.addEventListener("pageshow", catchUp);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pageshow", catchUp);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [initial.id, idle, editCount]);

  const work = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const box = work.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${box.scrollHeight + 2}px`;
  }, [card.workCarriedOut]);

  const table = useRef<HTMLTableSectionElement>(null);
  const atRowLimit = card.parts.length >= MAX_PART_ROWS;
  const addRow = () => {
    if (latest.current.parts.length >= MAX_PART_ROWS) return;
    update({ parts: [...latest.current.parts, emptyRow()] });
    requestAnimationFrame(() => table.current?.querySelector<HTMLInputElement>("tr:last-child input")?.focus());
  };
  const setPart = (index: number, patch: Partial<PartRow>) =>
    update({ parts: latest.current.parts.map((row, i) => (i === index ? { ...row, ...patch } : row)) });

  return (
    <form className="job-card" aria-label="Job Card" onSubmit={(event) => event.preventDefault()}>
      <div className="job-card-head">
        <h1>Job Card</h1>
        <span className="muted">{{ draft: "Draft", outstanding: "Outstanding", complete: "Complete" }[card.status]}</span>
      </div>
      <SaveStatus state={state} />
      <fieldset disabled={locked} className="job-card-fields">
        <div className="grid">
          <RegField
            key={regRevision}
            vehicle={card.vehicle}
            onChoose={(vehicle) => update({ vehicle: vehicle && { id: vehicle.id, reg: vehicle.reg }, customer: vehicle?.customer ?? null })}
          />
          <div className="cell">
            <label htmlFor="job-date">Date</label>
            <input id="job-date" type="date" required value={card.jobDate} onChange={(event) => update({ jobDate: event.target.value })} />
          </div>
          <div className="cell">
            <label htmlFor="customer">Customer</label>
            <input id="customer" readOnly value={card.customer?.name ?? ""} placeholder="Filled in from the Reg" />
          </div>
          <div className="cell">
            <label htmlFor="mileage">Mileage</label>
            <input
              id="mileage"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              maxLength={MAX_MILEAGE_DIGITS}
              value={card.mileage}
              onChange={(event) => update({ mileage: event.target.value.replace(/\D/g, "").slice(0, MAX_MILEAGE_DIGITS) })}
            />
          </div>
        </div>

        <h2 className="bar" id="work-label">
          Work Carried Out
        </h2>
        <div className="lined">
          <textarea
            ref={work}
            aria-labelledby="work-label"
            rows={9}
            value={card.workCarriedOut}
            onChange={(event) => update({ workCarriedOut: event.target.value })}
          />
        </div>

        <h2 className="bar" id="parts-label">
          Parts Used
        </h2>
        <table className="parts" aria-labelledby="parts-label">
          <colgroup>
            <col className="q" />
            <col className="p" />
            <col className="n" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Qty</th>
              <th scope="col">Part</th>
              <th scope="col">Part no. / notes</th>
            </tr>
          </thead>
          <tbody ref={table}>
            {card.parts.map((row, index) => (
              <tr key={index}>
                <td>
                  <input
                    aria-label={`Quantity, row ${index + 1}`}
                    inputMode="decimal"
                    autoComplete="off"
                    maxLength={20}
                    value={row.quantity}
                    onChange={(event) => setPart(index, { quantity: event.target.value })}
                  />
                </td>
                <td>
                  <input
                    aria-label={`Part, row ${index + 1}`}
                    autoComplete="off"
                    maxLength={200}
                    value={row.part}
                    onChange={(event) => setPart(index, { part: event.target.value })}
                  />
                </td>
                <td>
                  <input
                    aria-label={`Part number or notes, row ${index + 1}`}
                    autoComplete="off"
                    maxLength={500}
                    value={row.partNumberOrNotes}
                    onChange={(event) => setPart(index, { partNumberOrNotes: event.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="add-row" onClick={addRow} disabled={atRowLimit}>
          + Add another row
        </button>
        {atRowLimit && <p className="muted hint">A Job Card can have up to {MAX_PART_ROWS} Parts Used.</p>}
      </fieldset>
    </form>
  );
}

// The Reg: typing suggests Vehicles already seen; an unknown Reg can be added with its Customer.
function RegField({ vehicle, onChoose }: { vehicle: Card["vehicle"]; onChoose: (vehicle: VehicleChoice | null) => void }) {
  const [typed, setTyped] = useState(vehicle?.reg ?? "");
  const [suggestions, setSuggestions] = useState<VehicleChoice[]>([]);
  // The normalised Reg the suggestions are for, once they've arrived.
  const [lookedUp, setLookedUp] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [lookupFailed, setLookupFailed] = useState(false);
  const lookup = useRef(0);

  const reg = normaliseReg(typed);
  const chosen = vehicle !== null && normaliseReg(vehicle.reg) === reg;

  useEffect(() => {
    if (chosen || !reg) {
      setSuggestions([]);
      setLookedUp(null);
      return;
    }
    const ticket = ++lookup.current;
    const timer = setTimeout(async () => {
      try {
        const found = await findVehicles(reg);
        if (ticket !== lookup.current) return;
        setSuggestions(found);
        setLookedUp(reg);
        setLookupFailed(false);
      } catch {
        if (ticket === lookup.current) setLookupFailed(true);
      }
    }, LOOKUP_AFTER_MS);
    return () => clearTimeout(timer);
  }, [reg, chosen]);

  const exact = lookedUp === reg ? suggestions.find((suggestion) => normaliseReg(suggestion.reg) === reg) : undefined;
  const canAdd = !chosen && lookedUp === reg && !exact && reg.length >= 2 && reg.length <= 10;

  const choose = (choice: VehicleChoice) => {
    setTyped(choice.reg);
    setAdding(null);
    onChoose(choice);
  };

  // A Reg typed in full that matches a Vehicle is chosen once the Engineer moves on, without tapping the suggestion.
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    // choose is remade every render; this runs only when focus or the match changes.
    if (!focused && !chosen && exact) choose(exact);
  }, [focused, chosen, exact]);
  const notSaved = !chosen && reg !== "" && !focused && !exact && adding !== reg;

  return (
    <div className="cell reg-cell">
      <label htmlFor="reg">Reg</label>
      <input
        id="reg"
        className="reg"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={14}
        value={typed}
        aria-describedby={notSaved ? "reg-not-saved" : undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event) => {
          setTyped(event.target.value);
          setAdding(null);
          if (vehicle && normaliseReg(event.target.value) !== normaliseReg(vehicle.reg)) onChoose(null);
        }}
      />
      {!chosen && suggestions.length > 0 && (
        <ul className="suggestions" aria-label="Matching Vehicles">
          {suggestions.map((suggestion) => (
            <li key={suggestion.id}>
              <button type="button" className="secondary" onClick={() => choose(suggestion)}>
                <strong>{suggestion.reg}</strong>
                {suggestion.customer && <span className="muted"> · {suggestion.customer.name}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {lookupFailed && !chosen && <p className="error hint">Can&apos;t look up Regs – no signal.</p>}
      {canAdd && adding !== reg && (
        <button type="button" className="secondary add-vehicle" onClick={() => setAdding(reg)}>
          Add new Vehicle {displayReg(reg)}
        </button>
      )}
      {canAdd && adding === reg && <NewVehicle reg={reg} onAdded={choose} onCancel={() => setAdding(null)} />}
      {/* Last, so it never moves a button the Engineer is tapping. */}
      {notSaved && (
        <p id="reg-not-saved" className="error hint">
          Reg not saved – choose a matching Vehicle or add a new one.
        </p>
      )}
    </div>
  );
}

function NewVehicle({ reg, onAdded, onCancel }: { reg: string; onAdded: (vehicle: VehicleChoice) => void; onCancel: () => void }) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<CustomerChoice[]>([]);
  const [customer, setCustomer] = useState<CustomerChoice | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let current = true;
    const timer = setTimeout(async () => {
      try {
        const found = await searchCustomers(query);
        if (current) setMatches(found);
      } catch {
        if (current) setError("Can't look up Customers – no signal.");
      }
    }, LOOKUP_AFTER_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query]);

  const add = async () => {
    if (!customer) return setError("Choose the Customer, or add a new one.");
    setBusy(true);
    setError(null);
    try {
      const result = await addNewVehicle({ reg, customerId: customer.id });
      if ("error" in result) setError(result.error);
      else onAdded(result.vehicle);
    } catch {
      setError("Not added – no signal. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="new-vehicle stack" aria-label={`New Vehicle ${displayReg(reg)}`}>
      <h2>New Vehicle {displayReg(reg)}</h2>
      {creating ? (
        <NewCustomer
          onAdded={(added) => {
            setCustomer(added);
            setCreating(false);
            setError(null);
          }}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <>
          {customer ? (
            <p>
              Customer: <strong>{customer.name}</strong>{" "}
              <button type="button" className="link" onClick={() => setCustomer(null)}>
                Change
              </button>
            </p>
          ) : (
            <>
              <label>
                Find the Customer
                <input value={query} autoComplete="off" onChange={(event) => setQuery(event.target.value)} />
              </label>
              {matches.length > 0 && (
                <ul className="suggestions" aria-label="Matching Customers">
                  {matches.map((match) => (
                    <li key={match.id}>
                      <button type="button" className="secondary" onClick={() => setCustomer(match)}>
                        {match.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" className="secondary" onClick={() => setCreating(true)}>
                Add new Customer
              </button>
            </>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="row">
            <button type="button" onClick={add} disabled={busy || !customer}>
              Add Vehicle
            </button>
            <button type="button" className="secondary" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function NewCustomer({ onAdded, onCancel }: { onAdded: (customer: CustomerChoice) => void; onCancel: () => void }) {
  const [fields, setFields] = useState({ name: "", phone: "", email: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await addNewCustomer(fields);
      if ("error" in result) setError(result.error);
      else onAdded(result.customer);
    } catch {
      setError("Not added – no signal. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" role="group" aria-label="New Customer">
      <h3>New Customer</h3>
      <label>
        Name
        <input value={fields.name} maxLength={200} autoComplete="off" onChange={(event) => setFields({ ...fields, name: event.target.value })} />
      </label>
      <label>
        Phone
        <input
          type="tel"
          value={fields.phone}
          maxLength={40}
          autoComplete="off"
          onChange={(event) => setFields({ ...fields, phone: event.target.value })}
        />
      </label>
      <label>
        Email
        <input
          type="email"
          value={fields.email}
          maxLength={254}
          autoComplete="off"
          onChange={(event) => setFields({ ...fields, email: event.target.value })}
        />
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="row">
        <button type="button" onClick={save} disabled={busy}>
          Save Customer
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
