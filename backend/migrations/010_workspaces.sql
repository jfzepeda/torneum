DROP INDEX one_active_tournament;

CREATE TABLE tournament_collaborators (
  organization_id uuid NOT NULL,
  tournament_id uuid NOT NULL,
  user_id uuid NOT NULL,
  PRIMARY KEY(tournament_id,user_id),
  FOREIGN KEY(tournament_id,organization_id) REFERENCES tournaments(id,organization_id),
  FOREIGN KEY(user_id,organization_id) REFERENCES users(id,organization_id)
);
INSERT INTO tournament_collaborators(organization_id,tournament_id,user_id)
SELECT t.organization_id,t.id,u.id FROM tournaments t JOIN users u USING(organization_id)
WHERE u.role<>'admin';
CREATE INDEX collaborator_tournaments ON tournament_collaborators(user_id,tournament_id);

CREATE TABLE sponsor_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations,
  name text NOT NULL,
  website text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  logo_url text NOT NULL DEFAULT '',
  UNIQUE(id,organization_id)
);
ALTER TABLE sponsors ADD COLUMN contact_id uuid;
INSERT INTO sponsor_contacts(id,organization_id,name,website,email,phone,logo_url)
SELECT id,organization_id,name,website,email,phone,logo_url FROM sponsors;
UPDATE sponsors SET contact_id=id;
ALTER TABLE sponsors ADD FOREIGN KEY(contact_id,organization_id) REFERENCES sponsor_contacts(id,organization_id);
ALTER TABLE sponsors ADD UNIQUE(tournament_id,contact_id);
-- Keep existing assignment IDs and integrations compatible with the shared identity.
CREATE FUNCTION sponsor_contact_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.contact_id IS NULL THEN
    INSERT INTO sponsor_contacts(organization_id,name,website,email,phone,logo_url)
    VALUES(NEW.organization_id,NEW.name,NEW.website,NEW.email,NEW.phone,NEW.logo_url)
    RETURNING id INTO NEW.contact_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sponsor_identity BEFORE INSERT ON sponsors FOR EACH ROW EXECUTE FUNCTION sponsor_contact_identity();
ALTER TABLE sponsors ALTER COLUMN contact_id SET NOT NULL;

ALTER TABLE categories ADD COLUMN copied_from_id uuid REFERENCES categories;
CREATE UNIQUE INDEX category_copy ON categories(tournament_id,copied_from_id);
ALTER TABLE sponsor_levels ADD COLUMN copied_from_id uuid REFERENCES sponsor_levels;
CREATE UNIQUE INDEX level_copy ON sponsor_levels(tournament_id,copied_from_id);
ALTER TABLE sponsor_levels ADD UNIQUE(id,tournament_id,organization_id);
ALTER TABLE sponsors ADD FOREIGN KEY(level_id,tournament_id,organization_id) REFERENCES sponsor_levels(id,tournament_id,organization_id);
