import { useLocalSearchParams } from 'expo-router';

import { ExpenseDetail } from '@/screens/expense-detail';

export default function ExpenseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExpenseDetail id={id} />;
}
