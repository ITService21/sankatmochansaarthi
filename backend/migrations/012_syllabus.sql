-- Syllabus management: which chapters and topics a syllabus covers, with weightage, per board + class + subject + academic year + version.

CREATE TABLE syllabi (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  board_id BIGINT UNSIGNED NOT NULL,
  class_id BIGINT UNSIGNED NOT NULL,
  subject_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL,
  academic_year VARCHAR(9) NOT NULL,
  version VARCHAR(20) NOT NULL DEFAULT '1',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_syllabus_ctx (board_id, class_id, subject_id, academic_year),
  CONSTRAINT fk_syl_board FOREIGN KEY (board_id) REFERENCES academic_boards(id),
  CONSTRAINT fk_syl_class FOREIGN KEY (class_id) REFERENCES academic_classes(id),
  CONSTRAINT fk_syl_subject FOREIGN KEY (subject_id) REFERENCES academic_subjects(id),
  CONSTRAINT fk_syl_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- is_active = 0 means the chapter is listed but EXCLUDED from this syllabus.
CREATE TABLE syllabus_chapters (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  syllabus_id BIGINT UNSIGNED NOT NULL,
  chapter_id BIGINT UNSIGNED NOT NULL,
  weightage DECIMAL(5,2) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  position SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uq_syl_chapter (syllabus_id, chapter_id),
  CONSTRAINT fk_sc_syllabus FOREIGN KEY (syllabus_id) REFERENCES syllabi(id) ON DELETE CASCADE,
  CONSTRAINT fk_sc_chapter FOREIGN KEY (chapter_id) REFERENCES academic_chapters(id)
) ENGINE=InnoDB;

CREATE TABLE syllabus_topics (
  syllabus_chapter_id BIGINT UNSIGNED NOT NULL,
  topic_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (syllabus_chapter_id, topic_id),
  CONSTRAINT fk_st_sc FOREIGN KEY (syllabus_chapter_id) REFERENCES syllabus_chapters(id) ON DELETE CASCADE,
  CONSTRAINT fk_st_topic FOREIGN KEY (topic_id) REFERENCES academic_topics(id)
) ENGINE=InnoDB;
