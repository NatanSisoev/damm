import { draftQuestions } from "@/lib/hr-fixtures";

export default function ReviewPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Revisa les preguntes proposades</h1>
      <p className="text-sm opacity-70">Cap pregunta entra al grup fins que una persona l&apos;aprova.</p>
      <ul className="space-y-3">
        {draftQuestions.map((q) => (
          <li key={q.id} className="rounded border p-3">
            <div className="text-xs opacity-60">{q.domini} · {q.tipus}</div>
            <p className="my-2">{q.text}</p>
            <div className="flex gap-2 text-sm">
              <button type="button" disabled className="rounded border px-3 py-1">Aprovar</button>
              <button type="button" disabled className="rounded border px-3 py-1">Editar</button>
              <button type="button" disabled className="rounded border px-3 py-1">Descartar</button>
            </div>
          </li>
        ))}
      </ul>
      <button type="button" disabled className="rounded bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black">Publicar (enllaç i QR)</button>
    </section>
  );
}
