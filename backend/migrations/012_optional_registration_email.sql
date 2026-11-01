ALTER TABLE teams DROP CONSTRAINT teams_tournament_id_email_key;
CREATE UNIQUE INDEX teams_tournament_email_present ON teams(tournament_id,email) WHERE email <> '';
