package ar.scantec.taller20;

import android.Manifest;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/** Maneja avisos en primer plano; Android muestra los de fondo automáticamente. */
public final class TallerMessagingService extends FirebaseMessagingService {
    @Override public void onNewToken(String token) {
        super.onNewToken(token);
        boolean authorized = Build.VERSION.SDK_INT < 33 ||
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        if (authorized && TallerApplication.configured(getApplication())) {
            FirebaseMessaging.getInstance().subscribeToTopic(TallerApplication.TOPIC)
                .addOnFailureListener(e -> Log.w("Taller20", "Error al renovar suscripción", e));
        }
    }

    @Override public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);
        if (!"common-message".equals(message.getData().get("type"))) return;
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        String name = message.getData().get("authorName");
        if (name == null || name.trim().isEmpty()) name = "Alguien";
        if (name.length() > 80) name = name.substring(0, 80);
        Intent intent = new Intent(this, MainActivity.class);
        intent.putExtra("open_common", true);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, TallerApplication.CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_email)
            .setContentTitle("Taller 2.0 · Espacio Común")
            .setContentText(name + " escribió un mensaje")
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT);
        NotificationManager mgr = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        mgr.notify((int) (System.currentTimeMillis() & 0x7fffffff), builder.build());
    }
}
