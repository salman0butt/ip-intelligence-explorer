import { useId, useState, type SubmitEvent } from "react";
import type { ApiError } from "../../../shared/api/apiClient";

const samples = [
  "8.8.8.8",
  "1.1.1.1",
  "2001:4860:4860::8888",
] as const;

export function LookupForm({
  onSubmit,
  isPending,
  serverError,
  onInputChange,
}: {
  readonly onSubmit: (ip: string) => void;
  readonly isPending: boolean;
  readonly serverError?: ApiError | null | undefined;
  readonly onInputChange?: () => void;
}) {
  const [value, setValue] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const errorId = useId();
  const serverMessage = serverError?.status === 400
    ? serverError.message
    : null;
  const message = localError ?? serverMessage;

  function submit(ip: string) {
    const trimmed = ip.trim();
    if (!trimmed) {
      setLocalError("Enter an IPv4 or IPv6 address.");
      return;
    }
    setLocalError(null);
    onSubmit(trimmed);
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    submit(value);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <label htmlFor="ip-address" className="block text-sm font-semibold">
        IP address
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id="ip-address"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setLocalError(null);
            onInputChange?.();
          }}
          aria-describedby={message ? errorId : undefined}
          aria-invalid={Boolean(message)}
          autoComplete="off"
          spellCheck={false}
          placeholder="8.8.8.8 or 2001:4860:4860::8888"
          className="min-w-0 flex-1 rounded-xl border border-slate-600 bg-slate-950/80 px-4 py-3 font-mono text-slate-100 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-300/30"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-xl bg-teal-300 px-6 py-3 font-semibold text-slate-950 transition hover:bg-teal-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Analyzing…" : "Analyze IP"}
        </button>
      </div>
      {message ? (
        <p id={errorId} role="alert" className="text-sm text-red-300">
          {message}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-slate-400">
          Try a sample
        </span>
        {samples.map((sample) => (
          <button
            key={sample}
            type="button"
            disabled={isPending}
            aria-label={"Try " + sample}
            onClick={() => {
              setValue(sample);
              submit(sample);
            }}
            className="rounded-full border border-slate-700 px-3 py-1.5 font-mono text-xs text-slate-300 hover:border-teal-300 hover:text-teal-200"
          >
            {sample}
          </button>
        ))}
      </div>
    </form>
  );
}
