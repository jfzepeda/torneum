ALTER TABLE tournaments ADD COLUMN registration_schema jsonb NOT NULL DEFAULT '{"fields":[],"email_mode":"team","phone_mode":"team"}';
ALTER TABLE teams ADD COLUMN extra_answers jsonb NOT NULL DEFAULT '{}', ADD COLUMN registration_source text NOT NULL DEFAULT 'legacy';
CREATE TABLE google_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations,
 encrypted_tokens text NOT NULL, status text NOT NULL DEFAULT 'connected', updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id), UNIQUE(id,organization_id)
);
CREATE TABLE google_oauth_states (
 state_hash text PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations, user_id uuid NOT NULL,
 expires_at timestamptz NOT NULL, FOREIGN KEY(user_id,organization_id) REFERENCES users(id,organization_id)
);
CREATE TABLE registration_integrations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, tournament_id uuid NOT NULL,
 provider text NOT NULL CHECK(provider IN ('google_sheets_public','google_forms_oauth')),
 source_key text NOT NULL, name text NOT NULL, config jsonb NOT NULL DEFAULT '{}', mapping jsonb NOT NULL DEFAULT '{}',
 mapping_version integer NOT NULL DEFAULT 1, status text NOT NULL DEFAULT 'connected', enabled boolean NOT NULL DEFAULT true,
 last_sync_at timestamptz, last_sync_error text, last_result jsonb, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,tournament_id,provider,source_key), UNIQUE(id,tournament_id,organization_id),
 FOREIGN KEY(tournament_id,organization_id) REFERENCES tournaments(id,organization_id)
);
CREATE TABLE registration_inbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, tournament_id uuid NOT NULL,
 integration_id uuid, source text NOT NULL, external_id text NOT NULL, payload jsonb NOT NULL,
 normalized jsonb NOT NULL, content_hash text NOT NULL, mapping_version integer NOT NULL DEFAULT 1,
 version integer NOT NULL DEFAULT 1, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','linked','discarded')),
 team_id uuid, reviewed_by uuid, reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,tournament_id,organization_id),
 FOREIGN KEY(tournament_id,organization_id) REFERENCES tournaments(id,organization_id),
 FOREIGN KEY(integration_id,tournament_id,organization_id) REFERENCES registration_integrations(id,tournament_id,organization_id),
 FOREIGN KEY(team_id,tournament_id,organization_id) REFERENCES teams(id,tournament_id,organization_id),
 FOREIGN KEY(reviewed_by,organization_id) REFERENCES users(id,organization_id)
);
CREATE UNIQUE INDEX registration_inbox_external ON registration_inbox(integration_id,external_id) WHERE integration_id IS NOT NULL;
CREATE UNIQUE INDEX registration_inbox_native ON registration_inbox(organization_id,tournament_id,source,external_id) WHERE integration_id IS NULL;
CREATE INDEX registration_inbox_pending ON registration_inbox(organization_id,tournament_id,status);
CREATE TABLE registration_verification_outbox (
 team_id uuid PRIMARY KEY REFERENCES teams, token text NOT NULL, sent_at timestamptz,
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE google_form_jobs (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, tournament_id uuid NOT NULL, category_id uuid NOT NULL,
 form_id text, status text NOT NULL DEFAULT 'creating', config jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(category_id,tournament_id,organization_id) REFERENCES categories(id,tournament_id,organization_id)
);
