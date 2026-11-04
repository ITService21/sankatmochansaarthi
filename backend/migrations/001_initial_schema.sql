-- Initial schema. One relational database; soft deletes via deleted_at (api_hit_logs excepted: retention job).

CREATE TABLE roles (
  id TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(32) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE users (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL UNIQUE,
  email VARCHAR(190) NULL,
  password_hash VARCHAR(100) NOT NULL,
  role_id TINYINT UNSIGNED NOT NULL,
  full_name VARCHAR(120) NULL,
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB;

-- ---------- Configurable academic taxonomy ----------
CREATE TABLE academic_boards (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(40) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_boards_active (deleted_at, is_active, sort_order)
) ENGINE=InnoDB;

CREATE TABLE academic_classes (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  class_number INT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_classes_active (deleted_at, is_active, sort_order)
) ENGINE=InnoDB;

CREATE TABLE academic_subjects (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(40) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_subjects_active (deleted_at, is_active, sort_order)
) ENGINE=InnoDB;

CREATE TABLE languages (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(20) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_languages_active (deleted_at, is_active, sort_order)
) ENGINE=InnoDB;

CREATE TABLE academic_chapters (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  board_id BIGINT UNSIGNED NOT NULL,
  class_id BIGINT UNSIGNED NOT NULL,
  subject_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_chapters_ctx (board_id, class_id, subject_id, deleted_at),
  CONSTRAINT fk_chapters_board FOREIGN KEY (board_id) REFERENCES academic_boards(id),
  CONSTRAINT fk_chapters_class FOREIGN KEY (class_id) REFERENCES academic_classes(id),
  CONSTRAINT fk_chapters_subject FOREIGN KEY (subject_id) REFERENCES academic_subjects(id)
) ENGINE=InnoDB;

CREATE TABLE academic_topics (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  chapter_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_topics_chapter (chapter_id, deleted_at),
  CONSTRAINT fk_topics_chapter FOREIGN KEY (chapter_id) REFERENCES academic_chapters(id)
) ENGINE=InnoDB;

-- ---------- Study materials ----------
CREATE TABLE study_materials (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  slug VARCHAR(220) NULL,
  board_id BIGINT UNSIGNED NOT NULL,
  class_id BIGINT UNSIGNED NOT NULL,
  subject_id BIGINT UNSIGNED NOT NULL,
  chapter_id BIGINT UNSIGNED NOT NULL,
  topic_id BIGINT UNSIGNED NULL,
  language_id BIGINT UNSIGNED NOT NULL,
  original_s3_key VARCHAR(255) NOT NULL,
  preview_s3_key VARCHAR(255) NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
  file_size_bytes BIGINT UNSIGNED NOT NULL,
  original_file_sha256 CHAR(64) NULL,
  page_count INT UNSIGNED NULL,
  preview_page_limit INT UNSIGNED NOT NULL DEFAULT 3,
  preview_status ENUM('pending','ready','failed') NOT NULL DEFAULT 'pending',
  preview_generated_at DATETIME(3) NULL,
  access_type ENUM('free','paid') NOT NULL DEFAULT 'free',
  price_minor_units BIGINT UNSIGNED NULL,
  currency CHAR(3) NULL,
  status ENUM('draft','published','unpublished','archived') NOT NULL DEFAULT 'draft',
  created_by BIGINT UNSIGNED NOT NULL,
  updated_by BIGINT UNSIGNED NULL,
  published_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_sm_status (status, deleted_at, updated_at),
  KEY idx_sm_filter (board_id, class_id, subject_id, status),
  KEY idx_sm_chapter (chapter_id),
  KEY idx_sm_topic (topic_id),
  KEY idx_sm_language (language_id),
  CONSTRAINT fk_sm_board FOREIGN KEY (board_id) REFERENCES academic_boards(id),
  CONSTRAINT fk_sm_class FOREIGN KEY (class_id) REFERENCES academic_classes(id),
  CONSTRAINT fk_sm_subject FOREIGN KEY (subject_id) REFERENCES academic_subjects(id),
  CONSTRAINT fk_sm_chapter FOREIGN KEY (chapter_id) REFERENCES academic_chapters(id),
  CONSTRAINT fk_sm_topic FOREIGN KEY (topic_id) REFERENCES academic_topics(id),
  CONSTRAINT fk_sm_language FOREIGN KEY (language_id) REFERENCES languages(id),
  CONSTRAINT fk_sm_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- Keys of S3 objects that became unreferenced (replaced file / failed DB write); swept after commit.
CREATE TABLE storage_cleanup_queue (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  object_key VARCHAR(255) NOT NULL,
  reason VARCHAR(80) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

-- ---------- Subscriptions, payments, entitlements ----------
CREATE TABLE subscription_plans (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(255) NULL,
  price_minor_units BIGINT UNSIGNED NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  duration_days INT UNSIGNED NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL
) ENGINE=InnoDB;

CREATE TABLE payments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  kind ENUM('material','subscription') NOT NULL,
  material_id BIGINT UNSIGNED NULL,
  plan_id BIGINT UNSIGNED NULL,
  amount_minor_units BIGINT UNSIGNED NOT NULL,
  currency CHAR(3) NOT NULL,
  status ENUM('pending','succeeded','failed') NOT NULL DEFAULT 'pending',
  provider VARCHAR(30) NOT NULL,
  provider_order_id VARCHAR(100) NULL,
  provider_payment_id VARCHAR(100) NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  failure_reason VARCHAR(255) NULL,
  paid_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY uq_payments_idem (user_id, idempotency_key),
  UNIQUE KEY uq_payments_order (provider, provider_order_id),
  UNIQUE KEY uq_payments_provider_payment (provider, provider_payment_id),
  KEY idx_payments_status (status, created_at),
  CONSTRAINT fk_payments_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_payments_material FOREIGN KEY (material_id) REFERENCES study_materials(id),
  CONSTRAINT fk_payments_plan FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
) ENGINE=InnoDB;

-- Provider webhook events already processed: unique (provider, event_id) makes replays no-ops.
CREATE TABLE payment_webhook_events (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  provider VARCHAR(30) NOT NULL,
  event_id VARCHAR(120) NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  processed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_webhook_event (provider, event_id)
) ENGINE=InnoDB;

-- One entitlement per payment (unique payment_id) => a payment can never grant access twice.
CREATE TABLE material_entitlements (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  material_id BIGINT UNSIGNED NOT NULL,
  source ENUM('purchase','admin_grant') NOT NULL,
  payment_id BIGINT UNSIGNED NULL UNIQUE,
  granted_by BIGINT UNSIGNED NULL,
  starts_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_ent_user_material (user_id, material_id),
  CONSTRAINT fk_ent_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_ent_material FOREIGN KEY (material_id) REFERENCES study_materials(id),
  CONSTRAINT fk_ent_payment FOREIGN KEY (payment_id) REFERENCES payments(id)
) ENGINE=InnoDB;

CREATE TABLE user_subscriptions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  plan_id BIGINT UNSIGNED NOT NULL,
  payment_id BIGINT UNSIGNED NULL UNIQUE,
  status ENUM('active','cancelled') NOT NULL DEFAULT 'active',
  starts_at DATETIME(3) NOT NULL,
  ends_at DATETIME(3) NOT NULL,
  cancelled_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_sub_user (user_id, status, ends_at),
  CONSTRAINT fk_sub_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_sub_plan FOREIGN KEY (plan_id) REFERENCES subscription_plans(id),
  CONSTRAINT fk_sub_payment FOREIGN KEY (payment_id) REFERENCES payments(id)
) ENGINE=InnoDB;

-- ---------- Config, audit, logs ----------
CREATE TABLE global_config (
  config_key VARCHAR(80) PRIMARY KEY,
  config_value VARCHAR(255) NOT NULL,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE audit_events (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  actor_id BIGINT UNSIGNED NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id VARCHAR(60) NULL,
  details_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_audit_entity (entity_type, entity_id)
) ENGINE=InnoDB;

-- API hit logs. Deliberately NO deleted_at: physically purged by the retention job (documented exception).
CREATE TABLE api_hit_logs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  request_id VARCHAR(64) NOT NULL,
  request_type VARCHAR(10) NOT NULL,
  api_path VARCHAR(2000) NOT NULL,
  route_template VARCHAR(255) NULL,
  status_code SMALLINT UNSIGNED NOT NULL,
  result_type ENUM('success','failure') NOT NULL,
  payload_json MEDIUMTEXT NULL,
  response_json MEDIUMTEXT NULL,
  latency_ms INT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  username VARCHAR(64) NULL,
  user_role VARCHAR(32) NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  error_code VARCHAR(60) NULL,
  error_message VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_logs_created (created_at),
  KEY idx_logs_status (status_code, created_at),
  KEY idx_logs_user (user_id, created_at),
  KEY idx_logs_request (request_id)
) ENGINE=InnoDB;
