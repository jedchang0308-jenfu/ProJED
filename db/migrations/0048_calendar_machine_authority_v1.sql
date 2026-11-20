-- A feed proves possession of one imported or newly issued bearer token. It
-- can read only that subscription owner's immutable Google proof, and never
-- obtains a human Session or an identity enumeration capability.
CREATE POLICY google_identity_calendar_owner_read_v1 ON projed_core.google_identity_proofs
FOR SELECT TO projed_runtime_disposable USING (
  local_user_id=projed_core.current_actor_user_id_v1()
  AND projed_core.actor_context_valid_v1()
  AND EXISTS(SELECT 1 FROM projed_core.calendar_subscriptions subscription
    WHERE subscription.owner_user_id=local_user_id
      AND subscription.token_hash=current_setting('projed.calendar_feed_token_hash',true)
      AND subscription.id::text=current_setting('projed.calendar_feed_subscription_id',true)
      AND subscription.is_active AND (subscription.expires_at IS NULL OR subscription.expires_at>clock_timestamp()))
);
