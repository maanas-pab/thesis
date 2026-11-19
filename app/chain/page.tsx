import PageHead from "@/components/PageHead";
import { status } from "@/lib/solana";

export const dynamic = "force-dynamic";

/** What is on chain: the treasury and every story token minted so far. */
export default async function Chain() {
  const s = await status();
  return (
    <>
      <PageHead eyebrow={`Solana ${s.cluster}`} title="On chain." rest="Every story is a token.">
        <p>
          Each story side is its own SPL token. Buying mints tokens to your wallet and selling burns them. The treasury is the mint authority for all of
          them and pays every fee, so you never need SOL.
        </p>
      </PageHead>
      <div className="specs rise" style={{ "--d": "240ms" } as React.CSSProperties}>
        <div>
          <span>Network</span>
          <b>{s.cluster}</b>
        </div>
        <div>
          <span>Treasury balance</span>
          <b className="num">{s.sol == null ? "–" : `${s.sol.toFixed(3)} SOL`}</b>
        </div>
        <div>
          <span>Story tokens</span>
          <b className="num">{s.mints.length}</b>
        </div>
        <div>
          <span>Tokens</span>
          <b>{s.ready ? "On" : "Paused"}</b>
        </div>
      </div>
      <section className="panel reveal">
        <h2>
          Treasury. <span>Mint authority and fee payer.</span>
        </h2>
        <div className="kv">
          <span>Treasury</span>
          <a className="mono" href={`https://explorer.solana.com/address/${s.treasury}?cluster=${s.cluster}`} target="_blank" rel="noopener noreferrer">
            {s.treasury}
          </a>
        </div>
        <div className="kv">
          <span>Balance</span>
          <span className="num">{s.sol == null ? "Couldn't reach devnet" : `${s.sol.toFixed(4)} SOL`}</span>
        </div>
        <div className="kv">
          <span>Token program</span>
          <span className="mono">TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA</span>
        </div>
        {!s.ready && (
          <p className="err" style={{ textAlign: "left" }}>
            Tokens are off until the treasury has devnet SOL. Send some to the address above from faucet.solana.com. Buys still work in the demo meanwhile.
          </p>
        )}
      </section>
      <section className="panel reveal">
        <h2>
          Tokens. <span>{s.mints.length} minted so far.</span>
        </h2>
        {s.mints.length ? (
          s.mints.map((m) => (
            <div className="kv" key={m.key}>
              <span>
                {m.storyName} · {m.kind[0].toUpperCase() + m.kind.slice(1)}
              </span>
              <a className="mono" href={m.url} target="_blank" rel="noopener noreferrer">
                {m.mint.slice(0, 6)}…{m.mint.slice(-6)}
              </a>
            </div>
          ))
        ) : (
          <p className="sub">None yet. The first buy of each story side creates its token.</p>
        )}
      </section>
    </>
  );
}
