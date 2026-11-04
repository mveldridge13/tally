import { registerSchema } from '@tally/shared';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { View, type TextInputInstance } from 'react-native';

import { AuthShell } from '@/components/brand';
import { Button, Card, Field, LinkButton, Notice, Text } from '@/components/ui';
import { deviceCurrency } from '@/lib/currencies';
import { supabase } from '@/lib/supabase';
import { space } from '@/theme';

export default function SignUpScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const emailRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);

  const passwordHint = password.length > 0 && password.length < 8 ? `${8 - password.length} more characters needed` : undefined;

  async function submit() {
    setError(null);
    const parsed = registerSchema.safeParse({
      name,
      email: email.trim(),
      password,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path[0];
      setError(
        field === 'name'
          ? 'Enter your name.'
          : field === 'email'
            ? 'Enter a valid email address.'
            : field === 'password'
              ? 'Use a password with at least 8 characters.'
              : 'Check your details.',
      );
      return;
    }
    setBusy(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      // Default currency from the phone's region (AUD in Australia); the server falls back to USD.
      options: {
        data: {
          name: parsed.data.name,
          currency: deviceCurrency() ?? undefined,
        },
      },
    });
    setBusy(false);
    if (signUpError) return setError(signUpError.message);
    // With email confirmation on, there's no session until the link is clicked.
    // With it off, onAuthStateChange signs the user in and the guard navigates away.
    if (!data.session) setCheckEmail(true);
  }

  if (checkEmail) {
    return (
      <AuthShell title="Check your email" subtitle={`We sent a confirmation link to ${email.trim()}.`}>
        <Card style={{ gap: space.sm }}>
          <Text variant="heading">One more step</Text>
          <Text muted>Open the link in that email to confirm your account, then come back and log in.</Text>
        </Card>
        <Button label="Go to log in" onPress={() => router.replace('/sign-in')} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start splitting expenses in under a minute."
      footer={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          <Text variant="body" muted>
            Already on Tally?
          </Text>
          <LinkButton label="Log in" onPress={() => router.replace('/sign-in')} />
        </View>
      }>
      <Field
        label="Your name"
        value={name}
        onChangeText={setName}
        placeholder="How friends will see you"
        autoComplete="name"
        textContentType="name"
        autoCapitalize="words"
        maxLength={60}
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => emailRef.current?.focus()}
      />
      <Field
        ref={emailRef}
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
      <Field
        ref={passwordRef}
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder="At least 8 characters"
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
        hint={passwordHint}
      />
      {error ? <Notice>{error}</Notice> : null}
      <Button label="Create account" onPress={submit} loading={busy} />
    </AuthShell>
  );
}
