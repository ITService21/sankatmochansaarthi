-- Notes are either "detailed" notes or "revision" notes (the learner workspace has a section for each).
ALTER TABLE study_materials ADD COLUMN note_type ENUM('detailed','revision') NOT NULL DEFAULT 'detailed' AFTER access_type;
ALTER TABLE study_materials ADD KEY idx_sm_note_type (note_type);

-- global_config now also stores a JSON document (site contact details), so values may exceed 255 chars.
ALTER TABLE global_config MODIFY config_value TEXT NOT NULL;
