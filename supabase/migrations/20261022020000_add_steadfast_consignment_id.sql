alter table public.orders
  add column if not exists consignment_id text;

comment on column public.orders.consignment_id is
  'Steadfast consignment ID returned when the parcel is booked; tracking_code remains the public tracking/barcode value.';
