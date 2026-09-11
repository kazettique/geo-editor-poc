import type { ReactNode } from "react";

interface CollapsibleProps {
  title: string;
  open: boolean;
  onToggle: () => void;
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * A section that gives up its height when closed, so sibling Collapsibles in a column
 * share what is left. Children stay mounted and are hidden instead: the text pane holds
 * uncommitted text, a pending debounce and a conflict prompt that unmounting would throw
 * away, and Monaco re-measures itself on reveal through its ResizeObserver.
 */
function Collapsible({ title, open, onToggle, actions, children }: CollapsibleProps) {
  return (
    <section className={`flex min-h-0 flex-col ${open ? "flex-1" : "shrink-0"}`}>
      <div className="flex h-7 shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-50 px-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex flex-1 items-center gap-1.5 text-left text-[11px] font-medium text-slate-600 hover:text-slate-900"
        >
          <span className={`text-[8px] text-slate-400 ${open ? "" : "-rotate-90"}`}>▼</span>
          {title}
        </button>
        {actions}
      </div>
      <div className={open ? "min-h-0 flex-1" : "hidden"}>{children}</div>
    </section>
  );
}

export default Collapsible;
