import { loginSchema } from '@tally/shared';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { View, type TextInputInstance } from 'react-native';

import { AuthShell } from '@/components/brand';
import { Button, Field, LinkButton, Notice, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { space, useColors } from '@/theme';

export default function SignInScreen() {
  const c = useColors();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInputInstance>(null);

  async function submit() {
    setError(null);
    setInfo(null);
    const parsed = loginSchema.safeParse({ email: email.trim(), password });
    if (!parsed.success) return setError('Enter your email and password.');
    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword(parsed.data);
    setBusy(false);
    // On success the auth guard in _layout swaps to the app automatically.
    if (signInError)
      setError(signInError.message === 'Invalid login credentials' ? 'That email and password don’t match.' : signInError.message);
  }

  async function resetPassword() {
    setError(null);
    setInfo(null);
    if (!email.trim()) return setError('Enter your email above, then tap “Forgot password?” again.');
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (resetError) setError(resetError.message);
    else setInfo('If that email has an account, a reset link is on its way.');
  }

  return (
    <AuthShell
      title="Welcome"
      subtitle="Log in to see your groups and balances."
      footer={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          <Text variant="body" muted>
            New to Tally?
          </Text>
          <LinkButton label="Create an account" onPress={() => router.replace('/sign-up')} />
        </View>
      }>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <View style={{ gap: space.sm }}>
        <Field
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="Your password"
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <View style={{ alignSelf: 'flex-end' }}>
          <LinkButton label="Forgot password?" onPress={resetPassword} color={c.textMuted} />
        </View>
      </View>
      {error ? <Notice>{error}</Notice> : null}
      {info ? <Notice tone="info">{info}</Notice> : null}
      <Button label="Log in" onPress={submit} loading={busy} />
    </AuthShell>
  );
}
