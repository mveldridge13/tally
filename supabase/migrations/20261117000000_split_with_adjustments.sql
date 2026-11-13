-- Split with adjustments: split equally, but someone pays a set amount more (an extra they had)
-- or less (something they skipped). The app works out each share; the adjustment is kept in
-- expense_splits.weight (signed cents) so the edit screen can show it again.

alter type public.split_method add value if not exists 'adjustment';

-- Adjustments can be negative (a discount), so weight can no longer be limited to >= 0.
alter table public.expense_splits drop constraint if exists expense_splits_weight_check;
comment on column public.expense_splits.weight is
  'Input that produced the share: basis points for percentage, units for shares, signed cents for adjustment, null otherwise.';
