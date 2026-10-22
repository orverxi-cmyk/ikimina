# Strict Rule: Preservation of Existing Functionality

Under NO circumstances should any existing functionality, feature, workflow, data model, or established behavior be altered, omitted, or deleted unless explicitly requested by the user.

1. **Zero Regression Policy**:
   - Never replace, remove, or break existing working workflows.
   - When introducing enhancements, dual-control tiers, or batch mechanisms, all underlying core features (such as direct profile creation in `users` with `status: 'pending'`, email confirmation, password creation, and multi-tier visibility) must remain fully intact and operational.

2. **Database & Workflow Integrity**:
   - Every member created (individually or via bulk enrollment) must immediately have an authentic document record in the `users` collection with `status: 'pending'` and `passwordSet: false` so that member credential configuration and email existence checks succeed.
   - Pending records must always be visible across Senior Accountant, Reviewer, and Administrator queues.

3. **Additive and Compatible Changes Only**:
   - Any modifications must be backward-compatible with existing collections, schemas, and user flows.
   - Do not deprecate or strip existing UI controls, filters, or backend callable endpoints.
