"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { CustomerIntakeDto } from "@app/backend/contract";
import { IntakeForm } from "./intake-form";

/** Lets a customer change what they sent. The dialog only closes via Save, Cancel, ✕ or Esc so edits aren't lost to a stray click. */
export function EditIntake({ intake }: { intake: CustomerIntakeDto }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
  }, [open]);

  const close = () => dialogRef.current?.close();

  return (
    <>
      <button type="button" className="button small secondary" onClick={() => setOpen(true)}>
        Edit
      </button>

      {open && (
        <dialog ref={dialogRef} className="dialog" aria-labelledby={titleId} onClose={() => setOpen(false)}>
          <div className="dialog-body">
            <header className="dialog-head">
              <div>
                <h2 id={titleId}>Edit project</h2>
                <p className="dialog-sub">Changes are saved to your project right away.</p>
              </div>
              <button type="button" className="icon-button" aria-label="Close editor" onClick={close}>
                ✕
              </button>
            </header>
            <IntakeForm mode="edit" initial={intake} onDone={close} onCancel={close} />
          </div>
        </dialog>
      )}
    </>
  );
}
