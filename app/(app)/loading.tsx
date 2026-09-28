// Shown inside the shell while a screen renders on the server. Same markup as
// the Vite app's "Opening the register…" loading line.

export default function Loading() {
  return (
    <div className="flex h-full items-center justify-center p-6 text-muted">
      <p className="animate-pulse text-[15px] font-semibold">Loading…</p>
    </div>
  );
}
