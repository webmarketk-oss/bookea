"use client";

import { useEffect, useMemo, useState } from "react";
import { BookeaLogo } from "@/components/bookea-logo";
import {
  loadAppointmentConfirmation,
  loadAppointmentRescheduleSlots,
  readTokenFromLocation,
  submitAppointmentConfirmation,
  submitAppointmentReschedule,
  type AppointmentConfirmationResponse,
  type AppointmentSlotDay,
} from "@/lib/appointment-confirmation";

export default function AppointmentConfirmationPage() {
  const [busy, setBusy] = useState(false);
  const [askCancel, setAskCancel] = useState(false);
  const [askModify, setAskModify] = useState(false);
  const [ready, setReady] = useState(false);
  const [slotDays, setSlotDays] = useState<AppointmentSlotDay[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [result, setResult] = useState<AppointmentConfirmationResponse | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    setReady(true);

    void loadAppointmentConfirmation(readTokenFromLocation())
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
            canReschedule: false,
            days: [],
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedDay = useMemo(
    () => slotDays.find((day) => day.date === selectedDate) ?? slotDays[0] ?? null,
    [selectedDate, slotDays],
  );

  async function openModify() {
    setAskCancel(false);
    setAskModify(true);
    setSlotsLoading(true);

    try {
      const next = await loadAppointmentRescheduleSlots(readTokenFromLocation());
      setSlotDays(next.days ?? []);
      setSelectedDate(next.days?.[0]?.date ?? "");
      setSelectedTime("");
      if (next.appointment) {
        setResult((current) => ({
          ...(current ?? next),
          ...next,
          appointment: next.appointment,
        }));
      }
    } catch {
      setSlotDays([]);
    } finally {
      setSlotsLoading(false);
    }
  }

  async function runAction(action: "confirm" | "cancel") {
    setBusy(true);
    setAskCancel(false);

    try {
      const next = await submitAppointmentConfirmation(
        action,
        readTokenFromLocation(),
      );
      setResult(next);
      if (action === "cancel") {
        setAskModify(false);
      }
    } catch {
      setResult({
        ok: false,
        state: "error",
        message:
          "Une erreur technique a eu lieu. Réessayez dans un instant ou contactez le centre.",
        appointment: result?.appointment ?? null,
        canReschedule: result?.canReschedule,
        days: result?.days ?? [],
      });
    } finally {
      setBusy(false);
    }
  }

  async function runReschedule() {
    if (!selectedDay || !selectedTime) {
      return;
    }

    setBusy(true);

    try {
      const next = await submitAppointmentReschedule(
        selectedDay.date,
        selectedTime,
        readTokenFromLocation(),
      );
      setResult(next);
      if (next.state === "rescheduled" || next.ok) {
        setAskModify(false);
        setSlotDays([]);
        setSelectedTime("");
      } else {
        setSlotDays(next.days ?? slotDays);
      }
    } catch {
      setResult({
        ok: false,
        state: "error",
        message:
          "Une erreur technique a eu lieu. Réessayez dans un instant ou contactez le centre.",
        appointment: result?.appointment ?? null,
        canReschedule: true,
        days: slotDays,
      });
    } finally {
      setBusy(false);
    }
  }

  const state = result?.state || "pending";
  const appointment = result?.appointment;
  const canReschedule =
    Boolean(result?.canReschedule) || state === "pending" || state === "confirmed";
  const showActions = state === "pending" && Boolean(appointment);
  const showModify = canReschedule && Boolean(appointment) && state !== "cancelled";

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

            {result.message && !askModify ? (
              <p
                className={`mt-6 text-center text-sm leading-6 ${
                  state === "confirmed" || state === "rescheduled"
                    ? "font-medium text-emerald-700"
                    : "text-slate-600"
                }`}
              >
                {result.message}
              </p>
            ) : showActions && !askModify ? (
              <p className="mt-6 text-center text-sm leading-6 text-slate-600">
                Confirmez votre présence, choisissez un autre créneau ou annulez
                si vous ne pouvez plus venir.
              </p>
            ) : null}

            {showActions && !askCancel && !askModify ? (
              <div className="mt-6 grid gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runAction("confirm")}
                  className="h-12 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white disabled:opacity-60"
                >
                  {busy ? "Enregistrement..." : "Je confirme mon rendez-vous"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setAskCancel(true)}
                  className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 disabled:opacity-60"
                >
                  J’annule mon rendez-vous
                </button>
                {showModify ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void openModify()}
                    className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 disabled:opacity-60"
                  >
                    Je modifie mon rendez-vous
                  </button>
                ) : null}
              </div>
            ) : null}

            {showModify && !askModify && (state === "confirmed" || state === "rescheduled") ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void openModify()}
                className="mt-6 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 disabled:opacity-60"
              >
                Je modifie mon rendez-vous
              </button>
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

            {showModify && askModify ? (
              <div className="mt-6">
                <p className="text-center text-sm font-medium text-slate-800">
                  Choisissez un nouveau créneau
                </p>
                <p className="mt-1 text-center text-xs leading-5 text-slate-500">
                  Les horaires proposés correspondent aux disponibilités du
                  centre pour {appointment?.treatment || "votre soin"}.
                </p>

                {slotsLoading ? (
                  <p className="mt-5 text-center text-sm text-slate-500">
                    Chargement des disponibilités…
                  </p>
                ) : slotDays.length === 0 ? (
                  <p className="mt-5 text-center text-sm text-slate-500">
                    Aucun créneau n’est disponible en ligne pour le moment.
                    Contactez le centre pour convenir d’un autre horaire.
                  </p>
                ) : (
                  <>
                    <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                      {slotDays.map((day) => {
                        const active = day.date === selectedDay?.date;
                        return (
                          <button
                            key={day.date}
                            type="button"
                            onClick={() => {
                              setSelectedDate(day.date);
                              setSelectedTime("");
                            }}
                            className={`min-w-[4.6rem] rounded-2xl px-3 py-2 text-center ${
                              active
                                ? "bg-slate-950 text-white"
                                : "bg-slate-50 text-slate-700"
                            }`}
                          >
                            <span className="block text-[11px] font-medium capitalize">
                              {day.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {(selectedDay?.times ?? []).map((time) => {
                        const active = time === selectedTime;
                        return (
                          <button
                            key={time}
                            type="button"
                            onClick={() => setSelectedTime(time)}
                            className={`h-11 rounded-xl text-sm font-medium ${
                              active
                                ? "bg-slate-950 text-white"
                                : "border border-slate-200 bg-white text-slate-700"
                            }`}
                          >
                            {time}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      disabled={busy || !selectedTime}
                      onClick={() => void runReschedule()}
                      className="mt-4 h-12 w-full rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {busy ? "Enregistrement..." : "Valider ce créneau"}
                    </button>
                  </>
                )}

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setAskModify(false);
                    setSelectedTime("");
                  }}
                  className="mt-3 h-11 w-full rounded-xl bg-white px-4 text-sm font-medium text-slate-600"
                >
                  Revenir
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
