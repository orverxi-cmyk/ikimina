# System Directives & Rules for Ikimina

## Core Constraint: Never Modify or Omit Existing Functionality
Under NO circumstances should any existing functionality, feature, workflow, data model, or established behavior be altered, omitted, or deleted unless explicitly and unambiguously requested by the user.

- **Zero Regression Principle**: Established working user flows, UI components, API endpoints, and database schemas must remain fully functional.
- **Member Registration & Bulk Enrollment**:
  - Bulk-created members must immediately have individual records in the `users` collection with `status: 'pending'` and `passwordSet: false`.
  - Staged members must be recognizable immediately when they input their email in the system to set their initial password ("confirming their existence").
  - Senior Accountant, Reviewer, and Admin must have full real-time recording and visibility of pending members across dashboards and approval queues.
- **Workflow Protocol**:
  - Step 1: Scope Declaration (restate task in 1 sentence, exact files, exact lines, confirm no other files/logic modified).
  - Step 2: WAIT for explicit `APPROVED` before generating code.
  - Step 3: Minimal patch with ONLY modified code in `BEFORE` / `AFTER` blocks.
