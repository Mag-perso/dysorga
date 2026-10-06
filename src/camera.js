// Appareil photo intégré à l'appli : l'enfant ne passe jamais par la galerie du téléphone.
// Deux modes : "photo" (renvoie une image) et "qr" (lit le QR code de connexion Pronote).
import jsQR from "jsqr";

export function ouvrirCamera(mode = "photo", consigne = "") {
  return new Promise((resolve) => {
    const voile = document.createElement("div");
    voile.className = "camera";
    voile.innerHTML =
      `<p class="camera-consigne">${consigne}</p>` +
      `<video playsinline muted autoplay></video>` +
      `<p class="camera-erreur" hidden></p>` +
      `<div class="camera-boutons">` +
      (mode === "photo" ? `<button class="btn big" data-cam="prendre">Prendre la photo</button>` : "") +
      `<button class="btn big line" data-cam="annuler">Annuler</button></div>`;
    document.body.appendChild(voile);
    const video = voile.querySelector("video");
    let flux = null, fini = false, boucle = 0;

    function fermer(valeur) {
      if (fini) return;
      fini = true;
      cancelAnimationFrame(boucle);
      flux?.getTracks().forEach((t) => t.stop());
      voile.remove();
      resolve(valeur);
    }
    function erreur(texte) {
      const p = voile.querySelector(".camera-erreur");
      p.textContent = texte;
      p.hidden = false;
    }

    voile.addEventListener("click", (e) => {
      const b = e.target.closest("[data-cam]");
      if (!b) return;
      if (b.dataset.cam === "annuler") return fermer(null);
      const cv = document.createElement("canvas");
      cv.width = video.videoWidth; cv.height = video.videoHeight;
      cv.getContext("2d").drawImage(video, 0, 0);
      cv.toBlob((blob) => fermer(blob), "image/jpeg", 0.9);
    });

    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 } }, audio: false })
      .then((s) => {
        flux = s;
        video.srcObject = s;
        if (mode === "qr") lireQr();
      })
      .catch(() => erreur("L'appareil photo ne s'ouvre pas. Vérifie que DysOrga a le droit de l'utiliser dans les réglages du téléphone."));

    async function lireQr() {
      const detecteur = "BarcodeDetector" in window ? new window.BarcodeDetector({ formats: ["qr_code"] }) : null;
      const cv = document.createElement("canvas"), ctx = cv.getContext("2d", { willReadFrequently: true });
      const tour = async () => {
        if (fini) return;
        if (video.readyState >= 2) {
          let texte = null;
          if (detecteur) {
            const codes = await detecteur.detect(video).catch(() => []);
            texte = codes[0]?.rawValue ?? null;
          } else {
            cv.width = video.videoWidth; cv.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);
            texte = jsQR(ctx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height)?.data ?? null;
          }
          if (texte) return fermer(texte);
        }
        boucle = requestAnimationFrame(tour);
      };
      tour();
    }
  });
}
