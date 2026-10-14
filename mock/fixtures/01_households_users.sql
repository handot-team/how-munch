-- 가구 1개, 가구원 3명(엄마·아빠·나). 로그인은 me@howmunch.test(나)로 한다.
-- mock/fixtures: 가짜 서버가 뜰 때 migration 뒤에 순서대로 넣는다. 날짜는 2026-10-14(수) 기준이다.

insert into public.households (id, name) values ('10000000-0000-4000-8000-000000000001', '우리집');

-- auth.users에 넣으면 실제 트리거가 profiles·notification_preferences 행을 만든다.
insert into auth.users (id, email, raw_user_meta_data, created_at) values
  ('00000000-0000-4000-8000-000000000001', 'me@howmunch.test', '{"name":"나"}', '2026-08-01 09:00:00+09'),
  ('00000000-0000-4000-8000-000000000002', 'mom@howmunch.test', '{"name":"엄마"}', '2026-08-01 09:00:00+09'),
  ('00000000-0000-4000-8000-000000000003', 'dad@howmunch.test', '{"name":"아빠"}', '2026-08-01 09:00:00+09');

update public.profiles set household_id = '10000000-0000-4000-8000-000000000001';

insert into public.household_members (household_id, user_id, role) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'owner'),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'member'),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'member');

-- 알림 권한 시트가 첫 화면을 가리지 않게 이미 물어본 것으로 둔다.
update public.notification_preferences set is_permission_asked = true;

-- 다 쓴 재료(지난달 버린 재료 등)는 냉장고 목록에서 숨긴다.
insert into public.fridge_preferences (user_id, hide_depleted_fridge_items) values
  ('00000000-0000-4000-8000-000000000001', true), ('00000000-0000-4000-8000-000000000002', true), ('00000000-0000-4000-8000-000000000003', true);
