/**
 * Alert Management — Requirements 5.1–5.6
 * Full UI: rule list, create/edit modal, channel config, notification log
 */

import React, { useEffect, useState, useCallback } from 'react';
import type { AlertRule, NotificationChannel, Role } from '@portal/shared';

interface Props { readonly role: Role; }

// ─── Local types ──────────────────────────────────────────────────────────────

interface NotificationLog {
  id: string;
  ruleId: string;
  ruleName: string;
  triggeredAt: string;
  channel: string;
  status: 'delivered' | 'failed' | 'retrying';
  attempts: number;
}

type ChannelType = 'email' | 'slack' | 'teams' | 'webhook';

interface ChannelDraft {
  type: ChannelType;
  address: string;   // email
  webhookUrl: string; // slack / teams / webhook
  url: string;       // generic webhook
}

interface RuleDraft {
  name: string;
  threshold: number;
  windowSeconds: number;
  triggerOnNewError: boolean;
  enabled: boolean;
  channels: ChannelDraft[];
}

const EMPTY_DRAFT: RuleDraft = {
  name: '', threshold: 10, windowSeconds: 60,
  triggerOnNewError: false, enabled: true, channels: [],
};

const CHANNEL_ICONS: Record<ChannelType, string> = {
  email: '📧', slack: '💬', teams: '🟦', webhook: '🔗',
};

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  delivered: { bg: 'rgba(16,185,129,0.15)', color: '#34d399' },
  failed:    { bg: 'rgba(239,68,68,0.15)',  color: '#f87171' },
  retrying:  { bg: 'rgba(245,158,11,0.15)', color: '#fbbf24' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--card-border)',
  borderRadius: 10, padding: 20,
};

function btn(variant: 'primary' | 'ghost' | 'danger' | 'success'): React.CSSProperties {
  const map = {
    primary: { bg: '#6366f1', color: '#fff', border: 'none' },
    success: { bg: '#10b981', color: '#fff', border: 'none' },
    danger:  { bg: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' },
    ghost:   { bg: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--card-border)' },
  }[variant];
  return {
    padding: '7px 16px', borderRadius: 7, fontSize: 12.5, fontWeight: 600,
    cursor: 'pointer', background: map.bg, color: map.color, border: map.border,
  };
}

function inputStyle(width?: number | string): React.CSSProperties {
  return {
    background: 'var(--input-bg)', border: '1px solid var(--input-border)',
    borderRadius: 6, color: 'var(--text)', padding: '7px 11px',
    fontSize: 13, outline: 'none', width: width ?? '100%',
  };
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }}>{children}</div>;
}

function fmt(ts: string) {
  return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

function channelLabel(ch: NotificationChannel): string {
  if (ch.type === 'email') return `📧 ${ch.address}`;
  if (ch.type === 'slack') return `💬 Slack`;
  if (ch.type === 'teams') return `🟦 Teams`;
  return `🔗 Webhook`;
}

// ─── Channel editor ───────────────────────────────────────────────────────────

function ChannelEditor({ channels, onChange }: {
  channels: ChannelDraft[];
  onChange: (c: ChannelDraft[]) => void;
}) {
  function add() {
    onChange([...channels, { type: 'email', address: '', webhookUrl: '', url: '' }]);
  }
  function remove(i: number) { onChange(channels.filter((_, idx) => idx !== i)); }
  function update(i: number, patch: Partial<ChannelDraft>) {
    onChange(channels.map((c, idx) => idx === i ? { ...c, ...patch } : c));
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Label>Notification Channels</Label>
        <button type="button" onClick={add} style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 12 }}>+ Add Channel</button>
      </div>
      {channels.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '10px 0' }}>No channels configured — add at least one.</div>
      )}
      {channels.map((ch, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <select value={ch.type} onChange={e => update(i, { type: e.target.value as ChannelType })}
            style={{ ...inputStyle(110), flex: 'none' }}>
            <option value="email">Email</option>
            <option value="slack">Slack</option>
            <option value="teams">Teams</option>
            <option value="webhook">Webhook</option>
          </select>
          {ch.type === 'email' && (
            <input placeholder="recipient@example.com" value={ch.address}
              onChange={e => update(i, { address: e.target.value })} style={inputStyle()} />
          )}
          {(ch.type === 'slack' || ch.type === 'teams') && (
            <input placeholder="Webhook URL" value={ch.webhookUrl}
              onChange={e => update(i, { webhookUrl: e.target.value })} style={inputStyle()} />
          )}
          {ch.type === 'webhook' && (
            <input placeholder="https://your-endpoint.com/hook" value={ch.url}
              onChange={e => update(i, { url: e.target.value })} style={inputStyle()} />
          )}
          <button type="button" onClick={() => remove(i)}
            style={{ ...btn('danger'), padding: '6px 10px', flex: 'none' }}>✕</button>
        </div>
      ))}
    </div>
  );
}

// ─── Rule modal ───────────────────────────────────────────────────────────────

function RuleModal({ initial, onSave, onClose }: {
  initial: RuleDraft | null;
  onSave: (d: RuleDraft) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<RuleDraft>(initial ?? EMPTY_DRAFT);
  const set = (patch: Partial<RuleDraft>) => setDraft(d => ({ ...d, ...patch }));

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 1000, padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14, width: '100%', maxWidth: 560,
        maxHeight: '90vh', overflow: 'auto',
        boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{initial ? 'Edit Alert Rule' : 'Create Alert Rule'}</div>
          <button onClick={onClose} style={{ ...btn('ghost'), padding: '4px 10px' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Name */}
          <div>
            <Label>Rule Name</Label>
            <input value={draft.name} onChange={e => set({ name: e.target.value })}
              placeholder="e.g. High error rate" style={inputStyle()} />
          </div>

          {/* Threshold + Window */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <Label>Error Threshold</Label>
              <input type="number" min={1} value={draft.threshold}
                onChange={e => set({ threshold: Number(e.target.value) })} style={inputStyle()} />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Trigger when breaks exceed this count</div>
            </div>
            <div>
              <Label>Time Window (seconds)</Label>
              <input type="number" min={10} value={draft.windowSeconds}
                onChange={e => set({ windowSeconds: Number(e.target.value) })} style={inputStyle()} />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Rolling window for threshold evaluation</div>
            </div>
          </div>

          {/* Toggles */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={draft.triggerOnNewError}
                onChange={e => set({ triggerOnNewError: e.target.checked })} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Trigger on new error type</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Alert immediately when a brand-new error fingerprint is detected</div>
              </div>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={draft.enabled}
                onChange={e => set({ enabled: e.target.checked })} />
              <div style={{ fontSize: 13, fontWeight: 600 }}>Rule enabled</div>
            </label>
          </div>

          {/* Channels */}
          <ChannelEditor channels={draft.channels} onChange={c => set({ channels: c })} />
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button onClick={onClose} style={btn('ghost')}>Cancel</button>
          <button onClick={() => { if (draft.name.trim()) onSave(draft); }}
            style={btn('primary')} disabled={!draft.name.trim()}>
            {initial ? 'Save Changes' : 'Create Rule'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Notification log row ─────────────────────────────────────────────────────

function LogRow({ log }: { log: NotificationLog }) {
  const s = STATUS_STYLE[log.status] ?? STATUS_STYLE.failed;
  return (
    <tr style={{ borderBottom: '1px solid var(--card-border)', fontSize: 13 }}>
      <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontFamily: 'ui-monospace,monospace', fontSize: 11, whiteSpace: 'nowrap' }}>
        {fmt(log.triggeredAt)}
      </td>
      <td style={{ padding: '10px 14px', fontWeight: 600 }}>{log.ruleName}</td>
      <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{log.channel}</td>
      <td style={{ padding: '10px 14px' }}>
        <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color }}>
          {log.status}
        </span>
      </td>
      <td style={{ padding: '10px 14px', textAlign: 'center', color: log.attempts >= 3 ? '#f87171' : 'var(--text-muted)', fontSize: 12 }}>
        {log.attempts}/3
      </td>
    </tr>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AlertManagement({ role }: Props) {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AlertRule | null>(null);
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [activeTab, setActiveTab] = useState<'rules' | 'log'>('rules');

  const canEdit = role === 'admin' || role === 'developer';

  const loadRules = useCallback(() => {
    fetch('/api/alerts')
      .then(r => r.json())
      .then(d => { setRules(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { loadRules(); }, [loadRules]);

  // Mock notification log — replace with real fetch when backend endpoint exists
  useEffect(() => {
    setLogs([
      { id: '1', ruleId: '', ruleName: 'High error rate', triggeredAt: new Date(Date.now() - 120000).toISOString(), channel: '📧 ops@company.com', status: 'delivered', attempts: 1 },
      { id: '2', ruleId: '', ruleName: 'New error type', triggeredAt: new Date(Date.now() - 300000).toISOString(), channel: '💬 Slack', status: 'failed', attempts: 3 },
      { id: '3', ruleId: '', ruleName: 'High error rate', triggeredAt: new Date(Date.now() - 600000).toISOString(), channel: '🔗 Webhook', status: 'retrying', attempts: 2 },
    ]);
  }, []);

  function openCreate() { setEditTarget(null); setModalOpen(true); }
  function openEdit(rule: AlertRule) { setEditTarget(rule); setModalOpen(true); }

  async function handleSave(draft: RuleDraft) {
    const body = {
      name: draft.name,
      threshold: draft.threshold,
      windowSeconds: draft.windowSeconds,
      triggerOnNewError: draft.triggerOnNewError,
      enabled: draft.enabled,
      channels: draft.channels.map(ch => {
        if (ch.type === 'email') return { type: 'email', address: ch.address };
        if (ch.type === 'slack') return { type: 'slack', webhookUrl: ch.webhookUrl };
        if (ch.type === 'teams') return { type: 'teams', webhookUrl: ch.webhookUrl };
        return { type: 'webhook', url: ch.url };
      }),
      createdBy: 'admin',
    };

    if (editTarget) {
      await fetch(`/api/alerts/${editTarget.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } else {
      await fetch('/api/alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    }
    setModalOpen(false);
    loadRules();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this alert rule?')) return;
    await fetch(`/api/alerts/${id}`, { method: 'DELETE' });
    loadRules();
  }

  async function toggleEnabled(rule: AlertRule) {
    await fetch(`/api/alerts/${rule.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    loadRules();
  }

  if (!canEdit) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
        Admin or Developer role required to manage alerts.
      </div>
    );
  }

  return (
    <div data-testid="alert-management">

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Alerts</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Configure thresholds and notification channels — alerts retry up to 3× with exponential backoff
          </p>
        </div>
        <button data-testid="create-rule" onClick={openCreate} style={btn('primary')}>
          + Create Rule
        </button>
      </div>

      {/* ── Stats row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Rules',    value: rules.length,                              color: '#6366f1', icon: '📋' },
          { label: 'Active Rules',   value: rules.filter(r => r.enabled).length,       color: '#10b981', icon: '✅' },
          { label: 'Disabled Rules', value: rules.filter(r => !r.enabled).length,      color: '#f59e0b', icon: '⏸' },
          { label: 'Failed Alerts',  value: logs.filter(l => l.status === 'failed').length, color: '#ef4444', icon: '❌' },
        ].map(s => (
          <div key={s.label} style={{ ...card, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 24 }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {(['rules', 'log'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '7px 18px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            background: activeTab === tab ? '#6366f1' : 'transparent',
            color: activeTab === tab ? '#fff' : 'var(--text-muted)',
            border: activeTab === tab ? 'none' : '1px solid var(--card-border)',
          }}>
            {tab === 'rules' ? '📋 Rules' : '📜 Notification Log'}
          </button>
        ))}
      </div>

      {/* ── Rules tab ── */}
      {activeTab === 'rules' && (
        loading ? (
          <div data-testid="alerts-loading" style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>Loading…</div>
        ) : (
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            {/* Table head */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 100px 110px 80px auto 120px',
              padding: '10px 16px', borderBottom: '1px solid var(--card-border)',
              fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: 0.8,
            }}>
              <span>Rule Name</span>
              <span>Threshold</span>
              <span>Window</span>
              <span>New Error</span>
              <span>Channels</span>
              <span style={{ textAlign: 'right' }}>Actions</span>
            </div>

            <ul data-testid="alert-rules" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {rules.length === 0 && (
                <li style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                  <div style={{ fontSize: 28, marginBottom: 10 }}>🔔</div>
                  No alert rules configured — create one to get started
                </li>
              )}
              {rules.map((rule, i) => (
                <li key={rule.id} data-testid="alert-rule-item" style={{
                  display: 'grid', gridTemplateColumns: '1fr 100px 110px 80px auto 120px',
                  padding: '13px 16px', alignItems: 'center',
                  borderBottom: i < rules.length - 1 ? '1px solid var(--card-border)' : 'none',
                  fontSize: 13, opacity: rule.enabled ? 1 : 0.5,
                }}>
                  <div>
                    <div data-testid="rule-name" style={{ fontWeight: 600 }}>{rule.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {rule.enabled
                        ? <span style={{ color: '#10b981' }}>● Active</span>
                        : <span style={{ color: '#f59e0b' }}>⏸ Disabled</span>}
                    </div>
                  </div>
                  <span data-testid="rule-threshold" style={{ color: '#fbbf24', fontWeight: 700 }}>
                    {rule.threshold} errors
                  </span>
                  <span data-testid="rule-window" style={{ color: 'var(--text-muted)' }}>
                    {rule.windowSeconds >= 60 ? `${rule.windowSeconds / 60}m` : `${rule.windowSeconds}s`}
                  </span>
                  <span style={{ fontSize: 16 }}>{rule.triggerOnNewError ? '✅' : '—'}</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {(rule.channels ?? []).map((ch, ci) => (
                      <span key={ci} style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 4,
                        background: 'rgba(99,102,241,0.12)', color: '#818cf8',
                      }}>
                        {channelLabel(ch)}
                      </span>
                    ))}
                    {(rule.channels ?? []).length === 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>None</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button onClick={() => toggleEnabled(rule)} style={{ ...btn('ghost'), padding: '5px 10px', fontSize: 11 }}
                      title={rule.enabled ? 'Disable' : 'Enable'}>
                      {rule.enabled ? '⏸' : '▶'}
                    </button>
                    <button data-testid="edit-rule" onClick={() => openEdit(rule)}
                      aria-label={`Edit ${rule.name}`} style={{ ...btn('ghost'), padding: '5px 10px', fontSize: 11 }}>
                      ✏️
                    </button>
                    <button data-testid="delete-rule" onClick={() => handleDelete(rule.id)}
                      aria-label={`Delete ${rule.name}`} style={{ ...btn('danger'), padding: '5px 10px', fontSize: 11 }}>
                      🗑
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )
      )}

      {/* ── Notification log tab ── */}
      {activeTab === 'log' && (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--card-border)', fontSize: 13, color: 'var(--text-muted)' }}>
            Recent notification dispatches — failed deliveries are retried up to 3× with exponential backoff
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--input-bg)', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                {['Triggered At', 'Rule', 'Channel', 'Status', 'Attempts'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', borderBottom: '1px solid var(--card-border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr><td colSpan={5} style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>No notifications dispatched yet</td></tr>
              )}
              {logs.map(log => <LogRow key={log.id} log={log} />)}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal ── */}
      {modalOpen && (
        <RuleModal
          initial={editTarget ? {
            name: editTarget.name,
            threshold: editTarget.threshold,
            windowSeconds: editTarget.windowSeconds,
            triggerOnNewError: editTarget.triggerOnNewError,
            enabled: editTarget.enabled,
            channels: (editTarget.channels ?? []).map(ch => ({
              type: ch.type as ChannelType,
              address: ch.type === 'email' ? (ch as any).address : '',
              webhookUrl: (ch.type === 'slack' || ch.type === 'teams') ? (ch as any).webhookUrl : '',
              url: ch.type === 'webhook' ? (ch as any).url : '',
            })),
          } : null}
          onSave={handleSave}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
