import bcrypt from "bcryptjs";

const password = process.argv.slice(2).join(" ");

if (!password) {
  console.error("Mot de passe manquant.");
  console.error('Exemple : npm run auth:hash-password -- "votre-mot-de-passe"');
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
console.log(Buffer.from(hash, "utf8").toString("base64"));
