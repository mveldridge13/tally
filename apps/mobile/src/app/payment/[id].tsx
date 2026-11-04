import { useLocalSearchParams } from 'expo-router';

import { PaymentDetail } from '@/screens/payment-detail';

export default function PaymentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PaymentDetail id={id} />;
}
