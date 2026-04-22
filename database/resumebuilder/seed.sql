BEGIN;

INSERT INTO users (id, full_name, email, password_hash, provider, is_premium, created_at, updated_at)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Admin User', 'admin@solmates.com', '$2b$12$adminhashedpasswordplaceholder', 'local', TRUE, NOW(), NOW()),
  ('22222222-2222-2222-2222-222222222222', 'Jordan Rivera', 'jordan.rivera@email.com', '$2b$12$userhashedpasswordplaceholder', 'local', FALSE, NOW(), NOW());

INSERT INTO templates (id, name, category, is_ats_friendly, is_active)
VALUES
  ('33333333-3333-3333-3333-333333333333', 'ATS Optimized', 'ATS', TRUE, TRUE),
  ('44444444-4444-4444-4444-444444444444', 'Modern Edge', 'Modern', TRUE, TRUE),
  ('55555555-4444-4444-4444-444444444444', 'Classic Pro', 'Classic', TRUE, TRUE),
  ('66666666-4444-4444-4444-444444444444', 'Minimal Grid', 'Minimal', TRUE, TRUE),
  ('77777777-4444-4444-4444-444444444444', 'Creative Wave', 'Creative', FALSE, TRUE),
  ('88888888-4444-4444-4444-444444444444', 'Executive Slate', 'Executive', TRUE, TRUE),
  ('99999999-4444-4444-4444-444444444444', 'Tech Focus', 'Tech', TRUE, TRUE),
  ('aaaaaaa1-4444-4444-4444-444444444444', 'Academic CV', 'Academic', TRUE, TRUE),
  ('bbbbbbb2-4444-4444-4444-444444444444', 'Compact One-Page', 'Compact', TRUE, TRUE),
  ('ccccccc3-4444-4444-4444-444444444444', 'Impact Metrics', 'Impact', TRUE, TRUE),
  ('ddddddd4-4444-4444-4444-444444444444', 'Chronological', 'Chronological', TRUE, TRUE);

INSERT INTO resumes (id, user_id, title, selected_template, resume_score, is_active, created_at, updated_at)
VALUES
  ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 'Product Designer Resume', 'ats', 86, TRUE, NOW(), NOW());

INSERT INTO personal_info (id, resume_id, phone, address, linkedin_url, portfolio_url, photo_url)
VALUES
  ('66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555', '+1-555-123-4567', 'San Francisco, CA', 'https://linkedin.com/in/jordanrivera', 'https://jordanrivera.com', NULL);

INSERT INTO summary (id, resume_id, content)
VALUES
  ('77777777-7777-7777-7777-777777777777', '55555555-5555-5555-5555-555555555555', 'Product designer with 6+ years delivering user-centric experiences. Expert in design systems, research, and cross-functional collaboration.');

INSERT INTO experience (id, resume_id, job_title, company, start_date, end_date, description, order_index)
VALUES
  ('88888888-8888-8888-8888-888888888888', '55555555-5555-5555-5555-555555555555', 'Senior Product Designer', 'Aurora Labs', '2021-03-01', NULL, 'Led onboarding redesign increasing activation by 18%. Built design system across 4 product lines.', 1);

INSERT INTO education (id, resume_id, degree, institution, start_year, end_year, description, order_index)
VALUES
  ('99999999-9999-9999-9999-999999999999', '55555555-5555-5555-5555-555555555555', 'B.S. Human-Computer Interaction', 'University of Washington', 2017, 2021, 'Focus on UX research, interaction design, and prototyping.', 1);

INSERT INTO skills (id, resume_id, skill_name)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', 'Figma'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '55555555-5555-5555-5555-555555555555', 'UX Research'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '55555555-5555-5555-5555-555555555555', 'Design Systems');

INSERT INTO certifications (id, resume_id, name, issuer, issue_date)
VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '55555555-5555-5555-5555-555555555555', 'Google UX Design Certificate', 'Google', '2023-06-01');

INSERT INTO languages (id, resume_id, language, proficiency)
VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '55555555-5555-5555-5555-555555555555', 'English', 'Native'),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', '55555555-5555-5555-5555-555555555555', 'Spanish', 'Professional');

COMMIT;
