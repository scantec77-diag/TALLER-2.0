package ar.scantec.taller20;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.widget.Toast;
import androidx.browser.customtabs.CustomTabsIntent;
import com.google.firebase.messaging.FirebaseMessaging;

/** Abre Taller en Chrome para mantener el inicio de sesión Google fuera de WebView. */
public final class MainActivity extends Activity {
    private static final String SITE = "https://scantec77-diag.github.io/TALLER-2.0/";
    private static final int NOTIFICATION_REQUEST = 726;
    private boolean opened = false;
    private boolean leftForBrowser = false;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        createNotificationChannel();
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_REQUEST);
        } else {
            subscribeAndOpen();
        }
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == NOTIFICATION_REQUEST) subscribeAndOpen();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel channel = new NotificationChannel(
            TallerApplication.CHANNEL, "Espacio Común", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("Avisos cuando alguien publica en Espacio Común");
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }

    private void subscribeAndOpen() {
        boolean authorized = Build.VERSION.SDK_INT < 33 ||
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        if (authorized && TallerApplication.configured(getApplication())) {
            FirebaseMessaging.getInstance().subscribeToTopic(TallerApplication.TOPIC)
                .addOnFailureListener(error -> Log.w("Taller20", "No se pudo activar push", error));
        }
        openTaller();
    }

    private void openTaller() {
        Uri url = Uri.parse(SITE + (getIntent() != null && getIntent().getBooleanExtra("open_common", false)
            ? "#espacio-comun" : ""));
        try {
            CustomTabsIntent customTab = new CustomTabsIntent.Builder()
                .setShowTitle(true)
                .setColorScheme(CustomTabsIntent.COLOR_SCHEME_DARK)
                .build();
            customTab.intent.setPackage("com.android.chrome");
            customTab.launchUrl(this, url);
            opened = true;
        } catch (ActivityNotFoundException e) {
            try {
                Intent browser = new Intent(Intent.ACTION_VIEW, url);
                browser.addCategory(Intent.CATEGORY_BROWSABLE);
                startActivity(browser);
                opened = true;
            } catch (ActivityNotFoundException ignored) {
                Toast.makeText(this, "Instalá un navegador para abrir Taller 2.0.", Toast.LENGTH_LONG).show();
                finish();
            }
        }
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent != null && intent.getBooleanExtra("open_common", false)) openTaller();
    }

    @Override protected void onPause() {
        super.onPause();
        if (opened) leftForBrowser = true;
    }

    @Override protected void onResume() {
        super.onResume();
        if (leftForBrowser) finish();
    }
}
