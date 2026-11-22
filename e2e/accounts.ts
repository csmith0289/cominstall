// Test-only accounts. Only the e2e server knows them (playwright.config.ts). Never real people.
export const E2E_ADMIN_EMAIL = "admin@e2e.cominstall.test";
// One Admin per phone-sized project, since every project shares the one e2e server and database.
export const phoneAdminEmail = (project: string) => `admin-${project}@e2e.cominstall.test`;
export const E2E_PHONE_ADMIN_EMAILS = ["iphone", "android"].map(phoneAdminEmail);
// The Admin who sends Invitations in the invitations specs, one per project.
export const invitingAdminEmail = (project: string) => `inviting-admin-${project}@e2e.cominstall.test`;
export const E2E_INVITING_ADMIN_EMAILS = ["desktop", "iphone", "android"].map(invitingAdminEmail);
export const E2E_OPERATOR_EMAIL = "operator@e2e.cominstall.test";
export const E2E_PASSWORD = "e2e-password-not-real-123";
