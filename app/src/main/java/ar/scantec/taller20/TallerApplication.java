package ar.scantec.taller20;

import android.app.Application;
import android.util.Log;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;

/** Inicialización nativa de Firebase sin guardar claves privadas en la APK. */
public final class TallerApplication extends Application {
    static final String TOPIC = "taller20_espacio_comun";
    static final String CHANNEL = "espacio_comun";

    @Override public void onCreate() {
        super.onCreate();
        String appId = BuildConfig.FIREBASE_ANDROID_APP_ID;
        if (appId == null || !appId.matches("^1:[0-9]+:android:[a-fA-F0-9]+$")) {
            Log.i("Taller20", "Push pendiente: registrar la app Android en Firebase y configurar la variable de compilación.");
            return;
        }
        if (!FirebaseApp.getApps(this).isEmpty()) return;
        FirebaseOptions options = new FirebaseOptions.Builder()
            .setApplicationId(appId)
            .setApiKey("AIzaSyCHFS8iMwgTdK_JGsxSTodblP6OJFahWbA")
            .setProjectId("taller-2-0")
            .setGcmSenderId("84943475166")
            .build();
        FirebaseApp.initializeApp(this, options);
    }

    static boolean configured(Application app) {
        return !FirebaseApp.getApps(app).isEmpty();
    }
}
