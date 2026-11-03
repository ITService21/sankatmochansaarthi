-- Organisations (schools / coaching institutes) with their teachers and students, plus the central question bank.
-- Soft deletes via deleted_at everywhere. A NULL organisation_id on a question means "platform-wide".

CREATE TABLE organisations (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(160) NOT NULL,
  owner_user_id BIGINT UNSIGNED NOT NULL,
  org_type ENUM('school','coaching','institution') NOT NULL DEFAULT 'school',
  email VARCHAR(190) NULL,
  phone VARCHAR(30) NULL,
  address VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY uq_org_owner (owner_user_id),
  CONSTRAINT fk_org_owner FOREIGN KEY (owner_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- A user belongs to at most one organisation as a teacher or student (the owner is not listed here).
CREATE TABLE organisation_members (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  organisation_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  member_type ENUM('teacher','student') NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY uq_member_user (user_id),
  KEY idx_member_org (organisation_id, member_type),
  CONSTRAINT fk_member_org FOREIGN KEY (organisation_id) REFERENCES organisations(id),
  CONSTRAINT fk_member_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- Which class + subject a teacher handles inside the organisation.
CREATE TABLE teacher_assignments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  organisation_id BIGINT UNSIGNED NOT NULL,
  teacher_user_id BIGINT UNSIGNED NOT NULL,
  class_id BIGINT UNSIGNED NOT NULL,
  subject_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_ta_teacher (teacher_user_id),
  CONSTRAINT fk_ta_org FOREIGN KEY (organisation_id) REFERENCES organisations(id),
  CONSTRAINT fk_ta_teacher FOREIGN KEY (teacher_user_id) REFERENCES users(id),
  CONSTRAINT fk_ta_class FOREIGN KEY (class_id) REFERENCES academic_classes(id),
  CONSTRAINT fk_ta_subject FOREIGN KEY (subject_id) REFERENCES academic_subjects(id)
) ENGINE=InnoDB;

-- ---------- Question bank ----------
CREATE TABLE questions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  organisation_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  board_id BIGINT UNSIGNED NOT NULL,
  class_id BIGINT UNSIGNED NOT NULL,
  subject_id BIGINT UNSIGNED NOT NULL,
  chapter_id BIGINT UNSIGNED NOT NULL,
  topic_id BIGINT UNSIGNED NULL,
  question_type ENUM('mcq','short','medium','long') NOT NULL,
  difficulty ENUM('easy','medium','hard') NOT NULL DEFAULT 'medium',
  marks DECIMAL(6,2) NOT NULL,
  body TEXT NOT NULL,
  image_key VARCHAR(255) NULL,
  multiple_correct TINYINT(1) NOT NULL DEFAULT 0,
  explanation TEXT NULL,
  expected_answer TEXT NULL,
  reference_answer TEXT NULL,
  keywords VARCHAR(500) NULL,
  rubric TEXT NULL,
  -- sha256 of (scope, chapter, type, normalised body) while the question is live; NULL once deleted, so UNIQUE blocks duplicates only among live ones.
  dedupe_key CHAR(64) NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY uq_question_dedupe (dedupe_key),
  KEY idx_q_filter (board_id, class_id, subject_id, chapter_id, question_type, difficulty),
  KEY idx_q_org (organisation_id),
  CONSTRAINT fk_q_org FOREIGN KEY (organisation_id) REFERENCES organisations(id),
  CONSTRAINT fk_q_creator FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_q_board FOREIGN KEY (board_id) REFERENCES academic_boards(id),
  CONSTRAINT fk_q_class FOREIGN KEY (class_id) REFERENCES academic_classes(id),
  CONSTRAINT fk_q_subject FOREIGN KEY (subject_id) REFERENCES academic_subjects(id),
  CONSTRAINT fk_q_chapter FOREIGN KEY (chapter_id) REFERENCES academic_chapters(id),
  CONSTRAINT fk_q_topic FOREIGN KEY (topic_id) REFERENCES academic_topics(id)
) ENGINE=InnoDB;

CREATE TABLE question_options (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  question_id BIGINT UNSIGNED NOT NULL,
  position TINYINT UNSIGNED NOT NULL,
  body VARCHAR(1000) NOT NULL,
  is_correct TINYINT(1) NOT NULL DEFAULT 0,
  KEY idx_opt_q (question_id),
  CONSTRAINT fk_opt_q FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Every edit stores the previous state, so older versions stay readable (and papers can keep what they used).
CREATE TABLE question_versions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  question_id BIGINT UNSIGNED NOT NULL,
  version INT UNSIGNED NOT NULL,
  snapshot JSON NOT NULL,
  changed_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_qv (question_id, version),
  CONSTRAINT fk_qv_q FOREIGN KEY (question_id) REFERENCES questions(id)
) ENGINE=InnoDB;
