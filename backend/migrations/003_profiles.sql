ALTER TABLE tournaments ADD COLUMN sport text NOT NULL DEFAULT 'padel';
ALTER TABLE teams ADD COLUMN image_id uuid;
ALTER TABLE teams ADD COLUMN notifications boolean NOT NULL DEFAULT true;
CREATE TABLE images(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations,team_id uuid REFERENCES teams,content bytea NOT NULL,mime_type text NOT NULL DEFAULT 'image/webp',created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE teams ADD FOREIGN KEY(image_id) REFERENCES images(id);
