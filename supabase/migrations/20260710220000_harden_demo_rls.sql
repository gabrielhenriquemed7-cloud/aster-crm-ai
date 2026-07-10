-- Clinics are created only through create_clinic_with_owner, which derives the owner from auth.uid().
drop policy if exists "Create clinic" on public.clinics;

-- Direct membership creation is restricted to active clinic administrators.
-- The first owner membership is inserted only by the SECURITY DEFINER onboarding function.
revoke all on function public.create_clinic_for_current_user(text) from public;
revoke all on function public.create_clinic_for_current_user(text) from authenticated;
