package ar.scantec.taller20;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;
import androidx.browser.customtabs.CustomTabsIntent;

/**
 * Versión Android de prueba. Usa Chrome Custom Tabs para que el inicio de
 * sesión Google/Firebase se ejecute en el navegador, no en un WebView.
 * Los documentos y cuentas se manejan por los permisos de la web/Drive.
 */
public final class MainActivity extends Activity {
    private static final Uri SITE =
        Uri.parse("https://scantec77-diag.github.io/TALLER-2.0/");
    private boolean opened = false;
    private boolean leftForBrowser = false;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        openTaller();
    }

    private void openTaller() {
        try {
            CustomTabsIntent customTab = new CustomTabsIntent.Builder()
                .setShowTitle(true)
                .setColorScheme(CustomTabsIntent.COLOR_SCHEME_DARK)
                .build();
            customTab.intent.setPackage("com.android.chrome");
            customTab.launchUrl(this, SITE);
            opened = true;
        } catch (ActivityNotFoundException e) {
            try {
                Intent browser = new Intent(Intent.ACTION_VIEW, SITE);
                browser.addCategory(Intent.CATEGORY_BROWSABLE);
                startActivity(browser);
                opened = true;
            } catch (ActivityNotFoundException ignored) {
                Toast.makeText(this, "Instalá un navegador para abrir Taller 2.0.",
                    Toast.LENGTH_LONG).show();
                finish();
            }
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (opened) leftForBrowser = true;
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (leftForBrowser) finish();
    }
}
