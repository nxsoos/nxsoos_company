import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ChartNoAxesCombined, X } from 'lucide-react';
import type { CompanionSnapshot } from '../shared/companion';

const number = (value: number) => new Intl.NumberFormat().format(value);
const date = (value: string) => new Date(value).toLocaleString();

export function PlanUsageStrip({
  usage,
  online,
}: {
  usage: CompanionSnapshot['usage'];
  online: boolean;
}) {
  const plan = usage?.plan;
  return (
    <section className="hq-plan-strip" aria-label="Last reported plan allowance">
      {(
        [
          [300, '5-hour'],
          [10080, 'Weekly'],
        ] as const
      ).map(([minutes, label]) => {
        const window = plan?.windows.find((item) => item.windowMinutes === minutes);
        const available = !!window && Number.isFinite(window.usedPercent);
        const expired = !!window?.resetsAt && Date.parse(window.resetsAt) <= Date.now();
        const remaining = available ? Math.max(0, Math.min(100, 100 - window.usedPercent)) : 0;
        const detail = [
          !online && 'Disconnected; showing last snapshot',
          plan?.observedAt && 'Last reported ' + date(plan.observedAt),
          window?.resetsAt
            ? (expired ? 'Reset was ' : 'Resets ') + date(window.resetsAt)
            : 'Reset time unavailable',
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <article
            className="hq-plan-strip-card"
            key={minutes}
            aria-label={label + ' allowance'}
            title={detail}
          >
            <div>
              <strong>{label}</strong>
              <span>
                {!available
                  ? 'Unavailable'
                  : expired
                    ? 'Expired snapshot'
                    : number(remaining) + '% remaining'}
              </span>
            </div>
            {available && !expired ? (
              <progress aria-label={label + ' remaining'} max={100} value={remaining} />
            ) : (
              <div className="hq-plan-strip-empty" />
            )}
            <small>{!online ? 'Disconnected · last reported' : 'Last reported by Codex'}</small>
          </article>
        );
      })}
    </section>
  );
}

export function CompanionUsage({
  usage,
  online,
}: {
  usage: CompanionSnapshot['usage'];
  online: boolean;
}) {
  const [open, setOpen] = useState(false);
  const periods = [
    ['hour', 'Past hour', 'Rolling 60 minutes'],
    ['week', 'Past week', 'Rolling 7 days'],
    ['month', 'Past month', 'Rolling 30 days'],
  ] as const;
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="secondary compact hq-usage-button" aria-label="View usage">
          <ChartNoAxesCombined size={15} />
          <span>Usage</span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal hq-usage" aria-describedby="usage-description">
          <header className="hq-usage-heading">
            <div>
              <span className="eyebrow">CAPTURED LOCALLY</span>
              <Dialog.Title>Usage</Dialog.Title>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close usage">
              <X size={19} />
            </Dialog.Close>
          </header>
          <Dialog.Description id="usage-description">
            Tokens measure the text processed by the model. These totals cover captured external
            Codex sessions (CLI/IDE) on this device, across workspace and source filters. Company
            browser assignments are excluded.
          </Dialog.Description>
          {!online && (
            <p className="hq-usage-notice" role="status">
              Disconnected. Showing the last available usage snapshot.
            </p>
          )}
          <section aria-label="Observed token usage">
            <h3>Observed token usage</h3>
            <div className="hq-usage-periods">
              {periods.map(([key, label, interval]) => {
                const totals = usage?.[key];
                const available = !!totals?.responses;
                return (
                  <article className="hq-usage-period" key={key} aria-label={label}>
                    <h4>{label}</h4>
                    <small>{interval}</small>
                    <strong>{available ? number(totals.totalTokens) : '—'}</strong>
                    <span>{available ? 'reported tokens' : 'No captured usage'}</span>
                    {available && (
                      <dl>
                        <div>
                          <dt>Input</dt>
                          <dd>{number(totals.inputTokens)}</dd>
                        </div>
                        <div>
                          <dt>Cached input</dt>
                          <dd>{number(totals.cachedInputTokens)}</dd>
                        </div>
                        <div>
                          <dt>Output</dt>
                          <dd>{number(totals.outputTokens)}</dd>
                        </div>
                        <div>
                          <dt>Responses</dt>
                          <dd>{number(totals.responses)}</dd>
                        </div>
                      </dl>
                    )}
                  </article>
                );
              })}
            </div>
            <p className="help-text">
              Cached input is part of input, not extra tokens. These are observed totals, not a bill
              or your complete account usage. Missing sessions and unsupported transcripts are
              excluded.
            </p>
            {usage?.observedSince && (
              <p className="help-text">
                Earliest captured usage: {date(usage.observedSince)} · {number(usage.sessionCount)}{' '}
                sessions with usage.
              </p>
            )}
          </section>
          <section className="hq-plan-usage" aria-label="Codex plan allowance">
            <h3>Codex plan allowance</h3>
            {usage?.plan?.windows.length ? (
              <>
                <p className="help-text">
                  Last reported by Codex{usage.plan.planType ? ' · ' + usage.plan.planType : ''}:{' '}
                  {date(usage.plan.observedAt)}. Account limits are separate from the local token
                  totals above.
                </p>
                {usage.plan.windows.map((window, index) => {
                  const expired = !!window.resetsAt && Date.parse(window.resetsAt) <= Date.now();
                  const remaining = Math.max(0, Math.min(100, 100 - window.usedPercent));
                  const duration =
                    window.windowMinutes === 10080
                      ? 'Weekly'
                      : window.windowMinutes === 300
                        ? '5-hour'
                        : window.windowMinutes
                          ? number(window.windowMinutes) + '-minute'
                          : window.name;
                  return (
                    <article
                      className="hq-plan-window"
                      key={window.name + index}
                      aria-label={duration + ' allowance'}
                    >
                      <div>
                        <strong>{duration}</strong>
                        <span>
                          {expired
                            ? 'Expired snapshot'
                            : number(remaining) + '% remaining when reported'}
                        </span>
                      </div>
                      <progress
                        aria-label={duration + ' usage'}
                        max={100}
                        value={Math.max(0, Math.min(100, window.usedPercent))}
                      />
                      <small>
                        {number(window.usedPercent)}% used when reported
                        {window.resetsAt
                          ? ' · ' + (expired ? 'Reset was ' : 'Resets ') + date(window.resetsAt)
                          : ' · Reset time unavailable'}
                      </small>
                    </article>
                  );
                })}
                <p className="help-text">
                  Only windows supplied by Codex are shown. This is not a live quota check; use
                  Codex for the current allowance.
                </p>
              </>
            ) : (
              <p className="hq-usage-notice">
                Plan allowance unavailable. No supported account-limit snapshot has been captured
                yet. Local token totals do not tell us your remaining allowance.
              </p>
            )}
          </section>
          {usage && <footer className="help-text">Snapshot updated {date(usage.updatedAt)}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
