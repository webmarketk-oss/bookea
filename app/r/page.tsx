"use client";

import { useEffect, useState } from "react";
import { BookeaLogo } from "@/components/bookea-logo";
import {
  loadAppointmentConfirmation,
  readTokenFromLocation,
  submitAppointmentConfirmation,
  type AppointmentConfirmationResponse,
} from "@/lib/appointment-confirmation";

export default function AppointmentConfirmationPage() {
  const [busy, setBusy] = useState(false);
  const [askCancel, setAskCancel] = useState(false);
  const [ready, setReady] = useState(false);
  const [result, setResult] = useState<AppointmentConfirmationResponse | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    setReady(true);

    loadAppointmentConfirmation(readTokenFromLocation())
      .then((next) => {
        if (!cancelled) {
          setResult(next);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResult({
            ok: false,
            state: "error",
            message:
              "Une erreur technique a eu lieu. Réessayez dans un instant ou contactez le centre.",
            appointment: null,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function runAction(action: "confirm" | "cancel") {
    setBusy(true);
    setAskCancel(false);

    try {
      const next = await submitAppointmentConfirmation(
        action,
        readTokenFromLocation(),
      );
      setResult(next);
    } catch {
      setResult({
        ok: false,
        state: "error",
        message:
          "Une erreur technique a eu lieu. Réessayez dans un instant ou contactez le centre.",
        appointment: result?.appointment ?? null,
      });
    } finally {
      setBusy(false);
    }
  }

  const state = result?.state || "pending";
  const appointment = result?.appointment;
  const showActions = state === "pending" && Boolean(appointment);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f7fb] px-4 py-10 text-slate-950">
      <section className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex justify-center">
          <BookeaLogo size="md" showSlogan />
        </div>

        {!ready || !result ? (
          <p className="mt-8 text-center text-sm text-slate-500">
            Chargement de votre rendez-vous…
          </p>
        ) : (
          <>
            {appointment && state !== "invalid" ? (
              <div className="mt-8 rounded-2xl bg-slate-50 px-4 py-5 text-center">
                <p className="text-sm font-medium text-slate-500">Rendez-vous</p>
                <h1 className="mt-1 text-xl font-semibold tracking-tight">
                  {appointment.centerName}
                </h1>
                <p className="mt-3 text-base font-medium text-slate-800">
                  {appointment.date}
                  {appointment.time ? ` à ${appointment.time}` : ""}
                </p>
                {appointment.treatment ? (
                  <p className="mt-1 text-sm text-slate-500">
                    {appointment.treatment}
                  </p>
                ) : null}
              </div>
            ) : null}

            {result.message ? (
              <p
                className={`mt-6 text-center text-sm leading-6 ${
                  state === "confirmed"
                    ? "font-medium text-emerald-700"
                    : "text-slate-600"
                }`}
              >
                {result.message}
              </p>
            ) : showActions ? (
              <p className="mt-6 text-center text-sm leading-6 text-slate-600">
                Confirmez votre présence ou annulez si vous ne pouvez plus venir.
              </p>
            ) : null}

            {showActions && !askCancel ? (
              <div className="mt-6 grid gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runAction("confirm")}
                  className="h-12 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white disabled:opacity-60"
                >
                  {busy ? "Enregistrement..." : "Confirmer mon rendez-vous"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setAskCancel(true)}
                  className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 disabled:opacity-60"
                >
                  Annuler mon rendez-vous
                </button>
              </div>
            ) : null}

            {showActions && askCancel ? (
              <div className="mt-6 rounded-2xl border border-orange-100 bg-orange-50 p-4">
                <p className="text-center text-sm font-medium text-orange-800">
                  Confirmez-vous l’annulation de ce rendez-vous ?
                </p>
                <div className="mt-4 grid gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runAction("cancel")}
                    className="h-11 rounded-xl bg-orange-600 px-4 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {busy ? "Annulation..." : "Oui, annuler le rendez-vous"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setAskCancel(false)}
                    className="h-11 rounded-xl bg-white px-4 text-sm font-medium text-slate-600"
                  >
                    Non, revenir
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
