import { useCallback, useState } from 'react';

/**
 * Pull-to-refresh state that only reflects a refresh the person asked for by pulling down.
 * Background refreshes (returning from the share sheet, Messages or email, or after saving)
 * update the data quietly instead of flashing the spinner over the header.
 */
export function usePullToRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void refetch().finally(() => setRefreshing(false));
  }, [refetch]);
  return { refreshing, onRefresh };
}
