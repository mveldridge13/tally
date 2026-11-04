import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, useColorScheme } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { useAuth } from '@/lib/auth';
import { brand, useColors } from '@/theme';

SplashScreen.preventAutoHideAsync();
// Fade the sage splash into the first screen (which also starts sage) instead of cutting to it.
SplashScreen.setOptions({ fade: true, duration: 350 });

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

// Refetch when the app comes back to the foreground.
AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));

export default function RootLayout() {
  const scheme = useColorScheme();
  const c = useColors();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const { session, ready } = useAuth();
  const signedIn = !!session;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  useEffect(() => {
    // Drop cached data from a previous account on sign-out.
    if (!signedIn) queryClient.clear();
  }, [signedIn]);

  if (!ready) return null;

  return (
    <KeyboardProvider>
      <QueryClientProvider client={queryClient}>
        {/* background = navy: every screen starts with a navy header, so nothing light flashes while a screen slides in */}
        <ThemeProvider
          value={{
            ...base,
            colors: {
              ...base.colors,
              background: brand.deep,
              card: c.surface,
              text: c.text,
              primary: c.primary,
              border: c.border,
            },
          }}>
          {/* Every screen has a navy top, so the status bar stays light. Flipping it per screen made it flicker. */}
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              // Screens slide in from the right; forms (modals below) slide up from the bottom.
              animation: 'slide_from_right',
              contentStyle: { backgroundColor: brand.deep },
            }}>
            <Stack.Protected guard={signedIn}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="group/[id]" options={{ headerShown: false }} />
              <Stack.Screen name="expense/[id]" options={{ headerShown: false }} />
              <Stack.Screen name="payment/[id]" options={{ headerShown: false }} />
              <Stack.Screen name="balance/[groupId]" />
              <Stack.Screen
                name="add-expense"
                options={{
                  presentation: 'modal',
                  animation: 'slide_from_bottom',
                }}
              />
              <Stack.Screen
                name="new-group"
                options={{
                  presentation: 'modal',
                  animation: 'slide_from_bottom',
                }}
              />
              <Stack.Screen
                name="settle"
                options={{
                  presentation: 'modal',
                  animation: 'slide_from_bottom',
                }}
              />
            </Stack.Protected>
            {/* Reachable signed in or out: signed out, it saves the invite and sends you to sign up. */}
            <Stack.Screen name="invite/[token]" options={{ headerShown: false }} />
            <Stack.Protected guard={!signedIn}>
              <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
              <Stack.Screen name="sign-in" options={{ headerShown: false }} />
              <Stack.Screen name="sign-up" options={{ headerShown: false }} />
            </Stack.Protected>
          </Stack>
        </ThemeProvider>
      </QueryClientProvider>
    </KeyboardProvider>
  );
}
