import { listRecentCosts, summarizeCosts } from "@/lib/pricing";

export const dynamic = "force-dynamic";

function formatCurrency(value: number | null | undefined) {
  if (value == null) return "—";
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(4)}`;
}

function formatDate(ts: number | undefined) {
  if (!ts) return "—";
  const date = new Date(ts);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export default function PricingPage() {
  const summary = summarizeCosts();
  const costs = listRecentCosts(200);
  const imageCosts = costs.filter(
    (row) => (row.metadata as any)?.type === "image",
  );
  const imageTotal = imageCosts.reduce((sum, row) => sum + (row.cost || 0), 0);

  return (
    <div className="pricing-page">
      <header className="pricing-header">
        <div>
          <p className="eyebrow">Usage &amp; spend</p>
          <h1>Pricing dashboard</h1>
          <p className="subhead">
            Live totals from local SQLite log (captured after each OpenRouter /
            NanoGPT call).
          </p>
        </div>
        <div className="pricing-actions">
          <a className="chip ghost" href="/">
            ← Back to chat
          </a>
        </div>
      </header>

      <section className="pricing-grid">
        <div className="pricing-card">
          <div className="label">Total cost</div>
          <div className="value large">{formatCurrency(summary.totalCost)}</div>
          <div className="hint">Currency: {summary.currency}</div>
        </div>
        <div className="pricing-card">
          <div className="label">Image generation</div>
          <div className="value">{formatCurrency(imageTotal)}</div>
          <div className="hint">
            {imageCosts.length} request{imageCosts.length === 1 ? "" : "s"}
          </div>
        </div>
        {Object.entries(summary.providerTotals).map(([provider, data]) => (
          <div className="pricing-card" key={provider}>
            <div className="label">{provider}</div>
            <div className="value">{formatCurrency(data.cost)}</div>
            <div className="hint">{data.count} calls</div>
          </div>
        ))}
      </section>

      <section className="pricing-panel">
        <div className="panel-header">
          <h2>Top models</h2>
          <span className="hint">Sorted by spend (up to 10 models)</span>
        </div>
        <div className="chip-row">
          {summary.topModels.length ? (
            summary.topModels.map((item) => (
              <div className="chip ghost" key={item.model}>
                <span className="label">{item.model}</span>
                <span className="meta">
                  {formatCurrency(item.cost)} • {item.count} calls
                </span>
              </div>
            ))
          ) : (
            <div className="hint">No usage recorded yet.</div>
          )}
        </div>
      </section>

      <section className="pricing-panel">
        <div className="panel-header">
          <h2>Recent calls</h2>
          <span className="hint">Showing latest {costs.length} records</span>
        </div>
        <div className="table-scroll">
          <table className="pricing-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Provider</th>
                <th>Type</th>
                <th>Model</th>
                <th>Prompt</th>
                <th>Completion</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {costs.length ? (
                costs.map((row) => (
                  <tr key={row.id || `${row.provider}-${row.createdAt}`}>
                    <td>{formatDate(row.createdAt)}</td>
                    <td className="mono">{row.provider}</td>
                    <td className="mono">
                      {(row.metadata as any)?.type === "image"
                        ? "image"
                        : "chat"}
                    </td>
                    <td className="mono">{row.model}</td>
                    <td>{row.promptTokens ?? 0}</td>
                    <td>{row.completionTokens ?? 0}</td>
                    <td className="mono">{formatCurrency(row.cost)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="pricing-empty" colSpan={7}>
                    No cost data yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
