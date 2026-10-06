package fr.ryujin.dysorga

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import java.util.Locale

/**
 * DysOrga pour Android — ouvre l'appli DysOrga (GitHub Pages) dans une fenêtre fermée :
 *  - seule l'adresse de DysOrga peut s'afficher : aucun lien ne mène ailleurs, pas de navigateur ;
 *  - l'appareil photo est autorisé uniquement pour DysOrga ;
 *  - la lecture à voix haute passe par la voix française d'Android
 *    (la fenêtre intégrée d'Android ne sait pas lire à voix haute toute seule).
 */
class MainActivity : Activity() {

    companion object {
        const val APP_URL = "https://mag-perso.github.io/dysorga/"
        const val APP_ORIGIN = "https://mag-perso.github.io"
        private const val REQ_CAMERA = 1
        private const val REQ_FILE = 2

        // Remplace la lecture à voix haute du navigateur par celle d'Android
        private val TTS_POLYFILL = """
            (function(){
              function U(text){this.text=text||"";this.lang="fr-FR";this.rate=1;this.pitch=1;this.volume=1;this.voice=null;
                this.onend=null;this.onstart=null;this.onerror=null;}
              var voix={name:"Français",lang:"fr-FR",localService:true,"default":true,voiceURI:"android-fr"};
              var s={speaking:false,pending:false,paused:false,onvoiceschanged:null,
                speak:function(u){try{window.DysTTS.speak(String((u&&u.text)||""),Number(u&&u.rate)||1);}catch(e){}},
                cancel:function(){try{window.DysTTS.cancel();}catch(e){}},
                pause:function(){},resume:function(){},
                getVoices:function(){return [voix];},
                addEventListener:function(){},removeEventListener:function(){}};
              try{Object.defineProperty(window,"speechSynthesis",{value:s,configurable:true,writable:true});}catch(e){window.speechSynthesis=s;}
              try{Object.defineProperty(window,"SpeechSynthesisUtterance",{value:U,configurable:true,writable:true});}catch(e){window.SpeechSynthesisUtterance=U;}
            })();
        """.trimIndent()

        private val OFFLINE_PAGE = """
            <html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
            <body style="font-family:sans-serif;background:#EEF3F7;color:#1F2937;text-align:center;padding:40px 20px">
            <h2>Pas de connexion</h2><p>DysOrga va réessayer toute seule dans quelques secondes.</p>
            <script>setTimeout(function(){location.replace("$APP_URL")},5000);</script>
            </body></html>
        """.trimIndent()
    }

    private lateinit var web: WebView
    private lateinit var tts: TextToSpeech
    private var ttsPret = false
    private var startScriptOk = false
    private var permissionEnAttente: PermissionRequest? = null
    private var fichierCallback: ValueCallback<Array<Uri>>? = null

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        tts = TextToSpeech(this) { statut ->
            if (statut == TextToSpeech.SUCCESS) {
                tts.language = Locale.FRANCE
                ttsPret = true
            }
        }

        web = WebView(this)
        setContentView(web)

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            setSupportMultipleWindows(false)        // pas de nouvelles fenêtres (window.open)
            javaScriptCanOpenWindowsAutomatically = false
            allowFileAccess = false
            allowContentAccess = false
        }

        web.addJavascriptInterface(PontVoix(), "DysTTS")
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(web, TTS_POLYFILL, setOf(APP_ORIGIN))
            startScriptOk = true
        }

        web.webViewClient = object : WebViewClient() {
            // true = bloqué : seule l'adresse de DysOrga peut s'ouvrir
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                !request.url.toString().startsWith(APP_URL)

            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                if (!startScriptOk) view.evaluateJavascript(TTS_POLYFILL, null)
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) {
                    view.loadDataWithBaseURL(APP_URL, OFFLINE_PAGE, "text/html", "utf-8", null)
                }
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    val camera = request.resources.filter { it == PermissionRequest.RESOURCE_VIDEO_CAPTURE }
                    if (!request.origin.toString().startsWith(APP_ORIGIN) || camera.isEmpty()) {
                        request.deny()
                    } else if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(camera.toTypedArray())
                    } else {
                        permissionEnAttente = request
                        requestPermissions(arrayOf(Manifest.permission.CAMERA), REQ_CAMERA)
                    }
                }
            }

            // Choix d'une image (fond d'écran du thème)
            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                fichierCallback?.onReceiveValue(null)
                val intent = Intent(Intent.ACTION_GET_CONTENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("image/*")
                return try {
                    fichierCallback = callback
                    startActivityForResult(intent, REQ_FILE)
                    true
                } catch (e: Exception) {
                    fichierCallback = null
                    false
                }
            }
        }

        if (savedInstanceState == null) web.loadUrl(APP_URL) else web.restoreState(savedInstanceState)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        if (requestCode == REQ_CAMERA) {
            val req = permissionEnAttente ?: return
            permissionEnAttente = null
            if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
                req.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
            } else {
                req.deny()
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == REQ_FILE) {
            val uri = data?.data
            fichierCallback?.onReceiveValue(if (resultCode == RESULT_OK && uri != null) arrayOf(uri) else null)
            fichierCallback = null
        } else {
            @Suppress("DEPRECATION")
            super.onActivityResult(requestCode, resultCode, data)
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onDestroy() {
        tts.shutdown()
        web.destroy()
        super.onDestroy()
    }

    /** Appelé depuis la page : lecture à voix haute avec la voix française d'Android */
    inner class PontVoix {
        @JavascriptInterface
        fun speak(texte: String, vitesse: Float) {
            if (!ttsPret) return
            tts.setSpeechRate(vitesse)
            tts.speak(texte, TextToSpeech.QUEUE_FLUSH, null, "dysorga")
        }

        @JavascriptInterface
        fun cancel() {
            if (ttsPret) tts.stop()
        }
    }
}
