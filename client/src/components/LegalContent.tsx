import type { LegalDocument } from "../content/legal";

/**
 * Pure renderer for a {@link LegalDocument}. Outputs the document's title,
 * "last updated" line, intro, and numbered sections. No scroll/consent logic —
 * that lives in the consumers (the in-app reader page and the onboarding
 * consent gate), so this stays reusable in both places.
 */
export function LegalContent({ doc }: { doc: LegalDocument }) {
  return (
    <article className="legal-doc">
      <header className="legal-doc-head">
        <h1 className="legal-doc-title">COMMONS — {doc.title}</h1>
        <p className="legal-doc-updated">Last updated: {doc.updated}</p>
      </header>

      {doc.intro.length > 0 && (
        <div className="legal-doc-intro">{doc.intro.map(renderBlock)}</div>
      )}

      {doc.sections.map((section) => (
        <section key={section.n} className="legal-doc-section">
          <h2 className="legal-doc-section-title">
            {section.n}. {section.title}
          </h2>
          {section.blocks.map(renderBlock)}
        </section>
      ))}
    </article>
  );
}

function renderBlock(block: LegalDocument["sections"][number]["blocks"][number], i: number) {
  switch (block.type) {
    case "p":
      return (
        <p key={i} className="legal-doc-p">
          {block.text}
        </p>
      );
    case "subhead":
      return (
        <p key={i} className="legal-doc-subhead">
          {block.text}
        </p>
      );
    case "ul":
      return (
        <ul key={i} className="legal-doc-list">
          {block.items.map((item, j) => (
            <li key={j}>{item}</li>
          ))}
        </ul>
      );
  }
}
