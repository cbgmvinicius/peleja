# Peleja 26 - connected interface

The new interface is served from next/ with root forwarding login and recovery callbacks to next/access/. All authentication and personal data remain in the existing project. No production user data is seeded by the build. The access redirect targets the existing root URL for email confirmation and recovery.

Rollback: deploy commit 8e05b92da0db98c52fa81468e3e2593e0d1c2b09 using its Publicar Peleja workflow, or revert this release and redeploy. Do not revert user data or remove the new additive RPCs. Existing workspace format and legacy endpoints are retained. Old interface scoring excludes annulled questions; the new scoring counts them as correct.

The old service-worker shell is retired on activation; only caches named peleja-* are cleared, not local storage or account history. Already open old pages may require reload after worker update. The new interface uses its own auth storage key, so an existing user may need to log in once.

Current limitation: read/write requires connectivity; failed writes restore the prior display and retain supported drafts in memory. Preferences use preferences.pelejaNext. Side navigation and tutorial remain disabled. English is limited to administrators as in the prior interface.
