-- Landing page / learner area features: coming-soon classes, callback requests, in-app downloads library, activity streak.

ALTER TABLE academic_classes ADD COLUMN coming_soon TINYINT(1) NOT NULL DEFAULT 0 AFTER class_number;

-- Classes 9 and 10 are announced as "coming soon" at launch (administrators can change this in Academic setup).
UPDATE academic_classes SET coming_soon = 1 WHERE class_number IN (9, 10);

CREATE TABLE callback_requests (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  class_label VARCHAR(40) NULL,
  city VARCHAR(80) NULL,
  message VARCHAR(500) NULL,
  status ENUM('new','contacted','closed') NOT NULL DEFAULT 'new',
  source_ip VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_callbacks_status (status, created_at)
) ENGINE=InnoDB;

-- A "download" saves a note into the user's in-app library (My Downloads). The file never leaves the app.
-- Soft-deleted when the user removes it; unique per (user, material) so re-adding is idempotent.
CREATE TABLE user_downloads (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  material_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY uq_downloads_user_material (user_id, material_id),
  KEY idx_downloads_material (material_id),
  CONSTRAINT fk_downloads_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_downloads_material FOREIGN KEY (material_id) REFERENCES study_materials(id)
) ENGINE=InnoDB;

-- One row per user per active day (IST); drives the learning-streak chip.
CREATE TABLE user_activity_days (
  user_id BIGINT UNSIGNED NOT NULL,
  activity_date DATE NOT NULL,
  PRIMARY KEY (user_id, activity_date),
  CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
