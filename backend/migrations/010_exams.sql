-- Examinations: student profiles and batches, exams, assignments, attempts, answers, offline answer sheets, AI evaluations, notifications.

CREATE TABLE student_profiles (
  user_id BIGINT UNSIGNED PRIMARY KEY,
  board_id BIGINT UNSIGNED NULL,
  class_id BIGINT UNSIGNED NULL,
  stream ENUM('science','commerce','general') NULL,
  subject_ids JSON NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_sp_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE batches (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  organisation_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_batch_org (organisation_id),
  CONSTRAINT fk_batch_org FOREIGN KEY (organisation_id) REFERENCES organisations(id)
) ENGINE=InnoDB;

CREATE TABLE batch_members (
  batch_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (batch_id, user_id),
  CONSTRAINT fk_bm_batch FOREIGN KEY (batch_id) REFERENCES batches(id),
  CONSTRAINT fk_bm_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE exams (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  organisation_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  paper_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(200) NOT NULL,
  mode ENUM('online','offline') NOT NULL DEFAULT 'online',
  starts_at DATETIME(3) NOT NULL,
  ends_at DATETIME(3) NOT NULL,
  duration_minutes SMALLINT UNSIGNED NOT NULL,
  max_attempts TINYINT UNSIGNED NOT NULL DEFAULT 1,
  -- fraction of a question's marks deducted for a wrong MCQ answer (0.25 = quarter mark); 0 = no negative marking
  negative_marking DECIMAL(4,2) NOT NULL DEFAULT 0,
  allow_review TINYINT(1) NOT NULL DEFAULT 1,
  -- 1 = a teacher must approve marks before students see them; 0 = results publish automatically once marked
  requires_teacher_review TINYINT(1) NOT NULL DEFAULT 1,
  price_minor_units BIGINT UNSIGNED NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  status ENUM('scheduled','cancelled') NOT NULL DEFAULT 'scheduled',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_exam_org (organisation_id, starts_at),
  KEY idx_exam_creator (created_by),
  CONSTRAINT fk_exam_org FOREIGN KEY (organisation_id) REFERENCES organisations(id),
  CONSTRAINT fk_exam_creator FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_exam_paper FOREIGN KEY (paper_id) REFERENCES question_papers(id)
) ENGINE=InnoDB;

-- Assignments are resolved to individual students when made (class/batch/organisation are expanded then).
CREATE TABLE exam_assignments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  exam_id BIGINT UNSIGNED NOT NULL,
  student_user_id BIGINT UNSIGNED NOT NULL,
  source ENUM('student','class','batch','organisation') NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY uq_assign (exam_id, student_user_id),
  KEY idx_assign_student (student_user_id),
  CONSTRAINT fk_assign_exam FOREIGN KEY (exam_id) REFERENCES exams(id),
  CONSTRAINT fk_assign_student FOREIGN KEY (student_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- One status ladder for online and offline exams.
CREATE TABLE exam_attempts (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  exam_id BIGINT UNSIGNED NOT NULL,
  student_user_id BIGINT UNSIGNED NOT NULL,
  attempt_no TINYINT UNSIGNED NOT NULL,
  set_label CHAR(1) NOT NULL DEFAULT 'A',
  status ENUM('in_progress','submitted','sheet_uploaded','evaluation_pending','ai_evaluating','evaluated','teacher_review','published') NOT NULL DEFAULT 'in_progress',
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  -- the SERVER decides when time is up: min(start + duration, exam end). The browser clock is never trusted.
  deadline_at DATETIME(3) NOT NULL,
  submitted_at DATETIME(3) NULL,
  auto_submitted TINYINT(1) NOT NULL DEFAULT 0,
  score DECIMAL(8,2) NULL,
  total_marks DECIMAL(8,2) NULL,
  percentage DECIMAL(5,2) NULL,
  published_at DATETIME(3) NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY uq_attempt (exam_id, student_user_id, attempt_no),
  KEY idx_attempt_status (status, deadline_at),
  CONSTRAINT fk_attempt_exam FOREIGN KEY (exam_id) REFERENCES exams(id),
  CONSTRAINT fk_attempt_student FOREIGN KEY (student_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE attempt_answers (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  attempt_id BIGINT UNSIGNED NOT NULL,
  question_id BIGINT UNSIGNED NOT NULL,
  question_version INT UNSIGNED NOT NULL,
  max_marks DECIMAL(6,2) NOT NULL,
  selected_option_ids JSON NULL,
  answer_text MEDIUMTEXT NULL,
  marks_awarded DECIMAL(6,2) NULL,
  is_correct TINYINT(1) NULL,
  feedback TEXT NULL,
  marked_by ENUM('auto','ai','teacher') NULL,
  ai_marks DECIMAL(6,2) NULL,
  ai_feedback TEXT NULL,
  confidence DECIMAL(4,3) NULL,
  needs_review TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_answer (attempt_id, question_id),
  CONSTRAINT fk_answer_attempt FOREIGN KEY (attempt_id) REFERENCES exam_attempts(id),
  CONSTRAINT fk_answer_question FOREIGN KEY (question_id) REFERENCES questions(id)
) ENGINE=InnoDB;

-- Pages of a handwritten answer sheet (offline exams). The original file is kept untouched.
CREATE TABLE answer_sheet_uploads (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  attempt_id BIGINT UNSIGNED NOT NULL,
  page_no SMALLINT UNSIGNED NOT NULL,
  storage_key VARCHAR(255) NOT NULL,
  mime_type VARCHAR(60) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_sheet_attempt (attempt_id),
  CONSTRAINT fk_sheet_attempt FOREIGN KEY (attempt_id) REFERENCES exam_attempts(id)
) ENGINE=InnoDB;

-- One row per AI evaluation run (cost and failure tracking).
CREATE TABLE evaluations (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  attempt_id BIGINT UNSIGNED NOT NULL,
  provider VARCHAR(40) NOT NULL,
  status ENUM('running','succeeded','failed') NOT NULL DEFAULT 'running',
  pages SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  error VARCHAR(500) NULL,
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at DATETIME(3) NULL,
  KEY idx_eval_attempt (attempt_id),
  CONSTRAINT fk_eval_attempt FOREIGN KEY (attempt_id) REFERENCES exam_attempts(id)
) ENGINE=InnoDB;

CREATE TABLE notifications (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  type VARCHAR(40) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body VARCHAR(500) NULL,
  link VARCHAR(255) NULL,
  read_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_notif_user (user_id, read_at, created_at),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
