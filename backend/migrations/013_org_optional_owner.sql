-- An organisation can exist before it has an owner login (staff create it by name only and add the owner later).
-- Identity is the numeric id; names are labels that only the Super Admin may edit. The id is referenced by foreign keys and never updated.
ALTER TABLE organisations MODIFY owner_user_id BIGINT UNSIGNED NULL;
