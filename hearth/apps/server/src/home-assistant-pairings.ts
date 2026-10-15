import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { BridgePairingApproval } from '@hearth/shared';
import { createConnectionCode } from './connection-codes.js';
import type { HomeAssistantBridgeService } from './home-assistant-bridge.js';
import type { PhoneApprovalReference } from './phone-connections.js';
import { RepositoryError } from './repository.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const LIFETIME = 5 * 60_000;
type Pairing = {
  id: string;
  requestId: string;
  secretHash: string;
  codeHash: string;
  expiresAt: string;
  approval: {
    input: Omit<BridgePairingApproval, 'code'>;
    reference: PhoneApprovalReference;
  } | null;
  cancelled: boolean;
};

/** A short code identifies a request; only an authenticated adult can approve it.
 * The original HA instance must separately prove its 256-bit secret to exchange. */
export class HomeAssistantPairingService {
  private readonly rows = new Map<string, Pairing>();
  private readonly reveals = new Map<string, string>();
  private readonly attempts = new Map<string, { count: number; until: number }>();
  private readonly cancellations = new Map<string, number>();
  constructor(
    private readonly bridge: HomeAssistantBridgeService,
    private readonly options: {
      database?: InstanceType<typeof Database>;
      now?: () => Date;
      assertApproval: (reference: PhoneApprovalReference) => void;
    },
  ) {
    for (const row of (options.database
      ?.prepare('SELECT record_json FROM home_assistant_bridge_pairings')
      .all() as { record_json: string }[]) ?? []) {
      const parsed = JSON.parse(row.record_json) as Pairing;
      this.rows.set(parsed.id, parsed);
    }
    this.clean();
  }
  start(input: { requestId: string; secret: string }, address: string) {
    this.limit(`start:${address}`, 10);
    this.clean();
    const previous = [...this.rows.values()].find((row) => row.requestId === input.requestId);
    if (previous) {
      if (previous.secretHash !== hash(input.secret)) this.unavailable();
      const code = this.reveals.get(previous.id);
      if (!code || previous.cancelled) this.unavailable();
      return { id: previous.id, code, expiresAt: previous.expiresAt, interval: 3 as const };
    }
    if (this.rows.size >= 64) this.unavailable();
    if ([...this.rows.values()].some((row) => row.secretHash === hash(input.secret)))
      this.unavailable();
    let code = createConnectionCode();
    let collisions = 0;
    while ([...this.rows.values()].some((row) => row.codeHash === hash(code))) {
      if (++collisions >= 10) this.unavailable();
      code = createConnectionCode();
    }
    const row: Pairing = {
      id: `ha_pairing_${randomUUID().replaceAll('-', '_')}`,
      requestId: input.requestId,
      secretHash: hash(input.secret),
      codeHash: hash(code),
      expiresAt: new Date(this.now().getTime() + LIFETIME).toISOString(),
      approval: null,
      cancelled: false,
    };
    this.save(row);
    this.reveals.set(row.id, code);
    return { id: row.id, code, expiresAt: row.expiresAt, interval: 3 as const };
  }
  async approve(input: BridgePairingApproval, reference: PhoneApprovalReference, address: string) {
    this.limit(`approve:${address}`, 10);
    const cancellation = this.cancellations.get(reference.householdId) ?? 0;
    this.options.assertApproval(reference);
    this.clean();
    const previous = [...this.rows.values()].find(
      (value) =>
        value.approval?.input.requestId === input.requestId &&
        value.approval.reference.householdId === reference.householdId &&
        value.approval.reference.connectionId === reference.connectionId,
    );
    if (previous && previous.codeHash !== hash(input.code)) this.unavailable();
    const row = [...this.rows.values()].find((value) => value.codeHash === hash(input.code));
    if (!row || row.cancelled) this.unavailable();
    const permissions = {
      requestId: input.requestId,
      screenIds: input.screenIds,
      shareChores: input.shareChores,
      shareCalendar: input.shareCalendar,
      controlChores: input.controlChores,
    };
    if (row.approval) {
      if (JSON.stringify(row.approval) !== JSON.stringify({ input: permissions, reference }))
        this.unavailable();
      return { approved: true as const, expiresAt: row.expiresAt };
    }
    const active = await this.bridge.get(reference.householdId, reference.memberId);
    if ((this.cancellations.get(reference.householdId) ?? 0) !== cancellation) this.unavailable();
    this.assertLive(row);
    this.options.assertApproval(reference);
    if (active)
      throw new RepositoryError(
        'CONFLICT',
        'Disconnect existing Home Assistant access before reconnecting.',
      );
    // No await between the second lookup and saving: two adults cannot overwrite an approval.
    if (this.rows.get(row.id)?.approval) this.unavailable();
    const approved = { ...row, approval: { input: permissions, reference } };
    const commit = () => {
      this.options.assertApproval(reference);
      this.persist(approved);
      this.bridge.recordPairingApproval(
        reference.householdId,
        reference.memberId,
        row.id,
        input.requestId,
      );
    };
    if (this.options.database) this.options.database.transaction(commit)();
    else commit();
    this.rows.set(row.id, approved);
    return { approved: true as const, expiresAt: row.expiresAt };
  }
  async exchange(id: string, secret: string, address: string) {
    this.limit(`exchange:${address}`, 240);
    this.clean();
    const row = this.rows.get(id);
    if (!row || row.secretHash !== hash(secret)) this.unavailable();
    this.assertLive(row);
    if (!row.approval) return { state: 'waiting' as const, receipt: null };
    const { input, reference } = row.approval;
    // Use the pairing's immutable request ID, not any browser-supplied machine key.
    const receipt = await this.bridge.grant(
      reference.householdId,
      reference.memberId,
      {
        ...input,
        requestId: row.requestId,
        secret,
      },
      () => {
        this.assertLive(row);
        this.options.assertApproval(reference);
      },
    );
    if (receipt.connection.revokedAt !== null) this.unavailable();
    return { state: 'connected' as const, receipt };
  }
  cancelForHousehold(householdId: string) {
    this.cancellations.set(householdId, (this.cancellations.get(householdId) ?? 0) + 1);
    for (const row of this.rows.values())
      if (row.approval?.reference.householdId === householdId)
        this.save({ ...row, cancelled: true });
  }
  reset() {
    this.options.database?.exec('DELETE FROM home_assistant_bridge_pairings');
    this.rows.clear();
    this.reveals.clear();
    this.attempts.clear();
    this.cancellations.clear();
  }
  private assertLive(row: Pairing) {
    if (
      !this.rows.has(row.id) ||
      this.rows.get(row.id)?.cancelled ||
      row.expiresAt <= this.now().toISOString()
    )
      this.unavailable();
  }
  private save(row: Pairing) {
    this.persist(row);
    this.rows.set(row.id, row);
  }
  private persist(row: Pairing) {
    // The approval code must not be retained raw, even inside the JSON record.
    this.options.database
      ?.prepare(
        `INSERT INTO home_assistant_bridge_pairings (id,request_id,secret_hash,code_hash,expires_at,record_json) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET record_json=excluded.record_json`,
      )
      .run(row.id, row.requestId, row.secretHash, row.codeHash, row.expiresAt, JSON.stringify(row));
  }
  private clean() {
    const now = this.now().toISOString();
    this.options.database
      ?.prepare('DELETE FROM home_assistant_bridge_pairings WHERE expires_at<=?')
      .run(now);
    for (const [id, row] of this.rows)
      if (row.expiresAt <= now) {
        this.rows.delete(id);
        this.reveals.delete(id);
      }
  }
  private limit(key: string, maximum: number) {
    const now = this.now().getTime();
    for (const [id, attempt] of this.attempts) if (attempt.until <= now) this.attempts.delete(id);
    // Shared budget also bounds distributed guessing/flooding across this single-household service.
    for (const [id, bound] of [
      [key.slice(0, 160), maximum],
      ['global', 2000],
    ] as const) {
      const attempt = this.attempts.get(id) ?? { count: 0, until: now + LIFETIME };
      if (attempt.count >= bound || (!this.attempts.has(id) && this.attempts.size >= 512))
        this.unavailable();
      attempt.count += 1;
      this.attempts.set(id, attempt);
    }
  }
  private now() {
    return this.options.now?.() ?? new Date();
  }
  private unavailable(): never {
    throw new RepositoryError(
      'FORBIDDEN',
      'This connection request is unavailable. Start again in Home Assistant.',
    );
  }
}
