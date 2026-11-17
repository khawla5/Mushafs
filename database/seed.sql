-- =====================================================================
-- Mushafs - DEVELOPMENT seed data (demo users, one per role)
-- Do NOT run in production.
--
-- All demo accounts use the password:  Mushafs@2026
-- (bcrypt hash below). Change or delete these accounts before going live.
-- =====================================================================

INSERT INTO users (email, password_hash, full_name, roles, locale) VALUES
  ('admin@mushafs.local',      '$2a$10$icjfrhuAtHcxZzSZ7YHNg.o2B2edCOPJGy46UtXOZWAkBV6flkeSK', 'إدارة المركز',        '{admin}',              'ar'),
  ('supervisor@mushafs.local', '$2a$10$icjfrhuAtHcxZzSZ7YHNg.o2B2edCOPJGy46UtXOZWAkBV6flkeSK', 'المشرف العام',         '{supervisor}',         'ar'),
  ('manager@mushafs.local',    '$2a$10$icjfrhuAtHcxZzSZ7YHNg.o2B2edCOPJGy46UtXOZWAkBV6flkeSK', 'مدير الإنتاج',         '{production_manager}', 'ar'),
  ('mujiz@mushafs.local',      '$2a$10$icjfrhuAtHcxZzSZ7YHNg.o2B2edCOPJGy46UtXOZWAkBV6flkeSK', 'الشيخ المجيز',         '{mujiz}',              'ar'),
  ('tech@mushafs.local',       '$2a$10$icjfrhuAtHcxZzSZ7YHNg.o2B2edCOPJGy46UtXOZWAkBV6flkeSK', 'الفني',                '{technician}',         'ar'),
  ('reader@mushafs.local',     '$2a$10$icjfrhuAtHcxZzSZ7YHNg.o2B2edCOPJGy46UtXOZWAkBV6flkeSK', 'القارئ',               '{reader}',             'ar'),
  ('reviewer1@mushafs.local',  '$2a$10$icjfrhuAtHcxZzSZ7YHNg.o2B2edCOPJGy46UtXOZWAkBV6flkeSK', 'المراجع الأول',        '{reviewer}',           'ar'),
  ('reviewer2@mushafs.local',  '$2a$10$icjfrhuAtHcxZzSZ7YHNg.o2B2edCOPJGy46UtXOZWAkBV6flkeSK', 'المراجع الثاني',       '{reviewer}',           'ar'),
  ('reviewer3@mushafs.local',  '$2a$10$icjfrhuAtHcxZzSZ7YHNg.o2B2edCOPJGy46UtXOZWAkBV6flkeSK', 'المراجع النهائي',      '{reviewer}',           'ar'),
  ('mixing@mushafs.local',     '$2a$10$icjfrhuAtHcxZzSZ7YHNg.o2B2edCOPJGy46UtXOZWAkBV6flkeSK', 'مسؤول المكساج',        '{mixing_lead}',        'ar')
ON CONFLICT (email) DO NOTHING;
