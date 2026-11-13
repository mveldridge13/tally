import { useMemo } from 'react';

import { useMyId } from '@/lib/auth';
import { summarizeGroup, useTallyData, type GroupSummary } from '@/lib/data';

export function useGroupSummaries(): GroupSummary[] {
  const myId = useMyId();
  const { data } = useTallyData();
  return useMemo(() => data.groups.map((g) => summarizeGroup(g, data.ledgers[g.id], myId)), [data, myId]);
}

/** The one person you owe or who owes you in a group, when there's exactly one. */
export function soleOther(summary: GroupSummary, myId: string): string | undefined {
  const mine = summary.transfers.filter((t) => t.fromUserId === myId || t.toUserId === myId);
  if (mine.length !== 1) return undefined;
  return mine[0]!.fromUserId === myId ? mine[0]!.toUserId : mine[0]!.fromUserId;
}

export function useGroupSummary(groupId: string): GroupSummary | undefined {
  return useGroupSummaries().find((s) => s.group.id === groupId);
}

/** `myEffect`: how this item changed the signed-in user's balance (+ owed to you, − you owe). */
export type ActivityItem =
  | {
      kind: 'expense';
      id: string;
      groupId: string;
      at: string;
      title: string;
      amount: number;
      actorId: string;
      myEffect: number;
      involved: boolean;
    }
  | {
      kind: 'settlement';
      id: string;
      groupId: string;
      at: string;
      fromUserId: string;
      toUserId: string;
      amount: number;
      myEffect: number;
      involved: boolean;
      /** Waiting for the receiver to confirm; doesn't count towards balances yet. */
      pending?: boolean;
    };

export function useActivity(groupId?: string): ActivityItem[] {
  const myId = useMyId();
  const { data } = useTallyData();
  return useMemo(() => {
    const items: ActivityItem[] = [
      ...data.expenses.map((e) => {
        const myShare = e.splits.find((s) => s.userId === myId)?.amount ?? 0;
        const paid = e.payerId === myId ? e.amount : 0;
        return {
          kind: 'expense' as const,
          id: e.id,
          groupId: e.groupId,
          at: e.occurredAt,
          title: e.description,
          amount: e.amount,
          actorId: e.payerId,
          myEffect: paid - myShare,
          involved: paid > 0 || myShare > 0,
        };
      }),
      ...data.settlements.map((s) => ({
        kind: 'settlement' as const,
        id: s.id,
        groupId: s.groupId,
        at: s.occurredAt,
        fromUserId: s.fromUserId,
        toUserId: s.toUserId,
        amount: s.amount,
        myEffect: s.fromUserId === myId ? s.amount : s.toUserId === myId ? -s.amount : 0,
        involved: s.fromUserId === myId || s.toUserId === myId,
      })),
      ...data.pendingPayments.map((s) => ({
        kind: 'settlement' as const,
        id: s.id,
        groupId: s.groupId,
        at: s.occurredAt,
        fromUserId: s.fromUserId,
        toUserId: s.toUserId,
        amount: s.amount,
        myEffect: 0,
        involved: s.fromUserId === myId || s.toUserId === myId,
        pending: true,
      })),
    ];
    return items.filter((i) => !groupId || i.groupId === groupId).sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [data, groupId, myId]);
}

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
