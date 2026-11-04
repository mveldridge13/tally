import { Linking, Platform, Share } from 'react-native';

import { createInvite } from './data';

/** The text of an invite to a group, optionally as a named guest whose history comes with them. */
export function inviteMessage(groupName: string, token: string, guestName?: string) {
  const intro = guestName
    ? `Join "${groupName}" on Tally as ${guestName}. Everything already recorded for you comes with you.`
    : `Join "${groupName}" on Tally so we can split expenses.`;
  return `${intro}\n\nOpen: tally://invite/${token}\n\nOr in Tally go to Groups → Join a group and paste this code:\n${token}`;
}

export type InviteChannel = 'text' | 'email' | 'share';

/**
 * Create an invite (tied to a guest when `guestId` is given) and hand it to the chosen channel:
 * the Messages app addressed to `phone`, the email app addressed to `email`, or the share sheet.
 * Falls back to the share sheet if the Messages or email app can't be opened.
 */
export async function sendInvite(options: {
  groupId: string;
  groupName: string;
  guestId?: string;
  guestName?: string;
  channel: InviteChannel;
  phone?: string;
  email?: string;
}) {
  const token = await createInvite(options.groupId, options.guestId);
  const message = inviteMessage(options.groupName, token, options.guestName);

  let url: string | null = null;
  if (options.channel === 'text' && options.phone) {
    // iOS separates the body with "&", Android with "?".
    const number = options.phone.replace(/[^\d+]/g, '');
    url = `sms:${number}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(message)}`;
  } else if (options.channel === 'email' && options.email) {
    const subject = `Join ${options.groupName} on Tally`;
    url = `mailto:${encodeURIComponent(options.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
  }

  if (url) {
    try {
      await Linking.openURL(url);
      return;
    } catch {
      // No Messages or email app available: fall through to the share sheet.
    }
  }
  await Share.share({ message });
}
