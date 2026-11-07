import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { formatPayId, normalisePayId, PAYID_TYPES, type PayIdType } from '@tally/shared';
import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { Gutter, HeroScreen, SectionTitle } from '@/components/dashboard';
import { Avatar, Button, Card, Chip, Divider, Field, Notice, Text } from '@/components/ui';
import { useMyEmail, useMyId } from '@/lib/auth';
import { CURRENCIES } from '@/lib/currencies';
import { PAYID_CURRENCY, useRemovePayId, useSetPayId, useTallyData, useUpdateProfile } from '@/lib/data';
import { supabase } from '@/lib/supabase';
import { PRESS_DELAY, brand, space, useColors } from '@/theme';
import { usePullToRefresh } from '@/lib/pull-to-refresh';

/** A tappable settings row: label on the left, current value and chevron on the right. */
function SettingRow({ label, value, onPress, danger }: { label: string; value?: string; onPress?: () => void; danger?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      android_ripple={{ color: c.surfaceAlt }}
      unstable_pressDelay={PRESS_DELAY}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: space.lg,
        gap: space.md,
      }}>
      <Text variant="heading" color={danger ? c.owe : c.text} style={{ flex: 1 }}>
        {label}
      </Text>
      {value ? (
        <Text muted numberOfLines={1} style={{ maxWidth: '55%' }}>
          {value}
        </Text>
      ) : null}
      {onPress ? (
        <Text muted style={{ fontSize: 20 }}>
          ›
        </Text>
      ) : null}
    </Pressable>
  );
}

type Editing = null | 'name' | 'currency' | 'password' | 'payid';

export default function ProfileScreen() {
  const c = useColors();
  const myId = useMyId();
  const email = useMyEmail();
  const { data, refetch } = useTallyData();
  const pull = usePullToRefresh(refetch);
  const updateProfile = useUpdateProfile();
  const setPayId = useSetPayId();
  const removePayId = useRemovePayId();

  const me = data.me;
  const myPayId = data.payIds[myId];
  const [editing, setEditing] = useState<Editing>(null);
  const [payType, setPayType] = useState<PayIdType>('phone');
  const [payValue, setPayValue] = useState('');
  const [payName, setPayName] = useState('');
  const [payError, setPayError] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [password, setPassword] = useState('');
  const [passwordState, setPasswordState] = useState<{
    busy: boolean;
    error?: string;
    done?: boolean;
  }>({ busy: false });

  function open(section: Editing) {
    updateProfile.reset();
    setPasswordState({ busy: false });
    setPassword('');
    if (section === 'name') setNameDraft(me?.name ?? '');
    if (section === 'payid') {
      const current = data.payIds[myId];
      setPayType(current?.type ?? 'phone');
      setPayValue(current ? formatPayId(current.type, current.value) : '');
      setPayName(current?.accountName ?? '');
      setPayError(null);
      setPayId.reset();
    }
    setEditing((cur) => (cur === section ? null : section));
  }

  function savePayId() {
    const result = normalisePayId(payType, payValue);
    if (!result.ok) return setPayError(result.error);
    setPayError(null);
    setPayId.mutate({ type: payType, value: result.value, accountName: payName }, { onSuccess: () => setEditing(null) });
  }

  function confirmRemovePayId() {
    Alert.alert('Remove your PayID?', 'People in your groups will no longer see it.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removePayId.mutate(undefined, { onSuccess: () => setEditing(null) }) },
    ]);
  }

  function saveName() {
    const name = nameDraft.trim();
    if (!name || name.length > 60) return;
    updateProfile.mutate({ name }, { onSuccess: () => setEditing(null) });
  }

  async function savePassword() {
    if (password.length < 8)
      return setPasswordState({
        busy: false,
        error: 'Use at least 8 characters.',
      });
    setPasswordState({ busy: true });
    const { error } = await supabase.auth.updateUser({ password });
    setPassword('');
    setPasswordState(error ? { busy: false, error: error.message } : { busy: false, done: true });
  }

  function signOut() {
    Alert.alert('Sign out of Tally?', 'You can log back in any time with your email and password.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => supabase.auth.signOut(),
      },
    ]);
  }

  // Your initial, large, in the middle of the card. The camera badge is a placeholder for profile photos.
  const card = (
    <View style={{ alignItems: 'center', paddingVertical: space.sm }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add a profile photo"
        onPress={() => Alert.alert('Profile photos are coming soon', 'For now, people in your groups see your initial.')}>
        <Avatar name={me?.name || email || '?'} size={88} color={brand.deep} />
        <View
          style={{
            position: 'absolute',
            right: -2,
            bottom: -2,
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: c.surface,
            borderWidth: 2,
            borderColor: brand.deep,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <MaterialIcons name="photo-camera" size={16} color={brand.deep} />
        </View>
      </Pressable>
    </View>
  );

  return (
    <HeroScreen
      nav="tab"
      title={me?.name || 'Profile'}
      subtitle={email ?? undefined}
      card={card}
      cardTone="light"
      refreshing={pull.refreshing}
      onRefresh={pull.onRefresh}>
      <View style={{ gap: space.md }}>
        <SectionTitle title="Account" />
        <Gutter>
          <Card style={{ paddingVertical: 0 }}>
            <SettingRow label="Name" value={me?.name} onPress={() => open('name')} />
            {editing === 'name' ? (
              <View style={{ gap: space.md, paddingBottom: space.lg }}>
                <Field
                  label="Your name"
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  autoFocus
                  maxLength={60}
                  returnKeyType="done"
                  onSubmitEditing={saveName}
                  hint="This is how you appear to people in your groups."
                />
                {updateProfile.isError ? <Notice>{updateProfile.error.message}</Notice> : null}
                <Button
                  label="Save name"
                  onPress={saveName}
                  loading={updateProfile.isPending}
                  disabled={!nameDraft.trim() || nameDraft.trim() === me?.name}
                />
              </View>
            ) : null}
            <Divider />
            <SettingRow label="Email" value={email} />
            <Divider />
            <SettingRow label="Default currency" value={me?.currency} onPress={() => open('currency')} />
            {editing === 'currency' ? (
              <View style={{ gap: space.md, paddingBottom: space.lg }}>
                <Text variant="caption" muted>
                  New groups start in this currency. Existing groups keep theirs.
                  {me?.currencyChosen ? '' : ' Right now it follows your phone’s region.'}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: space.sm,
                  }}>
                  {CURRENCIES.map((code) => (
                    <Chip
                      key={code}
                      label={code}
                      selected={me?.currency === code}
                      onPress={() => updateProfile.mutate({ currency: code }, { onSuccess: () => setEditing(null) })}
                    />
                  ))}
                </View>
                {updateProfile.isError ? <Notice>{updateProfile.error.message}</Notice> : null}
              </View>
            ) : null}
          </Card>
        </Gutter>
      </View>

      {/* PayID is Australian, so this only appears when your default currency is AUD. */}
      {me?.currency === PAYID_CURRENCY ? (
        <View style={{ gap: space.md }}>
          <SectionTitle title="Payment details" />
          <Gutter>
            <Card style={{ paddingVertical: 0 }}>
              <SettingRow
                label="PayID"
                value={myPayId ? formatPayId(myPayId.type, myPayId.value) : 'Add yours'}
                onPress={() => open('payid')}
              />
              {editing === 'payid' ? (
                <View style={{ gap: space.md, paddingBottom: space.lg }}>
                  <Text variant="caption" muted>
                    People in your AUD groups will see this so they can copy it into their banking app to pay you back. Tally never moves
                    money.
                  </Text>
                  <View style={{ flexDirection: 'row', gap: space.sm }}>
                    {PAYID_TYPES.map((t) => (
                      <Chip
                        key={t.id}
                        label={t.label}
                        selected={payType === t.id}
                        onPress={() => {
                          setPayType(t.id);
                          setPayValue('');
                          setPayError(null);
                        }}
                      />
                    ))}
                  </View>
                  <Field
                    label={PAYID_TYPES.find((t) => t.id === payType)?.label ?? 'PayID'}
                    value={payValue}
                    onChangeText={(v) => {
                      setPayValue(v);
                      setPayError(null);
                    }}
                    placeholder={PAYID_TYPES.find((t) => t.id === payType)?.placeholder}
                    keyboardType={payType === 'email' ? 'email-address' : payType === 'phone' ? 'phone-pad' : 'number-pad'}
                    autoCapitalize="none"
                    autoCorrect={false}
                    error={payError ?? undefined}
                  />
                  <Field
                    label="Name on the account (optional)"
                    value={payName}
                    onChangeText={setPayName}
                    placeholder="As your bank shows it, e.g. SAM SMITH"
                    autoCapitalize="characters"
                    maxLength={140}
                    hint="Helps people check they’re paying the right person."
                  />
                  {setPayId.isError ? <Notice>{setPayId.error.message}</Notice> : null}
                  {removePayId.isError ? <Notice>{removePayId.error.message}</Notice> : null}
                  <Button label="Save PayID" onPress={savePayId} loading={setPayId.isPending} disabled={!payValue.trim()} />
                  {myPayId ? (
                    <Button kind="secondary" label="Remove PayID" onPress={confirmRemovePayId} loading={removePayId.isPending} />
                  ) : null}
                </View>
              ) : null}
            </Card>
          </Gutter>
        </View>
      ) : null}

      <View style={{ gap: space.md }}>
        <SectionTitle title="Security" />
        <Gutter>
          <Card style={{ paddingVertical: 0 }}>
            <SettingRow label="Change password" onPress={() => open('password')} />
            {editing === 'password' ? (
              <View style={{ gap: space.md, paddingBottom: space.lg }}>
                <Field
                  label="New password"
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                    setPasswordState({ busy: false });
                  }}
                  secureTextEntry
                  autoComplete="new-password"
                  textContentType="newPassword"
                  placeholder="At least 8 characters"
                  returnKeyType="done"
                  onSubmitEditing={savePassword}
                />
                {passwordState.error ? <Notice>{passwordState.error}</Notice> : null}
                {passwordState.done ? <Notice tone="info">Password updated.</Notice> : null}
                <Button label="Update password" onPress={savePassword} loading={passwordState.busy} disabled={!password} />
              </View>
            ) : null}
          </Card>
        </Gutter>
      </View>

      <View style={{ gap: space.md }}>
        <SectionTitle title="App" />
        <Gutter>
          <Card style={{ paddingVertical: 0 }}>
            <SettingRow label="Notifications" value="Coming soon" />
            <Divider />
            <SettingRow label="Version" value={Constants.expoConfig?.version ?? '—'} />
          </Card>
          <Button kind="secondary" label="Sign out" onPress={signOut} />
          <Text variant="caption" muted style={{ textAlign: 'center', color: c.textMuted }}>
            Tally · Split simply. Settle easily.
          </Text>
        </Gutter>
      </View>
    </HeroScreen>
  );
}
