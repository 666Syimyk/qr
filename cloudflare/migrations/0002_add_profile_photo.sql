ALTER TABLE cards ADD COLUMN photo_data_url TEXT
  CHECK (photo_data_url IS NULL OR (
    length(photo_data_url) <= 350000
    AND substr(photo_data_url, 1, 23) = 'data:image/jpeg;base64,'
  ));
