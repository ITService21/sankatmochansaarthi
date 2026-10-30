-- Classes 9 and 11 are "coming soon"; 10 and 12 are open.
UPDATE academic_classes SET coming_soon = 1 WHERE class_number IN (9, 11);
UPDATE academic_classes SET coming_soon = 0 WHERE class_number IN (10, 12);

-- Administrator-configurable material types ("Detailed Notes", "Revision Notes", "Mind Maps", ...).
CREATE TABLE material_types (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(40) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_material_types_active (deleted_at, is_active, sort_order)
) ENGINE=InnoDB;

INSERT INTO material_types (name, code, sort_order) VALUES ('Detailed Notes', 'detailed', 1), ('Revision Notes', 'revision', 2);

-- Replace the note_type enum with a foreign key to material_types (existing rows are carried over).
ALTER TABLE study_materials ADD COLUMN material_type_id BIGINT UNSIGNED NULL AFTER access_type;
UPDATE study_materials sm JOIN material_types mt ON mt.code = sm.note_type SET sm.material_type_id = mt.id;
ALTER TABLE study_materials DROP KEY idx_sm_note_type;
ALTER TABLE study_materials DROP COLUMN note_type;
ALTER TABLE study_materials MODIFY material_type_id BIGINT UNSIGNED NOT NULL;
ALTER TABLE study_materials ADD CONSTRAINT fk_sm_material_type FOREIGN KEY (material_type_id) REFERENCES material_types(id);

-- Social sign-in: which external identities (Google / Microsoft) belong to which user.
CREATE TABLE user_identities (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  provider VARCHAR(20) NOT NULL,
  provider_user_id VARCHAR(190) NOT NULL,
  email VARCHAR(190) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_identity (provider, provider_user_id),
  KEY idx_identity_user (user_id),
  CONSTRAINT fk_identity_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
