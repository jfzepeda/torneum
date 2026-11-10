ALTER TABLE tournaments ADD COLUMN payment_settings jsonb NOT NULL DEFAULT '{}';
ALTER TABLE categories DROP CONSTRAINT categories_payment_mode_check;
ALTER TABLE categories ADD CHECK(payment_mode IN ('free','stripe','external','choice'));
ALTER TABLE tournament_registrations
  ADD COLUMN payment_method text CHECK(payment_method IN ('free','stripe','external','transfer','cash')),
  ADD COLUMN payment_details jsonb NOT NULL DEFAULT '{}';
