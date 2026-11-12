// Sonde temporaire : rejoue la liaison QR avec un faux compte pour voir où Pronote 2026.2 répond.
import * as pronote from "npm:pawnote@1.6.2";
import forge from "npm:node-forge@1.3.1";

const base = "https://0752957g.index-education.net/pronote";
const court = (s: string) => s.length > 700 ? s.slice(0, 700) + `…(${s.length}o)` : s;

function session() {
  return pronote.createSessionHandle((async (r: any) => {
    const init = { headers: r.headers ?? {}, method: r.method ?? "GET", body: r.content };
    let res = await fetch(r.url.href, { ...init, redirect: r.redirect ?? "follow" });
    let content = await res.text();
    if (/\/mobile\.\w+\.html$/.test(r.url.pathname)) {
      content = content.replace(/(Start\s*\([^)]*\))\s*;\s*\}\s*catch/g, "$1}catch");
      console.log(`GET ${r.url.pathname} -> ${res.status} ${content.length}o`);
    } else {
      console.log(`${init.method} ${r.url.pathname}\n  envoyé: ${court(String(r.content ?? ""))}\n  reçu ${res.status}: ${court(content)}`);
    }
    return { status: res.status, content, headers: res.headers };
  }) as any);
}

const chiffre = (txt: string, pin: string) => {
  const key = forge.md.md5.create().update(pin).digest();
  const c = forge.cipher.createCipher("AES-CBC", key);
  c.start({ iv: forge.util.createBuffer().fillWithByte(0, 16) });
  c.update(forge.util.createBuffer(txt));
  c.finish();
  return c.output.toHex();
};

console.log("=== QR avec un faux compte");
try {
  await pronote.loginQrCode(session(), {
    deviceUUID: crypto.randomUUID(), pin: "1234",
    qr: { url: base + "/mobile.eleve.html", login: chiffre("faux.eleve", "1234"), jeton: chiffre("0123456789ABCDEF0123456789ABCDEF", "1234"), avecPageConnexion: false },
  });
} catch (e) { console.log("Résultat:", (e as Error).name, (e as Error).message); }
