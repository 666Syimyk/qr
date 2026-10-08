CREATE TABLE IF NOT EXISTS cards (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) = 36),
  public_token TEXT NOT NULL UNIQUE CHECK (length(public_token) = 43 AND public_token NOT GLOB '*[^A-Za-z0-9_-]*'),
  owner_token_hash TEXT NOT NULL UNIQUE CHECK (length(owner_token_hash) = 64 AND owner_token_hash NOT GLOB '*[^0-9a-f]*'),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 80),
  contact_name TEXT NOT NULL CHECK (length(trim(contact_name)) BETWEEN 1 AND 80),
  contact_relationship TEXT NOT NULL CHECK (length(contact_relationship) BETWEEN 0 AND 40),
  contact_phone TEXT NOT NULL CHECK (
    length(contact_phone) BETWEEN 9 AND 16 AND substr(contact_phone, 1, 1) = '+'
    AND substr(contact_phone, 2, 1) GLOB '[1-9]' AND substr(contact_phone, 2) NOT GLOB '*[^0-9]*'
  ),
  important_info TEXT CHECK (important_info IS NULL OR length(important_info) BETWEEN 1 AND 500),
  publish_important_info INTEGER NOT NULL DEFAULT 0 CHECK (publish_important_info IN (0, 1)),
  consent_to_publish INTEGER NOT NULL CHECK (consent_to_publish = 1),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  consent_at TEXT NOT NULL CHECK (length(consent_at) > 0),
  created_at TEXT NOT NULL CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL CHECK (length(updated_at) > 0)
);
