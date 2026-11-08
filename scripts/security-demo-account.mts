// Security demo, step (e): registers one synthetic account through the real onboarding code
// (registerAccount) so the DB shows genuine scrypt hashes and a hashed recovery code.
// JOIN_CODE defaults to DEMO-LOG (the demo DB); the legacy seed used DAMM-LOG.
// Always point DB_PATH at a scratch copy, never at data/app.db:
//   cd packages/db && DB_PATH=/tmp/demo.db pnpm exec tsx ../../scripts/security-demo-account.mts
import { registerAccount } from "../packages/db/src/employee-repository";

if (!process.env.DB_PATH) throw new Error("Set DB_PATH to a scratch copy of the database.");
const r = await registerAccount({ codi: process.env.JOIN_CODE ?? "DEMO-LOG", username: "demo_jutge", password: "contrasenya-de-prova-1" });
if (!r.ok) throw new Error(`register failed: ${r.error}`);
console.log(`Account created. Recovery code shown ONCE to the user: ${r.recoveryCode}`);
