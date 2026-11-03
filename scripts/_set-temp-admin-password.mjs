import fs from "node:fs";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";

const envPath = ".env";
const password = crypto.randomBytes(18).toString("base64url");
const hash = await bcrypt.hash(password, 12);
const encoded = Buffer.from(hash, "utf8").toString("base64");

let env = fs.readFileSync(envPath, "utf8");
if (/^ADMIN_PASSWORD_HASH=/m.test(env)) {
  env = env.replace(/^ADMIN_PASSWORD_HASH=.*$/m, `ADMIN_PASSWORD_HASH=${encoded}`);
} else {
  env += `\nADMIN_PASSWORD_HASH=${encoded}\n`;
}
fs.writeFileSync(envPath, env);
fs.writeFileSync(".tmp-admin-password.txt", password, "utf8");

console.log(
  JSON.stringify({
    written: true,
    encodedPrefix: encoded.slice(0, 10),
    hashPrefix: hash.slice(0, 7),
    passwordFile: ".tmp-admin-password.txt",
  })
);
