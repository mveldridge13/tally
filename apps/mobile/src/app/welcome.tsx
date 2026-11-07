import { router } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeroGlow, useLightStatusBar, Wordmark } from '@/components/brand';
import { Button, LinkButton, Text } from '@/components/ui';
import { savePendingInvite, usePendingInvite } from '@/lib/pending-invite';
import { brand, radius, space } from '@/theme';
import { inviteCodeFrom } from '@/lib/invite';

const onDeepMuted = brand.onDeepMuted;

/** Static preview of what Tally shows, so the first screen explains the product. */
function PreviewCard() {
  const rows = [
    { name: 'Sam', note: 'owes you', amount: '$42.50', color: brand.accent },
    { name: 'Priya', note: 'owes you', amount: '$82.00', color: brand.accent },
    { name: 'You', note: 'owe Leo', amount: '$18.25', color: brand.oweOnDeep },
  ];
  return (
    <View
      style={{
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderColor: 'rgba(255,255,255,0.12)',
        borderWidth: 1,
        borderRadius: radius.lg,
        padding: space.lg,
        gap: space.md,
      }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}>
        <Text variant="label" color={onDeepMuted}>
          Lisbon trip
        </Text>
        <Text variant="caption" color={onDeepMuted}>
          4 people
        </Text>
      </View>
      <View>
        <Text variant="caption" color={onDeepMuted}>
          You are owed
        </Text>
        <Text
          style={{
            fontSize: 32,
            fontWeight: '800',
            color: brand.onDeep,
            fontVariant: ['tabular-nums'],
          }}>
          $106.25
        </Text>
      </View>
      <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.1)' }} />
      {rows.map((r) => (
        <View key={r.name} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: brand.tintOnDeep,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Text variant="label" color={brand.accent}>
              {r.name[0]}
            </Text>
          </View>
          <Text variant="body" color={brand.onDeep} style={{ flex: 1 }}>
            {r.name}{' '}
            <Text variant="body" color={onDeepMuted}>
              {r.note}
            </Text>
          </Text>
          <Text variant="heading" color={r.color} style={{ fontVariant: ['tabular-nums'] }}>
            {r.amount}
          </Text>
        </View>
      ))}
    </View>
  );
}

export default function WelcomeScreen() {
  const pending = usePendingInvite((state) => state.token);
  useLightStatusBar();
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState('');
  // Save the code, then sign up; after sign-up Tally joins the group automatically.
  const applyCode = () => {
    if (!code.trim()) return;
    savePendingInvite(inviteCodeFrom(code));
    router.push('/sign-up');
  };
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: brand.deep }}>
      <HeroGlow />
      <View
        style={{
          flex: 1,
          paddingTop: insets.top + space.xl,
          paddingBottom: insets.bottom + space.xl,
          paddingHorizontal: space.xl,
          justifyContent: 'space-between',
          gap: space.xl,
        }}>
        <Wordmark />

        <View style={{ gap: space.xl }}>
          <View style={{ gap: space.md }}>
            <Text variant="hero" color={brand.onDeep}>
              Split simply.{'\n'}
              <Text variant="hero" color={brand.accent}>
                Settle easily.
              </Text>
            </Text>
            <Text variant="body" color={onDeepMuted}>
              Shared expenses for trips, flatmates and friends. Always know who owes whom.
            </Text>
          </View>
          <PreviewCard />
        </View>

        <View style={{ gap: space.md }}>
          {pending ? (
            <View style={{ backgroundColor: brand.tintOnDeep, borderRadius: radius.md, padding: space.md }}>
              <Text variant="label" color={brand.onDeep}>
                Invite saved. Create an account or log in and you’ll be added to the group.
              </Text>
            </View>
          ) : codeOpen ? (
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder="Paste your invite code"
                placeholderTextColor="rgba(255,255,255,0.45)"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                selectionColor={brand.accent}
                cursorColor={brand.accent}
                returnKeyType="done"
                onSubmitEditing={applyCode}
                accessibilityLabel="Invite code"
                style={{
                  flex: 1,
                  color: brand.onDeep,
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.18)',
                  borderRadius: radius.md,
                  paddingHorizontal: space.lg,
                  minHeight: 54,
                  fontSize: 16,
                }}
              />
              <View style={{ width: 110 }}>
                <Button kind="accent" label="Use code" onPress={applyCode} disabled={!code.trim()} />
              </View>
            </View>
          ) : null}
          <Button kind="accent" label="Get started" onPress={() => router.push('/sign-up')} />
          <Button kind="outlineLight" label="I already have an account" onPress={() => router.push('/sign-in')} />
          {!pending && !codeOpen ? (
            <LinkButton label="Have an invite code?" color={brand.accent} onPress={() => setCodeOpen(true)} />
          ) : null}
        </View>
      </View>
    </View>
  );
}
