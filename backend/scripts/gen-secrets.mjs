import { createHash, randomBytes } from "crypto";

const session = randomBytes(32).toString("hex");
const jwt = randomBytes(32).toString("hex");
const enc = randomBytes(32).toString("hex");
console.log(JSON.stringify({ session, jwt, enc }));
