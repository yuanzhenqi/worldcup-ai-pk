import type { ReactNode } from "react";

interface BottomDrawerProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function BottomDrawer({ open, title, onClose, children }: BottomDrawerProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="drawer-layer" role="presentation">
      <button className="drawer-backdrop" type="button" aria-label="关闭抽屉" onClick={onClose} />
      <section className="bottom-drawer" role="dialog" aria-modal="true" aria-label={title}>
        <header className="drawer-header">
          <h3>{title}</h3>
          <button type="button" onClick={onClose} aria-label="关闭">
            关闭
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
