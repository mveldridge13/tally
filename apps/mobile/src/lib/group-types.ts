/** What a group is for. The emoji is saved as the group's icon; "Other" uses the name's first letter. */
export const GROUP_TYPES = [
  { id: 'trip', label: 'Trip', emoji: '✈️', names: ['Weekend away', 'Road trip', 'Holiday'] },
  { id: 'home', label: 'Home', emoji: '🏠', names: ['Our place', 'Bills', 'Household'] },
  { id: 'housemates', label: 'Housemates', emoji: '🛋️', names: ['Flat bills', 'Groceries', 'House fund'] },
  { id: 'family', label: 'Family', emoji: '👨‍👩‍👧', names: ['Christmas', 'Birthday gift', 'Family'] },
  { id: 'dining', label: 'Dining', emoji: '🍽️', names: ['Friday dinners', 'Brunch club', 'Pizza night'] },
  { id: 'other', label: 'Other', emoji: null, names: ['Book club', 'Footy tips', 'Gift'] },
] as const;
export type GroupType = (typeof GROUP_TYPES)[number];

/**
 * Groups don't store a type, only an icon. Read the type back from it, including the older
 * change-icon emoji (beach, tent and car count as trips; groceries and bulb as home; coffee as dining).
 */
const ICON_TO_TYPE: Record<string, GroupType['id']> = {
  '✈️': 'trip',
  '🏖️': 'trip',
  '⛺': 'trip',
  '🚗': 'trip',
  '🏠': 'home',
  '💡': 'home',
  '🛒': 'home',
  '🛋️': 'housemates',
  '👨‍👩‍👧': 'family',
  '🍽️': 'dining',
  '☕': 'dining',
};

export function groupTypeOf(icon: string | null | undefined): GroupType {
  const id = (icon && ICON_TO_TYPE[icon]) || 'other';
  return GROUP_TYPES.find((t) => t.id === id)!;
}
