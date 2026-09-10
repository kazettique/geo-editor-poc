import type { ReactNode } from "react";

interface PaneProps {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}

function Pane({ title, actions, children }: PaneProps) {
  return (
    <section className="flex min-h-0 min-w-0 flex-col bg-white">
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-3">
        <h2 className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{title}</h2>
        {actions}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

export default Pane;
