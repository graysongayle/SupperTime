SELECT setval(
  pg_get_serial_sequence('"Ticket"', 'number'),
  GREATEST(
    COALESCE((SELECT MAX("number") FROM "Ticket"), 0),
    9999
  ),
  true
);
