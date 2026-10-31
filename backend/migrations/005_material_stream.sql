-- Stream (Science / Commerce / General) for every study material; existing rows become "general".
ALTER TABLE study_materials ADD COLUMN stream ENUM('science','commerce','general') NOT NULL DEFAULT 'general' AFTER subject_id;
ALTER TABLE study_materials ADD KEY idx_sm_stream (stream);
