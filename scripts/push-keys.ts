// Prints a new pair of keys for phone notifications, to copy into .env.
// Run once per server: changing the keys later makes every device turn
// notifications on again (done by itself the next time the site is opened).
import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();
console.log("Copiez ces deux lignes dans le fichier .env, puis redémarrez le site :\n");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
