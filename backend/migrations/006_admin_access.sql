-- Super Admin / Admin access control: per-feature permission grants and board/class/subject scopes.
-- Rows are soft-deleted (deleted_at) when revoked, so the history of who had what stays in the table.
CREATE TABLE admin_permissions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  permission VARCHAR(60) NOT NULL,
  granted_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_admin_perm_user (user_id, deleted_at),
  CONSTRAINT fk_admin_perm_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE admin_scopes (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  scope_type ENUM('board','class','subject') NOT NULL,
  ref_id BIGINT UNSIGNED NOT NULL,
  granted_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_admin_scope_user (user_id, deleted_at),
  CONSTRAINT fk_admin_scope_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- Notes that were converted to PDF and are waiting for the uploader's review (accept / discard).
CREATE TABLE upload_drafts (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  source_format VARCHAR(10) NOT NULL,
  conversion_method VARCHAR(30) NOT NULL,
  conversion_note VARCHAR(255) NULL,
  staged_key VARCHAR(255) NOT NULL,
  file_size_bytes BIGINT UNSIGNED NOT NULL,
  page_count INT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  metadata JSON NOT NULL,
  status ENUM('pending','accepted','discarded') NOT NULL DEFAULT 'pending',
  material_id BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_drafts_user (user_id, status, deleted_at),
  CONSTRAINT fk_draft_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
