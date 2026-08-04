-- Repair tag normalization and uniqueness for databases created before the
-- configurable resources schema settled on (group_id, normalized_name).

UPDATE tags
SET normalized_name = LOWER(BTRIM(name))
WHERE normalized_name IS NULL OR BTRIM(normalized_name) = '';

-- Preserve every resource association before removing duplicate tag rows.
WITH ranked AS (
    SELECT
        id,
        FIRST_VALUE(id) OVER (
            PARTITION BY group_id, LOWER(BTRIM(normalized_name))
            ORDER BY created_at, id
        ) AS canonical_id
    FROM tags
), duplicates AS (
    SELECT id, canonical_id
    FROM ranked
    WHERE id <> canonical_id
)
INSERT INTO resource_tags(resource_id, tag_id)
SELECT rt.resource_id, d.canonical_id
FROM resource_tags rt
JOIN duplicates d ON d.id = rt.tag_id
ON CONFLICT DO NOTHING;

WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY group_id, LOWER(BTRIM(normalized_name))
            ORDER BY created_at, id
        ) AS position
    FROM tags
)
DELETE FROM resource_tags rt
USING ranked r
WHERE rt.tag_id = r.id AND r.position > 1;

WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY group_id, LOWER(BTRIM(normalized_name))
            ORDER BY created_at, id
        ) AS position
    FROM tags
)
DELETE FROM tags t
USING ranked r
WHERE t.id = r.id AND r.position > 1;

UPDATE tags
SET normalized_name = LOWER(BTRIM(normalized_name));

CREATE UNIQUE INDEX IF NOT EXISTS tags_group_normalized_name_uidx
    ON tags(group_id, normalized_name);
