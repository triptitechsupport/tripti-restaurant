package at.tripti.staff;

import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

// The browser's print() and file downloads do not work inside an Android
// WebView. The web screens call these two methods instead when they run in
// the app (see apps/web/src/lib/staffApp.js).
@CapacitorPlugin(name = "TriptiStaff")
public class StaffAppPlugin extends Plugin {
    // Keeps the print WebView alive until Android has taken the job.
    private WebView printView;

    @PluginMethod
    public void printHtml(PluginCall call) {
        final String html = call.getString("html");
        if (html == null) { call.reject("html is missing"); return; }
        final String baseUrl = call.getString("baseUrl", "https://www.triptistore.in/");
        final String title = call.getString("title", "Tripti");
        getActivity().runOnUiThread(() -> {
            WebView view = new WebView(getContext());
            view.getSettings().setJavaScriptEnabled(false); // the page arrives fully drawn
            printView = view;
            view.setWebViewClient(new WebViewClient() {
                private boolean started = false;
                @Override
                public void onPageFinished(WebView v, String url) {
                    if (started) return;
                    started = true;
                    // Give scripts and images a moment before printing.
                    new Handler(Looper.getMainLooper()).postDelayed(() -> {
                        try {
                            PrintManager manager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                            PrintDocumentAdapter adapter = v.createPrintDocumentAdapter(title);
                            manager.print(title, adapter, new PrintAttributes.Builder().build());
                            call.resolve();
                        } catch (Exception e) {
                            call.reject("Printing failed: " + e.getMessage());
                        }
                    }, 700);
                }
            });
            view.loadDataWithBaseURL(baseUrl, html, "text/html", "UTF-8", null);
        });
    }

    // Saves a file to Downloads. data is base64.
    @PluginMethod
    public void saveFile(PluginCall call) {
        String name = call.getString("name", "tripti-export.txt");
        String mime = call.getString("mime", "application/octet-stream");
        String data = call.getString("data");
        if (data == null) { call.reject("data is missing"); return; }
        byte[] bytes = Base64.decode(data, Base64.DEFAULT);
        try {
            String where;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, name);
                values.put(MediaStore.Downloads.MIME_TYPE, mime);
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Tripti");
                Uri uri = getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new Exception("could not create the file");
                try (OutputStream out = getContext().getContentResolver().openOutputStream(uri)) {
                    out.write(bytes);
                }
                where = "Downloads/Tripti/" + name;
            } else {
                // Android 7 to 9: save in the app's folder and open the share
                // sheet, so the file can be put in Downloads, Drive or email.
                File dir = new File(getContext().getCacheDir(), "exports");
                dir.mkdirs();
                File file = new File(dir, name);
                try (FileOutputStream out = new FileOutputStream(file)) {
                    out.write(bytes);
                }
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
                Intent share = new Intent(Intent.ACTION_SEND);
                share.setType(mime);
                share.putExtra(Intent.EXTRA_STREAM, uri);
                share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                getActivity().startActivity(Intent.createChooser(share, name));
                where = name;
            }
            final String shown = where;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) getActivity().runOnUiThread(() -> Toast.makeText(getContext(), "Saved: " + shown, Toast.LENGTH_LONG).show());
            JSObject result = new JSObject();
            result.put("path", where);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Saving failed: " + e.getMessage());
        }
    }
}
