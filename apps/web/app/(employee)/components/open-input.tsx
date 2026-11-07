"use client";

export const OPEN_MAX = 500;

export function OpenInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor="obert" className="label">
        La teva resposta
      </label>
      <textarea
        id="obert"
        className="input w-full text-base"
        rows={6}
        maxLength={OPEN_MAX}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Escriu amb les teves paraules…"
      />
      <div className="mt-1 flex justify-between text-sm text-muted">
        <span>Anònim. No hi posis dades personals (noms, telèfons, correus).</span>
        <span className="num">
          {value.length}/{OPEN_MAX}
        </span>
      </div>
    </div>
  );
}
