/** The one page header every inner page uses: a small eyebrow, then "Title. Grey follow-on." */
export default function PageHead({ eyebrow, title, rest, children }: { eyebrow?: string; title: string; rest?: string; children?: React.ReactNode }) {
  return (
    <header className="phead">
      {eyebrow && <span className="eyebrow rise">{eyebrow}</span>}
      <h1 className="rise" style={{ "--d": "60ms" } as React.CSSProperties}>
        {title}
        {rest && <span> {rest}</span>}
      </h1>
      {children && (
        <div className="phead-body rise" style={{ "--d": "160ms" } as React.CSSProperties}>
          {children}
        </div>
      )}
    </header>
  );
}

/** A section heading in the same voice. */
export function SectionHead({ title, rest, children }: { title: string; rest?: string; children?: React.ReactNode }) {
  return (
    <div className="shead">
      <h2>
        {title}
        {rest && <span> {rest}</span>}
      </h2>
      {children}
    </div>
  );
}
