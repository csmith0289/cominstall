"use client";

import { useEffect, useRef, useState } from "react";
import { newJobCard } from "./actions";

// "New Job Card" makes one Draft however many times it's tapped: once it's sent, later taps do nothing until the
// Job Card opens.
export function NewJobCardButton() {
  const sent = useRef(false);
  const [pending, setPending] = useState(false);
  // Coming Back to My Jobs from the browser's cache shows the button ready again.
  useEffect(() => {
    const ready = () => {
      sent.current = false;
      setPending(false);
    };
    window.addEventListener("pageshow", ready);
    return () => window.removeEventListener("pageshow", ready);
  }, []);
  return (
    <form
      action={newJobCard}
      onSubmit={(event) => {
        if (sent.current) {
          event.preventDefault();
          return;
        }
        sent.current = true;
        setPending(true);
      }}
    >
      <button type="submit" disabled={pending} aria-disabled={pending}>
        New Job Card
      </button>
    </form>
  );
}
