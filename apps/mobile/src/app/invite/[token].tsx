import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { TallyMark } from '@/components/brand';
import { Gutter, HeroNav, HeroScreen, onDeepMuted } from '@/components/dashboard';
import { Button, Notice, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useAcceptInvite } from '@/lib/data';
import { savePendingInvite } from '@/lib/pending-invite';
import { brand, space } from '@/theme';

/**
 * Opened from tally://invite/<token>, the "Join a group" box on the Groups tab, or automatically
 * after sign-in when an invite was saved while signed out.
 */
export default function AcceptInviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const accept = useAcceptInvite();
  const started = useRef(false);
  const signedIn = useAuth((s) => !!s.session);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    if (!signedIn) {
      // Not signed in yet: keep the invite and join automatically after sign-up or log-in.
      savePendingInvite(token);
      router.replace('/welcome');
      return;
    }
    accept.mutate(token.trim(), {
      onSuccess: (groupId) => router.replace(`/group/${groupId}`),
    });
  }, [token, accept, signedIn]);

  const failed = accept.isError;

  const header = (
    <>
      <HeroNav mode="back" eyebrow="Invite" title={failed ? 'Couldn’t join' : 'Joining group'} />
      <View style={{ alignItems: 'center', marginTop: space.xl, gap: space.lg }}>
        <TallyMark size={64} />
        {failed ? null : <ActivityIndicator color={brand.accent} />}
        <Text variant="body" color={onDeepMuted} style={{ textAlign: 'center' }}>
          {failed ? 'This invite didn’t work.' : 'Adding you to the group…'}
        </Text>
      </View>
    </>
  );

  return (
    <HeroScreen header={header}>
      <Stack.Screen options={{ headerShown: false }} />
      <Gutter>
        {failed ? (
          <>
            <Notice>{accept.error.message}</Notice>
            <Text variant="caption" muted>
              Invite codes expire after 14 days and stop working if the group is deleted. Ask for a fresh invite and paste the new code on
              the Groups tab.
            </Text>
            <Button label="Back to groups" onPress={() => router.replace('/groups')} />
          </>
        ) : (
          <Text variant="caption" muted style={{ textAlign: 'center' }}>
            You’ll go straight to the group once you’ve joined.
          </Text>
        )}
      </Gutter>
    </HeroScreen>
  );
}
