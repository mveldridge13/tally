import { useLocalSearchParams } from 'expo-router';

import { GroupDetail } from '@/screens/group-detail';

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GroupDetail id={id} />;
}
