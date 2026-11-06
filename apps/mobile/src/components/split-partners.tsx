import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar, Card, Divider, LinkButton, Text } from '@/components/ui';
import type { SplitPartner } from '@/lib/data';
import { PRESS_DELAY, brand, useColors } from '@/theme';

/** How many people show before "Show more". */
const FIRST = 6;

/**
 * Tick list of people you split with. Tapping a row selects or unselects them;
 * the screen decides what to do with the selection.
 */
export function SplitPartnerPicker({
  partners,
  selected,
  onToggle,
}: {
  partners: SplitPartner[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  const c = useColors();
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? partners : partners.slice(0, FIRST);

  return (
    <>
      <Card style={{ paddingVertical: 0 }}>
        {shown.map((p, i) => {
          const on = selected.has(p.id);
          return (
            <View key={p.id}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`Add ${p.name}`}
                onPress={() => onToggle(p.id)}
                android_ripple={{ color: c.surfaceAlt }}
                unstable_pressDelay={PRESS_DELAY}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
                <Avatar name={p.name} size={36} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="heading" numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text variant="caption" muted>
                    {p.sharedGroups === 1 ? 'In 1 group with you' : `In ${p.sharedGroups} groups with you`}
                  </Text>
                </View>
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    borderWidth: 2,
                    borderColor: on ? c.focus : c.border,
                    backgroundColor: on ? c.focus : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  {on ? <Text style={{ color: brand.onDeep, fontSize: 14, fontWeight: '800', lineHeight: 16 }}>✓</Text> : null}
                </View>
              </Pressable>
            </View>
          );
        })}
      </Card>
      {partners.length > FIRST ? (
        <LinkButton
          label={showAll ? 'Show fewer' : `Show ${partners.length - FIRST} more`}
          onPress={() => setShowAll((v) => !v)}
        />
      ) : null}
    </>
  );
}

/** Selection state for the picker: a set of ids with a toggle. */
export function useSelection() {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return { selected, toggle, clear: () => setSelected(new Set()) };
}
