ALTER TABLE tournaments ADD COLUMN city text NOT NULL DEFAULT '';
UPDATE tournaments SET city=trim(substr(venue, strpos(venue, ' · ') + 3)), venue=trim(split_part(venue, ' · ', 1)) WHERE strpos(venue, ' · ') > 0;
ALTER TABLE organizations ADD COLUMN brand_color text CHECK(brand_color ~ '^#[0-9a-f]{6}$'), ADD COLUMN brand_bg text CHECK(brand_bg ~ '^#[0-9a-f]{6}$'), ADD COLUMN brand_card text CHECK(brand_card ~ '^#[0-9a-f]{6}$'), ADD COLUMN brand_platform boolean NOT NULL DEFAULT false;
