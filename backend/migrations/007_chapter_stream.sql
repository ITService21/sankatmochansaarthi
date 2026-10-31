-- A chapter belongs to a stream (Science / Commerce) or is "general" (valid for every stream, e.g. Class 9-10 chapters).
-- Existing chapters become "general", so nothing that already works is rejected.
ALTER TABLE academic_chapters ADD COLUMN stream ENUM('science','commerce','general') NOT NULL DEFAULT 'general' AFTER subject_id;
