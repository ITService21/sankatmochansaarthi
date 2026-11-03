-- Question papers built from the question bank. A paper has one or more SETS (A, B, C ...), each an ordered list of questions.

CREATE TABLE question_papers (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  organisation_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  institute_name VARCHAR(200) NULL,
  exam_name VARCHAR(200) NOT NULL,
  board_id BIGINT UNSIGNED NOT NULL,
  class_id BIGINT UNSIGNED NOT NULL,
  subject_id BIGINT UNSIGNED NOT NULL,
  exam_date DATE NULL,
  duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 60,
  instructions TEXT NULL,
  total_marks DECIMAL(8,2) NOT NULL DEFAULT 0,
  status ENUM('draft','published') NOT NULL DEFAULT 'draft',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_paper_org (organisation_id, status),
  KEY idx_paper_creator (created_by),
  CONSTRAINT fk_paper_org FOREIGN KEY (organisation_id) REFERENCES organisations(id),
  CONSTRAINT fk_paper_creator FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_paper_board FOREIGN KEY (board_id) REFERENCES academic_boards(id),
  CONSTRAINT fk_paper_class FOREIGN KEY (class_id) REFERENCES academic_classes(id),
  CONSTRAINT fk_paper_subject FOREIGN KEY (subject_id) REFERENCES academic_subjects(id)
) ENGINE=InnoDB;

-- question_version pins the exact wording used, so later edits in the bank never change a paper that was already set.
CREATE TABLE paper_questions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  paper_id BIGINT UNSIGNED NOT NULL,
  set_label CHAR(1) NOT NULL DEFAULT 'A',
  position SMALLINT UNSIGNED NOT NULL,
  question_id BIGINT UNSIGNED NOT NULL,
  question_version INT UNSIGNED NOT NULL,
  marks DECIMAL(6,2) NOT NULL,
  UNIQUE KEY uq_pq (paper_id, set_label, question_id),
  KEY idx_pq_order (paper_id, set_label, position),
  CONSTRAINT fk_pq_paper FOREIGN KEY (paper_id) REFERENCES question_papers(id),
  CONSTRAINT fk_pq_question FOREIGN KEY (question_id) REFERENCES questions(id)
) ENGINE=InnoDB;

-- Copies of generated PDFs (question paper or answer key) kept in object storage.
CREATE TABLE paper_files (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  paper_id BIGINT UNSIGNED NOT NULL,
  set_label CHAR(1) NOT NULL,
  kind ENUM('paper','key') NOT NULL,
  storage_key VARCHAR(255) NOT NULL,
  generated_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_pf_paper (paper_id, set_label, kind),
  CONSTRAINT fk_pf_paper FOREIGN KEY (paper_id) REFERENCES question_papers(id)
) ENGINE=InnoDB;
