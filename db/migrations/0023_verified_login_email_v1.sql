-- Keep the local profile email synchronized only from the verified Google
-- proof already attached to this unchanged local UUID and active login claim.
CREATE FUNCTION projed_core.profile_verified_email_update_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  -- An UPDATE OF email may be a no-op. Do not require a registration claim
  -- unless the stored email value actually changes.
  IF NEW.email IS NOT DISTINCT FROM OLD.email THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR current_setting('projed.registration_user_id', true) IS NULL
     OR NEW.id::text IS DISTINCT FROM current_setting('projed.registration_user_id', true)
     OR current_setting('projed.registration_email', true) IS NULL
     OR NEW.email IS DISTINCT FROM current_setting('projed.registration_email', true)
     OR current_setting('projed.verified_google_subject', true) IS NULL
     OR NOT projed_core.registration_scope_valid_v1()
     OR NOT EXISTS (
       SELECT 1
         FROM projed_core.google_identity_proofs proof
        WHERE proof.google_subject = current_setting('projed.verified_google_subject', true)
          AND proof.local_user_id = OLD.id
     ) THEN
    RAISE EXCEPTION 'Verified profile email update scope is invalid' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION projed_core.profile_verified_email_update_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION projed_core.profile_verified_email_update_v1() TO projed_runtime_disposable;

CREATE TRIGGER profile_verified_email_update_v1
  BEFORE UPDATE OF email ON projed_core.profiles
  FOR EACH ROW EXECUTE FUNCTION projed_core.profile_verified_email_update_v1();

GRANT UPDATE (email) ON projed_core.profiles TO projed_runtime_disposable;
