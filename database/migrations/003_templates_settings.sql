-- =====================================================================
-- Mushafs - workflow templates, note types and default settings
-- =====================================================================

-- PRJ-02: mushaf = 60 fixed sessions with hizb ranges.
-- Hadith / recitation: session count set per project (text-preparation steps are phase 2).
INSERT INTO templates (code, project_type, name_ar, name_en, fixed_session_count, uses_hizb_ranges, review_rounds) VALUES
  ('mushaf',     'mushaf',     'مصحف مرتل (60 حزبًا)', 'Recited mushaf (60 ahzab)', 60,  TRUE,  ARRAY['first','second','technical']::round_type[]),
  ('hadith',     'hadith',     'سلسلة أحاديث',         'Hadith series',             NULL, FALSE, ARRAY['first','second','technical']::round_type[]),
  ('recitation', 'recitation', 'تلاوات متفرقة',        'Scattered recitations',     NULL, FALSE, ARRAY['first','second','technical']::round_type[]);

-- Section 7: the current five note types (configurable by center management)
INSERT INTO note_types (code, name_ar, name_en, severity, is_clear_error, is_technical, sort_order) VALUES
  ('lahn_jali',   'لحن جلي',          'Clear error (lahn jali)',   5, TRUE,  FALSE, 1),
  ('tajweed',     'تجويد',            'Tajweed',                   3, FALSE, FALSE, 2),
  ('waqf_ibtida', 'وقف وابتداء',      'Stopping / starting',       3, FALSE, FALSE, 3),
  ('performance', 'أداء',             'Performance',               2, FALSE, FALSE, 4),
  ('technical',   'فني',              'Technical',                 2, FALSE, TRUE,  5);

-- Section 11.2 configurable settings (values from the recordings where given)
INSERT INTO settings (key, value) VALUES
  ('editing_hours',            '48'),        -- editing time: 2 days
  ('review_hours',             '48'),        -- time per review: 2 days
  ('decision_hours',           '24'),        -- mujiz ruling: "the next day"
  ('corrections_hours',        '48'),        -- corrections before the next session
  ('quality_rating_hours',     '48'),
  ('mixing_hours',             '336'),       -- whole mushaf mixing: 14 days
  ('orange_grace_hours',       '48'),        -- orange grace period before red: 2 more days
  ('pm_grace_hours',           '48'),        -- PM grace before the general supervisor is notified
  ('excuse_cutoff',            '{"mode": "hours", "hours": 20, "time": "22:00"}'),
  ('auto_pass_no_notes',       'false'),     -- false = one click, true = automatic (DEC-06)
  ('technical_notes_to_technician', 'true'), -- DEC-04
  ('day_counting',             '"calendar"'),-- calendar | working (open question 7)
  ('weekend_days',             '[5, 6]'),    -- Friday, Saturday (0 = Sunday)
  ('random_quality_after_session', '20');    -- MIX-02 auto-pick a random sample once N sessions are uploaded
