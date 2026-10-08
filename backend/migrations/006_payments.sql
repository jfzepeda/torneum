ALTER TABLE categories
  ADD COLUMN price_cents integer NOT NULL DEFAULT 0 CHECK(price_cents>=0),
  ADD COLUMN payment_mode text NOT NULL DEFAULT 'free' CHECK(payment_mode IN ('free','stripe','external')),
  ADD COLUMN registration_starts_at timestamptz,
  ADD COLUMN registration_ends_at timestamptz,
  ADD COLUMN participant_count integer NOT NULL DEFAULT 2 CHECK(participant_count BETWEEN 1 AND 100),
  ADD COLUMN payment_policy text NOT NULL DEFAULT '',
  ADD CHECK(registration_ends_at IS NULL OR registration_starts_at IS NULL OR registration_ends_at>registration_starts_at),
  ADD CHECK((payment_mode='free' AND price_cents=0) OR (payment_mode<>'free' AND price_cents>0));
ALTER TABLE teams DROP CONSTRAINT teams_players_check;
ALTER TABLE teams DROP CONSTRAINT teams_captain_check;
ALTER TABLE teams ADD CHECK(jsonb_array_length(players) BETWEEN 1 AND 100);
ALTER TABLE teams ADD CHECK(captain>=0 AND captain<jsonb_array_length(players));
CREATE TABLE tenant_payment_accounts (
  organization_id uuid PRIMARY KEY REFERENCES organizations,
  stripe_account_id text UNIQUE,
  connected boolean NOT NULL DEFAULT true,
  charges_enabled boolean NOT NULL DEFAULT false,
  payouts_enabled boolean NOT NULL DEFAULT false,
  details_submitted boolean NOT NULL DEFAULT false,
  generation uuid NOT NULL DEFAULT gen_random_uuid(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tournament_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations,
  tournament_id uuid NOT NULL,
  category_id uuid NOT NULL,
  team_id uuid NOT NULL UNIQUE,
  status text NOT NULL CHECK(status IN ('PENDING_PAYMENT','CONFIRMED','EXPIRED','PAYMENT_FAILED','CANCELLED')),
  payment_mode text NOT NULL CHECK(payment_mode IN ('free','stripe','external')),
  amount_cents integer NOT NULL CHECK(amount_cents>=0),
  currency text NOT NULL DEFAULT 'mxn' CHECK(currency='mxn'),
  expires_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,organization_id),
  FOREIGN KEY(category_id,tournament_id,organization_id) REFERENCES categories(id,tournament_id,organization_id),
  FOREIGN KEY(team_id,tournament_id,organization_id) REFERENCES teams(id,tournament_id,organization_id)
);
CREATE INDEX registration_category ON tournament_registrations(category_id,status);
CREATE TABLE registration_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL UNIQUE,
  organization_id uuid NOT NULL,
  stripe_account_id text NOT NULL,
  checkout_session_id text UNIQUE,
  checkout_url text,
  payment_intent_id text,
  status text NOT NULL DEFAULT 'creating' CHECK(status IN ('creating','pending','paid','expired','failed','partially_refunded','refunded')),
  amount_cents integer NOT NULL,
  refunded_cents integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(registration_id,organization_id) REFERENCES tournament_registrations(id,organization_id)
);
CREATE TABLE payment_webhook_events (
  event_id text PRIMARY KEY,
  stripe_account_id text,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE registration_notifications (
  registration_id uuid PRIMARY KEY REFERENCES tournament_registrations,
  sent_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now()
);
-- Guard all existing approval and category-change paths, including agent actions.
CREATE FUNCTION guard_paid_registration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r tournament_registrations;
BEGIN
  SELECT * INTO r FROM tournament_registrations WHERE team_id=NEW.id;
  IF FOUND THEN
    IF NEW.category_id<>OLD.category_id THEN
      RAISE EXCEPTION 'Una inscripción con pago debe permanecer en su categoría' USING ERRCODE='23514';
    END IF;
    IF NEW.status IN ('withdrawn','rejected') AND r.status='PENDING_PAYMENT' THEN
      RAISE EXCEPTION 'Resuelve o expira primero el pago pendiente' USING ERRCODE='23514';
    END IF;
    IF NEW.status='approved' AND r.status<>'CONFIRMED' THEN
      RAISE EXCEPTION 'La inscripción requiere pago confirmado' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER paid_registration_guard BEFORE UPDATE ON teams FOR EACH ROW EXECUTE FUNCTION guard_paid_registration();
