BEGIN;

REVOKE ALL ON TABLE private.projed_dev139_google_identities_v1
  FROM projed_dev139_source_reader;
REVOKE ALL ON TABLE private.projed_dev139_auth_users_v1
  FROM projed_dev139_source_reader;

DROP VIEW private.projed_dev139_auth_users_v1 RESTRICT;
DROP VIEW private.projed_dev139_google_identities_v1 RESTRICT;

COMMIT;
