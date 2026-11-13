/**
 * The Recurring panel on New expense, and the words used for recurring expenses everywhere.
 *
 * Layout (agreed mock-up): a summary sentence at the top, six plain "how often" tiles, then one card
 * of single-line choices (Starts, Ends, Heads-up, each opening its chips one at a time) and the
 * "Amount changes each time" switch.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { formatMoney, type Cents } from '@tally/shared';
import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, Switch, View } from 'react-native';

import { Bouncy, buzz, expenseEmoji } from '@/components/fun';
import { Button, Card, Chip, Divider, Text } from '@/components/ui';
import { HEADS_UP_DAYS, type Frequency, type RecurringDue } from '@/lib/data';
import { brand, radius, space, useColors } from '@/theme';

export interface RecurringForm {
  /** Off = an ordinary one-off expense. */
  on: boolean;
  frequency: Frequency;
  /** YYYY-MM-DD, today or later. */
  start: string;
  ends: 'never' | 'date' | 'times';
  /** For ends = 'date'. */
  endDate: string | null;
  /** For ends = 'times'. */
  times: number;
  variable: boolean;
  headsUpDays: number;
}

/** Today as a calendar date on this phone (YYYY-MM-DD). */
export function todayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}
function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addMonths(isoDate: string, months: number) {
  const d = toDate(isoDate);
  const day = d.getDate();
  const out = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const last = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate();
  out.setDate(Math.min(day, last));
  return iso(out);
}

/** The n-th date of a schedule (n = 0 is the start), the same rule as the database. */
export function recurringDate(start: string, frequency: Frequency, n: number): string {
  if (frequency === 'weekly' || frequency === 'fortnightly') {
    const d = toDate(start);
    d.setDate(d.getDate() + (frequency === 'weekly' ? 7 : 14) * n);
    return iso(d);
  }
  return addMonths(start, frequency === 'monthly' ? n : frequency === 'quarterly' ? 3 * n : 12 * n);
}

export const defaultRecurring = (): RecurringForm => ({
  on: false,
  frequency: 'monthly',
  start: todayDate(),
  ends: 'never',
  endDate: null,
  times: 12,
  variable: false,
  headsUpDays: 1,
});

/** "1 Dec", or "1 Dec 2027" when it isn't this year. */
export function shortDate(isoDate: string): string {
  const d = toDate(isoDate);
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};
/** "every month", for sentences. */
export const FREQUENCY_EVERY: Record<Frequency, string> = {
  weekly: 'every week',
  fortnightly: 'every 2 weeks',
  monthly: 'every month',
  quarterly: 'every 3 months',
  yearly: 'every year',
};
/** "/ month", after an amount. */
export const FREQUENCY_PER: Record<Frequency, string> = {
  weekly: 'week',
  fortnightly: '2 weeks',
  monthly: 'month',
  quarterly: 'quarter',
  yearly: 'year',
};

export const headsUpLabel = (days: number) =>
  days === 0 ? 'Same day' : days === 1 ? '1 day before' : days === 7 ? '1 week before' : `${days} days before`;

function tomorrowDate() {
  const d = toDate(todayDate());
  d.setDate(d.getDate() + 1);
  return iso(d);
}

/**
 * A month calendar for picking a date: ‹ › to change month, days before `min` greyed out,
 * today circled, the chosen day in purple. Weeks start on Monday.
 */
export function Calendar({ value, min, onChange }: { value: string; min: string; onChange: (date: string) => void }) {
  const c = useColors();
  const start = toDate(value >= min ? value : min);
  const [month, setMonth] = useState(new Date(start.getFullYear(), start.getMonth(), 1));
  const today = todayDate();
  const firstWeekday = (month.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => iso(new Date(month.getFullYear(), month.getMonth(), i + 1))),
  ];
  while (cells.length % 7) cells.push(null);
  const canGoBack = iso(new Date(month.getFullYear(), month.getMonth(), 0)) >= min;
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const title = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <View style={{ gap: space.sm, paddingTop: space.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          disabled={!canGoBack}
          onPress={() => shift(-1)}
          hitSlop={8}
          style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceAlt, opacity: canGoBack ? 1 : 0.35 }}>
          <MaterialIcons name="chevron-left" size={22} color={c.text} />
        </Pressable>
        <Text variant="heading" style={{ flex: 1, textAlign: 'center' }}>
          {title}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          onPress={() => shift(1)}
          hitSlop={8}
          style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceAlt }}>
          <MaterialIcons name="chevron-right" size={22} color={c.text} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <Text key={i} variant="caption" muted style={{ flex: 1, textAlign: 'center', fontWeight: '700' }}>
            {d}
          </Text>
        ))}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, w) => (
        <View key={w} style={{ flexDirection: 'row' }}>
          {cells.slice(w * 7, w * 7 + 7).map((d, i) => {
            if (!d) return <View key={i} style={{ flex: 1, height: 40 }} />;
            const off = d < min;
            const chosen = d === value;
            const isToday = d === today;
            return (
              <Pressable
                key={d}
                accessibilityRole="button"
                accessibilityState={{ selected: chosen, disabled: off }}
                accessibilityLabel={shortDate(d)}
                disabled={off}
                onPress={() => {
                  buzz.tap();
                  onChange(d);
                }}
                style={{ flex: 1, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: chosen ? c.primary : 'transparent',
                    borderWidth: isToday && !chosen ? 1.5 : 0,
                    borderColor: c.primary,
                  }}>
                  <Text
                    variant="label"
                    color={chosen ? c.onPrimary : off ? c.textMuted : c.text}
                    style={{ fontWeight: chosen || isToday ? '800' : '500', opacity: off ? 0.4 : 1 }}>
                    {Number(d.slice(8, 10))}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Days from today to a YYYY-MM-DD date. */
export function daysUntil(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  const [ty, tm, td] = todayDate().split('-').map(Number);
  return Math.round((Date.UTC(y!, m! - 1, d!) - Date.UTC(ty!, tm! - 1, td!)) / 86_400_000);
}

export const whenText = (isoDate: string) => {
  const n = daysUntil(isoDate);
  return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`;
};

/** A light wash of a colour, for tiles (amount 0 = the colour, 1 = white). */
export function wash(hex: string, amount: number) {
  const n = Number.parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
}

/** The plain sentence at the top of the panel. */
export function recurringSummary(
  f: RecurringForm,
  what: { description: string; amount: Cents | null; currency: string; payer: string; splitLine: string },
): string {
  const name = what.description.trim() || 'This expense';
  if (!f.on) return `${name} is added once, as usual.`;
  const end =
    f.ends === 'never' ? 'until someone stops it' : f.ends === 'date' && f.endDate ? `until ${shortDate(f.endDate)}` : `${f.times} times`;
  const from = f.start === todayDate() ? 'starting today' : `from ${shortDate(f.start)}`;
  const heads = f.headsUpDays === 0 ? 'on the day' : headsUpLabel(f.headsUpDays);
  return f.variable
    ? `${name} comes up ${FREQUENCY_EVERY[f.frequency]} ${from}, ${end}. Each time, Tally asks ${what.payer} for the amount and splits it the same way. Everyone hears ${heads}.`
    : `${name}${what.amount ? ` ${formatMoney(what.amount, what.currency)}` : ''} is added ${FREQUENCY_EVERY[f.frequency]} ${from}, ${end}, paid by ${what.payer} and ${what.splitLine}. Everyone in it hears ${heads}.`;
}

/** The line on New expense under "Paid by": "Recurring · Monthly from 1 Dec". */
export function RecurringLine({ form, onPress }: { form: RecurringForm; onPress: () => void }) {
  const c = useColors();
  const detail = form.on
    ? `${FREQUENCY_LABEL[form.frequency]}${form.variable ? ', amount changes' : ''} · ${form.start === todayDate() ? 'from today' : `from ${shortDate(form.start)}`} · heads-up ${headsUpLabel(form.headsUpDays).toLowerCase()}`
    : 'Not recurring';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Recurring: ${detail}. Change`}
      onPress={onPress}
      android_ripple={{ color: c.surfaceAlt }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        padding: space.lg,
        borderRadius: radius.lg,
        backgroundColor: c.surfaceAlt,
        overflow: 'hidden',
      }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
        <MaterialIcons name="repeat" size={22} color={c.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="heading">Recurring</Text>
        <Text variant="caption" muted numberOfLines={2}>
          {detail}
        </Text>
      </View>
      <Text muted style={{ fontSize: 22 }}>
        ›
      </Text>
    </Pressable>
  );
}

const FREQ_TILES: { id: Frequency | 'once'; label: string }[] = [
  { id: 'once', label: 'Once' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'fortnightly', label: 'Fortnightly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'yearly', label: 'Yearly' },
];

/** What goes inside the Recurring panel (the Sheet and its Done button come from the screen). */
export function RecurringPanel({
  form,
  onChange,
  summary,
  /** Editing a schedule: it can't be turned into a one-off, and its start has passed. */
  editingSchedule,
}: {
  form: RecurringForm;
  onChange: (f: RecurringForm) => void;
  summary: string;
  editingSchedule?: boolean;
}) {
  const c = useColors();
  const [open, setOpen] = useState<'start' | 'ends' | 'heads' | null>(null);
  const set = (patch: Partial<RecurringForm>) => onChange({ ...form, ...patch });
  const ends =
    form.ends === 'never' ? 'Never' : form.ends === 'date' && form.endDate ? shortDate(form.endDate) : `After ${form.times} times`;

  const row = (key: 'start' | 'ends' | 'heads', label: string, value: string, body: React.ReactNode) => (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open === key }}
        accessibilityLabel={`${label}: ${value}`}
        onPress={() => {
          buzz.tap();
          setOpen((o) => (o === key ? null : key));
        }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md + 2 }}>
        <Text variant="heading" style={{ flex: 1 }}>
          {label}
        </Text>
        <Text variant="heading" color={c.primary} style={{ fontWeight: '700' }}>
          {value}
        </Text>
        <MaterialIcons name={open === key ? 'expand-less' : 'expand-more'} size={22} color={c.textMuted} />
      </Pressable>
      {open === key ? <View style={{ paddingBottom: space.md, gap: space.sm }}>{body}</View> : null}
    </View>
  );

  return (
    <View style={{ gap: space.lg }}>
      <View style={{ backgroundColor: brand.coralSoft, borderRadius: radius.lg - 2, padding: space.md + 2 }}>
        <Text style={{ fontSize: 15, lineHeight: 21, color: brand.onCoral }}>{summary}</Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {FREQ_TILES.filter((t) => !(editingSchedule && t.id === 'once')).map((t) => {
          const on = t.id === 'once' ? !form.on : form.on && form.frequency === t.id;
          return (
            <View key={t.id} style={{ width: '31.5%' }}>
              <Bouncy
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  buzz.tap();
                  set(t.id === 'once' ? { on: false } : { on: true, frequency: t.id });
                }}
                style={{
                  alignItems: 'center',
                  paddingVertical: space.md + 2,
                  borderRadius: radius.md + 2,
                  borderWidth: 1,
                  borderColor: on ? c.primary : c.border,
                  backgroundColor: on ? c.primary : c.surface,
                }}>
                <Text variant="label" color={on ? c.onPrimary : c.text} style={{ fontSize: 15, fontWeight: '700' }}>
                  {t.label}
                </Text>
              </Bouncy>
            </View>
          );
        })}
      </View>

      {form.on ? (
        <Card style={{ paddingVertical: 0 }}>
          {editingSchedule
            ? null
            : row(
                'start',
                'Starts',
                form.start === todayDate() ? 'Today' : shortDate(form.start),
                <>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
                    <Chip label="Today" selected={form.start === todayDate()} onPress={() => set({ start: todayDate() })} />
                    <Chip label="Tomorrow" selected={form.start === tomorrowDate()} onPress={() => set({ start: tomorrowDate() })} />
                  </View>
                  <Calendar
                    value={form.start}
                    min={todayDate()}
                    onChange={(d) => set({ start: d, endDate: form.endDate && form.endDate < d ? null : form.endDate, ends: form.ends === 'date' && form.endDate && form.endDate < d ? 'never' : form.ends })}
                  />
                </>,
              )}
          {editingSchedule ? null : <Divider />}
          {row(
            'ends',
            'Ends',
            ends,
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
                <Chip label="Never" selected={form.ends === 'never'} onPress={() => set({ ends: 'never' })} />
                <Chip
                  label="On a date"
                  selected={form.ends === 'date'}
                  onPress={() => set({ ends: 'date', endDate: form.endDate ?? addMonths(form.start, 12) })}
                />
                <Chip label={`After ${form.times} times`} selected={form.ends === 'times'} onPress={() => set({ ends: 'times' })} />
              </View>
              {form.ends === 'date' && form.endDate ? (
                <Calendar value={form.endDate} min={form.start} onChange={(d) => set({ endDate: d })} />
              ) : null}
              {form.ends === 'times' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <Chip label="−" selected={false} onPress={() => set({ times: Math.max(2, form.times - 1) })} />
                  <Text variant="heading" style={{ minWidth: 28, textAlign: 'center' }}>
                    {form.times}
                  </Text>
                  <Chip label="+" selected={false} onPress={() => set({ times: Math.min(120, form.times + 1) })} />
                  <Text variant="caption" muted>
                    times, e.g. a 12-month lease
                  </Text>
                </View>
              ) : null}
            </>,
          )}
          <Divider />
          {row(
            'heads',
            'Heads-up',
            headsUpLabel(form.headsUpDays),
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
                {HEADS_UP_DAYS.map((d) => (
                  <Chip key={d} label={headsUpLabel(d)} selected={form.headsUpDays === d} onPress={() => set({ headsUpDays: d })} />
                ))}
              </View>
              <Text variant="caption" muted>
                Everyone in the expense is told.
              </Text>
            </>,
          )}
          <Divider />
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: form.variable }}
            onPress={() => set({ variable: !form.variable })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md + 2 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="heading">Amount changes each time</Text>
              <Text variant="caption" muted>
                Tally asks for it on the day, e.g. power bills
              </Text>
            </View>
            <Switch
              value={form.variable}
              onValueChange={(v) => set({ variable: v })}
              trackColor={{ true: c.primary, false: c.border }}
              thumbColor={c.surface}
            />
          </Pressable>
        </Card>
      ) : null}
    </View>
  );
}

/** "this month's", "this quarter's": how the bill is described when asking for its amount. */
const THIS_TIME: Record<Frequency, string> = {
  weekly: 'this week’s',
  fortnightly: 'this fortnight’s',
  monthly: 'this month’s',
  quarterly: 'this quarter’s',
  yearly: 'this year’s',
};

/**
 * A recurring bill whose amount changes, due and waiting for it: on Home (under the total card)
 * and on the group's page, until someone enters the amount.
 */
export function DueBillCard({ bill, group }: { bill: RecurringDue; group?: { name: string; icon: string | null } }) {
  const c = useColors();
  return (
    <View style={{ gap: space.md, padding: space.lg, borderRadius: radius.xl - 6, backgroundColor: c.surfaceAlt }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 24 }}>{expenseEmoji(bill.description)}</Text>
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Text variant="caption" muted style={{ fontWeight: '600' }}>
            Due {bill.dueDate === todayDate() ? 'today' : shortDate(bill.dueDate)}
            {group ? ` · ${group.icon ? `${group.icon} ` : ''}${group.name}` : ''}
          </Text>
          <Text variant="title" style={{ fontSize: 20 }} numberOfLines={1}>
            {bill.description}
          </Text>
          <Text variant="caption" muted>
            Enter {THIS_TIME[bill.frequency]} amount. It’s split the same way as before.
          </Text>
        </View>
      </View>
      <Button
        size="small"
        label="Add amount"
        onPress={() => router.push({ pathname: '/add-expense', params: { dueId: bill.id, groupId: bill.groupId } })}
      />
    </View>
  );
}
