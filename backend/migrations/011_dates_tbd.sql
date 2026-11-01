ALTER TABLE tournaments ALTER COLUMN starts_on DROP NOT NULL, ALTER COLUMN ends_on DROP NOT NULL, ADD COLUMN dates_label text NOT NULL DEFAULT '';
ALTER TABLE tournaments ADD CONSTRAINT tournaments_dates_pair CHECK((starts_on IS NULL) = (ends_on IS NULL));
