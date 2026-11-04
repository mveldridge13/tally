import { centsToDecimalString, copyablePayId, formatPayId, formatMoney, PAYID_TYPES, type Cents } from '@tally/shared';
import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { copyText } from '@/lib/clipboard';
import type { PayId } from '@/lib/data';
import { brand, radius, space, useColors } from '@/theme';
import { Card, Text } from './ui';

function CopyButton({ label, text, copied, onCopied }: { label: string; text: string; copied: boolean; onCopied: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Copy ${label}`}
      onPress={async () => {
        if (await copyText(text)) onCopied();
        else Alert.alert('Copy isn’t available', 'Update to the latest version of Tally to copy, or select the text and copy it.');
      }}
      style={({ pressed }) => ({
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
        borderRadius: radius.pill,
        backgroundColor: copied ? c.owed : pressed ? c.surfaceAlt : c.surface,
        borderWidth: 1,
        borderColor: copied ? c.owed : c.border,
      })}>
      <Text variant="label" color={copied ? brand.onDeep : c.focus}>
        {copied ? 'Copied ✓' : 'Copy'}
      </Text>
    </Pressable>
  );
}

/**
 * Someone's PayID with copy buttons, so it can be pasted into a banking app.
 * Pass `amount` to also offer copying the amount owed. Tally doesn't verify PayIDs,
 * so the card asks the payer to check the name their bank shows before paying.
 */
export function PayIdCard({ name, payId, amount }: { name: string; payId: PayId; amount?: { cents: Cents; currency: string } }) {
  const [copied, setCopied] = useState<null | 'payid' | 'amount'>(null);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const typeLabel = PAYID_TYPES.find((t) => t.id === payId.type)?.label ?? 'PayID';
  const rowStyle = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.md };

  return (
    <Card style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View style={{ backgroundColor: brand.accentSoft, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 }}>
          <Text variant="caption" color={brand.onAccent} style={{ fontWeight: '700' }}>
            PayID
          </Text>
        </View>
        <Text variant="heading" style={{ flex: 1 }} numberOfLines={1}>
          {name === 'You' ? 'Your PayID' : `Pay ${name} by PayID`}
        </Text>
      </View>

      <View style={rowStyle}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="caption" muted>
            {typeLabel}
          </Text>
          <Text variant="title" style={{ fontSize: 20, fontVariant: ['tabular-nums'] }} selectable numberOfLines={1}>
            {formatPayId(payId.type, payId.value)}
          </Text>
        </View>
        <CopyButton
          label="PayID"
          text={copyablePayId(payId.type, payId.value)}
          copied={copied === 'payid'}
          onCopied={() => setCopied('payid')}
        />
      </View>

      {amount && amount.cents > 0 ? (
        <View style={rowStyle}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="caption" muted>
              Amount
            </Text>
            <Text variant="title" style={{ fontSize: 20, fontVariant: ['tabular-nums'] }}>
              {formatMoney(amount.cents, amount.currency)}
            </Text>
          </View>
          <CopyButton
            label="amount"
            text={centsToDecimalString(amount.cents)}
            copied={copied === 'amount'}
            onCopied={() => setCopied('amount')}
          />
        </View>
      ) : null}

      <Text variant="caption" muted>
        {payId.accountName
          ? `Their bank should show the name “${payId.accountName}”. Check it matches before you pay.`
          : 'Check the name your bank shows matches before you pay. Tally doesn’t verify PayIDs.'}
      </Text>
    </Card>
  );
}
