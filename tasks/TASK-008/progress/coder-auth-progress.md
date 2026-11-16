# coder-auth progress (TASK-008)

## Item 1 (Q9) passwords
- `POST /api/v1/me/password` (2.2.10) and optional `password` in `PATCH /admin/users/{id}` (2.2.4). Wrong current password gives the existing 403 `INVALID_PASSWORD`. Audit events `user.password_changed` / `user.password_reset`.
- Sessions: there was no user-to-sessions index, so `TokenStore.sessionsOf(userId)` was added (in-memory scan; Redis set `oauth:user-sessions:{userId}`) and `TokenService.revokeAll(userId)` closes every session. Both password paths close all sessions. UsersModule and OAuthModule now import each other with `forwardRef`; the controllers call `revokeAll` after the service call.
- Traefik: `/api/v1/me/password` added to the auth-api router in `infra/traefik/dynamic.yml` (edge-routing spec requires it).
- Frontend: `ChangePasswordDialog` + `ChangePasswordSection` on the patient home, a "Change password" item in the doctor/admin profile menu, a "New password" field in the admin edit-user form. ru/en messages `passwordChange.*`, `admin.users.fields.newPassword`.
- Bruno 2.2.10, stack-smoke access matrix route added.
- docs/pz outdated: the API/user-management description (no password change/reset), the role-by-role feature list.
