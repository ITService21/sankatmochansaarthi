-- Paid tests: exams can be listed in a public catalogue, priced, bought one-off (payments.kind = 'exam') or covered by a subscription.

ALTER TABLE exams ADD COLUMN is_public TINYINT(1) NOT NULL DEFAULT 0 AFTER price_minor_units;
ALTER TABLE exams ADD COLUMN description VARCHAR(500) NULL AFTER name;

ALTER TABLE payments MODIFY COLUMN kind ENUM('material','subscription','exam') NOT NULL;
ALTER TABLE payments ADD COLUMN exam_id BIGINT UNSIGNED NULL AFTER material_id;
ALTER TABLE payments ADD CONSTRAINT fk_payments_exam FOREIGN KEY (exam_id) REFERENCES exams(id);

-- One entitlement per payment (unique payment_id) => a payment can never grant access twice, even if the webhook repeats.
CREATE TABLE exam_entitlements (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  exam_id BIGINT UNSIGNED NOT NULL,
  source ENUM('purchase','admin_grant') NOT NULL DEFAULT 'purchase',
  payment_id BIGINT UNSIGNED NULL UNIQUE,
  granted_by BIGINT UNSIGNED NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_xent_user_exam (user_id, exam_id),
  CONSTRAINT fk_xent_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_xent_exam FOREIGN KEY (exam_id) REFERENCES exams(id),
  CONSTRAINT fk_xent_payment FOREIGN KEY (payment_id) REFERENCES payments(id)
) ENGINE=InnoDB;
