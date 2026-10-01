"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type DialogKind = "confirm" | "alert";

type DialogRequest = {
  kind: DialogKind;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive: boolean;
  resolve: (value: boolean) => void;
};

const queue: DialogRequest[] = [];
let present: ((request: DialogRequest) => void) | null = null;

function enqueue(request: Omit<DialogRequest, "resolve">) {
  return new Promise<boolean>((resolve) => {
    const next = { ...request, resolve };
    if (present) {
      present(next);
      return;
    }
    queue.push(next);
  });
}

function isDestructive(message: string) {
  return /supprim|retir/i.test(message);
}

export function askConfirm(message: string) {
  const destructive = isDestructive(message);
  return enqueue({
    kind: "confirm",
    title: destructive ? "Supprimer ?" : "Confirmation",
    message,
    confirmLabel: destructive ? "Supprimer" : "OK",
    cancelLabel: "Annuler",
    destructive,
  });
}

export async function askAlert(message: string) {
  await enqueue({
    kind: "alert",
    title: "Information",
    message,
    confirmLabel: "OK",
    cancelLabel: "OK",
    destructive: false,
  });
}

export function AppDialogHost() {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const show = (next: DialogRequest) => {
      setRequest((current) => {
        if (current) {
          queue.push(next);
          return current;
        }
        return next;
      });
    };
    present = show;
    if (!request && queue.length > 0) {
      setRequest(queue.shift() ?? null);
    }
    return () => {
      present = null;
    };
  }, [request]);

  useEffect(() => {
    if (!request) {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    confirmRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, [request]);

  const close = (value: boolean) => {
    request?.resolve(value);
    setRequest(queue.shift() ?? null);
  };

  if (!request || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
      role="presentation"
      onClick={() => close(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="bookea-dialog-title"
        aria-describedby="bookea-dialog-message"
        className="w-full max-w-[420px] rounded-[28px] bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.22)]"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            close(false);
          }
          if (event.key === "Enter") {
            close(true);
          }
        }}
      >
        <p
          id="bookea-dialog-title"
          className="text-lg font-semibold tracking-tight text-slate-950"
        >
          {request.title}
        </p>
        <p
          id="bookea-dialog-message"
          className="mt-2 text-sm leading-6 text-slate-600"
        >
          {request.message}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          {request.kind === "confirm" ? (
            <button
              type="button"
              onClick={() => close(false)}
              className="h-11 rounded-full bg-violet-50 px-5 text-sm font-semibold text-violet-700 transition hover:bg-violet-100"
            >
              {request.cancelLabel}
            </button>
          ) : null}
          <button
            ref={confirmRef}
            type="button"
            onClick={() => close(true)}
            className={`h-11 rounded-full px-5 text-sm font-semibold text-white shadow-sm transition ${
              request.destructive
                ? "bg-rose-600 hover:bg-rose-500"
                : "bg-violet-600 hover:bg-violet-500"
            }`}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
